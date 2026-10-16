#!/usr/bin/env node
/**
 * Pull schedule/schedule.json from ark-admin-content.
 * Usage: node scripts/sync-schedule-content.mjs
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src/data/schedule');
const dest = join(contentDir, 'schedule.json');

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
console.log('↓ content schedule/schedule.json');
wranglerGet('ark-admin-content', 'schedule/schedule.json', dest);
console.log('Schedule content sync complete.');
