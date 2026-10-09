type Lang = 'ro' | 'bg' | 'en';

function applyI18n(lang: Lang) {
	document.documentElement.lang = lang;

	document.querySelectorAll<HTMLElement>('[data-i18n-ro]').forEach((el) => {
		const next = el.getAttribute(`data-i18n-${lang}`) ?? '';
		const fallback =
			el.getAttribute('data-i18n-ro') ||
			el.getAttribute('data-i18n-en') ||
			el.getAttribute('data-i18n-bg') ||
			'';
		el.textContent = next || fallback;
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
}

export function initLang() {
	const select = document.querySelector<HTMLSelectElement>('[data-lang-select]');
	if (!select) return;
	const current = (select.value as Lang) || 'ro';
	applyI18n(current);
	select.addEventListener('change', () => {
		applyI18n((select.value as Lang) || 'ro');
	});
}
