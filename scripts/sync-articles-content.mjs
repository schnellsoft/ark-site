#!/usr/bin/env node
/**
 * Pull articles/articles.json and referenced snippet media from R2 into src/.
 * Usage: node scripts/sync-articles-content.mjs
 */
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchR2Object, syncRemoteJson } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/articles');
const jsonDest = join(dataDir, 'articles.json');
const mediaDir = join(root, 'src/assets/media');
const publicMediaDir = join(root, 'public/media');

await syncRemoteJson({
	root,
	keys: 'articles/articles.json',
	dest: jsonDest,
	fallback: {
		categories: [],
		subcategories: [],
		articles: [],
		firstPage: [],
		updatedAt: '',
	},
	label: 'articles/articles.json',
});

const doc = JSON.parse(await readFile(jsonDest, 'utf8'));
if (!Array.isArray(doc.firstPage)) {
	doc.firstPage = [];
	const { writeFile } = await import('node:fs/promises');
	await writeFile(jsonDest, JSON.stringify(doc, null, 2) + '\n', 'utf8');
}
const articles = Array.isArray(doc.articles) ? doc.articles : [];
const firstPage = Array.isArray(doc.firstPage) ? doc.firstPage : [];
const byId = new Map(articles.map((a) => [a.id, a]));

const mediaKeys = new Set();
for (const id of firstPage) {
	const a = byId.get(id);
	if (!a || a.enabled === false) continue;
	const image = a.snippet?.image || {};
	const key = image.webp || image.master || null;
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
	`Synced articles catalog (${articles.length} articles, ${firstPage.length} on first page, ${mediaKeys.size} images)`,
);
