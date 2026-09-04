# Design System Brief — Fill-in Template

Use this for Step 0 of `../SKILL.md`. Save the filled-in result as `design-system.md` in the
project so every future prompt and every critic reads from the same source of truth. If a
`ui-designer` design-tokens file already exists for the project, extend that one instead of
creating a second source of truth.

```markdown
## Colors
| Role                | Token             | Value   | Used for |
|----------------------|-------------------|---------|----------|
| Primary              | --color-primary    | #______ | main CTAs, links, active states |
| Primary (hover/dark) | --color-primary-2  | #______ | hover states |
| Secondary            | --color-secondary  | #______ | supporting actions |
| Background           | --color-bg         | #______ | page background |
| Surface              | --color-surface    | #______ | cards, panels |
| Text                 | --color-text       | #______ | primary text |
| Text (muted)         | --color-text-muted | #______ | secondary/meta text |
| Border               | --color-border     | #______ | dividers |
| Success              | --color-success    | #______ | confirmations |
| Warning              | --color-warning    | #______ | caution states |
| Danger               | --color-danger     | #______ | errors, destructive actions |

## Typography
- Family: ______ (+ fallback stack)
- Scale ratio: ______ (e.g. 1.25 major third)
- Steps in use: xs / sm / base / lg / xl / 2xl / 3xl — with the value and where each is used
- Weights in use: ______ (name only the ones actually used, not every weight the font ships)
- Line-height: body ______, headings ______

## Spacing
- Base unit: ______px
- Scale in use: ______ (list only the steps actually used, not the full theoretical scale)

## Motion
- Durations in use: ______
- Easing: ______
- What's allowed to move: ______
- What never moves: ______ (e.g. "body text never animates")

## Radius / elevation
- Radius scale in use: ______
- Elevation model: ______ (shadow-based / border-based / surface-lightening — pick one, don't mix)

## Explicit out-of-bounds
List what this system forbids, not just what it allows — this is what the System critic enforces:
- [ ] No gradients
- [ ] No glassmorphism / frosted-glass panels
- [ ] No AI-generated stock imagery/illustration
- [ ] No more than ___ accent colors on screen at once
- [ ] ______ (add project-specific constraints — e.g. "must remain legible when printed
      grayscale," "must mirror correctly in RTL")

## Source of truth
- [ ] Reverse-engineered from existing assets — list them: ______
- [ ] Designed fresh for this project
- Exported/saved to: ______ (file path)
```
