import { getLang, LANG_CHANGE_EVENT, type Lang } from '../../scripts/header/lang';

export type TeamCardLocalized = {
	id: string;
	categoryId: string;
	position: number;
	n: Record<Lang, string>;
	r: Record<Lang, string>;
	c: string;
	img: string;
	bio: Record<Lang, string>;
	tags: Record<Lang, string[]>;
	edu: string;
};

export type TeamCategoryLocalized = {
	id: string;
	position: number;
	name: Record<Lang, string>;
};

export type TeamPageConfig = {
	labels: Record<
		Lang,
		{
			title: string;
			lead: string;
		}
	>;
};

function pick(map: Record<Lang, string> | undefined, lang: Lang): string {
	if (!map) return '';
	return (map[lang] || map.ro || map.en || map.bg || '').trim();
}

function esc(s: string): string {
	return String(s).replace(
		/[&<>"]/g,
		(c) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
	);
}

function initials(n: string): string {
	return n
		.replace(/^Dr\.\s*/i, '')
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => w[0] ?? '')
		.join('')
		.slice(0, 3)
		.toUpperCase();
}

function renderCard(person: TeamCardLocalized, lang: Lang): string {
	const name = pick(person.n, lang);
	const role = pick(person.r, lang);
	const bio = pick(person.bio, lang);
	const tags = (person.tags[lang] || person.tags.ro || []).filter(Boolean);
	const portrait = person.img
		? `<img src="${esc(person.img)}" alt="" width="800" height="1000" loading="lazy" decoding="async" />`
		: `<div class="team-card__ph" aria-hidden="true">${esc(initials(name) || '?')}</div>`;

	return `
<article class="team-card is-pending" data-team-card style="--ss-acc:${esc(person.c)}">
  <div class="team-card__body">
    <h3 class="team-card__name">${esc(name)}</h3>
    ${role ? `<p class="team-card__role">${esc(role)}</p>` : ''}
    ${bio ? `<p class="team-card__bio">${esc(bio)}</p>` : ''}
    ${person.edu ? `<p class="team-card__edu">${esc(person.edu)}</p>` : ''}
    ${
			tags.length
				? `<div class="team-card__tags">${tags
						.map((t) => `<span class="team-card__tag">${esc(t)}</span>`)
						.join('')}</div>`
				: ''
		}
  </div>
  <div class="team-card__portrait">${portrait}</div>
</article>`;
}

function supportsScrollDriven(): boolean {
	if (typeof CSS === 'undefined' || !CSS.supports) return false;
	return (
		CSS.supports('animation-timeline: view()') &&
		CSS.supports('animation-range: entry')
	);
}

function initCardReveal(root: HTMLElement): void {
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const cards = [...root.querySelectorAll<HTMLElement>('[data-team-card]')];
	if (reduce || supportsScrollDriven()) {
		cards.forEach((card) => {
			card.classList.remove('is-pending');
			card.classList.add('is-in');
		});
		return;
	}

	const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;

	cards.forEach((card, index) => {
		const io = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				io.disconnect();
				const delay = Math.min(index % 6, 5) * 70;
				window.setTimeout(() => {
					const start = performance.now();
					const duration = 720;
					const lift = 32;
					const tick = (now: number) => {
						const t = Math.min(1, (now - start) / duration);
						const e = easeOutQuint(t);
						card.style.opacity = String(e);
						card.style.transform = `translate3d(0, ${(1 - e) * lift}px, 0)`;
						if (t < 1) {
							requestAnimationFrame(tick);
						} else {
							card.classList.remove('is-pending');
							card.classList.add('is-in');
							card.style.opacity = '';
							card.style.transform = '';
						}
					};
					requestAnimationFrame(tick);
				}, delay);
			},
			{ threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
		);
		io.observe(card);
	});
}

export function initTeamPage(
	root: HTMLElement,
	categories: TeamCategoryLocalized[],
	members: TeamCardLocalized[],
	config: TeamPageConfig,
): void {
	const titleEl = root.querySelector<HTMLElement>('[data-team-title]');
	const leadEl = root.querySelector<HTMLElement>('[data-team-lead]');
	const bodyEl = root.querySelector<HTMLElement>('[data-team-body]');
	if (!bodyEl) return;

	const categoriesOrdered = [...categories].sort(
		(a, b) => (a.position ?? 0) - (b.position ?? 0),
	);

	const byCat = new Map<string, TeamCardLocalized[]>();
	for (const m of members) {
		const list = byCat.get(m.categoryId) ?? [];
		list.push(m);
		byCat.set(m.categoryId, list);
	}
	for (const list of byCat.values()) {
		list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
	}

	function paint(lang: Lang) {
		const labels = config.labels[lang] || config.labels.ro;
		if (titleEl) titleEl.textContent = labels.title;
		if (leadEl) leadEl.textContent = labels.lead;
		root.setAttribute('aria-label', labels.title);

		const sections: string[] = [];
		for (const cat of categoriesOrdered) {
			const people = byCat.get(cat.id) ?? [];
			if (!people.length) continue;
			const catName = pick(cat.name, lang);
			sections.push(`
<section class="team-page__section" data-team-section data-cat-pos="${cat.position}">
  <h2 class="team-page__section-title">${esc(catName)}</h2>
  <div class="team-page__grid">
    ${people.map((p) => renderCard(p, lang)).join('')}
  </div>
</section>`);
		}
		bodyEl!.innerHTML = sections.join('') || '';
		initCardReveal(root);
	}

	paint(getLang());
	window.addEventListener(LANG_CHANGE_EVENT, () => paint(getLang()));
}
