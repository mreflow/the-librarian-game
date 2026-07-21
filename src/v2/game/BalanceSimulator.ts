import type { Difficulty, RunMode } from '../types';
import { Rng } from '../systems/Rng';
import { applyChaosRelief, difficultyMultiplier, initialChaos, updateChaos } from './Balance';
import { MODE_DURATION } from '../data/runContent';

export interface SimulationProfile {
  id: 'newcomer' | 'learning' | 'expert';
  booksPerSecond: number;
  interventionRate: number;
  routeEfficiency: number;
  toolStrength: number;
}

export interface SimulatedRun {
  seed: number;
  mode: RunMode;
  difficulty: Difficulty;
  profile: SimulationProfile['id'];
  won: boolean;
  elapsed: number;
  maxChaos: number;
  recoveries: number;
  booksReturned: number;
  lastCallEntered: boolean;
}

export interface SimulationAggregate {
  mode: RunMode;
  difficulty: Difficulty;
  profile: SimulationProfile['id'];
  runs: number;
  completionRate: number;
  lastCallRate: number;
  averageMaxChaos: number;
  averageRecoveries: number;
  averageBooksReturned: number;
  p50Elapsed: number;
  p95MaxChaos: number;
}

export const SIMULATION_PROFILES: SimulationProfile[] = [
  { id: 'newcomer', booksPerSecond: 0.3, interventionRate: 0.04, routeEfficiency: 0.7, toolStrength: 0.9 },
  { id: 'learning', booksPerSecond: 0.44, interventionRate: 0.068, routeEfficiency: 0.87, toolStrength: 1.2 },
  { id: 'expert', booksPerSecond: 0.5, interventionRate: 0.085, routeEfficiency: 0.93, toolStrength: 1.4 },
];

export const simulateRun = (
  seed: number,
  mode: Exclude<RunMode, 'endless'>,
  difficulty: Difficulty,
  profile: SimulationProfile,
): SimulatedRun => {
  const rng = new Rng(seed);
  const duration = MODE_DURATION[mode];
  let chaos = initialChaos();
  let looseBooks = 5;
  let heldBooks = 0;
  let activeNoise = 1.2;
  let disorderSources = 0;
  let maxChaos = chaos.total;
  let booksReturned = 0;
  let recoveries = 0;
  let lastCallEntered = false;
  let toolCooldown = 12;
  let elapsed = 0;

  for (; elapsed < duration; elapsed += 1) {
    const progress = elapsed / duration;
    const intensity = difficultyMultiplier(mode, elapsed, difficulty);
    const finale = progress >= 0.9 ? 1.45 : 1;
    const event = progress >= 0.24 && progress < 0.3
      ? 1.16
      : progress >= 0.48 && progress < 0.55
        ? 1.12
        : progress >= 0.72 && progress < 0.79
          ? 1.18
          : 1;

    const incidentChance = Math.min(0.76, (0.075 + progress * 0.22) * intensity * finale);
    if (rng.next() < incidentChance) {
      looseBooks += rng.int(1, progress > 0.7 ? 3 : 2);
      if (rng.next() < 0.44) heldBooks += 1;
      activeNoise += rng.range(0.2, 0.72) * intensity;
      if (progress > 0.35 && rng.next() < 0.16 * intensity) disorderSources += 1;
    }

    const routingVariance = rng.range(0.7, 1.28);
    const returnBudget = profile.booksPerSecond * profile.routeEfficiency * routingVariance;
    let returned = 0;
    if (rng.next() < Math.min(0.92, returnBudget)) returned = 1;
    if (returnBudget > 0.24 && rng.next() < returnBudget - 0.18) returned += 1;
    returned = Math.min(returned, looseBooks);
    looseBooks -= returned;
    booksReturned += returned;

    if (heldBooks > 0 && rng.next() < profile.interventionRate * 5.5) {
      heldBooks -= 1;
      looseBooks += rng.next() < 0.45 ? 1 : 0;
    }
    if (rng.next() < profile.interventionRate) activeNoise = Math.max(0, activeNoise - profile.toolStrength * 1.5);

    toolCooldown -= 1;
    if (toolCooldown <= 0) {
      const toolReturns = Math.min(looseBooks, Math.max(1, Math.floor(profile.toolStrength + progress * 1.5)));
      looseBooks -= toolReturns;
      booksReturned += toolReturns;
      activeNoise = Math.max(0, activeNoise - 1.8 * profile.toolStrength);
      if (rng.next() < 0.38 * profile.toolStrength) disorderSources = Math.max(0, disorderSources - 1);
      toolCooldown = Math.max(6, 14 - progress * 4 - profile.toolStrength * 2);
    }

    activeNoise = Math.max(0.25, activeNoise * 0.94);
    if (rng.next() < 0.08 * profile.routeEfficiency) disorderSources = Math.max(0, disorderSources - 1);
    const previousThreshold = chaos.threshold;
    chaos = updateChaos({
      previous: chaos,
      delta: 1,
      looseBooks,
      carriedByKids: heldBooks,
      activeNoise,
      disorderSources,
      eventMultiplier: event * finale,
      calmPerSecond: 0,
    });
    if (returned > 0) chaos = applyChaosRelief(chaos, returned * (0.42 + profile.routeEfficiency * 0.24));
    maxChaos = Math.max(maxChaos, chaos.total);
    if (chaos.threshold === 'last-call') lastCallEntered = true;
    if (previousThreshold === 'last-call' && chaos.threshold !== 'last-call') recoveries += 1;
    if (chaos.threshold === 'last-call' && chaos.lastCallRemaining <= 0) break;
  }

  return {
    seed,
    mode,
    difficulty,
    profile: profile.id,
    won: elapsed >= duration,
    elapsed: Math.min(elapsed, duration),
    maxChaos,
    recoveries,
    booksReturned,
    lastCallEntered,
  };
};

const percentile = (values: number[], ratio: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
};

export const aggregateSimulation = (runs: SimulatedRun[]): SimulationAggregate => {
  if (runs.length === 0) throw new Error('At least one simulated run is required.');
  const first = runs[0] as SimulatedRun;
  const average = (selector: (run: SimulatedRun) => number): number =>
    runs.reduce((sum, run) => sum + selector(run), 0) / runs.length;
  return {
    mode: first.mode,
    difficulty: first.difficulty,
    profile: first.profile,
    runs: runs.length,
    completionRate: average((run) => Number(run.won)),
    lastCallRate: average((run) => Number(run.lastCallEntered)),
    averageMaxChaos: average((run) => run.maxChaos),
    averageRecoveries: average((run) => run.recoveries),
    averageBooksReturned: average((run) => run.booksReturned),
    p50Elapsed: percentile(runs.map((run) => run.elapsed), 0.5),
    p95MaxChaos: percentile(runs.map((run) => run.maxChaos), 0.95),
  };
};

export const simulateMatrix = (runsPerCell = 1_000, mode: Exclude<RunMode, 'endless'> = 'standard'): SimulationAggregate[] => {
  const output: SimulationAggregate[] = [];
  for (const difficulty of ['calm', 'classic', 'heated'] as const) {
    for (const profile of SIMULATION_PROFILES) {
      const runs = Array.from({ length: runsPerCell }, (_, index) =>
        simulateRun(0x51f15e + index * 7919, mode, difficulty, profile),
      );
      output.push(aggregateSimulation(runs));
    }
  }
  return output;
};
