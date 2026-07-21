import { describe, expect, it } from 'vitest';

import {
  applyChaosRelief,
  chaosThreshold,
  difficultyMultiplier,
  initialChaos,
  updateChaos,
  xpForLevel,
} from '../../src/v2/game/Balance';

describe('experience and difficulty curves', () => {
  it('starts at 75 XP and increases monotonically by level', () => {
    expect(xpForLevel(1)).toBe(75);
    expect(xpForLevel(0)).toBe(75);
    const curve = Array.from({ length: 20 }, (_, index) => xpForLevel(index + 1));
    for (let index = 1; index < curve.length; index += 1) {
      expect(curve[index]).toBeGreaterThan(curve[index - 1] as number);
    }
  });

  it('keeps mode difficulty ordered and caps elapsed-time growth', () => {
    expect(difficultyMultiplier('quick', 0)).toBeLessThan(difficultyMultiplier('standard', 0));
    expect(difficultyMultiplier('standard', 0)).toBeLessThan(difficultyMultiplier('daily', 0));
    expect(difficultyMultiplier('daily', 0)).toBeLessThan(difficultyMultiplier('endless', 0));
    expect(difficultyMultiplier('standard', 900)).toBeGreaterThan(difficultyMultiplier('standard', 0));
    expect(difficultyMultiplier('standard', 100_000)).toBe(1.5);
  });

  it('orders Calm, Classic, and Heated intensity for the same shift', () => {
    expect(difficultyMultiplier('standard', 300, 'calm')).toBeLessThan(
      difficultyMultiplier('standard', 300, 'classic'),
    );
    expect(difficultyMultiplier('standard', 300, 'classic')).toBeLessThan(
      difficultyMultiplier('standard', 300, 'heated'),
    );
  });
});

describe('chaos model', () => {
  it.each([
    [0, false, 'orderly'],
    [24.999, false, 'orderly'],
    [25, false, 'busy'],
    [50, false, 'disrupted'],
    [75, false, 'critical'],
    [100, true, 'last-call'],
  ] as const)('maps %s chaos and last-call=%s to %s', (total, inLastCall, expected) => {
    expect(chaosThreshold(total, inLastCall)).toBe(expected);
  });

  it('returns an independent, safe opening state', () => {
    const first = initialChaos();
    const second = initialChaos();
    first.total = 99;

    expect(second).toEqual({
      total: 8,
      clutter: 3,
      noise: 3,
      disorder: 2,
      dominant: 'clutter',
      threshold: 'orderly',
      lastCallRemaining: 10,
    });
  });

  it('tracks the dominant source and keeps all output bounded', () => {
    const next = updateChaos({
      previous: initialChaos(),
      delta: 1,
      looseBooks: 2,
      carriedByKids: 0,
      activeNoise: 50,
      disorderSources: 1,
      eventMultiplier: 1.2,
      calmPerSecond: 0,
    });

    expect(next.dominant).toBe('noise');
    expect(next.total).toBeGreaterThan(8);
    for (const value of [next.total, next.clutter, next.noise, next.disorder]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('counts Last Call down while critical and exits it after recovery', () => {
    const critical = updateChaos({
      previous: { ...initialChaos(), total: 100, threshold: 'last-call', lastCallRemaining: 10 },
      delta: 2,
      looseBooks: 100,
      carriedByKids: 20,
      activeNoise: 30,
      disorderSources: 10,
      eventMultiplier: 1,
      calmPerSecond: 0,
    });
    expect(critical.threshold).toBe('last-call');
    expect(critical.lastCallRemaining).toBe(8);

    const recovered = updateChaos({
      previous: critical,
      delta: 1,
      looseBooks: 0,
      carriedByKids: 0,
      activeNoise: 0,
      disorderSources: 0,
      eventMultiplier: 1,
      calmPerSecond: 30,
    });
    expect(recovered.total).toBeLessThan(90);
    expect(recovered.threshold).not.toBe('last-call');
    expect(recovered.lastCallRemaining).toBe(10);
  });

  it('applies relief without mutating the input or crossing below zero', () => {
    const chaos = { ...initialChaos(), total: 12, threshold: 'busy' as const, lastCallRemaining: 3 };
    const relieved = applyChaosRelief(chaos, 50);

    expect(relieved.total).toBe(0);
    expect(relieved.threshold).toBe('orderly');
    expect(relieved.lastCallRemaining).toBe(10);
    expect(chaos.total).toBe(12);
  });
});
