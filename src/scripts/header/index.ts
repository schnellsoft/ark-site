import { initAppointment } from './appointment';
import { initCollapse } from './collapse';
import { initLang } from './lang';
import { initOverflowList } from './overflow';

export function initHeader() {
	const menuRoot = document.querySelector<HTMLElement>('[data-menu-comp]');
	const iconsRoot = document.querySelector<HTMLElement>('[data-icons-comp]');

	const menu = menuRoot
		? initOverflowList(menuRoot, { enableHamburger: true })
		: null;
	const icons = iconsRoot
		? initOverflowList(iconsRoot, { enableHamburger: false })
		: null;

	initAppointment();

	if (menu) {
		initCollapse(menu, icons);
	} else {
		icons?.layout(0);
	}

	initLang();
}
