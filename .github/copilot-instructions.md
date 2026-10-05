# AGENTS.md – Astro 7 + React islands + UIkit + Cloudflare Workers static site

Project facts: created with `npm create astro@latest -- --add react`; static output (no SSR adapter), Node ≥ 22.12, deploy with `astro build && wrangler deploy`, assets in `dist/`; UIkit for UI (no Tailwind/Bootstrap); React only for interactive islands; Zod 4 via `astro/zod` (`z` is NOT exported by `astro:content`); ship minimal JS; valid, closed HTML (Astro 7 Rust compiler). Follow the sections for the files you touch; check installed versions first.

---


# Astro 7 Skill (current line: 7.x)

**Verify the installed version first** (`npx astro --version`, `package.json`). Astro 7 needs **Node ≥ 22.12**, uses **Vite 8**, the **Rust compiler** (strict HTML), **Sätteri** as the default Markdown pipeline, and **Zod 4** via `astro/zod`. This project is a **static site (SSG)**: `output: 'static'` (default), **no SSR adapter**, deployed to Cloudflare Workers as static assets (see `cloudflare-workers`). React is added for interactive islands only (see `react`).

## Create the project
```bash
npm create astro@latest -- --add react     # scaffold + React integration (see `-- --help` for --template, --typescript, --git, --install)
```
After scaffolding, verify:
- `package.json` has `astro`, `@astrojs/react`, `react`, `react-dom`, `@types/react`, `@types/react-dom` (types only if missing).
- `astro.config.mjs` contains `integrations: [react()]`.
- `tsconfig.json` extends `astro/tsconfigs/strict` and has `"jsx": "react-jsx"`, `"jsxImportSource": "react"`.
Add more with `npx astro add sitemap mdx`. Dev commands: `npx astro dev | build | preview | check | sync`.

## Project layout
```
src/
  pages/            file-based routes (.astro, .md, .mdx); [slug].astro dynamic; 404.astro
  layouts/Base.astro
  components/       .astro (zero JS) ; components/react/ for React islands
  content/          markdown/mdx/json data for collections
  content.config.ts collection definitions + Zod schemas
  assets/           images processed by Astro (optimized, hashed)
  styles/           global.css, uikit overrides
public/             copied verbatim: favicon, robots.txt, _headers, _redirects
astro.config.mjs  wrangler.jsonc  tsconfig.json
```
**Reserved file:** `src/fetch.ts` is now special (advanced routing). Never use that name for your own code; if you must, set `fetchFile: './src/other.ts'` or `fetchFile: null` in config.

## astro.config.mjs (static + React)
```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
export default defineConfig({
  site: 'https://example.com',      // REQUIRED for sitemap, canonical URLs, RSS, OG
  output: 'static',
  trailingSlash: 'always',          // pick one; match Cloudflare html_handling
  build: { format: 'directory' },   // /about/index.html
  integrations: [react(), sitemap()],
  prefetch: { prefetchAll: false, defaultStrategy: 'viewport' },
});
```
Do **not** install `@astrojs/cloudflare` for a pure static site: it switches pages to on-demand rendering. `@astrojs/db` was removed in v7.

## .astro component anatomy
```astro
---
// Frontmatter runs at BUILD time only (never in the browser)
import Base from '../layouts/Base.astro';
import Card from '../components/Card.astro';
interface Props { title: string; items?: string[] }
const { title, items = [] } = Astro.props;
---
<Base title={title}>
  <h1>{title}</h1>
  {items.map((i) => <Card text={i} />)}
  <slot />
</Base>
<style>/* scoped to this component */ h1 { margin-block: 1rem; }</style>
<script>/* bundled, deduped, module, TS ok, runs in browser */</script>
```
- Expressions are JSX-like; `class:list={['a', { b: cond }]}`; `<Fragment>`; named slots `<slot name="aside" />` / `<div slot="aside">`.
- `set:html={str}` injects raw HTML: **only trusted/sanitized content**.
- `define:vars={{ x }}` passes build values into `<style>`/`<script>` (script becomes inline, unbundled).
- Prefer `.astro` for everything static. Use React only where state/interactivity is needed.

### Astro 7 compiler and whitespace rules (important)
- **Rust compiler is strict**: every non-void element and component needs a closing tag (`<p>text</p>`, `<Layout>…</Layout>`). Unclosed tags are build errors.
- **Invalid nesting is no longer auto-fixed** (e.g. `<div>` inside `<p>` is passed to the browser as-is and the browser splits the paragraph). Write valid HTML.
- **`compressHTML` defaults to `'jsx'`**: whitespace between inline elements is stripped like JSX. `<span>hello</span>\n<em>world</em>` renders `helloworld`. Add `{" "}` between inline siblings, or set `compressHTML: true` (HTML-aware) / `false` in config.
- Built CSS may serialize colors/`url()` differently (cosmetic).

## Routing
- `src/pages/about.astro` → `/about/`. Dynamic static routes MUST export `getStaticPaths`:
```astro
---
import { getCollection, render } from 'astro:content';
export async function getStaticPaths() {
  const posts = await getCollection('blog', (p) => !p.data.draft);
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}
const { post } = Astro.props;
const { Content, headings } = await render(post);
---
<article><h1>{post.data.title}</h1><Content /></article>
```
- Rest params `[...path].astro`; `paginate()`; endpoints like `src/pages/feed.xml.ts` (`@astrojs/rss`) are generated at build time.
- `404.astro` → `404.html` (served by Cloudflare `not_found_handling: "404-page"`).
- Redirects: prefer real 301s in `public/_redirects`; `redirects` in config only emits meta-refresh pages.
- Route caching (`cache`, `routeRules`) is for on-demand rendering only: not used here.

## Content collections
```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';   // z is NOT exported from astro:content
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) => z.object({
    title: z.string().max(80),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    updated: z.coerce.date().optional(),
    cover: image().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});
export const collections = { blog };
```
- **`z` comes from `astro/zod` only** (never `astro:content`, and not from a separate `zod` import for schemas, to stay on Astro's bundled Zod 4).
- Entries use `entry.id`; render with `render(entry)` from `astro:content`. `getCollection`, `getEntry`, `reference()`. Other loaders: `file()`, custom loaders (build-time fetch).
- Schema errors fail the build: fix the content, don't loosen to `z.any()`. See `zod` skill.

## Markdown / MDX (Sätteri default)
- `.md`/`.mdx` render with **Sätteri** (GFM + SmartyPants by default). `@astrojs/markdown-remark` is no longer installed by default.
- Need remark/rehype/recma plugins? `npm i @astrojs/markdown-remark`, then:
```js
import { unified } from '@astrojs/markdown-remark';
export default defineConfig({ markdown: { processor: unified(), remarkPlugins: [/* … */] } });
```
  or port the plugins to Sätteri MDAST/HAST plugins. Syntax highlighting is Shiki (`markdown.shikiConfig`).

## Images (`astro:assets`)
```astro
---
import { Image, Picture } from 'astro:assets';
import hero from '../assets/hero.jpg';
---
<Image src={hero} alt="Descriptive alt" widths={[480, 960, 1440]} sizes="(min-width: 960px) 960px, 100vw" loading="eager" fetchpriority="high" />
<Picture src={hero} formats={['avif','webp']} alt="…" />
```
- Local images in `src/assets` are optimized at build (sharp) and get width/height automatically. `public/` is NOT optimized.
- Remote images: whitelist via `image.domains` / `image.remotePatterns`. Always provide `alt`.
- On a static build do not configure Cloudflare image bindings; build-time optimization is enough.

## Fonts
Astro has a built-in Fonts API (see the Fonts guide in the docs: `fonts` config + `fontProviders` + a `<Font>` component in `<head>`) that downloads, subsets, caches and preloads fonts. Verify the exact API against the installed version; alternative: `@fontsource-variable/*` imported in the layout.

## Layout & head (SEO) pattern
`Base.astro` takes `title`, `description`, `image`, `canonical`; renders `<title>`, meta description, canonical (`new URL(Astro.url.pathname, Astro.site)`), OG/Twitter tags, favicon, sitemap link, and imports global CSS + UIkit CSS in frontmatter. See `static-site-quality`.

## Styles, scripts, assets
- Scoped `<style>` by default; `is:global` for resets; import CSS in frontmatter; Vite 8 hashes assets to `/_astro/*`.
- Third-party libs: `npm i` and `import` in `<script>`; avoid CDN tags.
- `import.meta.env.PUBLIC_*` is inlined into client code: **never put secrets in a static site**. Typed env: `astro:env`.

## React islands (summary; details in `react` skill)
```astro
---
import Counter from '../components/react/Counter.tsx';
---
<Counter client:visible initial={3} />
```
Directives: `client:load` (immediately), `client:idle`, `client:visible`, `client:media="(max-width: 50em)"`, `client:only="react"` (no SSR). Default to **no directive** only for components that don't need interactivity (they render to static HTML with zero JS). Props must be serializable.

## View transitions (optional)
`import { ClientRouter } from 'astro:transitions';` then `<ClientRouter />` in `<head>`. Scripts re-init on `astro:page-load`. The old exported internals (`TRANSITION_AFTER_SWAP`, `isTransitionBeforeSwapEvent()`, `createAnimationScope()` …) are **removed in v7**: use event names directly (`'astro:after-swap'`, `'astro:before-preparation'`). Simple sites can use CSS `@view-transition { navigation: auto; }` instead.

## Quality commands (run before finishing)
```bash
npx astro check     # types incl. .astro
npx astro build     # fails on invalid HTML now: fix it, don't suppress
npx astro preview   # or: npx wrangler dev (closer to production)
```
Lint: `eslint-plugin-astro` + `prettier-plugin-astro`; React islands: `eslint-plugin-react-hooks`.

## Upgrading to 7 (from 6)
`npx @astrojs/upgrade` (upgrades Astro + official integrations), then: Vite 8 (check Vite plugins), fix unclosed/invalid HTML (Rust compiler), check inline whitespace (`compressHTML: 'jsx'`), rename any `src/fetch.ts`, remove stable experimental flags (`logger`, `queuedRendering`, `rustCompiler`, `advancedRouting`, `cache`, `routeRules` move to top level), install `@astrojs/markdown-remark` only if using remark/rehype, drop `@astrojs/db`, replace removed `astro:transitions` helpers, Container API: `getContainerRenderer` from `@astrojs/react/container-renderer`. From v5 first apply the v6 guide (Node 22, Zod 4, legacy content collections removed, `<ViewTransitions>` → `<ClientRouter>`).

## Anti-patterns
React components for static content, `client:load` everywhere, SSR adapter for a static site, relying on `Astro.request`/cookies at build, big unoptimized images in `public/`, copy-pasted `<head>`, routes without `getStaticPaths`, secrets in `PUBLIC_` env, `set:html` on untrusted input, forgetting `site`, importing `z` from `astro:content`, unclosed or invalidly nested HTML.

---


# React in Astro Skill (React 19.2.x; check `npm view react version`; `@astrojs/react` matching Astro 7)

Installed via `npm create astro@latest -- --add react`. React is for **interactive islands only**. Astro renders the page; React hydrates small isolated pieces. There are **no React Server Components** and no Next.js APIs here.

## Decide first: do you need React?
| Need | Use |
|---|---|
| Static content, layout, lists, cards | `.astro` component (0 KB JS) |
| Simple toggle/menu/accordion/modal | UIkit attributes (`uk-toggle`, `uk-accordion`, `uk-modal`) or a tiny `<script>` |
| Client state, derived UI, search/filter, multi-step form, live preview, charts | **React island** |
Every island ships React + your code. Keep islands few, small, leaf-level.

## Directives
```astro
---
import Search from '../components/react/Search.tsx';
---
<Search client:idle placeholder="Search…" />          <!-- hydrate when browser idle -->
<Chart client:visible data={data} />                  <!-- when scrolled into view (default choice below the fold) -->
<Menu client:media="(max-width: 960px)" />            <!-- only on matching viewport -->
<Widget client:only="react" />                        <!-- no SSR, client render only (uses window/localStorage at render) -->
<Hero client:load />                                  <!-- immediately; above-the-fold interactive only -->
```
No directive = server-rendered to static HTML, **not interactive** (hooks run once at build; effects/events never run). Prefer `client:visible`/`client:idle`; use `client:load` sparingly.

## Component conventions
```tsx
// src/components/react/Counter.tsx
import { useState } from 'react';
type Props = { initial?: number; label: string };
export default function Counter({ initial = 0, label }: Props) {
  const [n, setN] = useState(initial);
  return (
    <button type="button" className="uk-button uk-button-default" onClick={() => setN((v) => v + 1)}>
      {label}: {n}
    </button>
  );
}
```
- Function components + hooks, default or named exports, file-per-component, PascalCase. Group in `src/components/react/`.
- **Props crossing from Astro must be serializable** (strings, numbers, booleans, arrays, plain objects, `Date`, `Map/Set`, URL…). **No functions or class instances** as props from `.astro`.
- **Children from Astro** (`<Island client:visible><p>x</p></Island>`) arrive as static HTML, not React nodes; use for slots, not for logic. Named slots arrive as props with the slot name.
- Don't nest unrelated frameworks; do nest Astro-rendered content in a React island via `children`.
- Use `className`, `htmlFor`, `onClick`, `tabIndex`, `aria-*`; self-close void tags; keys on lists (stable ids, never index for reorderable lists).
- React 19: `ref` is a normal prop (no `forwardRef`), `use()`, `useActionState`, `useOptimistic`, `useTransition`, `useDeferredValue`, `useId` (for label/input ids), `useEffectEvent` (19.2), `<Activity>` (19.2). Do not use `<title>/<meta>` hoisting here: head belongs in `Base.astro`.
- Effects: only for syncing with external systems (subscriptions, DOM APIs). Derive values during render; fetch in handlers or a library, not in effect chains. Clean up in effect returns.
- `useMemo`/`useCallback` only after measuring. React Compiler (stable) can be enabled via its Babel/Vite plugin if desired; verify compatibility with the installed Vite 8/`@astrojs/react` docs first.

## Hydration safety (SSR + client must match)
- First render must be deterministic: no `Date.now()`, `Math.random()`, `window`, `localStorage`, `matchMedia` in render. Read them in `useEffect` (set state after mount) or use `client:only="react"`.
- Use `useId()` instead of hand-made ids. Use `suppressHydrationWarning` only for unavoidable text like local timestamps.
- Don't mutate React-owned DOM from outside (see UIkit below).

## Sharing state between islands
Islands are separate React roots: **React Context does not cross islands**. Options: `nanostores` + `@nanostores/react` (Astro's recommended), custom events (`window.dispatchEvent`), URL/search params, or merge related UI into one island. Persist with `localStorage` read after mount.

## UIkit + React
- Prefer UIkit **CSS-only** classes in islands (`uk-button`, `uk-card`, `uk-input`, `uk-grid`) via `className`.
- UIkit **JS components** (`uk-modal`, `uk-dropdown`, `uk-slider`, `uk-icon`, `uk-sticky`) mutate the DOM. Inside React islands they can break hydration/reconciliation. Instead: keep the markup in `.astro` and let UIkit own it, or control UIkit through its API with a ref in `useEffect`: `UIkit.modal(ref.current).show()`, and render UIkit-owned parts as `client:only` or leaf nodes React never re-renders.
- Hyphenated attributes (`uk-grid=""`, `uk-toggle="target: #x"`) are allowed in JSX; `uk-grid` alone needs `uk-grid=""` in some typings.
- Don't import UIkit's CSS in the island; it's loaded once in `Base.astro`.

## Forms in islands
Controlled or uncontrolled inputs with real `<label>`, `name`, `autocomplete`, `type`. Validate with the **same Zod schema** used by the Worker (`src/lib/schemas.ts`), show errors with `aria-describedby`, `aria-invalid`, and a polite `role="status"` live region. Submit via `fetch('/api/contact', { method: 'POST', body: new FormData(form) })` (see `worker-forms`). Disable the button while pending; never put secrets in the island.

## TypeScript
`tsconfig`: `"jsx": "react-jsx"`, `"jsxImportSource": "react"`. Props as `type Props = {…}`; extend DOM props with `React.ComponentProps<'button'>`; events `React.ChangeEvent<HTMLInputElement>`; avoid `React.FC`; `import type` for types. For data from JSON/API use Zod then `z.infer`.

## Accessibility
Semantic elements first (`<button>`, `<a>`, `<dialog>`); manage focus on open/close; trap focus in custom dialogs (prefer native `<dialog>`); announce async results with live regions; honour `prefers-reduced-motion`; keyboard operable; no `div onClick`.

## Performance
- Check the build output size of `dist/_astro/*.js`; code-split with dynamic `import()`/`React.lazy` for heavy widgets (charts, editors) and load them with `client:visible`.
- Avoid shipping large libraries (moment, lodash full, big icon packs). Prefer native APIs.
- Don't wrap the whole page in one React app; don't hydrate content that is static.
- With `<ClientRouter />`, islands re-mount on navigation; use `transition:persist` on an island to keep state across pages, and avoid global side effects on module load.

## Testing & lint
`eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`; Vitest + `@testing-library/react` for logic-heavy islands; Playwright for e2e of the built site.

## Anti-patterns
React for static content, `client:load` on everything, one giant island, relying on Context across islands, browser APIs during SSR render, passing functions as props from `.astro`, UIkit JS inside React-owned DOM, effect-driven data derivation, index keys on dynamic lists, `dangerouslySetInnerHTML` with untrusted input, forgetting alt/labels.

---


# Cloudflare Workers (static assets) Skill

Cloudflare recommends **Workers** (not Pages) for new projects. A static Astro site is just a Worker config whose `assets.directory` points at `./dist`: no adapter, no code, no cold starts, asset requests are served from Cloudflare's network.

## wrangler.jsonc (pure static)
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-site",
  "compatibility_date": "2026-10-05",          // set to the day you set it up; bump deliberately
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",          // serves nearest 404.html with status 404
    "html_handling": "auto-trailing-slash"     // default; must agree with Astro trailingSlash
  },
  "observability": { "enabled": true }
}
```
- `not_found_handling`: `"404-page"` (static MPA, **use this**), `"single-page-application"` (SPA fallback to index.html, wrong for Astro MPA), `"none"`.
- `html_handling`: `auto-trailing-slash` | `force-trailing-slash` | `drop-trailing-slash` | `none`. Match `trailingSlash` in `astro.config.mjs` (`always` ↔ `force-trailing-slash`, `never` ↔ `drop-trailing-slash`) to avoid redirect loops/duplicate URLs.
- No `main` field for a pure static site. Add one only when you need Worker code (`worker-forms` skill).

## Commands
```bash
npm i -D wrangler
npx astro build && npx wrangler dev        # local preview using real asset routing
npx astro build && npx wrangler deploy     # production deploy
npx wrangler versions upload               # preview version without promoting (gradual deploys)
npx wrangler types                         # only when a Worker script/bindings exist
```
package.json scripts: `"build": "astro check && astro build"`, `"preview": "wrangler dev"`, `"deploy": "astro build && wrangler deploy"`.

## CI/CD
- **Workers Builds** (Git integration): Build command `npm run build`, Deploy command `npx wrangler deploy`, root dir if monorepo, set `NODE_VERSION=22` env var.
- GitHub Actions alternative: `cloudflare/wrangler-action` with `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets (never commit them).
- Pull requests get preview URLs from Workers Builds; check before merge.

## Headers & redirects (put files in `public/`)
`public/_headers`:
```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```
`public/_redirects`:
```
/old-page   /new-page/   301
/blog/*     /articles/:splat   301
```
- Hashed `/_astro/*` files are immutable-cacheable; HTML must stay revalidated (default).
- CSP: Astro bundles scripts as external modules, so `script-src 'self'` works unless you use `is:inline`/`define:vars` (then hash/nonce or avoid). UIkit does not need `unsafe-eval`; it may set inline `style` attributes at runtime, so `style-src` may need `'unsafe-inline'` (or `style-src-attr 'unsafe-inline'`). Test in DevTools Console.
- Headers in `_headers` apply to static assets only, **not** to responses generated by Worker code (set those in code).
- These files have size/rule-count limits (e.g. ~100 header rules, ~2000 static redirects); check current docs if large.

## Custom domain, routes
```jsonc
"routes": [{ "pattern": "example.com", "custom_domain": true }, { "pattern": "www.example.com", "custom_domain": true }],
"workers_dev": false
```
Domain must be in your Cloudflare account. Redirect `www`→apex with a Redirect Rule or `_redirects` on the host.

## Limits & behaviour (verify current values in docs)
- Max single asset ≈ 25 MiB; file count cap per version (tens of thousands). Large media → R2 + CDN subdomain.
- Static asset requests are free and unmetered; only Worker invocations (`run_worker_first`/API) count.
- Default asset caching: browser revalidates with ETag; Cloudflare edge caches automatically.
- Uploads are incremental (only changed files).

## Do / Don't
- Do commit `wrangler.jsonc`; keep secrets in `wrangler secret put` / Workers dashboard, local dev in `.dev.vars` (gitignored).
- Do set `compatibility_date` and bump it intentionally, with a test pass.
- Don't use `wrangler pages deploy` / `functions/` directory for new work.
- Don't enable SPA fallback for a multi-page Astro site.
- Don't add `@astrojs/cloudflare` unless you truly need on-demand routes; it changes `output` and build artifacts (`dist/_worker.js`), and the wrangler `main`/`assets.binding` become required. Astro 7 (Vite 8) works with plain `wrangler deploy` of `dist/`.

---


# UIkit 3 Skill (current line: 3.23.x)

UIkit is **CSS + a DOM-attribute-driven JS layer** (`uk-modal`, `uk-toggle`, …). It is not a component framework: no virtual DOM, no hydration. That fits Astro perfectly: server-rendered HTML + one small script. Do not combine with Tailwind or Bootstrap.

## Install in Astro
```bash
npm i uikit && npm i -D @types/uikit
```
`src/layouts/Base.astro` frontmatter:
```astro
---
import 'uikit/dist/css/uikit.min.css';
import '../styles/global.css';          // project overrides AFTER uikit
---
<body>…<slot />
<script>
  import UIkit from 'uikit';
  import Icons from 'uikit/dist/js/uikit-icons';
  UIkit.use(Icons);                    // enables uk-icon="icon: menu"
</script>
</body>
```
- The Astro `<script>` is bundled and deduped, so it ships once. If you use `<ClientRouter />`, UIkit's MutationObserver picks up swapped DOM; only re-run **your own** init code on `astro:page-load`.
- Avoid the CDN `<script>` tags; use the npm package so versions are pinned and CSP stays `script-src 'self'`.
- Load only what you need: for tiny sites with no JS components you can skip the JS entirely (CSS-only components: grid, card, button, utilities, form).

## Core layout vocabulary
```html
<div class="uk-container uk-container-large">
  <section class="uk-section uk-section-default uk-section-large">
    <div class="uk-grid-medium uk-child-width-1-2@s uk-child-width-1-3@m" uk-grid>
      <div><div class="uk-card uk-card-default uk-card-body">
        <h3 class="uk-card-title">Title</h3><p>…</p>
        <a class="uk-button uk-button-primary" href="/x/">Read more</a>
      </div></div>
    </div>
  </section>
</div>
```
- Breakpoint suffixes: `@s` (640), `@m` (960), `@l` (1200), `@xl` (1600); mobile-first, so a class with `@m` applies from ≥960px. `uk-visible@m`, `uk-hidden@m`, `uk-flex-first@m`.
- Widths: `uk-width-1-2`, `uk-width-expand`, `uk-width-auto`, `uk-child-width-*`; Grid gutters `uk-grid-small|medium|large|collapse`, `uk-grid-divider`, `uk-grid-match`; alignment `uk-flex uk-flex-middle uk-flex-between`.
- Spacing: `uk-margin`, `uk-margin-top|bottom|auto-left`, `uk-margin-remove`, `uk-padding(-small|-large)`.
- Text: `uk-text-center|lead|meta|muted|bold|truncate`, `uk-heading-medium|large|xlarge`, `uk-h1..h6`, `uk-link-text`, `uk-list uk-list-disc`.
- Surfaces: `uk-section-muted|primary|secondary`, `uk-background-cover`, `uk-light` / `uk-dark` (flip text color contexts on dark/light backgrounds).
- Forms: `uk-form-stacked`, `uk-form-label`, `uk-input`, `uk-select`, `uk-textarea`, `uk-checkbox`, `uk-radio`, `uk-form-danger|success`, `uk-form-width-medium`.
- Navigation: `uk-navbar-container` + `uk-navbar-left/right/nav` (give `uk-navbar` attribute), `uk-subnav`, `uk-breadcrumb`, `uk-pagination`, `uk-tab`, `uk-nav`.

## Interactive components (attribute API)
| Component | Minimal markup |
|---|---|
| Toggle | `<button uk-toggle="target: #menu">` |
| Modal | `<button uk-toggle="target: #m">` … `<div id="m" uk-modal><div class="uk-modal-dialog uk-modal-body">…<button class="uk-modal-close-default" type="button" uk-close></button></div></div>` |
| Offcanvas | `<div id="nav" uk-offcanvas="overlay: true"><div class="uk-offcanvas-bar">…</div></div>` |
| Accordion | `<ul uk-accordion><li><a class="uk-accordion-title" href="#">Q</a><div class="uk-accordion-content">A</div></li></ul>` |
| Dropdown | `<button type="button">Menu</button><div uk-dropdown="mode: click">…</div>` |
| Slider / Slideshow | `uk-slider` + `uk-slider-items`; `uk-slideshow` + `uk-slideshow-items` |
| Lightbox | `<div uk-lightbox><a href="big.jpg" data-caption="…"><img …></a></div>` |
| Scrollspy / Sticky / Parallax | `uk-scrollspy="cls: uk-animation-fade"`, `uk-sticky`, `uk-parallax` |
| Tooltip / Notification | `title="Tip" uk-tooltip`, `UIkit.notification({message:'Saved', status:'success'})` |
| Filter / Switcher / Countdown / Search | see docs per component |
Programmatic API: `UIkit.modal('#m').show()`, `UIkit.offcanvas('#nav').hide()`, events like `UIkit.util.on('#m', 'hidden', fn)`.

## Accessibility (UIkit gives a base, you finish it)
- Icon-only controls need an accessible name: `<a href="…" uk-icon="icon: github" aria-label="GitHub"></a>`; mark decorative icons `aria-hidden="true"`.
- Use real `<button type="button">`/`<a href>` for triggers, not `<div uk-toggle>`; keep one `<h1>`; keep heading order regardless of `uk-h*` visual classes (`<h2 class="uk-h4">`).
- Modals: include a title and a visible close button. Sliders/slideshows: provide pause for autoplay, honour `prefers-reduced-motion` (don't autoplay by default), and give slides meaningful alt text.
- Verify keyboard flow and focus visibility; UIkit's default focus styles are subtle, so add a `:focus-visible` outline in global.css.

## Images & performance
- Prefer Astro `<Image>` + native `loading="lazy"` over `uk-img`. For responsive backgrounds use `<picture>`/CSS rather than `data-src` hacks.
- `uk-scrollspy`/`uk-parallax` add JS work: use sparingly; no layout-shifting animations.
- Icons: the full icon bundle is sizable; for few icons use inline SVG or `UIkit.use(Icons)` once. Consider custom icons via `UIkit.icon.add({ name: '<svg…>' })`.

## Theming
Compile-time Less/Sass variables, not runtime CSS vars:
```
src/styles/uikit/
  theme.less         // @import "uikit/src/less/uikit.theme.less"; then your variable overrides
```
```less
@import "../../../node_modules/uikit/src/less/uikit.theme.less";
@global-primary-background: #0b5fff;
@global-font-family: "Inter", system-ui, sans-serif;
@base-body-font-size: 17px;
@button-border-radius: 6px;
```
Compile with `lessc` (script in package.json) or Vite's built-in Less (`npm i -D less`, then `import '../styles/uikit/theme.less'`). Sass users: `uikit/src/scss/`. Import only the components you use via `@import "uikit/src/less/components/grid.less"` etc. to shrink CSS.
If compile-time theming is overkill, override with small, specific selectors in `global.css` (unlayered), e.g. `.uk-button-primary { background: var(--brand); }`.

## Dark mode
UIkit has **no built-in dark mode**. Options: (1) compile a second dark build and swap `<link>` via `data-theme`; (2) override key components with CSS variables in a `[data-theme=dark]` scope; (3) use `uk-light` on dark sections only. Keep it simple and test contrast.

## Anti-patterns
Mixing UIkit with Tailwind/Bootstrap, wrapping UIkit in React/Vue for static content, loading from CDN plus npm (double init), relying on `uk-` JS for core navigation without a no-JS fallback, ignoring `@m`-style mobile-first suffixes (desktop-first thinking), heavy `!important` overrides instead of Less variables, hidden-only-by-class content for screen readers, autoplay sliders.

## With React islands
UIkit JS mutates the DOM (adds classes, wraps nodes, injects SVG for `uk-icon`), which conflicts with React reconciliation. Rules: UIkit JS components live in `.astro` markup; React islands use UIkit **CSS-only** classes via `className`; if a React island must open a UIkit modal/offcanvas, call the API with a ref (`UIkit.modal(ref.current).show()`) from an event handler/effect, and never let React re-render the UIkit-owned subtree. See `react` skill.

---


# HTML Skill

## Principles
1. **Semantics first.** Pick the element that describes the content, not the one that looks right. Style with CSS.
2. **Native before custom.** `<button>`, `<dialog>`, `<details>`, `<input type=...>`, `popover` beat div + JS + ARIA.
3. **Accessible by default.** Keyboard, screen reader, zoom, reduced motion.
4. **Progressive enhancement.** Content and forms work without JS where feasible.

## Document skeleton
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page title – Site</title>
  <meta name="description" content="140–160 chars summary.">
  <link rel="canonical" href="https://example.com/page">
  <meta name="theme-color" content="#ffffff">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta property="og:title" content="…"><meta property="og:image" content="…">
  <link rel="stylesheet" href="/styles.css">
  <script src="/app.js" type="module" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header>…<nav aria-label="Primary">…</nav></header>
  <main id="main">…</main>
  <footer>…</footer>
</body>
</html>
```

## Rules
- Exactly one `<h1>`; do not skip heading levels. Landmarks: `header nav main aside footer`; one `main`.
- Links navigate (`<a href>`); buttons act (`<button type="button">`). Never `<div onclick>`.
- Always set `type` on buttons inside forms (`type="button"` vs `type="submit"`).
- Every `<img>`: `alt` (empty `alt=""` if decorative), `width`/`height` (prevents CLS), `loading="lazy"` below the fold, `decoding="async"`. Hero/LCP image: no lazy, add `fetchpriority="high"`.
- Responsive images: `srcset` + `sizes`, or `<picture>` for formats (AVIF/WebP) and art direction.
- Video: `<video controls playsinline preload="metadata">` + captions `<track kind="captions">`.
- Lists for lists, `<table>` only for tabular data (`<caption>`, `<th scope>`), `<figure>/<figcaption>`, `<time datetime>`, `<address>`, `<abbr>`, `<mark>`.
- Escape user content; never build HTML by string concatenation with untrusted input.
- External links opened in a new tab: `rel="noopener noreferrer"`.
- Avoid inline `style` and inline event handlers (also blocks strict CSP).

## Forms
```html
<form method="post" action="/subscribe" novalidate>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="email" required
         aria-describedby="email-help">
  <p id="email-help">We never share your address.</p>
  <button type="submit">Subscribe</button>
</form>
```
- Every control has a visible `<label>` (wrapping or `for`/`id`). Placeholder is not a label.
- Use correct `type`, `inputmode`, `autocomplete`, `min/max/pattern/required`; group with `<fieldset><legend>`.
- Errors: text near field, linked via `aria-describedby`, `aria-invalid="true"`; do not rely on color alone.

## Modern native features (prefer these)
- `<dialog>` + `showModal()` for modals (focus trap, Esc, backdrop free).
- `popover` attribute + `popovertarget` for menus/tooltips; `<details name="group">` for accordions.
- `inert` to disable background content; `hidden="until-found"`; `<search>` element for search regions.
- `<link rel="preload|preconnect|modulepreload">` sparingly.

## ARIA
First rule: don't use ARIA if a native element exists. If used: correct role + states (`aria-expanded`, `aria-controls`, `aria-current="page"`, `aria-live="polite"` for async status), and implement the full keyboard pattern from the WAI-ARIA Authoring Practices.

## Checklist before finishing
- [ ] Valid, well-nested HTML; `lang` set; unique `id`s
- [ ] Keyboard-only walkthrough works; visible focus
- [ ] Color contrast ≥ 4.5:1 (3:1 large text/UI)
- [ ] Images have alt/dimensions; no layout shift
- [ ] Title, description, canonical, OG tags

## In this project (Astro + UIkit static site)
- HTML lives in `.astro` files: one shared `src/layouts/Base.astro` owns `<!doctype html>`, `<head>`, skip link, landmarks and `<slot />`. Pages never repeat the skeleton.
- UIkit attribute components (`uk-grid`, `uk-navbar`, `uk-modal`, `uk-accordion`) are fine, but keep semantic elements underneath (`<nav>`, `<button>`, `<ul>`) and add the ARIA UIkit does not supply.
- Use Astro `<Image>`/`<Picture>` for images rather than raw `<img>` for local assets (see `astro` skill).
- **Astro 7's Rust compiler is strict**: close every non-void tag and never nest invalid structures (`<div>` in `<p>`, `<a>` in `<a>`, block in inline). The compiler no longer repairs them and builds fail on unclosed tags.
- Astro 7 strips whitespace between inline elements (`compressHTML: 'jsx'`): write `<span>a</span>{" "}<em>b</em>` when you need a space.
- Interactive pieces that need state are React islands (see `react` skill); keep their HTML semantic too.

---


# CSS Skill

If the project uses Tailwind, prefer the `tailwind` skill for markup-level styling and use this one for custom CSS, `@layer`, and platform features.

## Architecture
```css
@layer reset, tokens, base, components, utilities;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
  * { margin: 0; }
  img, svg, video, canvas { display: block; max-width: 100%; height: auto; }
  input, button, textarea, select { font: inherit; }
  :where(p, h1, h2, h3, h4) { overflow-wrap: break-word; }
}
@layer tokens {
  :root {
    color-scheme: light dark;
    --space-1: .25rem; --space-2: .5rem; --space-4: 1rem; --space-8: 2rem;
    --radius: .5rem;
    --brand: oklch(62% .19 260);
    --bg: light-dark(#fff, #0b0b0f);
    --fg: light-dark(#111, #eee);
    --step-0: clamp(1rem, .95rem + .25vw, 1.125rem);
  }
}
@layer base { body { background: var(--bg); color: var(--fg); font: var(--step-0)/1.6 system-ui, sans-serif; } }
```
- Use **cascade layers** to control specificity instead of `!important` or deep selectors.
- Keep specificity low: classes, `:where()` to zero it out. Avoid IDs and `!important`.
- Naming: BEM-ish (`.card`, `.card__title`, `.card--featured`) or component-scoped via CSS Modules.

## Layout
- **Grid** for 2D, **flexbox** for 1D. Use `gap`, never margin hacks.
- Fluid auto-fit grid: `grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));`
- Centering: `display:grid; place-items:center;`
- `aspect-ratio`, `inset`, `min()/max()/clamp()`, `svh/dvh/lvh` (use `dvh` for mobile full height).
- **Subgrid** for aligning nested content to parent tracks.
- **Container queries** for component-level responsiveness:
```css
.card-wrap { container: card / inline-size; }
@container card (min-width: 30rem) { .card { grid-template-columns: 8rem 1fr; } }
```
- Mobile-first media queries (`min-width`); prefer range syntax: `@media (width >= 48rem)`.

## Modern features (check Baseline status before shipping)
- Nesting: `.btn { &:hover {…} .icon {…} @media (…) {…} }`
- `:has()`, `:is()`, `:where()`, `:not()`; `:focus-visible` (not bare `:focus`).
- Logical properties: `margin-inline`, `padding-block`, `inset-inline-start` (RTL-ready).
- Color: `oklch()`, `color-mix(in oklab, var(--brand) 20%, white)`, `light-dark()`, relative colors.
- `@property` for typed/animatable custom properties; `@starting-style` + `transition-behavior: allow-discrete` for animating `display`/popover/dialog entry.
- Scroll: `scroll-snap`, `overscroll-behavior`, scroll-driven animations (progressive enhancement).
- View Transitions: `document.startViewTransition()` / `@view-transition { navigation: auto; }`.
- Wrap newer features in `@supports (…)` with a sensible fallback.

## Accessibility & UX
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
```
- Never remove outlines without a replacement. Honor `prefers-color-scheme`, `prefers-contrast`, `forced-colors`.
- Touch targets ≥ 24px (aim 44px). Use `rem` for type, `em` for component-relative spacing.
- Hover-only styles go inside `@media (hover: hover)`.

## Performance
- Animate only `transform`, `opacity`, `filter`; avoid animating layout properties.
- `content-visibility: auto` + `contain-intrinsic-size` for long offscreen sections.
- `font-display: swap`, `size-adjust` fallback fonts, preload critical fonts; variable fonts.
- Avoid `@import` in CSS (blocks); bundle or `<link>`.

## Anti-patterns
`!important` wars, magic pixel numbers, `float` layouts, fixed heights on text containers, `100vh` on mobile, deep tag chains (`div > div > span`), hand-written vendor prefixes (use Lightning CSS/Autoprefixer).

## In this project (Astro + UIkit static site)
- Astro `<style>` blocks are **scoped** by default; use `<style is:global>` or `:global()` sparingly (resets, tokens, UIkit overrides).
- Load UIkit's CSS first, then `src/styles/global.css` with your overrides inside `@layer`, so overrides win without `!important`. UIkit itself is unlayered; unlayered CSS beats layered CSS, so UIkit overrides must be **unlayered** or use higher specificity. Keep overrides small and in one file.
- Prefer customizing UIkit via its Less/Sass variables (see `uikit` skill) over fighting it with CSS.
- Do not add Tailwind/Bootstrap alongside UIkit.
- Astro scoped styles apply to `.astro` templates only; React islands get styles from global CSS/UIkit classes or CSS Modules (`Button.module.css`), not from the parent `.astro` `<style>`.

---


# JavaScript Skill

## Defaults
- ES modules (`import`/`export`, `<script type="module">`), `"use strict"` is implicit in modules.
- `const` by default, `let` when reassigned, never `var`.
- `===`/`!==`; use `??` and `?.` instead of `||`/manual guards when `0`/`''` are valid.
- Prefer pure functions, small modules, early returns, descriptive names. No globals.
- Modern built-ins: `structuredClone`, `Array.prototype.at/toSorted/toReversed/toSpliced/with`, `Object.groupBy`, `Object.fromEntries`, `Array.fromAsync`, `Promise.withResolvers`, `Set` methods (union/intersection), `URL`, `URLSearchParams`, `AbortController`, `crypto.randomUUID()`, `Intl.*`.

## Async
```js
async function getJson(url, { signal } = {}) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`); // fetch does not reject on 4xx/5xx
  return res.json();
}
const results = await Promise.allSettled(urls.map((u) => getJson(u)));
```
- Always `await`/return promises; never leave floating promises. Use `try/catch` at boundaries.
- Parallelize independent work with `Promise.all`/`allSettled`; do not `await` inside loops unless sequential on purpose.
- Cancellation/timeouts: `AbortSignal.timeout(5000)`, `AbortController` for stale requests.
- Don't use `async` for functions with no `await`; don't mix `.then` chains with `await`.

## DOM & events
- Query once, cache references; `querySelector`, `closest`, `matches`, `classList`, `dataset`, `toggleAttribute`.
- **Event delegation** for lists: one listener on the parent.
- Use `textContent` for text. Never `innerHTML` with untrusted data (XSS); use `DOMPurify` or `Element.setHTML`/Trusted Types where needed.
- Clean up listeners with `{ signal }` option: `el.addEventListener('click', fn, { signal: ac.signal })`.
- Passive listeners for scroll/touch; `requestAnimationFrame` for visual updates; `IntersectionObserver`/`ResizeObserver` instead of scroll polling.
- Forms: `FormData`, `form.checkValidity()`, `event.preventDefault()` only when handling via JS.
- Custom elements/Web Components for framework-free reusable UI (`customElements.define`, Shadow DOM).

## Storage & network
- `localStorage` is sync and string-only: wrap `JSON.parse` in try/catch; never store secrets/tokens in it. Use IndexedDB (via `idb`) for large/structured data.
- Debounce input handlers; throttle scroll/resize.
- Handle offline & errors with user-visible messages.

## Errors & quality
- Throw `Error` (or subclasses with `cause`): `throw new Error('msg', { cause: err })`.
- Validate external input (user, URL, JSON, API) at the boundary; use `zod`/`valibot` in larger apps.
- Lint with ESLint (flat config) or Biome; format with Prettier/Biome; test with Vitest/Node test runner.
- JSDoc types + `// @ts-check` if not using TypeScript.

## Anti-patterns
Mutating function arguments, `for...in` over arrays, `==`, `eval`/`new Function`, `document.write`, sync XHR, giant functions, swallowing errors (`catch {}`), nested ternaries, relying on `this` in callbacks (use arrows), polluting prototypes.

## Security
Sanitize output, use CSP, avoid inline handlers, `rel="noopener"`, validate `postMessage` origins, never trust `location.hash/search` without validation, keep secrets server-side.

## In this project (Astro + UIkit static site)
- Ship **zero JS by default**. Add a `<script>` in an `.astro` file only for real interactivity; Astro bundles, dedupes and loads it as a module (TS allowed). `is:inline` opts out of bundling and bypasses imports; avoid unless a tiny critical snippet.
- Inside Astro `<script>`, code runs once per page load. With `<ClientRouter />` re-run setup on `astro:page-load`.
- UIkit JS is DOM-attribute driven; call `UIkit.*` APIs only when needed (`UIkit.modal('#id').show()`, `UIkit.notification()`).
- No server at runtime: anything needing secrets goes to a Worker (`worker-forms` skill), never into client JS.
- Prefer a plain `<script>` for small behaviour; reach for a React island (`react` skill) only when state/derived UI justifies the extra JS.

---


# TypeScript Skill

## tsconfig baseline (apps)
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```
Never loosen `strict`. Fix the types, don't silence them.

## Rules
- **No `any`.** Use `unknown` for untrusted data and narrow it. If unavoidable, isolate it and comment why. Avoid `as` casts and `!` non-null assertions; prefer narrowing, type guards, `satisfies`.
- `interface` for object shapes that may be extended; `type` for unions, intersections, mapped/conditional types.
- Prefer **string-literal unions** over `enum`: `type Status = 'idle' | 'loading' | 'error'`. Use `as const` objects for value+type.
- Use `import type { X }` / `import { type X }` for type-only imports (required by `verbatimModuleSyntax`).
- Let inference work for locals; **annotate** exported function params/returns and public APIs.
- Prefer `readonly`, `ReadonlyArray<T>`, immutability.
- Model state with **discriminated unions**, and check exhaustiveness:
```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function assertNever(x: never): never { throw new Error(`Unexpected: ${String(x)}`); }
switch (s.kind) { case 'a': … ; case 'b': … ; default: assertNever(s); }
```
- `satisfies` validates a value against a type while keeping its narrow inferred type:
```ts
const routes = { home: '/', about: '/about' } as const satisfies Record<string, `/${string}`>;
```

## Generics & utility types
```ts
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> { … }
type Props = React.ComponentProps<'button'> & { variant?: 'solid' | 'ghost' };
```
Know: `Partial, Required, Readonly, Pick, Omit, Record, Exclude, Extract, NonNullable, ReturnType, Parameters, Awaited, InstanceType, NoInfer`. Keep generics simple; constrain with `extends`; avoid deeply recursive conditional types.

## Runtime validation
Types vanish at runtime. Validate all external data (API, forms, env, `JSON.parse`, `searchParams`) with **Zod** (or Valibot) and infer the type:
```ts
const User = z.object({ id: z.string().uuid(), email: z.string().email() });
type User = z.infer<typeof User>;
const user = User.parse(await res.json());
```

## React + TS
- Props: `type Props = { … }`; use `React.ReactNode` for children, `React.ComponentProps<'el'>` to extend DOM props. React 19: `ref` is a normal prop; no `forwardRef` needed.
- `useState<User | null>(null)`, typed `useReducer` with discriminated action unions.
- Event types: `React.ChangeEvent<HTMLInputElement>`, `React.FormEvent<HTMLFormElement>`.
- Avoid `React.FC`.

## Errors
`catch (e)` is `unknown`: `if (e instanceof Error) …`. Create typed error classes or `Result` types for expected failures.

## Tooling
`tsc --noEmit` in CI, `typescript-eslint` (strict + stylistic), `@total-typescript/ts-reset` optional, Vitest for tests. Use project references/`tsc -b` in monorepos. Generate types from OpenAPI/GraphQL/DB schema rather than hand-writing.

## Anti-patterns
`any`/`as any`, `// @ts-ignore` (use `@ts-expect-error` with a reason), double assertions `as unknown as T`, overloading where a union works, enums, optional-everything types, duplicating types instead of deriving (`typeof`, `keyof`, `ReturnType`).

## In this project (Astro + UIkit static site)
- `tsconfig.json`: `{ "extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist"], "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "react" } }` (JSX options required for React islands). Run `astro check` (needs `@astrojs/check` + `typescript`) in CI; it type-checks `.astro` files.
- Type component props: `interface Props { title: string; }` then `const { title } = Astro.props;` in the frontmatter.
- `@types/uikit` supplies UIkit types; declare `declare module 'uikit/dist/js/uikit-icons';` in `src/env.d.ts` if the icons import is untyped.
- Worker code: run `npx wrangler types` to generate `worker-configuration.d.ts` (`Env`), and do not hand-write binding types.
- Validate any external data (forms, JSON, env) with Zod (`zod` skill).

---


# Zod 4 Skill

Astro 7 bundles Zod 4: **`import { z } from 'astro/zod'`** in Astro projects (content collections, build-time code). `astro:content` does **not** export `z`; never import it from there. In standalone code (Worker) `npm i zod` and `import { z } from 'zod'` (v4 is the default export of the `zod` package; v3 code lives at `zod/v3`). Always use the same import style as the surrounding file.

## Basics
```ts
import { z } from 'zod';
const Contact = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.email('Invalid email'),            // top-level format validators (v4)
  message: z.string().min(10).max(2000),
  subscribe: z.stringbool().default(false),   // "true"/"on"/"1" → boolean (great for FormData)
  website: z.string().max(0).optional(),      // honeypot
});
type Contact = z.infer<typeof Contact>;       // output type (z.input<> for pre-transform)

const result = Contact.safeParse(data);
if (!result.success) {
  const flat = z.flattenError(result.error);  // { formErrors, fieldErrors }
  const tree = z.treeifyError(result.error);  // nested
  console.error(z.prettifyError(result.error));
} else { result.data /* typed */ }
```
- Prefer `safeParse` for user input; `parse` (throws `ZodError`) for build-time/config data where failing loudly is desired.
- `await schema.parseAsync/safeParseAsync` if schema has async refinements.

## Zod 4 API changes (don't write the old forms)
| v3 | v4 |
|---|---|
| `z.string().email()` / `.url()` / `.uuid()` / `.ip()` | `z.email()` / `z.url()` / `z.uuid()` / `z.ipv4()` `z.ipv6()` (method forms deprecated) |
| `.datetime()` | `z.iso.datetime()`, `z.iso.date()`, `z.iso.time()` |
| `{ message: '…' }` | `{ error: '…' }` (or error function `(issue) => …`); `message` still accepted but deprecated |
| `invalid_type_error`, `required_error` | single `error` param |
| `z.object({}).strict()` / `.passthrough()` | `z.strictObject({})` / `z.looseObject({})` |
| `.merge(b)` | `.extend(b.shape)` or spread shapes |
| `error.format()` / `.flatten()` | `z.treeifyError()` / `z.flattenError()` |
| `z.nativeEnum(E)` | `z.enum(E)` |
| `z.string().nonempty()` | `.min(1)` |
| `.default()` on transforms | default short-circuits (value is the **output** type); use `.prefault()` for input-side default |
| `z.record(z.string())` | `z.record(z.string(), z.string())` (two args required) |
| `ZodEffects` | refinements stay on the schema itself (`.refine` returns same type) |
Use `z.toJSONSchema(schema)` for JSON Schema; `z.coerce.*` for string→number/date (note: coerce input type is `unknown`).

## Patterns
```ts
// Discriminated union (fast, great errors)
const Event = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), x: z.number() }),
  z.object({ type: z.literal('key'), key: z.string() }),
]);

// Cross-field validation
const Range = z.object({ from: z.coerce.date(), to: z.coerce.date() })
  .refine((v) => v.to >= v.from, { error: 'End must be after start', path: ['to'] });

// Transform + pipe
const Slug = z.string().transform((s) => s.toLowerCase().replace(/\s+/g, '-'));
const Port = z.string().pipe(z.coerce.number().int().min(1).max(65535));

// Parse FormData
const parsed = Contact.safeParse(Object.fromEntries(await request.formData()));

// Reuse
const Update = Contact.partial(); const Pick = Contact.pick({ email: true });
```
- Validate **at boundaries**: content frontmatter, form bodies, query strings, JSON from APIs, env vars. After validation, pass typed data around; do not re-validate in every function.
- Bound everything: `.max()` on strings/arrays (protects Workers from abuse); never accept unbounded input.
- Never echo raw `ZodError` internals to end users; map to friendly field messages.
- Keep schemas in a shared file (`src/lib/schemas.ts`) when both the React form island and the Worker validate the same shape; the island imports the same module (tree-shaken; consider `zod/mini` if bundle size matters). In shared code used by the Worker use `zod`, in Astro-only code use `astro/zod` (same Zod 4 API).

## Astro specifics
- Collections: `schema: ({ image }) => z.object({ cover: image().optional(), pubDate: z.coerce.date() })`; `reference('authors')` for relations. Dates in frontmatter are strings, so use `z.coerce.date()`.
- Build fails on schema mismatch: fix the content, don't loosen to `z.any()`.
- `z` is **not** available from `astro:content`: always `import { z } from 'astro/zod'` in `content.config.ts`.

## Anti-patterns
`z.any()`/`z.unknown()` as an escape hatch, `parse` on user input without try/catch, duplicating TS types by hand (infer them), v3 method-style format checks, schemas without length limits, validating on the client only.

---


# Static Site Quality Skill

## SEO
- Per page: unique `<title>` (≤ 60 chars), meta description (120–160), canonical `new URL(Astro.url.pathname, Astro.site)`, `<html lang>`, one `<h1>`, descriptive link text, `alt` on images.
- Open Graph/Twitter: `og:title/description/image(1200×630)/url/type`, `twitter:card=summary_large_image`. Generate OG images at build time from templates if many pages.
- `@astrojs/sitemap` (needs `site`), `public/robots.txt` with `Sitemap: https://example.com/sitemap-index.xml`; `noindex` drafts/404; `@astrojs/rss` for blogs.
- JSON-LD in `<script type="application/ld+json" set:html={JSON.stringify(data)} />` (Organization, WebSite, Article, BreadcrumbList). Escape `<` in JSON when content is user-derived.
- Stable URLs: keep trailing-slash policy consistent across Astro, Cloudflare `html_handling`, canonical, sitemap, internal links. Use `_redirects` for moved pages.

## Performance (aim: LCP < 2.5 s, INP < 200 ms, CLS < 0.1)
- Ship no JS unless needed. Check `dist/_astro/*.js` sizes after build; every React island adds React runtime + code, so use `client:visible`/`client:idle` and few islands.
- Images: Astro `<Image>`/`<Picture>` with AVIF/WebP, explicit `sizes`; LCP image `loading="eager" fetchpriority="high"`; everything else lazy.
- Fonts: self-host WOFF2 (Astro Fonts API if available in your version, or `@fontsource-variable/*`), subset to needed glyphs, `font-display: swap`, preload only the one critical file, match fallback metrics to avoid CLS.
- CSS: inline-critical is automatic for small CSS (`build.inlineStylesheets: 'auto'`); import UIkit only once; trim Less components not used.
- Prefetch: Astro `prefetch` config (`viewport`/`hover`) for snappy navigation; skip on heavy pages.
- Cache: `/_astro/*` immutable via `_headers` (see `cloudflare-workers`). HTML revalidates.
- Third parties (analytics, embeds, maps): lazy-load, facade for YouTube (`lite-youtube`-style), or avoid. Prefer privacy-friendly/cookieless analytics (Cloudflare Web Analytics, Plausible).

## Accessibility (WCAG 2.2 AA)
- Landmarks, skip link, visible focus, logical tab order, no keyboard traps.
- Contrast ≥ 4.5:1 text, 3:1 UI/large text; don't use color alone.
- Respect `prefers-reduced-motion` (disable UIkit parallax/autoplay/scrollspy animations), `prefers-color-scheme` where themed.
- Targets ≥ 24×24 CSS px; forms with labels, error text, `autocomplete`.
- Test: keyboard walkthrough, 200% zoom/reflow at 320px, screen reader smoke test, axe DevTools / Lighthouse accessibility.

## Security & privacy
- Security headers via `public/_headers` (CSP, HSTS, nosniff, Referrer-Policy, frame-ancestors, Permissions-Policy). Start CSP in `Content-Security-Policy-Report-Only` if unsure.
- No secrets in the repo or in `PUBLIC_*` env vars; the static bundle is world-readable.
- Subresource Integrity for any unavoidable external script; prefer none.
- `rel="noopener noreferrer"` on `target=_blank`; sanitize any HTML rendered with `set:html`.
- Privacy: no tracking without consent where required (GDPR/ePrivacy); cookieless analytics avoids banners. Provide privacy page, contact via Worker form with Turnstile (`worker-forms`).

## Pre-release checklist
- [ ] `npx astro check && npx astro build` clean (no warnings about routes/schemas; Rust compiler HTML errors fixed)
- [ ] Inline whitespace visually checked (Astro 7 `compressHTML: 'jsx'`); React islands hydrate without console warnings
- [ ] `npx wrangler dev` smoke test: 404 page, redirects, trailing slashes, headers (`curl -I`)
- [ ] Lighthouse mobile ≥ 90 on key pages; no console errors/CSP violations
- [ ] Links checked (no 404s), sitemap/robots/canonical correct, OG preview verified
- [ ] Forms work end-to-end (success, validation error, rate-limit)
- [ ] a11y keyboard/zoom pass; reduced-motion honored
- [ ] `compatibility_date` and dependencies reviewed (`npm outdated`, `npm audit`)

---


# Worker + Static Assets (forms/API) Skill

Keep the site static. Add **one small Worker** that handles `/api/*` and lets every other request fall through to static assets. This does not require the Astro Cloudflare adapter.

## wrangler.jsonc
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-site",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-05",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "404-page",
    "run_worker_first": ["/api/*"]          // only these paths invoke the Worker; rest is free static serving
  },
  "vars": { "ALLOWED_ORIGIN": "https://example.com" },
  "observability": { "enabled": true }
}
```
Secrets: `npx wrangler secret put TURNSTILE_SECRET` (and e.g. `RESEND_API_KEY`). Local: `.dev.vars` (gitignored). Then `npx wrangler types` → `worker-configuration.d.ts` provides `Env`.

## worker/index.ts
```ts
import { z } from 'zod';

const Contact = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(200),
  message: z.string().trim().min(10).max(2000),
  company: z.string().max(0).optional(),           // honeypot: must be empty
  'cf-turnstile-response': z.string().min(1),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return json({ error: 'Forbidden' }, 403);
      if (Number(request.headers.get('Content-Length') ?? 0) > 20_000) return json({ error: 'Too large' }, 413);

      const parsed = Contact.safeParse(Object.fromEntries(await request.formData()));
      if (!parsed.success) return json({ errors: z.flattenError(parsed.error).fieldErrors }, 422);

      const ok = await verifyTurnstile(parsed.data['cf-turnstile-response'], request.headers.get('CF-Connecting-IP'), env.TURNSTILE_SECRET);
      if (!ok) return json({ error: 'Captcha failed' }, 400);

      // send email / store (Resend, Email Workers, D1, KV, queue) — never log personal data
      return json({ ok: true });
    }
    return env.ASSETS.fetch(request);               // fallback to static assets
  },
} satisfies ExportedHandler<Env>;

async function verifyTurnstile(token: string, ip: string | null, secret: string) {
  const body = new FormData();
  body.set('secret', secret); body.set('response', token); if (ip) body.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  return ((await r.json()) as { success: boolean }).success;
}
```

## Client side (Astro page)
```astro
<form id="contact" method="post" action="/api/contact" class="uk-form-stacked">
  <label class="uk-form-label" for="name">Name</label>
  <input class="uk-input" id="name" name="name" required autocomplete="name">
  …
  <input type="text" name="company" tabindex="-1" autocomplete="off" class="uk-hidden" aria-hidden="true"> <!-- honeypot -->
  <div class="cf-turnstile" data-sitekey={import.meta.env.PUBLIC_TURNSTILE_SITEKEY}></div>
  <button class="uk-button uk-button-primary" type="submit">Send</button>
  <p id="status" role="status" aria-live="polite"></p>
</form>
<script is:inline src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>
  const form = document.querySelector<HTMLFormElement>('#contact')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch(form.action, { method: 'POST', body: new FormData(form) });
    document.querySelector('#status')!.textContent = res.ok ? 'Thanks, message sent.' : 'Please check the form and try again.';
  });
</script>
```
If the form is a React island (`react` skill), reuse the same Zod schema and post the same `FormData`. The form still posts natively without JS (progressive enhancement); return a redirect/thank-you page for non-JS submissions if needed. Add `https://challenges.cloudflare.com` to CSP `script-src`, `frame-src`, `connect-src`. The Turnstile **site key is public**, the secret is not.

## Rules
- Validate with Zod **in the Worker** (client validation is UX only); bound sizes; return field-level errors (422), generic errors otherwise.
- Anti-abuse layers: Turnstile + honeypot + Origin check + Cloudflare WAF rate limiting rule (dashboard) or Rate Limiting binding.
- CORS only if cross-origin; same-origin form needs none.
- Don't store more personal data than required; define retention; mention it in the privacy page.
- Worker code is TypeScript in `worker/`, separate from Astro's `src/`; add it to `tsconfig` `include` or give it its own tsconfig with `@cloudflare/workers-types` generated by `wrangler types`.
- Test: `npx astro build && npx wrangler dev`, then `curl -i -X POST localhost:8787/api/contact -F …`. Unit-test with Vitest + `@cloudflare/vitest-pool-workers`.
- Only Worker responses cost invocations; static assets stay free.