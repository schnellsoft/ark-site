#!/usr/bin/env node
/**
 * Pull slideshow.json, layer HTML, and slide media into src/.
 * Prefers sibling ark-admin local vinext R2 (where `pnpm dev` CONTENT/MEDIA.put lands),
 * then falls back to remote R2.
 * Usage: node scripts/sync-slideshow-content.mjs
 */
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyLocalVinextR2Object, wranglerGet } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/slideshow');
const htmlDir = join(dataDir, 'html');
const mediaDir = join(root, 'src/assets/media');
/** Public static copies for production (static output, no runtime R2). */
const publicMediaDir = join(root, 'public/media');

/**
 * Prefer local vinext (admin save target during dev), then remote.
 * @returns {Promise<'local'|'remote'|null>}
 */
async function fetchPreferLocal(bucket, key, file) {
	if (await copyLocalVinextR2Object(root, bucket, key, file)) return 'local';
	if (wranglerGet(root, bucket, key, file)) return 'remote';
	return null;
}

await mkdir(htmlDir, { recursive: true });
await mkdir(join(mediaDir, 'slideshow'), { recursive: true });
await mkdir(join(publicMediaDir, 'slideshow'), { recursive: true });

const jsonDest = join(dataDir, 'slideshow.json');
console.log('↓ content slideshow/slideshow.json (prefer local vinext)');
const jsonSource = await fetchPreferLocal(
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
	const htmlSource = await fetchPreferLocal(
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
		const mSource = await fetchPreferLocal(
			'ark-admin-content',
			`slideshow/html/${id}.mobile.html`,
			mobileHtml,
		);
		if (!mSource) {
			await writeFile(mobileHtml, '');
		}
	}

	const keys = new Set();
	const files = slide.files || {};
	if (files.video?.key) keys.add(files.video.key);
	if (files.sourceKey) keys.add(files.sourceKey);
	if (slide.version) {
		const prefix = `slideshow/${id}/`;
		for (const w of Object.keys(files.desktop || {})) {
			keys.add(`${prefix}slide-${id}.${slide.version}-d-${w}.jpg`);
			keys.add(`${prefix}slide-${id}.${slide.version}-d-${w}.webp`);
		}
		for (const w of Object.keys(files.mobile || {})) {
			keys.add(`${prefix}slide-${id}.${slide.version}-m-${w}.jpg`);
			keys.add(`${prefix}slide-${id}.${slide.version}-m-${w}.webp`);
		}
	}

	for (const key of keys) {
		const dest = join(mediaDir, key);
		const pubDest = join(publicMediaDir, key);
		await mkdir(dirname(dest), { recursive: true });
		await mkdir(dirname(pubDest), { recursive: true });
		console.log(`↓ media ${key}`);
		const mediaSource = await fetchPreferLocal('ark-admin-media', key, dest);
		if (mediaSource) {
			await copyFile(dest, pubDest);
			console.log(`  ✓ ${mediaSource}`);
		} else {
			console.warn(`  ✗ missing ${key}`);
		}
	}
}

console.log('Slideshow content sync complete.');
