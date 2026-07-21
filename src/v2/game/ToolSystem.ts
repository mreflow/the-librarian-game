import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { TOOLS } from '../data/content';
import type { ToolId } from '../types';
import type { ProgressionSystem } from './ProgressionSystem';

export type ToolEffect = { source: ToolId } & (
  | { type: 'calm'; position: Vector3; radius: number; amount: number; duration: number; evolved: boolean; reveal: boolean }
  | { type: 'collect'; position: Vector3; secondaryPosition?: Vector3; radius: number; maxBooks: number; autoShelve: boolean }
  | { type: 'cart'; position: Vector3; direction: Vector3; width: number; distance: number; evolved: boolean }
  | { type: 'mark'; position: Vector3; radius: number; duration: number; evolved: boolean }
  | { type: 'reveal-slow'; position: Vector3; radius: number; duration: number; evolved: boolean }
  | { type: 'place-zone'; position: Vector3; radius: number; duration: number; kind: 'calm-zone' | 'lamp' }
);

export class ToolSystem {
  private readonly cooldowns = new Map<ToolId, number>();

  constructor(
    readonly signature: ToolId,
    private readonly progression: ProgressionSystem,
  ) {}

  update(delta: number, playerPosition: Vector3, facing: Vector3, hotspot: Vector3 | null): ToolEffect[] {
    for (const [id, remaining] of this.cooldowns) this.cooldowns.set(id, Math.max(0, remaining - delta));
    const effects: ToolEffect[] = [];
    for (const id of Object.keys(this.progression.tools) as ToolId[]) {
      if (id === this.signature || this.progression.toolRank(id) <= 0 || (this.cooldowns.get(id) ?? 0) > 0) continue;
      const effect = this.activateEffect(id, playerPosition, facing, hotspot);
      if (effect) effects.push(effect);
      this.reset(id);
    }
    return effects;
  }

  activateSignature(position: Vector3, facing: Vector3, hotspot: Vector3 | null): ToolEffect | null {
    if ((this.cooldowns.get(this.signature) ?? 0) > 0) return null;
    const effect = this.activateEffect(this.signature, position, facing, hotspot);
    if (effect) this.reset(this.signature);
    return effect;
  }

  cooldown(id: ToolId): number {
    return this.cooldowns.get(id) ?? 0;
  }

  cooldownMax(id: ToolId): number {
    const quickStudy = this.progression.passiveRank('quick-study');
    return TOOLS[id].cooldown * (1 - quickStudy * 0.07);
  }

  private reset(id: ToolId): void {
    const rank = this.progression.toolRank(id);
    this.cooldowns.set(id, this.cooldownMax(id) * Math.max(0.58, 1 - (rank - 1) * 0.08));
  }

  private activateEffect(id: ToolId, position: Vector3, facing: Vector3, hotspot: Vector3 | null): ToolEffect | null {
    const rank = this.progression.toolRank(id);
    if (rank <= 0) return null;
    const evolved = this.progression.isEvolved(id);
    const vocalMultiplier = 1 + this.progression.passiveRank('vocal-training') * 0.14;
    const reinforcedCartMultiplier = 1 + this.progression.passiveRank('reinforced-cart') * 0.12;
    switch (id) {
      case 'shush-wave':
        return { source: id, type: 'calm', position: position.clone(), radius: (4.2 + rank * 0.72) * vocalMultiplier, amount: 1 + rank * 0.28, duration: evolved ? 5 * vocalMultiplier : 0, evolved, reveal: false };
      case 'rolling-cart':
        return { source: id, type: 'cart', position: position.clone(), direction: facing.clone(), width: (2.2 + rank * 0.3) * reinforcedCartMultiplier, distance: 7 + rank * 1.25, evolved };
      case 'bookmark-boomerang':
        return { source: id, type: 'collect', position: position.clone(), radius: 5 + rank * 1.2, maxBooks: 1 + Math.floor(rank / 2), autoShelve: evolved };
      case 'storytime-aura':
        return { source: id, type: 'calm', position: position.clone(), radius: (3.6 + rank * 0.65) * vocalMultiplier, amount: 0.8 + rank * 0.2, duration: (5 + rank * 1.2) * vocalMultiplier, evolved, reveal: evolved };
      case 'return-chute':
        return {
          source: id,
          type: 'collect',
          position: hotspot?.clone() ?? position.clone(),
          secondaryPosition: evolved ? position.clone() : undefined,
          radius: 4 + rank * 0.9,
          maxBooks: 2 + rank,
          autoShelve: true,
        };
      case 'dewey-drone':
        return {
          type: 'collect',
          source: id,
          position: hotspot?.clone() ?? position.clone(),
          radius: 100,
          maxBooks: Math.ceil(rank / 2) * (evolved ? 2 : 1),
          autoShelve: true,
        };
      case 'stamp-storm':
        return { source: id, type: 'mark', position: position.clone(), radius: 5 + rank, duration: 8 + rank * 2, evolved };
      case 'dusting-bell':
        return { source: id, type: 'reveal-slow', position: position.clone(), radius: 7 + rank, duration: 4 + rank * 0.8, evolved };
      case 'quiet-sign':
        return { source: id, type: 'place-zone', position: hotspot?.clone() ?? position.clone(), radius: (3 + rank * 0.5) * vocalMultiplier, duration: (8 + rank * 2) * vocalMultiplier, kind: 'calm-zone' };
      case 'reading-lamp':
        return { source: id, type: 'place-zone', position: position.clone(), radius: 3.5 + rank * 0.45, duration: 10 + rank * 1.5, kind: 'lamp' };
      default:
        return null;
    }
  }
}
