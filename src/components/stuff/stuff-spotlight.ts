import { getLang, LANG_CHANGE_EVENT, type Lang } from '../../scripts/header/lang';

export type StuffSpotlightPerson = {
	n: string;
	r: string;
	c: string;
	img: string;
	bio: string;
	tags: string[];
	edu: string;
};

export type StuffSpotlightLocalized = {
	n: Record<Lang, string>;
	r: Record<Lang, string>;
	c: string;
	img: string;
	bio: Record<Lang, string>;
	tags: Record<Lang, string[]>;
	edu: string;
};

export type StuffSpotlightConfig = {
	autoplay: boolean;
	delayMs: number;
	stopOnHover: boolean;
	labels: Record<
		Lang,
		{
			title: string;
			pause: string;
			play: string;
		}
	>;
};

const ACCENT_COLORS = [
	'#b8892e',
	'#2a9d8f',
	'#9a6b3a',
	'#7f8f4a',
	'#a0623a',
	'#3f7f8f',
	'#8a7040',
	'#c2956b',
];

export function accentForIndex(i: number): string {
	return ACCENT_COLORS[i % ACCENT_COLORS.length]!;
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
		.slice(0, 3);
}

function pickLocale(map: Record<Lang, string>, lang: Lang): string {
	return (map[lang] || map.ro || map.en || map.bg || '').trim();
}

function localizePerson(
	p: StuffSpotlightLocalized,
	lang: Lang,
): StuffSpotlightPerson {
	return {
		n: pickLocale(p.n, lang),
		r: pickLocale(p.r, lang),
		c: p.c,
		img: p.img,
		bio: pickLocale(p.bio, lang),
		tags: (p.tags[lang] || p.tags.ro || p.tags.en || p.tags.bg || []).filter(
			Boolean,
		),
		edu: p.edu,
	};
}

function portraitHtml(p: StuffSpotlightPerson): string {
	if (p.img) {
		return `<img src="${esc(p.img)}" alt="${esc(p.n)}" loading="lazy" decoding="async">`;
	}
	return `<div class="stuff-spotlight__ph" style="background:linear-gradient(160deg,${esc(p.c)},#121212)"><svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><circle cx="100" cy="70" r="40" fill="#fff"/><path d="M10 200c0-55 40-85 90-85s90 30 90 85z" fill="#fff"/></svg><b>${esc(initials(p.n))}</b></div>`;
}

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

/** Scroll fade-in reveal (requestAnimationFrame), similar spirit to services cards. */
function initScrollReveal(root: HTMLElement): void {
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduce) {
		root.classList.add('is-revealed');
		return;
	}

	const lift = 28;
	const duration = 720;
	root.style.opacity = '0';
	root.style.transform = `translate3d(0, ${lift}px, 0)`;

	let raf = 0;
	const io = new IntersectionObserver(
		([entry]) => {
			if (!entry?.isIntersecting) return;
			io.disconnect();
			const start = performance.now();
			const tick = (now: number) => {
				const t = Math.min(1, (now - start) / duration);
				const e = easeOutCubic(t);
				root.style.opacity = String(e);
				root.style.transform = `translate3d(0, ${(1 - e) * lift}px, 0)`;
				if (t < 1) {
					raf = requestAnimationFrame(tick);
				} else {
					root.classList.add('is-revealed');
					root.style.opacity = '';
					root.style.transform = '';
				}
			};
			raf = requestAnimationFrame(tick);
		},
		{ threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
	);
	io.observe(root);
	(
		root as HTMLElement & { __ssRevealCleanup?: () => void }
	).__ssRevealCleanup = () => {
		io.disconnect();
		if (raf) cancelAnimationFrame(raf);
	};
}

export function initStuffSpotlight(
	root: HTMLElement,
	teamLocalized: StuffSpotlightLocalized[],
	config: StuffSpotlightConfig,
): void {
	if (!teamLocalized.length) return;
	if (root.dataset.ssReady === '1') return;
	root.dataset.ssReady = '1';

	const list = root.querySelector<HTMLElement>('[data-ss-list]');
	const detail = root.querySelector<HTMLElement>('[data-ss-detail]');
	const playBtn = root.querySelector<HTMLButtonElement>('[data-ss-play]');
	const spot = root.querySelector<HTMLElement>('[data-ss-spot]');
	const titleEl = root.querySelector<HTMLElement>('[data-ss-title]');
	if (!list || !detail || !playBtn || !spot) return;

	const delayMs = Math.max(500, Number(config.delayMs) || 3000);
	const delaySec = delayMs / 1000;
	root.style.setProperty('--ss-dur', `${delaySec}s`);

	initScrollReveal(root);

	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	let playing = Boolean(config.autoplay) && !reduce;
	let hover = false;
	let cur = 0;
	let lang: Lang = getLang();

	function team(): StuffSpotlightPerson[] {
		return teamLocalized.map((p) => localizePerson(p, lang));
	}

	function labels() {
		return config.labels[lang] || config.labels.ro;
	}

	function syncChrome() {
		const L = labels();
		if (titleEl) titleEl.textContent = L.title;
		root.setAttribute('aria-label', L.title);
		list!.setAttribute('aria-label', L.title);
		const paused =
			!playing || (config.stopOnHover && hover) || document.hidden;
		list!.classList.toggle('is-paused', paused);
		playBtn!.textContent = playing ? L.pause : L.play;
		playBtn!.setAttribute('aria-pressed', String(playing));
	}

	function rebuildTabs() {
		const people = team();
		list!.innerHTML = people
			.map(
				(p) =>
					`<button type="button" class="stuff-spotlight__tab" role="tab"><span class="stuff-spotlight__mini" style="background:${p.img ? `url('${esc(p.img)}') center/cover` : p.c}">${p.img ? '' : esc(initials(p.n))}</span><span><b>${esc(p.n)}</b><br><small>${esc(p.r)}</small></span></button>`,
			)
			.join('');
		[...list!.children].forEach((b, i) => {
			(b as HTMLElement).onclick = () => show(i);
		});
	}

	function show(i: number) {
		const people = team();
		if (!people.length) return;
		cur = ((i % people.length) + people.length) % people.length;
		const tabs = [...list!.children] as HTMLElement[];
		tabs.forEach((b, j) =>
			b.setAttribute('aria-selected', String(cur === j)),
		);
		const p = people[cur]!;
		detail!.style.animation = 'none';
		void detail!.offsetHeight;
		detail!.style.animation = '';
		detail!.innerHTML = `<div class="stuff-spotlight__info"><h3>${esc(p.n)}</h3><div class="stuff-spotlight__role">${esc(p.r)}</div><p>${esc(p.bio)}</p>${p.edu ? `<p><small>${esc(p.edu)}</small></p>` : ''}<div>${p.tags.map((t) => `<span class="stuff-spotlight__tag">${esc(t)}</span>`).join('')}</div></div><div class="stuff-spotlight__portrait">${portraitHtml(p)}</div>`;

		const b = tabs[cur];
		if (b) {
			b.style.animation = 'none';
			void b.offsetHeight;
			b.style.animation = '';
			requestAnimationFrame(() => {
				list!.scrollTo({
					top: b.offsetTop - (list!.clientHeight - b.offsetHeight) / 2,
					left:
						b.offsetLeft - (list!.clientWidth - b.offsetWidth) / 2,
					behavior: 'smooth',
				});
			});
		}
	}

	list.addEventListener('keydown', (e) => {
		const tabs = [...list.children] as HTMLElement[];
		const i = tabs.findIndex(
			(b) => b.getAttribute('aria-selected') === 'true',
		);
		if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
			e.preventDefault();
			tabs[(i + 1) % tabs.length]?.click();
		}
		if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
			e.preventDefault();
			tabs[(i - 1 + tabs.length) % tabs.length]?.click();
		}
	});

	list.addEventListener('animationend', (e) => {
		if (
			e.animationName === 'stuff-spotlight-prog' &&
			playing &&
			!(config.stopOnHover && hover) &&
			!document.hidden
		) {
			show(cur + 1);
		}
	});

	if (config.stopOnHover) {
		spot.addEventListener('mouseenter', () => {
			hover = true;
			syncChrome();
		});
		spot.addEventListener('mouseleave', () => {
			hover = false;
			syncChrome();
		});
		spot.addEventListener('focusin', () => {
			hover = true;
			syncChrome();
		});
		spot.addEventListener('focusout', () => {
			hover = false;
			syncChrome();
		});
	}

	document.addEventListener('visibilitychange', syncChrome);
	playBtn.onclick = () => {
		playing = !playing;
		if (playing) show(cur);
		syncChrome();
	};

	window.addEventListener(LANG_CHANGE_EVENT, ((ev: CustomEvent<{ lang: Lang }>) => {
		lang = ev.detail?.lang || getLang();
		rebuildTabs();
		show(cur);
		syncChrome();
	}) as EventListener);

	rebuildTabs();
	show(0);
	syncChrome();
}
