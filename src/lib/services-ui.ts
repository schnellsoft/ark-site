export type Lang = 'ro' | 'bg' | 'en';

export type LocaleMap = { ro?: string; en?: string; bg?: string };

export const UI = {
	search: { ro: 'Caută', en: 'Search', bg: 'Търсене' },
	searchPlaceholder: {
		ro: 'Caută serviciu…',
		en: 'Search services…',
		bg: 'Търси услуга…',
	},
	category: { ro: 'Categorie', en: 'Category', bg: 'Категория' },
	subcategory: { ro: 'Subcategorie', en: 'Subcategory', bg: 'Подкатегория' },
	recommended: {
		ro: 'Servicii recomandate',
		en: 'Recommended services',
		bg: 'Препоръчани услуги',
	},
	allSubcategories: { ro: 'Toate', en: 'All', bg: 'Всички' },
	empty: { ro: 'Nu sunt servicii', en: 'No services', bg: 'Няма услуги' },
	select: { ro: 'Selectează', en: 'Select', bg: 'Избери' },
	remove: { ro: 'Elimină', en: 'Remove', bg: 'Премахни' },
	services: { ro: 'Servicii', en: 'Services', bg: 'Услуги' },
	prev: { ro: 'Anterior', en: 'Previous', bg: 'Предишна' },
	next: { ro: 'Următor', en: 'Next', bg: 'Следваща' },
} as const;

export function ui(key: keyof typeof UI, lang: Lang): string {
	const map = UI[key];
	return map[lang] || map.ro || map.en || '';
}

export function pickLocale(map: LocaleMap | undefined, lang: Lang): string {
	if (!map) return '';
	return map[lang] || map.ro || map.en || map.bg || '';
}

export function readDocumentLang(): Lang {
	const lang = document.documentElement.lang;
	if (lang === 'bg' || lang === 'en' || lang === 'ro') return lang;
	try {
		const stored = localStorage.getItem('ark-lang');
		if (stored === 'bg' || stored === 'en' || stored === 'ro') return stored;
	} catch {
		/* ignore */
	}
	return 'ro';
}
