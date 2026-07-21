import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { KIDS } from '../data/content';
import type { KidArchetype } from '../types';
import type { Rng } from '../systems/Rng';
import { createHazardPatch, createKidVisual } from './EntityFactory';
import type { BookSystem } from './BookSystem';
import type { HazardActor, KidActor, PlayerRuntime, RuntimeEvent, ShelfRuntime } from './models';
import type { NavigationSystem } from './NavigationSystem';

export interface KidUpdateResult {
  events: RuntimeEvent[];
  labels: string[];
}

export class KidSystem {
  readonly kids: KidActor[] = [];
  readonly hazards: HazardActor[] = [];
  private nextKidId = 1;
  private nextHazardId = 1;

  constructor(
    private readonly scene: Scene,
    private readonly navigation: NavigationSystem,
    private readonly books: BookSystem,
    private readonly shelves: ShelfRuntime[],
    private readonly spawnPoints: Vector3[],
    private readonly rng: Rng,
    private readonly reducedMotion = false,
  ) {}

  spawn(archetype: KidArchetype): KidActor[] {
    const count = archetype === 'twins' ? 2 : 1;
    const spawned: KidActor[] = [];
    for (let index = 0; index < count; index += 1) {
      if (this.kids.length >= 32) break;
      const id = this.nextKidId++;
      const spawn = this.rng.pick(this.spawnPoints).clone();
      spawn.x += index * 0.7;
      const actor: KidActor = {
        id,
        archetype,
        position: spawn,
        velocity: Vector3.Zero(),
        target: this.navigation.randomPoint(),
        behavior: 'entering',
        behaviorTimer: 1.2,
        stealTimer: this.rng.range(1.5, 4),
        specialTimer: this.rng.range(5, 10),
        heldBookId: null,
        calmRemaining: 0,
        slowMultiplier: 1,
        visual: createKidVisual(this.scene, archetype, id, this.reducedMotion),
        partnerId: null,
        tutorialTarget: false,
        tutorialActor: false,
      };
      actor.visual.root.position.copyFrom(spawn);
      this.kids.push(actor);
      spawned.push(actor);
    }
    if (spawned.length === 2) {
      (spawned[0] as KidActor).partnerId = (spawned[1] as KidActor).id;
      (spawned[1] as KidActor).partnerId = (spawned[0] as KidActor).id;
    }
    return spawned;
  }

  stageTutorialTargets(position: Vector3, count = 1): KidActor[] {
    const offsets = [
      new Vector3(0, 0, 0),
      new Vector3(-1.25, 0, 0.65),
      new Vector3(1.25, 0, 0.65),
    ];
    const staged: KidActor[] = [];
    for (let index = 0; index < count; index += 1) {
      const actor = this.spawn('browser')[0];
      if (!actor) break;
      const offset = offsets[index] ?? new Vector3((index - 1) * 1.1, 0, 0.8);
      const target = this.navigation.nearestOpenPoint(position.add(offset), 0.48);
      actor.position.copyFrom(target);
      actor.target.copyFrom(target);
      actor.velocity.setAll(0);
      actor.behavior = 'telegraph';
      actor.behaviorTimer = Number.POSITIVE_INFINITY;
      actor.specialTimer = Number.POSITIVE_INFINITY;
      actor.tutorialTarget = true;
      actor.tutorialActor = true;
      actor.visual.root.position.copyFrom(target);
      actor.visual.react('anticipate');
      staged.push(actor);
    }
    return staged;
  }

  update(delta: number, elapsed: number, player: PlayerRuntime): KidUpdateResult {
    const result: KidUpdateResult = { events: [], labels: [] };
    for (const hazard of [...this.hazards]) {
      hazard.remaining -= delta;
      if (hazard.remaining <= 0) this.removeHazard(hazard);
      else if (hazard.kind === 'calm-zone') this.applyCalm(hazard.position, hazard.radius, 0.4, false);
    }

    for (const kid of this.kids) {
      const previousBehavior = kid.behavior;
      const definition = KIDS[kid.archetype];
      kid.behaviorTimer -= delta;
      kid.stealTimer -= delta;
      kid.specialTimer -= delta;
      kid.calmRemaining = Math.max(0, kid.calmRemaining - delta);
      kid.slowMultiplier += (1 - kid.slowMultiplier) * Math.min(1, delta * 0.75);

      if (kid.tutorialTarget && kid.calmRemaining <= 0) {
        kid.behavior = 'telegraph';
        kid.velocity.setAll(0);
        kid.visual.root.position.copyFrom(kid.position);
        kid.visual.update(elapsed, 0, 'warning', delta);
        continue;
      }

      if (kid.calmRemaining > 0) {
        kid.behavior = 'calmed';
        kid.target = this.closestExit(kid.position);
      } else if (kid.behavior === 'calmed') {
        kid.behavior = 'seeking';
        kid.target = this.navigation.randomPoint();
      }

      const playerDistance = Vector3.Distance(kid.position, player.position);
      if (playerDistance < 2.15 && kid.behavior !== 'calmed') {
        if (kid.behavior !== 'fleeing') kid.behaviorTimer = 1.35;
        kid.behavior = 'fleeing';
        kid.target = kid.position.add(kid.position.subtract(player.position).normalize().scale(7));
      }

      if (kid.behavior === 'entering' && kid.behaviorTimer <= 0) this.seekShelf(kid);
      if (kid.behavior === 'seeking' && Vector3.DistanceSquared(kid.position, kid.target) < 1.1) {
        kid.behavior = 'telegraph';
        kid.behaviorTimer = definition.stealDelay;
      }
      if (kid.behavior === 'telegraph' && kid.behaviorTimer <= 0) this.steal(kid);
      if (kid.behavior === 'carrying' && kid.behaviorTimer <= 0) {
        this.books.dropFromKid(kid.id);
        kid.heldBookId = null;
        this.seekShelf(kid);
      }
      if (kid.behavior === 'fleeing' && kid.behaviorTimer <= 0) this.seekShelf(kid);

      const anticipatingSpecial = kid.specialTimer > 0 && kid.specialTimer <= 0.9 && kid.calmRemaining <= 0;
      if (kid.specialTimer <= 0 && kid.calmRemaining <= 0) this.special(kid, result);

      const speedBoost = kid.behavior === 'fleeing' || (kid.archetype === 'sprinter' && kid.behavior === 'carrying') ? 1.55 : 1;
      const speed = definition.speed * speedBoost * kid.slowMultiplier;
      const before = kid.position.clone();
      kid.position = this.navigation.steer(kid.position, kid.target, speed, delta, 0.47);
      kid.velocity = kid.position.subtract(before).scale(1 / Math.max(delta, 0.001));
      if (kid.velocity.lengthSquared() > 0.02) kid.visual.root.rotation.y = Math.atan2(kid.velocity.x, kid.velocity.z);
      kid.visual.root.position.x = kid.position.x;
      kid.visual.root.position.z = kid.position.z;
      if (kid.behavior !== previousBehavior) {
        if (kid.behavior === 'telegraph') kid.visual.react('anticipate');
        else if (kid.behavior === 'carrying') kid.visual.react('steal');
        else if (kid.behavior === 'fleeing') kid.visual.react('startle');
        else if (kid.behavior === 'calmed') kid.visual.react('calm');
      }
      kid.visual.update(
        elapsed,
        kid.velocity.length(),
        kid.behavior === 'telegraph' || anticipatingSpecial
          ? 'warning'
          : kid.behavior === 'calmed'
            ? 'calm'
            : kid.behavior === 'fleeing'
              ? 'flee'
              : 'normal',
        delta,
      );
      if (kid.archetype === 'hider') {
        const visibility = kid.behavior === 'carrying' && playerDistance > 5 ? 0.28 : 1;
        kid.visual.root.getChildMeshes().forEach((mesh) => (mesh.visibility = mesh === kid.visual.ring ? Math.max(0.52, visibility) : visibility));
      }
      if (kid.heldBookId !== null) this.books.syncKidBook(kid.id, kid.position);
    }
    return result;
  }

  intervene(position: Vector3, radius: number, calmDuration = 2.5): RuntimeEvent[] {
    const events: RuntimeEvent[] = [];
    let successful = false;
    for (const kid of this.kids) {
      if (Vector3.DistanceSquared(kid.position, position) > radius ** 2) continue;
      if (kid.heldBookId !== null) {
        this.books.dropFromKid(kid.id, false);
        kid.heldBookId = null;
        successful = true;
      }
      const newlyCalmed = kid.calmRemaining <= 0;
      kid.tutorialTarget = false;
      kid.calmRemaining = Math.max(kid.calmRemaining, calmDuration);
      kid.behavior = 'calmed';
      kid.target = this.closestExit(kid.position);
      if (newlyCalmed) kid.visual.react('calm');
      if (newlyCalmed) {
        successful = true;
        events.push({ type: 'kid-calmed', amount: 1 });
      }
    }
    for (const hazard of [...this.hazards]) {
      if (Vector3.DistanceSquared(hazard.position, position) <= radius ** 2 && hazard.kind !== 'calm-zone' && hazard.kind !== 'lamp') {
        this.removeHazard(hazard);
        successful = true;
      }
    }
    if (successful) events.unshift({ type: 'intervene', amount: 1 });
    return events;
  }

  applyCalm(position: Vector3, radius: number, duration: number, dropBooks = true): number {
    let count = 0;
    for (const kid of this.kids) {
      if (Vector3.DistanceSquared(kid.position, position) > radius ** 2) continue;
      const newlyCalmed = kid.calmRemaining <= 0;
      kid.tutorialTarget = false;
      kid.calmRemaining = Math.max(kid.calmRemaining, duration);
      kid.behavior = 'calmed';
      kid.target = this.closestExit(kid.position);
      if (newlyCalmed) kid.visual.react('calm');
      if (dropBooks && kid.heldBookId !== null) {
        this.books.dropFromKid(kid.id);
        kid.heldBookId = null;
      }
      if (newlyCalmed) count += 1;
    }
    return count;
  }

  slowReveal(position: Vector3, radius: number, duration: number): number {
    let count = 0;
    for (const kid of this.kids) {
      if (Vector3.DistanceSquared(kid.position, position) <= radius ** 2) {
        kid.slowMultiplier = Math.min(kid.slowMultiplier, Math.max(0.36, 0.7 - duration * 0.025));
        kid.visual.root.getChildMeshes().forEach((mesh) => (mesh.visibility = 1));
        count += 1;
      }
    }
    return count;
  }

  addZone(kind: 'calm-zone' | 'lamp', position: Vector3, radius: number, duration: number): void {
    const mesh = createHazardPatch(this.scene, position, kind === 'lamp' ? '#d5ae55' : '#5d8f7d', kind);
    mesh.scaling.setAll(radius / 1.05);
    this.hazards.push({ id: this.nextHazardId++, kind, position: position.clone(), radius, remaining: duration, noise: 0, disorder: 0, mesh });
  }

  addDisruption(kind: 'sticky' | 'noise' | 'fort', position: Vector3, duration: number, radius?: number): void {
    const defaults = {
      sticky: { radius: 1.35, noise: 0.15, disorder: 0.5 },
      noise: { radius: 2.1, noise: 2.2, disorder: 0 },
      fort: { radius: 1.55, noise: 0.2, disorder: 1.6 },
    } as const;
    const definition = defaults[kind];
    this.addHazard(kind, position, radius ?? definition.radius, duration, definition.noise, definition.disorder);
  }

  activeNoise(): number {
    return this.kids.reduce((sum, kid) => sum + (kid.calmRemaining > 0 ? 0.08 : KIDS[kid.archetype].noise), 0) + this.hazards.reduce((sum, hazard) => sum + hazard.noise, 0);
  }

  disorderSources(): number {
    const lamps = this.hazards.filter((hazard) => hazard.kind === 'lamp');
    return this.hazards.reduce((sum, hazard) => {
      if (hazard.disorder <= 0) return sum;
      const lit = lamps.some((lamp) => Vector3.DistanceSquared(lamp.position, hazard.position) <= (lamp.radius + hazard.radius) ** 2);
      return sum + hazard.disorder * (lit ? 0.35 : 1);
    }, 0);
  }

  lampBonusAt(position: Vector3): number {
    return this.hazards.some(
      (hazard) => hazard.kind === 'lamp' && Vector3.DistanceSquared(hazard.position, position) <= hazard.radius ** 2,
    ) ? 3 : 0;
  }

  attractTo(position: Vector3): number {
    let attracted = 0;
    for (const kid of this.kids) {
      if (kid.calmRemaining > 0) continue;
      kid.target = this.navigation.nearestOpenPoint(
        position.add(new Vector3(this.rng.range(-2, 2), 0, this.rng.range(-2, 2))),
      );
      kid.behavior = 'seeking';
      kid.behaviorTimer = 0;
      attracted += 1;
    }
    return attracted;
  }

  nearestKidPosition(position: Vector3): Vector3 | null {
    return this.kids
      .filter((kid) => kid.calmRemaining <= 0)
      .sort((a, b) => Vector3.DistanceSquared(a.position, position) - Vector3.DistanceSquared(b.position, position))[0]?.position.clone() ?? null;
  }

  clearTutorialActors(): void {
    for (const kid of [...this.kids]) {
      if (!kid.tutorialActor) continue;
      if (kid.heldBookId !== null) this.books.dropFromKid(kid.id, false);
      kid.visual.dispose();
      this.kids.splice(this.kids.indexOf(kid), 1);
    }
  }

  tutorialActorCount(): number {
    return this.kids.filter((kid) => kid.tutorialActor).length;
  }

  destroy(): void {
    for (const kid of this.kids) kid.visual.dispose();
    for (const hazard of this.hazards) hazard.mesh.dispose();
    this.kids.length = 0;
    this.hazards.length = 0;
  }

  private seekShelf(kid: KidActor): void {
    const shelf = this.rng.pick(this.shelves.filter((candidate) => candidate.bookCount > 0).length ? this.shelves.filter((candidate) => candidate.bookCount > 0) : this.shelves);
    kid.target = shelf.position.add(new Vector3(this.rng.range(-shelf.width * 0.25, shelf.width * 0.25), 0, this.rng.pick([-1.35, 1.35])));
    kid.behavior = 'seeking';
    kid.behaviorTimer = 0;
  }

  private steal(kid: KidActor): void {
    const shelf = [...this.shelves].sort((a, b) => Vector3.DistanceSquared(a.position, kid.position) - Vector3.DistanceSquared(b.position, kid.position))[0];
    if (!shelf) return this.seekShelf(kid);
    if (this.rng.next() < 0.38 || kid.archetype === 'tornado') {
      this.books.knockFromShelf(shelf, kid.archetype === 'tornado' ? 2 : 1);
      kid.heldBookId = null;
    } else {
      const book = this.books.takeFromShelf(kid.id, shelf);
      kid.heldBookId = book?.id ?? null;
    }
    kid.behavior = 'carrying';
    kid.behaviorTimer = this.rng.range(4, 7);
    kid.target = this.navigation.randomPoint();
  }

  private special(kid: KidActor, result: KidUpdateResult): void {
    kid.specialTimer = this.rng.range(8, 13);
    kid.visual.react('special');
    if (kid.archetype === 'snacker') {
      this.addHazard('sticky', kid.position, 1.15, 12, 0.15, 0.45);
      result.labels.push('STICKY FLOOR · route slowed');
    } else if (kid.archetype === 'paper-plane') {
      const planeTarget = kid.position.add(kid.target.subtract(kid.position).normalize().scale(6));
      this.addHazard('noise', planeTarget, 2.1, 8, 2.2, 0);
      result.labels.push('PAPER PLANE · noisy landing');
    } else if (kid.archetype === 'fort-builder') {
      this.addHazard('fort', kid.position, 1.45, 18, 0.2, 1.6);
      result.labels.push('BOOK FORT · clear it with Space');
    } else if (kid.archetype === 'tornado') {
      const shelf = [...this.shelves].sort((a, b) => Vector3.DistanceSquared(a.position, kid.position) - Vector3.DistanceSquared(b.position, kid.position))[0];
      if (shelf) this.books.knockFromShelf(shelf, 3);
      result.labels.push('TORNADO TODDLER · scatter burst');
    } else if (kid.archetype === 'twins') {
      const partner = this.kids.find((candidate) => candidate.id === kid.partnerId);
      if (partner) partner.target = this.navigation.randomPoint();
    }
  }

  private addHazard(kind: HazardActor['kind'], position: Vector3, radius: number, duration: number, noise: number, disorder: number): void {
    const mesh = createHazardPatch(
      this.scene,
      position,
      kind === 'noise' ? '#b66b4e' : kind === 'fort' ? '#865b3d' : '#7e8247',
      kind === 'calm-zone' || kind === 'lamp' ? kind : kind === 'noise' || kind === 'fort' ? kind : 'sticky',
    );
    mesh.scaling.setAll(radius / 1.05);
    this.hazards.push({ id: this.nextHazardId++, kind, position: position.clone(), radius, remaining: duration, noise, disorder, mesh });
  }

  private removeHazard(hazard: HazardActor): void {
    const index = this.hazards.indexOf(hazard);
    if (index >= 0) this.hazards.splice(index, 1);
    hazard.mesh.dispose();
  }

  private closestExit(position: Vector3): Vector3 {
    return [...this.spawnPoints].sort((a, b) => Vector3.DistanceSquared(a, position) - Vector3.DistanceSquared(b, position))[0]?.clone() ?? Vector3.Zero();
  }
}
