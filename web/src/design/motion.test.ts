import { describe, expect, it } from 'vitest';
import { STAGGER_LIMIT, staggerClass } from './motion.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read from disk rather than importing: these assertions are about the CSS the
// browser receives, not about anything the bundler produced.
const read = (relative: string) => readFileSync(join(process.cwd(), 'src', relative), 'utf8');
const css = read('design/motion.css');

describe('stagger is capped', () => {
  it('staggers a short list, where the effect explains arrival order', () => {
    expect(staggerClass(6)).toBe('m-stagger');
  });

  it('drops the effect entirely on a long list rather than animating hundreds of rows', () => {
    expect(staggerClass(500)).toBe('');
    expect(staggerClass(1000)).toBe('');
  });

  it('adds nothing to an empty list', () => {
    expect(staggerClass(0)).toBe('');
  });

  it('caps delays in CSS too, so no row waits on a long ramp', () => {
    expect(css).toMatch(/nth-child\(n \+ 9\)\s*\{\s*animation-delay:\s*0ms/);
    expect(STAGGER_LIMIT).toBe(8);
  });
});

describe('performance constraints', () => {
  it('animates only transform, opacity and colour', () => {
    // Every property name declared inside any @keyframes block.
    const animated = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)]
      .flatMap((block) => [...block[1]!.matchAll(/([a-z-]+)\s*:/g)])
      .map((declaration) => declaration[1]!);

    const allowed = new Set(['opacity', 'transform', 'background-color', 'background-position']);
    for (const property of animated) {
      expect(allowed.has(property), `keyframes animate "${property}", which can force layout`).toBe(true);
    }
  });

  it('never animates width, height, top or left, which trigger layout', () => {
    const keyframeBlocks = css.slice(css.indexOf('@keyframes'));
    for (const property of ['width:', 'height:', 'top:', 'left:', 'margin']) {
      expect(keyframeBlocks.includes(property)).toBe(false);
    }
  });
});

describe('reduced motion', () => {
  const reducedBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

  it('collapses durations and removes travel distance', () => {
    expect(reducedBlock).toMatch(/--dur-page:\s*1ms/);
    expect(reducedBlock).toMatch(/--rise:\s*0px/);
    expect(reducedBlock).toMatch(/--stagger-step:\s*0ms/);
  });

  it('replaces positional entrances with a fade, so arrival is still signalled', () => {
    expect(reducedBlock).toMatch(/\.m-rise[^{]*\{\s*animation: m-fade-in/);
  });

  it('keeps indeterminate progress moving, since a frozen spinner reads as hung', () => {
    expect(reducedBlock).toMatch(/\.refresh-bar__fill[\s\S]*animation-iteration-count:\s*infinite/);
  });
});

describe('token system', () => {
  it('defines the four duration bands centrally', () => {
    for (const token of ['--dur-micro', '--dur-state', '--dur-panel', '--dur-page']) {
      expect(css).toContain(token);
    }
  });

  it('exits are shorter than entrances', () => {
    const enter = Number(/--dur-panel:\s*(\d+)ms/.exec(css)![1]);
    const exit = Number(/--dur-exit:\s*(\d+)ms/.exec(css)![1]);
    expect(exit).toBeLessThan(enter);
  });

  it('keeps every band inside the agreed ranges', () => {
    const band = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)ms`).exec(css)![1]);
    expect(band('--dur-micro')).toBeGreaterThanOrEqual(120);
    expect(band('--dur-micro')).toBeLessThanOrEqual(180);
    expect(band('--dur-state')).toBeGreaterThanOrEqual(160);
    expect(band('--dur-state')).toBeLessThanOrEqual(220);
    expect(band('--dur-panel')).toBeGreaterThanOrEqual(220);
    expect(band('--dur-panel')).toBeLessThanOrEqual(300);
    expect(band('--dur-page')).toBeGreaterThanOrEqual(250);
    expect(band('--dur-page')).toBeLessThanOrEqual(400);
  });
});

describe('single source of truth', () => {
  it('screens do not define their own keyframes', () => {
    const componentCss = read('components/components.css');
    const local = [...componentCss.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!);
    // spin and shimmer are indeterminate-progress loops, not transitions, and
    // belong with the components that own them.
    expect(local.sort()).toEqual(['shimmer', 'slide', 'spin']);
  });
});
