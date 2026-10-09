type AppointmentApi = { refresh: () => void };

let api: AppointmentApi | null = null;

/** Keep main offset in sync with fixed header height (button stays in bottom row). */
export function initAppointment() {
	const header = document.querySelector<HTMLElement>('[data-header]');
	if (!header) return;

	const syncOffset = () => {
		const height = header.getBoundingClientRect().height;
		document.documentElement.style.setProperty('--header-block-size', `${height}px`);
	};

	let rafId = 0;
	const refresh = () => {
		if (rafId) cancelAnimationFrame(rafId);
		rafId = requestAnimationFrame(() => {
			rafId = 0;
			syncOffset();
		});
	};

	api = { refresh };

	const ro = new ResizeObserver(refresh);
	ro.observe(header);
	window.addEventListener('resize', refresh);
	refresh();
}

export function refreshAppointment() {
	api?.refresh();
}
