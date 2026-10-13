#!/usr/bin/env node
/**
 * Pull slideshow.json, layer HTML, and slide media from R2 into src/.
 * Usage: node scripts/sync-slideshow-content.mjs
 * Falls back to empty local stubs if remote objects are missing.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/slideshow');
const htmlDir = join(dataDir, 'html');
const mediaDir = join(root, 'src/assets/media');
/** Public static copies for production (static output, no runtime R2). */
const publicMediaDir = join(root, 'public/media');

function wranglerGet(bucket, key, file) {
	const result = spawnSync(
		'npx',
		['wrangler', 'r2', 'object', 'get', `${bucket}/${key}`, '--remote', `--file=${file}`],
		{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
	);
	return result.status === 0;
}

await mkdir(htmlDir, { recursive: true });
await mkdir(join(mediaDir, 'slideshow'), { recursive: true });
await mkdir(join(publicMediaDir, 'slideshow'), { recursive: true });

const jsonDest = join(dataDir, 'slideshow.json');
console.log('↓ content slideshow/slideshow.json');
if (!wranglerGet('ark-admin-content', 'slideshow/slideshow.json', jsonDest)) {
	console.warn('No remote slideshow.json — writing empty stub');
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
}

const doc = JSON.parse(await readFile(jsonDest, 'utf8'));
const slides = Array.isArray(doc.slides) ? doc.slides : [];

for (const slide of slides) {
	const id = slide.id;
	if (!id) continue;

	const desktopHtml = join(htmlDir, `${id}.html`);
	console.log(`↓ html slideshow/html/${id}.html`);
	if (!wranglerGet('ark-admin-content', `slideshow/html/${id}.html`, desktopHtml)) {
		await writeFile(desktopHtml, '');
	}

	const mobileSame = slide.layer?.mobile?.sameAsDesktop !== false;
	if (!mobileSame) {
		const mobileHtml = join(htmlDir, `${id}.mobile.html`);
		console.log(`↓ html slideshow/html/${id}.mobile.html`);
		if (!wranglerGet('ark-admin-content', `slideshow/html/${id}.mobile.html`, mobileHtml)) {
			await writeFile(mobileHtml, '');
		}
	}

	const keys = new Set();
	const files = slide.files || {};
	if (files.video?.key) keys.add(files.video.key);
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
		if (wranglerGet('ark-admin-media', key, dest)) {
			const { copyFile } = await import('node:fs/promises');
			await copyFile(dest, pubDest);
		}
	}
}

console.log('Slideshow content sync complete.');
