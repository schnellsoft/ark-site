#!/usr/bin/env node
/**
 * Pull articles/articles.json, per-article page JSON, and referenced media.
 * Prefers sibling ark-admin local vinext R2 (admin `pnpm dev` saves), then remote.
 * Usage: node scripts/sync-articles-content.mjs
 */
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyLocalVinextR2Object, fetchR2Object } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/articles');
const pagesDir = join(dataDir, 'pages');
const jsonDest = join(dataDir, 'articles.json');
const mediaDir = join(root, 'src/assets/media');
const publicMediaDir = join(root, 'public/media');

/** Prefer local vinext (admin save target), then remote. */
async function fetchPreferLocal(bucket, key, file) {
	if (await copyLocalVinextR2Object(root, bucket, key, file)) return 'local';
	return fetchR2Object(root, bucket, key, file);
}

await mkdir(dataDir, { recursive: true });
await mkdir(pagesDir, { recursive: true });

console.log('↓ content articles/articles.json (prefer local vinext)');
const catalogSource = await fetchPreferLocal(
	'ark-admin-content',
	'articles/articles.json',
	jsonDest,
);
if (!catalogSource) {
	console.warn('No articles.json — writing empty stub');
	await writeFile(
		jsonDest,
		JSON.stringify(
			{
				categories: [],
				subcategories: [],
				articles: [],
				firstPage: [],
				updatedAt: new Date().toISOString(),
			},
			null,
			2,
		) + '\n',
	);
} else {
	console.log(`✓ articles.json from ${catalogSource}`);
}

const doc = JSON.parse(await readFile(jsonDest, 'utf8'));
if (!Array.isArray(doc.firstPage)) {
	doc.firstPage = [];
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

for (const a of articles) {
	if (!a?.slug || a.enabled === false) continue;
	const pageDest = join(pagesDir, `${a.slug}.json`);
	console.log(`↓ content articles/pages/${a.slug}.json`);
	const source = await fetchPreferLocal(
		'ark-admin-content',
		`articles/pages/${a.slug}.json`,
		pageDest,
	);
	if (!source) {
		console.warn(`  ✗ missing page for ${a.slug} — writing stub from catalog`);
		await writeFile(
			pageDest,
			JSON.stringify(
				{
					id: a.id,
					slug: a.slug,
					title: a.title ?? { ro: '', en: '', bg: '' },
					datetime: a.datetime ?? null,
					enabled: a.enabled !== false,
					body: { ro: '', en: '', bg: '' },
					updatedAt: new Date().toISOString(),
				},
				null,
				2,
			) + '\n',
		);
		continue;
	}
	console.log(`  ✓ ${source}`);

	try {
		const page = JSON.parse(await readFile(pageDest, 'utf8'));
		const bodies = [page.body?.ro, page.body?.en, page.body?.bg].filter(Boolean);
		for (const html of bodies) {
			const re = /\/media\/(library\/[^"'?\s>]+)/gi;
			let m;
			while ((m = re.exec(html))) {
				if (m[1]) mediaKeys.add(m[1]);
			}
		}
	} catch {
		/* ignore */
	}
}

await mkdir(join(mediaDir, 'library'), { recursive: true });
await mkdir(join(publicMediaDir, 'library'), { recursive: true });

for (const key of mediaKeys) {
	const dest = join(mediaDir, key);
	const pubDest = join(publicMediaDir, key);
	await mkdir(dirname(dest), { recursive: true });
	await mkdir(dirname(pubDest), { recursive: true });
	console.log(`↓ media ${key}`);
	const source = await fetchPreferLocal('ark-admin-media', key, dest);
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
	`Synced articles catalog (${articles.length} articles, ${firstPage.length} on first page, ${mediaKeys.size} media)`,
);
