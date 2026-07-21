import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import { GENRES, LIBRARIANS, TOOLS } from '../data/content';
import { MAPS } from '../data/maps';
import { availableArchetypes, EVENTS, type EventDefinition } from '../data/runContent';
import type {
  ChaosState,
  HudState,
  KidArchetype,
  RunOptions,
  RunStats,
  SaveData,
  SettingsData,
  ToolId,
  UpgradeChoice,
} from '../types';
import type { AudioManager } from '../systems/AudioManager';
import type { InputManager } from '../systems/InputManager';
import { Rng } from '../systems/Rng';
import type { Telemetry } from '../systems/Telemetry';
import { applyChaosRelief, difficultyMultiplier, initialChaos, rewardMultiplier, updateChaos } from './Balance';
import { BookSystem } from './BookSystem';
import { createEffectRing, createLibrarianVisual } from './EntityFactory';
import { KidSystem } from './KidSystem';
import type { PlayerRuntime, RuntimeEvent, ShelfRuntime } from './models';
import { NavigationSystem } from './NavigationSystem';
import { ObjectiveSystem, type ObjectiveResult } from './ObjectiveSystem';
import { ProgressionSystem } from './ProgressionSystem';
import { RunDirector, type DirectorDirective } from './RunDirector';
import { ToolSystem, type ToolEffect } from './ToolSystem';
import { TutorialDirector, type TutorialEvent, type TutorialStep } from './TutorialDirector';
import { WorldBuilder, type BuiltWorld } from './WorldBuilder';

export interface LibraryGameCallbacks {
  onHud(state: HudState): void;
  onPause(): void;
  onDraft(choices: UpgradeChoice[]): void;
  onFinish(stats: RunStats): void;
  onLabel(message: string, tone?: 'good' | 'warning' | 'event'): void;
  onTutorial(title: string, body: string, key: string): void;
  onTutorialComplete(): void;
}

interface ActiveEffect {
  mesh: Mesh;
  age: number;
  duration: number;
  startScale: number;
  endScale: number;
}

interface DebugControls {
  timeScale: number;
  invulnerable: boolean;
  awardXp: (amount?: number) => void;
  advance: (seconds?: number) => void;
  spawn: (archetype?: string, count?: number) => void;
  event: (id?: string) => void;
  objective: (id?: string) => void;
  finale: (stage?: number) => void;
  setChaos: (amount: number) => void;
  finish: (won?: boolean) => void;
  teleport: (x: number, z: number) => void;
  snapshot: () => DebugSnapshot;
}

interface DebugSnapshot {
  options: RunOptions;
  player: { x: number; z: number; carriedBooks: number };
  tutorial: ReturnType<TutorialDirector['snapshot']> & { marker: { x: number; z: number } | null };
  chaos: ChaosState;
  progression: {
    level: number;
    xp: number;
    xpToNext: number;
    tools: Record<string, number>;
    passives: Record<string, number>;
    evolutions: string[];
  };
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
    toolUses: Partial<Record<ToolId, number>>;
  };
  telemetry: ReturnType<Telemetry['export']>;
  performance: ReturnType<LibraryGame['performanceSummary']>;
}

export class LibraryGame {
  readonly scene: Scene;
  readonly world: BuiltWorld;
  private readonly worldBuilder: WorldBuilder;
  private readonly shelves: ShelfRuntime[];
  private readonly rng: Rng;
  private readonly cosmeticRng: Rng;
  private readonly navigation: NavigationSystem;
  private readonly progression: ProgressionSystem;
  private director: RunDirector;
  private readonly objective: ObjectiveSystem;
  private readonly books: BookSystem;
  private readonly kids: KidSystem;
  private readonly tools: ToolSystem;
  private readonly tutorial: TutorialDirector;
  private readonly player: PlayerRuntime;
  private chaos: ChaosState = initialChaos();
  private paused = false;
  private finished = false;
  private interveneCooldown = 0;
  private lastHudUpdate = 0;
  private lastTimelineSample = -1;
  private tutorialMarker: Mesh | null = null;
  private tutorialMarkerTarget: Vector3 | null = null;
  private tutorialTargetShelf: ShelfRuntime | null = null;
  private objectiveCompleted = 0;
  private booksCollected = 0;
  private booksShelved = 0;
  private kidsCalmed = 0;
  private firstInterventionRecorded = false;
  private maxChaos = 0;
  private chaosFloor = 0;
  private finaleObjectiveComplete = false;
  private calmPerSecond = 0;
  private secondWindUsed = false;
  private readonly activeZones = new Set<string>();
  private readonly activeEffects: ActiveEffect[] = [];
  private readonly timeline: RunStats['timeline'] = [];
  private readonly toolUses: Partial<Record<ToolId, number>> = {};
  private readonly signatureListener = (): void => this.activateSignature();
  private readonly debugTimeScaleListener = (event: Event): void => {
    const value = (event as CustomEvent<number>).detail;
    this.timeScale = Math.max(0.1, Math.min(20, Number.isFinite(value) ? value : 1));
  };
  private readonly debugInvulnerableListener = (event: Event): void => {
    this.invulnerable = Boolean((event as CustomEvent<boolean>).detail);
  };
  private timeScale = 1;
  private invulnerable = false;
  private frameTimeSamples: number[] = [];
  private keyLightIntensityBeforeFlicker: number | null = null;

  constructor(
    private readonly engine: Engine,
    readonly options: RunOptions,
    save: SaveData,
    settings: SettingsData,
    private readonly input: InputManager,
    private readonly audio: AudioManager,
    private readonly telemetry: Telemetry,
    private readonly callbacks: LibraryGameCallbacks,
  ) {
    this.rng = new Rng(options.seed);
    this.cosmeticRng = new Rng(options.seed ^ 0x9e3779b9);
    this.scene = new Scene(engine);
    this.scene.clearColor.set(0.045, 0.035, 0.027, 1);
    const map = MAPS[options.mapId];
    this.worldBuilder = new WorldBuilder(this.scene, map, settings.reducedMotion);
    this.world = this.worldBuilder.build();
    this.shelves = this.world.shelves.map((shelf) => ({
      id: shelf.id,
      genreIndex: shelf.genreIndex,
      position: shelf.position,
      width: shelf.bounds.width,
      depth: shelf.bounds.depth,
      root: shelf.root,
      glow: shelf.glow,
      bookCount: 12,
      capacity: 18,
    }));
    this.navigation = new NavigationSystem(map, this.world.obstacles, this.rng);
    const librarian = LIBRARIANS[options.librarianId];
    this.progression = new ProgressionSystem(librarian.startingTool, save.unlockedTools, this.rng);
    this.director = new RunDirector(options.mode, this.rng, options.mapId, options.difficulty);
    this.objective = new ObjectiveSystem(this.rng);
    this.books = new BookSystem(this.scene, this.shelves, this.rng, settings.reducedMotion);
    this.kids = new KidSystem(this.scene, this.navigation, this.books, this.shelves, this.world.spawnPoints, this.rng, settings.reducedMotion);
    this.tools = new ToolSystem(librarian.startingTool, this.progression);
    this.tutorial = new TutorialDirector(options.tutorial);
    const playerVisual = createLibrarianVisual(this.scene, librarian, settings.reducedMotion);
    const initialPosition = this.navigation.nearestOpenPoint(new Vector3(-6, 0, -map.depth / 2 + 3), 0.7);
    playerVisual.root.position.copyFrom(initialPosition);
    this.player = {
      position: initialPosition,
      velocity: Vector3.Zero(),
      facing: new Vector3(0, 0, 1),
      stamina: 100,
      maxStamina: 100,
      carry: [],
      visual: playerVisual,
      movementSpeed: 5.15,
      pickupRadius: 1.35,
      returnRadius: 1,
      carryCapacity: 5,
      sprintMultiplier: 1.55,
      secondWindAvailable: true,
    };
    if (this.tutorial.active) this.beginTutorial();
    else this.beginOpeningShift(7, 2);
    window.addEventListener('librarian:signature', this.signatureListener);
    this.installDebugControls();
    this.telemetry.record('run_started', 0, { seed: options.seed, mode: options.mode, map: options.mapId });
  }

  update(): void {
    if (this.finished) {
      this.scene.render();
      return;
    }
    const rawDelta = Math.min(0.05, this.engine.getDeltaTime() / 1000);
    const delta = this.paused ? 0 : rawDelta * this.timeScale;
    const frameStart = performance.now();
    const frame = this.input.frame();
    if (frame.pausePressed) this.callbacks.onPause();
    if (this.paused) {
      this.scene.render();
      return;
    }

    this.movePlayer(frame.moveX, frame.moveZ, frame.sprint, delta);
    if (frame.intervenePressed) this.intervene();
    if (frame.signaturePressed) this.activateSignature();
    this.interveneCooldown = Math.max(0, this.interveneCooldown - delta);

    for (const effect of this.tools.update(delta, this.player.position, this.player.facing, this.highestPriorityHotspot())) {
      this.resolveToolEffect(effect);
    }

    const kidResult = this.kids.update(delta, this.director.elapsed, this.player);
    this.processRuntimeEvents(kidResult.events);
    for (const label of kidResult.labels) this.callbacks.onLabel(label, 'warning');

    const librarianComboBonus = this.options.librarianId === 'archivist' ? 2.1 : 0;
    const bookResult = this.books.update(
      delta,
      this.director.elapsed,
      this.player,
      this.progression.passiveRank('catalog-mind') * 1.1 + librarianComboBonus + this.kids.lampBonusAt(this.player.position),
      this.progression.passiveRank('book-belt'),
    );
    this.processRuntimeEvents(bookResult.events);
    if (bookResult.xp > 0) this.awardXp(bookResult.xp);
    if (bookResult.chaosRelief > 0) this.relieveChaos(bookResult.chaosRelief * this.returnCalmMultiplier());
    for (const label of bookResult.labels) {
      this.callbacks.onLabel(label, 'good');
      this.audio.playSfx('success', this.cosmeticRng.range(-0.08, 0.12));
    }

    for (const directive of this.director.update(delta)) this.resolveDirective(directive);
    const objectiveResult = this.objective.update(delta, this.chaos.total, this.books.looseCount());
    if (objectiveResult) this.resolveObjective(objectiveResult);

    this.updateZones();
    this.updateChaos(delta);
    this.updateEffects(delta);
    this.updateWorld(delta);
    this.updateTutorial(delta);
    this.sampleTimeline();
    this.audio.setChaos(this.chaos.total);
    this.maybeUpdateHud();
    this.scene.render();
    this.frameTimeSamples.push(performance.now() - frameStart);
    if (this.frameTimeSamples.length > 900) this.frameTimeSamples.shift();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  chooseUpgrade(choice: UpgradeChoice): void {
    this.progression.apply(choice);
    this.applyPlayerStats();
    this.audio.uiTick(690);
    this.telemetry.record('upgrade_selected', this.director.elapsed, { choice: choice.id, kind: choice.kind });
    if (this.progression.hasDraft()) {
      this.paused = true;
      this.callbacks.onDraft(this.progression.createChoices());
    } else {
      this.paused = false;
    }
  }

  destroy(): void {
    this.restorePowerFlicker();
    this.disposeTutorialMarker();
    window.removeEventListener('librarian:signature', this.signatureListener);
    window.removeEventListener('librarian:debug-timescale', this.debugTimeScaleListener);
    window.removeEventListener('librarian:debug-invulnerable', this.debugInvulnerableListener);
    delete (window as Window & { librarianDebug?: DebugControls }).librarianDebug;
    this.books.destroy();
    this.kids.destroy();
    this.player.visual.dispose();
    this.world.dispose();
    this.scene.dispose();
  }

  performanceSummary(): { averageFrameMs: number; p95FrameMs: number; fps: number } {
    const sorted = [...this.frameTimeSamples].sort((a, b) => a - b);
    const average = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
    return {
      averageFrameMs: average,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      fps: this.engine.getFps(),
    };
  }

  private movePlayer(moveX: number, moveZ: number, sprintRequested: boolean, delta: number): void {
    const direction = new Vector3(moveX, 0, moveZ);
    const moving = direction.lengthSquared() > 0.001;
    if (moving) direction.normalize();
    const onSticky = this.kids.hazards.some(
      (hazard) => hazard.kind === 'sticky' && Vector3.DistanceSquared(hazard.position, this.player.position) <= hazard.radius ** 2,
    );
    const sprinting = moving && sprintRequested && this.player.stamina > 0.5;
    if (sprinting) this.player.stamina = Math.max(0, this.player.stamina - 22 * delta);
    else {
      const recoveryMultiplier = 1 + this.progression.passiveRank('deep-breath') * 0.08;
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + (moving ? 10 : 15) * recoveryMultiplier * delta);
    }
    const speed = this.player.movementSpeed * (sprinting ? this.player.sprintMultiplier : 1) * (onSticky ? 0.58 : 1);
    const before = this.player.position.clone();
    const candidate = this.navigation.move(before, direction.scale(speed * delta), 0.58);
    const blockedByFort = this.kids.hazards.some(
      (hazard) => hazard.kind === 'fort' && Vector3.DistanceSquared(hazard.position, candidate) <= (hazard.radius + 0.4) ** 2,
    );
    this.player.position = blockedByFort ? before : candidate;
    this.player.velocity = this.player.position.subtract(before).scale(1 / Math.max(delta, 0.001));
    if (this.player.velocity.lengthSquared() > 0.02) {
      this.player.facing.copyFrom(this.player.velocity).normalize();
      this.player.visual.root.rotation.y = Math.atan2(this.player.facing.x, this.player.facing.z);
    }
    this.player.visual.root.position.x = this.player.position.x;
    this.player.visual.root.position.z = this.player.position.z;
    this.player.visual.update(this.director.elapsed, this.player.velocity.length(), 'normal', delta);
    if (sprinting) {
      const sprintNoise = Math.max(0, 1 - this.progression.passiveRank('soft-soles') * 0.22);
      this.calmPerSecond -= 0.035 * sprintNoise;
    }
  }

  private intervene(): void {
    if (this.tutorial.active && this.tutorial.current?.id !== 'intervene') {
      this.callbacks.onLabel('FOLLOW THE GUIDED STEP FIRST', 'event');
      return;
    }
    if (this.interveneCooldown > 0) return;
    this.interveneCooldown = 0.65;
    const radius = 2 + this.progression.passiveRank('long-arms') * 0.15;
    const calmDuration = this.options.librarianId === 'childrens-librarian' ? 3.25 : 2.5;
    const events = this.kids.intervene(this.player.position, radius, calmDuration);
    this.processRuntimeEvents(events);
    const calmed = events.filter((event) => event.type === 'kid-calmed').length;
    if (calmed > 0) {
      this.relieveChaos(0.8 + calmed * 0.4);
      this.awardXp(calmed * 6);
      this.audio.playSfx('laugh', this.cosmeticRng.range(-0.1, 0.08));
      this.spawnRing('#e8d38b', this.player.position, radius * 2, 0.38);
    }
  }

  private activateSignature(): void {
    if (this.paused || this.finished) return;
    if (this.tutorial.active && this.tutorial.current?.id !== 'signature') {
      this.callbacks.onLabel('SHUSH WAVE COMES AFTER INTERVENE', 'event');
      return;
    }
    const effect = this.tools.activateSignature(this.player.position, this.player.facing, this.highestPriorityHotspot());
    if (!effect) return;
    this.resolveToolEffect(effect);
    this.audio.uiTick(280);
  }

  private resolveToolEffect(effect: ToolEffect): void {
    this.toolUses[effect.source] = (this.toolUses[effect.source] ?? 0) + 1;
    switch (effect.type) {
      case 'calm': {
        const librarianDuration = this.options.librarianId === 'childrens-librarian' ? 1.3 : 1;
        const count = this.kids.applyCalm(effect.position, effect.radius, Math.max(2.5, effect.duration) * librarianDuration, true);
        if (effect.duration > 0) this.kids.addZone('calm-zone', effect.position, effect.radius * 0.7, effect.duration * librarianDuration);
        this.kidsCalmed += count;
        this.relieveChaos(1.1 + count * effect.amount);
        this.awardXp(count * 5);
        if (effect.reveal) {
          const revealed = this.kids.slowReveal(effect.position, effect.radius, effect.duration);
          const marked = this.books.markInRadius(effect.position, effect.radius, 4);
          this.callbacks.onLabel(`CAPTIVATING CHAPTER · ${revealed} REVEALED · ${marked} BOOKS FLAGGED`, 'good');
        }
        this.spawnRing(effect.evolved ? '#f2dd88' : '#9bd0b7', effect.position, effect.radius * 2, 0.72);
        if (!effect.reveal) this.callbacks.onLabel(effect.evolved ? 'SILENT READING' : `${TOOLS[effect.source].name.toUpperCase()} · ${count} CALMED`, 'good');
        if (count > 0 && this.tutorial.current?.id === 'signature') {
          this.advanceTutorial('signature');
        }
        break;
      }
      case 'collect': {
        const transfers = [this.books.collectInRadius(effect.position, effect.radius, effect.maxBooks, this.player, effect.autoShelve)];
        if (effect.secondaryPosition) {
          transfers.push(this.books.collectInRadius(effect.secondaryPosition, effect.radius, effect.maxBooks, this.player, effect.autoShelve));
        }
        this.processRuntimeEvents(transfers.flatMap(({ events }) => events));
        const count = transfers.reduce((sum, transfer) => sum + transfer.count, 0);
        if (count > 0) {
          this.awardXp(count * (effect.autoShelve ? 12 : 4));
          this.relieveChaos(count * (effect.autoShelve ? 1.15 : 0.3));
          this.callbacks.onLabel(effect.autoShelve ? `EXPRESS RETURN · ${count}` : `BOOKMARK SWEEP · ${count}`, 'good');
        }
        this.spawnRing('#6db7c5', effect.position, effect.radius * 2, 0.55);
        break;
      }
      case 'cart': {
        const transfer = this.books.collectAlongLine(effect.position, effect.direction, effect.distance, effect.width, this.player, effect.evolved);
        this.processRuntimeEvents(transfer.events);
        const count = transfer.count;
        const calmed = this.kids.applyCalm(effect.position.add(effect.direction.scale(effect.distance / 2)), effect.distance / 2, 2.2, true);
        this.awardXp(count * 6 + calmed * 4);
        this.relieveChaos(count * 0.7 + calmed * 0.45);
        this.callbacks.onLabel(effect.evolved ? 'BOOKMOBILE ROUTE' : `CART SWEEP · ${count}`, 'good');
        this.spawnRing('#c49556', effect.position.add(effect.direction.scale(effect.distance / 2)), effect.distance, 0.7);
        break;
      }
      case 'mark': {
        const count = this.books.markInRadius(effect.position, effect.radius);
        if (effect.evolved && count > 0) {
          this.awardXp(count * 3);
          this.relieveChaos(count * 0.35);
        }
        this.callbacks.onLabel(`${effect.evolved ? 'GOLD SEAL' : 'STAMP STORM'} · ${count} MARKED`, 'good');
        this.spawnRing('#d06d75', effect.position, effect.radius * 2, 0.58);
        break;
      }
      case 'reveal-slow': {
        const count = this.kids.slowReveal(effect.position, effect.radius, effect.duration);
        if (effect.evolved) {
          const calmed = this.kids.applyCalm(effect.position, effect.radius, 2.2, false);
          this.kidsCalmed += calmed;
          this.relieveChaos(calmed * 0.45);
        }
        this.callbacks.onLabel(`${effect.evolved ? 'REFERENCE CHIME' : 'DUSTING BELL'} · ${count} REVEALED`, 'good');
        this.spawnRing('#cfc27c', effect.position, effect.radius * 2, 0.8);
        break;
      }
      case 'place-zone': {
        this.kids.addZone(effect.kind, effect.position, effect.radius, effect.duration);
        this.spawnRing(effect.kind === 'lamp' ? '#f2c55f' : '#86b899', effect.position, effect.radius * 2, 0.65);
        break;
      }
    }
  }

  private resolveDirective(directive: DirectorDirective): void {
    if (this.tutorial.active) return;
    switch (directive.type) {
      case 'spawn': {
        const progress = Number.isFinite(this.director.duration)
          ? Math.min(1, this.director.elapsed / this.director.duration)
          : Math.min(1, this.director.elapsed / 1200);
        for (let count = 0; count < (directive.count ?? 1); count += 1) {
          const archetype = directive.archetype ?? this.rng.pick(availableArchetypes(progress));
          this.kids.spawn(archetype);
        }
        break;
      }
      case 'event-start':
        if (directive.label) this.callbacks.onLabel(directive.label, 'event');
        this.audio.playSfx('warning');
        this.applyEventStart(directive.event ?? (EVENTS[0] as EventDefinition));
        this.telemetry.record('event_started', this.director.elapsed, { event: directive.event?.id ?? 'unknown' });
        break;
      case 'event-end':
        if (directive.event) this.applyEventEnd(directive.event);
        this.callbacks.onLabel(`${directive.event?.name ?? 'Event'} resolved`, 'good');
        break;
      case 'objective':
        if (!this.objective.snapshot()) {
          const objective = this.objective.start();
          this.callbacks.onLabel(`NEW TASK · ${objective.title}`, 'event');
          this.telemetry.record('objective_started', this.director.elapsed, { objective: objective.id });
        }
        break;
      case 'announcement':
        if (directive.label) this.callbacks.onLabel(directive.label.toUpperCase(), 'event');
        break;
      case 'finale-stage':
        if ((directive.stage ?? 1) === 1) this.telemetry.record('finale_started', this.director.elapsed, { map: this.options.mapId });
        this.resolveFinaleStage(directive.stage ?? 1, directive.label ?? 'Final crisis');
        break;
      case 'complete':
        this.finish(
          this.finaleObjectiveComplete,
          this.finaleObjectiveComplete ? undefined : 'The final catalog was not restored before the bell.',
        );
        break;
    }
  }

  private applyEventStart(event: EventDefinition): void {
    const { effect } = event;
    if (effect === 'book-drop' || effect === 'inventory-check') {
      for (const shelf of this.rng.shuffle(this.shelves).slice(0, effect === 'book-drop' ? 6 : 4)) this.books.knockFromShelf(shelf, 1);
      if (effect === 'inventory-check') this.books.markInRadius(Vector3.Zero(), 100);
    } else if (effect === 'storytime') {
      const center = Object.values(this.world.eventZoneCenters)[0] ?? Vector3.Zero();
      this.kids.addZone('calm-zone', center, 4, event.duration);
      const attracted = this.kids.attractTo(center);
      this.callbacks.onLabel(`STORY TIME · ${attracted} visitors gathering`, 'event');
    } else if (effect === 'field-trip') {
      for (let index = 0; index < 5; index += 1) this.kids.spawn(this.rng.pick(availableArchetypes(0.8)));
    } else if (effect === 'rainy-rush') {
      for (let index = 0; index < 5; index += 1) this.kids.spawn(this.rng.pick(availableArchetypes(0.8)));
      for (const entrance of this.world.spawnPoints.slice(0, 3)) {
        const inside = this.navigation.nearestOpenPoint(entrance.scale(0.82));
        this.kids.addDisruption('sticky', inside, event.duration, 1.65);
      }
      this.callbacks.onLabel('WET FLOORS · entrances are slowed', 'warning');
    } else if (effect === 'catalog-lockdown') {
      for (const shelf of this.rng.shuffle(this.shelves).slice(0, 6)) this.books.knockFromShelf(shelf, 1);
      for (let index = 0; index < 3; index += 1) this.kids.spawn(this.rng.pick<KidArchetype>(['hider', 'paper-plane', 'fort-builder']));
      this.books.markInRadius(Vector3.Zero(), 100);
    } else if (effect === 'fire-drill') {
      const center = Object.values(this.world.eventZoneCenters)[1] ?? Vector3.Zero();
      this.kids.addDisruption('fort', center, event.duration, 2.2);
      this.callbacks.onLabel('ROUTE CLOSED · clear the barrier with Space', 'warning');
    } else if (effect === 'power-flicker') {
      const light = this.scene.getLightByName('key-light');
      if (light) {
        this.keyLightIntensityBeforeFlicker ??= light.intensity;
        light.intensity = this.keyLightIntensityBeforeFlicker * 0.68;
      }
    }
  }

  private applyEventEnd(event: EventDefinition): void {
    if (event.effect === 'power-flicker') this.restorePowerFlicker();
  }

  private restorePowerFlicker(): void {
    if (this.keyLightIntensityBeforeFlicker === null) return;
    const light = this.scene.getLightByName('key-light');
    if (light && !light.isDisposed()) light.intensity = this.keyLightIntensityBeforeFlicker;
    this.keyLightIntensityBeforeFlicker = null;
  }

  private resolveFinaleStage(stage: number, label: string): void {
    this.worldBuilder.presentFinale(stage);
    this.callbacks.onLabel(`FINAL BELL ${stage}/3 · ${label}`, 'warning');
    this.audio.playSfx('warning', stage * 0.05);
    const archives = this.options.mapId === 'midnight-archives';
    if (stage === 1) {
      const arrivals: KidArchetype[] = archives
        ? ['hider', 'paper-plane', 'fort-builder', 'hider', 'paper-plane']
        : ['sprinter', 'twins', 'browser', 'sprinter', 'tornado'];
      for (const archetype of arrivals) this.kids.spawn(archetype);
    } else if (stage === 2) {
      const zones = Object.values(this.world.eventZoneCenters);
      if (archives) {
        if (zones[1]) this.kids.addDisruption('fort', zones[1], 55, 1.8);
        if (zones[2]) this.kids.addDisruption('fort', zones[2], 55, 1.8);
        if (zones[0]) this.kids.addDisruption('noise', zones[0], 55, 2.5);
        this.callbacks.onLabel('CATALOG LOCKDOWN · restore both archive routes', 'warning');
      } else {
        for (const position of [new Vector3(-4, 0, 0), Vector3.Zero(), new Vector3(4, 0, 0)]) {
          this.kids.addDisruption('fort', this.navigation.nearestOpenPoint(position), 55, 1.75);
        }
        this.callbacks.onLabel('MOBILE BOOK FORT · clear the central route', 'warning');
      }
    } else {
      const shelves = this.rng.shuffle(this.shelves).slice(0, archives ? 4 : 3);
      for (const shelf of shelves) this.books.knockFromShelf(shelf, 2);
      const marked = this.books.markInRadius(Vector3.Zero(), 100, 3);
      this.objective.clear();
      this.objective.start('golden-return');
      if (!archives) this.chaosFloor = 60;
      this.callbacks.onLabel(`${archives ? 'GOLD INDEX' : 'GOLDEN BOOKS'} · return ${marked} flagged volumes`, 'event');
    }
  }

  private resolveObjective(result: ObjectiveResult): void {
    if (result.completed) {
      if (result.definition.id === 'golden-return') this.finaleObjectiveComplete = true;
      this.objectiveCompleted += 1;
      this.awardXp(result.definition.rewardXp);
      this.relieveChaos(result.definition.rewardCalm);
      this.callbacks.onLabel(`TASK COMPLETE · ${result.definition.title}`, 'good');
      this.audio.playSfx('success');
      this.telemetry.record('objective_completed', this.director.elapsed, { objective: result.definition.id });
    } else {
      this.chaos.total = Math.min(100, this.chaos.total + 8);
      this.callbacks.onLabel(`TASK MISSED · ${result.definition.title}`, 'warning');
      this.telemetry.record('objective_failed', this.director.elapsed, { objective: result.definition.id });
    }
  }

  private processRuntimeEvents(events: RuntimeEvent[]): void {
    for (const event of events) {
      const objectiveMultiplier = 1 + this.progression.passiveRank('catalog-mind') * 0.1;
      const objectiveResult = this.objective.record(event, objectiveMultiplier);
      if (objectiveResult) this.resolveObjective(objectiveResult);
      if (event.type === 'book-collected') {
        this.booksCollected += event.amount ?? 1;
        this.audio.playSfx('pickup', this.cosmeticRng.range(-0.08, 0.1));
        if (this.booksCollected === 1) this.telemetry.record('first_pickup', this.director.elapsed);
        if (this.tutorial.current?.id === 'pickup') this.advanceTutorial('book-collected');
      } else if (event.type === 'book-shelved') {
        this.booksShelved += event.amount ?? 1;
        this.audio.playSfx('shelve', this.cosmeticRng.range(-0.06, 0.16));
        if (this.booksShelved === 1) this.telemetry.record('first_shelve', this.director.elapsed);
        if (this.tutorial.current?.id === 'return') this.advanceTutorial('book-shelved');
      } else if (event.type === 'kid-calmed') {
        this.kidsCalmed += event.amount ?? 1;
      } else if (event.type === 'intervene') {
        if (!this.firstInterventionRecorded) {
          this.firstInterventionRecorded = true;
          this.telemetry.record('first_intervention', this.director.elapsed);
        }
        if (this.tutorial.current?.id === 'intervene') this.advanceTutorial('intervene');
      }
    }
  }

  private awardXp(amount: number): void {
    const leveled = this.progression.award(amount);
    if (leveled && this.progression.hasDraft()) {
      this.player.stamina = this.player.maxStamina;
      this.paused = true;
      this.telemetry.record('upgrade_offered', this.director.elapsed, { level: this.progression.level });
      this.callbacks.onDraft(this.progression.createChoices());
    }
  }

  private updateChaos(delta: number): void {
    const previousThreshold = this.chaos.threshold;
    this.chaos = updateChaos({
      previous: this.chaos,
      delta,
      looseBooks: this.books.looseCount(),
      carriedByKids: this.books.kidHeldCount(),
      activeNoise: this.kids.activeNoise() * difficultyMultiplier(this.options.mode, this.director.elapsed, this.options.difficulty),
      disorderSources: this.kids.disorderSources(),
      eventMultiplier: this.director.eventChaosMultiplier(),
      calmPerSecond: this.calmPerSecond,
    });
    if (this.chaos.total < this.chaosFloor) {
      this.chaos.total = this.chaosFloor;
      this.chaos.threshold = this.chaosFloor >= 75 ? 'critical' : this.chaosFloor >= 50 ? 'disrupted' : 'busy';
    }
    this.calmPerSecond = 0;
    this.maxChaos = Math.max(this.maxChaos, this.chaos.total);
    if (this.chaos.threshold !== previousThreshold) {
      if (this.chaos.threshold === 'last-call') {
        this.callbacks.onLabel('LAST CALL · restore order now', 'warning');
        this.audio.playSfx('warning');
        this.telemetry.record('last_call', this.director.elapsed);
      } else if (this.chaos.threshold === 'critical') {
        this.callbacks.onLabel(`CRITICAL · mostly ${this.chaos.dominant}`, 'warning');
      }
    }
    if (this.chaos.threshold === 'last-call' && this.chaos.lastCallRemaining <= 0 && !this.invulnerable) {
      if (this.player.secondWindAvailable && this.progression.passiveRank('second-wind') > 0 && !this.secondWindUsed) {
        this.secondWindUsed = true;
        this.player.secondWindAvailable = false;
        this.chaos = applyChaosRelief(this.chaos, 25);
        this.callbacks.onLabel('SECOND WIND · last call recovered', 'good');
      } else this.finish(false, 'Chaos stayed at critical through Last Call.');
    }
  }

  private relieveChaos(amount: number): void {
    const wasLastCall = this.chaos.threshold === 'last-call';
    this.chaos = applyChaosRelief(this.chaos, amount * (1 + this.progression.passiveRank('tidy-desk') * 0.08));
    if (this.chaos.total < this.chaosFloor) {
      this.chaos.total = this.chaosFloor;
      this.chaos.threshold = this.chaosFloor >= 75 ? 'critical' : this.chaosFloor >= 50 ? 'disrupted' : 'busy';
    }
    if (wasLastCall && this.chaos.threshold !== 'last-call') this.telemetry.record('last_call_recovered', this.director.elapsed);
  }

  private applyPlayerStats(): void {
    this.player.movementSpeed = 5.15 * (1 + this.progression.passiveRank('comfy-shoes') * 0.1);
    this.player.pickupRadius = 1.35 + this.progression.passiveRank('long-arms') * 0.45;
    this.player.returnRadius = 1 + this.progression.passiveRank('long-arms') * 0.24;
    this.player.carryCapacity = 5 + this.progression.passiveRank('book-belt');
    const oldMax = this.player.maxStamina;
    this.player.maxStamina = 100 + this.progression.passiveRank('deep-breath') * 12;
    this.player.stamina += this.player.maxStamina - oldMax;
  }

  private returnCalmMultiplier(): number {
    return this.options.librarianId === 'head-librarian' ? 1.1 : 1;
  }

  private updateZones(): void {
    for (const zone of MAPS[this.options.mapId].eventZones) {
      const inside =
        Math.abs(this.player.position.x - zone.x) <= zone.width / 2 &&
        Math.abs(this.player.position.z - zone.z) <= zone.depth / 2;
      if (inside && !this.activeZones.has(zone.id)) {
        this.activeZones.add(zone.id);
        const result = this.objective.record({ type: 'zone-visited', zoneId: zone.id });
        if (result) this.resolveObjective(result);
      } else if (!inside) this.activeZones.delete(zone.id);
    }
  }

  private updateWorld(delta: number): void {
    this.worldBuilder.updateOcclusion(this.player.position);
    for (const shelf of this.shelves) {
      const carriedGenre = this.player.carry.some((book) => GENRES[shelf.genreIndex]?.id === book.genreId);
      const tutorialTarget = this.tutorial.current?.id === 'return' && shelf === this.tutorialTargetShelf;
      shelf.glow.visibility += ((tutorialTarget ? 1 : carriedGenre ? 0.72 : 0.08) - shelf.glow.visibility) * Math.min(1, delta * 8);
    }
  }

  private updateEffects(delta: number): void {
    for (const effect of [...this.activeEffects]) {
      effect.age += delta;
      const progress = Math.min(1, effect.age / effect.duration);
      const scale = effect.startScale + (effect.endScale - effect.startScale) * progress;
      effect.mesh.scaling.setAll(scale);
      effect.mesh.visibility = 1 - progress;
      if (progress >= 1) {
        effect.mesh.dispose();
        this.activeEffects.splice(this.activeEffects.indexOf(effect), 1);
      }
    }
  }

  private spawnRing(color: string, position: Vector3, diameter: number, duration: number): void {
    const mesh = createEffectRing(this.scene, color, position, diameter * 0.18);
    this.activeEffects.push({ mesh, age: 0, duration, startScale: 1, endScale: 5.4 });
  }

  private beginTutorial(): void {
    const shelfCandidates = this.shelves
      .filter((shelf) => Vector3.DistanceSquared(shelf.position, this.player.position) > 64)
      .sort((left, right) => Vector3.DistanceSquared(left.position, this.player.position) - Vector3.DistanceSquared(right.position, this.player.position));
    this.tutorialTargetShelf = shelfCandidates[0] ?? this.shelves[0] ?? null;
    if (this.tutorialTargetShelf) {
      const position = this.navigation.nearestOpenPoint(this.player.position.add(new Vector3(0, 0, 2.75)), 0.72);
      const book = this.books.placeTutorialBook(this.tutorialTargetShelf, position);
      if (book) this.setTutorialMarker(book.position, 1.75);
    }
    const step = this.tutorial.current;
    if (step) this.presentTutorialStep(step);
  }

  private beginOpeningShift(bookCount: number, kidCount: number): void {
    this.books.seedReturns(bookCount, this.openingReturnPositions(bookCount));
    for (let index = 0; index < kidCount; index += 1) this.kids.spawn('browser');
    if (!this.objective.snapshot()) {
      const objective = this.objective.start('opening-returns');
      this.callbacks.onLabel(`FIRST TASK · ${objective.title}`, 'event');
    }
  }

  private openingReturnPositions(count: number): Vector3[] {
    const forward = this.player.facing.lengthSquared() > 0.01 ? this.player.facing.clone().normalize() : new Vector3(0, 0, 1);
    const right = new Vector3(forward.z, 0, -forward.x);
    return Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / 5);
      const column = index % 5;
      const lateral = (column - Math.min(4, count - row * 5 - 1) / 2) * 1.2;
      const point = this.player.position
        .add(forward.scale(3.35 + row * 1.25))
        .add(right.scale(lateral));
      return this.navigation.nearestOpenPoint(point, 0.42);
    });
  }

  private advanceTutorial(event: TutorialEvent): void {
    const step = this.tutorial.record(event);
    if (step) this.presentTutorialStep(step);
  }

  private presentTutorialStep(step: TutorialStep): void {
    if (step.id === 'return' && this.tutorialTargetShelf) {
      this.setTutorialMarker(this.shelfApproachPoint(this.tutorialTargetShelf), 2.2);
    } else if (step.id === 'intervene') {
      const target = this.navigation.nearestOpenPoint(this.player.position.add(new Vector3(1.1, 0, 1.3)), 0.48);
      const staged = this.kids.stageTutorialTargets(target, 1);
      if (staged[0]) this.setTutorialMarker(staged[0].position, 2.35);
    } else if (step.id === 'signature') {
      const target = this.navigation.nearestOpenPoint(this.player.position.add(new Vector3(0, 0, 2.2)), 0.48);
      const staged = this.kids.stageTutorialTargets(target, 3);
      if (staged.length) {
        const center = staged.reduce((sum, kid) => sum.add(kid.position), Vector3.Zero()).scale(1 / staged.length);
        this.setTutorialMarker(center, 4.8);
      }
    } else if (step.id === 'chaos') {
      this.disposeTutorialMarker();
      this.chaos.total = Math.max(this.chaos.total, 28);
      this.callbacks.onLabel('TRAINING COMPLETE · CLUTTER + NOISE + DISORDER = CHAOS', 'good');
    }
    this.callbacks.onTutorial(
      `Step ${step.number} of ${step.total} · ${step.title}`,
      step.description,
      step.key,
    );
  }

  private shelfApproachPoint(shelf: ShelfRuntime): Vector3 {
    const horizontal = shelf.width >= shelf.depth;
    if (horizontal) {
      const side = this.player.position.z <= shelf.position.z ? -1 : 1;
      const x = Math.max(shelf.position.x - shelf.width * 0.38, Math.min(shelf.position.x + shelf.width * 0.38, this.player.position.x));
      return this.navigation.nearestOpenPoint(new Vector3(x, 0, shelf.position.z + side * (shelf.depth / 2 + 1.05)), 0.52);
    }
    const side = this.player.position.x <= shelf.position.x ? -1 : 1;
    const z = Math.max(shelf.position.z - shelf.depth * 0.38, Math.min(shelf.position.z + shelf.depth * 0.38, this.player.position.z));
    return this.navigation.nearestOpenPoint(new Vector3(shelf.position.x + side * (shelf.width / 2 + 1.05), 0, z), 0.52);
  }

  private setTutorialMarker(position: Vector3, diameter: number): void {
    this.disposeTutorialMarker();
    this.tutorialMarkerTarget = position.clone();
    this.tutorialMarker = createEffectRing(this.scene, '#f6cf63', position, diameter);
  }

  private disposeTutorialMarker(): void {
    this.tutorialMarker?.dispose(false);
    this.tutorialMarker = null;
    this.tutorialMarkerTarget = null;
  }

  private updateTutorial(delta: number): void {
    if (this.tutorialMarker && this.tutorialMarkerTarget) {
      this.tutorialMarker.position.x = this.tutorialMarkerTarget.x;
      this.tutorialMarker.position.z = this.tutorialMarkerTarget.z;
      const pulse = 1 + Math.sin(this.director.elapsed * 4.2) * 0.09;
      this.tutorialMarker.scaling.setAll(pulse);
      this.tutorialMarker.visibility = 0.82 + Math.sin(this.director.elapsed * 4.2) * 0.16;
    }
    if (this.tutorial.update(delta)) {
      this.disposeTutorialMarker();
      this.callbacks.onTutorialComplete();
      this.callbacks.onLabel('GUIDED TOUR COMPLETE · THE SHIFT STARTS NOW', 'good');
      this.kids.clearTutorialActors();
      this.resetForOpeningShift();
      this.beginOpeningShift(5, 2);
    }
  }

  private resetForOpeningShift(): void {
    this.rng.reset(this.options.seed);
    this.progression.reset();
    this.books.resetRunState();
    this.objective.clear();
    this.tools.resetCooldowns();
    this.chaos = initialChaos();
    this.interveneCooldown = 0;
    this.objectiveCompleted = 0;
    this.booksCollected = 0;
    this.booksShelved = 0;
    this.kidsCalmed = 0;
    this.firstInterventionRecorded = false;
    this.maxChaos = 0;
    this.chaosFloor = 0;
    this.finaleObjectiveComplete = false;
    this.calmPerSecond = 0;
    this.secondWindUsed = false;
    this.activeZones.clear();
    this.timeline.length = 0;
    for (const tool of Object.keys(this.toolUses) as ToolId[]) delete this.toolUses[tool];
    this.player.secondWindAvailable = true;
    this.applyPlayerStats();
    this.player.stamina = this.player.maxStamina;
    this.timeScale = 1;
    this.frameTimeSamples = [];
    this.director = new RunDirector(this.options.mode, this.rng, this.options.mapId, this.options.difficulty);
    this.lastHudUpdate = -1;
    this.lastTimelineSample = -1;
    this.telemetry.reset();
    this.telemetry.record('run_started', 0, { seed: this.options.seed, mode: this.options.mode, map: this.options.mapId });
  }

  private sampleTimeline(): void {
    const sample = Math.floor(this.director.elapsed / 10);
    if (sample === this.lastTimelineSample) return;
    this.lastTimelineSample = sample;
    this.timeline.push({ time: this.director.elapsed, chaos: this.chaos.total, dominant: this.chaos.dominant });
  }

  private maybeUpdateHud(): void {
    if (this.director.elapsed - this.lastHudUpdate < 0.05) return;
    this.lastHudUpdate = this.director.elapsed;
    const map = MAPS[this.options.mapId];
    this.callbacks.onHud({
      chaos: this.chaos,
      elapsed: this.director.elapsed,
      duration: this.director.duration,
      phase: this.director.phase,
      level: this.progression.level,
      xp: this.progression.xp,
      xpToNext: this.progression.xpToNext,
      stamina: this.player.stamina,
      maxStamina: this.player.maxStamina,
      carriedGenres: this.player.carry.map((book) => book.genreId),
      carryCapacity: this.player.carryCapacity,
      objective: this.objective.snapshot(),
      activeTool: this.tools.signature,
      activeToolCooldown: this.tools.cooldown(this.tools.signature),
      activeToolCooldownMax: this.tools.cooldownMax(this.tools.signature),
      combo: this.books.getCombo(),
      kids: this.kids.kids.length,
      eventLabel: this.director.activeEvent?.name ?? null,
      eventRemaining: this.director.eventRemaining,
      tutorial: this.tutorial.current
        ? {
            step: this.tutorial.current.number,
            total: this.tutorial.current.total,
            title: this.tutorial.current.title,
            description: this.tutorial.current.description,
          }
        : null,
      minimap: {
        player: { x: this.player.position.x, z: this.player.position.z },
        hotspots: this.books.hotspots().slice(0, 16).map((point) => ({ x: point.x, z: point.z })),
        world: { width: map.width, depth: map.depth },
      },
    });
  }

  private highestPriorityHotspot(): Vector3 | null {
    return this.books.closestHotspot(this.player.position) ?? this.kids.nearestKidPosition(this.player.position);
  }

  private finish(won: boolean, failureReason?: string): void {
    if (this.finished) return;
    this.finished = true;
    this.paused = true;
    const baseStamps = Math.floor(this.booksShelved / 6) + this.objectiveCompleted * 3 + (won ? 8 : 0);
    const stamps = Math.max(1, Math.floor(baseStamps * rewardMultiplier(this.options.difficulty)));
    const mostUsedTool = (Object.entries(this.toolUses) as Array<[ToolId, number]>)
      .sort((left, right) => right[1] - left[1])[0]?.[0] ?? this.tools.signature;
    const stats: RunStats = {
      seed: this.options.seed,
      mode: this.options.mode,
      difficulty: this.options.difficulty,
      mapId: this.options.mapId,
      librarianId: this.options.librarianId,
      won,
      elapsed: this.director.elapsed,
      booksCollected: this.booksCollected,
      booksShelved: this.booksShelved,
      kidsCalmed: this.kidsCalmed,
      objectivesCompleted: this.objectiveCompleted,
      evolutions: [...this.progression.evolutions],
      toolUses: { ...this.toolUses },
      mostUsedTool,
      bestCombo: this.books.getBestCombo(),
      maxChaos: this.maxChaos,
      stampsEarned: stamps,
      failureReason,
      timeline: [...this.timeline],
    };
    this.telemetry.record('run_finished', this.director.elapsed, { won, books: this.booksShelved, chaos: this.maxChaos });
    this.audio.playSfx(won ? 'success' : 'warning');
    this.callbacks.onFinish(stats);
  }

  private installDebugControls(): void {
    if (!import.meta.env.DEV && !new URLSearchParams(location.search).has('debug')) return;
    const controls: DebugControls = {
      timeScale: this.timeScale,
      invulnerable: this.invulnerable,
      awardXp: (amount = 100) => this.awardXp(amount),
      advance: (seconds = 1) => {
        const safeSeconds = Math.max(0, Math.min(600, Number.isFinite(seconds) ? seconds : 0));
        for (const directive of this.director.update(safeSeconds)) this.resolveDirective(directive);
        this.maybeUpdateHud();
      },
      spawn: (archetype = 'browser', count = 1) => {
        for (let index = 0; index < count; index += 1) this.kids.spawn(archetype as Parameters<KidSystem['spawn']>[0]);
      },
      event: (id = 'book-drop') => {
        const event = EVENTS.find((candidate) => candidate.id === id) ?? EVENTS[0];
        if (!event) return;
        for (const directive of this.director.forceEvent(event)) this.resolveDirective(directive);
      },
      objective: (id) => {
        this.objective.clear();
        const objective = this.objective.start(id);
        this.callbacks.onLabel(`DEBUG TASK · ${objective.title}`, 'event');
      },
      finale: (stage = 1) => this.resolveFinaleStage(Math.max(1, Math.min(3, stage)), 'Debug finale stage'),
      setChaos: (amount) => {
        this.chaos.total = Math.max(0, Math.min(100, amount));
      },
      finish: (won = true) => this.finish(won, won ? undefined : 'Debug run ended.'),
      teleport: (x, z) => {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        this.player.position.copyFrom(this.navigation.nearestOpenPoint(new Vector3(x, 0, z), 0.58));
        this.player.visual.root.position.x = this.player.position.x;
        this.player.visual.root.position.z = this.player.position.z;
      },
      snapshot: () => {
        const progression = this.progression.snapshot();
        return {
          options: this.options,
          player: { x: this.player.position.x, z: this.player.position.z, carriedBooks: this.player.carry.length },
          tutorial: {
            ...this.tutorial.snapshot(),
            marker: this.tutorialMarkerTarget
              ? { x: this.tutorialMarkerTarget.x, z: this.tutorialMarkerTarget.z }
              : null,
          },
          chaos: this.chaos,
          progression: {
            ...progression,
            tools: Object.fromEntries(Object.entries(progression.tools).filter((entry): entry is [string, number] => entry[1] !== undefined)),
            passives: Object.fromEntries(Object.entries(progression.passives).filter((entry): entry is [string, number] => entry[1] !== undefined)),
          },
          director: {
            elapsed: this.director.elapsed,
            phase: this.director.phase,
            event: this.director.activeEvent?.id ?? null,
            kids: this.kids.kids.length,
            tutorialKids: this.kids.tutorialActorCount(),
            looseBooks: this.books.looseCount(),
          },
          stats: {
            booksCollected: this.booksCollected,
            booksShelved: this.booksShelved,
            kidsCalmed: this.kidsCalmed,
            objectivesCompleted: this.objectiveCompleted,
            bestCombo: this.books.getBestCombo(),
            maxChaos: this.maxChaos,
            timelineSamples: this.timeline.length,
            toolUses: { ...this.toolUses },
          },
          telemetry: this.telemetry.export(),
          performance: this.performanceSummary(),
        };
      },
    };
    Object.defineProperties(controls, {
      timeScale: {
        enumerable: true,
        get: () => this.timeScale,
        set: (value: number) => window.dispatchEvent(new CustomEvent('librarian:debug-timescale', { detail: value })),
      },
      invulnerable: {
        enumerable: true,
        get: () => this.invulnerable,
        set: (value: boolean) => window.dispatchEvent(new CustomEvent('librarian:debug-invulnerable', { detail: value })),
      },
    });
    (window as Window & { librarianDebug?: DebugControls }).librarianDebug = controls;
    window.addEventListener('librarian:debug-timescale', this.debugTimeScaleListener);
    window.addEventListener('librarian:debug-invulnerable', this.debugInvulnerableListener);
  }
}
