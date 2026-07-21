import { describe, expect, it } from 'vitest';

import { DEFAULT_UNLOCKED_TOOLS } from '../../src/v2/data/content';
import { createDefaultSave, DEFAULT_SETTINGS, SaveService } from '../../src/v2/systems/SaveService';
import type { RunStats } from '../../src/v2/types';

const SAVE_KEY = 'the-librarian-after-hours-save';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const makeRun = (overrides: Partial<RunStats> = {}): RunStats => ({
  seed: 100,
  mode: 'standard',
  mapId: 'grand-reading-room',
  librarianId: 'head-librarian',
  won: false,
  elapsed: 180,
  booksCollected: 12,
  booksShelved: 10,
  kidsCalmed: 5,
  objectivesCompleted: 1,
  evolutions: [],
  bestCombo: 3,
  maxChaos: 72,
  stampsEarned: 8,
  timeline: [],
  ...overrides,
});

describe('SaveService defaults and migrations', () => {
  it('creates a fresh, versioned save with only default content unlocked', () => {
    const storage = new MemoryStorage();
    const service = new SaveService(storage);

    expect(service.snapshot).toEqual(createDefaultSave());
    expect(service.snapshot.unlockedTools).toEqual(DEFAULT_UNLOCKED_TOOLS);
    expect(service.snapshot.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back safely when persisted JSON is corrupt', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{definitely-not-json');

    expect(new SaveService(storage).snapshot).toEqual(createDefaultSave());
  });

  it('migrates partial legacy data while retaining progress and filling new defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        stamps: 41,
        totalRuns: 2,
        unlockedLibrarians: ['head-librarian', 'archivist'],
        settings: { musicVolume: 0.2, reducedMotion: true },
      }),
    );

    const migrated = new SaveService(storage).snapshot;

    expect(migrated.version).toBe(2);
    expect(migrated.stamps).toBe(41);
    expect(migrated.totalRuns).toBe(2);
    expect(migrated.unlockedLibrarians).toEqual(['head-librarian', 'archivist']);
    expect(migrated.settings).toEqual({
      ...DEFAULT_SETTINGS,
      musicVolume: 0.2,
      reducedMotion: true,
    });
    expect(migrated.unlockedMaps).toEqual(['grand-reading-room']);
    expect(migrated.bestRuns).toEqual({});
    expect(migrated.achievements).toEqual([]);
    expect(migrated.lifetimeStats).toEqual(createDefaultSave().lifetimeStats);
  });

  it('allowlists persisted unlock and achievement ids while restoring required defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        unlockedLibrarians: ['removed-librarian', 'archivist', 'archivist'],
        unlockedMaps: ['removed-map', 'midnight-archives'],
        unlockedTools: ['removed-tool', 'dewey-drone', 'dewey-drone'],
        achievements: ['removed-achievement', 'first-shift', 'first-shift'],
      }),
    );

    const migrated = new SaveService(storage).snapshot;
    expect(migrated.unlockedLibrarians).toEqual(['head-librarian', 'archivist']);
    expect(migrated.unlockedMaps).toEqual(['grand-reading-room', 'midnight-archives']);
    expect(migrated.unlockedTools).toEqual([...DEFAULT_UNLOCKED_TOOLS, 'dewey-drone']);
    expect(migrated.achievements).toEqual(['first-shift']);
  });

  it('preserves partial achievement and lifetime history while backfilling nested counters', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        achievements: ['first-shift', 'order-restored'],
        lifetimeStats: {
          victories: 4,
          totalPlaySeconds: 912,
          highestCombo: 8,
          runsByMap: { 'midnight-archives': 3 },
          runsByDifficulty: { heated: 2 },
        },
      }),
    );

    const migrated = new SaveService(storage).snapshot;

    expect(migrated.achievements).toEqual(['first-shift', 'order-restored']);
    expect(migrated.lifetimeStats).toEqual({
      victories: 4,
      totalPlaySeconds: 912,
      totalKidsCalmed: 0,
      totalObjectivesCompleted: 0,
      highestCombo: 8,
      runsByMap: { 'midnight-archives': 3 },
      runsByLibrarian: {},
      runsByDifficulty: { heated: 2 },
    });
  });

  it('returns defensive snapshots that cannot mutate the stored save', () => {
    const service = new SaveService(new MemoryStorage());
    const snapshot = service.snapshot;
    snapshot.stamps = 999;
    snapshot.settings.musicVolume = 0;

    expect(service.snapshot.stamps).toBe(0);
    expect(service.snapshot.settings.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });
});

describe('SaveService progression', () => {
  it('records totals, persists the strongest run, and resets cleanly', () => {
    const storage = new MemoryStorage();
    const service = new SaveService(storage);
    const strongRun = makeRun({ won: true, elapsed: 500, booksShelved: 24, stampsEarned: 17 });
    const weakerRun = makeRun({ elapsed: 60, booksShelved: 2, stampsEarned: 1 });

    service.recordRun(strongRun);
    service.recordRun(weakerRun);

    expect(service.snapshot.totalRuns).toBe(2);
    expect(service.snapshot.totalBooksShelved).toBe(26);
    expect(service.snapshot.stamps).toBe(18);
    expect(service.snapshot.bestRuns.standard).toEqual(strongRun);
    expect(JSON.parse(storage.getItem(SAVE_KEY) ?? '{}')).toEqual(service.snapshot);

    expect(service.reset()).toEqual(createDefaultSave());
    expect(JSON.parse(storage.getItem(SAVE_KEY) ?? '{}')).toEqual(createDefaultSave());
  });

  it('unlocks every challenge reward exactly once when its condition is met', () => {
    const service = new SaveService(new MemoryStorage());
    const completionRun = makeRun({
      won: true,
      booksShelved: 75,
      kidsCalmed: 25,
      objectivesCompleted: 2,
      evolutions: ['Silent Reading'],
      bestCombo: 5,
      maxChaos: 49,
    });

    service.recordRun(completionRun);
    service.recordRun(completionRun);
    const save = service.snapshot;

    expect(save.unlockedLibrarians).toEqual(
      expect.arrayContaining(['head-librarian', 'archivist', 'childrens-librarian']),
    );
    expect(save.unlockedMaps).toEqual(expect.arrayContaining(['grand-reading-room', 'midnight-archives']));
    expect(save.unlockedTools).toEqual(
      expect.arrayContaining([
        'dewey-drone',
        'stamp-storm',
        'return-chute',
        'dusting-bell',
        'quiet-sign',
        'reading-lamp',
      ]),
    );
    expect(new Set(save.unlockedLibrarians).size).toBe(save.unlockedLibrarians.length);
    expect(new Set(save.unlockedMaps).size).toBe(save.unlockedMaps.length);
    expect(new Set(save.unlockedTools).size).toBe(save.unlockedTools.length);
  });

  it('unlocks the children’s librarian after three ordinary shifts', () => {
    const service = new SaveService(new MemoryStorage());

    service.recordRun(makeRun({ kidsCalmed: 0 }));
    service.recordRun(makeRun({ kidsCalmed: 0 }));
    expect(service.snapshot.unlockedLibrarians).not.toContain('childrens-librarian');
    service.recordRun(makeRun({ kidsCalmed: 0 }));

    expect(service.snapshot.unlockedLibrarians).toContain('childrens-librarian');
  });

  it('aggregates lifetime performance and per-selection run counts', () => {
    const service = new SaveService(new MemoryStorage());

    service.recordRun(makeRun({
      won: true,
      difficulty: 'heated',
      elapsed: 245,
      kidsCalmed: 9,
      objectivesCompleted: 2,
      bestCombo: 4,
    }));
    service.recordRun(makeRun({
      mapId: 'midnight-archives',
      librarianId: 'archivist',
      difficulty: 'calm',
      elapsed: 315,
      kidsCalmed: 14,
      objectivesCompleted: 3,
      bestCombo: 7,
    }));
    service.recordRun(makeRun({
      elapsed: -10,
      kidsCalmed: -2,
      objectivesCompleted: -1,
      bestCombo: 2,
    }));

    expect(service.snapshot.lifetimeStats).toEqual({
      victories: 1,
      totalPlaySeconds: 560,
      totalKidsCalmed: 23,
      totalObjectivesCompleted: 5,
      highestCombo: 7,
      runsByMap: {
        'grand-reading-room': 2,
        'midnight-archives': 1,
      },
      runsByLibrarian: {
        'head-librarian': 2,
        archivist: 1,
      },
      runsByDifficulty: {
        heated: 1,
        calm: 1,
        classic: 1,
      },
    });
  });

  it('awards all qualifying achievements once, including map and daily feats', () => {
    const service = new SaveService(new MemoryStorage());
    const achievementRun = makeRun({
      mode: 'daily',
      mapId: 'midnight-archives',
      won: true,
      booksShelved: 30,
      kidsCalmed: 20,
      objectivesCompleted: 3,
      evolutions: ['Silent Reading'],
      bestCombo: 5,
      maxChaos: 95,
    });

    service.recordRun(achievementRun);
    service.recordRun(achievementRun);

    expect(service.snapshot.achievements).toEqual(expect.arrayContaining([
      'first-shift',
      'order-restored',
      'well-read',
      'chain-reader',
      'community-service',
      'multitasker',
      'new-edition',
      'cool-under-pressure',
      'night-keeper',
      'daily-duty',
    ]));
    expect(service.snapshot.achievements).not.toContain('immaculate');
    expect(new Set(service.snapshot.achievements).size).toBe(service.snapshot.achievements.length);
  });

  it('awards cumulative shift and shelving milestones at their thresholds', () => {
    const service = new SaveService(new MemoryStorage());

    for (let run = 0; run < 9; run += 1) {
      service.recordRun(makeRun({ booksShelved: 50 }));
    }
    expect(service.snapshot.achievements).not.toContain('senior-staff');
    expect(service.snapshot.achievements).not.toContain('master-cataloger');

    service.recordRun(makeRun({ booksShelved: 50 }));

    expect(service.snapshot.totalRuns).toBe(10);
    expect(service.snapshot.totalBooksShelved).toBe(500);
    expect(service.snapshot.achievements).toEqual(expect.arrayContaining([
      'senior-staff',
      'master-cataloger',
    ]));
  });
});
