#!/usr/bin/env node
/**
 * Pull services catalog, pages, and PDFs from R2 into src/.
 * Service images load at runtime from R2 via /media/*.
 * Usage: node scripts/sync-services-content.mjs
 */
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/services');
const pagesDir = join(dataDir, 'pages');
const assetsServices = join(root, 'src/assets/services');

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

const pdfPublicDir = join(root, 'public/services');
await mkdir(pdfPublicDir, { recursive: true });
for (const lang of ['ro', 'en', 'bg']) {
	const key = `services/price-list-${lang}.pdf`;
	const dest = join(assetsServices, `price-list-${lang}.pdf`);
	const pubDest = join(pdfPublicDir, `price-list-${lang}.pdf`);
	console.log(`↓ content ${key}`);
	if (wranglerGet('ark-admin-content', key, dest)) {
		await copyFile(dest, pubDest);
		if (lang === 'ro') {
			await copyFile(dest, join(assetsServices, 'price-list.pdf'));
			await copyFile(dest, join(pdfPublicDir, 'price-list.pdf'));
		}
		console.log(`  ✓ public/services/price-list-${lang}.pdf`);
	} else {
		console.warn(`No remote ${key}`);
	}
}

console.log(
	`Synced ${services.length} services (images from /media at runtime)`,
);
