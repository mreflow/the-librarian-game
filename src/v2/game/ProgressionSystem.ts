import { PASSIVES, TOOLS } from '../data/content';
import type { PassiveId, ToolId, UpgradeChoice } from '../types';
import type { Rng } from '../systems/Rng';
import { xpForLevel } from './Balance';

export interface ProgressionSnapshot {
  level: number;
  xp: number;
  xpToNext: number;
  tools: Partial<Record<ToolId, number>>;
  passives: Partial<Record<PassiveId, number>>;
  evolutions: string[];
}

export class ProgressionSystem {
  level = 1;
  xp = 0;
  xpToNext = xpForLevel(1);
  readonly tools: Partial<Record<ToolId, number>> = {};
  readonly passives: Partial<Record<PassiveId, number>> = {};
  readonly evolutions = new Set<string>();
  private pendingDrafts = 0;

  constructor(
    startingTool: ToolId,
    private readonly availableTools: ToolId[],
    private readonly rng: Rng,
  ) {
    this.tools[startingTool] = 1;
  }

  award(amount: number): boolean {
    const multiplier = 1 + (this.passives['reading-glasses'] ?? 0) * 0.1;
    this.xp += Math.max(1, Math.floor(amount * multiplier));
    let leveled = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = xpForLevel(this.level);
      this.pendingDrafts += 1;
      leveled = true;
    }
    return leveled;
  }

  hasDraft(): boolean {
    return this.pendingDrafts > 0;
  }

  createChoices(count = 3): UpgradeChoice[] {
    const candidates: UpgradeChoice[] = [];
    for (const id of this.availableTools) {
      const definition = TOOLS[id];
      const currentRank = this.tools[id] ?? 0;
      if (currentRank >= definition.maxRank) continue;
      const evolutionReady = Boolean(
        definition.evolution &&
          currentRank === definition.maxRank - 1 &&
          (this.passives[definition.evolution.passive] ?? 0) > 0,
      );
      candidates.push({
        kind: 'tool',
        id,
        name: evolutionReady ? definition.evolution?.name ?? definition.name : definition.name,
        icon: definition.icon,
        description: evolutionReady ? definition.evolution?.description ?? definition.description : definition.description,
        currentRank,
        maxRank: definition.maxRank,
        evolutionReady,
      });
    }
    for (const definition of Object.values(PASSIVES)) {
      const currentRank = this.passives[definition.id] ?? 0;
      if (currentRank >= definition.maxRank) continue;
      candidates.push({
        kind: 'passive',
        id: definition.id,
        name: definition.name,
        icon: definition.icon,
        description: definition.description,
        currentRank,
        maxRank: definition.maxRank,
      });
    }
    return this.rng.shuffle(candidates).slice(0, count);
  }

  apply(choice: UpgradeChoice): void {
    if (choice.kind === 'tool') {
      const id = choice.id as ToolId;
      this.tools[id] = Math.min(TOOLS[id].maxRank, (this.tools[id] ?? 0) + 1);
      const evolution = TOOLS[id].evolution;
      if (evolution && this.tools[id] === TOOLS[id].maxRank && (this.passives[evolution.passive] ?? 0) > 0) {
        this.evolutions.add(evolution.name);
      }
    } else {
      const id = choice.id as PassiveId;
      this.passives[id] = Math.min(PASSIVES[id].maxRank, (this.passives[id] ?? 0) + 1);
      for (const [toolId, rank] of Object.entries(this.tools) as Array<[ToolId, number]>) {
        const evolution = TOOLS[toolId].evolution;
        if (evolution?.passive === id && rank >= TOOLS[toolId].maxRank) this.evolutions.add(evolution.name);
      }
    }
    this.pendingDrafts = Math.max(0, this.pendingDrafts - 1);
  }

  toolRank(id: ToolId): number {
    return this.tools[id] ?? 0;
  }

  passiveRank(id: PassiveId): number {
    return this.passives[id] ?? 0;
  }

  isEvolved(id: ToolId): boolean {
    const evolution = TOOLS[id].evolution;
    return Boolean(evolution && this.evolutions.has(evolution.name));
  }

  snapshot(): ProgressionSnapshot {
    return {
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      tools: { ...this.tools },
      passives: { ...this.passives },
      evolutions: [...this.evolutions],
    };
  }
}
