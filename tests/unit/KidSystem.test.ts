import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAPS } from '../../src/v2/data/maps';
import { BookSystem } from '../../src/v2/game/BookSystem';
import { KidSystem } from '../../src/v2/game/KidSystem';
import type { ShelfRuntime } from '../../src/v2/game/models';
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
});
