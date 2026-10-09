const MAX_LAYOUT_PASSES = 3;
const SUBPIXEL_SLACK = 0.5;

function schedule(raf: { id: number }, fn: () => void) {
	if (raf.id) cancelAnimationFrame(raf.id);
	raf.id = requestAnimationFrame(() => {
		raf.id = 0;
		fn();
	});
}

function readGap(list: HTMLElement): number {
	const gap = Number.parseFloat(getComputedStyle(list).columnGap);
	return Number.isFinite(gap) ? gap : 0;
}

function measureItem(item: Element, cache: WeakMap<Element, number>): number {
	if (!item.hasAttribute('hidden')) {
		const width = item.getBoundingClientRect().width;
		if (width > 0) cache.set(item, width);
	}
	return cache.get(item) ?? item.getBoundingClientRect().width;
}

function supportsPopover(): boolean {
	return 'popover' in HTMLElement.prototype;
}

function supportsAnchor(): boolean {
	return (
		typeof CSS !== 'undefined' &&
		typeof CSS.supports === 'function' &&
		(CSS.supports('anchor-name: --x') || CSS.supports('position-anchor: --x'))
	);
}

function isPanelOpen(panel: HTMLElement): boolean {
	return supportsPopover() ? panel.matches(':popover-open') : panel.classList.contains('is-open');
}

function hidePanel(panel: HTMLElement) {
	if (supportsPopover() && panel.matches(':popover-open')) {
		panel.hidePopover();
	}
	panel.classList.remove('is-open');
}

function syncExpanded(trigger: HTMLElement | null, panel: HTMLElement) {
	if (!trigger) return;
	trigger.setAttribute('aria-expanded', isPanelOpen(panel) ? 'true' : 'false');
}

function positionPanel(trigger: HTMLElement, panel: HTMLElement) {
	if (!isPanelOpen(panel) || supportsAnchor()) return;
	const rect = trigger.getBoundingClientRect();
	panel.style.position = 'fixed';
	panel.style.inset = 'auto';
	panel.style.margin = '0';
	panel.style.top = `${rect.bottom + 4}px`;
	panel.style.left = `${rect.left}px`;
	panel.style.right = 'auto';
	panel.style.bottom = 'auto';
	panel.style.zIndex = '1100';
}

export type OverflowOptions = {
	/** Menu only — allows hamburger / is-compact. Never true for Icons CT. */
	enableHamburger?: boolean;
};

export type OverflowController = {
	root: HTMLElement;
	layout: (pass?: number) => void;
	setCompact: (compact: boolean) => void;
	isCompact: () => boolean;
	isMoreVisible: () => boolean;
	scheduleLayout: (fn?: () => void) => void;
};

/** Shared overflow layout for menu & icons rows. */
export function initOverflowList(
	root: HTMLElement,
	options: OverflowOptions = {},
): OverflowController | null {
	const more = root.querySelector<HTMLElement>('.snd-list-more');
	const list = root.querySelector<HTMLElement>('.snd-list');
	const overflow = root.querySelector<HTMLElement>('.snd-list-overflow');
	const hamburger = root.querySelector<HTMLElement>('.snd-list-hamburger');
	const drawer = root.querySelector<HTMLElement>('.snd-menu-drawer');
	if (!list || !overflow) return null;

	const moreEnabled = root.dataset.moreEnabled !== 'false' && Boolean(more);
	const itemWidths = new WeakMap<Element, number>();
	const raf = { id: 0 };
	const enableHamburger = Boolean(options.enableHamburger);
	let compact = false;

	const setCompact = (next: boolean) => {
		if (!enableHamburger) {
			root.classList.remove('is-compact');
			compact = false;
			return;
		}
		compact = next;
		root.classList.toggle('is-compact', compact);
		if (!compact && drawer && hamburger) {
			hidePanel(drawer);
			syncExpanded(hamburger, drawer);
		}
	};

	const syncOverflowPanel = (hiddenItems: HTMLElement[]) => {
		const signature = hiddenItems.map((item) => item.textContent ?? '').join('\0');
		if (signature === overflow.dataset.items) return;
		overflow.dataset.items = signature;
		overflow.replaceChildren(
			...hiddenItems.map((item) => {
				const clone = item.cloneNode(true) as HTMLElement;
				clone.removeAttribute('hidden');
				clone.classList.remove('is-overflow');
				clone.querySelectorAll('.is-open').forEach((el) => el.classList.remove('is-open'));
				clone.querySelectorAll('[aria-expanded]').forEach((el) => {
					el.setAttribute('aria-expanded', 'false');
				});
				bindClonedToggles(clone);
				return clone;
			}),
		);
	};

	const layout = (pass = 0) => {
		const items = [...list.querySelectorAll<HTMLElement>(':scope > .snd-list-item')];

		// Hamburger mode: bar list is CSS-hidden; keep items unclipped for the drawer.
		if (compact) {
			for (const item of items) {
				item.removeAttribute('hidden');
				item.classList.remove('is-overflow');
			}
			more?.toggleAttribute('hidden', true);
			hidePanel(overflow);
			syncExpanded(more, overflow);
			return;
		}

		// Always clip to items that fit 100% in the available width.
		const gap = readGap(list);
		const widths = items.map((item) => measureItem(item, itemWidths));
		const available = list.clientWidth;

		let used = 0;
		let visibleCount = 0;
		for (let i = 0; i < items.length; i += 1) {
			const extra = visibleCount > 0 ? gap : 0;
			if (used + extra + widths[i] <= available + SUBPIXEL_SLACK) {
				used += extra + widths[i];
				visibleCount += 1;
			} else break;
		}

		for (let i = 0; i < items.length; i += 1) {
			const overflowed = i >= visibleCount;
			items[i].toggleAttribute('hidden', overflowed);
			items[i].classList.toggle('is-overflow', overflowed);
		}

		const hasOverflow = visibleCount < items.length;
		const moreWasHidden = more?.hidden ?? true;

		// more: false → hide overflowed items with no More control / panel
		if (!moreEnabled || !more) {
			more?.toggleAttribute('hidden', true);
			hidePanel(overflow);
			overflow.replaceChildren();
			overflow.dataset.items = '';
			syncExpanded(more, overflow);
			return;
		}

		more.toggleAttribute('hidden', !hasOverflow);
		syncOverflowPanel(items.slice(visibleCount));
		if (!hasOverflow) hidePanel(overflow);
		syncExpanded(more, overflow);

		if (moreWasHidden !== more.hidden && pass < MAX_LAYOUT_PASSES) {
			schedule(raf, () => layout(pass + 1));
		}
	};

	const setItemOpen = (item: Element, open: boolean) => {
		const wasOpen = item.classList.contains('is-open');
		if (wasOpen === open) return;
		item.classList.toggle('is-open', open);
		item
			.querySelector(':scope > .snd-list-link[aria-expanded]')
			?.setAttribute('aria-expanded', String(open));
		const submenu = item.querySelector<HTMLElement>(':scope > .snd-submenu');
		if (submenu) {
			submenu.style.display = open ? 'flex' : 'none';
			if (open) {
				const parent = submenu.parentElement;
				if (parent?.parentElement === list) {
					const max = Math.max(0, window.innerHeight - parent.getBoundingClientRect().bottom);
					submenu.style.maxHeight = `${max}px`;
					submenu.style.overflow = 'auto';
				}
			} else {
				submenu.style.maxHeight = '';
				submenu.style.overflow = '';
				for (const nested of item.querySelectorAll('.snd-list-item.is-open')) {
					setItemOpen(nested, false);
				}
			}
		}
	};

	const closeBarFlyouts = (keep: Element | null = null) => {
		for (const item of [...list.querySelectorAll(':scope > .snd-list-item.is-open')]) {
			if (item !== keep) setItemOpen(item, false);
		}
	};

	function bindClonedToggles(scope: HTMLElement) {
		const nodes = [
			...(scope.matches('.snd-list-item') ? [scope] : []),
			...scope.querySelectorAll<HTMLElement>('.snd-list-item'),
		];
		for (const item of nodes) {
			const control = item.querySelector<HTMLElement>(':scope > .snd-list-link[aria-expanded]');
			if (!control) continue;
			control.addEventListener('click', (event) => {
				event.preventDefault();
				setItemOpen(item, !item.classList.contains('is-open'));
			});
		}
	}

	list.addEventListener('click', (event) => {
		const target = event.target instanceof Element ? event.target.closest('.snd-list-item') : null;
		if (!(target instanceof HTMLElement) || target.parentElement !== list) return;
		const control = target.querySelector(':scope > .snd-list-link[aria-expanded]');
		if (control && event.target instanceof Element && control.contains(event.target)) {
			event.preventDefault();
			const open = !target.classList.contains('is-open');
			if (open) {
				closeBarFlyouts(target);
				hidePanel(overflow);
				syncExpanded(more, overflow);
			}
			setItemOpen(target, open);
			return;
		}
		if (!target.querySelector(':scope > .snd-submenu')) {
			closeBarFlyouts();
			hidePanel(overflow);
			syncExpanded(more, overflow);
		}
	});

	if (drawer) {
		drawer.addEventListener('click', (event) => {
			const target = event.target instanceof Element ? event.target.closest('.snd-list-item') : null;
			if (!(target instanceof HTMLElement)) return;
			const control = target.querySelector(':scope > .snd-list-link[aria-expanded]');
			if (control && event.target instanceof Element && control.contains(event.target)) {
				event.preventDefault();
				setItemOpen(target, !target.classList.contains('is-open'));
			}
		});
	}

	overflow.addEventListener('toggle', () => {
		if (more) {
			syncExpanded(more, overflow);
			positionPanel(more, overflow);
		}
	});

	drawer?.addEventListener('toggle', () => {
		if (hamburger && drawer) {
			syncExpanded(hamburger, drawer);
			positionPanel(hamburger, drawer);
		}
	});

	if (!supportsPopover()) {
		more?.addEventListener('click', () => {
			if (more.hidden) return;
			overflow.classList.toggle('is-open');
			syncExpanded(more, overflow);
			positionPanel(more, overflow);
		});
		hamburger?.addEventListener('click', () => {
			drawer?.classList.toggle('is-open');
			if (hamburger && drawer) {
				syncExpanded(hamburger, drawer);
				positionPanel(hamburger, drawer);
			}
		});
	}

	document.addEventListener(
		'pointerdown',
		(event) => {
			if (!(event.target instanceof Node) || root.contains(event.target)) return;
			for (const item of [...root.querySelectorAll('.snd-list-item.is-open')]) {
				setItemOpen(item, false);
			}
		},
		true,
	);

	if (!enableHamburger) {
		root.classList.remove('is-compact');
	}

	const controller: OverflowController = {
		root,
		layout,
		setCompact,
		isCompact: () => compact,
		isMoreVisible: () => Boolean(more && !more.hidden && moreEnabled),
		scheduleLayout: (fn) => schedule(raf, () => (fn ? fn() : layout(0))),
	};

	return controller;
}
