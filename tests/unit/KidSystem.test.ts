import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAPS } from '../../src/v2/data/maps';
import { BookSystem } from '../../src/v2/game/BookSystem';
import { kidFacingRotation, KidSystem } from '../../src/v2/game/KidSystem';
import type { PlayerRuntime, ShelfRuntime } from '../../src/v2/game/models';
import { NavigationSystem } from '../../src/v2/game/NavigationSystem';
import { Rng } from '../../src/v2/systems/Rng';

describe('KidSystem intervention and lamps', () => {
  let engine: NullEngine;
  let scene: Scene;
  let books: BookSystem;
  let kids: KidSystem;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const shelf: ShelfRuntime = {
      id: 'test-shelf',
      genreIndex: 0,
      position: new Vector3(5, 0, 5),
      width: 4,
      depth: 1.5,
      root: new TransformNode('test-shelf', scene),
      glow: MeshBuilder.CreateBox('test-shelf-glow', { size: 0.1 }, scene),
      bookCount: 8,
      capacity: 18,
    };
    const rng = new Rng(456);
    books = new BookSystem(scene, [shelf], rng, true);
    const navigation = new NavigationSystem(MAPS['grand-reading-room'], [], rng);
    kids = new KidSystem(scene, navigation, books, [shelf], [Vector3.Zero()], rng, true);
  });

  afterEach(() => {
    kids.destroy();
    books.destroy();
    scene.dispose();
    engine.dispose();
  });

  it('emits no intervention event when nothing can be affected', () => {
    expect(kids.intervene(Vector3.Zero(), 3)).toEqual([]);
  });

  it('does not award repeated intervention or kid-calmed events for an already-calm kid', () => {
    const [kid] = kids.spawn('browser');

    expect(kids.intervene(Vector3.Zero(), 3, 4)).toEqual([
      { type: 'intervene', amount: 1 },
      { type: 'kid-calmed', amount: 1 },
    ]);
    expect(kid?.calmRemaining).toBe(4);

    expect(kids.intervene(Vector3.Zero(), 3, 4)).toEqual([]);
    expect(kid?.calmRemaining).toBe(4);
  });

  it('reduces overlapping disorder while granting the lamp bonus only inside the light', () => {
    kids.addDisruption('fort', Vector3.Zero(), 10);
    const unlitDisorder = kids.disorderSources();
    expect(unlitDisorder).toBe(1.6);

    kids.addZone('lamp', Vector3.Zero(), 1.5, 10);

    expect(kids.disorderSources()).toBeCloseTo(unlitDisorder * 0.35);
    expect(kids.lampBonusAt(new Vector3(1.49, 0, 0))).toBe(3);
    expect(kids.lampBonusAt(new Vector3(1.51, 0, 0))).toBe(0);
  });

  it('rotates the visible front of a kid toward its movement direction', () => {
    expect(Math.cos(kidFacingRotation(new Vector3(0, 0, 1)))).toBeCloseTo(-1);
    expect(Math.sin(kidFacingRotation(new Vector3(0, 0, 1)))).toBeCloseTo(0);
    expect(Math.cos(kidFacingRotation(new Vector3(0, 0, -1)))).toBeCloseTo(1);
    expect(Math.sin(kidFacingRotation(new Vector3(0, 0, -1)))).toBeCloseTo(0);
  });

  it('separates overlapping visitors while they continue toward a shared destination', () => {
    const first = kids.spawn('browser')[0];
    const second = kids.spawn('browser')[0];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    for (const kid of [first, second]) {
      kid.position.copyFromFloats(0, 0, 0);
      kid.visual.root.position.copyFrom(kid.position);
      kid.target.copyFromFloats(10, 0, 0);
      kid.behavior = 'carrying';
      kid.behaviorTimer = 100;
      kid.specialTimer = Number.POSITIVE_INFINITY;
    }
    const player = { position: new Vector3(-20, 0, -15) } as PlayerRuntime;

    for (let frame = 0; frame < 60; frame += 1) kids.update(0.05, frame * 0.05, player);

    expect(first.position.x).toBeGreaterThan(3);
    expect(second.position.x).toBeGreaterThan(3);
    expect(Vector3.Distance(first.position, second.position)).toBeGreaterThan(0.45);
  });

  it('approaches a vertical shelf from its open side instead of targeting inside it', () => {
    const verticalShelf: ShelfRuntime = {
      id: 'vertical-shelf',
      genreIndex: 1,
      position: Vector3.Zero(),
      width: 1.8,
      depth: 8,
      root: new TransformNode('vertical-shelf', scene),
      glow: MeshBuilder.CreateBox('vertical-shelf-glow', { size: 0.1 }, scene),
      bookCount: 8,
      capacity: 18,
    };
    const rng = new Rng(89);
    const localBooks = new BookSystem(scene, [verticalShelf], rng, true);
    const navigation = new NavigationSystem(
      MAPS['grand-reading-room'],
      [{ x: 0, z: 0, width: 1.8, depth: 8 }],
      rng,
    );
    const localKids = new KidSystem(
      scene,
      navigation,
      localBooks,
      [verticalShelf],
      [new Vector3(0, 0, -6)],
      rng,
      true,
    );

    try {
      const actor = localKids.spawn('browser')[0];
      expect(actor).toBeDefined();
      if (!actor) return;
      localKids.update(1.3, 1.3, { position: new Vector3(-20, 0, -15) } as PlayerRuntime);

      expect(navigation.collides(actor.target.x, actor.target.z, 0.47)).toBe(false);
      expect(Math.abs(actor.target.x)).toBeGreaterThan(verticalShelf.width / 2);
      expect(Math.abs(actor.target.z)).toBeLessThan(verticalShelf.depth / 2);
    } finally {
      localKids.destroy();
      localBooks.destroy();
    }
  });
});
