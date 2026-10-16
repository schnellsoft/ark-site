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
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/icons');
const assetsDir = join(root, 'src/assets/icons');
const jsonDest = join(dataDir, 'icons.json');
const spriteDest = join(assetsDir, 'sprite.svg');

const CANDIDATE_KEYS = ['icons/icons.json', 'published/latest/icons.json'];

function wranglerGet(bucket, key, file) {
	const result = spawnSync(
		'npx',
		['wrangler', 'r2', 'object', 'get', `${bucket}/${key}`, '--remote', `--file=${file}`],
		{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] },
	);
	return result.status === 0;
}

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
		return { inner: trimmed, viewBox: '0 0 24 24' };
	}
	const attrs = open[1] ?? '';
	const vb = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(attrs);
	const viewBox = vb?.[1] || '0 0 24 24';
	const inner = trimmed
		.replace(/^[\s\S]*?<svg\b[^>]*>/i, '')
		.replace(/<\/svg>\s*$/i, '')
		.trim();
	return { inner, viewBox };
}

await mkdir(dataDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });

let fetched = false;
for (const key of CANDIDATE_KEYS) {
	console.log(`↓ try content ${key}`);
	if (wranglerGet('ark-admin-content', key, jsonDest)) {
		console.log(`✓ got ${key}`);
		fetched = true;
		break;
	}
	console.warn(`  (missing) ${key}`);
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
		`  <symbol id="${id}" viewBox="${viewBox}" fill="none">\n    ${inner}\n  </symbol>`,
	);
}

const sprite = [
	'<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display: none;">',
	...symbols,
	'</svg>',
	'',
].join('\n');

await writeFile(spriteDest, sprite, 'utf8');
console.log(`Icons sync complete: ${symbols.length} symbols → ${spriteDest}`);
