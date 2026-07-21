import { EVENTS, FINALES, MODE_DURATION, RUN_SCHEDULES, phaseFor, type EventDefinition, type ScheduleBeat } from '../data/runContent';
import type { Difficulty, KidArchetype, MapId, RunMode, RunPhase } from '../types';
import type { Rng } from '../systems/Rng';

export interface DirectorDirective {
  type: 'spawn' | 'event-start' | 'event-end' | 'objective' | 'announcement' | 'finale-stage' | 'complete';
  count?: number;
  event?: EventDefinition;
  archetype?: KidArchetype;
  label?: string;
  stage?: number;
}

export class RunDirector {
  elapsed = 0;
  readonly duration: number;
  phase: RunPhase = 'opening';
  activeEvent: EventDefinition | null = null;
  eventRemaining = 0;
  finaleStage = 0;
  private beatIndex = 0;
  private spawnTimer = 4;
  private endlessBeat = 120;
  private complete = false;
  private finaleStartRatio: number | null = null;

  constructor(
    readonly mode: RunMode,
    private readonly rng: Rng,
    private readonly mapId: MapId = 'grand-reading-room',
    private readonly difficulty: Difficulty = 'classic',
  ) {
    this.duration = MODE_DURATION[mode];
  }

  update(delta: number): DirectorDirective[] {
    if (this.complete) return [];
    this.elapsed += delta;
    this.phase = phaseFor(this.elapsed, this.duration);
    const directives: DirectorDirective[] = [];

    if (this.activeEvent) {
      this.eventRemaining -= delta;
      if (this.eventRemaining <= 0) {
        directives.push({ type: 'event-end', event: this.activeEvent });
        this.activeEvent = null;
        this.eventRemaining = 0;
      }
    }

    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0 && this.phase !== 'complete') {
      const progress = Number.isFinite(this.duration) ? Math.min(1, this.elapsed / this.duration) : Math.min(1, this.elapsed / 1200);
      const baseCount = this.activeEvent?.effect === 'field-trip' ? this.rng.int(2, 3) : progress > 0.75 ? 2 : 1;
      const count = this.difficulty === 'heated' && progress > 0.45 ? baseCount + 1 : this.difficulty === 'calm' ? 1 : baseCount;
      directives.push({ type: 'spawn', count });
      const interval = Math.max(5.5, 13 - progress * 6.5);
      const difficultyPace = this.difficulty === 'calm' ? 0.82 : this.difficulty === 'heated' ? 1.18 : 1;
      this.spawnTimer = interval / ((this.activeEvent?.spawnMultiplier ?? 1) * difficultyPace);
    }

    if (this.mode === 'endless') {
      if (this.elapsed >= this.endlessBeat) {
        this.endlessBeat += 120;
        directives.push({ type: 'objective' });
        const event = this.rng.pick(EVENTS);
        this.startEvent(event, directives);
      }
      return directives;
    }

    const schedule = RUN_SCHEDULES[this.mode];
    while (this.beatIndex < schedule.length) {
      const beat = schedule[this.beatIndex] as ScheduleBeat;
      if (this.elapsed / this.duration < beat.atRatio) break;
      this.beatIndex += 1;
      this.resolveBeat(beat, directives);
    }

    const progress = this.elapsed / this.duration;
    if (this.finaleStartRatio !== null && progress >= this.finaleStartRatio) {
      const finaleProgress = Math.min(1, (progress - this.finaleStartRatio) / (1 - this.finaleStartRatio));
      const targetStage = finaleProgress >= 0.65 ? 3 : finaleProgress >= 0.35 ? 2 : 1;
      for (let stage = this.finaleStage + 1; stage <= targetStage; stage += 1) {
        this.finaleStage = stage;
        directives.push({ type: 'finale-stage', stage, label: this.finaleLabel(stage) });
      }
    }
    if (this.elapsed >= this.duration) {
      this.complete = true;
      this.phase = 'complete';
      directives.push({ type: 'complete' });
    }
    return directives;
  }

  eventChaosMultiplier(): number {
    return this.activeEvent?.chaosMultiplier ?? 1;
  }

  forceEvent(event: EventDefinition): DirectorDirective[] {
    const directives: DirectorDirective[] = [];
    this.startEvent(event, directives);
    return directives;
  }

  private resolveBeat(beat: ScheduleBeat, directives: DirectorDirective[]): void {
    if (beat.kind === 'objective') {
      directives.push({ type: 'objective' });
    } else if (beat.kind === 'event') {
      const event = EVENTS.find((candidate) => candidate.id === beat.id) ?? this.rng.pick(EVENTS);
      this.startEvent(event, directives);
    } else if (beat.kind === 'archetype') {
      directives.push({ type: 'announcement', label: `New behavior spotted: ${beat.id?.replace('-', ' ')}` });
      directives.push({ type: 'spawn', count: 1, archetype: beat.id as KidArchetype });
    } else if (beat.kind === 'finale') {
      this.finaleStartRatio ??= beat.atRatio;
      const finaleId = this.mapId === 'midnight-archives' ? 'catalog-lockdown' : 'field-trip';
      const finale = FINALES[finaleId];
      directives.push({ type: 'announcement', label: `FINAL CRISIS · ${finale.name.toUpperCase()}` });
      this.startEvent({ ...finale, duration: this.duration * (1 - beat.atRatio) }, directives);
    }
  }

  private startEvent(event: EventDefinition, directives: DirectorDirective[]): void {
    if (this.activeEvent) directives.push({ type: 'event-end', event: this.activeEvent });
    this.activeEvent = event;
    this.eventRemaining = event.duration;
    directives.push({ type: 'event-start', event, label: event.announcement });
  }

  private finaleLabel(stage: number): string {
    if (this.mapId === 'midnight-archives') {
      if (stage === 1) return 'The rolling stacks engage — reach the marked aisles';
      if (stage === 2) return 'The catalog seals — restore the archive routes';
      return 'Return the flagged volumes before the vault closes';
    }
    if (stage === 1) return 'The doors open — contain the arrivals';
    if (stage === 2) return 'The central aisle is blocked — clear a route';
    return 'Return the golden books before the final bell';
  }
}
