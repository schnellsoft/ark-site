'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import './services-cards.css';

export type LocaleMap = { ro?: string; en?: string; bg?: string };

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

function label(map: LocaleMap | undefined, lang: string) {
	if (!map) return '';
	return (
		(map as Record<string, string>)[lang] ||
		map.ro ||
		map.en ||
		map.bg ||
		''
	);
}

type Item = ServicesCatalog['services'][number];

export function ServicesCards({
	catalog,
	lang = 'ro',
}: {
	catalog: ServicesCatalog;
	lang?: string;
}) {
	const [query, setQuery] = useState('');
	const [categoryId, setCategoryId] = useState(RECOMMENDED);
	const [subcategoryId, setSubcategoryId] = useState('');
	const [index, setIndex] = useState(0);
	const [angle, setAngle] = useState(0);
	const [busy, setBusy] = useState(false);
	const innerRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{ x: number; armed: boolean } | null>(null);

	const categories = useMemo(
		() =>
			[...(catalog.categories || [])]
				.filter((c) => c.enabled !== false)
				.sort((a, b) => a.position - b.position),
		[catalog.categories],
	);

	const subcategories = useMemo(
		() =>
			(catalog.subcategories || []).filter(
				(s) =>
					s.enabled !== false &&
					categoryId !== RECOMMENDED &&
					s.categoryId === categoryId,
			),
		[catalog.subcategories, categoryId],
	);

	const recommendedSet = useMemo(
		() => new Set(catalog.recommended || []),
		[catalog.recommended],
	);

	const items = useMemo(() => {
		const q = query.trim().toLowerCase();
		let list = (catalog.services || []).filter((s) => s.enabled !== false);
		if (categoryId === RECOMMENDED) {
			list = list
				.filter((s) => recommendedSet.has(s.slug) || recommendedSet.has(s.id))
				.sort((a, b) => {
					const ia = (catalog.recommended || []).indexOf(a.slug);
					const ib = (catalog.recommended || []).indexOf(b.slug);
					return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
				});
		} else {
			list = list.filter((s) => s.categoryId === categoryId);
			if (subcategoryId) {
				list = list.filter((s) => s.subcategoryId === subcategoryId);
			}
			list = [...list].sort((a, b) => a.position - b.position);
		}
		if (q) {
			list = list.filter((s) =>
				`${label(s.title, lang)} ${s.slug} ${s.price}`
					.toLowerCase()
					.includes(q),
			);
		}
		return list;
	}, [catalog, categoryId, subcategoryId, query, recommendedSet, lang]);

	useEffect(() => {
		setIndex(0);
		setAngle(0);
	}, [categoryId, subcategoryId, query]);

	useEffect(() => {
		if (index >= items.length) setIndex(0);
	}, [items.length, index]);

	const current = items[index] ?? null;
	const nextItem = items.length
		? items[(index + 1) % items.length]
		: null;
	const prevItem = items.length
		? items[(index - 1 + items.length) % items.length]
		: null;

	function go(delta: number) {
		if (busy || items.length < 2) return;
		const dir = delta < 0 ? -1 : 1;
		setBusy(true);
		const target = dir * 180;
		const start = performance.now();
		const from = angle;
		const duration = 560;

		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			const eased =
				t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
			const a = from + (target - from) * eased;
			setAngle(a);
			if (t < 1) {
				requestAnimationFrame(tick);
			} else {
				setIndex((i) => (i + dir + items.length) % items.length);
				setAngle(0);
				setBusy(false);
			}
		};
		requestAnimationFrame(tick);
	}

	function onPointerDown(e: React.PointerEvent) {
		if (busy || items.length < 2) return;
		dragRef.current = { x: e.clientX, armed: true };
		(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
	}

	function onPointerMove(e: React.PointerEvent) {
		const d = dragRef.current;
		if (!d?.armed || busy) return;
		const dx = e.clientX - d.x;
		const width = innerRef.current?.parentElement?.clientWidth || 320;
		setAngle(Math.max(-180, Math.min(180, (dx / width) * 155)));
	}

	function onPointerUp() {
		const d = dragRef.current;
		dragRef.current = null;
		if (!d || busy) return;
		if (angle > 70) go(-1);
		else if (angle < -70) go(1);
		else {
			const start = performance.now();
			const from = angle;
			const tick = (now: number) => {
				const t = Math.min(1, (now - start) / 280);
				const eased = 1 - Math.pow(1 - t, 3);
				setAngle(from * (1 - eased));
				if (t < 1) requestAnimationFrame(tick);
				else setAngle(0);
			};
			requestAnimationFrame(tick);
		}
	}

	function openService(item: Item | null, e?: React.MouseEvent) {
		if (!item) return;
		if (e && (e.target as HTMLElement).closest('a,button')) return;
		window.location.href = item.pagePath || `/services/${item.slug}`;
	}

	function Face({ item, face }: { item: Item | null; face: 'front' | 'back' }) {
		if (!item) {
			return (
				<div className={`svc-card-face svc-card-face--${face}`}>
					<p className="svc-card-empty">Nu sunt servicii</p>
				</div>
			);
		}
		return (
			<div
				className={`svc-card-face svc-card-face--${face}`}
				onClick={(e) => openService(item, e)}
				role="link"
				tabIndex={face === 'front' ? 0 : -1}
				onKeyDown={(e) => {
					if (e.key === 'Enter') openService(item);
				}}
			>
				<div
					className="svc-card-icon"
					dangerouslySetInnerHTML={{ __html: item.iconSvg || '' }}
					aria-hidden="true"
				/>
				<h3 className="svc-card-title">{label(item.title, lang)}</h3>
				<p className="svc-card-price">
					{item.price} <span>{item.currency}</span>
				</p>
				<a
					className="svc-card-cta"
					href={item.pagePath || `/services/${item.slug}`}
					onClick={(e) => e.stopPropagation()}
				>
					Detalii
				</a>
			</div>
		);
	}

	const showBack = angle !== 0;
	const backItem = angle < 0 ? nextItem : prevItem;

	return (
		<section className="svc-cards" aria-label="Servicii">
			<header className="svc-cards-header">
				<h2 className="svc-cards-heading">Servicii</h2>
				<div className="svc-cards-filters">
					<input
						type="search"
						className="svc-cards-search"
						placeholder="Caută serviciu…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<select
						className="svc-cards-select"
						value={categoryId}
						onChange={(e) => {
							setCategoryId(e.target.value);
							setSubcategoryId('');
						}}
					>
						<option value={RECOMMENDED}>Servicii recomandate</option>
						{categories.map((c) => (
							<option key={c.id} value={c.id}>
								{label(c.name, lang)}
							</option>
						))}
					</select>
					{subcategories.length ? (
						<select
							className="svc-cards-select"
							value={subcategoryId}
							onChange={(e) => setSubcategoryId(e.target.value)}
						>
							<option value="">Toate subcategoriile</option>
							{subcategories.map((s) => (
								<option key={s.id} value={s.id}>
									{label(s.name, lang)}
								</option>
							))}
						</select>
					) : null}
				</div>
			</header>

			<div className="svc-cards-stage">
				<button
					type="button"
					className="svc-nav svc-nav--prev"
					aria-label="Anterior"
					disabled={busy || items.length < 2}
					onClick={() => go(-1)}
				>
					‹
				</button>

				<div
					className="svc-card"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				>
					<div
						ref={innerRef}
						className="svc-card-inner"
						style={{
							transform: `rotateY(${angle}deg)`,
						}}
						data-live={showBack ? '1' : '0'}
					>
						<Face item={current} face="front" />
						<Face item={showBack ? backItem : nextItem} face="back" />
					</div>
				</div>

				<button
					type="button"
					className="svc-nav svc-nav--next"
					aria-label="Următor"
					disabled={busy || items.length < 2}
					onClick={() => go(1)}
				>
					›
				</button>
			</div>

			<p className="svc-cards-meta" aria-live="polite">
				{items.length
					? `${index + 1} / ${items.length}`
					: 'Niciun rezultat'}
			</p>
		</section>
	);
}
