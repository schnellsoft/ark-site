'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ServicesCatalog } from './ServicesCards';
import {
	BOOKING_CHANGE_EVENT,
	clearSelectedServices,
	deselectService,
	readSelectedServices,
} from '../../scripts/booking';
import {
	pickLocale,
	readDocumentLang,
	ui,
	type Lang,
} from '../../lib/services-ui';
import { LANG_CHANGE_EVENT } from '../../scripts/header/lang';
import './services-catalog.css';

type Props = {
	catalog: ServicesCatalog;
};

function serviceHref(slug: string, pagePath?: string) {
	const raw = (pagePath || `/services/${slug}`).trim();
	const withSlash = raw.endsWith('/') ? raw : `${raw}/`;
	return withSlash.startsWith('/') ? withSlash : `/${withSlash}`;
}

export function SelectedServicesList({ catalog }: Props) {
	const [lang, setLang] = useState<Lang>('ro');
	const [selected, setSelected] = useState<string[]>([]);

	useEffect(() => {
		setLang(readDocumentLang());
		setSelected(readSelectedServices());
		const onLang = (e: Event) => {
			const detail = (e as CustomEvent<{ lang: Lang }>).detail;
			setLang(detail?.lang || readDocumentLang());
		};
		const onBooking = () => setSelected(readSelectedServices());
		window.addEventListener(LANG_CHANGE_EVENT, onLang);
		window.addEventListener(BOOKING_CHANGE_EVENT, onBooking);
		window.addEventListener('storage', onBooking);
		return () => {
			window.removeEventListener(LANG_CHANGE_EVENT, onLang);
			window.removeEventListener(BOOKING_CHANGE_EVENT, onBooking);
			window.removeEventListener('storage', onBooking);
		};
	}, []);

	const bySlug = useMemo(() => {
		const map = new Map<string, ServicesCatalog['services'][number]>();
		for (const s of catalog.services || []) {
			if (s.enabled === false) continue;
			map.set(s.slug, s);
		}
		return map;
	}, [catalog.services]);

	const items = useMemo(
		() =>
			selected
				.map((slug) => bySlug.get(slug))
				.filter((s): s is ServicesCatalog['services'][number] => Boolean(s)),
		[selected, bySlug],
	);

	function onRemove(slug: string) {
		deselectService(slug);
		setSelected(readSelectedServices());
	}

	function onClear() {
		clearSelectedServices();
		setSelected([]);
	}

	return (
		<section className="svc-catalog svc-selected" aria-label={ui('selectedServices', lang)}>
			<header className="svc-catalog__head svc-selected__head">
				<div className="svc-catalog__titles">
					<h1 className="svc-catalog__title">{ui('selectedServices', lang)}</h1>
					<p className="svc-catalog__lead">{ui('selectedServicesLead', lang)}</p>
				</div>
				<div className="svc-selected__actions">
					<a className="svc-selected__link" href="/services/">
						{ui('browseServices', lang)}
					</a>
					{items.length > 0 ? (
						<button type="button" className="svc-catalog__toggle" onClick={onClear}>
							{ui('clearAll', lang)}
						</button>
					) : null}
				</div>
			</header>

			{items.length === 0 ? (
				<div className="svc-catalog__empty svc-selected__empty">
					<p>{ui('selectedEmpty', lang)}</p>
					<a className="svc-selected__link svc-selected__link--primary" href="/services/">
						{ui('browseServices', lang)}
					</a>
				</div>
			) : (
				<div className="svc-catalog__table-wrap">
					<table className="svc-catalog__table">
						<thead>
							<tr>
								<th scope="col">{ui('service', lang)}</th>
								<th scope="col">{ui('price', lang)}</th>
								<th scope="col">{ui('action', lang)}</th>
							</tr>
						</thead>
						<tbody>
							{items.map((s) => (
								<tr key={s.slug} className="svc-catalog__row svc-catalog__row--svc is-selected">
									<td>
										<a className="svc-catalog__name" href={serviceHref(s.slug, s.pagePath)}>
											{pickLocale(s.title, lang)}
										</a>
									</td>
									<td className="svc-catalog__price">
										<span className="svc-catalog__price-val">{s.price}</span>{' '}
										<span className="svc-catalog__price-cur">{s.currency}</span>
									</td>
									<td className="svc-catalog__action">
										<button
											type="button"
											className="svc-catalog__toggle is-selected"
											onClick={() => onRemove(s.slug)}
										>
											{ui('deselect', lang)}
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

export default SelectedServicesList;
