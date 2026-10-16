#!/usr/bin/env node
/**
 * Pull location/location.json from ark-admin-content.
 * Usage: node scripts/sync-location-content.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncRemoteJson } from './sync-r2-json.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'src/data/location/location.json');

await syncRemoteJson({
	root,
	keys: 'location/location.json',
	dest,
	fallback: {
		latitude: '',
		longitude: '',
		address: '',
		googleMapsKey: '',
		building: { libraryId: null, master: null, webp: null },
		updatedAt: '',
	},
	label: 'location/location.json',
});
console.log('Location content sync complete.');
