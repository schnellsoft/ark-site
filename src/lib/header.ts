export type Lang = 'ro' | 'bg' | 'en';

export type I18nString = string | Partial<Record<Lang, string>>;

export type LogoEntry = {
	type: 'image' | 'svg';
	src?: string;
	svg?: string;
};

export type HeaderLogoData = {
	logo_min: LogoEntry;
	logo_max: LogoEntry;
};

export type MenuItem = {
	name?: string;
	label?: I18nString;
	description?: string;
	'aria-label'?: string;
	link?: string;
	color?: string;
	'color-hover'?: string;
	items?: MenuItem[];
};

export type HeaderMenuData = {
	more?: boolean;
	'moreList'?: boolean;
	'max-width'?: string | number;
	color?: string;
	'color-hover'?: string;
	baseline?: string;
	menu?: MenuItem[];
};

export type IconItem = {
	name?: string;
	label?: I18nString;
	description?: string;
	'aria-label'?: string;
	link?: string;
	color?: string;
	'color-hover'?: string;
};

export type HeaderIconsData = {
	more?: boolean;
	'moreList'?: boolean;
	'max-width'?: string | number;
	color?: string;
	'color-hover'?: string;
	baseline?: string;
	icons?: IconItem[];
};

/**
 * CMS icon names → sprite symbol ids.
 * Prefer matching symbol ids in public/header/sprite.svg (email, whatsap, xtwitter, phone-in, …).
 * Aliases remain for legacy / alternate spellings.
 */
const ICON_ALIASES: Record<string, string> = {
	whatsapp: 'whatsapp',
	whatsap: 'whatsap',
	twitter: 'twitter',
	xtwitter: 'xtwitter',
	phonecall: 'phonecall',
	'phone-in': 'phone-in',
	email: 'email',
};

export function resolveLangLabel(value: I18nString | undefined, lang: Lang, fallback = ''): string {
	if (typeof value === 'string') return value.trim() || fallback;
	if (!value || typeof value !== 'object') return fallback;
	const direct = value[lang]?.trim();
	if (direct) return direct;
	for (const key of ['ro', 'en', 'bg'] as Lang[]) {
		const v = value[key]?.trim();
		if (v) return v;
	}
	return fallback;
}

export function cssMaxWidth(raw: string | number | undefined): string {
	if (raw === undefined || raw === null || raw === '') return '';
	const value = String(raw).trim();
	if (!value) return '';
	if (/^\d+(\.\d+)?$/.test(value)) return `${value}px`;
	return value;
}

export function spriteId(name: string | undefined): string {
	const key = (name ?? '').trim();
	if (!key) return '';
	return ICON_ALIASES[key] ?? key;
}

export function moreEnabled(data: { more?: boolean; moreList?: boolean } | undefined): boolean {
	if (!data) return true;
	if (typeof data.more === 'boolean') return data.more;
	if (typeof data.moreList === 'boolean') return data.moreList;
	return true;
}

/** Absolute public URL for a media key synced under src/assets/media — used only after Image import. */
export function mediaAssetPath(key: string): string {
	return key.replace(/^\/+/, '');
}
