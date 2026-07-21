import { describe, expect, it } from 'vitest';

import { PASSIVES, TOOLS } from '../../src/v2/data/content';
import { xpForLevel } from '../../src/v2/game/Balance';
import { ProgressionSystem } from '../../src/v2/game/ProgressionSystem';
import { Rng } from '../../src/v2/systems/Rng';
import type { PassiveId, ToolId, UpgradeChoice } from '../../src/v2/types';

const toolChoice = (id: ToolId, currentRank: number): UpgradeChoice => ({
  kind: 'tool',
  id,
  name: TOOLS[id].name,
  icon: TOOLS[id].icon,
  description: TOOLS[id].description,
  currentRank,
  maxRank: TOOLS[id].maxRank,
});

const passiveChoice = (id: PassiveId, currentRank: number): UpgradeChoice => ({
  kind: 'passive',
  id,
  name: PASSIVES[id].name,
  icon: PASSIVES[id].icon,
  description: PASSIVES[id].description,
  currentRank,
  maxRank: PASSIVES[id].maxRank,
});

describe('ProgressionSystem', () => {
  it('resets training progression to the starting loadout', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave', 'rolling-cart'], new Rng(9));
    progression.award(100);
    const choice = progression.createChoices().find((candidate) => candidate.id === 'rolling-cart');
    if (choice) progression.apply(choice);

    progression.reset();

    expect(progression.snapshot()).toEqual({
      level: 1,
      xp: 0,
      xpToNext: 75,
      tools: { 'shush-wave': 1 },
      passives: {},
      evolutions: [],
    });
    expect(progression.hasDraft()).toBe(false);
  });

  it('starts at level one with the librarian signature equipped', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave'], new Rng(1));

    expect(progression.snapshot()).toMatchObject({
      level: 1,
      xp: 0,
      xpToNext: 75,
      tools: { 'shush-wave': 1 },
      passives: {},
      evolutions: [],
    });
  });

  it('handles multiple level-ups and queues one draft per level', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave'], new Rng(2));

    expect(progression.award(xpForLevel(1) + xpForLevel(2))).toBe(true);
    expect(progression.level).toBe(3);
    expect(progression.xp).toBe(0);
    expect(progression.hasDraft()).toBe(true);

    progression.apply(progression.createChoices(1)[0] as UpgradeChoice);
    expect(progression.hasDraft()).toBe(true);
    progression.apply(progression.createChoices(1)[0] as UpgradeChoice);
    expect(progression.hasDraft()).toBe(false);
  });

  it('applies Reading Glasses XP and always awards at least one point', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave'], new Rng(3));
    progression.apply(passiveChoice('reading-glasses', 0));

    progression.award(10);
    expect(progression.xp).toBe(11);
    progression.award(0);
    expect(progression.xp).toBe(12);
  });

  it('generates deterministic, unique choices from unlocked and unmaxed content', () => {
    const unlocked: ToolId[] = ['shush-wave', 'rolling-cart', 'bookmark-boomerang'];
    const first = new ProgressionSystem('shush-wave', unlocked, new Rng(100));
    const second = new ProgressionSystem('shush-wave', unlocked, new Rng(100));
    const firstChoices = first.createChoices(8);
    const secondChoices = second.createChoices(8);

    expect(firstChoices).toEqual(secondChoices);
    expect(new Set(firstChoices.map(({ kind, id }) => `${kind}:${id}`)).size).toBe(firstChoices.length);
    for (const choice of firstChoices.filter(({ kind }) => kind === 'tool')) {
      expect(unlocked).toContain(choice.id);
    }
  });

  it('caps ranks and evolves a max-rank tool with its paired passive', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave'], new Rng(4));
    for (let rank = 1; rank < 4; rank += 1) progression.apply(toolChoice('shush-wave', rank));
    progression.apply(passiveChoice('vocal-training', 0));

    const evolutionChoice = progression.createChoices(20).find(({ id }) => id === 'shush-wave');
    expect(evolutionChoice).toMatchObject({ evolutionReady: true, name: 'Silent Reading' });
    progression.apply(evolutionChoice as UpgradeChoice);
    progression.apply(toolChoice('shush-wave', 5));

    expect(progression.toolRank('shush-wave')).toBe(TOOLS['shush-wave'].maxRank);
    expect(progression.isEvolved('shush-wave')).toBe(true);
    expect(progression.evolutions).toContain('Silent Reading');
  });

  it('returns snapshots that do not expose mutable rank records', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave'], new Rng(5));
    const snapshot = progression.snapshot();
    snapshot.tools['shush-wave'] = 99;
    snapshot.evolutions.push('Fake evolution');

    expect(progression.toolRank('shush-wave')).toBe(1);
    expect(progression.evolutions).not.toContain('Fake evolution');
  });
});
