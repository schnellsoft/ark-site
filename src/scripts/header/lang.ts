import { syncBookingBadge } from '../booking';

export type Lang = 'ro' | 'bg' | 'en';
export const LANG_CHANGE_EVENT = 'ark:lang-change';
const LANG_KEY = 'ark-lang';
const MANUAL_KEY = 'ark-lang-manual';

function readCookie(name: string): string | null {
	try {
		const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
		return match ? decodeURIComponent(match[1]) : null;
	} catch {
		return null;
	}
}

function writeCookie(name: string, value: string) {
	try {
		document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
	} catch {
		/* ignore */
	}
}

function isLang(v: string | null | undefined): v is Lang {
	return v === 'ro' || v === 'bg' || v === 'en';
}

export function getLang(): Lang {
	try {
		if (localStorage.getItem(MANUAL_KEY) === '1') {
			const stored = localStorage.getItem(LANG_KEY);
			if (isLang(stored)) return stored;
		}
	} catch {
		/* ignore */
	}

	const cookie = readCookie(LANG_KEY);
	if (isLang(cookie)) return cookie;

	try {
		const stored = localStorage.getItem(LANG_KEY);
		if (isLang(stored)) return stored;
	} catch {
		/* ignore */
	}

	const fromHtml = document.documentElement.lang;
	if (isLang(fromHtml)) return fromHtml;
	return 'en';
}

function applyI18n(lang: Lang, manual = false) {
	document.documentElement.lang = lang;
	try {
		localStorage.setItem(LANG_KEY, lang);
		if (manual) localStorage.setItem(MANUAL_KEY, '1');
	} catch {
		/* ignore */
	}
	writeCookie(LANG_KEY, lang);

	document.querySelectorAll<HTMLElement>('[data-i18n-ro]').forEach((el) => {
		// Appointment CTA keeps structured children; updated below.
		if (el.hasAttribute('data-appointment')) return;

		const next = el.getAttribute(`data-i18n-${lang}`) ?? '';
		const fallback =
			el.getAttribute('data-i18n-ro') ||
			el.getAttribute('data-i18n-en') ||
			el.getAttribute('data-i18n-bg') ||
			'';
		const text = next || fallback;

		if (el.hasAttribute('data-i18n-aria-only')) {
			el.setAttribute('aria-label', text);
			return;
		}

		el.textContent = text;
	});

	const appointment = document.querySelector<HTMLElement>('[data-appointment]');
	const label = appointment?.querySelector<HTMLElement>('[data-appointment-label]');
	if (appointment && label) {
		const text =
			appointment.getAttribute(`data-i18n-${lang}`) ||
			appointment.getAttribute('data-i18n-ro') ||
			label.textContent ||
			'';
		label.textContent = text;
		appointment.setAttribute('aria-label', text);
	}

	syncBookingBadge();
	window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: { lang } }));
}

export function initLang() {
	const select = document.querySelector<HTMLSelectElement>('[data-lang-select]');
	if (!select) return;

	const stored = getLang();
	if (select.value !== stored) select.value = stored;
	applyI18n(stored, false);

	select.addEventListener('change', () => {
		applyI18n((select.value as Lang) || 'en', true);
	});
}
