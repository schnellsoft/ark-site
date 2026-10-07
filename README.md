# Ark site

Static Astro site deployed to Cloudflare Workers, with R2 bindings for admin media and content.

## Stack

- Astro 7 (static / SSG) + React islands
- Cloudflare Workers (static assets + Worker for R2)
- R2 buckets: `ark-admin-media`, `ark-admin-content`

## Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Astro local dev |
| `npm run build` | Build static site to `./dist` |
| `npm run preview` | Build + `wrangler dev` (assets + Worker + local R2) |
| `npm run deploy` | Build + deploy Worker and assets |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` from Wrangler config |

## Cloudflare layout

- **Worker** (`worker/index.ts`): read-only R2 routes, then fall through to static assets
- **Assets**: `./dist` from `astro build`
- **R2**
  - `MEDIA` → `ark-admin-media` (served at `/media/*` and `/api/media/*`)
  - `CONTENT` → `ark-admin-content` (served at `/content/*` and `/api/content/*`)

Populate objects with Wrangler or your admin app, for example:

```sh
npx wrangler r2 object put ark-admin-content/pages/home.json --file=./home.json
npx wrangler r2 object put ark-admin-media/hero.jpg --file=./hero.jpg
```

Then fetch:

- `https://<your-worker>/content/pages/home.json`
- `https://<your-worker>/media/hero.jpg`

## Deploy

1. Confirm buckets exist (already created in this account):

   ```sh
   npx wrangler r2 bucket list
   ```

2. Set `site` in `astro.config.mjs` to your real domain (and update `robots.txt` Sitemap if needed).

3. Deploy:

   ```sh
   npm run deploy
   ```

4. Optional custom domain: add `routes` in `wrangler.jsonc` or attach a domain in the Cloudflare dashboard.
