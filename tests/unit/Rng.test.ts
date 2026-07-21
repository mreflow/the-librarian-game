import { describe, expect, it } from 'vitest';

import { dailySeed, Rng } from '../../src/v2/systems/Rng';

describe('Rng', () => {
  it('replays the same sequence for the same seed', () => {
    const first = new Rng(42);
    const second = new Rng(42);

    expect(Array.from({ length: 12 }, () => first.next())).toEqual(
      Array.from({ length: 12 }, () => second.next()),
    );
  });

  it('produces a different sequence for a different seed', () => {
    const first = new Rng(42);
    const second = new Rng(43);

    expect(Array.from({ length: 6 }, () => first.next())).not.toEqual(
      Array.from({ length: 6 }, () => second.next()),
    );
  });

  it('keeps sampled, ranged, and integer values inside their contracts', () => {
    const rng = new Rng(1_337);

    for (let index = 0; index < 2_000; index += 1) {
      expect(rng.next()).toBeGreaterThanOrEqual(0);
      expect(rng.next()).toBeLessThan(1);
      expect(rng.range(-4.5, 9.25)).toBeGreaterThanOrEqual(-4.5);
      expect(rng.range(-4.5, 9.25)).toBeLessThan(9.25);
      expect(rng.int(2, 5)).toBeGreaterThanOrEqual(2);
      expect(rng.int(2, 5)).toBeLessThanOrEqual(5);
    }
  });

  it('shuffles deterministically without mutating the input', () => {
    const input = Object.freeze(['a', 'b', 'c', 'd', 'e']);
    const first = new Rng(99).shuffle(input);
    const second = new Rng(99).shuffle(input);

    expect(first).toEqual(second);
    expect(first).not.toEqual(input);
    expect([...first].sort()).toEqual([...input].sort());
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('picks an existing value and rejects an empty collection', () => {
    const rng = new Rng(7);

    expect(['left', 'right']).toContain(rng.pick(['left', 'right']));
    expect(() => rng.pick([])).toThrow('Cannot pick from an empty array.');
  });
});

describe('dailySeed', () => {
  it('is stable for every instant on the same UTC calendar day', () => {
    const morning = new Date('2026-07-20T00:01:00.000Z');
    const evening = new Date('2026-07-20T23:59:59.999Z');

    expect(dailySeed(morning)).toBe(3_149_962_892);
    expect(dailySeed(evening)).toBe(dailySeed(morning));
  });

  it('changes when the UTC calendar day changes', () => {
    expect(dailySeed(new Date('2026-07-20T23:59:59.999Z'))).not.toBe(
      dailySeed(new Date('2026-07-21T00:00:00.000Z')),
    );
  });
});
