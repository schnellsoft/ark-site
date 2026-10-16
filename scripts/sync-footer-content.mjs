#!/usr/bin/env node
/**
 * Pull footer/footer.json from ark-admin-content.
 * Usage: node scripts/sync-footer-content.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncRemoteJson } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'src/data/footer/footer.json');

await syncRemoteJson({
	root,
	keys: 'footer/footer.json',
	dest,
	fallback: { icons: [] },
	label: 'footer/footer.json',
});
console.log('Footer content sync complete.');
