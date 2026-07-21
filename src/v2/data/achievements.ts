import type { RunStats } from '../types';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  test: (stats: RunStats, totals: { runs: number; books: number }) => boolean;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first-shift',
    name: 'First Day',
    description: 'Complete your first shift.',
    test: (_stats, totals) => totals.runs >= 1,
  },
  {
    id: 'order-restored',
    name: 'Order Restored',
    description: 'Complete any shift successfully.',
    test: (stats) => stats.won,
  },
  {
    id: 'well-read',
    name: 'Well Read',
    description: 'Return 30 books in one shift.',
    test: (stats) => stats.booksShelved >= 30,
  },
  {
    id: 'chain-reader',
    name: 'Chain Reader',
    description: 'Build a Dewey Chain of five or more.',
    test: (stats) => stats.bestCombo >= 5,
  },
  {
    id: 'community-service',
    name: 'Community Service',
    description: 'Calm 20 visitors in one shift.',
    test: (stats) => stats.kidsCalmed >= 20,
  },
  {
    id: 'multitasker',
    name: 'Multitasker',
    description: 'Complete three section tasks in one shift.',
    test: (stats) => stats.objectivesCompleted >= 3,
  },
  {
    id: 'new-edition',
    name: 'New Edition',
    description: 'Complete a tool evolution.',
    test: (stats) => stats.evolutions.length > 0,
  },
  {
    id: 'cool-under-pressure',
    name: 'Cool Under Pressure',
    description: 'Win after Chaos reaches 90%.',
    test: (stats) => stats.won && stats.maxChaos >= 90,
  },
  {
    id: 'immaculate',
    name: 'Immaculate',
    description: 'Win without Chaos reaching 40%.',
    test: (stats) => stats.won && stats.maxChaos < 40,
  },
  {
    id: 'night-keeper',
    name: 'Night Keeper',
    description: 'Restore order in the Midnight Archives.',
    test: (stats) => stats.won && stats.mapId === 'midnight-archives',
  },
  {
    id: 'daily-duty',
    name: 'Daily Duty',
    description: 'Complete a Daily Schedule.',
    test: (stats) => stats.won && stats.mode === 'daily',
  },
  {
    id: 'senior-staff',
    name: 'Senior Staff',
    description: 'Complete ten shifts.',
    test: (_stats, totals) => totals.runs >= 10,
  },
  {
    id: 'master-cataloger',
    name: 'Master Cataloger',
    description: 'Return 500 books across all shifts.',
    test: (_stats, totals) => totals.books >= 500,
  },
];

export const achievementsForRun = (
  stats: RunStats,
  totals: { runs: number; books: number },
): AchievementDefinition[] => ACHIEVEMENTS.filter((achievement) => achievement.test(stats, totals));

export const achievementById = (id: string): AchievementDefinition | undefined =>
  ACHIEVEMENTS.find((achievement) => achievement.id === id);
