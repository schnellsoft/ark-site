'use client';

import { useEffect, useState } from 'react';
import {
	BOOKING_CHANGE_EVENT,
	isServiceSelected,
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

export type ServicePageData = {
	slug: string;
	title: LocaleMap;
	synopsis: LocaleMap;
	paragraphs: { ro?: string[]; en?: string[]; bg?: string[] };
	images: Array<{
		src: string;
		width?: number;
		height?: number;
		alt: LocaleMap;
	}>;
	price: string;
	currency: string;
	iconSvg?: string;
};

function paragraphsFor(page: ServicePageData, lang: Lang): string[] {
	const map = page.paragraphs;
	return map[lang] || map.ro || map.en || map.bg || [];
}

export function ServicePageView({ page }: { page: ServicePageData }) {
	const [lang, setLang] = useState<Lang>('ro');
	const [selected, setSelected] = useState(false);

	useEffect(() => {
		setLang(readDocumentLang());
		setSelected(isServiceSelected(page.slug));
		const onLang = (e: Event) => {
			const detail = (e as CustomEvent<{ lang: Lang }>).detail;
			setLang(detail?.lang || readDocumentLang());
		};
		const onBooking = () =>
			setSelected(readSelectedServices().includes(page.slug));
		window.addEventListener(LANG_CHANGE_EVENT, onLang);
		window.addEventListener(BOOKING_CHANGE_EVENT, onBooking);
		window.addEventListener('storage', onBooking);
		return () => {
			window.removeEventListener(LANG_CHANGE_EVENT, onLang);
			window.removeEventListener(BOOKING_CHANGE_EVENT, onBooking);
			window.removeEventListener('storage', onBooking);
		};
	}, [page.slug]);

	const title = pickLocale(page.title, lang) || page.slug;
	const synopsis = pickLocale(page.synopsis, lang);
	const paragraphs = paragraphsFor(page, lang);

	return (
		<article className="svc-page">
			<header className="svc-page-header">
				{page.iconSvg ? (
					<div
						className="svc-page-icon"
						dangerouslySetInnerHTML={{ __html: page.iconSvg }}
						aria-hidden="true"
					/>
				) : null}
				<p className="svc-page-kicker">
					<a href="/#services">{ui('services', lang)}</a>
				</p>
				<h1>{title}</h1>
				{synopsis ? <p className="svc-page-synopsis">{synopsis}</p> : null}
				<p className="svc-page-price">
					{page.price} <span>{page.currency}</span>
				</p>
				<button
					type="button"
					className={`svc-page-select${selected ? ' is-selected' : ''}`}
					onClick={() => {
						toggleServiceSelection(page.slug);
						setSelected(isServiceSelected(page.slug));
					}}
				>
					{selected ? ui('remove', lang) : ui('select', lang)}
				</button>
			</header>

			<div className="svc-page-body">
				{paragraphs.map((p, i) => (
					<p key={`${lang}-${i}`}>{p}</p>
				))}
			</div>

			{page.images?.length ? (
				<figure className="svc-page-gallery">
					{page.images.map((img) => (
						<img
							key={img.src}
							src={img.src}
							alt={pickLocale(img.alt, lang) || title}
							width={img.width}
							height={img.height}
							loading="lazy"
							decoding="async"
						/>
					))}
				</figure>
			) : null}
		</article>
	);
}
