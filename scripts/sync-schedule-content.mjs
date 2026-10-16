#!/usr/bin/env node
/**
 * Pull schedule/schedule.json from ark-admin-content.
 * Usage: node scripts/sync-schedule-content.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncRemoteJson } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'src/data/schedule/schedule.json');

await syncRemoteJson({
	root,
	keys: 'schedule/schedule.json',
	dest,
	fallback: {
		days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
			day,
			open_time: '',
			close_time: '',
		})),
		updatedAt: '',
	},
	label: 'schedule/schedule.json',
});
console.log('Schedule content sync complete.');
