'use client';

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
} from 'react';
import './services-cards.css';
import {
	BOOKING_CHANGE_EVENT,
	readSelectedServices,
	toggleServiceSelection,
} from '../../scripts/booking';
import {
	pickLocale,
	readDocumentLang,
	ui,
	type Lang,
	type LocaleMap,
} from '../../lib/services-ui';
import { LANG_CHANGE_EVENT } from '../../scripts/header/lang';

export type { LocaleMap };

export type ServicesCatalog = {
	recommended: string[];
	categories: Array<{
		id: string;
		slug: string;
		position: number;
		name: LocaleMap;
		iconSvg?: string;
		enabled?: boolean;
	}>;
	subcategories: Array<{
		id: string;
		categoryId: string;
		slug: string;
		position: number;
		name: LocaleMap;
		enabled?: boolean;
	}>;
	services: Array<{
		id: string;
		slug: string;
		position: number;
		title: LocaleMap;
		categoryId: string;
		subcategoryId: string | null;
		price: string;
		currency: string;
		iconSvg: string;
		pagePath: string;
		enabled?: boolean;
	}>;
};

const RECOMMENDED = '__recommended__';
const FLIP_DEG = 180;
const SETTLE_MS = 560;
const REVEAL_MS = 1680;
const REVEAL_LIFT_PX = 40;
const FILTER_FADE_OUT_MS = 280;
const FILTER_FADE_IN_MS = 380;
const CARD_MIN_PX = 240;
const CARD_MIN_H = 200;

function easeFlip(t: number) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeSettle(t: number) {
	return 1 - Math.pow(1 - t, 3);
}

function easeOutCubic(t: number) {
	return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Fold diacritics so "consultatie" matches "consultație" / "Consultație". */
function foldDiacritics(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase();
}

/** Site uses trailingSlash: 'always' — links without `/` 404 in Astro dev. */
function serviceHref(item: { slug: string; pagePath?: string }) {
	const raw = (item.pagePath || `/services/${item.slug}`).trim();
	const withSlash = raw.endsWith('/') ? raw : `${raw}/`;
	return withSlash.startsWith('/') ? withSlash : `/${withSlash}`;
}

type Item = ServicesCatalog['services'][number];

type Layout = { cols: number; rows: number; pageSize: number };

function measureLayout(main: HTMLElement | null): Layout {
	if (!main) return { cols: 1, rows: 1, pageSize: 1 };
	const stage = main.closest('.ct-card-all-stage') as HTMLElement | null;
	const shell = main.closest('.ct-card-all') as HTMLElement | null;
	const styles = getComputedStyle(main);
	const gap = Number.parseFloat(styles.columnGap || styles.gap) || 16;
	const rowGap = Number.parseFloat(styles.rowGap || styles.gap) || gap;
	const width = main.clientWidth || stage?.clientWidth || 0;
	const height =
		stage?.clientHeight ||
		main.clientHeight ||
		(shell
			? shell.clientHeight -
				((shell.querySelector('.ct-card-all-header') as HTMLElement)
					?.offsetHeight ?? 0)
			: 0);
	const minCard =
		Number.parseFloat(styles.getPropertyValue('--ct-card-min-px')) ||
		CARD_MIN_PX;
	const minH =
		Number.parseFloat(styles.getPropertyValue('--ct-card-min-h')) ||
		CARD_MIN_H;
	const cols = Math.max(1, Math.floor((width + gap) / (minCard + gap)));
	const rows = height >= minH * 2 + rowGap ? 2 : 1;
	return { cols, rows, pageSize: Math.max(1, cols * rows) };
}

function chunkRows<T>(list: T[], cols: number): T[][] {
	const c = Math.max(1, cols);
	const rows: T[][] = [];
	for (let i = 0; i < list.length; i += c) {
		rows.push(list.slice(i, i + c));
	}
	return rows.length ? rows : [[]];
}

function angleFromDx(dx: number, width: number) {
	const w = width || 1;
	return Math.max(-FLIP_DEG, Math.min(FLIP_DEG, (dx / w) * 155));
}

function transformForAngle(deg: number) {
	const rad = (deg * Math.PI) / 180;
	const edge = Math.abs(Math.sin(rad));
	const tiltX = Math.sin(rad) * -7;
	const twist = Math.sin(rad) * 2.4;
	const depth = edge * -48;
	const lift = edge * -8;
	const shade = (edge * 0.42).toFixed(3);
	return {
		transform: `translate3d(0, ${lift}px, ${depth}px) rotateX(${tiltX}deg) rotateY(${deg}deg) rotateZ(${twist}deg)`,
		shade,
	};
}

function Face({
	item,
	lang,
	face,
	tabIndex,
	selected,
	onToggle,
}: {
	item: Item | null;
	lang: Lang;
	face: 'front' | 'back';
	tabIndex?: number;
	selected: boolean;
	onToggle: (slug: string) => void;
}) {
	if (!item) {
		return (
			<div className={`ct-card-face ct-card-face--${face}`}>
				<p className="ct-card-empty">{ui('empty', lang)}</p>
			</div>
		);
	}
	const href = serviceHref(item);
	const title = pickLocale(item.title, lang);
	return (
		<div
			className={`ct-card-face ct-card-face--${face}${selected ? ' is-selected' : ''}`}
			data-href={face === 'front' ? href : undefined}
			aria-hidden={face === 'back' ? true : undefined}
		>
			{face === 'front' ? (
				<a
					className="ct-card-nav"
					href={href}
					tabIndex={tabIndex}
					aria-label={title}
					draggable={false}
				/>
			) : null}
			{item.iconSvg ? (
				<div
					className="ct-card-bg"
					dangerouslySetInnerHTML={{ __html: item.iconSvg }}
					aria-hidden="true"
				/>
			) : null}
			<h3 className="ct-card-title">{title}</h3>
			<div className="ct-card-foot">
				<p className="ct-card-price">
					{item.price} <span>{item.currency}</span>
				</p>
				<button
					type="button"
					className={`ct-card-select${selected ? ' is-selected' : ''}`}
					tabIndex={tabIndex}
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						onToggle(item.slug);
					}}
				>
					{selected ? ui('remove', lang) : ui('select', lang)}
				</button>
			</div>
		</div>
	);
}

export function ServicesCards({
	catalog,
	lang: initialLang = 'ro',
}: {
	catalog: ServicesCatalog;
	lang?: Lang;
}) {
	const [lang, setLang] = useState<Lang>(initialLang);
	const [query, setQuery] = useState('');
	const [categoryId, setCategoryId] = useState(RECOMMENDED);
	const [subcategoryId, setSubcategoryId] = useState('');
	const [windowStart, setWindowStart] = useState(0);
	const [layout, setLayout] = useState<Layout>({
		cols: 1,
		rows: 1,
		pageSize: 1,
	});
	const [angle, setAngle] = useState(0);
	const [busy, setBusy] = useState(false);
	const [live, setLive] = useState(false);
	const [dragStep, setDragStep] = useState(0);
	const [revealed, setRevealed] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [pageIntent, setPageIntent] = useState<'keep' | 'start' | 'end'>('keep');

	const sectionRef = useRef<HTMLElement>(null);
	const mainRef = useRef<HTMLDivElement>(null);
	const rafRef = useRef(0);
	const revealRaf = useRef(0);
	const foldRaf = useRef(0);
	const foldingRef = useRef(false);
	const suppressClickRef = useRef(false);
	const swipeRef = useRef<{
		x: number;
		y: number;
		axis: '' | 'x' | 'y';
		angle: number;
		armed: boolean;
		pointerId: number;
	} | null>(null);
	const settleRef = useRef<{
		from: number;
		to: number;
		start: number;
		commit: boolean;
		nextStart: number;
	} | null>(null);

	const categories = useMemo(
		() =>
			[...(catalog.categories || [])]
				.filter((c) => c.enabled !== false)
				.sort((a, b) => a.position - b.position),
		[catalog.categories],
	);

	const categoryCycle = useMemo(
		() => [RECOMMENDED, ...categories.map((c) => c.id)],
		[categories],
	);

	const subsForCategory = useCallback(
		(catId: string) => {
			if (!catId || catId === RECOMMENDED) return [];
			return (catalog.subcategories || [])
				.filter((s) => s.enabled !== false && s.categoryId === catId)
				.sort((a, b) => a.position - b.position);
		},
		[catalog.subcategories],
	);

	const subcategories = useMemo(
		() => subsForCategory(categoryId),
		[subsForCategory, categoryId],
	);

	const subcategoryCycle = useMemo(
		() => subcategories.map((s) => s.id),
		[subcategories],
	);

	const recommendedSet = useMemo(
		() => new Set(catalog.recommended || []),
		[catalog.recommended],
	);

	const items = useMemo(() => {
		const enabled = (catalog.services || []).filter((s) => s.enabled !== false);
		const q = foldDiacritics(query.trim());

		// Active search: entire catalog, current language titles only.
		if (q) {
			return enabled
				.filter((s) =>
					foldDiacritics(pickLocale(s.title, lang)).includes(q),
				)
				.sort((a, b) => a.position - b.position);
		}

		if (categoryId === RECOMMENDED) {
			return enabled
				.filter(
					(s) => recommendedSet.has(s.slug) || recommendedSet.has(s.id),
				)
				.sort((a, b) => {
					const ia = (catalog.recommended || []).indexOf(a.slug);
					const ib = (catalog.recommended || []).indexOf(b.slug);
					return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
				});
		}

		let list = enabled.filter((s) => s.categoryId === categoryId);
		if (subcategoryId) {
			list = list.filter((s) => s.subcategoryId === subcategoryId);
		}
		return [...list].sort((a, b) => a.position - b.position);
	}, [catalog, categoryId, subcategoryId, query, recommendedSet, lang]);

	useEffect(() => {
		setLang(readDocumentLang());
		setSelected(new Set(readSelectedServices()));
		const onLang = (e: Event) => {
			const detail = (e as CustomEvent<{ lang: Lang }>).detail;
			setLang(detail?.lang || readDocumentLang());
		};
		const onBooking = () => setSelected(new Set(readSelectedServices()));
		window.addEventListener(LANG_CHANGE_EVENT, onLang);
		window.addEventListener(BOOKING_CHANGE_EVENT, onBooking);
		window.addEventListener('storage', onBooking);
		return () => {
			window.removeEventListener(LANG_CHANGE_EVENT, onLang);
			window.removeEventListener(BOOKING_CHANGE_EVENT, onBooking);
			window.removeEventListener('storage', onBooking);
		};
	}, []);

	function onToggle(slug: string) {
		toggleServiceSelection(slug);
		setSelected(new Set(readSelectedServices()));
	}

	const pageSize = layout.pageSize;

	const alignStart = useCallback(
		(index: number) => {
			const total = items.length;
			if (!total) return 0;
			const safe = Math.min(Math.max(0, index), total - 1);
			const ps = Math.max(1, pageSize);
			return Math.floor(safe / ps) * ps;
		},
		[items.length, pageSize],
	);

	const sliceAt = useCallback(
		(start: number) => {
			const total = items.length;
			if (!total) return { start: 0, slice: [] as Item[] };
			const aligned = alignStart(start);
			const count = Math.min(pageSize, total - aligned);
			return { start: aligned, slice: items.slice(aligned, aligned + count) };
		},
		[alignStart, items, pageSize],
	);

	const adjacentStart = useCallback(
		(step: number, from = windowStart) => {
			const total = items.length;
			if (!total) return 0;
			const ps = Math.max(1, pageSize);
			if (step > 0) {
				const next = from + sliceAt(from).slice.length;
				return next >= total ? 0 : next;
			}
			if (from > 0) return Math.max(0, from - ps);
			const rem = total % ps;
			return total - (rem || ps);
		},
		[items.length, pageSize, sliceAt, windowStart],
	);

	const current = sliceAt(windowStart);
	const nextSlice = sliceAt(adjacentStart(1));
	const prevSlice = sliceAt(adjacentStart(-1));
	const backSlice =
		dragStep < 0 || angle < 0 ? nextSlice.slice : prevSlice.slice;

	const frontRows = chunkRows(current.slice, layout.cols);
	const backRows = chunkRows(
		Array.from(
			{ length: current.slice.length },
			(_, i) => backSlice[i] ?? current.slice[i]!,
		),
		layout.cols,
	);

	/* Scroll-driven fade-in of the whole module */
	useEffect(() => {
		const el = sectionRef.current;
		if (!el) return;
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) {
			setRevealed(true);
			el.style.opacity = '1';
			el.style.transform = 'none';
			return;
		}

		el.style.opacity = '0';
		el.style.transform = `translate3d(0, ${REVEAL_LIFT_PX}px, 0)`;

		const io = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				io.disconnect();
				const start = performance.now();
				const tick = (now: number) => {
					const t = Math.min(1, (now - start) / REVEAL_MS);
					const e = easeOutCubic(t);
					el.style.opacity = String(e);
					el.style.transform = `translate3d(0, ${(1 - e) * REVEAL_LIFT_PX}px, 0)`;
					if (t < 1) {
						revealRaf.current = requestAnimationFrame(tick);
					} else {
						setRevealed(true);
						el.style.opacity = '';
						el.style.transform = '';
					}
				};
				revealRaf.current = requestAnimationFrame(tick);
			},
			{ threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
		);
		io.observe(el);
		return () => {
			io.disconnect();
			if (revealRaf.current) cancelAnimationFrame(revealRaf.current);
		};
	}, []);

	useEffect(() => {
		const el = mainRef.current;
		if (!el) return;
		const apply = () => {
			const next = measureLayout(el);
			setLayout((prev) =>
				prev.cols === next.cols &&
				prev.rows === next.rows &&
				prev.pageSize === next.pageSize
					? prev
					: next,
			);
		};
		apply();
		const ro = new ResizeObserver(() => {
			requestAnimationFrame(apply);
		});
		ro.observe(el);
		const stage = el.closest('.ct-card-all-stage');
		if (stage) ro.observe(stage);
		window.addEventListener('resize', apply);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', apply);
		};
	}, []);

	useEffect(() => {
		if (pageIntent === 'start') {
			setWindowStart(0);
			setPageIntent('keep');
		} else if (pageIntent === 'end') {
			const total = items.length;
			const ps = Math.max(1, pageSize);
			const rem = total % ps;
			setWindowStart(total ? total - (rem || ps) : 0);
			setPageIntent('keep');
		} else {
			setWindowStart((s) => alignStart(s));
		}
		setAngle(0);
		setLive(false);
		setDragStep(0);
		suppressClickRef.current = false;
		// Keep busy while a filter fade is running; otherwise clear.
		if (!foldingRef.current) setBusy(false);
	}, [categoryId, subcategoryId, query, pageSize, alignStart, items.length, pageIntent]);

	const stopLoop = () => {
		if (rafRef.current) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = 0;
		}
		settleRef.current = null;
	};

	const animateFilterChange = useCallback((apply: () => void) => {
		const el = mainRef.current;
		const reduced =
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (!el || reduced) {
			apply();
			return;
		}

		if (foldRaf.current) cancelAnimationFrame(foldRaf.current);
		foldingRef.current = true;
		setBusy(true);
		el.classList.add('is-filter-fading');

		const startOut = performance.now();
		const fadeOut = (now: number) => {
			const t = Math.min(1, (now - startOut) / FILTER_FADE_OUT_MS);
			el.style.opacity = String(1 - easeInOutCubic(t));
			if (t < 1) {
				foldRaf.current = requestAnimationFrame(fadeOut);
				return;
			}

			apply();

			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					const startIn = performance.now();
					const fadeIn = (nowIn: number) => {
						const tIn = Math.min(
							1,
							(nowIn - startIn) / FILTER_FADE_IN_MS,
						);
						el.style.opacity = String(easeInOutCubic(tIn));
						if (tIn < 1) {
							foldRaf.current = requestAnimationFrame(fadeIn);
							return;
						}
						el.style.opacity = '';
						el.classList.remove('is-filter-fading');
						foldingRef.current = false;
						setBusy(false);
						foldRaf.current = 0;
					};
					foldRaf.current = requestAnimationFrame(fadeIn);
				});
			});
		};

		foldRaf.current = requestAnimationFrame(fadeOut);
	}, []);

	const switchCategory = useCallback(
		(step: number) => {
			if (categoryCycle.length < 2) return false;
			const idx = categoryCycle.indexOf(categoryId);
			const from = idx < 0 ? 0 : idx;
			const next =
				categoryCycle[(from + step + categoryCycle.length) % categoryCycle.length];
			if (!next || next === categoryId) return false;
			const nextSubs = subsForCategory(next);
			const nextSub =
				nextSubs.length === 0
					? ''
					: step > 0
						? nextSubs[0]!.id
						: nextSubs[nextSubs.length - 1]!.id;
			animateFilterChange(() => {
				setPageIntent(step > 0 ? 'start' : 'end');
				setCategoryId(next);
				setSubcategoryId(nextSub);
				suppressClickRef.current = false;
			});
			return true;
		},
		[animateFilterChange, categoryCycle, categoryId, subsForCategory],
	);

	const switchSubcategory = useCallback(
		(step: number) => {
			if (categoryId === RECOMMENDED || subcategoryCycle.length === 0) {
				return false;
			}
			// "All" is manual-only; auto-nav stays on concrete subcategories.
			if (!subcategoryId) return false;

			const idx = subcategoryCycle.indexOf(subcategoryId);
			if (idx < 0) return false;
			const nextIdx = idx + step;
			if (nextIdx < 0 || nextIdx >= subcategoryCycle.length) {
				return switchCategory(step);
			}

			animateFilterChange(() => {
				setPageIntent(step > 0 ? 'start' : 'end');
				setSubcategoryId(subcategoryCycle[nextIdx]!);
				suppressClickRef.current = false;
			});
			return true;
		},
		[
			animateFilterChange,
			categoryId,
			subcategoryCycle,
			subcategoryId,
			switchCategory,
		],
	);

	const commute = useCallback(
		(step: number) => switchSubcategory(step) || switchCategory(step),
		[switchCategory, switchSubcategory],
	);

	const finishFlip = useCallback(
		(nextStart: number) => {
			setWindowStart(alignStart(nextStart));
			setAngle(0);
			setBusy(false);
			setLive(false);
			setDragStep(0);
			settleRef.current = null;
			suppressClickRef.current = false;
		},
		[alignStart],
	);

	const startSettle = useCallback(
		(from: number, to: number, commit: boolean, nextStart: number) => {
			stopLoop();
			settleRef.current = {
				from,
				to,
				start: performance.now(),
				commit,
				nextStart,
			};
			setBusy(true);
			setLive(true);

			const tick = (now: number) => {
				const s = settleRef.current;
				if (!s) return;
				const duration = s.commit ? SETTLE_MS : 280;
				const t = Math.min(1, (now - s.start) / duration);
				const eased = s.commit ? easeFlip(t) : easeSettle(t);
				const a = s.from + (s.to - s.from) * eased;
				setAngle(a);

				if (t < 1) {
					rafRef.current = requestAnimationFrame(tick);
					return;
				}

				if (s.commit) {
					finishFlip(s.nextStart);
				} else {
					setAngle(0);
					setBusy(false);
					setLive(false);
					setDragStep(0);
					settleRef.current = null;
					suppressClickRef.current = false;
				}
			};
			rafRef.current = requestAnimationFrame(tick);
		},
		[finishFlip],
	);

	const go = useCallback(
		(step: number) => {
			if (busy) return;

			const total = items.length;
			const atEnd =
				step > 0 &&
				(total <= pageSize ||
					windowStart + sliceAt(windowStart).slice.length >= total);
			const atStart = step < 0 && windowStart <= 0;

			if (atEnd || atStart) {
				if (commute(step)) return;
				if (total <= pageSize) return;
			}

			if (total <= pageSize) return;

			const nextStart = adjacentStart(step);
			if (nextStart === windowStart) {
				if (commute(step)) return;
				return;
			}

			// Crossing the list wrap boundary → commute subcategory / category.
			if (step > 0 && nextStart === 0 && windowStart > 0) {
				if (commute(1)) return;
			}
			if (step < 0 && nextStart > windowStart) {
				if (commute(-1)) return;
			}

			suppressClickRef.current = true;
			setDragStep(step);
			setBusy(true);
			setLive(true);
			setAngle(0);
			const target = step > 0 ? -FLIP_DEG : FLIP_DEG;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					startSettle(0, target, true, nextStart);
				});
			});
		},
		[
			adjacentStart,
			busy,
			commute,
			items.length,
			pageSize,
			sliceAt,
			startSettle,
			windowStart,
		],
	);

	const prefersReduced =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const onPointerDown = (e: ReactPointerEvent) => {
		if (busy) return;
		if ((e.target as HTMLElement).closest('.ct-card-select')) return;
		suppressClickRef.current = false;
		swipeRef.current = {
			x: e.clientX,
			y: e.clientY,
			axis: '',
			angle: 0,
			armed: false,
			pointerId: e.pointerId,
		};
		// Defer capture until a horizontal swipe is confirmed so taps still
		// deliver click to the card face and can navigate.
	};

	const onPointerMove = (e: ReactPointerEvent) => {
		const swipe = swipeRef.current;
		if (!swipe || busy) return;
		const dx = e.clientX - swipe.x;
		const dy = e.clientY - swipe.y;
		if (!swipe.axis) {
			if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
			swipe.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
			if (swipe.axis === 'x') {
				if (
					items.length <= pageSize &&
					categoryCycle.length < 2 &&
					subcategoryCycle.length < 2
				) {
					swipe.axis = 'y';
					return;
				}
				setLive(true);
				setDragStep(dx < 0 ? 1 : -1);
				swipe.armed = true;
				mainRef.current?.setPointerCapture?.(swipe.pointerId);
			}
		}
		if (swipe.axis !== 'x') return;
		e.preventDefault();
		const width = mainRef.current?.clientWidth || 320;
		const a = angleFromDx(dx, width / Math.max(1, layout.cols));
		swipe.angle = a;
		setDragStep(a < 0 ? 1 : a > 0 ? -1 : 0);
		setAngle(a);
	};

	const onPointerUp = () => {
		const swipe = swipeRef.current;
		swipeRef.current = null;
		if (swipe?.armed) {
			try {
				mainRef.current?.releasePointerCapture?.(swipe.pointerId);
			} catch {
				/* already released */
			}
		}

		if (!swipe || swipe.axis !== 'x') {
			setAngle(0);
			setLive(false);
			setDragStep(0);
			return;
		}
		const a = swipe.angle;
		if (prefersReduced) {
			if (Math.abs(a) > 40) {
				suppressClickRef.current = true;
				go(a < 0 ? 1 : -1);
			} else {
				setAngle(0);
				setLive(false);
				setDragStep(0);
				suppressClickRef.current = false;
			}
			return;
		}
		if (Math.abs(a) >= 70) {
			const step = a < 0 ? 1 : -1;
			const total = items.length;
			const wouldWrap =
				(step > 0 &&
					windowStart + sliceAt(windowStart).slice.length >= total) ||
				(step < 0 && windowStart <= 0);
			if (wouldWrap && commute(step)) {
				setAngle(0);
				setLive(false);
				setDragStep(0);
				suppressClickRef.current = false;
				return;
			}
			const nextStart = adjacentStart(step);
			if (step > 0 && nextStart === 0 && windowStart > 0 && commute(1)) {
				setAngle(0);
				setLive(false);
				setDragStep(0);
				suppressClickRef.current = false;
				return;
			}
			if (step < 0 && nextStart > windowStart && commute(-1)) {
				setAngle(0);
				setLive(false);
				setDragStep(0);
				suppressClickRef.current = false;
				return;
			}
			suppressClickRef.current = true;
			startSettle(a, step > 0 ? -FLIP_DEG : FLIP_DEG, true, nextStart);
		} else {
			suppressClickRef.current = false;
			startSettle(a, 0, false, windowStart);
		}
	};

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
				return;
			if (
				event.target instanceof Element &&
				event.target.closest(
					'input, textarea, select, button, a, [contenteditable="true"]',
				)
			) {
				return;
			}
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				go(-1);
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				go(1);
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [go]);

	useEffect(
		() => () => {
			stopLoop();
			if (foldRaf.current) cancelAnimationFrame(foldRaf.current);
		},
		[],
	);

	const pose = transformForAngle(angle);
	const showNav =
		items.length > pageSize ||
		categoryCycle.length > 1 ||
		subcategoryCycle.length > 1;
	const positionLabel = items.length
		? `${Math.min(windowStart + 1, items.length)}–${Math.min(
				windowStart + current.slice.length,
				items.length,
			)} / ${items.length}`
		: '0 / 0';

	return (
		<section
			ref={sectionRef}
			className={`ct-demo${revealed ? ' is-revealed' : ''}`}
			aria-label={ui('services', lang)}
			id="services"
		>
			<div className="ct-card-all">
				<div className="ct-card-all-header">
					<div className="ct-card-all-header-controls">
						<div className="ct-card-all-search">
							<label className="ct-field-label" htmlFor="ct-search-input">
								{ui('search', lang)}
							</label>
							<div className="ct-search-row">
								<input
									id="ct-search-input"
									className="ct-search-input"
									type="search"
									placeholder={ui('searchPlaceholder', lang)}
									autoComplete="off"
									spellCheck={false}
									value={query}
									onChange={(e) => setQuery(e.target.value)}
								/>
							</div>
						</div>
						<div className="ct-card-all-combo">
							<label className="ct-field-label" htmlFor="ct-combo-category">
								{ui('category', lang)}
							</label>
							<select
								id="ct-combo-category"
								className="ct-combo"
								value={categoryId}
								onChange={(e) => {
									const next = e.target.value;
									if (next === categoryId) return;
									const nextSubs = subsForCategory(next);
									animateFilterChange(() => {
										setCategoryId(next);
										setSubcategoryId(nextSubs[0]?.id ?? '');
										setPageIntent('start');
									});
								}}
							>
								<option value={RECOMMENDED}>{ui('recommended', lang)}</option>
								{categories.map((c) => (
									<option key={c.id} value={c.id}>
										{pickLocale(c.name, lang)}
									</option>
								))}
							</select>
						</div>
						<div className="ct-card-all-combo">
							<label className="ct-field-label" htmlFor="ct-combo-subcategory">
								{ui('subcategory', lang)}
							</label>
							<select
								id="ct-combo-subcategory"
								className="ct-combo"
								value={subcategoryId}
								disabled={!subcategories.length}
								onChange={(e) => {
									const next = e.target.value;
									if (next === subcategoryId) return;
									animateFilterChange(() => {
										setSubcategoryId(next);
										setPageIntent('start');
									});
								}}
							>
								<option value="">
									{subcategories.length ? ui('allSubcategories', lang) : '—'}
								</option>
								{subcategories.map((s) => (
									<option key={s.id} value={s.id}>
										{pickLocale(s.name, lang)}
									</option>
								))}
							</select>
						</div>
					</div>
					<div className="ct-card-all-header-position">
						<p className="ct-nav-position" role="status" aria-live="polite">
							{positionLabel}
						</p>
					</div>
				</div>

				<div className="ct-card-all-stage">
					<button
						type="button"
						className="ct-nav-btn ct-nav-btn--prev"
						aria-label={ui('prev', lang)}
						disabled={!showNav || busy}
						onClick={() => go(-1)}
					>
						<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path
								d="M14.5 6.5 9 12l5.5 5.5 1.4-1.4L11.8 12 15.9 7.9 14.5 6.5Z"
								fill="currentColor"
							/>
						</svg>
					</button>

					<div
						ref={mainRef}
						className={`ct-card-all-main${live || busy ? ' is-swiping' : ''}`}
						data-rows={layout.rows}
						data-cols={layout.cols}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={onPointerUp}
					>
						{frontRows.map((row, rowIndex) => (
							<div className="ct-card-row" key={`row-${rowIndex}`}>
								{row.map((front, colIndex) => {
									const flatIndex = rowIndex * layout.cols + colIndex;
									const back =
										backRows[rowIndex]?.[colIndex] ??
										backSlice[flatIndex] ??
										front;
									return (
										<div
											key={front.id}
											className="ct-card"
											style={
												{
													'--ct-shade': pose.shade,
												} as CSSProperties
											}
										>
											<div
												className={
													live
														? 'ct-card-inner ct-card-inner-live'
														: 'ct-card-inner'
												}
												style={{
													transform:
														live || angle ? pose.transform : undefined,
												}}
											>
												<Face
													item={front}
													lang={lang}
													face="front"
													tabIndex={0}
													selected={selected.has(front.slug)}
													onToggle={onToggle}
												/>
												<Face
													item={back}
													lang={lang}
													face="back"
													tabIndex={-1}
													selected={selected.has(back.slug)}
													onToggle={onToggle}
												/>
											</div>
										</div>
									);
								})}
							</div>
						))}
					</div>

					<button
						type="button"
						className="ct-nav-btn ct-nav-btn--next"
						aria-label={ui('next', lang)}
						disabled={!showNav || busy}
						onClick={() => go(1)}
					>
						<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path
								d="M9.5 6.5 15 12l-5.5 5.5-1.4-1.4L12.2 12 8.1 7.9 9.5 6.5Z"
								fill="currentColor"
							/>
						</svg>
					</button>
				</div>
			</div>
		</section>
	);
}
