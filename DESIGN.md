# Design System — CryptoHawk

This document codifies the design system already implemented in
`src/app/globals.css` and `src/app/layout.tsx`. Source of truth lives in code;
this file explains the *why* and the *vocabulary* so future contributors keep
the system coherent without rereading every CSS line.

## Product Context

- **What this is:** Real-time crypto market dashboard for Binance USDⓈ-M Futures
  with technical analysis, futures signal engine, AI auditor, watchlist, alerts,
  signal journal, screener, and Telegram worker.
- **Who it's for:** Disciplined retail crypto traders who want a deterministic,
  data-dense workspace for futures analysis (not a casino UI, not a beginner
  onboarding flow).
- **Space/industry:** Crypto futures trading dashboards. Peers: TradingView,
  Coinglass, Glassnode, Binance Futures terminal, CoinMarketCap Pro.
- **Project type:** Data-dense web app (Next.js 16 App Router). Has secondary
  marketing surfaces (`/`, `/coin/[symbol]`) but is primarily an app, not a site.

## Aesthetic Direction

- **Direction:** Industrial/Utilitarian × Refined Dark Terminal.
  Function-first, data-dense, minimal decoration. Reads like a Bloomberg
  terminal that grew up.
- **Decoration level:** Minimal. Hierarchy comes from typography and spacing,
  not from gradients, blobs, or drop shadows. Cards are flat solid surfaces
  with hairline borders. Hover lifts the border, not the geometry.
- **Mood:** Serious software for serious work. Calm under load. The numbers
  are the design.
- **What this is *not*:** Playful, gradient-heavy, "crypto bro" maximalism,
  AI-generated SaaS pastel.

### Memorable thing

**Calm density.** A user looking at twenty data points should feel oriented,
not overwhelmed. Every visual decision serves that.

## Typography

Self-hosted via `next/font/google` in `src/app/layout.tsx`. CSS variables feed
the rest of the app.

- **Display/Hero (`--font-display`):** Space Grotesk (500, 600, 700).
  Slightly geometric, slightly humanist. Tightens beautifully at display
  sizes via `--tracking-display: -0.02em`. Used for headings, page titles,
  numeric displays.
- **Body (`--font-body`):** Inter (400, 500, 600, 700). Optimized for UI
  density. Used for body, labels, table cells.
- **UI/Labels:** Same as body (Inter).
- **Data/Tables:** Inter with `font-variant-numeric: tabular-nums` via the
  `.numeric` utility. Tabular-nums is non-negotiable for prices, sizes, PnL,
  funding rates — anything where columns must align across rows.
- **Code:** Not currently used in the UI surface. If/when needed, prefer
  JetBrains Mono or Geist Mono.
- **Loading:** Self-hosted via `next/font` with `display: 'swap'` and weight
  subsetting. No external Google Fonts request at runtime; no FOUT past the
  swap window.

### Type scale (px / line-height)

| Token | Size | Line height | Use |
|---|---|---|---|
| `--text-eyebrow` | 11px | 1.4 | Uppercase labels, section eyebrows |
| `--text-micro` | 11px | 1.4 | Inline annotations, badges |
| `--text-caption` | 12px | 1.45 | Captions, small metadata |
| `--text-body-sm` | 13px | 1.5 | Compact body, tight panels |
| `--text-body` | 14px | 1.55 | Default body |
| `--text-h3` | 16px | 1.4 | Panel section title |
| `--text-h2` | 20px | 1.3 | Section heading |
| `--text-h1` | 24px | 1.25 | Page heading |
| `--text-display-sm` | 30px | 1.2 | Marketing surface |
| `--text-display-md` | 36px | 1.15 | Marketing hero |
| `--text-display-lg` | 48px | 1.05 | Largest display |

### Weights (named tokens)

`--font-weight-regular: 400`, `--font-weight-medium: 500`,
`--font-weight-semibold: 600`, `--font-weight-bold: 700`. Four weights — keep
the palette intentionally narrow. Avoid magic `font-[xxx]` values.

### Tracking

`--tracking-display: -0.02em` (display sizes), `--tracking-tight: -0.01em`
(headings), `--tracking-normal: 0em` (body), `--tracking-wide: 0.04em`,
`--tracking-eyebrow: 0.08em` (uppercase labels — wider so caps read as
deliberate micro-typography rather than cramped).

### Recipe utilities

`.h1`, `.h2`, `.h3`, `.display-sm`, `.display-md`, `.display-lg`, `.eyebrow`
combine size + family + weight + tracking + color in one class. Prefer these
over stacking 4–5 utility classes at the call site.

## Color

**Approach:** Restrained. Cool dark neutrals do most of the work; a single
cyan accent carries primary affordance; market direction uses green/red.
Color is rare and meaningful.

### Backgrounds (cool deep navy)

| Token | Hex | Use |
|---|---|---|
| `--color-bg-app` | `#05070d` | Page background. Almost-black with a navy bias. |
| `--color-bg-surface` | `#0b1020` | Card / panel base. |
| `--color-bg-surface-raised` | `#111827` | Elevated surfaces, modals, popovers. |
| `--color-bg-surface-soft` | `#131a2a` | Inline secondary regions inside cards. |

### Borders

| Token | Hex | Use |
|---|---|---|
| `--color-border-subtle` | `#1f2937` | Hairline default. |
| `--color-border-strong` | `#334155` | Hover state, focused regions. |

### Text

| Token | Hex | Use |
|---|---|---|
| `--color-text-primary` | `#f8fafc` | Primary text. |
| `--color-text-secondary` | `#a7b0c0` | Secondary, captions. |
| `--color-text-muted` | `#64748b` | Eyebrows, deemphasized labels. |

### Accents

| Token | Hex | Use |
|---|---|---|
| `--color-accent-primary` | `#38bdf8` | Cyan. Primary action, focus, links. |
| `--color-accent-secondary` | `#8b5cf6` | Violet. Glow on focused inputs only. |
| `--color-accent-warm` | `#f59e0b` | Amber. Warnings, warm callouts. |
| `--color-focus-ring` | `#7dd3fc` | Lighter cyan for focus outlines. |

### Market

Green/red are reserved for direction. Do not reuse for unrelated states.

| Token | Hex | Use |
|---|---|---|
| `--color-market-up` | `#22c55e` | Up move, gains, long. |
| `--color-market-down` | `#ef4444` | Down move, losses, short. |
| `--color-market-neutral` | `#94a3b8` | Flat, no direction. |
| `--color-fear` | `#f97316` | Fear & Greed Index "Fear" zone (25–44). Orange. |
| `--color-greed` | `#84cc16` | Fear & Greed Index "Greed" zone (56–74). Lime. |

The F&G gradient runs `market-down → fear → accent-warm → greed → market-up`
across 5 stops. `fear` and `greed` exist solely to bridge the red→amber→green
ramp; do not reuse them for generic warning/success states.

### Semantic

| Token | Hex | Use |
|---|---|---|
| `--color-success` | `#22c55e` | Confirmation, healthy state. |
| `--color-warning` | `#f59e0b` | Caution, stale data, soft errors. |
| `--color-danger` | `#ef4444` | Hard errors, destructive actions. |

### Dark-only

The app sets `class="dark"` at `<html>` and `color-scheme: dark` at the root.
There is no light mode today. If light mode is added later it should be a
deliberate redesign of surfaces and accents — do not just invert.

## Spacing

- **Base unit:** Tailwind 4 default (4px scale). No custom override.
- **Density:** Comfortable for app surfaces, compact within data tables.
- **Containers:**
  - `--container-app: 1440px` — full app frame max width.
  - `--container-content: 960px` — narrower content surfaces.
  - `--container-prose: 72ch` — long-form reading width.
- **Page frame shorthand:** `.container-app` collapses
  `mx-auto w-full max-w-[1440px] px-4 lg:px-6` into one class.

## Layout

- **Approach:** Grid-disciplined inside the app, slightly more generous on
  marketing surfaces. No editorial overlap, no asymmetric grid-breaking.
  Predictable alignment is the point.
- **Border radius scale:**
  - `--radius-sm: 8px` — buttons, small chips.
  - `--radius-md: 14px` — cards, panels, default surfaces.
  - `--radius-lg: 18px` — larger elevated surfaces.
  - `--radius-pill: 999px` — pills, scroll thumbs, full-round controls.
- **Surface primitives:**
  - `.card` — solid surface, hairline border, subtle elevation, opt-in entrance
    animation.
  - `.panel` — flat surface, hairline border, no elevation. For inline
    sub-sections that don't need to stand out.
- **Z-index layers** (use named utilities, not arbitrary values):
  - `z-dropdown: 30` — popovers anchored to a trigger.
  - `z-header: 40` — sticky header.
  - `z-overlay: 50` — drawers, modals, full-screen sheets.
  - `z-toast: 60` — toast notifications.
- **Elevation:**
  - `--shadow-elev-1` — default card lift.
  - `--shadow-elev-2` — hover, popovers.
  - `--shadow-elev-3` — heavier elevated surfaces.
  - `--shadow-overlay` — drawers and modals.

## Motion

- **Approach:** Intentional. Motion communicates state changes (entrance,
  press, focus, price flash); it never decorates. Full reduced-motion override
  in `globals.css`.
- **Easing tokens:**
  - `--ease-out` — decelerate. Content entering.
  - `--ease-in` — accelerate. Content leaving.
  - `--ease-in-out` — balanced. State-to-state travel.
  - `--ease-spring` — slight overshoot. Press/tap micro-feedback.
- **Animation tokens:**
  - `--animate-in: enter 0.2s ease-out`
  - `--animate-fade-in: fade-in 0.18s ease-out`
  - `--animate-slide-up: slide-up 0.22s ease-out`
  - `--animate-price-flash: price-flash 0.6s ease-out`
- **Duration buckets:**
  - micro (50–100ms) — hover state changes.
  - short (150–250ms) — entrances, fades, slide-ups.
  - medium (250–400ms) — modals, drawers, collapsibles.
  - long (400–700ms) — price flash, signature transitions.
- **Specialized keyframes** in `globals.css`: `bubble-in-right`,
  `bubble-in-left` (chat messages), `typing-wave` (typing indicator), `shimmer`
  (skeletons), `toast-progress`, `spring-in` (toast/modal entrance),
  `soft-pulse` (idle empty-states), `collapsible-in` (height-grid trick).
- **Interaction primitives:**
  - `.interactive` — calm hover via border + faint shadow. No translate, no
    glow. Prevents fighting dense data layouts.
  - `.pressable` — gentle scale-down on `:active`, spring eased.
  - `.glow-on-focus` — soft violet ring on `:focus-visible` for textual inputs.
- **Reduced motion:** All animations and transitions collapse to ~0.01ms when
  `prefers-reduced-motion: reduce` is set. Hover lifts and press scales also
  disable.

## Component Conventions

- **Numeric data** must use the `.numeric` utility (or
  `font-variant-numeric: tabular-nums`) so columns align. Mandatory in tables,
  ladder views, market overview, journal PnL.
- **Tap targets** for icon-only buttons must hit 44×44 (WCAG 2.5.5). Use the
  `.tap-target` flex wrapper when the inner glyph is smaller.
- **Card stagger** is opt-in via `.card-stagger` on the parent (dashboards,
  market grids only). Don't stagger banners, drawers, or single cards.
- **Scroll affordance:** apply `.scroll-x-hint` to horizontal scrollers; the
  trailing edge fades to signal more content. Toggle `.scroll-x-end` when the
  scroller hits the right edge.
- **Selection:** `::selection` uses cyan at 20% opacity to match accent color
  without fighting body text contrast.
- **Scrollbars** are 6px webkit thumbs colored by `--color-border-strong` /
  hovered to `--color-text-muted`. Track is `--color-bg-app`.

## Accessibility Notes

- All accent text passes 4.5:1 against `--color-bg-app` and `--color-bg-surface`.
- `aria-label`s for price changes use `formatPercentageMagnitude` so screen
  readers say "down 2.50%" instead of "down -2.50%". Visible labels keep the
  signed `formatPercentage` so the visual cue stays consistent. See
  `src/lib/shared/a11y/price-change-label.ts`.
- Focus rings: `.focus-ring` provides a 2px solid `--color-focus-ring` outline
  with 2px offset for any element that needs an explicit focus indicator
  beyond the default browser outline.
- Reduced motion is honored across all animation tokens (see Motion above).

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-25 | Codified the existing system in DESIGN.md | The system already shipped in `globals.css`. Documenting it preserves intent so future sessions don't re-derive choices or accidentally drift. |
| Pre-existing | Refined dark technical-terminal aesthetic | Trader workflow is data-dense and long-session; a calm dark surface reduces eye strain and lets price/volume color do the lifting. |
| Pre-existing | Inter + Space Grotesk via `next/font` (self-hosted) | Self-hosting avoids runtime Google Fonts requests and removes a privacy/perf cost. Inter for UI density, Space Grotesk for slightly more character at display sizes. |
| Pre-existing | Cyan as the only primary accent; violet only as focus glow | Restrained color frees up green/red exclusively for market direction. Avoids the "every state is a different color" trap. |
| Pre-existing | Calm hover (border + faint shadow), no translate or glow | Translate-on-hover fights dense data layouts; glow rings clutter the screen when many cards are visible at once. |
| Pre-existing | Tabular-nums everywhere numeric | Non-negotiable for any price/size/PnL column. Misaligned digits break the "calm density" memorable thing. |
| Pre-existing | `output: 'standalone'` in `next.config.ts` for cPanel hosting | Originally targeted cPanel Node hosting; Vercel doesn't need it. Keep until cPanel target is fully retired. |

## Notes for AI Tools

- **Source of truth:** `src/app/globals.css` (tokens) and
  `src/app/layout.tsx` (font setup). DESIGN.md explains the *why*; the CSS is
  the *what*. If the two ever disagree, the CSS wins and DESIGN.md is updated
  to match.
- **Inter and Space Grotesk:** appear on common "overused font" lists.
  We use them anyway because they fit the calm-density brief and are already
  shipped in production. Do not propose swapping them without an explicit user
  request and a coherence check on Space Grotesk's display-size tightening.
- **Anti-slop guarantees:** no purple/violet gradients (violet is a focus glow
  only), no 3-column SaaS feature grid with iconed circles, no
  centered-everything marketing layout, no gradient CTAs, no decorative blobs,
  no system-ui as a primary font.
- **Before changing visuals:** read this file and confirm the change either
  fits an existing token or proposes a new token with a rationale. Do not add
  arbitrary `bg-[#xxx]`, `text-[xxx]`, or `font-[xxx]` values.
