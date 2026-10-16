#!/usr/bin/env node
/**
 * Pull contact/contact.json from ark-admin-content.
 * Usage: node scripts/sync-contact-content.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncRemoteJson } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'src/data/contact/contact.json');

await syncRemoteJson({
	root,
	keys: 'contact/contact.json',
	dest,
	fallback: { phone: '', email: '', updatedAt: '' },
	label: 'contact/contact.json',
});
console.log('Contact content sync complete.');
