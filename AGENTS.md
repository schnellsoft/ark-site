
## Remember

This site is a presentation site of a very serious dental clinic of medium size. The design should be proffesional, so offer me your suggestions any time you consider, ask me if I accept your directions / advices / considerations. Be free to improve it any time. You are an expert web designer.

The theme is dark. 
The header is fixed to the top.
The main content should never be covered by the header other by scrolling, so should be no zone in the main impossible to be seen.
Anmations should be smooth, so you have to use requestAnimationFrame any time you consider possible.
You are free to consider your own media query breakpoints and not to take as good those from examples that I'll offer to you for behavior inspiring.
You are free to consider your own best implementation practices (css, js) and not to take as good those from examples that I'll offer to you for behavior inspiring. The behavior is the purpose, the way to it is your decision. 
As you know, there are 2 buckets: ark-admin-media, ark-admin-content 

## variables
For the following descriptions:
- the word logomin means the path ark-admin-media/header/logo/logo_min.png
- the word logomax means the path ark-admin-media/header/logo/logo_max.png
- the word header_logo_json means ark-admin-content/header/logo/header_logo.json
- the word header_menu_json means ark-admin-content/header/menu/header_menu.json
- the word header_icons_json means ark-admin-content/header/icons/header_icons.json

## images embedding

`ark-admin-media` is the source of truth for uploaded images. On every rebuild, pull only the images referenced by `ark-admin-content` JSON and bake them into the static site — do not rely on runtime `/media/*` for those assets.
If svg is found in json file, it is embedded directly inside the static site.

### Pipeline

```
ark-admin-content (JSON)  →  read at build (which image keys are needed)
ark-admin-media (images)  →  download those keys into src/assets/media/<key>
astro build               →  Sharp optimizes via <Image> / <Picture> into dist/
wrangler deploy           →  static assets; R2 remains CMS source only
```

### Where to write files

- **Default: `src/assets/media/`** (mirror the R2 object key under this folder). Required for Astro `<Image>` / `<Picture>` resize, format conversion (WebP/AVIF), and responsive `srcset`.
- **Not `public/` for general media.** Files in `public/` are copied as-is: no Sharp resize, no responsive layouts. Use `public/` only for non-processed site chrome (favicon, `robots.txt`, `_headers`).
- **logomin / logomax:** sync into `src/assets/media/header/logo/` like other media. Choose logomin vs logomax by viewport in CSS/markup; do not treat them as SVG icons.

### Authoring

- Prefer `import { Image } from 'astro:assets'` with a local import (or `import.meta.glob` / `getImage()` mapped from content JSON keys).
- Do not use string paths like `src="/media/..."` when you need optimization — that path style is for `public/` and skips processing.
- Generated/synced trees under `src/assets/media/` may be gitignored if CI always re-downloads before build; originals stay in R2.

### Checklist

- [ ] Build downloads content JSON first, then only referenced media keys
- [ ] Synced files land under `src/assets/media/`, not `public/media/`
- [ ] Page images use `<Image>` or `<Picture>` (or `getImage()`), not raw unoptimized copies
- [ ] Rebuild + redeploy after CMS media changes

## design directions  
- use as primary color the color: #FFE082

----------

# Skill: Cross-Platform Icon Adaptation (Desktop ↔ Mobile)

Use this when adding or styling UI icons (header, nav, buttons, overflows). One SVG with a proper `viewBox` is enough for desktop and mobile — adapt **CSS size, stroke, hit target, and feedback**, not separate raster assets (logos like logomin/logomax are the exception: swap by viewport).

## Principles

1. Always set `viewBox` on SVGs; control rendered size with CSS (`width` / `height`).
2. Prefer size tokens in `rem` (or `em` when the icon sits next to text) over one-off `px`.
3. Separate **glyph size** from **tap/click target** — grow padding/`min-*` on touch, not only the SVG.
4. Adapt with `(pointer: coarse)` / `(hover: hover) and (pointer: fine)`, not viewport width alone.
5. Use `currentColor` (or primary `#FFE082` where brand fill is required) so icons follow theme/text.
6. Decorative icons: `aria-hidden="true"` + `focusable="false"`. Accessible name lives on the `<button>` / `<a>`, not the SVG.

## Dimensional & touch targets

| Metric | Desktop | Mobile / coarse pointer | Why |
| --- | --- | --- | --- |
| Visible icon | 16 / 20 / 24 (`rem` tokens) | 24 / 28 / 32 when density needs it | Legibility on smaller screens / glare |
| Min hit area | ≥ 24×24 (aim 32×32) | ≥ 44×44 (Apple) / 48×48 (Android) | Finger vs mouse precision |
| Stroke | 1 – 1.5 | 1.5 – 2 | Thicker strokes stay clear when small |
| Gap between targets | ≥ 8px | 12 – 16px | Fewer mis-taps |

Standard UI grid: `viewBox="0 0 24 24"`. Keep a single glyph size when chrome is dense; bump size + stroke when icons feel thin on phone.

## Design rules

- **Simplify on mobile:** drop unnecessary inner detail if the icon muddies at small size.
- **Outline vs filled:** outline is fine for dense desktop; use filled variants for active / critical nav on touch.
- **No hover-only labels on mobile:** never hide essential meaning behind tooltips; show micro-labels or clear context.
- **Touch feedback:** pair `:active` with opacity or `transform: scale(0.94–0.95)`.
- **Placement:** primary mobile actions in the lower ~60% (thumb zone); desktop utilities in top bar / corners.
- **Logos:** use **logomin** / **logomax** from R2 by viewport — do not treat them as scalable SVG icons.

## CSS pattern

```css
:root {
  --icon-size: 1.25rem;       /* 20px @ 16px root */
  --icon-stroke: 1.5;
  --icon-target-min: 2rem;    /* 32px */
  --icon-gap: 0.375rem;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  min-width: var(--icon-target-min);
  min-height: var(--icon-target-min);
  padding: 0.25rem;
  gap: var(--icon-gap);
  transition: background-color 0.15s ease, transform 0.1s ease;
}

.icon-btn svg {
  width: var(--icon-size);
  height: var(--icon-size);
  stroke-width: var(--icon-stroke);
  flex-shrink: 0;
}

@media (hover: hover) and (pointer: fine) {
  .icon-btn:hover {
    background-color: color-mix(in srgb, currentColor 6%, transparent);
    border-radius: 0.375rem;
  }
}

@media (pointer: coarse) {
  :root {
    --icon-size: 1.5rem;        /* 24px */
    --icon-stroke: 2;
    --icon-target-min: 3rem;    /* 48px */
    --icon-gap: 0.5rem;
  }

  .icon-btn:active {
    background-color: color-mix(in srgb, currentColor 12%, transparent);
    transform: scale(0.94);
    border-radius: 50%;
  }
}
```

Inline-with-text icons: size with `1em` / `1.25em` so they track the parent font. Standalone chrome icons: use the rem tokens above.

## Checklist

- [ ] SVG has matching `viewBox`; size via tokens/`rem`/`em`
- [ ] Mobile hit targets ≥ 44×44 (prefer 48×48); gaps ≥ 12px
- [ ] Stroke weight readable on dim / outdoor screens
- [ ] Hover styles gated to fine pointer; labels visible without hover on touch
- [ ] `:active` feedback on icon buttons
- [ ] Decorative vs informative a11y correct; name on the control
- [ ] Tested at ~200% zoom without clipping
- [ ] Brand fills use primary `#FFE082` where appropriate; logos use logomin/logomax

