#!/usr/bin/env node
/**
 * Pull stuff/stuff.json from R2 into src/data.
 * Portraits load at runtime from R2 via /media/*.
 * Usage: node scripts/sync-stuff-content.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncRemoteJson } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/stuff');
const jsonDest = join(dataDir, 'stuff.json');

await syncRemoteJson({
	root,
	keys: 'stuff/stuff.json',
	dest: jsonDest,
	fallback: {
		spotlight: { autoplay: true, delayMs: 3000, stopOnHover: true },
		categories: [],
		subcategories: [],
		roles: [],
		specialties: [],
		providedServices: [],
		members: [],
		updatedAt: '',
	},
	label: 'stuff/stuff.json',
});

const doc = JSON.parse(await readFile(jsonDest, 'utf8'));
const members = Array.isArray(doc.members) ? doc.members : [];

console.log(
	`Synced stuff catalog (${members.length} members; portraits from /media at runtime)`,
);
