#!/usr/bin/env node
/**
 * Pull services catalog, pages, PDF, and referenced library media from R2 into src/.
 * Usage: node scripts/sync-services-content.mjs
 */
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/services');
const pagesDir = join(dataDir, 'pages');
const mediaDir = join(root, 'src/assets/media');
const assetsServices = join(root, 'src/assets/services');
const publicMediaDir = join(root, 'public/media');

function wranglerGet(bucket, key, file) {
	const result = spawnSync(
		'npx',
		['wrangler', 'r2', 'object', 'get', `${bucket}/${key}`, '--remote', `--file=${file}`],
		{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
	);
	return result.status === 0;
}

await mkdir(pagesDir, { recursive: true });
await mkdir(assetsServices, { recursive: true });
await mkdir(join(mediaDir, 'library'), { recursive: true });
await mkdir(join(publicMediaDir, 'library'), { recursive: true });

const jsonDest = join(dataDir, 'services.json');
console.log('↓ content services/services.json');
if (!wranglerGet('ark-admin-content', 'services/services.json', jsonDest)) {
	console.warn('No remote services.json — writing empty stub');
	await writeFile(
		jsonDest,
		JSON.stringify(
			{
				recommended: [],
				categories: [],
				subcategories: [],
				services: [],
				pdfKey: 'services/price-list.pdf',
				updatedAt: new Date().toISOString(),
			},
			null,
			2,
		),
	);
}

const doc = JSON.parse(await readFile(jsonDest, 'utf8'));
const services = Array.isArray(doc.services) ? doc.services : [];

for (const svc of services) {
	const slug = svc.slug;
	if (!slug) continue;
	const pageDest = join(pagesDir, `${slug}.json`);
	console.log(`↓ page services/pages/${slug}.json`);
	if (!wranglerGet('ark-admin-content', `services/pages/${slug}.json`, pageDest)) {
		await writeFile(
			pageDest,
			JSON.stringify(
				{
					slug,
					title: svc.title || { ro: '', en: '', bg: '' },
					synopsis: { ro: '', en: '', bg: '' },
					paragraphs: { ro: [], en: [], bg: [] },
					images: [],
					categoryId: svc.categoryId,
					subcategoryId: svc.subcategoryId ?? null,
					price: svc.price || '',
					currency: svc.currency || 'RON',
					iconSvg: svc.iconSvg || '',
					pagePath: svc.pagePath || `/services/${slug}`,
				},
				null,
				2,
			),
		);
	}
}

const pdfDest = join(assetsServices, 'price-list.pdf');
console.log('↓ content services/price-list.pdf');
if (!wranglerGet('ark-admin-content', 'services/price-list.pdf', pdfDest)) {
	console.warn('No remote price-list.pdf');
}

/** Collect media keys from page JSON */
const mediaKeys = new Set();
for (const svc of services) {
	const pagePath = join(pagesDir, `${svc.slug}.json`);
	if (!existsSync(pagePath)) continue;
	try {
		const page = JSON.parse(await readFile(pagePath, 'utf8'));
		for (const img of page.images || []) {
			if (img.master) mediaKeys.add(img.master);
			if (img.webp) mediaKeys.add(img.webp);
		}
	} catch {
		// skip
	}
}

for (const key of mediaKeys) {
	const dest = join(mediaDir, key);
	const pubDest = join(publicMediaDir, key);
	await mkdir(dirname(dest), { recursive: true });
	await mkdir(dirname(pubDest), { recursive: true });
	console.log(`↓ media ${key}`);
	if (wranglerGet('ark-admin-media', key, dest)) {
		try {
			await copyFile(dest, pubDest);
		} catch {
			// ignore
		}
	}
}

console.log(`Synced ${services.length} services, ${mediaKeys.size} media keys`);
