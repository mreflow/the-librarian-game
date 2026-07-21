import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { LIBRARIANS } from '../data/content';
import { MAPS } from '../data/maps';
import { createBookVisual, createKidVisual, createLibrarianVisual, type BookVisual, type CharacterVisual } from './EntityFactory';
import { WorldBuilder, type BuiltWorld } from './WorldBuilder';

export class TitleDiorama {
  readonly scene: Scene;
  private readonly builder: WorldBuilder;
  private readonly world: BuiltWorld;
  private readonly characters: CharacterVisual[] = [];
  private readonly books: BookVisual[] = [];
  private elapsed = 0;

  constructor(engine: Engine, reducedMotion: boolean) {
    this.scene = new Scene(engine);
    this.scene.clearColor.set(0.035, 0.027, 0.021, 1);
    this.builder = new WorldBuilder(this.scene, MAPS['grand-reading-room'], reducedMotion);
    this.world = this.builder.build();
    this.world.camera.orthoLeft = -20;
    this.world.camera.orthoRight = 20;
    this.world.camera.orthoTop = 12;
    this.world.camera.orthoBottom = -12;
    this.world.camera.position = new Vector3(8, 31, 26);
    this.world.camera.setTarget(new Vector3(3.5, 0, 1));

    const librarian = createLibrarianVisual(this.scene, LIBRARIANS['head-librarian']);
    librarian.root.position = new Vector3(5.5, 0, 3.2);
    librarian.root.rotation.y = -0.55;
    this.characters.push(librarian);
    const browser = createKidVisual(this.scene, 'browser', 201);
    browser.root.position = new Vector3(1.5, 0, -1.5);
    this.characters.push(browser);
    const sprinter = createKidVisual(this.scene, 'sprinter', 202);
    sprinter.root.position = new Vector3(10, 0, -4);
    sprinter.root.rotation.y = 2.1;
    this.characters.push(sprinter);
    const fortBuilder = createKidVisual(this.scene, 'fort-builder', 203);
    fortBuilder.root.position = new Vector3(-4, 0, 4.5);
    this.characters.push(fortBuilder);

    const positions = [
      new Vector3(2.8, 0, 1.1),
      new Vector3(3.6, 0, 0.5),
      new Vector3(4.2, 0, 1.4),
      new Vector3(-2.4, 0, 4.8),
      new Vector3(-3.2, 0, 4.2),
      new Vector3(8.5, 0, -2.8),
    ];
    positions.forEach((position, index) => {
      const genre = (['adventure', 'science', 'nature', 'mystery', 'history', 'poetry'] as const)[index];
      const book = createBookVisual(this.scene, genre ?? 'adventure', 900 + index);
      book.root.position.copyFrom(position);
      book.root.rotation.y = index * 0.72;
      this.books.push(book);
    });
  }

  update(): void {
    const delta = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000);
    this.elapsed += delta;
    this.characters.forEach((character, index) => {
      character.update(this.elapsed + index * 0.6, index === 0 ? 0.45 : 0.18, index === 1 ? 'warning' : 'normal');
    });
    this.books.forEach((book, index) => book.update(this.elapsed + index, index < 3));
    this.scene.render();
  }

  dispose(): void {
    for (const character of this.characters) character.dispose();
    for (const book of this.books) book.dispose();
    this.world.dispose();
    this.scene.dispose();
  }
}
