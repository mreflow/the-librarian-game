import { DEFAULT_UNLOCKED_TOOLS, LIBRARIANS, TOOLS } from '../data/content';
import { ACHIEVEMENTS, achievementsForRun } from '../data/achievements';
import { MAPS } from '../data/maps';
import type { Difficulty, GameAction, GamepadAction, GamepadBindings, KeyBindings, LibrarianId, LifetimeStats, MapId, RunStats, SaveData, SettingsData, ToolId } from '../types';
import { createDefaultBindings, createDefaultGamepadBindings } from './InputManager';

const SAVE_KEY = 'the-librarian-after-hours-save';
const SAVE_VERSION = 2;

export const DEFAULT_SETTINGS: SettingsData = {
  musicVolume: 0.55,
  sfxVolume: 0.75,
  uiVolume: 0.7,
  ambienceVolume: 0.35,
  muted: false,
  uiScale: 1,
  reducedMotion: false,
  reducedFlash: false,
  highContrast: false,
  colorSafe: false,
  soundCues: false,
  sprintToggle: false,
  defaultDifficulty: 'classic',
  keyBindings: createDefaultBindings(),
  gamepadBindings: createDefaultGamepadBindings(),
};

const boolSetting = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const numberSetting = (value: unknown, fallback: number, minimum: number, maximum: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;

const difficultySetting = (value: unknown): Difficulty =>
  value === 'calm' || value === 'classic' || value === 'heated' ? value : DEFAULT_SETTINGS.defaultDifficulty;

const validIds = <T extends string>(value: unknown, valid: ReadonlySet<string>, defaults: readonly T[]): T[] => {
  const requested = Array.isArray(value) ? value : defaults;
  const filtered = requested.filter((id): id is T => typeof id === 'string' && valid.has(id));
  return [...new Set([...defaults, ...filtered])];
};

const normalizeBindings = (value: unknown): KeyBindings => {
  const defaults = createDefaultBindings();
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<Record<GameAction, unknown>>;
  const claimed = new Set<string>();
  for (const action of Object.keys(defaults) as GameAction[]) {
    const codes = candidate[action];
    const requested = Array.isArray(codes) ? codes : defaults[action];
    const valid = [...new Set(requested.filter((code): code is string => typeof code === 'string' && code.length > 0))]
      .filter((code) => !claimed.has(code));
    const fallback = defaults[action].filter((code) => !claimed.has(code));
    defaults[action] = valid.length > 0 ? valid : fallback;
    defaults[action].forEach((code) => claimed.add(code));
  }
  return defaults;
};

const normalizeGamepadBindings = (value: unknown): GamepadBindings => {
  const defaults = createDefaultGamepadBindings();
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<Record<GamepadAction, unknown>>;
  const claimed = new Set<number>();
  for (const action of Object.keys(defaults) as GamepadAction[]) {
    const requested = candidate[action];
    const button = typeof requested === 'number' && Number.isInteger(requested) && requested >= 0
      ? requested
      : defaults[action];
    if (!claimed.has(button)) defaults[action] = button;
    claimed.add(defaults[action]);
  }
  return defaults;
};

const normalizeSettings = (value: unknown): SettingsData => {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const legacyEffects = candidate.effectsVolume;
  return {
    musicVolume: numberSetting(candidate.musicVolume, DEFAULT_SETTINGS.musicVolume, 0, 1),
    sfxVolume: numberSetting(candidate.sfxVolume ?? legacyEffects, DEFAULT_SETTINGS.sfxVolume, 0, 1),
    uiVolume: numberSetting(candidate.uiVolume ?? legacyEffects, DEFAULT_SETTINGS.uiVolume, 0, 1),
    ambienceVolume: numberSetting(candidate.ambienceVolume, DEFAULT_SETTINGS.ambienceVolume, 0, 1),
    muted: boolSetting(candidate.muted, DEFAULT_SETTINGS.muted),
    uiScale: numberSetting(candidate.uiScale, DEFAULT_SETTINGS.uiScale, 0.85, 1.35),
    reducedMotion: boolSetting(candidate.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    reducedFlash: boolSetting(candidate.reducedFlash, DEFAULT_SETTINGS.reducedFlash),
    highContrast: boolSetting(candidate.highContrast, DEFAULT_SETTINGS.highContrast),
    colorSafe: boolSetting(candidate.colorSafe, DEFAULT_SETTINGS.colorSafe),
    soundCues: boolSetting(candidate.soundCues, DEFAULT_SETTINGS.soundCues),
    sprintToggle: boolSetting(candidate.sprintToggle, DEFAULT_SETTINGS.sprintToggle),
    defaultDifficulty: difficultySetting(candidate.defaultDifficulty),
    keyBindings: normalizeBindings(candidate.keyBindings),
    gamepadBindings: normalizeGamepadBindings(candidate.gamepadBindings),
  };
};

export const createDefaultSave = (): SaveData => ({
  version: SAVE_VERSION,
  stamps: 0,
  totalRuns: 0,
  totalBooksShelved: 0,
  unlockedLibrarians: ['head-librarian'],
  unlockedMaps: ['grand-reading-room'],
  unlockedTools: [...DEFAULT_UNLOCKED_TOOLS],
  achievements: [],
  bestRuns: {},
  lifetimeStats: {
    victories: 0,
    totalPlaySeconds: 0,
    totalKidsCalmed: 0,
    totalObjectivesCompleted: 0,
    highestCombo: 0,
    runsByMap: {},
    runsByLibrarian: {},
    runsByDifficulty: {},
  },
  settings: normalizeSettings(DEFAULT_SETTINGS),
});

export class SaveService {
  private data: SaveData;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
    this.data = this.load();
  }

  get snapshot(): SaveData {
    return structuredClone(this.data);
  }

  updateSettings(settings: Partial<SettingsData>): SaveData {
    this.data.settings = normalizeSettings({ ...this.data.settings, ...settings });
    this.persist();
    return this.snapshot;
  }

  restoreSettings(): SaveData {
    this.data.settings = normalizeSettings(DEFAULT_SETTINGS);
    this.persist();
    return this.snapshot;
  }

  recordRun(stats: RunStats): SaveData {
    this.data.totalRuns += 1;
    this.data.totalBooksShelved += stats.booksShelved;
    this.data.stamps += stats.stampsEarned;
    const difficulty = stats.difficulty ?? 'classic';
    const lifetime = this.data.lifetimeStats;
    lifetime.victories += Number(stats.won);
    lifetime.totalPlaySeconds += Math.max(0, stats.elapsed);
    lifetime.totalKidsCalmed += Math.max(0, stats.kidsCalmed);
    lifetime.totalObjectivesCompleted += Math.max(0, stats.objectivesCompleted);
    lifetime.highestCombo = Math.max(lifetime.highestCombo, stats.bestCombo);
    lifetime.runsByMap[stats.mapId] = (lifetime.runsByMap[stats.mapId] ?? 0) + 1;
    lifetime.runsByLibrarian[stats.librarianId] = (lifetime.runsByLibrarian[stats.librarianId] ?? 0) + 1;
    lifetime.runsByDifficulty[difficulty] = (lifetime.runsByDifficulty[difficulty] ?? 0) + 1;

    const currentBest = this.data.bestRuns[stats.mode];
    if (!currentBest || this.score(stats) > this.score(currentBest)) {
      this.data.bestRuns[stats.mode] = stats;
    }

    if (this.data.totalBooksShelved >= 75) this.unlockLibrarian('archivist');
    if (this.data.totalRuns >= 3 || stats.kidsCalmed >= 25) this.unlockLibrarian('childrens-librarian');
    if (stats.won) this.unlockMap('midnight-archives');
    if (stats.booksShelved >= 30) this.unlockTool('dewey-drone');
    if (stats.bestCombo >= 5) this.unlockTool('stamp-storm');
    if (stats.objectivesCompleted >= 2) this.unlockTool('return-chute');
    if (stats.kidsCalmed >= 15) this.unlockTool('dusting-bell');
    if (stats.maxChaos < 50 && stats.won) this.unlockTool('quiet-sign');
    if (stats.evolutions.length > 0) this.unlockTool('reading-lamp');

    for (const achievement of achievementsForRun(stats, {
      runs: this.data.totalRuns,
      books: this.data.totalBooksShelved,
    })) {
      if (!this.data.achievements.includes(achievement.id)) this.data.achievements.push(achievement.id);
    }

    this.persist();
    return this.snapshot;
  }

  reset(): SaveData {
    this.data = createDefaultSave();
    this.persist();
    return this.snapshot;
  }

  private unlockLibrarian(id: LibrarianId): void {
    if (!this.data.unlockedLibrarians.includes(id)) this.data.unlockedLibrarians.push(id);
  }

  private unlockMap(id: MapId): void {
    if (!this.data.unlockedMaps.includes(id)) this.data.unlockedMaps.push(id);
  }

  private unlockTool(id: ToolId): void {
    if (!this.data.unlockedTools.includes(id)) this.data.unlockedTools.push(id);
  }

  private score(stats: RunStats): number {
    return stats.elapsed + stats.booksShelved * 10 + stats.objectivesCompleted * 120 + (stats.won ? 1000 : 0);
  }

  private load(): SaveData {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return createDefaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return this.migrate(parsed);
    } catch {
      return createDefaultSave();
    }
  }

  private migrate(parsed: Partial<SaveData>): SaveData {
    const defaults = createDefaultSave();
    const parsedLifetime = parsed.lifetimeStats as Partial<LifetimeStats> | undefined;
    const librarianIds = new Set(Object.keys(LIBRARIANS));
    const mapIds = new Set(Object.keys(MAPS));
    const toolIds = new Set(Object.keys(TOOLS));
    const achievementIds = new Set(ACHIEVEMENTS.map(({ id }) => id));
    return {
      ...defaults,
      ...parsed,
      version: SAVE_VERSION,
      settings: normalizeSettings(parsed.settings),
      unlockedLibrarians: validIds<LibrarianId>(parsed.unlockedLibrarians, librarianIds, defaults.unlockedLibrarians),
      unlockedMaps: validIds<MapId>(parsed.unlockedMaps, mapIds, defaults.unlockedMaps),
      unlockedTools: validIds<ToolId>(parsed.unlockedTools, toolIds, defaults.unlockedTools),
      achievements: validIds(parsed.achievements, achievementIds, []),
      bestRuns: parsed.bestRuns ?? {},
      lifetimeStats: {
        ...defaults.lifetimeStats,
        ...parsedLifetime,
        runsByMap: { ...defaults.lifetimeStats.runsByMap, ...parsedLifetime?.runsByMap },
        runsByLibrarian: { ...defaults.lifetimeStats.runsByLibrarian, ...parsedLifetime?.runsByLibrarian },
        runsByDifficulty: { ...defaults.lifetimeStats.runsByDifficulty, ...parsedLifetime?.runsByDifficulty },
      },
    };
  }

  private persist(): void {
    this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
  }
}
