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
	deselect: { ro: 'Deselectează', en: 'Deselect', bg: 'Премахни' },
	remove: { ro: 'Elimină', en: 'Remove', bg: 'Премахни' },
	selected: { ro: 'Selectat', en: 'Selected', bg: 'Избрано' },
	services: { ro: 'Servicii', en: 'Services', bg: 'Услуги' },
	servicesCatalog: {
		ro: 'Catalog servicii',
		en: 'Services catalog',
		bg: 'Каталог услуги',
	},
	servicesCatalogLead: {
		ro: 'Caută și selectează serviciile dorite. Selecția apare imediat pe badge-ul din header.',
		en: 'Search and select the services you need. Your selection updates the header badge immediately.',
		bg: 'Търсете и изберете услуги. Изборът се отразява веднага на баджа в хедъра.',
	},
	selectedServices: {
		ro: 'Servicii selectate',
		en: 'Selected services',
		bg: 'Избрани услуги',
	},
	selectedServicesLead: {
		ro: 'Revizuiește și elimină serviciile din selecție.',
		en: 'Review and remove services from your selection.',
		bg: 'Прегледайте и премахнете услуги от избора си.',
	},
	selectedEmpty: {
		ro: 'Nu ai selectat încă niciun serviciu.',
		en: 'You have not selected any services yet.',
		bg: 'Все още нямате избрани услуги.',
	},
	browseServices: {
		ro: 'Vezi catalogul',
		en: 'Browse catalog',
		bg: 'Към каталога',
	},
	clearAll: {
		ro: 'Golește selecția',
		en: 'Clear selection',
		bg: 'Изчисти избора',
	},
	service: { ro: 'Serviciu', en: 'Service', bg: 'Услуга' },
	price: { ro: 'Preț', en: 'Price', bg: 'Цена' },
	action: { ro: 'Acțiune', en: 'Action', bg: 'Действие' },
	general: { ro: 'General', en: 'General', bg: 'Общи' },
	results: {
		ro: 'rezultate',
		en: 'results',
		bg: 'резултати',
	},
	priceListPdf: {
		ro: 'Listă prețuri (PDF)',
		en: 'Price list (PDF)',
		bg: 'Ценова листа (PDF)',
	},
	prev: { ro: 'Anterior', en: 'Previous', bg: 'Предишна' },
	next: { ro: 'Următor', en: 'Next', bg: 'Следваща' },
} as const;

/** Fold diacritics so "consultatie" matches "consultație". */
export function foldDiacritics(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase();
}

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
