#!/usr/bin/env node
/**
 * Pull settings/site.json from ark-admin-content.
 * Usage: node scripts/sync-settings-content.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncRemoteJson } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'src/data/settings/site.json');

await syncRemoteJson({
	root,
	keys: 'settings/site.json',
	dest,
	fallback: {
		domain: '',
		adminApiUrl: '',
		updatedAt: '',
	},
	label: 'settings/site.json',
});
console.log('Settings content sync complete.');
