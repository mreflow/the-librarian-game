import { FINALE_OBJECTIVE, OBJECTIVES, type ObjectiveDefinition } from '../data/runContent';
import type { ObjectiveState } from '../types';
import type { Rng } from '../systems/Rng';
import type { RuntimeEvent } from './models';

export interface ObjectiveResult {
  completed: boolean;
  definition: ObjectiveDefinition;
}

export class ObjectiveSystem {
  private current: (ObjectiveDefinition & { progress: number; remaining: number; visited: Set<string> }) | null = null;
  private used = new Set<string>();

  constructor(private readonly rng: Rng) {}

  start(forcedId?: string): ObjectiveState {
    const available = OBJECTIVES.filter((objective) => !this.used.has(objective.id));
    const definition = forcedId
      ? [...OBJECTIVES, FINALE_OBJECTIVE].find((objective) => objective.id === forcedId) ?? this.rng.pick(available.length ? available : OBJECTIVES)
      : this.rng.pick(available.length ? available : OBJECTIVES);
    this.used.add(definition.id);
    this.current = { ...definition, progress: 0, remaining: definition.duration, visited: new Set() };
    return this.snapshot() as ObjectiveState;
  }

  update(delta: number, chaos: number, looseBooks: number): ObjectiveResult | null {
    if (!this.current) return null;
    this.current.remaining -= delta;
    if (this.current.metric === 'keep-chaos-low' && chaos < 55) this.current.progress += delta;
    if (this.current.metric === 'clear-clutter' && looseBooks < 5) this.current.progress += delta;
    if (this.current.progress >= this.current.target) return this.finish(true);
    if (this.current.remaining <= 0) return this.finish(false);
    return null;
  }

  record(event: RuntimeEvent, progressMultiplier = 1): ObjectiveResult | null {
    if (!this.current) return null;
    switch (this.current.metric) {
      case 'shelve-any':
        if (event.type === 'book-shelved') this.current.progress += (event.amount ?? 1) * progressMultiplier;
        break;
      case 'shelve-marked':
        if (event.type === 'book-shelved' && event.marked) this.current.progress += (event.amount ?? 1) * progressMultiplier;
        break;
      case 'shelve-genre':
        if (event.type === 'book-shelved' && event.genreId === 'adventure') this.current.progress += (event.amount ?? 1) * progressMultiplier;
        break;
      case 'calm-kids':
        if (event.type === 'kid-calmed') this.current.progress += (event.amount ?? 1) * progressMultiplier;
        break;
      case 'intervene':
        if (event.type === 'intervene') this.current.progress += (event.amount ?? 1) * progressMultiplier;
        break;
      case 'combo':
        if (event.type === 'combo') this.current.progress = Math.max(this.current.progress, (event.amount ?? 0) * progressMultiplier);
        break;
      case 'visit-zones':
        if (event.type === 'zone-visited' && event.zoneId) {
          this.current.visited.add(event.zoneId);
          this.current.progress = this.current.visited.size;
        }
        break;
      default:
        break;
    }
    if (this.current.progress >= this.current.target) return this.finish(true);
    return null;
  }

  snapshot(): ObjectiveState | null {
    if (!this.current) return null;
    return {
      id: this.current.id,
      title: this.current.title,
      description: this.current.description,
      progress: this.current.progress,
      target: this.current.target,
      remaining: this.current.remaining,
    };
  }

  clear(): void {
    this.current = null;
  }

  private finish(completed: boolean): ObjectiveResult {
    const definition = this.current as ObjectiveDefinition & { progress: number; remaining: number; visited: Set<string> };
    this.current = null;
    return { completed, definition };
  }
}
