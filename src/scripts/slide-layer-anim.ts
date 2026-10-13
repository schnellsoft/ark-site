/**
 * Play whole-layer animations when a slideshow item is shown.
 * playMode: once | always | off
 * Respects prefers-reduced-motion.
 */

const reduced =
	typeof window !== 'undefined' &&
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resetLayer(root: HTMLElement) {
	root.classList.remove('is-in');
	root.removeAttribute('data-played');
	root.querySelectorAll<HTMLElement>('.slide-layer__body > *').forEach((child) => {
		child.style.removeProperty('--child-delay');
	});
}

function playLayer(root: Element) {
	if (!(root instanceof HTMLElement)) return;
	if (reduced) {
		root.classList.add('is-in');
		return;
	}

	const effect = root.dataset.anim || 'fade';
	const playMode = root.dataset.animPlay || 'once';

	if (playMode === 'off' || effect === 'none') {
		root.classList.add('is-in');
		return;
	}

	if (playMode === 'once' && root.getAttribute('data-played') === 'true') return;

	if (playMode === 'always') resetLayer(root);

	const duration = Number(root.dataset.animDuration || 600);
	const delay = Number(root.dataset.animDelay || 0);
	const stagger = Number(root.dataset.animStagger || 120);

	root.style.setProperty('--d', `${duration}ms`);
	root.style.setProperty('--delay', `${delay}ms`);

	if (effect === 'stagger') {
		root.querySelectorAll<HTMLElement>('.slide-layer__body > *').forEach((child, i) => {
			child.style.setProperty('--child-delay', `${delay + i * stagger}ms`);
		});
	}

	// Force reflow so removing is-in takes effect before re-adding.
	void root.offsetWidth;
	requestAnimationFrame(() => {
		root.classList.add('is-in');
		if (playMode === 'once') root.setAttribute('data-played', 'true');
	});
}

function layerFromSlideshowItem(item: Element | null | undefined) {
	if (!item) return null;
	return item.querySelector('.slide-layer.hl') as HTMLElement | null;
}

document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
	const first = document.querySelector(
		'.uk-slideshow-items > :first-child .slide-layer.hl',
	) as HTMLElement | null;
	if (first) playLayer(first);

	document.addEventListener('itemshown', ((e: Event) => {
		const target = e.target as HTMLElement | null;
		const item =
			target?.closest?.('.uk-slideshow-items > *') ||
			(e as CustomEvent<{ slide?: Element }>).detail?.slide;
		const layer = layerFromSlideshowItem(item as Element | undefined);
		if (layer) playLayer(layer);
	}) as EventListener);
});
