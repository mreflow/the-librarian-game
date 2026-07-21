import { describe, expect, it } from 'vitest';

import {
  DEFAULT_UNLOCKED_TOOLS,
  GENRES,
  KIDS,
  LIBRARIANS,
  PASSIVES,
  TOOLS,
} from '../../src/v2/data/content';
import { MAPS } from '../../src/v2/data/maps';
import { EVENTS, MODE_DURATION, OBJECTIVES, RUN_SCHEDULES, availableArchetypes, phaseFor } from '../../src/v2/data/runContent';

const COLOR = /^#[0-9a-f]{6}$/i;

describe('v2 content definitions', () => {
  it('keeps record keys and embedded IDs aligned', () => {
    for (const [id, definition] of Object.entries(KIDS)) expect(definition.id).toBe(id);
    for (const [id, definition] of Object.entries(TOOLS)) expect(definition.id).toBe(id);
    for (const [id, definition] of Object.entries(PASSIVES)) expect(definition.id).toBe(id);
    for (const [id, definition] of Object.entries(LIBRARIANS)) expect(definition.id).toBe(id);
    for (const [id, definition] of Object.entries(MAPS)) expect(definition.id).toBe(id);
  });

  it('defines the complete launch content set without duplicate genre identity', () => {
    expect(GENRES).toHaveLength(6);
    expect(Object.keys(KIDS)).toHaveLength(8);
    expect(Object.keys(TOOLS)).toHaveLength(10);
    expect(Object.keys(PASSIVES)).toHaveLength(12);
    expect(Object.keys(LIBRARIANS)).toHaveLength(3);

    expect(new Set(GENRES.map(({ id }) => id)).size).toBe(GENRES.length);
    expect(new Set(GENRES.map(({ name }) => name)).size).toBe(GENRES.length);
    expect(new Set(GENRES.map(({ icon }) => icon)).size).toBe(GENRES.length);
    for (const genre of GENRES) {
      expect(genre.color).toMatch(COLOR);
      expect(genre.emissive).toMatch(COLOR);
    }
  });

  it('keeps every character loadout and tool evolution resolvable', () => {
    for (const librarian of Object.values(LIBRARIANS)) {
      expect(TOOLS[librarian.startingTool]).toBeDefined();
      expect(librarian.color).toMatch(COLOR);
    }

    for (const tool of Object.values(TOOLS)) {
      expect(tool.cooldown).toBeGreaterThan(0);
      expect(tool.maxRank).toBeGreaterThan(0);
      if (tool.evolution) expect(PASSIVES[tool.evolution.passive]).toBeDefined();
    }

    for (const passive of Object.values(PASSIVES)) expect(passive.maxRank).toBeGreaterThan(0);
    for (const kid of Object.values(KIDS)) {
      expect(kid.speed).toBeGreaterThan(0);
      expect(kid.stealDelay).toBeGreaterThan(0);
      expect(kid.noise).toBeGreaterThan(0);
      expect(kid.color).toMatch(COLOR);
    }
  });

  it('only exposes valid, unique tools in the default pool', () => {
    expect(new Set(DEFAULT_UNLOCKED_TOOLS).size).toBe(DEFAULT_UNLOCKED_TOOLS.length);
    for (const tool of DEFAULT_UNLOCKED_TOOLS) expect(TOOLS[tool]).toBeDefined();
    for (const librarian of Object.values(LIBRARIANS).filter(({ unlockedByDefault }) => unlockedByDefault)) {
      expect(DEFAULT_UNLOCKED_TOOLS).toContain(librarian.startingTool);
    }
  });
});

describe('v2 map definitions', () => {
  it('provides a valid default map and meaningful authored layouts', () => {
    expect(Object.values(MAPS).some(({ unlockedByDefault }) => unlockedByDefault)).toBe(true);

    for (const map of Object.values(MAPS)) {
      expect(map.width).toBeGreaterThanOrEqual(20);
      expect(map.depth).toBeGreaterThanOrEqual(20);
      expect(map.shelfLayout.length).toBeGreaterThanOrEqual(6);
      expect(map.spawnPoints.length).toBeGreaterThanOrEqual(4);
      expect(map.eventZones.length).toBeGreaterThanOrEqual(3);
      expect(map.floorColor).toMatch(COLOR);
      expect(map.wallColor).toMatch(COLOR);
      expect(map.accentColor).toMatch(COLOR);
    }
  });

  it('keeps shelves, spawns, and event zones inside their map boundaries', () => {
    for (const map of Object.values(MAPS)) {
      const halfWidth = map.width / 2;
      const halfDepth = map.depth / 2;

      for (const shelf of map.shelfLayout) {
        expect(Math.abs(shelf.x) + shelf.width / 2).toBeLessThanOrEqual(halfWidth);
        expect(Math.abs(shelf.z) + shelf.depth / 2).toBeLessThanOrEqual(halfDepth);
        expect(shelf.width).toBeGreaterThan(0);
        expect(shelf.depth).toBeGreaterThan(0);
      }

      for (const spawn of map.spawnPoints) {
        expect(Math.abs(spawn.x)).toBeLessThanOrEqual(halfWidth);
        expect(Math.abs(spawn.z)).toBeLessThanOrEqual(halfDepth);
      }

      const zoneIds = new Set<string>();
      for (const zone of map.eventZones) {
        expect(zoneIds.has(zone.id)).toBe(false);
        zoneIds.add(zone.id);
        expect(Math.abs(zone.x) + zone.width / 2).toBeLessThanOrEqual(halfWidth);
        expect(Math.abs(zone.z) + zone.depth / 2).toBeLessThanOrEqual(halfDepth);
      }
    }
  });
});

describe('v2 run-content definitions', () => {
  it('keeps objectives and events uniquely addressable with playable values', () => {
    expect(new Set(OBJECTIVES.map(({ id }) => id)).size).toBe(OBJECTIVES.length);
    expect(new Set(EVENTS.map(({ id }) => id)).size).toBe(EVENTS.length);

    for (const objective of OBJECTIVES) {
      expect(objective.target).toBeGreaterThan(0);
      expect(objective.duration).toBeGreaterThan(0);
      expect(objective.rewardXp).toBeGreaterThan(0);
      expect(objective.rewardCalm).toBeGreaterThan(0);
    }
    for (const event of EVENTS) {
      expect(event.duration).toBeGreaterThan(0);
      expect(event.spawnMultiplier).toBeGreaterThan(0);
      expect(event.chaosMultiplier).toBeGreaterThan(0);
    }
  });

  it('keeps every finite schedule ordered, bounded, and fully resolvable', () => {
    const eventIds = new Set(EVENTS.map(({ id }) => id));

    for (const [mode, schedule] of Object.entries(RUN_SCHEDULES)) {
      expect(MODE_DURATION[mode as keyof typeof RUN_SCHEDULES]).toBeGreaterThan(0);
      expect(Number.isFinite(MODE_DURATION[mode as keyof typeof RUN_SCHEDULES])).toBe(true);
      expect(schedule.at(-1)?.kind).toBe('finale');

      let previousRatio = -1;
      for (const beat of schedule) {
        expect(beat.atRatio).toBeGreaterThan(0);
        expect(beat.atRatio).toBeLessThan(1);
        expect(beat.atRatio).toBeGreaterThan(previousRatio);
        previousRatio = beat.atRatio;

        if (beat.kind === 'event') expect(eventIds).toContain(beat.id);
        if (beat.kind === 'archetype') expect(KIDS[beat.id as keyof typeof KIDS]).toBeDefined();
        if (beat.kind === 'finale') expect(beat.id).toBeTruthy();
      }
    }
    expect(MODE_DURATION.endless).toBe(Number.POSITIVE_INFINITY);
  });

  it('progresses through phases and unlocks every kid archetype by the finale', () => {
    expect(phaseFor(0, MODE_DURATION.standard)).toBe('opening');
    expect(phaseFor(MODE_DURATION.standard, MODE_DURATION.standard)).toBe('complete');
    expect(phaseFor(700, Number.POSITIVE_INFINITY)).toBe('mastery');
    expect(availableArchetypes(0)).toEqual(['browser']);
    expect(new Set(availableArchetypes(1))).toEqual(new Set(Object.keys(KIDS)));
  });
});
