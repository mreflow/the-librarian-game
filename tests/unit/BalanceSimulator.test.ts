import { describe, expect, it } from 'vitest';

import {
  SIMULATION_PROFILES,
  aggregateSimulation,
  simulateMatrix,
  simulateRun,
} from '../../src/v2/game/BalanceSimulator';

const profile = (id: 'newcomer' | 'learning' | 'expert') =>
  SIMULATION_PROFILES.find((candidate) => candidate.id === id) as (typeof SIMULATION_PROFILES)[number];

describe('BalanceSimulator', () => {
  it('replays the exact same outcome for the same seed and inputs', () => {
    const first = simulateRun(0xabc123, 'standard', 'classic', profile('learning'));
    const second = simulateRun(0xabc123, 'standard', 'classic', profile('learning'));

    expect(first).toEqual(second);
    expect(simulateRun(0xabc124, 'standard', 'classic', profile('learning'))).not.toEqual(first);
  });

  it('returns the complete 3 × 3 difficulty/expertise matrix', () => {
    const runsPerCell = 20;
    const matrix = simulateMatrix(runsPerCell, 'quick');

    expect(matrix).toHaveLength(9);
    expect(new Set(matrix.map(({ difficulty, profile: player }) => `${difficulty}:${player}`)).size).toBe(9);
    for (const cell of matrix) {
      expect(cell.mode).toBe('quick');
      expect(cell.runs).toBe(runsPerCell);
      expect(cell.completionRate).toBeGreaterThanOrEqual(0);
      expect(cell.completionRate).toBeLessThanOrEqual(1);
      expect(cell.lastCallRate).toBeGreaterThanOrEqual(0);
      expect(cell.lastCallRate).toBeLessThanOrEqual(1);
      expect(cell.averageBooksReturned).toBeGreaterThanOrEqual(0);
      expect(cell.p50Elapsed).toBeGreaterThan(0);
      expect(cell.p95MaxChaos).toBeLessThanOrEqual(100);
    }
  });

  it('keeps classic learning completion in the 20–35% first-mastery target band', () => {
    const cell = simulateMatrix(250, 'standard').find(
      ({ difficulty, profile: player }) => difficulty === 'classic' && player === 'learning',
    );

    expect(cell).toBeDefined();
    expect(cell?.completionRate).toBeGreaterThanOrEqual(0.2);
    expect(cell?.completionRate).toBeLessThanOrEqual(0.35);
  });

  it('makes completion non-increasing with difficulty for every expertise profile', () => {
    const matrix = simulateMatrix(250, 'standard');

    for (const player of ['newcomer', 'learning', 'expert'] as const) {
      const completion = (difficulty: 'calm' | 'classic' | 'heated') =>
        matrix.find((cell) => cell.difficulty === difficulty && cell.profile === player)?.completionRate ?? -1;
      expect(completion('calm')).toBeGreaterThanOrEqual(completion('classic'));
      expect(completion('classic')).toBeGreaterThanOrEqual(completion('heated'));
    }
  });

  it('makes completion non-decreasing with expertise at every difficulty', () => {
    const matrix = simulateMatrix(250, 'standard');

    for (const difficulty of ['calm', 'classic', 'heated'] as const) {
      const completion = (player: 'newcomer' | 'learning' | 'expert') =>
        matrix.find((cell) => cell.difficulty === difficulty && cell.profile === player)?.completionRate ?? -1;
      expect(completion('newcomer')).toBeLessThanOrEqual(completion('learning'));
      expect(completion('learning')).toBeLessThanOrEqual(completion('expert'));
    }
  });

  it('aggregates known runs and rejects an empty sample', () => {
    const first = simulateRun(12, 'quick', 'calm', profile('expert'));
    const second = simulateRun(13, 'quick', 'calm', profile('expert'));
    const aggregate = aggregateSimulation([first, second]);

    expect(aggregate).toMatchObject({ mode: 'quick', difficulty: 'calm', profile: 'expert', runs: 2 });
    expect(aggregate.completionRate).toBe((Number(first.won) + Number(second.won)) / 2);
    expect(aggregate.averageBooksReturned).toBe((first.booksReturned + second.booksReturned) / 2);
    expect(() => aggregateSimulation([])).toThrow('At least one simulated run is required.');
  });
});
