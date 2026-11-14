---
name: ENTX
description: Entertainment made tradable, set as a live trade-press box office chart.
colors:
  accent: "#b81f19"
  accent-fill: "#d6261f"
  accent-deep: "#b81f19"
  accent-ink: "#ffffff"
  ink: "#141414"
  ink-hover: "#2c2c2c"
  newsprint: "#f4f1ea"
  panel: "#fbfaf6"
  panel-2: "#ebe6da"
  paper-white: "#ffffff"
  line: "#d9d3c5"
  line-2: "#bdb5a4"
  muted: "#5f5a4f"
  faint: "#6a6558"
  up: "#1d7446"
  down: "#c4221b"
  warn: "#8f5a00"
  sol: "#6b4fd0"
  near: "#0b746f"
  night-ground: "#12110f"
  night-panel: "#1b1a17"
  night-panel-2: "#24221e"
  night-paper: "#25231f"
  night-bar: "#0a0908"
  night-bar-field: "#1d1c19"
  night-line: "#35322c"
  night-line-2: "#504b41"
  night-ink: "#ece6d8"
  night-ink-hover: "#d4cdbd"
  night-muted: "#a69f90"
  night-faint: "#938c7d"
  night-accent: "#f45a4a"
  night-up: "#4cc085"
  night-down: "#f47c86"
  night-warn: "#e3a63f"
  night-sol: "#a493f7"
  night-near: "#3fc6b9"
  icon-invert-paper: "#dadce0"
  icon-invert-rule: "#131927"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.01em"
  rank:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "lnum, tnum"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.04em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.02em"
  table-head:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.07em"
  action:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "0.08em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "tnum"
  code:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  none: "0px"
  full: "9999px"
spacing:
  row: "6px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.newsprint}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-wallet:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "36px"
  button-wallet-hover:
    backgroundColor: "{colors.accent-deep}"
  seg-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "30px"
  seg-option-hover:
    backgroundColor: "{colors.panel-2}"
  seg-option-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.newsprint}"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
  ticket:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
  wire:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "8px 12px"
  topbar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.newsprint}"
    height: "52px"
---

# Design System: ENTX

## Overview

**Creative North Star: "The Monday Chart"**

ENTX is set as a trade-press box office chart that never goes to press: ranked rows, big condensed rank numerals, tabular figures, and the oracle as a news wire. The ground is newsprint, panels are a whiter stock laid on it, and structure comes from ink rules (a black top bar, a 2px ink rule over every panel and chart head, a double rule under page mastheads, dotted hairlines between key/value rows) rather than from fills, glows, or depth. It is a light, dense, information-first world; the reader scans what ranks where and what just moved, then acts in one tap.

The system refuses the dark crypto-exchange dashboard with glowing panels; its own dark theme, the Night Edition, is the same chart with ink and paper swapped. Color is spent on meaning: red marks the brand and the wire, green and a separate darker red mark gain and loss, two chain hues mark NEAR and Solana. Everything else is ink on paper.

The landing page at `/` (`src/app/(site)/`) is a separate surface built under its own brief; it shares this palette and type families but is not governed by this document.

**Key Characteristics:**
- Newsprint ground, whiter panel stock, white paper for the working ticket.
- Ink rules carry hierarchy: 2px ink top rule on panels and table heads, 3px double rule under mastheads.
- Two voices: Barlow Condensed uppercase for names, headings, rank numerals and the primary action; Archivo with tabular figures for every number and label.
- Square corners everywhere; only status dots are round.
- Flat panels; the only shadow belongs to floating overlays.

## Colors

Ink on newsprint, with one signal red and a disciplined set of status and chain hues, each darkened to hold 4.5:1 on paper.

### Primary
- **Signal Red** (accent, #b81f19): red as a mark. Red type, the active nav underline, the oracle wire's left rule and slug, the focus ring, text selection tint and input caret. Deepened from the press red so red type holds 4.5:1 on every paper tier (5.2:1 on Wire Stock, 5.7:1 on newsprint).
- **Press Red** (accent-fill, #d6261f): red as a fill. The wallet call to action and landing actions, with white type at 5:1.
- **Pressed Red** (accent-deep): hover state of the red fills only.

### Neutral
- **Press Ink** (ink): top bar, every structural rule, primary action fill, active segmented option, body text.
- **Ink Lift** (ink-hover): hover state of the ink primary action.
- **Newsprint** (newsprint): page ground, and text on ink.
- **Panel Stock** (panel): panel surfaces laid on the newsprint.
- **Wire Stock** (panel-2): oracle wire background, hover fill for options and list rows, disabled action fill.
- **Ticket White** (paper-white): the trade and bet tickets only, so the working surface reads as a fresh sheet.
- **Hairline** (line): panel side and bottom borders, dividers between chart rows and dateline cells.
- **Rule Grey** (line-2): dotted key/value hairlines, scrollbar thumb, off-state toggle knobs.
- **Byline Grey** (muted): captions, field labels, secondary metadata (5.6:1 on newsprint).
- **Faint Grey** (faint): disabled and least-important text (4.7:1 on newsprint).

### Status and chain
- **Gain Green** (up): positive change, YES side, the live network dot, filled Buy side of the trade toggle.
- **Loss Red** (down): negative change and the NO side. Kept distinct from Signal Red so a loss never reads as brand.
- **Caution Amber** (warn): warnings and pending states.
- **Solana Violet** (sol) and **NEAR Teal** (near): chain identity on receipt toggles, chain badges and explorer links.

### Named Rules
**The Red Wire Rule.** Signal Red marks the brand's moving parts (active section, wallet, oracle wire, focus) and nothing else. The primary trade action is ink, not red; losses use Loss Red.

**The Paper Tiers Rule.** Depth is paper stock, not shadow: newsprint ground, panel stock on it, white ticket paper for the one surface where the user commits money.

### Night Edition (dark theme)
The same chart read under lamp light, not a crypto terminal. `html[data-theme="dark"]` swaps every token in `src/app/globals.css` (landing: `public/site/landing-dark.css`); components only ever name tokens.
- **Ink and paper trade places.** Ground is warm carbon (night-ground), text and every structural rule turn cream (night-ink). The primary action and the active segmented option become cream blocks with carbon type: still "ink", now the brightest mark.
- **Tiers step lighter toward the ticket.** night-ground, then night-panel, night-panel-2 for the wire, and night-paper (the lightest stock) for the ticket. Same order as day: the surface where money is committed stands out most.
- **The bar goes deeper, not lighter.** The top bar and the landing's closing band sit on night-bar, darker than the ground, separated by the dateline's cream rule.
- **Colours brighten to hold 4.5:1** on every tier: night-accent for red as type, rules and focus; night-up and night-down (a rose, kept apart from the vermilion accent) for gain and loss; chain hues lifted the same way. Red fills (wallet, landing actions) keep the day's press red so white type stays at 5:1.
- **Status fills take carbon type** (`--on-status`), never white, because the night greens and roses are light.
- **No glow.** No halos, coloured shadows or luminous accents; the hub diagram's halo is off at night. The overlay lift deepens to `rgb(0 0 0 / 0.55)` and stays the only shadow.
- **Choosing the edition:** follows the OS by default; Settings > Edition (Day / Night / System) in the app and the sun/moon button in the landing nav store an explicit choice in `localStorage["entx-theme"]`. An inline head script (`src/lib/theme-script.ts`) applies it before first paint. Canvas charts read tokens at mount and rebuild on change (`useTheme`).

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow), weights 500 to 700
**Body Font:** Archivo (with system-ui), weights 400 to 700
**Label/Mono Font:** IBM Plex Mono, reserved for code-like strings (account ids, hashes)

**Character:** A chart-room pairing: the condensed face shouts names and ranks like a trade-paper headline; Archivo with tabular figures keeps every price, percentage and volume aligned in its column.

### Hierarchy
- **Display** (700, 34px on phones, 44px from 640px, line-height 0.95, uppercase, balanced wrap): the page masthead, one per route.
- **Rank** (700, 24px to 28px, line-height 1, lining tabular figures): rank numerals in the chart.
- **Headline** (700, 18px, uppercase, 0.04em): panel and section heads.
- **Title** (700, 17px to 20px, uppercase, 0.02em): title names in charts, mover lists and the spotlight.
- **Table head** (600, 13px, uppercase, 0.07em): chart column heads.
- **Action** (700, 15px to 18px, uppercase, 0.08em): the primary action label.
- **Body** (400, 13px to 13.5px, tabular figures): data cells, wire copy, nav links, descriptions.
- **Label** (400, 12px, Byline Grey): field and stat captions.

### Named Rules
**The Two Voices Rule.** Condensed caps name things (titles, sections, ranks, the action); Archivo states facts (every figure and label). A price or percentage is never set in the condensed face.

**The Tabular Ground Rule.** The body sets tabular figures globally; numerals are proportional sans with tabular spacing, never monospace.

## Layout

A sticky 52px ink top bar holds the wordmark, section nav, search, settings and wallet. From 768px a 40px dateline strip sits under it on newsprint with an ink bottom rule: mode badge, market stats separated by hairline cells (lower-priority stats drop out whole via container queries), receipt toggles and portfolio figure. Below 1024px the section nav moves into a left drawer.

Content sits in a main column capped at 1480px with 16px, 24px and 32px side padding at phone, 640px and 1024px, and 24px top padding. Each route opens with a masthead (display headline left, dateline and provenance right, double rule under). Wide screens split into a primary column and a narrow right rail (movers, activity, the ticket on title pages); phones stack everything in reading order. Panels pad 16px; chart rows breathe about 10px vertically; key/value rows pad 6px. Touch targets grow to 44px under coarse pointers.

## Elevation & Depth

Panels are flat. Hierarchy comes from ink rules and paper tiers: the 2px ink top rule says "a new section starts here", the double rule says "a new page starts here", and white ticket paper says "this is where you act". Floating layers that sit over content (search results, settings, demo and wallet menus, toasts, the bet popover) carry one soft ambient shadow so they read as lifted off the page; nothing at rest does.

### Shadow Vocabulary
- **Overlay lift** (`box-shadow: 0 8px 24px rgba(20,20,20,0.18)`): floating menus, dropdowns and toasts only, paired with a 2px ink border.

### Named Rules
**The Flat Page Rule.** Anything laid on the page is flat; only a layer floating above the page casts a shadow.

## Shapes

Square corners everywhere: every Tailwind radius step resolves to 0px. The only round forms are status and chain dots (full radius). Borders do the shaping: 1px hairline sides, 2px ink tops on panels, 1px ink borders on segmented options and toggles, a 4px Signal Red left rule on the wire.

## Components

### Buttons
- **Shape:** square (0px).
- **Primary:** Press Ink block with Newsprint condensed caps (Action type), 44px to 48px tall, full width in tickets; hover lifts to Ink Lift. Disabled drops to Wire Stock with muted text.
- **Wallet:** Signal Red with white Archivo 12.5px medium, 36px tall, 14px side padding; hover to Pressed Signal Red. The one red button.
- **Secondary:** 1px ink outline on transparent, same height as the primary it accompanies.
- **Press feedback:** every enabled button scales to 0.96 on press (150ms ease-out), off under reduced motion.

### Segmented control
- **Style:** separate 30px ink-outlined options with 6px gaps, Archivo 12.5px medium; hover fills Wire Stock.
- **State:** the selected option fills with ink and Newsprint text. Grows to 44px on touch.
- **Side toggle (Buy/Sell):** two joined condensed-caps halves; the active Buy side fills Gain Green.

### Cards / Containers
- **Corner Style:** square.
- **Background:** Panel Stock.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px Hairline, with a 2px Press Ink top rule.
- **Internal Padding:** 16px; heads use the Headline style.

### Ticket
The trade and bet ticket is a panel printed on Ticket White. Its figures sit in key/value rows split by dotted Rule Grey hairlines (6px row padding), ending in the full-width ink primary action and a provenance note on what is simulated and what is signed on-chain.

### Inputs / Fields
- **Style:** square, inherits the paper tier it sits on; the top-bar search is a 36px dark field with a faint light border.
- **Focus:** the global 2px Signal Red outline at 2px offset; the search field's border turns Signal Red. Caret is Signal Red.

### Navigation
- **Desktop:** Archivo 13.5px medium links in the ink bar at 65% Newsprint; the active link is full Newsprint over a 3px Signal Red bottom rule.
- **Mobile:** a 288px left drawer on newsprint with an ink header; links are 20px condensed caps on hairline-divided 48px rows, active in Signal Red.

### Chart (signature)
The market board: column heads in Table head style between a 2px ink rule above and a 1px ink rule below; rows with a large condensed rank numeral, poster thumbnail, condensed title name over a ticker byline, then tabular price, change, EPI bar, volume and a sparkline. A changed cell flashes Gain or Loss tint for 900ms.

### Oracle Wire (signature)
A news line on Wire Stock behind a 4px Signal Red left rule, slugged "ORACLE WIRE" in condensed red caps, with the latest oracle event and an explorer link on the right. It sits directly above the board so the cause of a move reads before the move.

## Do's and Don'ts

### Do:
- **Do** open every panel with the 2px ink top rule and a condensed-caps head.
- **Do** set every price, percentage, volume and count in Archivo with tabular figures.
- **Do** make the primary action an ink block with condensed caps; keep red for the wallet, the active nav rule, the wire and focus.
- **Do** print the working ticket on white paper with dotted key/value hairlines.
- **Do** label simulated figures beside the number they qualify.
- **Do** keep every corner square; reserve full rounding for status dots.

### Don't:
- **Don't** put a shadow on anything laid on the page; the overlay lift is for floating menus and toasts only.
- **Don't** use Signal Red for losses or for the primary trade action.
- **Don't** set figures in the condensed face or in monospace.
- **Don't** let the Night Edition glow: no neon accents, halos, coloured shadows or gradient panels; it is the same ink-and-paper chart with the tones swapped.
- **Don't** hard-code a colour in a component; name a token so both editions follow.
- **Don't** round corners on panels, buttons, inputs or menus.
