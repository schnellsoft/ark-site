/**
 * Ark site Worker: static Astro assets + read-only R2 for admin content/media.
 *
 * Routes (run_worker_first):
 *   GET /media/*   → ark-admin-media
 *   GET /content/* → ark-admin-content
 *   GET /api/media/*   → same as /media/*
 *   GET /api/content/* → same as /content/*
 *
 * Writes stay out of this Worker — populate buckets via the admin app or Wrangler.
 */

const CACHE_CONTROL_MEDIA = 'public, max-age=86400, stale-while-revalidate=604800';
const CACHE_CONTROL_CONTENT = 'public, max-age=60, stale-while-revalidate=300';

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
}

/** Normalize and validate an object key from a URL path prefix. */
function objectKeyFromPath(pathname: string, prefix: string): string | null {
	if (!pathname.startsWith(prefix)) return null;
	let key = decodeURIComponent(pathname.slice(prefix.length));
	// strip leading slashes
	key = key.replace(/^\/+/, '');
	if (!key || key.includes('..') || key.includes('\\')) return null;
	return key;
}

function matchR2Route(pathname: string): { bucket: 'MEDIA' | 'CONTENT'; key: string } | null {
	const mediaKey =
		objectKeyFromPath(pathname, '/media/') ?? objectKeyFromPath(pathname, '/api/media/');
	if (mediaKey) return { bucket: 'MEDIA', key: mediaKey };

	const contentKey =
		objectKeyFromPath(pathname, '/content/') ?? objectKeyFromPath(pathname, '/api/content/');
	if (contentKey) return { bucket: 'CONTENT', key: contentKey };

	return null;
}

async function serveR2Object(
	bucket: R2Bucket,
	key: string,
	request: Request,
	cacheControl: string,
): Promise<Response> {
	const object = await bucket.get(key, {
		onlyIf: request.headers,
		range: request.headers,
	});

	if (object === null) {
		return json({ error: 'Not found', key }, 404);
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set('Cache-Control', cacheControl);
	headers.set('X-Content-Type-Options', 'nosniff');

	if (!headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/octet-stream');
	}

	const hasBody = 'body' in object && object.body !== undefined;
	return new Response(hasBody ? object.body : undefined, {
		status: hasBody ? 200 : 412,
		headers,
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const route = matchR2Route(url.pathname);

		if (route) {
			if (request.method !== 'GET' && request.method !== 'HEAD') {
				return new Response('Method Not Allowed', {
					status: 405,
					headers: { Allow: 'GET, HEAD' },
				});
			}

			const bucket = route.bucket === 'MEDIA' ? env.MEDIA : env.CONTENT;
			const cacheControl =
				route.bucket === 'MEDIA' ? CACHE_CONTROL_MEDIA : CACHE_CONTROL_CONTENT;

			if (request.method === 'HEAD') {
				const head = await bucket.head(route.key);
				if (head === null) return json({ error: 'Not found', key: route.key }, 404);
				const headers = new Headers();
				head.writeHttpMetadata(headers);
				headers.set('etag', head.httpEtag);
				headers.set('Cache-Control', cacheControl);
				headers.set('X-Content-Type-Options', 'nosniff');
				return new Response(null, { status: 200, headers });
			}

			return serveR2Object(bucket, route.key, request, cacheControl);
		}

		// Fallback for unmatched worker-first paths (e.g. /api/health)
		if (url.pathname === '/api/health' || url.pathname === '/api/health/') {
			return json({ ok: true, service: 'ark-site' });
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
