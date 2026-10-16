#!/usr/bin/env node
/**
 * Shared helper: pull a JSON object from remote R2, or keep/write a local fallback.
 * When remote is missing, also tries the sibling ark-admin vinext local R2
 * (.cloudflare/state/v3/r2) — where admin CONTENT.put lands during `pnpm dev`.
 */
import { mkdir, writeFile, readFile, access, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

function resolveAdminRoot(siteRoot) {
	if (process.env.ARK_ADMIN_ROOT) return process.env.ARK_ADMIN_ROOT;
	const sibling = join(siteRoot, '..', 'ark-admin');
	if (
		existsSync(join(sibling, 'wrangler.jsonc')) ||
		existsSync(join(sibling, 'wrangler.toml'))
	) {
		return sibling;
	}
	return null;
}

function vinextR2Root(adminRoot) {
	return join(adminRoot, '.cloudflare', 'state', 'v3', 'r2');
}

/**
 * Read an object from local vinext/miniflare R2 (admin `pnpm dev` CONTENT/MEDIA).
 * @returns {Promise<boolean>} true if copied to dest
 */
export async function copyLocalVinextR2Object(siteRoot, bucket, key, dest) {
	const adminRoot = resolveAdminRoot(siteRoot);
	if (!adminRoot) return false;
	const r2 = vinextR2Root(adminRoot);
	const objectsDir = join(r2, 'miniflare-R2BucketObject');
	if (!existsSync(objectsDir)) return false;

	let blobId = null;
	try {
		const files = (await readdir(objectsDir)).filter(
			(f) => f.endsWith('.sqlite') && !f.includes('metadata'),
		);
		for (const file of files) {
			const dbPath = join(objectsDir, file);
			try {
				const db = new DatabaseSync(dbPath, { readOnly: true });
				const row = db
					.prepare('SELECT blob_id FROM _mf_objects WHERE key = ?')
					.get(key);
				db.close();
				if (row?.blob_id) {
					blobId = row.blob_id;
					break;
				}
			} catch {
				/* try next db */
			}
		}
	} catch {
		return false;
	}
	if (!blobId) return false;

	const blobPath = join(r2, bucket, 'blobs', blobId);
	if (!existsSync(blobPath)) return false;

	try {
		await mkdir(dirname(dest), { recursive: true });
		await copyFile(blobPath, dest);
		return true;
	} catch {
		return false;
	}
}

export function wranglerGet(root, bucket, key, file) {
	const result = spawnSync(
		'npx',
		[
			'wrangler',
			'r2',
			'object',
			'get',
			`${bucket}/${key}`,
			'--remote',
			`--file=${file}`,
		],
		{ cwd: root, encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] },
	);
	return result.status === 0;
}

/**
 * Prefer remote R2; fall back to local vinext R2 from sibling ark-admin.
 * @returns {Promise<'remote'|'local'|null>}
 */
export async function fetchR2Object(root, bucket, key, file) {
	if (wranglerGet(root, bucket, key, file)) return 'remote';
	if (await copyLocalVinextR2Object(root, bucket, key, file)) return 'local';
	return null;
}

export async function syncRemoteJson({
	root,
	bucket = 'ark-admin-content',
	keys,
	dest,
	fallback,
	label,
}) {
	await mkdir(dirname(dest), { recursive: true });
	const keyList = Array.isArray(keys) ? keys : [keys];

	let fetched = false;
	for (const key of keyList) {
		console.log(`↓ try content ${key}`);
		const source = await fetchR2Object(root, bucket, key, dest);
		if (source) {
			console.log(`✓ got ${key} (${source})`);
			fetched = true;
			break;
		}
		console.warn(`  (missing remote + local) ${key}`);
	}

	const fallbackText =
		typeof fallback === 'string'
			? fallback
			: JSON.stringify(fallback, null, 2) + '\n';

	async function ensureValid() {
		try {
			const text = await readFile(dest, 'utf8');
			if (!text.trim()) throw new Error('empty');
			JSON.parse(text);
		} catch {
			await writeFile(dest, fallbackText, 'utf8');
			console.warn(
				`Wrote fallback ${label ?? dest} — publish from admin to populate R2.`,
			);
		}
	}

	if (!fetched) {
		try {
			await access(dest);
			console.warn(
				`Remote/local ${label ?? keyList[0]} missing; validating local file…`,
			);
		} catch {
			/* created in ensureValid */
		}
	}
	await ensureValid();
	return dest;
}
