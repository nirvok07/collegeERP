# Motion One Integration Guide

**Motion One** (https://motion.dev) is a modern, GPU-accelerated animation library integrated into your design system.

## Quick Start

### 1. Import
```tsx
import { riseAndFade, staggerList, scalePop } from '@/design/motion-one';
```

### 2. Use on Mount
```tsx
const ref = useMotion((el) => riseAndFade(el));
return <div ref={ref}>Content enters with rise + fade</div>;
```

### 3. Or Animate Manually
```tsx
const ref = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (ref.current) {
    riseAndFade(ref.current);
  }
}, []);

return <div ref={ref}>Content</div>;
```

---

## When to Use Motion One vs CSS

| Scenario | Use | Why |
|----------|-----|-----|
| Button hover, input focus, color change | **CSS** (`motion.css`) | Micro-interactions, instant feedback |
| List item entrance, page section arrival | **Motion One** (riseAndFade, staggerList) | Complex choreography, sequential timing |
| Scroll-driven animations | **CSS + Intersection Observer** | High-frequency, better performance |
| Drawer/modal entrance | **Motion One** (slideDrawer) | Orchestration with opacity + transform |
| Data highlight/change flash | **Motion One** (highlightChange) | Conditional logic, timing control |

---

## Preset Animations

### Entrance Animations

#### `riseAndFade(element, options?)`
Content arrives from below with fade-in.
```tsx
// Page section, drawer entrance, modal
const ref = useMotion((el) => riseAndFade(el));
```

#### `fadeCross(outgoing, incoming, options?)`
Crossfade between two elements (one fades out, next fades in).
```tsx
// Content replacement within same container
animate(async () => {
  await fadeCross(oldElement, newElement);
});
```

#### `scalePop(element, options?)`
Tiny scale-in (0.97 → 1.0) with fade.
```tsx
// Dropdown menu, tooltip, context menu
<Menu ref={useMotion((el) => scalePop(el))} />
```

#### `staggerList(elements, options?)`
Sequential entrance for lists/tables/grids (24ms delay between items).
```tsx
// Table rows, list items, grid cards
useEffect(() => {
  const rows = document.querySelectorAll('[data-list-item]');
  staggerList(Array.from(rows));
}, []);
```

#### `slideDrawer(element, direction, options?)`
Drawer/sheet entrance from edge.
```tsx
// Navigation drawer, bottom sheet, side panel
const drawerRef = useMotion((el) => 
  slideDrawer(el, 'left') // 'left' | 'right' | 'top' | 'bottom'
);
```

#### `scrollReveal(element, options?)`
Element fades in as it scrolls into viewport (with Intersection Observer).
```tsx
// Image, card, section in long-form content
useEffect(() => {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        scrollReveal(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  const el = ref.current;
  if (el) observer.observe(el);
  return () => observer.disconnect();
}, []);
```

### State Change Animations

#### `collapseExpand(element, direction, options?)`
Accordion/disclosure: open/close with height + opacity.
```tsx
// Expandable section, accordion
<DisclosurePanel
  ref={useMotion((el) => 
    collapseExpand(el, isOpen ? 'in' : 'out')
  )}
/>
```

#### `scalePress(element, options?)`
Button press feedback (scale 1.0 → 0.95, 140ms).
```tsx
// Tappable button, card, list item
<button
  onMouseDown={(e) => scalePress(e.currentTarget)}
  onMouseUp={(e) => scaleRelease(e.currentTarget)}
>
  Click Me
</button>
```

#### `scaleRelease(element, options?)`
Revert from press state (scale 0.95 → 1.0).
```tsx
// Pair with scalePress above
```

#### `highlightChange(element, highlightColor?, options?)`
Flash a changed value (e.g., updated table row).
```tsx
// Data row updated, price changed, status switched
useEffect(() => {
  highlightChange(tableRowRef.current, 'rgba(34, 197, 94, 0.1)');
}, [data]);
```

### Exit Animations

#### `exitFade(element, options?)`
Quick fade-out (140ms, shorter than entrance).
```tsx
// Modal close, remove list item, page navigation out
await exitFade(element);
```

#### `exitScale(element, options?)`
Quick scale-out (pop-out effect, 140ms).
```tsx
// Dropdown close, tooltip dismissal, mini-card removal
await exitScale(element);
```

### Spatial & Scroll

#### `parallax(element, scrollOffset, depth?)`
Subtle depth effect (element moves slower than scroll).
```tsx
// Hero image, background layer (use sparingly)
const [offset, setOffset] = useState(0);

useEffect(() => {
  const handleScroll = () => setOffset(window.scrollY);
  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
}, []);

useEffect(() => {
  if (heroRef.current) parallax(heroRef.current, offset, 0.5);
}, [offset]);
```

---

## Choreography: Orchestrating Multiple Animations

### `sequence([...animations])`
Play animations one after another.
```tsx
// Header arrives, then content, then footer
await sequence([
  [headerEl, (el) => riseAndFade(el)],
  [contentEl, (el) => staggerList(Array.from(el.querySelectorAll('[data-item]')))],
  [footerEl, (el) => riseAndFade(el)],
]);
```

### `parallel([...animations])`
Play animations simultaneously.
```tsx
// Background and content fade together
await parallel([
  [bgEl, (el) => fadeCross(oldBg, newBg)],
  [contentEl, (el) => riseAndFade(el)],
]);
```

---

## React Hook: `useMotion(animationFn, deps?)`

Auto-trigger animation on mount with dependency array.

```tsx
// Simple: auto-animate on mount
const ref = useMotion((el) => riseAndFade(el));

// With dependencies: re-animate when deps change
const ref = useMotion(
  (el) => highlightChange(el),
  [dataChanged] // Re-animate if data changes
);

return <div ref={ref}>Content</div>;
```

---

## Duration & Easing Reference

All animations use design system tokens from `motion.css`:

| Token | Duration | Use |
|-------|----------|-----|
| `micro` | 140ms | Press, hover, chip |
| `state` | 180ms | Colour, badge, inline validation |
| `panel` | 260ms | Drawer, popover, collapse |
| `page` | 300ms | Section change, sheet, entrance |
| `exit` | 140ms | Every exit (shorter than entrance) |

| Easing | Use |
|--------|-----|
| `out` | Entrances (decelerate into place) |
| `in` | Exits (accelerate away) |
| `inOut` | Both-direction movement (back/forward) |
| `sharp` | Press feedback (nearly instant) |

---

## Design System Integration

Motion One is **part of your design system**, not a separate library:

- **Tokens:** Durations + easing match `motion.css` exactly
- **Philosophy:** Animation explains cause-effect, never decorative
- **Accessibility:** Respects `prefers-reduced-motion` (Motion library handles this)
- **Performance:** GPU-accelerated, compositor-friendly (transforms + opacity only)
- **Scope:** Complex choreography only; CSS handles micro-interactions

---

## Real-World Examples

### Example 1: Dashboard Section Entrance
```tsx
import { riseAndFade, staggerList } from '@/design/motion-one';

export function Dashboard() {
  const headerRef = useMotion((el) => riseAndFade(el));
  
  useEffect(() => {
    const rows = document.querySelectorAll('[data-dashboard-row]');
    staggerList(Array.from(rows));
  }, []);

  return (
    <>
      <h1 ref={headerRef}>Dashboard</h1>
      <div data-dashboard-row>Row 1</div>
      <div data-dashboard-row>Row 2</div>
      <div data-dashboard-row>Row 3</div>
    </>
  );
}
```

### Example 2: Modal with Choreography
```tsx
import { slideDrawer, riseAndFade, sequence } from '@/design/motion-one';

export function Modal({ isOpen }) {
  const backdropRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen && backdropRef.current && modalRef.current) {
      sequence([
        [backdropRef.current, (el) => animate(el, { opacity: [0, 1] }, { duration: 0.18 })],
        [modalRef.current, (el) => slideDrawer(el, 'top')],
      ]);
    }
  }, [isOpen]);

  return (
    <>
      <div ref={backdropRef} style={{ opacity: 0 }} className="backdrop" />
      <div ref={modalRef} className="modal">Content</div>
    </>
  );
}
```

### Example 3: Data Update Highlight
```tsx
import { highlightChange } from '@/design/motion-one';

export function TableRow({ data, prevData }) {
  const rowRef = useRef(null);

  useEffect(() => {
    if (rowRef.current && data !== prevData) {
      highlightChange(rowRef.current);
    }
  }, [data, prevData]);

  return <tr ref={rowRef}>{/* row content */}</tr>;
}
```

---

## Performance Tips

1. **Stagger cap:** Beyond 24 items, stagger automatically disables (costs frames)
2. **Prefer transforms:** Motion One uses transforms + opacity (GPU, no layout cost)
3. **Avoid animating width/height:** Use `collapseExpand` for content (handles height: auto)
4. **Reduced motion:** Motion library respects `prefers-reduced-motion` automatically
5. **Batch animations:** Use `sequence` or `parallel` instead of separate animations

---

## Fallback: No Motion One?

If Motion One fails to import (unlikely, but for safety):

```tsx
// Graceful degradation: content appears instantly
export const riseAndFade = async (el: Element) => {
  el.setAttribute('style', 'opacity: 1');
  return Promise.resolve();
};
```

---

## Questions?

Refer to:
- `src/design/motion-one.ts` — Full API with JSDoc
- `src/design/motion.css` — CSS animation presets
- `motion.dev` — Motion One documentation
- `docs/07-design-system.md` § 7.7 — Design system motion principles
