# Oscillation Records — Brand Design Sheet

> **A Record Label That Puts Artists First**

This is the single source of truth for the Oscillation Records visual identity. The
values below are taken directly from the live design system ([app/globals.css](app/globals.css),
[app/layout.tsx](app/layout.tsx), and the logo assets) — keep this file and the code in sync.

---

## 1. Name & tagline

| Field | Value |
| --- | --- |
| **Name** | Oscillation Records *(singular "Oscillation")* |
| **Tagline** | A Record Label That Puts Artists First |
| **Short descriptor** | Independent, artist-first record label |

**Writing the name**

- Always **Oscillation Records** — never "Oscillations" (plural), "Oscillation Recordz", or "OR" in body copy.
- The casual handle `oscillationrecordz` exists only as the admin account login and is **not** public-facing brand copy.
- The web/domain form is `oscillationrecords.com`.

---

## 2. Logo

| Asset | File | Use |
| --- | --- | --- |
| Icon mark | [public/logo-icon.svg](public/logo-icon.svg) | Favicons, avatars, tight spaces, app/nav corner |
| Wordmark | [public/logo-name.svg](public/logo-name.svg) | Headers, footers, anywhere with horizontal room |
| Tab / source image | [public/logo-tab.jpeg](public/logo-tab.jpeg) | Raster source for the browser-tab icon |

**Wordmark construction** — the wordmark is two-tone: the primary word renders in
**white (`#FFFFFF`)** and the secondary word in **graphite (`#454545`)**. Preserve this
two-tone relationship; do not recolor one word without the other.

**Clear space** — keep padding around the logo equal to the height of the icon mark on all sides.

**Don'ts**

- Don't stretch, skew, or rotate.
- Don't add drop shadows, gradients, or outlines.
- Don't place the white wordmark on a light background — use the dark surface (see §3) or an inverted treatment.
- Don't recreate the wordmark in a different typeface.

---

## 3. Color

The product is **dark-first** (the root `<html>` ships with the `dark` class). The palette is
intentionally monochrome — ink, white, and a graphite/grey ramp — with red reserved exclusively
for destructive/error states.

Colors are authored in **OKLCH** (the canonical values in `globals.css`); hex equivalents are
**approximate** and provided for design tools only.

### Core

| Token | OKLCH (canonical) | Hex (approx) | Role |
| --- | --- | --- | --- |
| Ink / Surface | `oklch(0.1684 0 0)` | `#0F0F0F` | Primary dark background |
| White | `oklch(1 0 0)` | `#FFFFFF` | Primary text on dark, primary wordmark |
| Graphite | — | `#454545` | Secondary wordmark, low-emphasis marks |

### Dark theme ramp (default)

| Token | OKLCH | Hex (approx) | Role |
| --- | --- | --- | --- |
| `--background` | `oklch(0.1684 0 0)` | `#0F0F0F` | Page background |
| `--foreground` | `oklch(1 0 0)` | `#FFFFFF` | Body text |
| `--primary` | `oklch(0.922 0 0)` | `#E5E5E5` | Primary buttons / emphasis |
| `--muted-foreground` | `oklch(0.708 0 0)` | `#A1A1A1` | Secondary text, captions |
| `--secondary` / `--muted` / `--accent` | `oklch(0.269 0 0)` | `#262626` | Cards, hovers, fills |
| `--border` | `oklch(0.2221 0 0)` | `#1B1B1B` | Hairlines, dividers |
| `--input` | `oklch(0.1913 0 0)` | `#141414` | Field backgrounds |
| `--destructive` | `oklch(0.704 0.191 22.216)` | `#F1554F` | Errors, delete actions only |

### Light theme ramp

| Token | OKLCH | Hex (approx) | Role |
| --- | --- | --- | --- |
| `--background` | `oklch(1 0 0)` | `#FFFFFF` | Page background |
| `--foreground` | `oklch(0.1684 0 0)` | `#0F0F0F` | Body text |
| `--muted` / `--secondary` / `--accent` | `oklch(0.97 0 0)` | `#F5F5F5` | Cards, fills |
| `--muted-foreground` | `oklch(0.556 0 0)` | `#737373` | Secondary text |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `#E5484D` | Errors, delete actions only |

**Rules**

- Red is **only** for destructive intent (delete, irreversible, error). Never decorative.
- Maintain high contrast: white on ink, ink on white. Avoid mid-grey text on mid-grey fills.
- New surfaces should reference the existing tokens, not introduce raw hex values.

---

## 4. Typography

Two Google fonts, loaded via `next/font` in [app/layout.tsx](app/layout.tsx).

| Family | CSS variable | Role | Weights |
| --- | --- | --- | --- |
| **Lato** | `--font-lato` | Primary — body & UI (the `<body>` default) | 100, 300, 400, 700, 900 |
| **Inter** | `--font-inter` | Secondary sans — supporting/system contexts | Variable (all weights) |

**Type voice** — the identity leans on **light weights** and **tight tracking**. Headings are
typically `font-light` with `tracking-tighter`; this restraint is core to the look.

| Style | Spec | Example use |
| --- | --- | --- |
| Display / H1 | Lato, `font-light`, `tracking-tighter`, ~2xl–4xl | Page hero titles |
| Heading / H2 | Lato, `font-light`–`font-normal`, `tracking-tight` | Section titles |
| Body | Lato, `font-normal` (400) | Paragraphs, UI copy |
| Caption / Meta | Lato, 300/400, `text-muted-foreground` | Timestamps, labels |
| Emphasis | Lato, 700/900 | Sparingly, for strong callouts |

**Don'ts**

- Don't introduce additional typefaces.
- Don't set body copy in heavy weights — keep it 400.
- Don't widen letter-spacing on headings (the brand is *tight*, not airy).

---

## 5. Layout, shape & motion

| Property | Value | Notes |
| --- | --- | --- |
| Corner radius | `--radius: 0.625rem` (10px) | Plus `sm/md/lg/xl` derived steps |
| Surfaces | Flat, dark, minimal | Glass-morphism (backdrop blur) on the navbar |
| Density | Generous whitespace | Let artwork breathe |
| Scrollbars | Hidden via `.no-scrollbar` | For carousels / horizontal rails |

**Motion** — subtle and functional, not flashy.

- Music player enters with the `player-slide-up` animation (`slideUp`, 0.3s ease-out).
- Use [motion](https://motion.dev) for entrance/scroll reveals; keep durations short (~0.3s) and easing soft.

---

## 6. Voice & tone

- **Artist-first.** The label exists to serve artists; copy centers them, not the company.
- **Confident & minimal.** Few words, high signal. Mirrors the visual restraint.
- **Modern & warm.** Contemporary and human, never corporate or jargon-heavy.
- **Honest.** No hype or false scarcity.

**On-brand:** "A record label that puts artists first." / "New music from our roster."

**Off-brand:** "🔥 The #1 BEST label EVER!!!" / dense legalese in marketing surfaces.

---

## 7. Quick reference (copy/paste tokens)

```text
Name        Oscillation Records
Tagline     A Record Label That Puts Artists First
Ink         oklch(0.1684 0 0)   ~#0F0F0F
White       oklch(1 0 0)        #FFFFFF
Graphite    #454545
Error red   oklch(0.704 0.191 22.216)  ~#F1554F (dark) / oklch(0.577 0.245 27.325) ~#E5484D (light)
Radius      0.625rem (10px)
Body font   Lato (100/300/400/700/900)
Sans font   Inter (variable)
Heading     font-light + tracking-tighter
Theme       dark-first
```
