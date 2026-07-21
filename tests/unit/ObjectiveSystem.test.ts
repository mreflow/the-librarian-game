import { describe, expect, it } from 'vitest';

import { OBJECTIVES } from '../../src/v2/data/runContent';
import { ObjectiveSystem } from '../../src/v2/game/ObjectiveSystem';
import { Rng } from '../../src/v2/systems/Rng';

describe('ObjectiveSystem', () => {
  it('starts a forced objective and exposes an isolated HUD snapshot', () => {
    const system = new ObjectiveSystem(new Rng(1));
    const started = system.start('shelving-rush');

    expect(started).toMatchObject({ id: 'shelving-rush', progress: 0, target: 12, remaining: 65 });
    started.progress = 99;
    expect(system.snapshot()?.progress).toBe(0);
  });

  it('completes generic and genre-specific shelving objectives', () => {
    const generic = new ObjectiveSystem(new Rng(2));
    generic.start('shelving-rush');
    expect(generic.record({ type: 'book-shelved', genreId: 'science', amount: 11 })).toBeNull();
    expect(generic.record({ type: 'book-shelved', genreId: 'nature' })).toMatchObject({ completed: true });
    expect(generic.snapshot()).toBeNull();

    const genre = new ObjectiveSystem(new Rng(3));
    genre.start('adventure-quota');
    genre.record({ type: 'book-shelved', genreId: 'science', amount: 20 });
    expect(genre.snapshot()?.progress).toBe(0);
    expect(genre.record({ type: 'book-shelved', genreId: 'adventure', amount: 6 })).toMatchObject({ completed: true });

    const finale = new ObjectiveSystem(new Rng(12));
    finale.start('golden-return');
    finale.record({ type: 'book-shelved', genreId: 'adventure', marked: false, amount: 10 });
    expect(finale.snapshot()?.progress).toBe(0);
    expect(finale.record({ type: 'book-shelved', genreId: 'history', marked: true, amount: 3 })).toMatchObject({ completed: true });
  });

  it('completes calm, intervention, combo, and unique-zone metrics', () => {
    const calm = new ObjectiveSystem(new Rng(4));
    calm.start('calm-the-crowd');
    expect(calm.record({ type: 'kid-calmed', amount: 8 })?.completed).toBe(true);

    const intervene = new ObjectiveSystem(new Rng(5));
    intervene.start('help-desk');
    expect(intervene.record({ type: 'intervene', amount: 6 })?.completed).toBe(true);

    const combo = new ObjectiveSystem(new Rng(6));
    combo.start('dewey-chain');
    combo.record({ type: 'combo', amount: 4 });
    combo.record({ type: 'combo', amount: 2 });
    expect(combo.snapshot()?.progress).toBe(4);
    expect(combo.record({ type: 'combo', amount: 5 })?.completed).toBe(true);

    const zones = new ObjectiveSystem(new Rng(7));
    zones.start('floor-check');
    zones.record({ type: 'zone-visited', zoneId: 'a' });
    zones.record({ type: 'zone-visited', zoneId: 'a' });
    zones.record({ type: 'zone-visited', zoneId: 'b' });
    expect(zones.snapshot()?.progress).toBe(2);
    expect(zones.record({ type: 'zone-visited', zoneId: 'c' })?.completed).toBe(true);
  });

  it('advances sustained-state metrics only while their condition is met', () => {
    const quiet = new ObjectiveSystem(new Rng(8));
    quiet.start('quiet-reading-room');
    quiet.update(10, 55, 0);
    expect(quiet.snapshot()?.progress).toBe(0);
    quiet.update(34, 54.9, 0);
    expect(quiet.update(1, 20, 0)?.completed).toBe(true);

    const clear = new ObjectiveSystem(new Rng(9));
    clear.start('aisle-clear');
    clear.update(10, 0, 5);
    expect(clear.snapshot()?.progress).toBe(0);
    expect(clear.update(20, 0, 4)?.completed).toBe(true);
  });

  it('fails an expired objective, clears explicitly, and ignores events while idle', () => {
    const system = new ObjectiveSystem(new Rng(10));
    system.start('help-desk');
    expect(system.update(76, 0, 0)).toMatchObject({ completed: false });
    expect(system.snapshot()).toBeNull();
    expect(system.record({ type: 'intervene' })).toBeNull();
    expect(system.update(1, 0, 0)).toBeNull();
    system.start('shelving-rush');
    system.clear();
    expect(system.snapshot()).toBeNull();
  });

  it('serves every objective once before recycling the pool', () => {
    const system = new ObjectiveSystem(new Rng(11));
    const ids = new Set<string>();
    for (let index = 0; index < OBJECTIVES.length; index += 1) {
      ids.add(system.start().id);
      system.clear();
    }

    expect(ids.size).toBe(OBJECTIVES.length);
    expect(OBJECTIVES.map(({ id }) => id)).toContain(system.start().id);
  });
});
