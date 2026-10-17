#!/usr/bin/env node
/**
 * Pull location/location.json and building media from R2 into src/.
 * Usage: node scripts/sync-location-content.mjs
 */
import { mkdir, readFile, copyFile, unlink, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchR2Object, syncRemoteJson } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'src/data/location/location.json');
const mediaDir = join(root, 'src/assets/media');
const publicMediaDir = join(root, 'public/media');

await syncRemoteJson({
	root,
	keys: 'location/location.json',
	dest,
	fallback: {
		latitude: '',
		longitude: '',
		address: '',
		googleMapsKey: '',
		siteDomain: '',
		building: { libraryId: null, master: null, webp: null },
		updatedAt: '',
	},
	label: 'location/location.json',
});

const doc = JSON.parse(await readFile(dest, 'utf8'));
const building = doc.building || {};
const mediaKeys = new Set();
for (const key of [building.webp, building.master]) {
	if (typeof key === 'string' && key.trim()) mediaKeys.add(key.trim());
}

await mkdir(join(mediaDir, 'library'), { recursive: true });
await mkdir(join(publicMediaDir, 'library'), { recursive: true });

for (const key of mediaKeys) {
	const fileDest = join(mediaDir, key);
	const pubDest = join(publicMediaDir, key);
	await mkdir(dirname(fileDest), { recursive: true });
	await mkdir(dirname(pubDest), { recursive: true });
	console.log(`↓ media ${key}`);
	const source = await fetchR2Object(root, 'ark-admin-media', key, fileDest);
	if (source) {
		try {
			await copyFile(fileDest, pubDest);
			console.log(`  ✓ ${key} (${source})`);
		} catch {
			/* ignore */
		}
	} else {
		console.warn(`  missing ${key}`);
		for (const path of [fileDest, pubDest]) {
			try {
				const s = await stat(path);
				if (s.size === 0) await unlink(path);
			} catch {
				/* ignore */
			}
		}
	}
}

console.log('Location content sync complete.');
