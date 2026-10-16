#!/usr/bin/env node
/**
 * Pull contact/contact.json from ark-admin-content.
 * Usage: node scripts/sync-contact-content.mjs
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src/data/contact');
const dest = join(contentDir, 'contact.json');

function wranglerGet(bucket, key, file) {
	const result = spawnSync(
		'npx',
		['wrangler', 'r2', 'object', 'get', `${bucket}/${key}`, '--remote', `--file=${file}`],
		{ cwd: root, encoding: 'utf8', stdio: 'inherit' },
	);
	if (result.status !== 0) {
		throw new Error(`Failed to get ${bucket}/${key}`);
	}
}

await mkdir(contentDir, { recursive: true });
console.log('↓ content contact/contact.json');
wranglerGet('ark-admin-content', 'contact/contact.json', dest);
console.log('Contact content sync complete.');
