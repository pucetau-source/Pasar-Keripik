# Design System: Pasar Keripik Admin

Frosted-glass shell, Apple-like, **light mode only** (there is no dark mode; the app always renders light). Two selectable color palettes share one set of components: **Green** (default) and **Blue** (the earlier blue/indigo look). The leaf stays as the default, changeable logo and follows the palette accent.

## North star
"Frosted control glass." Dense daily-use business software made to feel considered without slowing anyone down. Sidebar, topbar and every page card are panes of frosted glass lifted off a soft gradient backdrop with a directional shadow and a light-catching top edge. Selection reads as a physical state.

- Every chrome/content surface (sidebar, topbar, page cards, modals) = translucent glass, never flat opaque. Blur only on the few large panels.
- Two depth states: **raised** (glass shadow + light top edge) and **recessed** (inset: segmented-control track; blue palette also the active nav item).
- Backdrop = gradient on the outermost shell div (`bg-backdrop`), fixed behind scrolling content, in `vh`/`vw` units.
- Exactly **one title per page**, in the shell topbar, with `.title-glow`. Page content never restates it; cards lead with a short description line.
- Owner constraint: **no dead space**. Cards size to their content.
- Rejected: flat single-color cards with plain 1px border, heavy saturated tints, literal 3D transforms, any dark theme.

## Palettes
Chosen in Settings (Tema warna / Color theme), stored in `localStorage` key `pk_palette` (`green` | `blue`), applied as `<html data-palette="...">`. The inline no-flash script in `index.html` sets it before first paint; `lib/theme.jsx` (`useTheme()` -> `{ palette, setPalette }`) keeps it in sync. `:root` holds the Green values; `:root[data-palette="blue"]` overrides them. **All differences are CSS variables** in `src/index.css` consumed through Tailwind tokens; components never branch on the palette and never use hard-coded `blue-*`/`slate-*`/`gray-*` classes.

| | Green (default) | Blue |
|---|---|---|
| Accent (`brand-*`) | emerald; 600 `#058c62`, 700 `#047857` | blue-600 `#2563eb`, 700 `#1d4ed8` |
| Backdrop | pink/lavender top-left fading to light lime top-right and bottom-right | blue top-left, indigo top-right |
| Glass | white 60-84%, white 1px edge, soft violet-tinted shadow | white 80-85%, slate 10% edge, slate shadow |
| Panel radius (`rounded-2xl`) | 20px | 16px |
| Buttons, chips, nav items, segmented control | fully round (pill) | 8px / 12px |
| Inputs | 12px | 8px |
| Active nav item | white pill, green text/icon | blue-50 recessed, blue text/icon |
| Segmented/tab thumb (selected) | solid green pill, white text | white raised thumb, blue text |
| Text ink | navy `20 27 51` | slate-900 |

Shared: Inter Variable font (self-hosted `@fontsource-variable/inter`), small uppercase muted labels (`text-xs font-semibold uppercase tracking-wider text-ink-mute`), red for alerts/badges.

## Colors
- Channel-triplet tokens (`ink`, `ink-soft`, `ink-mute`, `surface`, `sunken`, `mist-*`, `brand-50/100/500/600/700`) so Tailwind opacity modifiers work. Use `bg-brand-600`, `text-brand-700`, `border-brand-600`, never `blue-*`.
- Semantic data colors (`danger`, `warn`, `ok`) are identical in both palettes: red alerts, stock-status green/yellow/red, status pills. Never recolor to match the brand.
- Text must stay readable on the pastel backdrop: body ink on glass (>= 60% white) or `ink-mute` (`92 104 128`) at minimum; never put text directly on the bare gradient except the page lead line (ink-soft).
- One Material Rule: every floating surface uses the same glass recipe. No one-off shadows/opacities.

## Typography
- Font: `"Inter Variable", Inter, system-ui fallbacks`.
- Page title: `text-xl font-bold` + `.title-glow` (`--title-glow`: soft white halo in Green, blue/indigo glow in Blue), once per page in the topbar (>= 1024px) or mobile header.
- Card lead text `text-sm font-medium` ink-soft; body `text-sm`; micro-label as above (sidebar group headings, table heads).

## Layout
- Desktop (>= 1024px): shell padding and gap 16px; sidebar and main column are separate floating panels; sidebar `lg:rounded-2xl`.
- Below lg: sidebar becomes a full-height slide-in drawer (unrounded, 90% white so it stays readable over the scrim); topbar collapses to a compact mobile header.
- Stack page cards with `gap-4`/`gap-5`.
- Sidebar groups with micro-labels (KATALOG: Produk, Kategori, Satuan; PENGATURAN: Pengaturan), user card at the bottom with gear.

## Elevation and glass (variables in `index.css`, Tailwind tokens in `tailwind.config.js`)
- Tailwind `boxShadow`: `glass` -> `var(--shadow-glass)`, `glass-lg` -> `var(--shadow-glass-lg)`, `glass-inset` -> `var(--shadow-inset)`. There are no `-dark` variants.
- `backgroundImage.backdrop` -> `var(--backdrop-img)`; `borderRadius.2xl` -> `var(--r-panel)`.
- Recipes (component classes): `.glass` (no blur, many small cards), `.glass-blur` (sidebar, topbar), `.glass-lg` (modals; blur). Backgrounds `--glass`, `--glass-blur`, `--glass-lg`; edge `--glass-border`.
- Other palette variables: `--r-btn --r-input --r-nav --r-seg`, `--nav-on-*`, `--seg-*`, `--shadow-btn`, `--title-glow`, `--focus`, `--focus-ring`, `--row-hover`.
- `shadow-glass`: sidebar, topbar, page cards; `shadow-glass-lg`: modals and clickable cards on hover.

## Components
- Nav item at rest: transparent, `text-ink-soft`, hover `--btn-hover`; active (`aria-current="page"`): `--nav-on-bg/-fg/-shadow`. `min-h-11`; visible focus ring on every interactive element (`--focus`). The settings gear in the user card uses `.nav-on` when active.
- Segmented control `.seg`: recessed track, one selected thumb (`--seg-on-*`). Used for language and the Settings color theme.
- Primary button `.btn-primary`: `bg-brand-600` (hover `brand-700`), white text; `.btn-soft` secondary; `.btn-danger`.
- Dropdown popovers (Select) use the glass-lg recipe; no glass on toasts, toasts, chart tooltips, table rows (never shadow each row).
- Logo leaf fill/stroke use `--brand-600/700`.

## Don'ts
No dark mode or `dark:` variants, no flat opaque cards, no hard-coded brand colors in components, no one-off shadows, no title-glow outside the page title, no `overflow-hidden` on the floating content card (it clips long pages).

## Performance guardrails (owner priority #1)
Limit `backdrop-filter` to the few large panels (sidebar, topbar, modals), not per-row/per-chip. Solid translucent fallbacks under `@supports not (backdrop-filter: blur(1px))` and `prefers-reduced-transparency`. First-load JS stays < 150 KB gzip (currently about 102 KB).
