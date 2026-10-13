/**
 * Play layer animations once when a slideshow item is shown.
 * Respects prefers-reduced-motion.
 */
const reduced =
	typeof window !== 'undefined' &&
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function playLayer(root: Element) {
	if (reduced) return;
	if (root.getAttribute('data-played') === 'true') return;
	root.setAttribute('data-played', 'true');
	root.querySelectorAll<HTMLElement>('[data-anim]').forEach((el, i) => {
		const delay = Number(el.dataset.animDelay || 0) + i * Number(el.dataset.animStagger || 0);
		el.style.animationDelay = `${delay}ms`;
		el.style.animationDuration = `${el.dataset.animDuration || 600}ms`;
		el.classList.add(`anim-${el.dataset.anim || 'fade'}`);
	});
}

document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
	const first = document.querySelector('.uk-slideshow-items > :first-child .slide-layer');
	if (first) playLayer(first);

	document.addEventListener('itemshown', ((e: CustomEvent) => {
		const item = (e.target as HTMLElement)?.closest?.('.uk-slideshow-items > *') ||
			(e as unknown as { detail?: { slide?: Element } }).detail?.slide;
		const layer = (item as Element | undefined)?.querySelector?.('.slide-layer');
		if (layer) playLayer(layer);
	}) as EventListener);
});
