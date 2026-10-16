import { getLang, LANG_CHANGE_EVENT, type Lang } from '../../scripts/header/lang';

export type ArticleSnippetItem = {
	id: string;
	href: string;
	title: Record<Lang, string>;
	date: string;
	text: Record<Lang, string>;
	img: string;
};

export type ArticleSnippetsConfig = {
	labels: Record<Lang, { section: string }>;
};

function pick(map: Record<Lang, string>, lang: Lang): string {
	return (map[lang] || map.ro || map.en || map.bg || '').trim();
}

function esc(s: string): string {
	return String(s).replace(
		/[&<>"]/g,
		(c) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
	);
}

function easeOutQuint(t: number): number {
	return 1 - (1 - t) ** 5;
}

/** Lazier scroll reveal than spotlight — longer, softer lift. */
function initLazyReveal(root: HTMLElement): void {
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduce) {
		root.classList.add('is-revealed');
		root
			.querySelectorAll<HTMLElement>('[data-as-card]')
			.forEach((card) => card.classList.add('is-in'));
		return;
	}

	root.style.opacity = '0';
	root.style.transform = 'translate3d(0, 40px, 0)';

	let sectionRaf = 0;
	const sectionIo = new IntersectionObserver(
		([entry]) => {
			if (!entry?.isIntersecting) return;
			sectionIo.disconnect();
			const start = performance.now();
			const duration = 1100;
			const lift = 40;
			const tick = (now: number) => {
				const t = Math.min(1, (now - start) / duration);
				const e = easeOutQuint(t);
				root.style.opacity = String(e);
				root.style.transform = `translate3d(0, ${(1 - e) * lift}px, 0)`;
				if (t < 1) {
					sectionRaf = requestAnimationFrame(tick);
				} else {
					root.classList.add('is-revealed');
					root.style.opacity = '';
					root.style.transform = '';
				}
			};
			sectionRaf = requestAnimationFrame(tick);
		},
		{ threshold: 0.08, rootMargin: '0px 0px -8% 0px' },
	);
	sectionIo.observe(root);

	const cards = [
		...root.querySelectorAll<HTMLElement>('[data-as-card]'),
	];
	cards.forEach((card, index) => {
		card.style.opacity = '0';
		card.style.transform = 'translate3d(0, 36px, 0)';
		const cardIo = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				cardIo.disconnect();
				const delay = index * 120;
				window.setTimeout(() => {
					const start = performance.now();
					const duration = 980;
					const lift = 36;
					const tick = (now: number) => {
						const t = Math.min(1, (now - start) / duration);
						const e = easeOutQuint(t);
						card.style.opacity = String(e);
						card.style.transform = `translate3d(0, ${(1 - e) * lift}px, 0)`;
						if (t < 1) {
							requestAnimationFrame(tick);
						} else {
							card.classList.add('is-in');
							card.style.opacity = '';
							card.style.transform = '';
						}
					};
					requestAnimationFrame(tick);
				}, delay);
			},
			{ threshold: 0.14, rootMargin: '0px 0px -4% 0px' },
		);
		cardIo.observe(card);
	});

	(
		root as HTMLElement & { __asCleanup?: () => void }
	).__asCleanup = () => {
		sectionIo.disconnect();
		if (sectionRaf) cancelAnimationFrame(sectionRaf);
	};
}

function renderCard(item: ArticleSnippetItem, lang: Lang): string {
	const title = pick(item.title, lang);
	const text = pick(item.text, lang);
	const date = item.date || '';
	const img = item.img
		? `<img class="article-snippets__img" src="${esc(item.img)}" alt="" loading="lazy" decoding="async">`
		: `<div class="article-snippets__ph" aria-hidden="true"></div>`;

	return `<article class="article-snippets__card" data-as-card>
  <a class="article-snippets__link" href="${esc(item.href)}">
    <h3 class="article-snippets__card-title" data-as-title>${esc(title)}</h3>
    <div class="article-snippets__body">
      <div class="article-snippets__media">${img}</div>
      <div class="article-snippets__copy">
        ${date ? `<time class="article-snippets__date" data-as-date datetime="${esc(date)}">${esc(date)}</time>` : `<span class="article-snippets__date is-empty" data-as-date></span>`}
        <p class="article-snippets__text" data-as-text>${esc(text)}</p>
      </div>
    </div>
  </a>
</article>`;
}

export function initArticleSnippets(
	root: HTMLElement,
	items: ArticleSnippetItem[],
	config: ArticleSnippetsConfig,
): void {
	if (!items.length) return;
	if (root.dataset.asReady === '1') return;
	root.dataset.asReady = '1';

	const list = root.querySelector<HTMLElement>('[data-as-list]');
	const heading = root.querySelector<HTMLElement>('[data-as-heading]');
	if (!list) return;

	let lang: Lang = getLang();

	function paint() {
		const L = config.labels[lang] || config.labels.ro;
		if (heading) heading.textContent = L.section;
		root.setAttribute('aria-label', L.section);
		list!.innerHTML = items.map((item) => renderCard(item, lang)).join('');
	}

	function applyLangOnly() {
		const cards = [...list!.querySelectorAll<HTMLElement>('[data-as-card]')];
		cards.forEach((card, i) => {
			const item = items[i];
			if (!item) return;
			const title = card.querySelector('[data-as-title]');
			const text = card.querySelector('[data-as-text]');
			if (title) title.textContent = pick(item.title, lang);
			if (text) text.textContent = pick(item.text, lang);
		});
		const L = config.labels[lang] || config.labels.ro;
		if (heading) heading.textContent = L.section;
		root.setAttribute('aria-label', L.section);
	}

	paint();
	initLazyReveal(root);

	window.addEventListener(LANG_CHANGE_EVENT, ((ev: CustomEvent<{ lang: Lang }>) => {
		lang = ev.detail?.lang || getLang();
		applyLangOnly();
	}) as EventListener);
}
