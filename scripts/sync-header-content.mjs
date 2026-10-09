#!/usr/bin/env node
/**
 * Pull header JSON from ark-admin-content and referenced images from ark-admin-media.
 * Usage: node scripts/sync-header-content.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src/data/header');
const mediaDir = join(root, 'src/assets/media');

const CONTENT_KEYS = [
	['header/logo/header_logo.json', 'header_logo.json'],
	['header/menu/header_menu.json', 'header_menu.json'],
	['header/icons/header_icons.json', 'header_icons.json'],
];

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

await mkdir(contentDir, { recursive: true });

for (const [key, file] of CONTENT_KEYS) {
	const dest = join(contentDir, file);
	console.log(`↓ content ${key}`);
	wranglerGet('ark-admin-content', key, dest);
}

const logoJson = JSON.parse(await (await import('node:fs/promises')).readFile(join(contentDir, 'header_logo.json'), 'utf8'));

async function syncLogoEntry(entry) {
	if (!entry || entry.type !== 'image' || typeof entry.src !== 'string') return;
	const key = entry.src.replace(/^\/+/, '');
	const dest = join(mediaDir, key);
	await mkdir(dirname(dest), { recursive: true });
	console.log(`↓ media ${key}`);
	wranglerGet('ark-admin-media', key, dest);
}

await syncLogoEntry(logoJson.logo_min);
await syncLogoEntry(logoJson.logo_max);

console.log('Header content sync complete.');
