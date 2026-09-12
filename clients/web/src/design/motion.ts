/**
 * Motion primitives for behaviour CSS alone cannot express.
 *
 * Everything visual lives in motion.css. This file holds only the decisions that
 * need to be made in JavaScript: how many rows may stagger, whether the user has
 * asked for reduced motion, and how to mark a value that just changed.
 */
import { useEffect, useRef, useState } from 'react';

/** Rows beyond this appear immediately. Matches the cap in motion.css. */
export const STAGGER_LIMIT = 8;

/**
 * True when the user has asked for reduced motion. CSS handles the visual side
 * on its own; this is for logic that should not run at all, such as scheduling
 * a highlight timer.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Applies the stagger class only when the list is short enough for it to aid
 * comprehension. On a long table the effect stops explaining anything and just
 * costs frames, so it is dropped entirely rather than capped per row.
 */
export function staggerClass(itemCount: number): string {
  return itemCount > 0 && itemCount <= STAGGER_LIMIT * 3 ? 'm-stagger' : '';
}

/**
 * Marks rows whose identity is new since the last render, so a row that has just
 * arrived can be highlighted once. Returns a set of keys, not a timer per row.
 *
 * Deliberately identity-based: highlighting on every data refresh would flash
 * the whole table each time it polls.
 */
export function useNewlyAdded<T>(items: readonly T[], keyOf: (item: T) => string): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const keys = new Set(items.map(keyOf));

    // First render establishes the baseline: nothing is "new" on arrival.
    if (seen.current === null) {
      seen.current = keys;
      return;
    }

    const added = new Set<string>();
    for (const key of keys) if (!seen.current.has(key)) added.add(key);
    seen.current = keys;

    if (added.size === 0 || reduced) return;
    setFresh(added);
    const timer = setTimeout(() => setFresh(new Set()), 600);
    return () => clearTimeout(timer);
  }, [items, keyOf, reduced]);

  return fresh;
}
