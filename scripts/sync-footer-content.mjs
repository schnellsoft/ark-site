#!/usr/bin/env node
/**
 * Pull footer/footer.json from ark-admin-content.
 * Usage: node scripts/sync-footer-content.mjs
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src/data/footer');
const dest = join(contentDir, 'footer.json');

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
console.log('↓ content footer/footer.json');
wranglerGet('ark-admin-content', 'footer/footer.json', dest);
console.log('Footer content sync complete.');
