#!/usr/bin/env node
/**
 * Pull header JSON into src/data. Logo images are served at runtime from R2 via /media/*.
 *
 * For local `astro dev` (no Worker), also mirror logo image keys into public/media/
 * so /media/header/logo/* resolves without wrangler. Production still prefers Worker → R2.
 *
 * Local `astro dev`: prefer sibling vinext (admin), then remote.
 * CI / Cloudflare Builds: remote first (ARK_SYNC_REMOTE / CI / CLOUDFLARE_ACCOUNT_ID).
 *
 * Usage: node scripts/sync-header-content.mjs
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyLocalVinextR2Object, wranglerGet } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src/data/header');
const publicMediaDir = join(root, 'public', 'media');

const preferRemote =
	process.env.ARK_SYNC_REMOTE === '1' ||
	process.env.CI === 'true' ||
	Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);

const CONTENT_KEYS = [
	['header/logo/header_logo.json', 'header_logo.json'],
	['header/menu/header_menu.json', 'header_menu.json'],
	['header/icons/header_icons.json', 'header_icons.json'],
];

/**
 * @returns {Promise<'local'|'remote'|null>}
 */
async function fetchObject(bucket, key, file) {
	if (preferRemote) {
		if (wranglerGet(root, bucket, key, file)) return 'remote';
		if (await copyLocalVinextR2Object(root, bucket, key, file)) return 'local';
		return null;
	}
	if (await copyLocalVinextR2Object(root, bucket, key, file)) return 'local';
	if (wranglerGet(root, bucket, key, file)) return 'remote';
	return null;
}

await mkdir(contentDir, { recursive: true });

for (const [key, file] of CONTENT_KEYS) {
	const dest = join(contentDir, file);
	console.log(
		`↓ content ${key} (${preferRemote ? 'prefer remote' : 'prefer local vinext'})`,
	);
	const source = await fetchObject('ark-admin-content', key, dest);
	if (!source) {
		throw new Error(`Failed to get ${key} from local or remote`);
	}
	console.log(`  ✓ ${source}`);
}

/** Mirror logo rasters into public/media for astro dev (Worker serves them in prod). */
async function syncLogoMedia() {
	const logoJsonPath = join(contentDir, 'header_logo.json');
	let doc;
	try {
		doc = JSON.parse(await readFile(logoJsonPath, 'utf8'));
	} catch {
		console.warn('  ! could not read header_logo.json for media mirror');
		return;
	}

	const keys = [];
	for (const slot of ['logo_min', 'logo_max']) {
		const entry = doc?.[slot];
		if (entry?.type === 'image' && typeof entry.src === 'string' && entry.src) {
			keys.push(entry.src.replace(/^\/+/, '').replace(/^media\//, ''));
		}
	}

	for (const key of keys) {
		if (!key || key.includes('..')) continue;
		const dest = join(publicMediaDir, key);
		await mkdir(dirname(dest), { recursive: true });
		console.log(`↓ media ${key} → public/media/`);
		const source = await fetchObject('ark-admin-media', key, dest);
		if (!source) {
			console.warn(`  ! missing ${key} (logo will 404 in astro dev until Worker or re-sync)`);
			continue;
		}
		console.log(`  ✓ ${source}`);
	}
}

await syncLogoMedia();

console.log('Header content sync complete (logos mirrored to public/media for local /media).');
