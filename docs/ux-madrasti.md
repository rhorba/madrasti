# UX Design — Madrasti

**Specialist:** UX Designer · **Status:** draft for approval ·
**Date:** 2026-09-04

---

## 1. The constraint that governs everything

Fatima has 90 seconds between classes, one hand on a phone, and 30 students
in front of her. If marking attendance is not close to instant, she will keep
using the paper register and the product is dead — not rejected loudly, just
quietly unused.

So: **the attendance flow is the product.** Everything else is arranged
around not getting in its way.

## 2. Screen inventory

Marked ● where the screen is on a critical path.

### Public
- ● Login
- Forced password change (first login)

### Teacher
- ● **Home — "now"**: today's sessions, the current one first
- ● **Take attendance**: one class, one session
- ● **Grade entry**: one assessment, whole class
- Assessments list (per class+subject, per term)
- Homework list + compose
- My timetable (week)
- My classes → student list → one student's record
- Appreciations (per student per subject, at bulletin time)

### Admin
- Home: today at a glance — absences flagged, sessions unmarked
- Year & terms · Levels · Subjects · Classes
- ● Students: list, search, create/edit, enrol
- Guardians: list, link to students
- Teachers: list, create, assign subjects
- ● Timetable builder (per class, week grid)
- ● Bulletins: generate → review → publish (per class per term)
- Accounts: provision, reset password, deactivate
- School settings

### Parent
- ● Home: my children, each with today's homework and recent marks
- Child → grades (per term) · absences · homework · bulletin · timetable

### Student
- ● Home: homework due, recent marks
- My grades · my absences · my timetable · my bulletin

## 3. The critical flow — take attendance

Target: **≤ 3 taps from login, < 15 seconds to mark a class.**

```
  Login  ──►  TEACHER HOME                      ──►  ATTENDANCE
              ┌──────────────────────────┐          ┌────────────────────────┐
              │ Aujourd'hui  ·  Lundi 14 │          │ 5ème A · Maths · 09:00 │
              │                          │          │ ──────────────────────  │
              │ ▸ 09:00 Maths   5ème A   │  tap     │ Amine Kabbaj      ✓ P  │
              │   [ Faire l'appel ]  ────┼────────► │ Salma Rami        ✓ P  │
              │                          │          │ Youssef Tazi      ✓ P  │
              │   10:00 Maths   6ème B   │          │ Nour El Amrani    ✓ P  │
              │   14:00 Maths   5ème A   │          │ …                      │
              └──────────────────────────┘          │ ────────────────────── │
                                                     │ 28 présents · 0 absent │
                                                     │ [   Enregistrer   ]    │
                                                     └────────────────────────┘
```

Design rules for this screen:

1. **Everyone starts present.** The teacher touches only the exceptions.
   This is the whole speed argument — a full class is one tap total.
2. **One row per student, tap the row to cycle** present → absent → late →
   excused. No dropdown, no modal, no separate detail page. The tap target is
   the full row width, ≥ 44px tall.
3. **Status is colour *and* glyph** — ✓ P, ✗ A, ◷ R, ! E. Never colour alone
   (`CLAUDE.md` §9, and it must survive greyscale printing).
4. **Running count at the bottom**, always visible, so she can sanity-check
   against the room before saving.
5. **Save is explicit**, not autosave-on-tap. She needs to be able to fix a
   mis-tap without it already being a record. One button, sticky at the
   bottom, thumb-reachable.
6. **Late needs minutes** — but asking for them inline would break the rhythm.
   Tapping to `late` records it immediately with no minutes; a small inline
   stepper appears on that row only, optional, ignorable.
7. **Already-marked sessions reopen in place**, showing what was recorded,
   editable. Same screen, same code path. A correction is not a special mode.
8. **Offline is not handled in v1** and this is a real risk — school wifi is
   unreliable. Mitigation: the save is one small request, and a failure keeps
   the marks on screen with a retry rather than discarding them. Flagged as
   the top candidate for v1.1.

## 4. The second flow — grade entry

Target: enter 30 marks without lifting hands from the keyboard.

```
  ┌──────────────────────────────────────────────────┐
  │ Contrôle n°2 · Maths · 5ème A · /20 · coef 2     │
  │ ────────────────────────────────────────────────  │
  │  1. Amine Kabbaj        [ 14.5 ]   ☐ absent      │
  │  2. Salma Rami          [ 16   ]   ☐ absent      │
  │  3. Youssef Tazi        [      ]   ☑ absent      │
  │  4. Nour El Amrani      [ 11.5 ]   ☐ absent      │
  │ ────────────────────────────────────────────────  │
  │  27 saisies · 1 absent · moyenne 12,8            │
  │  [ Enregistrer ]                                  │
  └──────────────────────────────────────────────────┘
```

- A flat list, one input per student. **Never one student per page.**
- `Enter` and `Tab` move to the next input. Arrow keys work.
- Numeric keypad on mobile (`inputMode="decimal"`).
- Out-of-range values flag inline, immediately, on that row — not on save.
- **Absent is a checkbox, not a zero.** Ticking it clears and disables the
  score input, which makes the distinction physically obvious
  (`CLAUDE.md` §6).
- Live class average at the bottom — teachers use it to spot a mis-keyed
  digit (a stray `145` moves it visibly).
- Partial saves are fine. She can enter half now and half tonight.

## 5. Teacher home — "what am I teaching now"

Not a dashboard. No charts, no KPI tiles. A list of today's sessions in time
order, with the current or next one visually first and carrying the primary
action. Past sessions show whether the register was taken, so an unmarked one
is obvious.

Secondary, below the fold: homework due to be set, assessments awaiting
grades.

## 6. Parent home

Khadija opens this to answer one of three questions, so those three are the
whole screen:

```
  ┌──────────────────────────────┐
  │ Youssef · 2ème année collège │
  │ ─────────────────────────────│
  │ Aujourd'hui   présent        │
  │ À rendre      Maths, demain  │
  │ Dernière note Français 14/20 │
  │ [ Voir le détail ]           │
  ├──────────────────────────────┤
  │ Salma · 5ème primaire        │
  │ …                            │
  └──────────────────────────────┘
```

One card per child. If she has one child, no list chrome — straight to the
content.

## 7. RTL — Arabic is not a translation, it is a mirror

Arabic is the client's first-named language. Every screen is designed in
Arabic *and* French, not designed in French and then flipped.

What must mirror:
- Reading direction, text alignment, table column order.
- Navigation position, drawer side, back-chevron direction.
- Progress and timeline direction; the timetable grid's day order.
- Icons with direction (arrows, chevrons). Icons without it (a calendar, a
  check) do **not** flip.

What must not change:
- Numerals (marks, times) stay Western Arabic by default — Moroccan schools
  write `14/20`, not `١٤/٢٠`. Configurable if the school disagrees.
- Time ranges read `08:00–09:00` in both directions.
- The logo.

Mechanically: logical properties only (`ms`/`me`/`ps`/`pe`/`start`/`end`),
never `ml`/`pl`/`left`. `dir` on `<html>`.

Arabic at the same px as Latin reads smaller — Arabic needs a size and
line-height bump. Set as a token, not per-component.

## 8. Cross-cutting rules

1. **Defaults over inputs.** Today's date, the current term, the current
   year, present. The user confirms rather than chooses.
2. **Never ask for what the system knows.** The timetable already knows what
   she teaches at 09:00 on Monday.
3. **≤ 3 taps** to any critical action.
4. **Nothing hard-deletes** in the academic record. Destructive actions
   confirm, and say what will happen in plain words.
5. **Empty states are designed** and say what to do next, not "No data".
6. **Errors in the user's language, in plain words.** Never a raw Postgres or
   Zod string.
7. **Mobile-first at 360px.** The desktop layout is the enhancement.
8. Touch targets ≥ 44px. Primary actions in the bottom thumb zone on mobile.

## 9. Accessibility

- Keyboard-reachable throughout; visible focus rings (grade entry is
  keyboard-primary by design).
- Labelled inputs; the student's name is the input's label in grade entry.
- Contrast ≥ 4.5:1 for text, ≥ 3:1 for UI boundaries.
- **Never colour alone** — every attendance state has a glyph and a text
  label available to assistive tech.
- Attendance save announces its result to screen readers via a live region.
- Respect `prefers-reduced-motion`.

## 10. Print

Bulletins and class lists are printed and handed over physically — this is
Morocco, and the paper copy is the one families keep.

- A4 portrait, real margins, no clipped columns.
- School name and logo in the header, in the bulletin's language.
- No navigation, no buttons, no dark backgrounds.
- Attendance states legible in greyscale (hence glyphs, §3.3).
- Arabic bulletins print RTL correctly — verified on a real print, not just
  in the browser preview.

## 11. Open UX questions

Tied to `prd-madrasti.md` §8:

- Does the school have an existing bulletin layout to reproduce? (Q2)
- Appreciations: free text or a fixed picklist? A picklist is much faster for
  teachers and translates cleanly to three languages. **Recommend picklist +
  optional free-text override.** (Q4)
- Is class rank shown to families, or only to staff? (Q3)
- Do primaire teachers want a simple daily register instead of per-session?
  (Q9)
