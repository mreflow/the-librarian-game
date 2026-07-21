import { expect, type Page } from '@playwright/test';

export const SAVE_KEY = 'the-librarian-after-hours-save';

export interface SeedSave {
  version?: number;
  stamps?: number;
  totalRuns?: number;
  totalBooksShelved?: number;
  unlockedLibrarians?: string[];
  unlockedMaps?: string[];
  unlockedTools?: string[];
  achievements?: string[];
  bestRuns?: Record<string, unknown>;
}

interface DebugSnapshot {
  options: {
    mode: string;
    difficulty?: string;
    mapId: string;
    librarianId: string;
    seed: number;
    tutorial: boolean;
  };
  player: { x: number; z: number; carriedBooks: number };
  tutorial: {
    active: boolean;
    step: { id: string; number: number; total: number; title: string } | null;
    marker: { x: number; z: number } | null;
  };
  chaos: { total: number; threshold: string };
  director: {
    elapsed: number;
    phase: string;
    event: string | null;
    kids: number;
    tutorialKids: number;
    looseBooks: number;
  };
  stats: {
    booksCollected: number;
    booksShelved: number;
    kidsCalmed: number;
    objectivesCompleted: number;
    bestCombo: number;
    maxChaos: number;
    timelineSamples: number;
    toolUses: Record<string, number>;
  };
  progression: {
    level: number;
    xp: number;
    tools: Record<string, number>;
    passives: Record<string, number>;
    evolutions: string[];
  };
}

interface LibrarianDebug {
  timeScale: number;
  invulnerable: boolean;
  awardXp(amount?: number): void;
  advance(seconds?: number): void;
  spawn(archetype?: string, count?: number): void;
  setChaos(amount: number): void;
  finish(won?: boolean): void;
  teleport(x: number, z: number): void;
  snapshot(): DebugSnapshot;
}

declare global {
  interface Window {
    librarianDebug?: LibrarianDebug;
  }
}

export const ALL_TOOLS = [
  'shush-wave',
  'rolling-cart',
  'bookmark-boomerang',
  'storytime-aura',
  'return-chute',
  'dewey-drone',
  'stamp-storm',
  'dusting-bell',
  'quiet-sign',
  'reading-lamp',
];

export const unlockedSave = (overrides: SeedSave = {}): SeedSave => ({
  version: 2,
  stamps: 123,
  totalRuns: 4,
  totalBooksShelved: 100,
  unlockedLibrarians: ['head-librarian', 'archivist', 'childrens-librarian'],
  unlockedMaps: ['grand-reading-room', 'midnight-archives'],
  unlockedTools: ALL_TOOLS,
  achievements: [],
  bestRuns: {},
  ...overrides,
});

export const openTitle = async (page: Page, save: SeedSave | null = null): Promise<void> => {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        if (window.localStorage.getItem('librarian-e2e-seeded') === 'true') return;
        window.localStorage.clear();
        if (value) window.localStorage.setItem(key, JSON.stringify(value));
        window.localStorage.setItem('librarian-e2e-seeded', 'true');
      } catch {
        // Initial scripts may also run in an opaque browser error document where storage is unavailable.
      }
    },
    { key: SAVE_KEY, value: save },
  );
  await page.goto('/?debug=1');
  await expect(page.getByRole('heading', { level: 1, name: /The Librarian/i })).toBeVisible();
};

export const startRun = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /Start (?:guided tutorial|shift)/i }).click();
  await expect(page.getByRole('region', { name: 'Shift status' })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.librarianDebug));
};

export const debugSnapshot = (page: Page): Promise<DebugSnapshot> =>
  page.evaluate(() => {
    if (!window.librarianDebug) throw new Error('Debug controls are unavailable.');
    return window.librarianDebug.snapshot();
  });
