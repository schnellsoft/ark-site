/**
 * Public URL for an object in ark-admin-media, served by the site Worker at /media/*.
 * CMS images are not baked into src/assets at build time — load them from R2 at runtime.
 */
export function mediaUrl(key: string | null | undefined): string {
	if (!key) return '';
	const normalized = String(key).replace(/^\/+/, '').replace(/^media\//, '');
	if (!normalized || normalized.includes('..')) return '';
	return `/media/${normalized}`;
}
