# Motion Designer — Motion System & Video Pipeline Reference

Load when designing a motion system, a scroll experience, or a React→MP4 video. Extends the UI
Designer's static token system — it does not replace it.

---

## 1. Full token set (CSS variable form)

```css
:root {
  /* durations */
  --motion-instant:  0ms;
  --motion-fast:     120ms;
  --motion-base:     200ms;
  --motion-moderate: 320ms;
  --motion-slow:     480ms;

  /* easing */
  --ease-standard:   cubic-bezier(0.2, 0, 0, 1);
  --ease-decelerate: cubic-bezier(0, 0, 0, 1);
  --ease-accelerate: cubic-bezier(0.3, 0, 1, 1);

  /* stagger */
  --motion-stagger:  50ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms; --motion-base: 0ms; --motion-moderate: 0ms; --motion-slow: 0ms;
    --motion-stagger: 0ms;
  }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

The media-query block is the safety net. Still design an *intentional* reduced-motion fallback per
interaction (a cross-fade usually) rather than relying on the global kill-switch alone.

---

## 2. Performance budget

| Rule | Why |
|---|---|
| Animate only `transform` + `opacity` | Compositor-only; no layout/paint per frame |
| Promote with `will-change: transform` **only during** the animation, then remove | Permanent `will-change` wastes GPU memory |
| Max 3-4 simultaneously animating elements in the viewport | Each is a compositor layer |
| 60fps = 16.6ms/frame budget; test on a throttled CPU (6× slowdown in DevTools) | Mid-range Android is the real target |
| `IntersectionObserver` to start/stop scroll animations and canvas loops | Don't animate off-screen |
| Debounce/rAF scroll handlers; prefer CSS `animation-timeline: scroll()` where supported | JS scroll listeners drop frames |
| Lottie: keep < 50KB JSON, no large masks/mattes, cap to the canvas renderer for simple marks | Lottie is deceptively expensive |

Red flags in a build: animating `height`/`width` for accordions (use `grid-template-rows: 0fr→1fr`
or `transform: scaleY`), `box-shadow` transitions (animate an overlaid pseudo-element's opacity),
`top`/`left` movement (use `translate`).

---

## 3. Library selection

| Need | Use | Notes |
|---|---|---|
| Hover/press/focus, simple enter/exit, accordions | **Plain CSS / Tailwind transitions** | No JS. Fastest. Default choice. |
| Enter/exit of unmounting components, layout animations, drag, springs (React) | **Framer Motion** | `AnimatePresence`, `layout` prop, `useReducedMotion()` hook built in |
| Complex sequenced timelines, scroll scrubbing, pinning, SVG morphing | **GSAP** (+ ScrollTrigger) | Heaviest; reserve for 🔴 hero work |
| Designer-authored vector animation (icons, mascots, celebratory marks) | **Lottie** (lottie-web / lottie-react) | Get the `.json` from After Effects/LottieFiles; keep it small |
| Route/view transitions, shared element | **CSS View Transitions API** first, Framer Motion fallback | Native, cheap, progressive |
| Data-driven / generative motion, particles, shaders | **canvas 2D** → **three.js / OGL** only if 3D | See `generative-visuals.md` |
| Video (React → MP4) | **Remotion** | See §5 |

Always state *why* in the Motion Spec so Frontend Dev doesn't add a 40KB dependency for a fade.

---

## 4. Scroll-driven animation patterns

**Reveal on enter (the 90% case)**
- Trigger once at ~15% visibility, then unobserve.
- `opacity 0→1` + `translateY 8–16px→0`, `--motion-base`/`--motion-moderate`, `--ease-decelerate`.
- Stagger siblings by `--motion-stagger`, total capped ~300ms.
- Reduced-motion: render final state immediately, no observer.

**Parallax (use rarely)**
- Background layer only, ≤15% differential, `translate3d` driven by rAF or `scroll()` timeline.
- Off on touch devices and reduced-motion.

**Pin & scrub (🔴 only)**
- `position: sticky` container + progress-mapped animation, or GSAP ScrollTrigger `pin: true`.
- Always give it a defined scroll length and an exit. Test thumb-scroll on a real phone.
- Provide a non-pinned linear fallback for reduced-motion and small screens.

**Progress / sticky header shrink**
- Cheap and effective: header padding/logo scale via `transform` keyed to `scrollY > threshold`,
  `--motion-fast`.

---

## 5. React → MP4 video pipeline (Remotion or equivalent)

No timeline editor. The video is a React composition; frames are deterministic functions of a frame
number.

### Loop
```
1. Script      → shot list + VO script + on-screen text, timed in seconds
2. Compose     → one <Composition>; each shot a component; drive motion off useCurrentFrame()
3. Render      → npx remotion render <id> out/video.mp4  (or Remotion Lambda for scale)
4. Review      → watch the MP4 muted AND with sound; hand frames to Design Loop craft critic
5. Fix         → adjust timings/copy; re-render. Repeat until the critic passes.
```

### Checklist before render
- [ ] Hook lands in the first 3 seconds — motion or a bold claim, not a logo intro
- [ ] Captions burned in, high contrast, safe-area margins, on screen long enough to read twice
- [ ] Text cards use the product's real type tokens (not Remotion defaults)
- [ ] Music bed ducked under VO; cuts land on the beat
- [ ] 9:16 and 1:1 compositions exist (design for them, don't center-crop 16:9)
- [ ] End card: one CTA, one URL, held ≥ 2s
- [ ] Total length matches the channel (≤ 30s social, ≤ 90s explainer)
- [ ] Frame rate 30fps; export H.264 yuv420p for universal playback
- [ ] Renders are reproducible (seeded randomness, no `Date.now()` in components)

### Review prompt for Design Loop craft critic (fresh context)
> You're reviewing a finished promo video as rendered frames + the 15-second script brief. You did
> not make it. Judge: does the hook work muted in 3s? Is the pacing right (nothing held too long or
> cut too fast)? Do the text cards read as on-brand or as stock-motion-template? Is there an "AI
> slop" tell (default easing, centered everything, stock transitions, logo-particle intro)? Return
> PASS/FAIL + numbered concrete fixes.

---

## 6. Common "AI slop" motion tells to avoid

| Tell | Fix |
|---|---|
| Everything fades up 20px with the same 300ms ease | Vary by role; use travel distance proportional to element size; add exit overlap |
| Heavy full-page parallax on every section | One subtle parallax layer max, or none |
| Infinite floating/bobbing elements | Remove, or one slow non-looping settle on load |
| Spinner for every state | Skeletons for content, inline progress for actions, spinner only for indeterminate < 1s |
| Number counters ticking up on every stat | Reserve for one hero metric, ≤ 1s, ease-out |
| Logo particle assembly intro on video | Cut straight to the hook |
| Modal pops from screen center with a scale-bounce | Grow from the trigger, `--motion-moderate`, `--ease-standard`, no bounce unless it's a playful brand |
| Typewriter text on headlines | Static headline; animate a supporting element instead |
