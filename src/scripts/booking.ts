const STORAGE_KEY = 'ark-selected-services';
export const BOOKING_CHANGE_EVENT = 'ark:booking-change';

export type BookingSnapshot = {
	slugs: string[];
	count: number;
};

function unique(list: string[]): string[] {
	return [...new Set(list.filter(Boolean))];
}

export function readSelectedServices(): string[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed) ? unique(parsed.map(String)) : [];
	} catch {
		return [];
	}
}

export function writeSelectedServices(slugs: string[]): string[] {
	const next = unique(slugs);
	localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	const detail: BookingSnapshot = { slugs: next, count: next.length };
	window.dispatchEvent(new CustomEvent(BOOKING_CHANGE_EVENT, { detail }));
	syncBookingBadge(next.length);
	return next;
}

export function isServiceSelected(slug: string): boolean {
	return readSelectedServices().includes(slug);
}

export function toggleServiceSelection(slug: string): boolean {
	const current = readSelectedServices();
	const on = current.includes(slug);
	const next = on ? current.filter((s) => s !== slug) : [...current, slug];
	writeSelectedServices(next);
	return !on;
}

export function syncBookingBadge(count = readSelectedServices().length) {
	const badge = document.querySelector<HTMLElement>('[data-booking-badge]');
	const btn = document.querySelector<HTMLElement>('[data-booking]');
	if (!btn) return;

	if (count <= 0) {
		badge?.remove();
		const ariaBase =
			btn.getAttribute(`data-i18n-${document.documentElement.lang}`) ||
			btn.getAttribute('data-i18n-ro') ||
			btn.getAttribute('aria-label') ||
			'';
		btn.setAttribute('aria-label', ariaBase.replace(/\s*\(\d+\+?\)$/, ''));
		return;
	}

	let el = badge;
	if (!el) {
		el = document.createElement('span');
		el.className = 'snd-booking-badge';
		el.setAttribute('data-booking-badge', '');
		btn.append(el);
	}
	el.textContent = count > 99 ? '99+' : String(count);
	const base =
		btn.getAttribute(`data-i18n-${document.documentElement.lang}`) ||
		btn.getAttribute('data-i18n-ro') ||
		'';
	btn.setAttribute('aria-label', `${base} (${count > 99 ? '99+' : count})`);
}

export function initBookingBadge() {
	syncBookingBadge();
	window.addEventListener(BOOKING_CHANGE_EVENT, ((e: CustomEvent<BookingSnapshot>) => {
		syncBookingBadge(e.detail?.count ?? readSelectedServices().length);
	}) as EventListener);
	window.addEventListener('storage', (e) => {
		if (e.key === STORAGE_KEY) syncBookingBadge();
	});
}
