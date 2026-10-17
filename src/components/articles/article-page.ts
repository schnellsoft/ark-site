import { getLang, LANG_CHANGE_EVENT, type Lang } from '../../scripts/header/lang';

export type ArticlePageLocalized = {
	title: Record<Lang, string>;
	body: Record<Lang, string>;
	datetime?: string | null;
};

function pick(map: Record<Lang, string>, lang: Lang): string {
	return (map[lang] || map.ro || map.en || map.bg || '').trim();
}

function hydrateGalleries(root: HTMLElement) {
	root.querySelectorAll<HTMLElement>('.ark-article-gallery').forEach((el) => {
		if (el.dataset.hydrated === '1') return;
		el.dataset.hydrated = '1';
		const slug = el.dataset.gallerySlug;
		const name = el.dataset.galleryName || slug || 'Gallery';
		if (!slug) return;
		const link = el.querySelector('a');
		if (link) {
			link.setAttribute('href', `/gallery/${slug}/`);
			if (!link.textContent?.trim()) link.textContent = name;
		} else {
			el.innerHTML = `<a class="ark-article-gallery__link" href="/gallery/${slug}/">${name}</a>`;
		}
		el.classList.add('is-ready');
	});
}

export function initArticlePage(
	root: HTMLElement,
	data: ArticlePageLocalized,
): void {
	if (root.dataset.apReady === '1') return;
	root.dataset.apReady = '1';

	const titleEl = root.querySelector<HTMLElement>('[data-ap-title]');
	const bodyEl = root.querySelector<HTMLElement>('[data-ap-body]');
	const dateEl = root.querySelector<HTMLElement>('[data-ap-date]');
	if (!bodyEl) return;

	let lang: Lang = getLang();

	function paint() {
		const title = pick(data.title, lang);
		const body = pick(data.body, lang) || pick(data.body, 'ro');
		if (titleEl) titleEl.textContent = title;
		bodyEl!.innerHTML = body;
		hydrateGalleries(bodyEl!);
		if (dateEl) {
			const raw = (data.datetime || '').trim();
			if (raw) {
				dateEl.textContent = raw.slice(0, 10);
				dateEl.removeAttribute('hidden');
			} else {
				dateEl.setAttribute('hidden', '');
			}
		}
		document.title = `${title || 'Article'} · Ark Medical Clinic`;
	}

	paint();

	window.addEventListener(LANG_CHANGE_EVENT, ((ev: CustomEvent<{ lang: Lang }>) => {
		lang = ev.detail?.lang || getLang();
		paint();
	}) as EventListener);
}
