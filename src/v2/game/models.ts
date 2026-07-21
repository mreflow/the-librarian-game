import type { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { BookVisual, CharacterVisual } from './EntityFactory';
import type { GenreId, KidArchetype, Point2 } from '../types';

export type BookLocation = 'floor' | 'kid' | 'player' | 'shelving' | 'shelf';

export interface BookActor {
  id: number;
  genreId: GenreId;
  location: BookLocation;
  position: Vector3;
  velocity: Vector3;
  visual: BookVisual;
  holderId: number | null;
  marked: boolean;
  age: number;
  target?: Vector3;
}

export type KidBehavior = 'entering' | 'seeking' | 'telegraph' | 'carrying' | 'fleeing' | 'calmed' | 'special';

export interface KidActor {
  id: number;
  archetype: KidArchetype;
  position: Vector3;
  velocity: Vector3;
  target: Vector3;
  behavior: KidBehavior;
  behaviorTimer: number;
  stealTimer: number;
  specialTimer: number;
  heldBookId: number | null;
  calmRemaining: number;
  slowMultiplier: number;
  visual: CharacterVisual;
  partnerId: number | null;
  tutorialTarget: boolean;
  tutorialActor: boolean;
}

export interface HazardActor {
  id: number;
  kind: 'sticky' | 'noise' | 'fort' | 'calm-zone' | 'lamp';
  position: Vector3;
  radius: number;
  remaining: number;
  noise: number;
  disorder: number;
  mesh: Mesh;
}

export interface PlayerRuntime {
  position: Vector3;
  velocity: Vector3;
  facing: Vector3;
  stamina: number;
  maxStamina: number;
  carry: BookActor[];
  visual: CharacterVisual;
  movementSpeed: number;
  pickupRadius: number;
  returnRadius: number;
  carryCapacity: number;
  sprintMultiplier: number;
  secondWindAvailable: boolean;
}

export interface ShelfRuntime {
  id: string;
  genreIndex: number;
  position: Vector3;
  width: number;
  depth: number;
  root: TransformNode;
  glow: Mesh;
  bookCount: number;
  capacity: number;
}

export interface RuntimeEvent {
  type:
    | 'book-collected'
    | 'book-shelved'
    | 'kid-calmed'
    | 'intervene'
    | 'combo'
    | 'zone-visited';
  genreId?: GenreId;
  marked?: boolean;
  amount?: number;
  zoneId?: string;
}

export interface RuntimeSnapshot {
  player: Point2;
  looseBooks: number;
  kidHeldBooks: number;
  activeNoise: number;
  disorderSources: number;
}
