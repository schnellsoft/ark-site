#!/usr/bin/env node
/**
 * Pull galleries index, per-gallery JSON, and layer HTML into src/data.
 * Gallery media loads at runtime from R2 via /media/*.
 * Prefers remote R2 (cloud SoT), then sibling ark-admin local vinext R2.
 * Usage: node scripts/sync-galleries-content.mjs
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchR2Object } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/galleries');

/** Prefer remote content (cloud SoT); fall back to local vinext R2. */
async function fetchGalleryObject(bucket, key, file) {
	return fetchR2Object(root, bucket, key, file);
}

await mkdir(dataDir, { recursive: true });

const indexDest = join(dataDir, 'galleries.json');
console.log('↓ content galleries/galleries.json (prefer remote R2)');
const indexSource = await fetchGalleryObject(
	'ark-admin-content',
	'galleries/galleries.json',
	indexDest,
);
if (!indexSource) {
	console.warn('No galleries.json — writing empty stub');
	await writeFile(
		indexDest,
		JSON.stringify({ galleries: [], updatedAt: new Date().toISOString() }, null, 2),
	);
} else {
	console.log(`✓ galleries.json from ${indexSource}`);
}

const index = JSON.parse(await readFile(indexDest, 'utf8'));
const galleries = Array.isArray(index.galleries) ? index.galleries : [];
console.log(`Galleries: ${galleries.length}`);

for (const entry of galleries) {
	const slug = entry?.slug;
	const galleryId = entry?.id;
	if (!slug || !galleryId) continue;

	const galleryDir = join(dataDir, slug);
	const htmlDir = join(galleryDir, 'html');
	await mkdir(htmlDir, { recursive: true });

	const jsonDest = join(galleryDir, 'gallery.json');
	console.log(`↓ content galleries/${slug}/gallery.json`);
	const gSource = await fetchGalleryObject(
		'ark-admin-content',
		`galleries/${slug}/gallery.json`,
		jsonDest,
	);
	if (!gSource) {
		console.warn(`  ✗ missing gallery.json for ${slug}`);
		await writeFile(
			jsonDest,
			JSON.stringify(
				{
					id: galleryId,
					slug,
					name: entry.name ?? { ro: '', en: '', bg: '' },
					settings: {},
					slides: [],
					updatedAt: new Date().toISOString(),
				},
				null,
				2,
			),
		);
		continue;
	}
	console.log(`  ✓ ${gSource}`);

	const doc = JSON.parse(await readFile(jsonDest, 'utf8'));
	const slides = Array.isArray(doc.slides) ? doc.slides : [];
	const gid = doc.id || galleryId;

	for (const slide of slides) {
		const id = slide.id;
		if (!id) continue;

		const desktopHtml = join(htmlDir, `${id}.html`);
		console.log(`↓ html galleries/${gid}/html/${id}.html`);
		const htmlSource = await fetchGalleryObject(
			'ark-admin-content',
			`galleries/${gid}/html/${id}.html`,
			desktopHtml,
		);
		if (!htmlSource) {
			await writeFile(desktopHtml, '');
		} else {
			console.log(`  ✓ ${htmlSource}`);
		}

		const mobileSame = slide.layer?.mobile?.sameAsDesktop !== false;
		if (!mobileSame) {
			const mobileHtml = join(htmlDir, `${id}.mobile.html`);
			console.log(`↓ html galleries/${gid}/html/${id}.mobile.html`);
			const mSource = await fetchGalleryObject(
				'ark-admin-content',
				`galleries/${gid}/html/${id}.mobile.html`,
				mobileHtml,
			);
			if (!mSource) {
				await writeFile(mobileHtml, '');
			} else {
				console.log(`  ✓ ${mSource}`);
			}
		}
	}
}

console.log('Galleries content sync complete (media from /media at runtime).');
