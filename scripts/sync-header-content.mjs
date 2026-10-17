#!/usr/bin/env node
/**
 * Pull header JSON + logo images into src/.
 * Prefers sibling ark-admin local vinext R2 (admin `pnpm dev` puts), then remote.
 * Usage: node scripts/sync-header-content.mjs
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyLocalVinextR2Object, wranglerGet } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src/data/header');
const mediaDir = join(root, 'src/assets/media');

const CONTENT_KEYS = [
	['header/logo/header_logo.json', 'header_logo.json'],
	['header/menu/header_menu.json', 'header_menu.json'],
	['header/icons/header_icons.json', 'header_icons.json'],
];

/**
 * Prefer local vinext (admin save target during dev), then remote.
 * @returns {Promise<'local'|'remote'|null>}
 */
async function fetchPreferLocal(bucket, key, file) {
	if (await copyLocalVinextR2Object(root, bucket, key, file)) return 'local';
	if (wranglerGet(root, bucket, key, file)) return 'remote';
	return null;
}

await mkdir(contentDir, { recursive: true });

for (const [key, file] of CONTENT_KEYS) {
	const dest = join(contentDir, file);
	console.log(`↓ content ${key} (prefer local vinext)`);
	const source = await fetchPreferLocal('ark-admin-content', key, dest);
	if (!source) {
		throw new Error(`Failed to get ${key} from local or remote`);
	}
	console.log(`  ✓ ${source}`);
}

const logoJson = JSON.parse(await readFile(join(contentDir, 'header_logo.json'), 'utf8'));

async function syncLogoEntry(entry) {
	if (!entry || entry.type !== 'image' || typeof entry.src !== 'string') return;
	const key = entry.src.replace(/^\/+/, '');
	const dest = join(mediaDir, key);
	await mkdir(dirname(dest), { recursive: true });
	console.log(`↓ media ${key} (prefer local vinext)`);
	const source = await fetchPreferLocal('ark-admin-media', key, dest);
	if (!source) {
		console.warn(`  ✗ missing ${key}`);
	} else {
		console.log(`  ✓ ${source}`);
	}
}

await syncLogoEntry(logoJson.logo_min);
await syncLogoEntry(logoJson.logo_max);

console.log('Header content sync complete.');
