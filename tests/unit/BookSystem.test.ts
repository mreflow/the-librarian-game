import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BookSystem } from '../../src/v2/game/BookSystem';
import type { CharacterVisual } from '../../src/v2/game/EntityFactory';
import type { PlayerRuntime, ShelfRuntime } from '../../src/v2/game/models';
import { Rng } from '../../src/v2/systems/Rng';

const makePlayer = (scene: Scene, carryCapacity: number): PlayerRuntime => {
  const root = new TransformNode('test-player', scene);
  const mesh = MeshBuilder.CreateBox('test-player-mesh', { size: 0.1 }, scene);
  mesh.parent = root;
  const visual: CharacterVisual = {
    root,
    body: mesh,
    head: mesh,
    leftArm: mesh,
    rightArm: mesh,
    leftLeg: mesh,
    rightLeg: mesh,
    ring: mesh,
    update: () => undefined,
    react: () => undefined,
    dispose: () => root.dispose(false),
  };

  return {
    position: Vector3.Zero(),
    velocity: Vector3.Zero(),
    facing: Vector3.Forward(),
    stamina: 100,
    maxStamina: 100,
    carry: [],
    visual,
    movementSpeed: 5,
    pickupRadius: 1,
    returnRadius: 1,
    carryCapacity,
    sprintMultiplier: 1.5,
    secondWindAvailable: true,
  };
};

describe('BookSystem transfers', () => {
  let engine: NullEngine;
  let scene: Scene;
  let shelf: ShelfRuntime;
  let books: BookSystem;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    shelf = {
      id: 'adventure-shelf',
      genreIndex: 0,
      position: Vector3.Zero(),
      width: 4,
      depth: 1.5,
      root: new TransformNode('test-shelf', scene),
      glow: MeshBuilder.CreateBox('test-shelf-glow', { size: 0.1 }, scene),
      bookCount: 8,
      capacity: 18,
    };
    books = new BookSystem(scene, [shelf], new Rng(123), true);
  });

  afterEach(() => {
    books.destroy();
    scene.dispose();
    engine.dispose();
  });

  it('reports zero collected books when the carry rack is already full', () => {
    books.knockFromShelf(shelf, 2);
    const player = makePlayer(scene, 1);

    const firstTransfer = books.collectInRadius(Vector3.Zero(), 50, 1, player, false);
    expect(firstTransfer.count).toBe(1);
    expect(player.carry).toHaveLength(1);
    expect(books.looseCount()).toBe(1);

    const fullCarryTransfer = books.collectInRadius(Vector3.Zero(), 50, 10, player, false);

    expect(fullCarryTransfer).toEqual({ count: 0, events: [] });
    expect(player.carry).toHaveLength(1);
    expect(books.looseCount()).toBe(1);
  });

  it('reports every auto-shelved book and preserves its marked status', () => {
    const originalShelfCount = shelf.bookCount;
    books.knockFromShelf(shelf, 2);
    const player = makePlayer(scene, 1);
    expect(books.markInRadius(Vector3.Zero(), 50)).toBe(2);

    const transfer = books.collectInRadius(Vector3.Zero(), 50, 10, player, true);

    expect(transfer.count).toBe(2);
    expect(transfer.events).toEqual([
      { type: 'book-shelved', genreId: 'adventure', marked: true, amount: 1 },
      { type: 'book-shelved', genreId: 'adventure', marked: true, amount: 1 },
    ]);
    expect(shelf.bookCount).toBe(originalShelfCount);
    expect(player.carry).toHaveLength(0);
    expect(books.looseCount()).toBe(0);
  });
});
