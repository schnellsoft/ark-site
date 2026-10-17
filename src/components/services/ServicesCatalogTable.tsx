'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ServicesCatalog } from './ServicesCards';
import {
	BOOKING_CHANGE_EVENT,
	readSelectedServices,
	setServiceSelected,
} from '../../scripts/booking';
import {
	foldDiacritics,
	pickLocale,
	readDocumentLang,
	ui,
	type Lang,
} from '../../lib/services-ui';
import { LANG_CHANGE_EVENT } from '../../scripts/header/lang';
import './services-catalog.css';

type Row =
	| { kind: 'category'; key: string; categoryId: string; label: string }
	| { kind: 'subcategory'; key: string; categoryId: string; subcategoryId: string; label: string }
	| {
			kind: 'service';
			key: string;
			slug: string;
			title: string;
			price: string;
			currency: string;
			href: string;
	  };

function serviceHref(slug: string, pagePath?: string) {
	const raw = (pagePath || `/services/${slug}`).trim();
	const withSlash = raw.endsWith('/') ? raw : `${raw}/`;
	return withSlash.startsWith('/') ? withSlash : `/${withSlash}`;
}

type Props = {
	catalog: ServicesCatalog;
	/** Base public path for price-list PDFs (`price-list-{lang}.pdf`). */
	pdfHrefBase?: string;
};

function pdfHrefForLang(base: string, lang: Lang): string {
	const clean = base.replace(/\/$/, '');
	return `${clean}/price-list-${lang}.pdf`;
}

export function ServicesCatalogTable({
	catalog,
	pdfHrefBase = '/services',
}: Props) {
	const [lang, setLang] = useState<Lang>('ro');
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [headOffset, setHeadOffset] = useState(120);
	const headRef = useRef<HTMLElement | null>(null);
	const rootRef = useRef<HTMLElement | null>(null);

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

	useEffect(() => {
		const el = headRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const apply = () => {
			const h = Math.ceil(el.getBoundingClientRect().height);
			setHeadOffset(h);
			rootRef.current?.style.setProperty('--svc-head-offset', `${h}px`);
		};
		apply();
		const ro = new ResizeObserver(() => {
			requestAnimationFrame(apply);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [lang, query]);

	const categories = useMemo(
		() =>
			[...(catalog.categories || [])]
				.filter((c) => c.enabled !== false)
				.sort((a, b) => a.position - b.position),
		[catalog.categories],
	);

	const subByCat = useMemo(() => {
		const map = new Map<string, ServicesCatalog['subcategories']>();
		for (const sub of catalog.subcategories || []) {
			if (sub.enabled === false) continue;
			const list = map.get(sub.categoryId) || [];
			list.push(sub);
			map.set(sub.categoryId, list);
		}
		for (const [id, list] of map) {
			map.set(
				id,
				[...list].sort((a, b) => a.position - b.position),
			);
		}
		return map;
	}, [catalog.subcategories]);

	const services = useMemo(
		() => (catalog.services || []).filter((s) => s.enabled !== false),
		[catalog.services],
	);

	const rows = useMemo(() => {
		const q = foldDiacritics(query.trim());
		const out: Row[] = [];

		for (const cat of categories) {
			const catSubs = subByCat.get(cat.id) || [];
			const catServices = services
				.filter((s) => s.categoryId === cat.id)
				.sort((a, b) => a.position - b.position);

			const matchService = (s: (typeof services)[number]) => {
				if (!q) return true;
				const hay = foldDiacritics(
					[
						pickLocale(s.title, lang),
						pickLocale(cat.name, lang),
						s.price,
						s.currency,
					].join(' '),
				);
				return hay.includes(q);
			};

			const matchedDirect = catServices.filter(
				(s) => !s.subcategoryId && matchService(s),
			);

			type SubBlock = {
				subId: string | null;
				label: string;
				items: typeof catServices;
			};
			const blocks: SubBlock[] = [];

			if (catSubs.length === 0) {
				const items = catServices.filter(matchService);
				if (items.length) {
					blocks.push({ subId: null, label: '', items });
				}
			} else {
				if (matchedDirect.length) {
					blocks.push({
						subId: null,
						label: ui('general', lang),
						items: matchedDirect,
					});
				}
				for (const sub of catSubs) {
					const items = catServices.filter(
						(s) => s.subcategoryId === sub.id && matchService(s),
					);
					if (!items.length) continue;
					blocks.push({
						subId: sub.id,
						label: pickLocale(sub.name, lang),
						items,
					});
				}
			}

			if (!blocks.length) continue;

			out.push({
				kind: 'category',
				key: `cat:${cat.id}`,
				categoryId: cat.id,
				label: pickLocale(cat.name, lang),
			});

			for (const block of blocks) {
				if (block.label) {
					out.push({
						kind: 'subcategory',
						key: `sub:${cat.id}:${block.subId ?? 'general'}`,
						categoryId: cat.id,
						subcategoryId: block.subId || 'general',
						label: block.label,
					});
				}
				for (const s of block.items) {
					out.push({
						kind: 'service',
						key: `svc:${s.slug}`,
						slug: s.slug,
						title: pickLocale(s.title, lang),
						price: s.price,
						currency: s.currency,
						href: serviceHref(s.slug, s.pagePath),
					});
				}
			}
		}

		return out;
	}, [categories, subByCat, services, query, lang]);

	const resultCount = useMemo(
		() => rows.filter((r) => r.kind === 'service').length,
		[rows],
	);

	function onToggle(slug: string, next: boolean) {
		setServiceSelected(slug, next);
		setSelected(new Set(readSelectedServices()));
	}

	return (
		<section
			ref={rootRef}
			className="svc-catalog"
			aria-label={ui('servicesCatalog', lang)}
			style={{ ['--svc-head-offset' as string]: `${headOffset}px` }}
		>
			<header ref={headRef} className="svc-catalog__head">
				<div className="svc-catalog__titles">
					<h1 className="svc-catalog__title">{ui('servicesCatalog', lang)}</h1>
					<p className="svc-catalog__lead">{ui('servicesCatalogLead', lang)}</p>
				</div>
				<div className="svc-catalog__toolbar">
					<label className="svc-catalog__search">
						<span className="svc-catalog__search-label">{ui('search', lang)}</span>
						<input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder={ui('searchPlaceholder', lang)}
							autoComplete="off"
							enterKeyHint="search"
						/>
					</label>
					<a
						className="svc-catalog__pdf"
						href={pdfHrefForLang(pdfHrefBase, lang)}
						target="_blank"
						rel="noopener noreferrer"
					>
						<svg
							viewBox="0 0 24 24"
							width="20"
							height="20"
							aria-hidden="true"
							focusable="false"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<path d="M14 2v6h6" />
							<path d="M9 13h6" />
							<path d="M9 17h6" />
						</svg>
						<span>{ui('priceListPdf', lang)}</span>
					</a>
					<p className="svc-catalog__count" aria-live="polite">
						{resultCount} {ui('results', lang)}
					</p>
				</div>
			</header>

			<div className="svc-catalog__table-wrap">
				{resultCount === 0 ? (
					<p className="svc-catalog__empty">{ui('empty', lang)}</p>
				) : (
					<table className="svc-catalog__table">
						<thead>
							<tr>
								<th scope="col">{ui('service', lang)}</th>
								<th scope="col">{ui('price', lang)}</th>
								<th scope="col">{ui('action', lang)}</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => {
								if (row.kind === 'category') {
									return (
										<tr key={row.key} className="svc-catalog__row svc-catalog__row--cat">
											<th scope="colgroup" colSpan={3}>
												{row.label}
											</th>
										</tr>
									);
								}
								if (row.kind === 'subcategory') {
									return (
										<tr key={row.key} className="svc-catalog__row svc-catalog__row--sub">
											<th scope="colgroup" colSpan={3}>
												{row.label}
											</th>
										</tr>
									);
								}
								const on = selected.has(row.slug);
								return (
									<tr
										key={row.key}
										className={`svc-catalog__row svc-catalog__row--svc${on ? ' is-selected' : ''}`}
									>
										<td>
											<a className="svc-catalog__name" href={row.href}>
												{row.title}
											</a>
										</td>
										<td className="svc-catalog__price">
											<span className="svc-catalog__price-val">{row.price}</span>{' '}
											<span className="svc-catalog__price-cur">{row.currency}</span>
										</td>
										<td className="svc-catalog__action">
											<button
												type="button"
												className={`svc-catalog__toggle${on ? ' is-selected' : ''}`}
												aria-pressed={on}
												onClick={() => onToggle(row.slug, !on)}
											>
												{on ? ui('deselect', lang) : ui('select', lang)}
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</section>
	);
}

export default ServicesCatalogTable;
