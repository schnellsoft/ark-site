import { syncBookingBadge } from '../booking';

export type Lang = 'ro' | 'bg' | 'en';
export const LANG_CHANGE_EVENT = 'ark:lang-change';
const LANG_KEY = 'ark-lang';

export function getLang(): Lang {
	try {
		const stored = localStorage.getItem(LANG_KEY) as Lang | null;
		if (stored === 'ro' || stored === 'bg' || stored === 'en') return stored;
	} catch {
		/* ignore */
	}
	const fromHtml = document.documentElement.lang as Lang;
	if (fromHtml === 'ro' || fromHtml === 'bg' || fromHtml === 'en') return fromHtml;
	return 'ro';
}

function applyI18n(lang: Lang) {
	document.documentElement.lang = lang;
	try {
		localStorage.setItem(LANG_KEY, lang);
	} catch {
		/* ignore */
	}

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
	applyI18n(stored);

	select.addEventListener('change', () => {
		applyI18n((select.value as Lang) || 'ro');
	});
}
