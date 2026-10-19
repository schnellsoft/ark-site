#!/usr/bin/env node
/**
 * Pull slideshow.json and layer HTML into src/data.
 * Slide media loads at runtime from R2 via /media/*.
 *
 * Local `astro dev`: prefer sibling vinext (admin pnpm dev), then remote.
 * CI / Cloudflare Builds: remote only (set CI or CLOUDFLARE_ACCOUNT_ID).
 *
 * Usage: node scripts/sync-slideshow-content.mjs
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyLocalVinextR2Object, wranglerGet } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/slideshow');
const htmlDir = join(dataDir, 'html');

const preferRemote =
	process.env.ARK_SYNC_REMOTE === '1' ||
	process.env.CI === 'true' ||
	Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);

/**
 * @returns {Promise<'local'|'remote'|null>}
 */
async function fetchContent(bucket, key, file) {
	if (preferRemote) {
		if (wranglerGet(root, bucket, key, file)) return 'remote';
		if (await copyLocalVinextR2Object(root, bucket, key, file)) return 'local';
		return null;
	}
	if (await copyLocalVinextR2Object(root, bucket, key, file)) return 'local';
	if (wranglerGet(root, bucket, key, file)) return 'remote';
	return null;
}

await mkdir(htmlDir, { recursive: true });

const jsonDest = join(dataDir, 'slideshow.json');
console.log(
	`↓ content slideshow/slideshow.json (${preferRemote ? 'prefer remote' : 'prefer local vinext'})`,
);
const jsonSource = await fetchContent(
	'ark-admin-content',
	'slideshow/slideshow.json',
	jsonDest,
);
if (!jsonSource) {
	console.warn('No slideshow.json locally or remotely — writing empty stub');
	await writeFile(
		jsonDest,
		JSON.stringify(
			{
				settings: {
					animation: 'fade',
					autoplay: true,
					autoplayInterval: 7000,
					finite: false,
					pauseOnHover: true,
					velocity: 1,
					ratio: '16:9',
					minHeight: '',
					maxHeight: '',
					index: 0,
				},
				slides: [],
			},
			null,
			2,
		),
	);
} else {
	console.log(`✓ slideshow.json from ${jsonSource}`);
}

const doc = JSON.parse(await readFile(jsonDest, 'utf8'));
const slides = Array.isArray(doc.slides) ? doc.slides : [];
console.log(`Slides: ${slides.length}`);

for (const slide of slides) {
	const id = slide.id;
	if (!id) continue;

	const desktopHtml = join(htmlDir, `${id}.html`);
	console.log(`↓ html slideshow/html/${id}.html`);
	const htmlSource = await fetchContent(
		'ark-admin-content',
		`slideshow/html/${id}.html`,
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
		console.log(`↓ html slideshow/html/${id}.mobile.html`);
		const mSource = await fetchContent(
			'ark-admin-content',
			`slideshow/html/${id}.mobile.html`,
			mobileHtml,
		);
		if (!mSource) {
			await writeFile(mobileHtml, '');
		}
	}
}

console.log('Slideshow content sync complete (media from /media at runtime).');
