export type GenreId = 'adventure' | 'science' | 'nature' | 'mystery' | 'history' | 'poetry';

export type KidArchetype =
  | 'browser'
  | 'sprinter'
  | 'twins'
  | 'hider'
  | 'snacker'
  | 'paper-plane'
  | 'fort-builder'
  | 'tornado';

export type ToolId =
  | 'shush-wave'
  | 'rolling-cart'
  | 'bookmark-boomerang'
  | 'storytime-aura'
  | 'return-chute'
  | 'dewey-drone'
  | 'stamp-storm'
  | 'dusting-bell'
  | 'quiet-sign'
  | 'reading-lamp';

export type PassiveId =
  | 'comfy-shoes'
  | 'long-arms'
  | 'book-belt'
  | 'vocal-training'
  | 'reading-glasses'
  | 'quick-study'
  | 'deep-breath'
  | 'tidy-desk'
  | 'soft-soles'
  | 'catalog-mind'
  | 'reinforced-cart'
  | 'second-wind';

export type LibrarianId = 'head-librarian' | 'archivist' | 'childrens-librarian';
export type MapId = 'grand-reading-room' | 'midnight-archives';
export type RunMode = 'quick' | 'standard' | 'endless' | 'daily';
export type Difficulty = 'calm' | 'classic' | 'heated';
export type RunPhase = 'opening' | 'building' | 'midshift' | 'mastery' | 'finale' | 'complete';
export type GameScreen = 'loading' | 'title' | 'playing' | 'paused' | 'draft' | 'summary';
export type GameAction = 'up' | 'down' | 'left' | 'right' | 'sprint' | 'intervene' | 'signature' | 'pause';
export type KeyBindings = Record<GameAction, string[]>;
export type GamepadAction = 'sprint' | 'intervene' | 'signature' | 'pause';
export type GamepadBindings = Record<GamepadAction, number>;

export interface BindingChange {
  action: GameAction;
  code: string;
  bindings: KeyBindings;
  swappedWith?: GameAction;
}

export interface GamepadBindingChange {
  action: GamepadAction;
  button: number;
  bindings: GamepadBindings;
  swappedWith?: GamepadAction;
}

export interface Point2 {
  x: number;
  z: number;
}

export interface Bounds2 extends Point2 {
  width: number;
  depth: number;
}

export interface GenreDefinition {
  id: GenreId;
  name: string;
  icon: string;
  color: string;
  emissive: string;
}

export interface KidDefinition {
  id: KidArchetype;
  name: string;
  color: string;
  speed: number;
  stealDelay: number;
  noise: number;
  description: string;
}

export interface ToolDefinition {
  id: ToolId;
  name: string;
  icon: string;
  tags: string[];
  description: string;
  cooldown: number;
  maxRank: number;
  evolution?: { passive: PassiveId; name: string; description: string };
}

export interface PassiveDefinition {
  id: PassiveId;
  name: string;
  icon: string;
  description: string;
  maxRank: number;
}

export interface LibrarianDefinition {
  id: LibrarianId;
  name: string;
  title: string;
  description: string;
  color: string;
  startingTool: ToolId;
  perk: string;
  unlockedByDefault: boolean;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  width: number;
  depth: number;
  floorColor: string;
  wallColor: string;
  accentColor: string;
  shelfLayout: Bounds2[];
  spawnPoints: Point2[];
  eventZones: Array<Bounds2 & { id: string; label: string }>;
  unlockedByDefault: boolean;
}

export interface UpgradeChoice {
  kind: 'tool' | 'passive';
  id: ToolId | PassiveId;
  name: string;
  icon: string;
  description: string;
  currentRank: number;
  maxRank: number;
  evolutionReady?: boolean;
}

export interface ChaosState {
  total: number;
  clutter: number;
  noise: number;
  disorder: number;
  dominant: 'clutter' | 'noise' | 'disorder';
  threshold: 'orderly' | 'busy' | 'disrupted' | 'critical' | 'last-call';
  lastCallRemaining: number;
}

export interface ObjectiveState {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  remaining: number;
}

export interface HudState {
  chaos: ChaosState;
  elapsed: number;
  duration: number;
  phase: RunPhase;
  level: number;
  xp: number;
  xpToNext: number;
  stamina: number;
  maxStamina: number;
  carriedGenres: GenreId[];
  carryCapacity: number;
  objective: ObjectiveState | null;
  activeTool: ToolId;
  activeToolCooldown: number;
  activeToolCooldownMax: number;
  combo: number;
  kids: number;
  eventLabel: string | null;
  eventRemaining: number;
  tutorial: {
    step: number;
    total: number;
    title: string;
    description: string;
  } | null;
  minimap: {
    player: Point2;
    hotspots: Point2[];
    world: { width: number; depth: number };
  };
}

export interface RunStats {
  seed: number;
  mode: RunMode;
  difficulty?: Difficulty;
  mapId: MapId;
  librarianId: LibrarianId;
  won: boolean;
  elapsed: number;
  booksCollected: number;
  booksShelved: number;
  kidsCalmed: number;
  objectivesCompleted: number;
  evolutions: string[];
  toolUses?: Partial<Record<ToolId, number>>;
  mostUsedTool?: ToolId;
  bestCombo: number;
  maxChaos: number;
  stampsEarned: number;
  failureReason?: string;
  timeline: Array<{ time: number; chaos: number; dominant: string }>;
}

export interface SettingsData {
  musicVolume: number;
  sfxVolume: number;
  uiVolume: number;
  ambienceVolume: number;
  muted: boolean;
  uiScale: number;
  reducedMotion: boolean;
  reducedFlash: boolean;
  highContrast: boolean;
  colorSafe: boolean;
  soundCues: boolean;
  sprintToggle: boolean;
  defaultDifficulty: Difficulty;
  keyBindings: KeyBindings;
  gamepadBindings: GamepadBindings;
}

export interface LifetimeStats {
  victories: number;
  totalPlaySeconds: number;
  totalKidsCalmed: number;
  totalObjectivesCompleted: number;
  highestCombo: number;
  runsByMap: Partial<Record<MapId, number>>;
  runsByLibrarian: Partial<Record<LibrarianId, number>>;
  runsByDifficulty: Partial<Record<Difficulty, number>>;
}

export interface SaveData {
  version: number;
  stamps: number;
  totalRuns: number;
  totalBooksShelved: number;
  unlockedLibrarians: LibrarianId[];
  unlockedMaps: MapId[];
  unlockedTools: ToolId[];
  achievements: string[];
  bestRuns: Partial<Record<RunMode, RunStats>>;
  lifetimeStats: LifetimeStats;
  settings: SettingsData;
}

export interface RunOptions {
  mode: RunMode;
  difficulty: Difficulty;
  mapId: MapId;
  librarianId: LibrarianId;
  seed: number;
  tutorial: boolean;
}
