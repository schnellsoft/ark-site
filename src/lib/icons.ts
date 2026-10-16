/** Slugify icon catalog names to sprite symbol ids (matches sync-icons-content.mjs). */
export function spriteSymbolId(name: string | undefined): string {
	const raw = String(name ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return raw;
}
