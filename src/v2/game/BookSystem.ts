import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { GENRES } from '../data/content';
import type { GenreId } from '../types';
import type { Rng } from '../systems/Rng';
import { createBookVisual } from './EntityFactory';
import type { BookActor, PlayerRuntime, RuntimeEvent, ShelfRuntime } from './models';

export interface BookUpdateResult {
  events: RuntimeEvent[];
  xp: number;
  chaosRelief: number;
  labels: string[];
}

export interface BookTransferResult {
  count: number;
  events: RuntimeEvent[];
}

export class BookSystem {
  readonly books: BookActor[] = [];
  private nextId = 1;
  private combo = 0;
  private comboRemaining = 0;
  private bestCombo = 0;
  private lastShelfGenre: GenreId | null = null;
  private carriedSinceEmpty = 0;
  private aisleClearAwarded = false;

  constructor(
    private readonly scene: Scene,
    private readonly shelves: ShelfRuntime[],
    private readonly rng: Rng,
    private readonly reducedMotion = false,
  ) {}

  seedLooseBooks(count: number): void {
    const shelves = this.rng.shuffle(this.shelves).slice(0, count);
    for (const shelf of shelves) this.knockFromShelf(shelf, 1);
  }

  knockFromShelf(shelf: ShelfRuntime, count = 1): BookActor[] {
    const output: BookActor[] = [];
    for (let index = 0; index < count; index += 1) {
      if (shelf.bookCount <= 0 || this.books.length >= 90) break;
      shelf.bookCount -= 1;
      const genre = GENRES[shelf.genreIndex % GENRES.length]?.id ?? 'adventure';
      const angle = this.rng.range(0, Math.PI * 2);
      const distance = this.rng.range(1.15, 2.2);
      const position = new Vector3(
        shelf.position.x + Math.cos(angle) * distance,
        0,
        shelf.position.z + Math.sin(angle) * distance,
      );
      const book = this.createBook(genre, position);
      book.velocity = new Vector3(Math.cos(angle) * 1.6, 1.8, Math.sin(angle) * 1.6);
      output.push(book);
    }
    this.aisleClearAwarded = false;
    return output;
  }

  takeFromShelf(kidId: number, shelf: ShelfRuntime): BookActor | null {
    if (shelf.bookCount <= 0 || this.books.length >= 90) return null;
    shelf.bookCount -= 1;
    const genre = GENRES[shelf.genreIndex % GENRES.length]?.id ?? 'adventure';
    const book = this.createBook(genre, shelf.position.clone());
    book.location = 'kid';
    book.holderId = kidId;
    return book;
  }

  syncKidBook(kidId: number, position: Vector3): void {
    const book = this.books.find((candidate) => candidate.location === 'kid' && candidate.holderId === kidId);
    if (!book) return;
    book.position.copyFrom(position);
    book.position.y = 1.12;
    book.visual.root.position.copyFrom(book.position);
    book.visual.root.rotation.z = Math.PI / 2;
  }

  dropFromKid(kidId: number, impulse = true): BookActor | null {
    const book = this.books.find((candidate) => candidate.location === 'kid' && candidate.holderId === kidId);
    if (!book) return null;
    book.location = 'floor';
    book.holderId = null;
    book.position.y = 0;
    book.velocity = impulse
      ? new Vector3(this.rng.range(-1.4, 1.4), 1.6, this.rng.range(-1.4, 1.4))
      : Vector3.Zero();
    return book;
  }

  update(delta: number, elapsed: number, player: PlayerRuntime, comboWindowBonus: number, stackBonusRank = 0): BookUpdateResult {
    const result: BookUpdateResult = { events: [], xp: 0, chaosRelief: 0, labels: [] };
    this.comboRemaining = Math.max(0, this.comboRemaining - delta);
    if (this.comboRemaining === 0) {
      this.combo = 0;
      this.lastShelfGenre = null;
    }

    for (const book of [...this.books]) {
      book.age += delta;
      if (book.location === 'floor') {
        book.velocity.y -= 6.5 * delta;
        book.position.addInPlace(book.velocity.scale(delta));
        if (book.position.y <= 0) {
          book.position.y = 0;
          book.velocity.y = Math.abs(book.velocity.y) > 0.7 ? Math.abs(book.velocity.y) * 0.28 : 0;
          book.velocity.x *= 0.82;
          book.velocity.z *= 0.82;
        }
        book.visual.root.position.copyFrom(book.position);
        book.visual.update(elapsed, book.velocity.lengthSquared() > 0.04);
        if (Vector3.DistanceSquared(book.position, player.position) <= player.pickupRadius ** 2 && player.carry.length < player.carryCapacity) {
          this.collectForPlayer(book, player);
          result.events.push({ type: 'book-collected', genreId: book.genreId, amount: 1 });
          result.xp += 4;
          result.chaosRelief += 0.24;
        }
      } else if (book.location === 'shelving' && book.target) {
        const progress = Math.min(1, delta * 9);
        book.position = Vector3.Lerp(book.position, book.target, progress);
        book.position.y += Math.sin(Math.min(1, book.age * 3) * Math.PI) * 0.05;
        book.visual.root.position.copyFrom(book.position);
        book.visual.root.rotation.y += delta * 7;
        if (Vector3.DistanceSquared(book.position, book.target) < 0.08) this.finishShelving(book);
      }
    }

    this.arrangeCarry(player, elapsed);
    for (const shelf of this.shelves) {
      const range = player.returnRadius + Math.max(shelf.width, shelf.depth) * 0.56;
      if (Vector3.DistanceSquared(player.position, shelf.position) > range ** 2) continue;
      const shelfGenre = GENRES[shelf.genreIndex % GENRES.length]?.id;
      const matching = player.carry.filter((book) => book.genreId === shelfGenre);
      if (!matching.length) continue;
      for (const book of matching) {
        const carryIndex = player.carry.indexOf(book);
        if (carryIndex >= 0) player.carry.splice(carryIndex, 1);
        book.visual.root.setParent(null);
        book.position.copyFrom(player.position);
        book.location = 'shelving';
        book.target = shelf.position.add(new Vector3(this.rng.range(-shelf.width * 0.35, shelf.width * 0.35), 1.35, 0));
        book.age = 0;
        shelf.bookCount += 1;
        const markedBonus = book.marked ? 6 : 0;
        result.events.push({ type: 'book-shelved', genreId: book.genreId, marked: book.marked, amount: 1 });
        result.xp += 10 + markedBonus;
        result.chaosRelief += 1.2 + (book.marked ? 0.8 : 0);
      }
      if (matching.length >= 3) {
        result.labels.push(`NEAT STACK · ${matching.length} ${GENRES[shelf.genreIndex]?.name ?? ''}`);
        result.xp += matching.length * (4 + stackBonusRank * 2);
        result.chaosRelief += 2 + stackBonusRank * 0.4;
      }
      if (this.lastShelfGenre && this.lastShelfGenre !== shelfGenre && this.comboRemaining > 0) this.combo += 1;
      else this.combo = Math.max(1, this.combo);
      this.lastShelfGenre = shelfGenre ?? null;
      this.comboRemaining = 6 + comboWindowBonus;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      result.events.push({ type: 'combo', amount: this.combo });
      if (this.combo >= 3) result.labels.push(`DEWEY CHAIN ×${this.combo}`);
      if (player.carry.length === 0 && this.carriedSinceEmpty >= 3) {
        result.labels.push('PERFECT SORT');
        result.xp += 12;
        result.chaosRelief += 2.5;
        this.carriedSinceEmpty = 0;
      }
      break;
    }

    if (!this.aisleClearAwarded && this.looseCount() === 0 && this.books.some((book) => book.location !== 'shelf')) {
      this.aisleClearAwarded = true;
      result.labels.push('AISLE CLEAR');
      result.xp += 15;
      result.chaosRelief += 3;
    }
    return result;
  }

  collectInRadius(position: Vector3, radius: number, maxBooks: number, player: PlayerRuntime, autoShelve: boolean): BookTransferResult {
    const candidates = this.books
      .filter((book) => book.location === 'floor')
      .sort((a, b) => Vector3.DistanceSquared(a.position, position) - Vector3.DistanceSquared(b.position, position))
      .filter((book) => Vector3.DistanceSquared(book.position, position) <= radius ** 2)
      .slice(0, maxBooks);
    const result: BookTransferResult = { count: 0, events: [] };
    for (const book of candidates) {
      if (autoShelve) {
        const shelf = this.shelfFor(book.genreId);
        book.location = 'shelving';
        book.target = shelf.position.add(new Vector3(this.rng.range(-shelf.width * 0.3, shelf.width * 0.3), 1.35, 0));
        shelf.bookCount += 1;
        result.count += 1;
        result.events.push({ type: 'book-shelved', genreId: book.genreId, marked: book.marked, amount: 1 });
      } else if (player.carry.length < player.carryCapacity) {
        this.collectForPlayer(book, player);
        result.count += 1;
      }
    }
    return result;
  }

  collectAlongLine(start: Vector3, direction: Vector3, distance: number, width: number, player: PlayerRuntime, autoShelve: boolean): BookTransferResult {
    const normal = direction.clone().normalize();
    const candidates = this.books.filter((book) => {
      if (book.location !== 'floor') return false;
      const relative = book.position.subtract(start);
      const forward = Vector3.Dot(relative, normal);
      const lateral = relative.subtract(normal.scale(forward)).length();
      return forward >= 0 && forward <= distance && lateral <= width;
    });
    const result: BookTransferResult = { count: 0, events: [] };
    for (const book of candidates) {
      if (!autoShelve && player.carry.length >= player.carryCapacity) break;
      if (autoShelve) {
        const shelf = this.shelfFor(book.genreId);
        book.location = 'shelving';
        book.target = shelf.position.add(new Vector3(0, 1.35, 0));
        shelf.bookCount += 1;
        result.events.push({ type: 'book-shelved', genreId: book.genreId, marked: book.marked, amount: 1 });
      } else this.collectForPlayer(book, player);
      result.count += 1;
    }
    return result;
  }

  markInRadius(position: Vector3, radius: number, limit = Number.POSITIVE_INFINITY): number {
    let marked = 0;
    for (const book of this.books) {
      if (marked >= limit) break;
      if (!book.marked && book.location === 'floor' && Vector3.DistanceSquared(book.position, position) <= radius ** 2) {
        book.marked = true;
        book.visual.cover.outlineColor = Color3.FromHexString('#f6cf63');
        book.visual.cover.outlineWidth = 0.08;
        marked += 1;
      }
    }
    return marked;
  }

  looseCount(): number {
    return this.books.filter((book) => book.location === 'floor').length;
  }

  kidHeldCount(): number {
    return this.books.filter((book) => book.location === 'kid').length;
  }

  hotspots(): Vector3[] {
    return this.books.filter((book) => book.location === 'floor' || book.location === 'kid').map((book) => book.position);
  }

  closestHotspot(position: Vector3): Vector3 | null {
    return this.hotspots().sort((a, b) => Vector3.DistanceSquared(a, position) - Vector3.DistanceSquared(b, position))[0]?.clone() ?? null;
  }

  getCombo(): number {
    return this.combo;
  }

  getBestCombo(): number {
    return this.bestCombo;
  }

  destroy(): void {
    for (const book of this.books) book.visual.dispose();
    this.books.length = 0;
  }

  private createBook(genreId: GenreId, position: Vector3): BookActor {
    const actor: BookActor = {
      id: this.nextId,
      genreId,
      location: 'floor',
      position: position.clone(),
      velocity: Vector3.Zero(),
      visual: createBookVisual(this.scene, genreId, this.nextId, this.reducedMotion),
      holderId: null,
      marked: false,
      age: 0,
    };
    this.nextId += 1;
    actor.visual.root.position.copyFrom(position);
    actor.visual.root.rotation.y = this.rng.range(0, Math.PI * 2);
    this.books.push(actor);
    return actor;
  }

  private collectForPlayer(book: BookActor, player: PlayerRuntime): void {
    book.location = 'player';
    book.holderId = null;
    book.visual.root.setParent(player.visual.root);
    player.carry.push(book);
    this.carriedSinceEmpty += 1;
    this.arrangeCarry(player, 0);
  }

  private arrangeCarry(player: PlayerRuntime, elapsed: number): void {
    player.carry.forEach((book, index) => {
      book.visual.root.position = new Vector3(0.6, 0.72 + index * 0.16, 0.05);
      book.visual.root.rotation = new Vector3(0.08, -0.15, Math.PI / 2 + Math.sin(elapsed * 3 + index) * 0.03);
    });
  }

  private finishShelving(book: BookActor): void {
    book.location = 'shelf';
    const index = this.books.indexOf(book);
    if (index >= 0) this.books.splice(index, 1);
    book.visual.dispose();
  }

  private shelfFor(genreId: GenreId): ShelfRuntime {
    const genreIndex = GENRES.findIndex((genre) => genre.id === genreId);
    return this.shelves.find((shelf) => shelf.genreIndex === genreIndex) ?? (this.shelves[0] as ShelfRuntime);
  }
}
