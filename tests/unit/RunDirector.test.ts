import { describe, expect, it } from 'vitest';

import { EVENTS, MODE_DURATION, RUN_SCHEDULES } from '../../src/v2/data/runContent';
import { RunDirector, type DirectorDirective } from '../../src/v2/game/RunDirector';
import { Rng } from '../../src/v2/systems/Rng';
import type { RunMode } from '../../src/v2/types';

const playSchedule = (mode: Exclude<RunMode, 'endless'>, seed = 123): { director: RunDirector; directives: DirectorDirective[] } => {
  const director = new RunDirector(mode, new Rng(seed));
  const directives: DirectorDirective[] = [];
  for (let second = 0; second <= MODE_DURATION[mode]; second += 1) directives.push(...director.update(1));
  return { director, directives };
};

describe('RunDirector', () => {
  it('uses the configured duration and opens with a predictable spawn', () => {
    const director = new RunDirector('quick', new Rng(1));
    expect(director.duration).toBe(8 * 60);
    expect(director.update(3.99)).toEqual([]);
    expect(director.update(0.01)).toContainEqual({ type: 'spawn', count: 1 });
  });

  it.each(['quick', 'standard', 'daily'] as const)('executes the complete %s schedule under accelerated time', (mode) => {
    const { director, directives } = playSchedule(mode);
    const scheduledObjectives = RUN_SCHEDULES[mode].filter(({ kind }) => kind === 'objective').length;
    const scheduledArchetypes = RUN_SCHEDULES[mode].filter(({ kind }) => kind === 'archetype').length;

    expect(director.elapsed).toBeGreaterThanOrEqual(MODE_DURATION[mode]);
    expect(director.phase).toBe('complete');
    expect(directives.filter(({ type }) => type === 'complete')).toHaveLength(1);
    expect(directives.filter(({ type }) => type === 'objective')).toHaveLength(scheduledObjectives);
    expect(directives.filter(({ type }) => type === 'announcement').length).toBeGreaterThanOrEqual(scheduledArchetypes + 1);
    expect(directives.filter(({ type }) => type === 'finale-stage').map(({ stage }) => stage)).toEqual([1, 2, 3]);
    expect(directives.some(({ type }) => type === 'spawn')).toBe(true);
  });

  it('starts and ends scheduled events while exposing their chaos multiplier', () => {
    const director = new RunDirector('quick', new Rng(2));
    const start = director.update(MODE_DURATION.quick * 0.38);

    expect(start).toContainEqual(expect.objectContaining({ type: 'event-start', event: expect.objectContaining({ id: 'book-drop' }) }));
    expect(director.eventChaosMultiplier()).toBeGreaterThan(1);
    const end = director.update(38);
    expect(end).toContainEqual(expect.objectContaining({ type: 'event-end', event: expect.objectContaining({ id: 'book-drop' }) }));
    expect(director.eventChaosMultiplier()).toBe(1);
  });

  it('spans every finale stage across each mode\'s authored finale window', () => {
    for (const mode of ['quick', 'standard', 'daily'] as const) {
      const director = new RunDirector(mode, new Rng(29));
      const finaleStart = RUN_SCHEDULES[mode].find(({ kind }) => kind === 'finale')?.atRatio as number;
      const remaining = MODE_DURATION[mode] * (1 - finaleStart);

      expect(director.update(MODE_DURATION[mode] * finaleStart)).toContainEqual(expect.objectContaining({ type: 'finale-stage', stage: 1 }));
      expect(director.eventRemaining).toBeCloseTo(remaining);
      expect(director.update(remaining * 0.36)).toContainEqual(expect.objectContaining({ type: 'finale-stage', stage: 2 }));
      expect(director.update(remaining * 0.3)).toContainEqual(expect.objectContaining({ type: 'finale-stage', stage: 3 }));
      expect(director.update(remaining * 0.34).some(({ type }) => type === 'complete')).toBe(true);
    }
  });

  it('cycles objectives and events every two minutes in endless mode', () => {
    const director = new RunDirector('endless', new Rng(3));
    const first = director.update(120);

    expect(director.duration).toBe(Number.POSITIVE_INFINITY);
    expect(first).toContainEqual({ type: 'objective' });
    expect(first).toContainEqual(expect.objectContaining({ type: 'event-start', event: expect.objectContaining({ id: expect.any(String) }) }));
    expect(EVENTS.map(({ id }) => id)).toContain(director.activeEvent?.id);

    const second = director.update(120);
    expect(second).toContainEqual(expect.objectContaining({ type: 'event-end' }));
    expect(second).toContainEqual({ type: 'objective' });
    expect(second).toContainEqual(expect.objectContaining({ type: 'event-start' }));
  });

  it('emits no further work after completion', () => {
    const director = new RunDirector('quick', new Rng(4));
    expect(director.update(MODE_DURATION.quick).some(({ type }) => type === 'complete')).toBe(true);
    expect(director.update(1_000)).toEqual([]);
  });
});
