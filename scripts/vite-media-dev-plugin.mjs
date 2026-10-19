/**
 * Astro/Vite dev only: serve GET /media/* from local vinext R2 (sibling ark-admin)
 * when the file is not already in public/media. Production uses the Worker R2 proxy.
 */
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIME = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.pdf': 'application/pdf',
};

function resolveAdminRoot(siteRoot) {
	if (process.env.ARK_ADMIN_ROOT) return process.env.ARK_ADMIN_ROOT;
	const sibling = join(siteRoot, '..', 'ark-admin');
	if (
		existsSync(join(sibling, 'wrangler.jsonc')) ||
		existsSync(join(sibling, 'wrangler.toml')) ||
		existsSync(join(sibling, 'cloudflare.config.ts'))
	) {
		return sibling;
	}
	return null;
}

/**
 * @returns {string | null} absolute blob path
 */
function resolveLocalR2Blob(adminRoot, key) {
	const roots = [
		join(adminRoot, '.cloudflare', 'state', 'v3', 'r2'),
		join(adminRoot, '.wrangler', 'state', 'v3', 'r2'),
	];

	for (const r2 of roots) {
		const objectsDir = join(r2, 'miniflare-R2BucketObject');
		if (!existsSync(objectsDir)) continue;

		let blobId = null;
		try {
			const files = readdirSync(objectsDir).filter(
				(f) => f.endsWith('.sqlite') && !f.includes('metadata'),
			);
			for (const file of files) {
				try {
					const db = new DatabaseSync(join(objectsDir, file), { readOnly: true });
					const row = db.prepare('SELECT blob_id FROM _mf_objects WHERE key = ?').get(key);
					db.close();
					if (row?.blob_id) {
						blobId = row.blob_id;
						break;
					}
				} catch {
					/* try next */
				}
			}
		} catch {
			continue;
		}
		if (!blobId) continue;

		const blobPath = join(r2, 'ark-admin-media', 'blobs', blobId);
		if (existsSync(blobPath)) return blobPath;
	}
	return null;
}

export function mediaDevPlugin(siteRoot) {
	return {
		name: 'ark-media-dev',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				try {
					const raw = req.url?.split('?')[0] ?? '';
					if (!raw.startsWith('/media/')) return next();

					const key = decodeURIComponent(raw.slice('/media/'.length)).replace(
						/^\/+/,
						'',
					);
					if (!key || key.includes('..')) {
						res.statusCode = 400;
						res.end('Bad request');
						return;
					}

					const publicFile = join(siteRoot, 'public', 'media', key);
					if (existsSync(publicFile)) return next();

					const adminRoot = resolveAdminRoot(siteRoot);
					if (!adminRoot) return next();

					const blob = resolveLocalR2Blob(adminRoot, key);
					if (!blob) return next();

					try {
						await mkdir(dirname(publicFile), { recursive: true });
						await copyFile(blob, publicFile);
					} catch {
						/* serve blob directly if cache write fails */
					}

					const file = existsSync(publicFile) ? publicFile : blob;
					const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
					res.setHeader('Content-Type', type);
					res.setHeader('Cache-Control', 'no-cache');
					createReadStream(file).pipe(res);
				} catch {
					next();
				}
			});
		},
	};
}
