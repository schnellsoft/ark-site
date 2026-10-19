#!/usr/bin/env node
/**
 * Pull articles/articles.json and per-article page JSON into src/data.
 * Images in snippets/HTML load at runtime from R2 via /media/*.
 * Prefers sibling ark-admin local vinext R2, then remote.
 * Usage: node scripts/sync-articles-content.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyLocalVinextR2Object, fetchR2Object } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/articles');
const pagesDir = join(dataDir, 'pages');
const jsonDest = join(dataDir, 'articles.json');

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
}

console.log(
	`Synced articles catalog (${articles.length} articles, ${firstPage.length} on first page; media from /media at runtime)`,
);
