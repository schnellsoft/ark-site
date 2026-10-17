#!/usr/bin/env node
/**
 * Pull icons.json from ark-admin-content and build Astro assets sprite.
 * Tries icons/icons.json first, then published/latest/icons.json.
 * If neither exists remotely, keeps/writes an empty catalog so sync:all can continue.
 * Usage: node scripts/sync-icons-content.mjs
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchR2Object } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/icons');
const assetsDir = join(root, 'src/assets/icons');
const jsonDest = join(dataDir, 'icons.json');
const spriteDest = join(assetsDir, 'sprite.svg');

const CANDIDATE_KEYS = ['icons/icons.json', 'published/latest/icons.json'];

/** Lowercase; non-alphanumeric runs become a single hyphen. */
function spriteSymbolId(name) {
	const raw = String(name ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return raw;
}

function extractInnerSvg(svg) {
	const trimmed = String(svg ?? '').trim();
	if (!trimmed) return { inner: '', viewBox: '0 0 24 24' };
	const open = /<svg\b([^>]*)>/i.exec(trimmed);
	if (!open) {
		return { inner: ensureCurrentColorFill(trimmed), viewBox: '0 0 24 24' };
	}
	const attrs = open[1] ?? '';
	const vb = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(attrs);
	const viewBox = vb?.[1] || '0 0 24 24';
	let inner = trimmed
		.replace(/^[\s\S]*?<svg\b[^>]*>/i, '')
		.replace(/<\/svg>\s*$/i, '')
		.trim();

	/* Promote root svg stroke/fill onto a wrapper so stroke-only icons keep paint. */
	const rootStroke = /\bstroke\s*=\s*(["'])([^"']+)\1/i.exec(attrs)?.[2];
	const rootFill = /\bfill\s*=\s*(["'])([^"']+)\1/i.exec(attrs)?.[2];
	const rootSw = /\bstroke-width\s*=\s*(["']?)([^"'\s>]+)\1/i.exec(attrs)?.[2];
	if (rootStroke || rootFill || rootSw) {
		const wrapAttrs = [
			rootFill ? `fill="${rootFill}"` : '',
			rootStroke ? `stroke="${rootStroke}"` : '',
			rootSw ? `stroke-width="${rootSw}"` : '',
		]
			.filter(Boolean)
			.join(' ');
		inner = `<g ${wrapAttrs}>\n${inner}\n</g>`;
	}

	return { inner: ensureCurrentColorFill(inner), viewBox };
}

function isWhiteFill(fillVal) {
	const v = String(fillVal ?? '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '');
	return (
		v === 'white' ||
		v === '#fff' ||
		v === '#ffffff' ||
		v === 'rgb(255,255,255)' ||
		v === 'rgba(255,255,255,1)'
	);
}

/**
 * External <use href="sprite.svg#id"> needs paint that follows CSS color.
 * Branded icons often use white “cutouts” over colored/gradient plates — those
 * whites become --sprite-cutout so the glyph stays legible on dark chrome.
 * All-white icons simply use currentColor.
 */
function ensureCurrentColorFill(inner) {
	const source = String(inner);
	let seenPlate = false;

	return source.replace(
		/<(path|circle|rect|polygon|ellipse|polyline)\b([^>]*?)(\/?)>/gi,
		(_full, tag, attrs, selfClose) => {
			const raw = String(attrs);
			const fillMatch = /\bfill\s*=\s*(["'])([^"']*)\1/i.exec(raw);
			const fillVal = (fillMatch?.[2] ?? '').trim().toLowerCase();
			const hasStroke = /\bstroke\s*=/i.test(raw);
			const close = selfClose ? ' /' : '';
			const white = isWhiteFill(fillVal);
			const plate = Boolean(fillVal) && fillVal !== 'none' && !white;

			let next = raw
				.replace(/\bfill\s*=\s*(["'])[^"']*\1/gi, '')
				.replace(/\bstroke\s*=\s*(["'])(?!none\b)[^"']*\1/gi, ' stroke="currentColor"');

			if (fillVal === 'none') {
				return `<${tag}${next} fill="none"${close}>`;
			}
			/* No explicit fill — inherit from <g> (stroke-only icons). */
			if (!fillMatch) {
				if (hasStroke) {
					return `<${tag}${next} stroke="currentColor"${close}>`.replace(
						/ stroke="currentColor" stroke="currentColor"/,
						' stroke="currentColor"',
					);
				}
				return `<${tag}${next}${close}>`;
			}
			/* White detail after a colored/gradient plate → knock-out (instagram, facebook). */
			if (white && seenPlate) {
				return `<${tag}${next} fill="var(--sprite-cutout, #121516)"${close}>`;
			}
			if (plate) seenPlate = true;
			return `<${tag}${next} fill="currentColor"${close}>`;
		},
	);
}

await mkdir(dataDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });

let fetched = false;
for (const key of CANDIDATE_KEYS) {
	console.log(`↓ try content ${key}`);
	const source = await fetchR2Object(root, 'ark-admin-content', key, jsonDest);
	if (source) {
		console.log(`✓ got ${key} (${source})`);
		fetched = true;
		break;
	}
	console.warn(`  (missing remote + local) ${key}`);
}

async function ensureValidIconsJson() {
	const empty = JSON.stringify({ icons: [] }, null, 2) + '\n';
	try {
		const text = await readFile(jsonDest, 'utf8');
		if (!text.trim()) throw new Error('empty file');
		const parsed = JSON.parse(text);
		if (!parsed || typeof parsed !== 'object') throw new Error('invalid shape');
		return;
	} catch {
		await writeFile(jsonDest, empty, 'utf8');
		console.warn(
			'Wrote empty icons.json — Save Site/Icons in admin (or Save to cloud) to publish icons/icons.json.',
		);
	}
}

if (!fetched) {
	try {
		await access(jsonDest);
		console.warn('Remote icons keys missing; validating local icons.json…');
	} catch {
		/* will create below */
	}
	await ensureValidIconsJson();
} else {
	await ensureValidIconsJson();
}

const payload = JSON.parse(await readFile(jsonDest, 'utf8'));
const icons = Array.isArray(payload.icons) ? payload.icons : [];

const usedIds = new Set();
const symbols = [];

for (const icon of icons) {
	let id = spriteSymbolId(icon?.name);
	if (!id) continue;
	if (usedIds.has(id)) {
		let n = 2;
		while (usedIds.has(`${id}-${n}`)) n += 1;
		id = `${id}-${n}`;
	}
	usedIds.add(id);
	const { inner, viewBox } = extractInnerSvg(icon?.svg);
	if (!inner) continue;
	symbols.push(
		`  <symbol id="${id}" viewBox="${viewBox}">\n    ${inner}\n  </symbol>`,
	);
}

/**
 * Merge CMS symbols with chrome UI glyphs (hamburger, morev, chevrons).
 * Written without display:none so same-document <use href="#id"> works when inlined.
 */
const headerSpriteDest = join(root, 'public/header/sprite.svg');
const publicIconsDest = join(root, 'public/icons/sprite.svg');
let chromeSymbols = [];
try {
	const existing = await readFile(headerSpriteDest, 'utf8');
	chromeSymbols = [...existing.matchAll(/<symbol\b[^>]*>[\s\S]*?<\/symbol>/gi)]
		.map((m) => m[0])
		.filter((sym) => {
			const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(sym)?.[1] ?? '';
			return id && !usedIds.has(id);
		});
} catch {
	/* first run — chrome file may be rebuilt from prior merge */
}

const merged = [
	'<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
	...chromeSymbols,
	...symbols,
	'</svg>',
	'',
].join('\n');

await writeFile(spriteDest, merged, 'utf8');
await mkdir(dirname(headerSpriteDest), { recursive: true });
await mkdir(dirname(publicIconsDest), { recursive: true });
await writeFile(headerSpriteDest, merged, 'utf8');
await writeFile(publicIconsDest, merged, 'utf8');
console.log(
	`Icons sync complete: ${symbols.length} CMS + ${chromeSymbols.length} chrome → ${spriteDest}`,
);
