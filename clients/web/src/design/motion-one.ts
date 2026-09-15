/**
 * Motion One integration — Performant animation presets.
 *
 * Motion One (https://motion.dev) provides GPU-accelerated animations that
 * respect the design system's motion tokens (duration, easing, distance).
 *
 * Use this for:
 * - Entrance/exit animations on mount/unmount
 * - Complex choreography (stagger, sequence, orchestration)
 * - Gesture-driven animations (scroll reveal, parallax, magnetic)
 * - Shared element transitions between routes
 *
 * DO NOT use for:
 * - Simple state transitions (hover, active) — use CSS instead
 * - High-frequency animations (scroll events) — use CSS + Intersection Observer
 *
 * Why Motion One + CSS?
 * - CSS handles micro-interactions (button press, input focus, color change)
 * - Motion One handles complex multi-element choreography
 * - Together they cover the full animation spectrum with zero redundancy
 */

import { animate, stagger, type EffectTransition } from 'motion';

// ============================================================================
// Motion Tokens (aligned with motion.css)
// ============================================================================

/** Duration bands: micro → state → panel → page → exit */
const DURATIONS = {
  micro: 0.14,  // 140ms — press, hover, chip
  state: 0.18,  // 180ms — colour, badge, inline validation
  panel: 0.26,  // 260ms — drawer, popover, collapse
  page: 0.3,    // 300ms — section change, sheet
  exit: 0.14,   // 140ms — every exit (shorter than entrance)
};

/**
 * Easing curves: out (decelerate), in (accelerate), inOut, sharp (linear-ish).
 * Motion's cubic-bezier easing is a readonly 4-tuple; declaring the type keeps
 * the tuple (rather than a widened `number[]`) assignable to EffectTransition.
 */
type Bezier = readonly [number, number, number, number];
const EASING: Record<'out' | 'in' | 'inOut' | 'sharp', Bezier> = {
  out: [0.16, 1, 0.3, 1],      // easeOutCubic — arrivals
  in: [0.7, 0, 0.84, 0],        // easeInCubic — departures
  inOut: [0.42, 0, 0.58, 1],    // easeInOutCubic — both-direction movement
  sharp: [0.4, 0, 1, 1],        // easeOut-like — press feedback
};

/** Spatial constants: rise distance, max stagger items */
const SPATIAL = {
  rise: 8,           // px — vertical rise on entrance
  staggerLimit: 8,   // items — beyond this, stagger stops explaining and costs frames
};

// ============================================================================
// Preset Animations
// ============================================================================

/**
 * **Rise & Fade** — Content arriving from below.
 *
 * Best for: Page sections, drawer/modal entrance, list items arriving.
 * Duration: page (300ms)
 * Easing: out (decelerate into place)
 */
export const riseAndFade = (
  element: Element | Element[],
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.page,
    easing: EASING.out,
    ...options,
  };

  return animate(
    element,
    {
      opacity: [0, 1],
      y: [SPATIAL.rise, 0],
    },
    opts,
  );
};

/**
 * **Fade Cross** — Crossfade between two states (replaces one with another).
 *
 * Best for: Content replacement within same container, page transitions.
 * Duration: state (180ms)
 * Easing: out + in (first fades out, second fades in)
 */
export const fadeCross = (
  outgoing: Element,
  incoming: Element,
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.state,
    easing: EASING.out,
    ...options,
  };

  return Promise.all([
    animate(outgoing, { opacity: 0 }, opts),
    animate(incoming, { opacity: [0, 1] }, opts),
  ]);
};

/**
 * **Scale Pop** — Tiny scale-in for popovers, tooltips, context menus.
 *
 * Best for: Dropdown menus, tooltips, mini-cards that appear on click.
 * Duration: state (180ms)
 * Easing: out
 * Scale: 0.97 → 1.0 (subtle, not bouncy)
 */
export const scalePop = (
  element: Element | Element[],
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.state,
    easing: EASING.out,
    ...options,
  };

  return animate(
    element,
    {
      opacity: [0, 1],
      scale: [0.97, 1],
    },
    opts,
  );
};

/**
 * **Stagger List** — Sequential entrance for list/grid items.
 *
 * Best for: List rows, table cells, grid cards appearing one by one.
 * Duration: page (300ms) per item
 * Delay: 24ms between items
 * Max items: SPATIAL.staggerLimit (8) — beyond that, all appear at once
 */
export const staggerList = (
  elements: Element[],
  options?: Partial<EffectTransition>,
) => {
  if (elements.length > SPATIAL.staggerLimit * 3) {
    // Too many items — stagger stops explaining and costs frames
    return riseAndFade(elements, { duration: DURATIONS.page });
  }

  const opts: EffectTransition = {
    duration: DURATIONS.page,
    easing: EASING.out,
    ...options,
  };

  return animate(
    elements,
    {
      opacity: [0, 1],
      y: [SPATIAL.rise, 0],
    },
    {
      ...opts,
      delay: stagger(0.024), // 24ms between each item
    },
  );
};

/**
 * **Slide Drawer** — Drawer/sheet entrance from edge.
 *
 * Best for: Navigation drawer (left), bottom sheet, side panel.
 * Duration: panel (260ms)
 * Easing: out
 * Direction: 'left' | 'right' | 'top' | 'bottom'
 */
export const slideDrawer = (
  element: Element,
  direction: 'left' | 'right' | 'top' | 'bottom' = 'left',
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.panel,
    easing: EASING.out,
    ...options,
  };

  const fromValue = {
    left: { x: [-100, 0] },
    right: { x: [100, 0] },
    top: { y: [-100, 0] },
    bottom: { y: [100, 0] },
  }[direction];

  return animate(element, { opacity: [0, 1], ...fromValue }, opts);
};

/**
 * **Collapse Expand** — Accordion / disclosure animation.
 *
 * Best for: Details panels, accordion sections, expandable content.
 * Duration: panel (260ms)
 * Easing: inOut (smooth both directions)
 * Direction: 'in' (open) | 'out' (close)
 */
export const collapseExpand = (
  element: Element,
  direction: 'in' | 'out' = 'in',
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.panel,
    easing: EASING.inOut,
    ...options,
  };

  return animate(
    element,
    {
      height: direction === 'in' ? [0, 'auto'] : ['auto', 0],
      opacity: direction === 'in' ? [0, 1] : [1, 0],
    },
    opts,
  );
};

/**
 * **Scale Press** — Button/control press feedback.
 *
 * Best for: Tappable surfaces (buttons, cards, list items).
 * Duration: micro (140ms)
 * Easing: sharp (nearly instant)
 * Scale: 1.0 → 0.95 (slight shrink)
 */
export const scalePress = (
  element: Element,
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.micro,
    easing: EASING.sharp,
    ...options,
  };

  return animate(element, { scale: 0.95 }, opts);
};

/**
 * **Scale Release** — Revert from press state.
 *
 * Pair with scalePress for complete press-release cycle.
 * Duration: micro (140ms)
 * Easing: out
 * Scale: 0.95 → 1.0
 */
export const scaleRelease = (
  element: Element,
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.micro,
    easing: EASING.out,
    ...options,
  };

  return animate(element, { scale: 1 }, opts);
};

/**
 * **Highlight Change** — Flash a value that just changed.
 *
 * Best for: Data table rows updated, price changed, status switched.
 * Duration: state (180ms) for the highlight
 * Returns to normal after completion.
 */
export const highlightChange = (
  element: Element,
  highlightColor: string = 'rgba(34, 197, 94, 0.1)', // soft green highlight
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.state,
    easing: EASING.out,
    ...options,
  };

  return animate(
    element,
    {
      backgroundColor: [highlightColor, 'transparent'],
    },
    opts,
  );
};

/**
 * **Parallax** — Subtle depth effect (element moves slower than scroll).
 *
 * Best for: Hero images, background layers (use sparingly, not on main content).
 * Depth: 1.0 = no parallax, 0.5 = half scroll speed, 0.3 = third speed.
 *
 * Usage:
 * ```tsx
 * const [offset, setOffset] = useState(0);
 * useEffect(() => {
 *   const handleScroll = () => setOffset(window.scrollY);
 *   window.addEventListener('scroll', handleScroll);
 *   return () => window.removeEventListener('scroll', handleScroll);
 * }, []);
 *
 * return (
 *   <div ref={el => parallax(el!, offset, 0.5)} />
 * );
 * ```
 */
export const parallax = (
  element: Element,
  scrollOffset: number,
  depth: number = 0.5,
) => {
  element.setAttribute('style', `transform: translateY(${scrollOffset * depth}px)`);
};

/**
 * **Scroll Reveal** — Element fades in as it scrolls into viewport.
 *
 * Best for: Images, cards, sections in long-form content.
 * Requires Intersection Observer for viewport detection.
 *
 * Usage:
 * ```tsx
 * const ref = useRef(null);
 * useEffect(() => {
 *   const observer = new IntersectionObserver(entries => {
 *     entries.forEach(entry => {
 *       if (entry.isIntersecting) {
 *         scrollReveal(entry.target);
 *         observer.unobserve(entry.target);
 *       }
 *     });
 *   });
 *   if (ref.current) observer.observe(ref.current);
 *   return () => observer.disconnect();
 * }, []);
 *
 * return <div ref={ref} />;
 * ```
 */
export const scrollReveal = (
  element: Element,
  options?: Partial<EffectTransition>,
) => {
  return riseAndFade(element, {
    duration: DURATIONS.page,
    ...options,
  });
};

/**
 * **Exit Fade** — Quick departure (element fades out, used on unmount).
 *
 * Best for: Modal/drawer close, removing a list item, page navigation out.
 * Duration: exit (140ms) — intentionally shorter than entrance.
 * Easing: in (accelerate away)
 */
export const exitFade = (
  element: Element,
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.exit,
    easing: EASING.in,
    ...options,
  };

  return animate(element, { opacity: 0, y: -SPATIAL.rise }, opts);
};

/**
 * **Exit Scale** — Quick departure with scale (pop-out effect).
 *
 * Best for: Closing popovers, tooltip dismissal, mini-card removal.
 * Duration: exit (140ms)
 * Easing: in
 */
export const exitScale = (
  element: Element,
  options?: Partial<EffectTransition>,
) => {
  const opts: EffectTransition = {
    duration: DURATIONS.exit,
    easing: EASING.in,
    ...options,
  };

  return animate(element, { opacity: 0, scale: 0.97 }, opts);
};

// ============================================================================
// Choreography Helpers (Multi-Element Orchestration)
// ============================================================================

/**
 * **Sequence** — Play animations one after another.
 *
 * Usage:
 * ```tsx
 * sequence([
 *   [headerEl, riseAndFade],
 *   [contentEl, staggerList],
 *   [footerEl, riseAndFade],
 * ]);
 * ```
 */
export async function sequence(
  animations: Array<[Element | Element[], (el: Element | Element[]) => Promise<any>]>,
) {
  for (const [element, animation] of animations) {
    await animation(element);
  }
}

/**
 * **Parallel** — Play animations simultaneously.
 *
 * Usage:
 * ```tsx
 * parallel([
 *   [bgEl, fadeCross, incomingBg],
 *   [contentEl, riseAndFade],
 * ]);
 * ```
 */
export async function parallel(
  animations: Array<[Element | Element[], (el: Element | Element[]) => Promise<any>]>,
) {
  await Promise.all(animations.map(([element, animation]) => animation(element)));
}

// ============================================================================
// React Hook — useMotion (for component integration)
// ============================================================================

/**
 * useMotion — Trigger animations on element.
 *
 * Usage:
 * ```tsx
 * const ref = useMotion((el) => riseAndFade(el));
 * return <div ref={ref}>Content</div>;
 * ```
 */
import { useEffect, useRef } from 'react';

export function useMotion(
  animationFn: (element: Element) => Promise<any>,
  deps?: React.DependencyList,
) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      animationFn(ref.current);
    }
  }, deps || []);

  return ref;
}

// ============================================================================
// Export Summary
// ============================================================================

/**
 * When to use each preset:
 *
 * ENTRANCE:
 * - riseAndFade — most common, page sections arriving
 * - fadeCross — content replacement within same container
 * - scalePop — small elements (tooltip, dropdown)
 * - staggerList — lists, tables, grids
 * - slideDrawer — navigation/side panels
 * - scrollReveal — images/cards in long-form content
 *
 * STATE CHANGE:
 * - collapseExpand — accordion, disclosure
 * - highlightChange — data update flash
 * - scalePress + scaleRelease — button press
 *
 * EXIT:
 * - exitFade — most common, dismiss/close
 * - exitScale — small elements leaving
 *
 * ORCHESTRATION:
 * - sequence — one after another
 * - parallel — all at once
 * - parallax — depth effect (use sparingly)
 */
