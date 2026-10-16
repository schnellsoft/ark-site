#!/usr/bin/env node
/**
 * Pull published/latest/icons.json and build Astro assets sprite.
 * Usage: node scripts/sync-icons-content.mjs
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/icons');
const assetsDir = join(root, 'src/assets/icons');
const jsonDest = join(dataDir, 'icons.json');
const spriteDest = join(assetsDir, 'sprite.svg');

function wranglerGet(bucket, key, file) {
	const result = spawnSync(
		'npx',
		['wrangler', 'r2', 'object', 'get', `${bucket}/${key}`, '--remote', `--file=${file}`],
		{ cwd: root, encoding: 'utf8', stdio: 'inherit' },
	);
	if (result.status !== 0) {
		throw new Error(`Failed to get ${bucket}/${key}`);
	}
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

console.log('↓ content published/latest/icons.json');
wranglerGet('ark-admin-content', 'published/latest/icons.json', jsonDest);

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
