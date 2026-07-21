import { Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';

import { MAPS } from '../../src/v2/data/maps';
import { NavigationSystem } from '../../src/v2/game/NavigationSystem';
import { Rng } from '../../src/v2/systems/Rng';

const createNavigation = (seed = 123): NavigationSystem => {
  const map = MAPS['grand-reading-room'];
  return new NavigationSystem(map, map.shelfLayout, new Rng(seed));
};

describe('NavigationSystem', () => {
  it('clamps movement to the playable map bounds', () => {
    const navigation = createNavigation();
    const result = navigation.move(Vector3.Zero(), new Vector3(100, 0, -100), 0.5);

    expect(result.x).toBe(21.5);
    expect(result.z).toBe(-15.5);
  });

  it('blocks an obstructed axis while preserving valid sliding movement', () => {
    const navigation = createNavigation();
    const start = new Vector3(-17, 0, -7);
    const result = navigation.move(start, new Vector3(2, 0, 2), 0.5);

    expect(result.x).toBe(start.x);
    expect(result.z).toBe(-5);
    expect(navigation.collides(result.x, result.z, 0.5)).toBe(false);
  });

  it('detects collision against an obstacle expanded by actor radius', () => {
    const navigation = createNavigation();

    expect(navigation.collides(-12, -7, 0)).toBe(true);
    expect(navigation.collides(-16, -7, 0.5)).toBe(true);
    expect(navigation.collides(-16.01, -7, 0.5)).toBe(false);
  });

  it('steers directly in open space and around a blocked direct route', () => {
    const navigation = createNavigation();
    const direct = navigation.steer(Vector3.Zero(), new Vector3(5, 0, 0), 2, 1, 0.47);
    expect(direct.equalsWithEpsilon(new Vector3(2, 0, 0))).toBe(true);

    const blockedStart = new Vector3(-17, 0, -7);
    const around = navigation.steer(blockedStart, new Vector3(-12, 0, -7), 2, 1, 0.47);
    expect(Vector3.DistanceSquared(around, blockedStart)).toBeGreaterThan(0);
    expect(navigation.collides(around.x, around.z, 0.47)).toBe(false);
  });

  it.each([-1, 1] as const)('commits to a route around a table instead of oscillating in place (side %s)', (side) => {
    const map = MAPS['grand-reading-room'];
    const navigation = new NavigationSystem(
      map,
      [{ x: 0, z: 0, width: 4.25, depth: 3.25 }],
      new Rng(91),
    );
    const target = new Vector3(0, 0, 5);
    let position = new Vector3(0, 0, -5);

    for (let frame = 0; frame < 240; frame += 1) {
      position = navigation.steer(position, target, 2, 0.05, 0.47, side);
    }

    expect(Vector3.Distance(position, target)).toBeLessThan(0.08);
    expect(navigation.collides(position.x, position.z, 0.47)).toBe(false);
  });

  it('returns a clone when already at the target', () => {
    const navigation = createNavigation();
    const start = new Vector3(3, 0, 3);
    const result = navigation.steer(start, start.clone(), 4, 1, 0.5);

    expect(result).not.toBe(start);
    expect(result.equals(start)).toBe(true);
  });

  it('finds deterministic open random points inside the map', () => {
    const first = createNavigation(77);
    const second = createNavigation(77);

    for (let index = 0; index < 30; index += 1) {
      const a = first.randomPoint();
      const b = second.randomPoint();
      expect(a.equals(b)).toBe(true);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(20);
      expect(Math.abs(a.z)).toBeLessThanOrEqual(14);
      expect(first.collides(a.x, a.z, 0.75)).toBe(false);
    }
  });

  it('relocates obstructed points to a nearby open position', () => {
    const navigation = createNavigation();
    const obstructed = new Vector3(-12, 0, -7);
    const result = navigation.nearestOpenPoint(obstructed, 0.7);

    expect(result.equals(obstructed)).toBe(false);
    expect(navigation.collides(result.x, result.z, 0.7)).toBe(false);
  });

  it('clamps requested targets to the playable map before finding an open point', () => {
    const navigation = createNavigation();
    const result = navigation.nearestOpenPoint(new Vector3(100, 0, -100), 0.7);

    expect(result.x).toBeLessThanOrEqual(21.3);
    expect(result.z).toBeGreaterThanOrEqual(-15.3);
  });
});
