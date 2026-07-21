import type { KidArchetype, RunMode, RunPhase } from '../types';

export type ObjectiveMetric =
  | 'shelve-any'
  | 'shelve-marked'
  | 'shelve-genre'
  | 'calm-kids'
  | 'keep-chaos-low'
  | 'intervene'
  | 'clear-clutter'
  | 'combo'
  | 'visit-zones';

export interface ObjectiveDefinition {
  id: string;
  title: string;
  description: string;
  metric: ObjectiveMetric;
  target: number;
  duration: number;
  rewardXp: number;
  rewardCalm: number;
}

export type EventEffect =
  | 'field-trip'
  | 'catalog-lockdown'
  | 'book-drop'
  | 'storytime'
  | 'power-flicker'
  | 'fire-drill'
  | 'rainy-rush'
  | 'inventory-check';

export interface EventDefinition {
  id: string;
  name: string;
  announcement: string;
  effect: EventEffect;
  duration: number;
  spawnMultiplier: number;
  chaosMultiplier: number;
}

export interface ScheduleBeat {
  atRatio: number;
  kind: 'event' | 'objective' | 'archetype' | 'finale';
  id?: string;
}

export const OBJECTIVES: ObjectiveDefinition[] = [
  { id: 'opening-returns', title: 'Return the loose books', description: 'Pick up three books and carry each to the shelf with the same color and symbol.', metric: 'shelve-any', target: 3, duration: 90, rewardXp: 45, rewardCalm: 7 },
  { id: 'shelving-rush', title: 'Clear the returns cart', description: 'Return twelve books before the cart overflows.', metric: 'shelve-any', target: 12, duration: 65, rewardXp: 70, rewardCalm: 10 },
  { id: 'adventure-quota', title: 'Adventure storytime', description: 'Return six Adventure books before storytime.', metric: 'shelve-genre', target: 6, duration: 60, rewardXp: 80, rewardCalm: 9 },
  { id: 'quiet-reading-room', title: 'Quiet the reading room', description: 'Keep Chaos below 55 while the study group finishes.', metric: 'keep-chaos-low', target: 35, duration: 45, rewardXp: 75, rewardCalm: 12 },
  { id: 'calm-the-crowd', title: 'Restore indoor voices', description: 'Calm eight disruptive visitors.', metric: 'calm-kids', target: 8, duration: 70, rewardXp: 85, rewardCalm: 10 },
  { id: 'help-desk', title: 'Staff the help desk', description: 'Complete six perfectly timed interventions.', metric: 'intervene', target: 6, duration: 75, rewardXp: 80, rewardCalm: 8 },
  { id: 'aisle-clear', title: 'Clear the west stacks', description: 'Keep loose-book clutter below five for twenty seconds.', metric: 'clear-clutter', target: 20, duration: 60, rewardXp: 90, rewardCalm: 14 },
  { id: 'dewey-chain', title: 'Perfect the route', description: 'Build a Dewey Chain of five.', metric: 'combo', target: 5, duration: 75, rewardXp: 95, rewardCalm: 8 },
  { id: 'floor-check', title: 'Make the rounds', description: 'Visit all three highlighted library sections.', metric: 'visit-zones', target: 3, duration: 80, rewardXp: 70, rewardCalm: 9 },
];

export const FINALE_OBJECTIVE: ObjectiveDefinition = {
  id: 'golden-return',
  title: 'Restore the final catalog',
  description: 'Return the three gold-marked volumes before the final bell.',
  metric: 'shelve-marked',
  target: 3,
  duration: 45,
  rewardXp: 120,
  rewardCalm: 15,
};

export const EVENTS: EventDefinition[] = [
  { id: 'book-drop', name: 'Book Drop', announcement: 'The overnight returns just arrived', effect: 'book-drop', duration: 38, spawnMultiplier: 0.8, chaosMultiplier: 1.05 },
  { id: 'storytime', name: 'Story Time', announcement: 'Story time is gathering in the reading room', effect: 'storytime', duration: 42, spawnMultiplier: 1.15, chaosMultiplier: 0.95 },
  { id: 'power-flicker', name: 'Power Flicker', announcement: 'The shelf signs are flickering', effect: 'power-flicker', duration: 34, spawnMultiplier: 1, chaosMultiplier: 1.15 },
  { id: 'fire-drill', name: 'Fire Drill', announcement: 'The east shortcut is temporarily closed', effect: 'fire-drill', duration: 46, spawnMultiplier: 1.1, chaosMultiplier: 1.08 },
  { id: 'rainy-rush', name: 'Rainy-day Rush', announcement: 'A wet and restless crowd is at the doors', effect: 'rainy-rush', duration: 50, spawnMultiplier: 1.65, chaosMultiplier: 1.16 },
  { id: 'inventory-check', name: 'Inventory Check', announcement: 'Rare books have been flagged for immediate return', effect: 'inventory-check', duration: 48, spawnMultiplier: 0.95, chaosMultiplier: 1.1 },
];

export const FINALES: Record<'field-trip' | 'catalog-lockdown', EventDefinition> = {
  'field-trip': {
    id: 'field-trip-finale',
    name: 'The Field Trip',
    announcement: 'The school bus has arrived for the final tour',
    effect: 'field-trip',
    duration: 90,
    spawnMultiplier: 1.8,
    chaosMultiplier: 1.18,
  },
  'catalog-lockdown': {
    id: 'catalog-lockdown-finale',
    name: 'Catalog Lockdown',
    announcement: 'The archive catalog has entered lockdown',
    effect: 'catalog-lockdown',
    duration: 90,
    spawnMultiplier: 1.45,
    chaosMultiplier: 1.22,
  },
};

export const RUN_SCHEDULES: Record<Exclude<RunMode, 'endless'>, ScheduleBeat[]> = {
  quick: [
    { atRatio: 0.08, kind: 'archetype', id: 'sprinter' },
    { atRatio: 0.22, kind: 'objective' },
    { atRatio: 0.38, kind: 'event', id: 'book-drop' },
    { atRatio: 0.58, kind: 'archetype', id: 'hider' },
    { atRatio: 0.68, kind: 'objective' },
    { atRatio: 0.82, kind: 'finale', id: 'closing-rush' },
  ],
  standard: [
    { atRatio: 0.06, kind: 'archetype', id: 'sprinter' },
    { atRatio: 0.16, kind: 'objective' },
    { atRatio: 0.24, kind: 'archetype', id: 'twins' },
    { atRatio: 0.25, kind: 'event', id: 'book-drop' },
    { atRatio: 0.38, kind: 'objective' },
    { atRatio: 0.48, kind: 'event', id: 'fire-drill' },
    { atRatio: 0.5, kind: 'archetype', id: 'hider' },
    { atRatio: 0.57, kind: 'archetype', id: 'snacker' },
    { atRatio: 0.64, kind: 'objective' },
    { atRatio: 0.72, kind: 'event', id: 'inventory-check' },
    { atRatio: 0.75, kind: 'archetype', id: 'paper-plane' },
    { atRatio: 0.79, kind: 'archetype', id: 'fort-builder' },
    { atRatio: 0.86, kind: 'archetype', id: 'tornado' },
    { atRatio: 0.9, kind: 'finale', id: 'field-trip-finale' },
  ],
  daily: [
    { atRatio: 0.12, kind: 'objective' },
    { atRatio: 0.25, kind: 'event', id: 'storytime' },
    { atRatio: 0.36, kind: 'archetype', id: 'twins' },
    { atRatio: 0.46, kind: 'objective' },
    { atRatio: 0.58, kind: 'event', id: 'power-flicker' },
    { atRatio: 0.7, kind: 'archetype', id: 'paper-plane' },
    { atRatio: 0.78, kind: 'objective' },
    { atRatio: 0.9, kind: 'finale', id: 'catalog-crisis' },
  ],
};

export const MODE_DURATION: Record<RunMode, number> = {
  quick: 8 * 60,
  standard: 15 * 60,
  daily: 15 * 60,
  endless: Number.POSITIVE_INFINITY,
};

export const phaseFor = (elapsed: number, duration: number): RunPhase => {
  if (!Number.isFinite(duration)) {
    if (elapsed < 60) return 'opening';
    if (elapsed < 300) return 'building';
    if (elapsed < 600) return 'midshift';
    return 'mastery';
  }
  const ratio = elapsed / duration;
  if (ratio < 0.1) return 'opening';
  if (ratio < 0.5) return 'building';
  if (ratio < 0.62) return 'midshift';
  if (ratio < 0.9) return 'mastery';
  if (ratio < 1) return 'finale';
  return 'complete';
};

export const availableArchetypes = (progress: number): KidArchetype[] => {
  const result: KidArchetype[] = ['browser'];
  if (progress >= 0.06) result.push('sprinter');
  if (progress >= 0.24) result.push('twins');
  if (progress >= 0.5) result.push('hider');
  if (progress >= 0.57) result.push('snacker');
  if (progress >= 0.75) result.push('paper-plane');
  if (progress >= 0.79) result.push('fort-builder');
  if (progress >= 0.86) result.push('tornado');
  return result;
};
