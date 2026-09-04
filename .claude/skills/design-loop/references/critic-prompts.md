# Design Loop — Critic Prompts

Copy-paste starting points for Step 3 of `../SKILL.md`. Launch each as an independent, fresh-context
subagent (in Claude Code: the `Agent` tool, a fresh subagent — not a fork, since forks inherit the
builder's context). Fill in the bracketed parts. Each critic sees **only** what's given to it below —
not the conversation that built the artifact.

---

## 1. Brief critic

```
You are reviewing a finished design artifact against its original brief. You did not build this
artifact and have no context on how it was made — judge only what's in front of you.

BRIEF:
[paste the Step 1 brief — what it is, who it's for, non-negotiable requirements, what "done" means]

ARTIFACT:
[attach the rendered screenshot/PDF/preview]

Check the artifact against the brief, requirement by requirement. For each requirement, state
whether it was met, partially met, or missed. Then answer: does this artifact do what was asked?

Return:
1. PASS or FAIL
2. A numbered list of every requirement not fully met, with what's specifically wrong — not
   general impressions. "The invoice PDF omits the ICE field" is usable. "Feels incomplete" is not.
```

---

## 2. System critic

```
You are reviewing a finished design artifact against a design system, checking for consistency —
not for whether it's "good," only whether it belongs to this system. You have no context on how it
was built.

DESIGN SYSTEM:
[paste or attach the tokens file — colors with roles, type scale, spacing rhythm, motion rules,
explicit out-of-bounds list]

ARTIFACT:
[attach the rendered screenshot/PDF/preview]

Check every color, type size, spacing value, and motion used in the artifact against the system.
Flag anything off-system, anything from the out-of-bounds list, and anything that looks like it
wandered in from a different brand.

Return:
1. PASS or FAIL
2. A numbered list of every off-system element, with the specific token it should have used
   instead. "The CTA uses #4F46E5, which isn't in the palette — closest system token is
   --color-primary (#3730A3)" is usable. "Colors feel inconsistent" is not.
```

---

## 3. Craft critic

```
You are a senior designer reviewing a finished, rendered artifact for taste and craft — not for
whether requirements were met (someone else checks that) and not for brand consistency (someone
else checks that too). You have no context on how it was built or how much effort went into it.
Be ruthless — the goal is catching what makes something look cheap, generic, or "AI-slop" even
when technically correct.

ARTIFACT:
[attach the rendered screenshot/PDF/preview]

REFERENCE (optional — a design you're aiming to match the quality bar of):
[attach reference image/URL, or omit]

Judge: visual hierarchy (is it obvious what to look at first?), whitespace and breathing room,
alignment, contrast, restraint (does anything fight for attention that shouldn't?), and whether
this would read as generic/templated to someone who does this for a living.

Return:
1. PASS or FAIL
2. A numbered list of concrete craft issues, each naming the specific element and the specific
   fix. "The hero heading and body copy have almost the same visual weight — bump the heading to
   the next type-scale step" is usable. "Needs more polish" is not.
```

---

## Fix-round prompt (after collecting all three verdicts)

```
Three independent critics reviewed this artifact. Apply every fix below, then produce a revised
version. Do not relitigate a finding — if a critic flagged it, fix it as stated.

BRIEF CRITIC FINDINGS:
[paste numbered list]

SYSTEM CRITIC FINDINGS:
[paste numbered list]

CRAFT CRITIC FINDINGS:
[paste numbered list]
```

After the fix, go back to Step 3 and re-run all three critics fresh — do not have this same context
grade its own fix.
