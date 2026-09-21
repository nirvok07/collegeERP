# Motion One Integration — Complete

**Date:** 2026-09-16  
**Status:** ✅ Ready to use  
**Package:** `motion@13.3.0` installed  
**For:** Web client (`clients/web/`)

---

## What's Been Set Up

### 1. **Motion One Library Wrapper** (`src/design/motion-one.ts`)
- 400+ lines of production-ready animation presets
- Full JSDoc documentation on every preset
- Aligned with design system tokens (motion.css durations + easing)

**Presets included:**
- **Entrance:** riseAndFade, fadeCross, scalePop, staggerList, slideDrawer, scrollReveal
- **State:** collapseExpand, highlightChange, scalePress, scaleRelease
- **Exit:** exitFade, exitScale
- **Orchestration:** sequence, parallel
- **Spatial:** parallax

### 2. **Usage Guide** (`src/design/MOTION_ONE_GUIDE.md`)
- When to use Motion One vs CSS (quick decision table)
- All presets with code examples
- React hook: `useMotion()`
- Real-world examples (Dashboard, Modal, Data Table)
- Performance tips + accessibility notes

### 3. **Claude Memory** (`memory/motion-one-setup.md`)
- Quick reference for Claude AI
- When to suggest Motion One to user
- Common animations + code patterns
- Duration/easing tokens
- Why Motion One over Framer Motion

---

## Quick Start

### Import
```tsx
import { riseAndFade, staggerList, sequence } from '@/design/motion-one';
```

### Use
```tsx
// Auto-animate on mount
const ref = useMotion((el) => riseAndFade(el));
return <div ref={ref}>Content enters with rise + fade</div>;

// Or manually
const rows = document.querySelectorAll('[data-item]');
staggerList(Array.from(rows)); // 24ms delay between rows
```

---

## Design System Alignment

Motion One **is now part of your design system**, not a separate tool:

| Layer | Owner | Handles |
|-------|-------|---------|
| **Micro-interactions** | CSS (motion.css) | Button hover, input focus, color change |
| **Component states** | CSS (motion.css) | Chip selection, badge color, modal fade |
| **Complex choreography** | **Motion One** | Multi-element sequences, drawers, lists |
| **Page routing** | Framework (Next.js) | Route transitions |

---

## When Claude Should Suggest It

- "Smooth drawer entrance"
- "Staggered list reveal"
- "Header + content + footer one-after-another"
- "Data table row highlight on update"
- "Modal + backdrop orchestration"

When to **NOT** suggest:
- Button hover (CSS, 5x faster)
- Input focus (CSS)
- Loading spinner (CSS)
- Navbar (CSS)

---

## Files to Know

| File | Purpose |
|------|---------|
| `src/design/motion-one.ts` | Full API, all presets, JSDoc |
| `src/design/MOTION_ONE_GUIDE.md` | Usage guide + examples |
| `src/design/motion.css` | CSS presets, don't duplicate |
| `memory/motion-one-setup.md` | Claude quick reference |

---

## Next: Use in Dashboard

When building dashboards (FEE-8 reports, admin screens):

1. **Header entrance:**
   ```tsx
   const headerRef = useMotion((el) => riseAndFade(el));
   ```

2. **Widget/card stagger:**
   ```tsx
   useEffect(() => {
     const cards = document.querySelectorAll('[data-dashboard-card]');
     staggerList(Array.from(cards));
   }, []);
   ```

3. **Data highlight:**
   ```tsx
   useEffect(() => {
     if (dataChanged) {
       highlightChange(tableRowRef.current);
     }
   }, [dataChanged]);
   ```

---

## Rules

1. ✅ Use Motion One for **choreography** (multi-element sequences)
2. ✅ Use CSS for **micro-interactions** (button press, color change)
3. ✅ Respect `prefers-reduced-motion` (Motion library does this)
4. ✅ GPU-friendly: transforms + opacity only (no width/height animation)
5. ✅ Align durations with motion.css tokens (no custom 1s animations)

---

## Verification Checklist

- [x] Motion package installed: `motion@13.3.0`
- [x] motion-one.ts created with all presets
- [x] MOTION_ONE_GUIDE.md with examples
- [x] Claude memory: motion-one-setup.md
- [x] Aligned with design system tokens
- [x] React hook: useMotion() ready
- [x] Ready for production use

---

## Support

- **Full docs:** `src/design/MOTION_ONE_GUIDE.md`
- **API reference:** `src/design/motion-one.ts` (JSDoc on every function)
- **Motion One docs:** https://motion.dev
- **Design system:** `docs/07-design-system.md` § 7.7 (Motion principles)

---

## Next Steps

1. **No action needed** — library is ready to use
2. When building dashboards/drawers, import from `@/design/motion-one`
3. Claude will suggest Motion One when orchestration is needed
4. All animations inherit durations/easing from motion.css (one source of truth)
