import { Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';

import { PASSIVES, TOOLS } from '../../src/v2/data/content';
import { ProgressionSystem } from '../../src/v2/game/ProgressionSystem';
import { ToolSystem } from '../../src/v2/game/ToolSystem';
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

const expectedEffects: Record<ToolId, string> = {
  'shush-wave': 'calm',
  'rolling-cart': 'cart',
  'bookmark-boomerang': 'collect',
  'storytime-aura': 'calm',
  'return-chute': 'collect',
  'dewey-drone': 'collect',
  'stamp-storm': 'mark',
  'dusting-bell': 'reveal-slow',
  'quiet-sign': 'place-zone',
  'reading-lamp': 'place-zone',
};

const maxedTool = (id: ToolId, evolve: boolean): ToolSystem => {
  const progression = new ProgressionSystem(id, [id], new Rng(evolve ? 81 : 80));
  for (let rank = 1; rank < TOOLS[id].maxRank; rank += 1) progression.apply(toolChoice(id, rank));
  const evolution = TOOLS[id].evolution;
  if (evolve && evolution) progression.apply(passiveChoice(evolution.passive, 0));
  return new ToolSystem(id, progression);
};

describe('ToolSystem', () => {
  it.each(Object.entries(expectedEffects) as Array<[ToolId, string]>)('creates the %s effect as %s', (id, expectedType) => {
    const progression = new ProgressionSystem(id, [id], new Rng(1));
    const system = new ToolSystem(id, progression);
    const position = new Vector3(1, 0, 2);
    const facing = new Vector3(0, 0, -1);
    const hotspot = new Vector3(8, 0, 9);
    const effect = system.activateSignature(position, facing, hotspot);

    expect(effect?.type).toBe(expectedType);
    expect(effect?.position).not.toBe(position);
    if (id === 'return-chute' || id === 'dewey-drone' || id === 'quiet-sign') {
      expect(effect?.position.equals(hotspot)).toBe(true);
      expect(effect?.position).not.toBe(hotspot);
    }
  });

  it('blocks a signature during cooldown and re-enables it after enough time', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave'], new Rng(2));
    const system = new ToolSystem('shush-wave', progression);
    const position = Vector3.Zero();
    const facing = new Vector3(0, 0, 1);

    expect(system.activateSignature(position, facing, null)).not.toBeNull();
    expect(system.cooldown('shush-wave')).toBe(system.cooldownMax('shush-wave'));
    expect(system.activateSignature(position, facing, null)).toBeNull();
    system.update(system.cooldownMax('shush-wave') - 0.01, position, facing, null);
    expect(system.activateSignature(position, facing, null)).toBeNull();
    system.update(0.02, position, facing, null);
    expect(system.activateSignature(position, facing, null)).not.toBeNull();
  });

  it('reduces cooldowns with Quick Study', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave'], new Rng(3));
    const baseline = new ToolSystem('shush-wave', progression).cooldownMax('shush-wave');
    progression.apply(passiveChoice('quick-study', 0));
    progression.apply(passiveChoice('quick-study', 1));

    expect(new ToolSystem('shush-wave', progression).cooldownMax('shush-wave')).toBeCloseTo(baseline * 0.86);
  });

  it('automatically fires equipped non-signature tools on their own cooldowns', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave', 'rolling-cart'], new Rng(4));
    progression.apply(toolChoice('rolling-cart', 0));
    const system = new ToolSystem('shush-wave', progression);
    const position = Vector3.Zero();
    const facing = new Vector3(1, 0, 0);

    expect(system.update(0, position, facing, null)).toHaveLength(1);
    expect(system.update(0, position, facing, null)).toEqual([]);
    expect(system.update(system.cooldownMax('rolling-cart'), position, facing, null)).toHaveLength(1);
  });

  it('scales effects by rank and marks completed evolutions', () => {
    const progression = new ProgressionSystem('shush-wave', ['shush-wave'], new Rng(5));
    const baseSystem = new ToolSystem('shush-wave', progression);
    const base = baseSystem.activateSignature(Vector3.Zero(), Vector3.Forward(), null);
    expect(base?.type).toBe('calm');
    const baseRadius = base?.type === 'calm' ? base.radius : 0;

    for (let rank = 1; rank < 4; rank += 1) progression.apply(toolChoice('shush-wave', rank));
    progression.apply(passiveChoice('vocal-training', 0));
    progression.apply(toolChoice('shush-wave', 4));
    const evolved = new ToolSystem('shush-wave', progression).activateSignature(Vector3.Zero(), Vector3.Forward(), null);

    expect(evolved).toMatchObject({ type: 'calm', evolved: true });
    if (evolved?.type === 'calm') {
      expect(evolved.radius).toBeGreaterThan(baseRadius);
      expect(evolved.duration).toBeGreaterThanOrEqual(5);
    }
  });

  it('gives every evolution a mechanically distinct effect', () => {
    const position = Vector3.Zero();
    const facing = Vector3.Forward();
    const hotspot = new Vector3(9, 0, 9);
    const effect = (id: ToolId, evolved: boolean) => maxedTool(id, evolved).activateSignature(position, facing, hotspot);

    expect(effect('shush-wave', false)).toMatchObject({ type: 'calm', duration: 0, evolved: false });
    expect(effect('shush-wave', true)).toMatchObject({ type: 'calm', evolved: true });
    expect(effect('rolling-cart', false)).toMatchObject({ type: 'cart', evolved: false });
    expect(effect('rolling-cart', true)).toMatchObject({ type: 'cart', evolved: true });
    expect(effect('bookmark-boomerang', false)).toMatchObject({ type: 'collect', autoShelve: false });
    expect(effect('bookmark-boomerang', true)).toMatchObject({ type: 'collect', autoShelve: true });
    expect(effect('storytime-aura', false)).toMatchObject({ type: 'calm', reveal: false });
    expect(effect('storytime-aura', true)).toMatchObject({ type: 'calm', reveal: true });
    expect(effect('return-chute', false)).toMatchObject({ type: 'collect', secondaryPosition: undefined });
    expect(effect('return-chute', true)).toMatchObject({ type: 'collect', secondaryPosition: position });

    const baseDrone = effect('dewey-drone', false);
    const evolvedDrone = effect('dewey-drone', true);
    expect(baseDrone?.type === 'collect' && evolvedDrone?.type === 'collect' && evolvedDrone.maxBooks).toBe(
      baseDrone?.type === 'collect' ? baseDrone.maxBooks * 2 : 0,
    );
    expect(effect('stamp-storm', true)).toMatchObject({ type: 'mark', evolved: true });
    expect(effect('dusting-bell', true)).toMatchObject({ type: 'reveal-slow', evolved: true });
  });
});
