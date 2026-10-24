# Design System: Pasar Keripik Admin

Adopted from the owner's reference design doc (frosted-glass shell, blue/indigo brand, Apple-like). This replaces the earlier terracotta/leaf accent. The leaf stays only as the default, changeable logo.

## North star
"Frosted control glass." Dense daily-use business software made to feel considered without slowing anyone down. Sidebar, topbar and every page card are panes of frosted glass lifted off a soft blue/indigo backdrop with a directional shadow and a light-catching top edge. Selection reads as a physical state: the active nav item is recessed into the sidebar.

- Every chrome/content surface (sidebar, topbar, page cards, modals) = translucent + blurred glass, never flat opaque.
- Two depth states only: **raised** (glass shadow + light top edge) and **recessed** (inset shadow: tracks and the active/selected item). No third tier.
- Backdrop = two-color radial gradient (blue top-left, indigo top-right), in `vh` units, on the outermost shell div so it stays fixed behind scrolling content.
- Exactly **one title per page**, in the shell topbar, with `.title-glow`. Page content never restates it; cards lead with a short description line instead.
- Rejected: flat single-color cards with plain 1px border, heavy saturated tints, literal 3D/perspective transforms.

## Colors
- Brand primary blue-600 `#2563eb` (blue-400 in dark): logo mark, primary buttons, active nav text/icon, focus rings, first backdrop hue.
- Secondary indigo-600 `#4f46e5` (indigo-400 dark): second backdrop/title-glow hue only. Not a decorative accent.
- Light page floor `#f9fafb` (gray-50); glass panels white at reduced opacity. Dark page floor `#0f172a` (slate-900); glass panels slate-800 at reduced opacity.
- Functional colors stay as data semantics: red for alerts, stock-status green/yellow/red, status pills. Never recolor to match the brand and never add a look-alike decorative dot.
- One Material Rule: every floating surface uses the same glass recipe. No one-off shadows/opacities.

## Typography
Font: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Helvetica Neue", Arial, sans-serif` (no external font requests; Inter only if self-hosted).
- Page title: `text-xl font-bold` (20/700) + `.title-glow`, once per page in the topbar (desktop >= 1024px) or mobile header (< 1024px).
- Card lead text: `text-sm font-medium`, muted. Body: `text-sm` (14px). Micro-label: `text-xs font-semibold uppercase tracking-wider`, slate-400/500 (sidebar group headings).
```css
.title-glow { text-shadow: 0 0 16px rgba(37,99,235,0.28), 0 0 30px rgba(79,70,229,0.16); }
.dark .title-glow { text-shadow: 0 0 16px rgba(59,130,246,0.4), 0 0 30px rgba(99,102,241,0.22); }
```
Title-glow only on the shell page title `<h1>`. The shell derives the title from the nav data (route -> title lookup). Routes not in the nav (e.g. product form, audit) show a dynamic record-specific title (product name) instead of nothing, never zero titles.

## Layout
- Desktop (>= 1024px): shell padding and gap 16px (`lg:p-4 lg:gap-4`); sidebar and main column are separate floating panels on the backdrop; sidebar `lg:rounded-2xl`.
- Below lg: sidebar becomes a full-height edge-anchored slide-in drawer (unrounded); topbar collapses to a compact mobile header with the page title. Keep the phone bottom nav only if it does not duplicate the drawer; prefer the drawer.
- Page content: stack cards with `gap-4`/`gap-5` (stat cards, filter bar card, table card).
- Owner constraint (overrides the reference): **no dead space**. Cards size to their content; do not stretch a short page's card to fill the viewport.
- Sidebar groups with micro-labels (e.g. KATALOG: Produk, Kategori, Satuan; PENGATURAN: Pengaturan), user card at the bottom with gear.

## Elevation (tailwind boxShadow tokens)
```js
glass:              '0 1px 2px rgba(15,23,42,0.06), 0 10px 18px -8px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.9)',
'glass-dark':       '0 1px 3px rgba(0,0,0,0.45), 0 12px 22px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
'glass-lg':         '0 2px 4px rgba(15,23,42,0.08), 0 16px 28px -10px rgba(15,23,42,0.28), inset 0 1px 0 rgba(255,255,255,0.95)',
'glass-lg-dark':    '0 2px 5px rgba(0,0,0,0.5), 0 18px 32px -10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.11)',
'glass-inset':      'inset 0 1px 4px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.5)',
'glass-inset-dark': 'inset 0 1px 4px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.05)',
```
- `shadow-glass`: default for sidebar, topbar, page cards (stat cards, filter bar, table wrapper, settings sections).
- `shadow-glass-lg`: modals/dialogs and clickable cards on hover.
- `shadow-glass-inset`: active nav item, segmented-control track.
- Keep the narrow blur values; do not widen.
Backdrop tokens:
```js
'glow-light': "radial-gradient(120vh circle at 0% 0%, rgba(37,99,235,0.22), transparent 72%), radial-gradient(120vh circle at 100% 0%, rgba(79,70,229,0.18), transparent 72%)",
'glow-dark':  "radial-gradient(120vh circle at 0% 0%, rgba(37,99,235,0.34), transparent 72%), radial-gradient(120vh circle at 100% 0%, rgba(79,70,229,0.20), transparent 72%)",
```
Applied on the outermost shell div (`bg-glow-light dark:bg-glow-dark`). Glass panel recipe: `bg-white/75..80` (light), `bg-slate-800/55..60` (dark), `backdrop-blur-xl backdrop-saturate-150`, `border border-slate-900/10` / `dark:border-white/10`, plus the shadow token. Opacity never below ~70% light / ~50% dark.

## Shapes
Three radii only: 8px (`rounded-lg`) small controls; 12px (`rounded-xl`) nav items, logo mark, segmented track; 16px (`rounded-2xl`) panels, modals. No sharp corners on floating surfaces.

## Components
- Nav item at rest: transparent, `text-gray-600 dark:text-slate-300`, hover `bg-gray-100 dark:bg-slate-700` (deliberately flat). Active: `bg-blue-50 dark:bg-blue-900/30`, `text-blue-700 dark:text-blue-400`, `shadow-glass-inset dark:shadow-glass-inset-dark`. `min-h-11`; visible focus ring on every interactive element: `focus-visible:ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2`.
- Segmented control (theme/language switcher): recessed track `bg-gray-100 shadow-glass-inset rounded-xl`; one raised thumb `bg-white/95 dark:bg-slate-600 shadow-glass rounded-lg`.
- Primary button: blue-600 solid (hover blue-700), `rounded-lg`, white text; secondary: glass/outline.
- No glass on: dropdown popovers, toasts, chart tooltips (plain shadow-lg), table rows/list rows (never shadow each row), data-semantic colors.
- Every new glass/gradient/custom-token utility needs an explicit `dark:` variant.

## Don'ts
No flat opaque cards, no third depth tier, no teal/amber/terracotta or accents outside blue/indigo, no title-glow elsewhere, no `overflow-hidden` on the floating content card (it clips long pages), no hand-written one-off box-shadows.

## Performance guardrails (owner priority #1)
Limit `backdrop-filter` to the few large panels (sidebar, topbar, page cards, modals), not per-row/per-chip. Provide solid translucent fallbacks under `@supports not (backdrop-filter: blur(1px))` and `prefers-reduced-transparency`. Verify scrolling stays smooth with 20 rows/page and first-load JS stays < 150 KB gzip.
