#!/usr/bin/env node
/**
 * Pull stuff/stuff.json and referenced portrait media from R2 into src/.
 * Usage: node scripts/sync-stuff-content.mjs
 */
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchR2Object, syncRemoteJson } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/stuff');
const jsonDest = join(dataDir, 'stuff.json');
const mediaDir = join(root, 'src/assets/media');
const publicMediaDir = join(root, 'public/media');

await syncRemoteJson({
	root,
	keys: 'stuff/stuff.json',
	dest: jsonDest,
	fallback: {
		spotlight: { autoplay: true, delayMs: 3000, stopOnHover: true },
		categories: [],
		subcategories: [],
		roles: [],
		specialties: [],
		providedServices: [],
		members: [],
		updatedAt: '',
	},
	label: 'stuff/stuff.json',
});

const doc = JSON.parse(await readFile(jsonDest, 'utf8'));
const members = Array.isArray(doc.members) ? doc.members : [];

const mediaKeys = new Set();
for (const m of members) {
	if (!m?.enabled) continue;
	const portrait = m.portrait || {};
	const key =
		portrait.portrait800 || portrait.webp || portrait.master || null;
	if (typeof key === 'string' && key.trim()) mediaKeys.add(key.trim());
}

await mkdir(join(mediaDir, 'library'), { recursive: true });
await mkdir(join(publicMediaDir, 'library'), { recursive: true });

for (const key of mediaKeys) {
	const dest = join(mediaDir, key);
	const pubDest = join(publicMediaDir, key);
	await mkdir(dirname(dest), { recursive: true });
	await mkdir(dirname(pubDest), { recursive: true });
	console.log(`↓ media ${key}`);
	const source = await fetchR2Object(root, 'ark-admin-media', key, dest);
	if (source) {
		console.log(`  ✓ ${source}`);
		try {
			await copyFile(dest, pubDest);
		} catch {
			// ignore
		}
	} else {
		console.warn(`  (missing) ${key}`);
	}
}

console.log(
	`Synced stuff catalog (${members.length} members, ${mediaKeys.size} portraits)`,
);
