// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import react from '@astrojs/react';
import { mediaDevPlugin } from './scripts/vite-media-dev-plugin.mjs';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)));

// https://astro.build/config
export default defineConfig({
	site: 'https://ark-site.workers.dev', // update to your custom domain before production
	output: 'static',
	trailingSlash: 'always', // must match wrangler assets.html_handling
	build: { format: 'directory' },
	integrations: [react()],
	prefetch: { prefetchAll: false, defaultStrategy: 'viewport' },
	vite: {
		plugins: [mediaDevPlugin(siteRoot)],
	},
});
