import type { ChaosState, Difficulty, RunMode } from '../types';

export interface ChaosInputs {
  previous: ChaosState;
  delta: number;
  looseBooks: number;
  carriedByKids: number;
  activeNoise: number;
  disorderSources: number;
  eventMultiplier: number;
  calmPerSecond: number;
}

export const xpForLevel = (level: number): number => Math.floor(75 * 1.32 ** Math.max(0, level - 1));

export const chaosThreshold = (total: number, inLastCall: boolean): ChaosState['threshold'] => {
  if (inLastCall) return 'last-call';
  if (total >= 75) return 'critical';
  if (total >= 50) return 'disrupted';
  if (total >= 25) return 'busy';
  return 'orderly';
};

export const initialChaos = (): ChaosState => ({
  total: 8,
  clutter: 3,
  noise: 3,
  disorder: 2,
  dominant: 'clutter',
  threshold: 'orderly',
  lastCallRemaining: 10,
});

export const updateChaos = (inputs: ChaosInputs): ChaosState => {
  const clutterTarget = Math.min(100, inputs.looseBooks * 2.25 + inputs.carriedByKids * 3.4);
  const noiseTarget = Math.min(100, inputs.activeNoise * 4.4);
  const disorderTarget = Math.min(100, inputs.disorderSources * 9);
  const follow = Math.min(1, inputs.delta * 2.2);
  const clutter = inputs.previous.clutter + (clutterTarget - inputs.previous.clutter) * follow;
  const noise = inputs.previous.noise + (noiseTarget - inputs.previous.noise) * follow;
  const disorder = inputs.previous.disorder + (disorderTarget - inputs.previous.disorder) * follow;
  const pressure = (clutter * 0.48 + noise * 0.3 + disorder * 0.22) * inputs.eventMultiplier;
  const drift = pressure > 9 ? (pressure / 100) * inputs.delta * 3.25 : -0.55 * inputs.delta;
  const total = Math.max(0, Math.min(100, inputs.previous.total + drift - inputs.calmPerSecond * inputs.delta));
  const dominant = clutter >= noise && clutter >= disorder ? 'clutter' : noise >= disorder ? 'noise' : 'disorder';
  const inLastCall = inputs.previous.threshold === 'last-call' || total >= 100;
  const lastCallRemaining = inLastCall
    ? total < 90
      ? 10
      : Math.max(0, inputs.previous.lastCallRemaining - inputs.delta)
    : 10;
  return {
    total,
    clutter,
    noise,
    disorder,
    dominant,
    threshold: chaosThreshold(total, inLastCall && total >= 90),
    lastCallRemaining,
  };
};

export const applyChaosRelief = (chaos: ChaosState, amount: number): ChaosState => {
  const total = Math.max(0, chaos.total - amount);
  return {
    ...chaos,
    total,
    threshold: chaosThreshold(total, false),
    lastCallRemaining: total < 90 ? 10 : chaos.lastCallRemaining,
  };
};

export const difficultyMultiplier = (mode: RunMode, elapsed: number, difficulty: Difficulty = 'classic'): number => {
  const base = mode === 'quick' ? 0.86 : mode === 'daily' ? 1.08 : mode === 'endless' ? 1.1 : 1;
  const intensity = difficulty === 'calm' ? 0.68 : difficulty === 'heated' ? 1.18 : 1;
  return base * intensity * (1 + Math.min(0.5, elapsed / 1800));
};

export const rewardMultiplier = (difficulty: Difficulty): number =>
  difficulty === 'calm' ? 0.85 : difficulty === 'heated' ? 1.3 : 1;
