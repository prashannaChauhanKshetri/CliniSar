# CliniSar brand guide

<p><img src="brand/clinisar-logo.png" alt="CliniSar" width="268"></p>

The logo, colours and type, and where each one is used in the app. The shapes here are
the source of truth; the app draws exactly the same ones.

## The mark: one core, four arms

A medical cross split into five parts. The four **arms** are the modules and the
clinics; the **circle** in the middle is the shared platform they all run on.

**सार (sār)** means essence or core. The circle is the *Sar* in CliniSar.

| Measure | Value |
| ------- | ----- |
| Grid | 48 x 48 units |
| Arms | 14 x 14 units, corner radius 3.5 |
| Gap between parts | 3 units (14 + 3 + 14 + 3 + 14 = 48) |
| Core | circle, 14 units across, centred at (24, 24) |

## Colours

| Name | Hex | Used for |
| ---- | --- | -------- |
| Brand blue | `#3454D1` | the arms, buttons, the sidebar |
| Core navy | `#13215E` | the core, the wordmark |
| Soft blue | `#E8EDFB` | tints, badges |
| Ink | `#111827` | body text |

In code: `BRAND.primary`, `BRAND.navy`, `BRAND.primarySoft` and `BRAND.text` in
`frontend/src/theme.ts`.

## Type

| Font | Used for |
| ---- | -------- |
| **Plus Jakarta Sans Bold** | the wordmark (letter spacing -3%) and page headings |
| **Inter** | everything else in the app: tables, forms, labels |

Both are bundled with the app (Fontsource packages, open font licence), not loaded
from Google, so they work offline and send no visitor data elsewhere.

## Versions of the logo

| Version | Arms | Core | Wordmark | Where |
| ------- | ---- | ---- | -------- | ----- |
| Colour | brand blue | navy | navy | light backgrounds (sign-in card on phones, README) |
| On brand blue | white | navy | white | the blue sidebar and the blue sign-in panel |
| Black | black | black | black | thermal receipts, A4 printouts, stamps: the end of every printout (`print/PrintLayout.tsx`) |
| White | white | white | white | dark photos and dark backgrounds |

## Clear space and size

- Keep **one arm's width** clear on every side of the logo. Nothing else enters that
  area.
- **Mark height = 1.1 x wordmark size.** The gap between mark and wordmark is one arm's
  width.
- Smallest full logo: **96 px wide**. Smallest mark on its own: **16 px**.
- Never recolour, stretch, rotate or add effects.

## App icon and browser tab

- **App icon**: the mark in white with the navy core on a brand-blue rounded square
  (180, 96 and 48 px). `docs/brand/clinisar-app-icon.svg`; the phone home-screen
  icon `frontend/public/apple-touch-icon.png` is the same on a full square, because
  phones round the corners themselves.
- **Favicon**: the colour mark, 32 and 16 px (`frontend/public/favicon.svg`).
- **Browser tab title**: the screen, then the product: `Dashboard · CliniSar`.

## Files

| File | What |
| ---- | ---- |
| `docs/brand/clinisar-mark.svg` | the mark, colour |
| `docs/brand/clinisar-mark-on-blue.svg` | the mark for brand-blue backgrounds |
| `docs/brand/clinisar-mark-black.svg` | the mark for print |
| `docs/brand/clinisar-app-icon.svg` | the app icon |
| `docs/brand/clinisar-logo.png` | the full colour logo as a picture (README) |
| `frontend/public/favicon.svg` | the browser tab icon (same as `clinisar-mark.svg`) |
| `frontend/public/apple-touch-icon.png` | the phone home-screen icon, 180 px |

## In the code

- `frontend/src/components/Logo.tsx`: `<Logo variant="colour" | "onBlue" | "black"
  size={22} />` draws the mark and the wordmark with the proportions above (`size` is
  the wordmark's font size; the mark is 1.1 times that). `<LogoMark size={16} />` is
  the mark alone. Its tests check the shapes and the allowed colours.
- `frontend/src/theme.ts`: the colours and the two fonts (headings in Plus Jakarta
  Sans Bold, everything else Inter).
- `frontend/src/components/layout/AppLayout.tsx`: the tab title per screen.
