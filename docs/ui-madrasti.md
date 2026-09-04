# UI Component Inventory — Madrasti

**Specialist:** UI Designer · **Status:** draft for approval ·
**Date:** 2026-09-04

> Aesthetic, tokens and out-of-bounds list live in **`DESIGN.md`** at the repo
> root. Read that first. This document is the component inventory and the
> states each must implement.

---

## 1. Principles for this inventory

- Components are **unstyled-by-default primitives + a variant map** (`cva`).
  No component invents a colour or a spacing value; everything resolves to a
  token from `DESIGN.md` §4.
- We are **not** installing a component library. shadcn/ui is a good default
  but its visual language is card-and-shadow, which is explicitly out of
  bounds here (`DESIGN.md` §3). Copying its primitives then fighting its
  aesthetic costs more than writing the ~15 components this product needs.
  Radix primitives are used directly where behaviour is hard (dialog,
  popover, select) — behaviour, not appearance.
- Every interactive component ships **five states**: default, hover, focus
  (visible ring, `border.focus`), disabled, and — where it mutates — pending.

## 2. Primitives

| Component | Variants | Notes |
|---|---|---|
| `Button` | primary · secondary · ghost · danger; sm/md/lg | Pending state shows a spinner **and** disables. Never a shadow. |
| `Input` | text · number · date · time | Label always present. Error text below, `aria-describedby`. |
| `NumberInput` | | `inputMode="decimal"`, tabular figures, arrow-key step. Used for marks. |
| `Select` | | Radix Select. Never for >20 options — use `Combobox`. |
| `Combobox` | | Searchable. Student and teacher pickers. |
| `Checkbox` / `Radio` | | 20px box, 44px hit area. |
| `Textarea` | | Appreciations, homework descriptions. Character count when capped. |
| `Chip` | neutral · green · amber · red · blue | Only pill-shaped element in the system. |
| `Table` | | Sticky header; sticky first column on mobile; `tabular-nums` on numeric columns; hairline rules, no zebra striping. |
| `Dialog` | | Radix. Confirmations only — never a form of substance. |
| `Toast` | success · error | Bottom on mobile, top-end on desktop. Errors persist until dismissed. |
| `Tabs` | | Term switcher, class switcher. |
| `EmptyState` | | Icon + one sentence + the action that resolves it. Never "No data". |
| `Skeleton` | | Matches the real row height so nothing shifts on load. |
| `LocaleSwitcher` | | ar · fr · en, each shown in its own script (العربية · Français · English). |

## 3. Domain components

These carry the product's identity and get the most design attention.

### `AttendanceRow`
The most-used component in the product.

- Full-width tap target, ≥ 44px, cycles present → absent → late → excused.
- Left (start): student name, `text.primary`, single line, truncating.
- Right (end): status glyph + short label in the state's token colours.
- Tapping to `late` reveals an optional inline minutes stepper on that row
  only — it must not shift the rows below.
- `aria-label` announces name and current status; changes announced via the
  parent's live region.
- **No transition on the status change.** Instant feedback (`DESIGN.md` §4.5).

### `AttendanceSummaryBar`
Sticky bottom. Live counts per state + the save button. On mobile it is the
thumb-zone action bar.

### `GradeEntryRow`
- Index, student name, `NumberInput`, absent checkbox.
- `Enter`/`Tab`/arrows move focus to the next input.
- Ticking absent clears **and disables** the input — the distinction between
  absent and zero must be physically visible (`CLAUDE.md` §6).
- Out-of-range flags inline on blur, on that row, not on save.

### `SessionCard`
Teacher home. Time, subject, class, room, and an attendance-taken indicator.
The current/next session is promoted: heavier rule above, primary action
inline. Past unmarked sessions carry an amber attention chip.

### `TimetableGrid`
- Columns Mon–Sat (**Saturday included** — Moroccan schools teach it),
  rows by time.
- Column order **mirrors in RTL**.
- Subject colour as a start-edge bar, never as the cell fill (fill would fail
  contrast for the text on it).
- Conflicts render with a red hairline and an explicit message — never
  colour alone.
- Mobile: collapses to a day-by-day list, not a scrollable grid.

### `BulletinSheet`
- The print artefact. A4 portrait, screen preview identical to print output.
- Header: school name + logo in the bulletin's language.
- Subject table: subject · average · coefficient · weighted points ·
  appreciation. `tabular-nums` throughout.
- Footer: general average, rank (if enabled — PRD Q3), absence total,
  decision, signature line.
- Renders correctly in all three languages; Arabic mirrors fully.

### `StudentIdentity`
Avatar (or initials fallback), name **in the current locale's script**, class,
Massar code. Used in every list. Photos come from presigned URLs and must
degrade to initials when absent or unauthorised.

## 4. Layout shells

- `AppShell` — start-side nav on desktop, bottom tab bar on mobile. Nav items
  differ per role. Mirrors in RTL.
- `PageHeader` — title, optional context switcher (class/term), primary
  action at the end edge.
- `PrintShell` — no chrome, `@page` A4.

## 5. Feedback

| Situation | Treatment |
|---|---|
| Loading a page | Skeleton matching final row heights |
| Submitting | Button pending state; form stays interactive-disabled |
| Success | Toast, brief |
| Validation error | Inline on the field, in the user's language |
| Permission error | Full-page state, plain sentence, no jargon |
| Network failure on save | **Marks stay on screen**, retry offered — never discard the teacher's work |
| Empty list | `EmptyState` with the action that fixes it |

## 6. Iconography

`lucide-react`, 20px default, 1.5px stroke. Directional icons (arrow,
chevron) flip under RTL; non-directional (calendar, check, user) do not.
Icons are never the sole carrier of meaning.

## 7. Implementation notes

- Tailwind v4 `@theme` holds the tokens from `DESIGN.md` §4; components
  reference utility classes that resolve to them.
- `cva` for variants, `clsx` + `tailwind-merge` for composition.
- Server Components by default. `"use client"` only where interaction demands
  it — `AttendanceRow`, `GradeEntryRow`, form shells, `LocaleSwitcher`.
- **A Biome/lint rule should reject physical spacing utilities**
  (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`)
  in `apps/web/src`. Until that rule exists it is an explicit review item —
  a physical property is the most common way RTL silently breaks.
