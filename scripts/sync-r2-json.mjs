#!/usr/bin/env node
/**
 * Shared helper: pull a JSON object from remote R2, or keep/write a local fallback.
 * When remote is missing, also tries the sibling ark-admin vinext local R2
 * (.cloudflare/state/v3/r2) — where admin CONTENT.put lands during `pnpm dev`.
 */
import {
	mkdir,
	writeFile,
	readFile,
	access,
	copyFile,
	readdir,
	stat,
	unlink,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

/** Remove zero-byte stubs wrangler sometimes leaves after a failed get. */
async function removeIfEmpty(file) {
	try {
		const s = await stat(file);
		if (s.size === 0) await unlink(file);
	} catch {
		/* missing is fine */
	}
}

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

/** vinext (`pnpm dev`) → .cloudflare; bare wrangler CLI → .wrangler */
function localR2Roots(adminRoot) {
	return [
		join(adminRoot, '.cloudflare', 'state', 'v3', 'r2'),
		join(adminRoot, '.wrangler', 'state', 'v3', 'r2'),
	];
}

/**
 * Read an object from local vinext/miniflare R2 (admin `pnpm dev` CONTENT/MEDIA).
 * @returns {Promise<boolean>} true if copied to dest
 */
export async function copyLocalVinextR2Object(siteRoot, bucket, key, dest) {
	const adminRoot = resolveAdminRoot(siteRoot);
	if (!adminRoot) return false;

	for (const r2 of localR2Roots(adminRoot)) {
		const objectsDir = join(r2, 'miniflare-R2BucketObject');
		if (!existsSync(objectsDir)) continue;

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
			continue;
		}
		if (!blobId) continue;

		const blobPath = join(r2, bucket, 'blobs', blobId);
		if (!existsSync(blobPath)) continue;

		try {
			await mkdir(dirname(dest), { recursive: true });
			await copyFile(blobPath, dest);
			return true;
		} catch {
			/* try next root */
		}
	}
	return false;
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
 * Never leaves empty JSON stubs that break the Astro build.
 * @returns {Promise<'remote'|'local'|null>}
 */
export async function fetchR2Object(root, bucket, key, file) {
	if (wranglerGet(root, bucket, key, file)) {
		try {
			const s = await stat(file);
			if (s.size > 0) return 'remote';
		} catch {
			/* fall through */
		}
		await removeIfEmpty(file);
	} else {
		await removeIfEmpty(file);
	}
	if (await copyLocalVinextR2Object(root, bucket, key, file)) {
		try {
			const s = await stat(file);
			if (s.size > 0) return 'local';
		} catch {
			/* fall through */
		}
		await removeIfEmpty(file);
	}
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
