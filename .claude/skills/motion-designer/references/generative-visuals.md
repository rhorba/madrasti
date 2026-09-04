# Motion Designer — Generative & Procedural Visuals Reference

Load when building a code-driven background or hero visual (flow field, noise, particles, gradient
mesh, shader). The goal: texture that renders unique per load and never looks like stock. The risk:
it becomes the loudest thing on the page and screams "AI landing page."

---

## When to use one at all

```
🟢 Skip          — content-heavy pages, apps, dashboards, anything with a data or reading task
🟡 Consider      — a marketing hero, a section divider, an empty state that needs warmth
🔴 Commit        — a brand/launch page where the visual IS the message, and you have perf budget
```

One generative element per page. Behind content. Low contrast against the section it sits in. If a
reader notices it before the headline, it's wrong.

---

## Techniques, cheapest first

| Technique | Renderer | Cost | Good for |
|---|---|---|---|
| Animated CSS gradient / conic mesh | CSS only | trivial | Soft ambient hero wash |
| Grain / noise overlay (SVG `feTurbulence` or tiled PNG) | CSS/SVG | trivial | Killing flat "digital" look; pairs with flat color |
| 2D noise field (Perlin/Simplex) lines or dots | canvas 2D | low | Topographic / contour hero, subtle drift |
| Flow field (particles following noise) | canvas 2D | medium | Organic movement, "wind" texture |
| Particle constellation / network | canvas 2D | medium | Overused — only if palette + density are restrained |
| Gradient mesh / metaballs | canvas 2D or WebGL | medium | Fluid blob backgrounds |
| Fragment shader (raymarch, domain warp, gradient noise) | WebGL (three.js / OGL / raw GLSL) | high | Bespoke brand moment, 🔴 only |

Prefer canvas 2D until you actually need a shader. A `<canvas>` 2D noise field at low alpha beats an
untouched three.js example every time.

---

## Anti-slop rules

- **Palette from tokens.** Pull 2-3 colors from the UI Designer's palette (usually a background
  tint + one accent at low opacity). No rainbow, no default viridis/plasma, no full-saturation
  spectrum.
- **Low contrast + low alpha.** The visual should sit 5-15% contrast above its background. It's a
  watermark, not a poster.
- **Slow or still.** Motion, if any, is drift measured in seconds per cycle, non-looping-feeling,
  and pauses off-screen. No pulsing, no beat.
- **No clichés.** No particle logo assembly, no mouse-repel particle grid as the whole hero, no
  untouched shader-toy copy, no "matrix" rain, no glowing neon wireframe globe.
- **Density restraint.** Fewer, larger, slower elements read as intentional; thousands of tiny fast
  ones read as a screensaver.
- **It must survive a screenshot.** If a still frame looks generic, the motion won't save it.

---

## Performance & accessibility

```js
// pause when off-screen
const io = new IntersectionObserver(([e]) => e.isIntersecting ? start() : stop());
io.observe(canvas);

// respect reduced motion + low power — render one static frame instead
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (still) { drawOneFrame(); } else { loop(); }
```

- Cap the loop at 60fps; throttle to 30fps for heavy fields. Use `devicePixelRatio` but clamp to 2.
- Provide a static exported image fallback (`<img>` behind the canvas, or `poster`-style) for
  reduced-motion, `save-data`, and first paint before JS runs.
- Size the canvas to its container, not the window; `ResizeObserver` to redraw, debounced.
- Never block the main thread on init — generate on `requestIdleCallback` or after first paint.
- Keep total JS for the effect under ~15KB gzipped unless it's a 🔴 brand page.

---

## Handoff

Give Frontend Dev: the technique, the renderer, the exact palette tokens, the target fps, the
off-screen/reduced-motion behavior, and the static fallback asset. Send a screen recording to the
Design Loop craft critic (fresh context) with the design-system brief so both craft and on-system
palette are checked.
