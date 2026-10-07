// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
	site: 'https://ark-site.workers.dev', // update to your custom domain before production
	output: 'static',
	trailingSlash: 'always', // must match wrangler assets.html_handling
	build: { format: 'directory' },
	integrations: [react()],
	prefetch: { prefetchAll: false, defaultStrategy: 'viewport' },
});
