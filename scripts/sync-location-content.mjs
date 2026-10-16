#!/usr/bin/env node
/**
 * Pull location/location.json from ark-admin-content.
 * Usage: node scripts/sync-location-content.mjs
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src/data/location');
const dest = join(contentDir, 'location.json');

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
console.log('↓ content location/location.json');
wranglerGet('ark-admin-content', 'location/location.json', dest);
console.log('Location content sync complete.');
