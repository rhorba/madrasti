# UI Designer — Anti-Slop Aesthetic Reference

Load before starting any user-facing visual design, especially a landing page, hero, or marketing
site. This is the front-loaded discipline that keeps AI-assisted design from converging on the same
generic look. It pairs with `../design-loop/SKILL.md` — this file is *prevention* (decide the
aesthetic up front); the Design Loop is *detection* (independent critics catch what slipped through).

---

## Why AI design converges ("distributional convergence")

An LLM asked to "design something modern and clean" returns the statistical center of its training
data. Everyone gets the same result. The recognizable tells:

- **Inter** (or a near-identical geometric sans) for everything
- A **purple / violet → white** (or blue → indigo) gradient, usually top-left to bottom-right
- **Four feature cards** in a row, each with a thin-line icon in a rounded square
- One weak hover state (a slight lift + shadow), nothing else moving
- Full-width sections stacked at identical rhythm, generous but uniform padding
- Glassmorphism panel over a blurry blob background
- Emoji as section bullets; a centered hero with a gradient CTA button
- Stock 3D abstract shapes or the same three isometric illustrations

None of these are *wrong* individually. Together, unprompted, they read as "made by AI in one shot."
The fix is not a better one-line prompt — it's **deciding the aesthetic before the first render**.

---

## Step 1 — Name the aesthetic (before any pixels)

Write one or two sentences committing to a specific visual point of view. Vague adjectives
("modern, clean, sleek") are how you get the center of the distribution. Be concrete and exclusive.

Examples of a *named* direction:
- "Editorial / print-inspired: a serif display face, generous but asymmetric margins, hairline
  rules, near-black on warm off-white, one ink accent. No cards, no gradients."
- "Technical / utilitarian: monospace headings, dense information, visible grid, high-contrast
  mono palette + a single signal color, borders not shadows."
- "Warm / tactile: rounded humanist sans, cream and clay palette, soft grain texture, hand-set
  feeling spacing, illustration over stock photography."
- "Brutalist-lite: oversized type, flat blocks of saturated color, hard edges, deliberate
  overlap, no rounded corners, no shadow."

Save it in the design-system brief (`design-system.md`) so every screen and every critic reads from
it. This is the single highest-leverage step.

---

## Step 2 — Mix 3 references (not 1, not 0)

Collect **three** reference artifacts the design should borrow from — ideally from *different*
domains so the result isn't a clone of any one:

```
Reference A — the type / editorial feel (e.g. a magazine site, a book cover)
Reference B — the color / mood (e.g. a film palette, a product photo, a brand you admire)
Reference C — the layout / structure (e.g. a dashboard, a portfolio grid, a newspaper)
```

Give all three to the builder with the instruction: *"reverse-engineer the shared principles into
tokens; do not copy any one of them."* One reference → plagiarism. Zero references → the
distribution center. Three from different places → something that feels authored.

---

## Step 3 — Write the out-of-bounds list

Explicitly forbid what this design will not do. Put it in the brief. Typical starting list:

- No Inter / Roboto / generic geometric sans for display (body is fine)
- No purple/violet gradients; no gradient on text
- No more than **2** accent colors
- No glassmorphism, no backdrop-blur panels
- No four-card feature row with rounded-square line icons
- No emoji as UI/section bullets
- No stock 3D abstract shapes or generic isometric illustrations
- No centered-everything hero
- No drop shadow *and* border on the same element
- Shadows only from one light direction, one elevation scale

The out-of-bounds list is what the Design Loop **System critic** enforces — write it so violations
are checkable, not vibes.

---

## Step 4 — Use `DESIGN.md` as the living contract

Keep a `DESIGN.md` (or `design-system.md`) at the repo root containing: the named aesthetic, the
three references, the token set (from `design-tokens.md`), the out-of-bounds list, and the motion
token set (from `../motion-designer/references/motion-system.md` if motion is in scope). Every design
prompt and every critic starts by reading it. Never re-decide the aesthetic per screen.

---

## Working with Claude's `/design` and `frontend-design`

- Claude Code's **`frontend-design`** skill and the **`/design`** canvas apply anti-slop guardrails —
  but only if the aesthetic is specified. Feed them the named aesthetic + references + out-of-bounds
  list from `DESIGN.md`; don't ask them to "make it look good" cold.
- Generative canvas/WebGL backgrounds and motion are the Motion Designer's domain — see
  `../motion-designer/SKILL.md`. They are anti-slop *when tied to these tokens* and slop when
  dropped in untouched.
- Whatever the tool, the rendered result still goes through the Design Loop's three fresh-context
  critics before "done" — generation guardrails reduce slop, they don't certify the absence of it.

---

## Quick checklist

- [ ] Named aesthetic written in one/two concrete sentences (no "modern/clean/sleek")
- [ ] Three references chosen, from different domains
- [ ] Token set derived from the references, not invented generically
- [ ] Out-of-bounds list written and checkable
- [ ] `DESIGN.md` exists and every prompt/critic reads it
- [ ] Motion tokens defined if motion is in scope (hand to Motion Designer)
- [ ] Rendered result queued for the Design Loop before shipping
