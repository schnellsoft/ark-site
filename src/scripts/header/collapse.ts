import { refreshAppointment } from './appointment';
import type { OverflowController } from './overflow';

const PORTRAIT_MQ = '(orientation: portrait) and (max-width: 48em)';
const LOGO_MAX_MQ = '(min-width: 64em)';

/**
 * Progressive header collapse:
 * 1) If Logo Min and Menu "More CT" are both visible → hide Logo Min
 * 2) If More CT is still visible after that → hamburger (hide menu bar)
 * Portrait MQ still forces hamburger + logo/lang rules via CSS.
 * When hamburger is on, Menu CT sits left of Flexi CT (.snd-ct-consultation).
 */
export function initCollapse(menu: OverflowController, icons: OverflowController | null) {
	const header = document.querySelector<HTMLElement>('[data-header]');
	const logo = document.querySelector<HTMLElement>('.snd-ct-logo');
	if (!header || !logo) return;

	const portraitMq = window.matchMedia(PORTRAIT_MQ);
	const logoMaxMq = window.matchMedia(LOGO_MAX_MQ);
	const raf = { id: 0 };

	const logoMinVisible = () => {
		if (logoMaxMq.matches) return false;
		if (header.classList.contains('is-logo-collapsed')) return false;
		if (getComputedStyle(logo).display === 'none') return false;
		return logo.getBoundingClientRect().width > 0;
	};

	const run = () => {
		const portrait = portraitMq.matches;

		header.classList.toggle('is-portrait-compact', portrait);

		if (portrait) {
			header.classList.add('is-logo-collapsed');
			menu.setCompact(true);
			menu.layout(0);
			icons?.layout(0);
			refreshAppointment();
			return;
		}

		// Start open: full menu + logo allowed
		header.classList.remove('is-logo-collapsed');
		menu.setCompact(false);
		void logo.offsetWidth; // reflow before measuring overflow
		menu.layout(0);

		// Step 1: Logo Min + More CT together → drop Logo Min
		if (menu.isMoreVisible() && logoMinVisible()) {
			header.classList.add('is-logo-collapsed');
			void logo.offsetWidth;
			menu.layout(0);
		}

		// Step 2: More CT still needed → hamburger (menu bar → drawer)
		if (menu.isMoreVisible()) {
			menu.setCompact(true);
			menu.layout(0);
		}

		icons?.layout(0);
		refreshAppointment();
	};

	const schedule = () => {
		if (raf.id) cancelAnimationFrame(raf.id);
		raf.id = requestAnimationFrame(() => {
			raf.id = 0;
			run();
		});
	};

	const ro = new ResizeObserver(schedule);
	ro.observe(header);
	ro.observe(menu.root);
	if (icons) ro.observe(icons.root);

	portraitMq.addEventListener('change', schedule);
	logoMaxMq.addEventListener('change', schedule);
	window.addEventListener('resize', schedule);

	schedule();
}
