# DESIGN.md — Madrasti design contract

**Specialist:** UI Designer · **Status:** draft for approval ·
**Date:** 2026-09-04

> This is the living contract. Every screen and every design critique starts
> by reading this file. **Never re-decide the aesthetic per screen.**
> Companion docs: `docs/ux-madrasti.md` (flows), `docs/ui-madrasti.md`
> (component specs).

---

## 1. The named aesthetic

> **The school register, set properly.** Ruled lines and column rhythm
> borrowed from a paper cahier de notes, rendered with the precision of a
> transit timetable: hairline rules instead of cards, a dense tabular grid,
> ink-on-warm-paper contrast, and exactly one green accent that means
> "school". Nothing floats, nothing glows.

Two sentences, concrete, exclusive. It commits us to: **rules over cards**,
**density over whitespace**, **paper over glass**.

Why this and not a generic SaaS dashboard: teachers are replacing a physical
register that they trust and can read at a glance. A product that visually
descends from that object earns trust faster than one that looks like a
startup analytics tool — and the density is not decorative, it is how 30
students fit on one screen (`docs/ux-madrasti.md` §3).

## 2. Three references, three different domains

Reverse-engineer the shared principles into tokens. **Do not copy any one
of them.**

| | Reference | What we take |
|---|---|---|
| **A — type / editorial** | The Moroccan school *cahier de notes* and official bulletin scolaire | Tabular rhythm, ruled hairlines, a heavy header rule over a light body rule, names in a fixed left column, marks right-aligned |
| **B — colour / mood** | Zellige green and lime plaster of a Fez medersa — deep saturated green against warm off-white, no third colour | The restraint: one saturated accent against a warm neutral ground; green as an institutional colour, not a "success" colour |
| **C — layout / structure** | A printed railway departure board | Time-ordered rows, the imminent one emphasised, status as a compact glyph + label, scannable at arm's length in one pass |

Reference C is why the teacher's home screen is a time-ordered list with the
current session promoted, rather than a card grid.

## 3. Out of bounds

Checkable prohibitions. A violation is a review blocker, not a preference.

- **No cards with shadows.** Grouping is done with hairline rules and
  spacing. If an element needs a boundary it gets a 1px border, never a
  shadow.
- **No drop shadow and a border on the same element.** Shadows appear only on
  genuinely floating layers (dropdown, modal, sticky save bar) — one
  elevation, one light direction.
- **No gradients.** Not on backgrounds, not on buttons, never on text.
- **No purple/violet.** No glassmorphism, no backdrop-blur.
- **No more than two accent colours** — green (brand) and amber (attention).
  Attendance states are the sole exception and are semantic, not decorative.
- **No Inter, Roboto, or generic geometric sans for display.** Body is where
  a neutral sans belongs.
- **No emoji as UI or bullets.** Ever. This is an institutional record.
- **No stock illustration, no 3D shapes, no isometric anything.**
- **No four-card feature row with rounded-square line icons.**
- **No centred-everything layouts.** Content is left-aligned (start-aligned).
- **No colour-only meaning** — every state carries a glyph and a text label.
  Non-negotiable: it is an accessibility requirement *and* a greyscale-print
  requirement.
- **No rounded corners above 6px.** Nothing pill-shaped except status chips.
- **No animation over 200ms**, and none at all on the attendance and grade
  screens — motion there is latency the teacher feels.

## 4. Tokens

Primitive → semantic → component. **Never hardcode a hex or a px in a
component.** Implemented as Tailwind v4 `@theme` custom properties.

### 4.1 Colour — primitives

```
green.50  #F0F6F1   green.100 #DCEBDF   green.200 #B9D7C0
green.400 #4E9061   green.600 #2F6B43   green.700 #245334
green.900 #14301F

sand.50   #FAF9F6   ← the paper ground, warm not blue-grey
sand.100  #F3F1EC
sand.200  #E7E4DC   ← hairline rule
sand.300  #D5D1C6
sand.500  #8C877A
sand.700  #4A463D
sand.900  #1F1D18   ← the "ink"

amber.100 #FDF0D5   amber.500 #C9821A   amber.700 #8A5A0F
red.100   #FBE9E7   red.500   #B3392B   red.700   #7E2419
blue.100  #E8EFF6   blue.500  #2F6690   blue.700  #1F4460
```

Deep green, not the blue every school system uses. The ground is **warm**
(`sand.50`) — a paper white, not a screen white.

### 4.2 Colour — semantic

```
bg.base        sand.50      surface.raised  #FFFFFF
bg.sunken      sand.100     border.default  sand.200
                            border.strong   sand.300
text.primary   sand.900     border.focus    green.600
text.secondary sand.700
text.muted     sand.500     action.primary        green.600
text.on-dark   sand.50      action.primary.hover  green.700
                            action.primary.text   #FFFFFF
```

**Attendance states — colour + glyph, always both:**

```
present   ✓   text green.700   bg green.50
absent    ✗   text red.700     bg red.100
late      ◷   text amber.700   bg amber.100
excused   !   text blue.700    bg blue.100
```

All four pass 4.5:1 on their own background and remain distinguishable in
greyscale by glyph alone. Verified as a checklist item, not assumed.

### 4.3 Typography

**One family with genuine Arabic coverage: IBM Plex Sans + IBM Plex Sans
Arabic.** Chosen because the Arabic is a designed companion to the Latin
rather than a substitute face — Arabic and French screens then feel like one
product, which matters when the same teacher switches between them daily.
Open-source, self-hosted, no third-party font request.

```
--font-sans:   "IBM Plex Sans", system-ui, sans-serif
--font-arabic: "IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif
--font-mono:   "IBM Plex Mono", ui-monospace, monospace   ← marks, times
```

Scale, ratio 1.25:

```
xs 12 / 16    sm 14 / 20    base 16 / 24    lg 18 / 28
xl 20 / 28    2xl 25 / 32   3xl 31 / 40
```

**Arabic size compensation** — Arabic at the same px reads smaller:

```
[lang="ar"] { font-size: 1.0625em; line-height: 1.7; }
```

Set once as a token, never per component.

**Marks and times are tabular.** `font-variant-numeric: tabular-nums` on
every numeric column so digits align down a column of 30 students. This is
the single detail that makes a grade table look like a register instead of a
web page.

### 4.4 Space, radius, elevation

```
space   2·4·6·8·12·16·20·24·32·40·48·64      (4px base)
radius  sm 3   md 4   lg 6   full 9999 (chips only)   ← nothing softer
shadow  none (default)
        dropdown  0 2px 8px rgb(31 29 24 / 0.10)
        modal     0 8px 24px rgb(31 29 24 / 0.14)
        sticky    0 -2px 8px rgb(31 29 24 / 0.08)
```

Three shadows total, all from directly above. Everything else is flat.

### 4.5 Motion

```
duration.fast 120ms   duration.base 180ms
easing.standard cubic-bezier(0.2, 0, 0, 1)
```

Nothing above 200ms. **No motion on attendance or grade entry.** All motion
respects `prefers-reduced-motion`.

## 5. Layout

- Mobile-first, 360px baseline. Breakpoints 640 / 768 / 1024 / 1280.
- Content max-width 1200px, **start-aligned**, not centred.
- Tables: sticky header, sticky first column (student name) on mobile.
- Row height 44px minimum — a touch target and a comfortable register line.
- Sticky bottom action bar on mobile for the primary action (thumb zone).
- **Logical properties only** — `ms/me/ps/pe/start/end`. Never
  `ml/mr/pl/pr/left/right`. This is what makes RTL free; a physical property
  is a bug.

## 6. Print

Bulletins and class lists are real deliverables on paper.

- A4 portrait, 15mm margins, `@page` sized explicitly.
- Ink on white: backgrounds dropped, `text.primary` to black.
- Navigation, buttons and interactive chrome `display: none`.
- Hairline rules retained — they are the structure.
- Attendance and result states legible in greyscale via glyph.
- Arabic bulletins print RTL correctly — **verified on an actual print**, not
  a browser preview.

## 7. Checklist before any screen is "done"

- [ ] Reads from these tokens; no hardcoded hex or px
- [ ] Nothing on the out-of-bounds list (§3)
- [ ] Logical properties only; verified in `ar` RTL and `fr`/`en` LTR
- [ ] Every state carries colour **and** glyph **and** an accessible label
- [ ] Contrast ≥ 4.5:1 text, ≥ 3:1 boundaries
- [ ] Usable at 360px; touch targets ≥ 44px
- [ ] Numeric columns use tabular figures
- [ ] Loading and empty states designed, not blank
- [ ] Print stylesheet where the screen is meant to be printed
