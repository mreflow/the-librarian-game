import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';

import { GENRE_BY_ID, KIDS } from '../data/content';
import type { GenreId, KidArchetype, LibrarianDefinition } from '../types';

export type CharacterMood = 'normal' | 'warning' | 'calm' | 'flee';
export type CharacterReaction = 'anticipate' | 'startle' | 'steal' | 'special' | 'calm';
export type HazardVisualStyle = 'sticky' | 'noise' | 'fort' | 'calm-zone' | 'lamp';

export interface CharacterVisual {
  root: TransformNode;
  body: Mesh;
  head: Mesh;
  leftArm: Mesh;
  rightArm: Mesh;
  leftLeg: Mesh;
  rightLeg: Mesh;
  ring: Mesh;
  update(time: number, speed: number, mood?: CharacterMood, delta?: number): void;
  react(reaction: CharacterReaction): void;
  dispose(): void;
}

export interface BookVisual {
  root: TransformNode;
  cover: Mesh;
  pageBlock: Mesh;
  genreId: GenreId;
  update(time: number, moving: boolean): void;
  dispose(): void;
}

export interface GenreGlyphOptions {
  name?: string;
  parent?: TransformNode;
  position?: Vector3;
  orientation?: 'floor' | 'front';
  size?: number;
  color?: string;
  emissiveStrength?: number;
}

const materialCache = new WeakMap<Scene, Map<string, StandardMaterial>>();

const material = (
  scene: Scene,
  name: string,
  hex: string,
  roughness = 0.88,
  emissiveStrength = 0,
): StandardMaterial => {
  let cache = materialCache.get(scene);
  if (!cache) {
    cache = new Map<string, StandardMaterial>();
    materialCache.set(scene, cache);
  }
  const key = `${hex}:${roughness.toFixed(2)}:${emissiveStrength.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const value = new StandardMaterial(name, scene);
  const color = Color3.FromHexString(hex);
  value.diffuseColor = color;
  value.ambientColor = color.scale(0.26);
  value.specularColor = new Color3(1 - roughness, 1 - roughness, 1 - roughness);
  value.specularPower = 42;
  value.emissiveColor = color.scale(emissiveStrength);
  cache.set(key, value);
  return value;
};

const stylize = (mesh: Mesh, outline = false, outlineWidth = 0.018): Mesh => {
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  if (outline) {
    mesh.renderOutline = true;
    mesh.outlineColor = Color3.FromHexString('#211a18');
    mesh.outlineWidth = outlineWidth;
  }
  return mesh;
};

const attachBox = (
  scene: Scene,
  name: string,
  size: { width: number; height: number; depth: number },
  position: Vector3,
  parent: TransformNode,
  surface: StandardMaterial,
  outline = false,
): Mesh => {
  const mesh = stylize(MeshBuilder.CreateBox(name, size, scene), outline);
  mesh.position.copyFrom(position);
  mesh.parent = parent;
  mesh.material = surface;
  return mesh;
};

const attachSphere = (
  scene: Scene,
  name: string,
  diameter: number,
  position: Vector3,
  parent: TransformNode,
  surface: StandardMaterial,
  segments = 10,
): Mesh => {
  const mesh = stylize(MeshBuilder.CreateSphere(name, { diameter, segments }, scene));
  mesh.position.copyFrom(position);
  mesh.parent = parent;
  mesh.material = surface;
  return mesh;
};

const setLimbPivot = (mesh: Mesh, height: number): void => {
  mesh.setPivotPoint(new Vector3(0, height * 0.42, 0));
};

export const createLibrarianVisual = (
  scene: Scene,
  librarian: LibrarianDefinition,
  reducedMotion = false,
): CharacterVisual => {
  const root = new TransformNode(`librarian-${librarian.id}`, scene);
  const poseRoot = new TransformNode(`librarian-${librarian.id}-pose`, scene);
  poseRoot.parent = root;
  root.metadata = { kind: 'librarian', librarianId: librarian.id };

  const coatMaterial = material(scene, `${librarian.id}-coat`, librarian.color, 0.78);
  const coatShadow = material(scene, `${librarian.id}-coat-shadow`, Color3.FromHexString(librarian.color).scale(0.62).toHexString(), 0.86);
  const cream = material(scene, `${librarian.id}-shirt`, '#eadcbd', 0.92);
  const skin = material(scene, `${librarian.id}-skin`, librarian.id === 'archivist' ? '#9b6048' : librarian.id === 'childrens-librarian' ? '#d39569' : '#b96f4f', 0.9);
  const dark = material(scene, `${librarian.id}-dark`, '#27211f', 0.86);
  const brass = material(scene, `${librarian.id}-brass`, '#c9a25c', 0.52, 0.05);
  const accent = material(
    scene,
    `${librarian.id}-accent`,
    librarian.id === 'archivist' ? '#6ba0aa' : librarian.id === 'childrens-librarian' ? '#e2a94d' : '#9f5960',
    0.75,
  );

  const bodyRadius = librarian.id === 'archivist' ? 0.44 : librarian.id === 'childrens-librarian' ? 0.53 : 0.5;
  const body = stylize(
    MeshBuilder.CreateCapsule('librarian-body', { height: 1.48, radius: bodyRadius, tessellation: 12 }, scene),
    true,
    0.022,
  );
  body.parent = poseRoot;
  body.position.y = 1.2;
  body.scaling.z = 0.72;
  body.material = coatMaterial;

  attachBox(scene, 'librarian-shirt', { width: 0.48, height: 0.64, depth: 0.12 }, new Vector3(0, 1.44, -0.42), poseRoot, cream);
  attachBox(scene, 'librarian-coat-tail-left', { width: 0.38, height: 0.7, depth: 0.28 }, new Vector3(-0.23, 0.78, 0.16), poseRoot, coatShadow);
  attachBox(scene, 'librarian-coat-tail-right', { width: 0.38, height: 0.7, depth: 0.28 }, new Vector3(0.23, 0.78, 0.16), poseRoot, coatShadow);

  const head = stylize(MeshBuilder.CreateSphere('librarian-head', { diameter: 0.8, segments: 12 }, scene), true, 0.016);
  head.parent = poseRoot;
  head.position.y = 2.23;
  head.scaling.z = 0.93;
  head.material = skin;

  const hair = stylize(MeshBuilder.CreateSphere('librarian-hair', { diameter: 0.84, segments: 12, slice: 0.56 }, scene));
  hair.parent = poseRoot;
  hair.position = new Vector3(0, 2.41, 0.045);
  hair.rotation.x = Math.PI;
  hair.material = dark;

  for (const x of [-0.14, 0.14]) {
    const eye = attachSphere(scene, 'librarian-eye', 0.075, new Vector3(x, 2.26, -0.365), poseRoot, dark, 8);
    eye.scaling.y = 0.82;
  }
  attachSphere(scene, 'librarian-nose', 0.085, new Vector3(0, 2.16, -0.41), poseRoot, skin, 8);

  const createLimb = (
    name: string,
    radius: number,
    height: number,
    x: number,
    y: number,
    surface: StandardMaterial,
  ): Mesh => {
    const limb = stylize(MeshBuilder.CreateCapsule(name, { height, radius, tessellation: 8 }, scene));
    limb.parent = poseRoot;
    limb.position = new Vector3(x, y, 0);
    limb.material = surface;
    setLimbPivot(limb, height);
    return limb;
  };

  const leftArm = createLimb('librarian-left-arm', 0.15, 0.94, -0.55, 1.45, coatMaterial);
  const rightArm = createLimb('librarian-right-arm', 0.15, 0.94, 0.55, 1.45, coatMaterial);
  const leftLeg = createLimb('librarian-left-leg', 0.18, 0.96, -0.24, 0.51, dark);
  const rightLeg = createLimb('librarian-right-leg', 0.18, 0.96, 0.24, 0.51, dark);

  if (librarian.id === 'head-librarian') {
    attachSphere(scene, 'librarian-hair-bun', 0.46, new Vector3(0, 2.63, 0.2), poseRoot, dark, 10);
    const glasses = stylize(MeshBuilder.CreateTorus('librarian-glasses', { diameter: 0.28, thickness: 0.035, tessellation: 12 }, scene));
    glasses.parent = poseRoot;
    glasses.position = new Vector3(-0.17, 2.26, -0.38);
    glasses.rotation.x = Math.PI / 2;
    glasses.material = brass;
    const glassesRight = glasses.clone('librarian-glasses-right');
    glassesRight.position.x = 0.17;
    glassesRight.parent = poseRoot;
    attachBox(scene, 'librarian-glasses-bridge', { width: 0.12, height: 0.025, depth: 0.025 }, new Vector3(0, 2.26, -0.4), poseRoot, brass);
    attachBox(scene, 'librarian-lapel-left', { width: 0.2, height: 0.55, depth: 0.06 }, new Vector3(-0.15, 1.55, -0.5), poseRoot, accent).rotation.z = -0.18;
    attachBox(scene, 'librarian-lapel-right', { width: 0.2, height: 0.55, depth: 0.06 }, new Vector3(0.15, 1.55, -0.5), poseRoot, accent).rotation.z = 0.18;
  } else if (librarian.id === 'archivist') {
    const cap = stylize(MeshBuilder.CreateCylinder('librarian-archivist-cap', { diameter: 0.87, height: 0.16, tessellation: 12 }, scene));
    cap.parent = poseRoot;
    cap.position = new Vector3(0, 2.58, 0.02);
    cap.material = accent;
    attachBox(scene, 'librarian-cap-brim', { width: 0.62, height: 0.07, depth: 0.3 }, new Vector3(0, 2.53, -0.32), poseRoot, accent);
    attachBox(scene, 'librarian-satchel', { width: 0.55, height: 0.66, depth: 0.25 }, new Vector3(0.48, 1.05, 0.17), poseRoot, coatShadow, true);
    attachBox(scene, 'librarian-satchel-strap', { width: 0.09, height: 1.42, depth: 0.06 }, new Vector3(0.02, 1.42, -0.46), poseRoot, brass).rotation.z = -0.42;
    const bowLeft = attachBox(scene, 'librarian-bow-left', { width: 0.24, height: 0.16, depth: 0.08 }, new Vector3(-0.11, 1.79, -0.5), poseRoot, accent);
    bowLeft.rotation.z = -0.25;
    const bowRight = attachBox(scene, 'librarian-bow-right', { width: 0.24, height: 0.16, depth: 0.08 }, new Vector3(0.11, 1.79, -0.5), poseRoot, accent);
    bowRight.rotation.z = 0.25;
  } else {
    attachSphere(scene, 'librarian-hair-puff-left', 0.36, new Vector3(-0.36, 2.42, 0.05), poseRoot, dark, 10);
    attachSphere(scene, 'librarian-hair-puff-right', 0.36, new Vector3(0.36, 2.42, 0.05), poseRoot, dark, 10);
    const scarf = stylize(MeshBuilder.CreateTorus('librarian-story-scarf', { diameter: 0.58, thickness: 0.1, tessellation: 16 }, scene));
    scarf.parent = poseRoot;
    scarf.position = new Vector3(0, 1.87, 0);
    scarf.material = accent;
    attachBox(scene, 'librarian-scarf-tail', { width: 0.18, height: 0.65, depth: 0.07 }, new Vector3(0.2, 1.54, -0.43), poseRoot, accent).rotation.z = -0.18;
    const pin = MeshBuilder.CreateCylinder('librarian-story-pin', { diameter: 0.18, height: 0.05, tessellation: 5 }, scene);
    pin.parent = poseRoot;
    pin.position = new Vector3(-0.25, 1.58, -0.52);
    pin.rotation.x = Math.PI / 2;
    pin.material = brass;
    pin.isPickable = false;
  }

  const ring = MeshBuilder.CreateTorus('librarian-ring', { diameter: 1.55, thickness: 0.055, tessellation: 32 }, scene);
  ring.parent = root;
  ring.position.y = 0.045;
  ring.material = brass;
  ring.isPickable = false;

  return characterController(root, poseRoot, body, head, leftArm, rightArm, leftLeg, rightLeg, ring, reducedMotion, 'librarian', 0);
};

export const createKidVisual = (
  scene: Scene,
  archetype: KidArchetype,
  variant: number,
  reducedMotion = false,
): CharacterVisual => {
  const definition = KIDS[archetype];
  const root = new TransformNode(`kid-${archetype}-${variant}`, scene);
  const poseRoot = new TransformNode(`kid-${archetype}-${variant}-pose`, scene);
  poseRoot.parent = root;
  root.metadata = { kind: 'kid', archetype, variant };

  const clothing = material(scene, `kid-${archetype}-shirt`, definition.color, 0.8);
  const clothingDark = material(scene, `kid-${archetype}-shadow`, Color3.FromHexString(definition.color).scale(0.58).toHexString(), 0.88);
  const skinTones = ['#8f563f', '#c8825b', '#e0ad7b', '#754634', '#b87050'];
  const skin = material(scene, `kid-skin-${variant % skinTones.length}`, skinTones[variant % skinTones.length] ?? '#8f563f', 0.9);
  const dark = material(scene, 'kid-hair', '#292523', 0.9);
  const cream = material(scene, 'kid-cream', '#eee0c2', 0.92);
  const accentHex = archetype === 'tornado' ? '#f3c14f' : archetype === 'hider' ? '#aa9acb' : '#f0dcae';
  const accent = material(scene, `kid-${archetype}-accent`, accentHex, 0.72, 0.025);

  const proportions: Record<KidArchetype, { radius: number; height: number; head: number; scaleX: number }> = {
    browser: { radius: 0.39, height: 1.05, head: 0.69, scaleX: 1 },
    sprinter: { radius: 0.32, height: 1.14, head: 0.62, scaleX: 0.9 },
    twins: { radius: 0.35, height: 0.98, head: 0.66, scaleX: 0.94 },
    hider: { radius: 0.43, height: 1.04, head: 0.68, scaleX: 1.08 },
    snacker: { radius: 0.43, height: 1.03, head: 0.68, scaleX: 1.08 },
    'paper-plane': { radius: 0.34, height: 1.09, head: 0.64, scaleX: 0.95 },
    'fort-builder': { radius: 0.42, height: 1.02, head: 0.7, scaleX: 1.06 },
    tornado: { radius: 0.4, height: 1.12, head: 0.72, scaleX: 1.04 },
  };
  const shape = proportions[archetype];

  const body = stylize(
    MeshBuilder.CreateCapsule('kid-body', { height: shape.height, radius: shape.radius, tessellation: 10 }, scene),
    true,
    0.018,
  );
  body.parent = poseRoot;
  body.position.y = 0.91;
  body.scaling = new Vector3(shape.scaleX, 1, 0.78);
  body.material = clothing;

  const lowerBand = attachBox(scene, 'kid-shirt-band', { width: shape.radius * 1.42, height: 0.16, depth: shape.radius * 1.28 }, new Vector3(0, 0.75, -0.12), poseRoot, clothingDark);
  lowerBand.rotation.x = 0.05;

  const head = stylize(MeshBuilder.CreateSphere('kid-head', { diameter: shape.head, segments: 10 }, scene), true, 0.014);
  head.parent = poseRoot;
  head.position.y = 1.68;
  head.material = skin;

  const hair = stylize(MeshBuilder.CreateSphere('kid-hair', { diameter: shape.head + 0.045, segments: 9, slice: 0.53 }, scene));
  hair.parent = poseRoot;
  hair.position = new Vector3(0, 1.83, 0.035);
  hair.rotation.x = Math.PI;
  hair.material = dark;

  for (const x of [-0.12, 0.12]) attachSphere(scene, 'kid-eye', 0.065, new Vector3(x, 1.7, -shape.head * 0.46), poseRoot, dark, 7);

  const limb = (name: string, x: number, y: number, isLeg: boolean): Mesh => {
    const height = isLeg ? (archetype === 'sprinter' ? 0.78 : 0.68) : 0.72;
    const mesh = stylize(MeshBuilder.CreateCapsule(name, { height, radius: isLeg ? 0.125 : 0.12, tessellation: 8 }, scene));
    mesh.parent = poseRoot;
    mesh.position = new Vector3(x, y, 0);
    mesh.material = isLeg ? dark : clothing;
    setLimbPivot(mesh, height);
    return mesh;
  };
  const leftArm = limb('kid-left-arm', -shape.radius - 0.06, 1.03, false);
  const rightArm = limb('kid-right-arm', shape.radius + 0.06, 1.03, false);
  const leftLeg = limb('kid-left-leg', -0.18, archetype === 'sprinter' ? 0.4 : 0.37, true);
  const rightLeg = limb('kid-right-leg', 0.18, archetype === 'sprinter' ? 0.4 : 0.37, true);

  if (archetype === 'browser') {
    const glasses = MeshBuilder.CreateTorus('kid-browser-glasses', { diameter: 0.24, thickness: 0.03, tessellation: 12 }, scene);
    glasses.parent = poseRoot;
    glasses.position = new Vector3(-0.145, 1.7, -0.325);
    glasses.rotation.x = Math.PI / 2;
    glasses.material = accent;
    glasses.isPickable = false;
    const right = glasses.clone('kid-browser-glasses-right');
    right.position.x = 0.145;
    right.parent = poseRoot;
    const bookLeft = attachBox(scene, 'kid-browser-book-left', { width: 0.38, height: 0.06, depth: 0.5 }, new Vector3(-0.2, 1.02, -0.47), poseRoot, cream, true);
    bookLeft.rotation.z = -0.24;
    const bookRight = attachBox(scene, 'kid-browser-book-right', { width: 0.38, height: 0.06, depth: 0.5 }, new Vector3(0.2, 1.02, -0.47), poseRoot, cream, true);
    bookRight.rotation.z = 0.24;
  } else if (archetype === 'sprinter') {
    const cap = stylize(MeshBuilder.CreateCylinder('kid-sprinter-cap', { diameter: 0.7, height: 0.13, tessellation: 10 }, scene));
    cap.parent = poseRoot;
    cap.position = new Vector3(0, 1.99, 0.02);
    cap.material = accent;
    attachBox(scene, 'kid-sprinter-cap-brim', { width: 0.46, height: 0.06, depth: 0.24 }, new Vector3(0, 1.96, 0.29), poseRoot, accent);
    attachBox(scene, 'kid-sprinter-shoe-left', { width: 0.28, height: 0.16, depth: 0.48 }, new Vector3(-0.19, 0.1, -0.09), poseRoot, accent);
    attachBox(scene, 'kid-sprinter-shoe-right', { width: 0.28, height: 0.16, depth: 0.48 }, new Vector3(0.19, 0.1, -0.09), poseRoot, accent);
  } else if (archetype === 'twins') {
    const side = variant % 2 === 0 ? -1 : 1;
    attachSphere(scene, 'kid-twin-side-bun', 0.3, new Vector3(side * 0.34, 1.9, 0.02), poseRoot, dark, 8);
    const bow = attachBox(scene, 'kid-twin-bow', { width: 0.28, height: 0.18, depth: 0.11 }, new Vector3(side * 0.38, 2.03, -0.02), poseRoot, accent);
    bow.rotation.z = side * 0.3;
    attachBox(scene, 'kid-twin-sash', { width: 0.11, height: 0.78, depth: 0.06 }, new Vector3(side * 0.08, 1.05, -0.39), poseRoot, accent).rotation.z = side * 0.28;
  } else if (archetype === 'hider') {
    const hood = MeshBuilder.CreateTorus('kid-hider-hood', { diameter: 0.78, thickness: 0.13, tessellation: 16 }, scene);
    hood.parent = poseRoot;
    hood.position = new Vector3(0, 1.74, 0);
    hood.material = accent;
    hood.isPickable = false;
    const cape = attachBox(scene, 'kid-hider-cape', { width: 0.82, height: 1.0, depth: 0.16 }, new Vector3(0, 1.05, 0.38), poseRoot, clothingDark, true);
    cape.rotation.x = -0.08;
  } else if (archetype === 'snacker') {
    const bag = attachBox(scene, 'kid-snack-bag', { width: 0.4, height: 0.5, depth: 0.16 }, new Vector3(0.46, 0.92, -0.34), poseRoot, accent, true);
    bag.rotation.z = -0.12;
    for (let crumb = 0; crumb < 3; crumb += 1) {
      attachSphere(scene, 'kid-snack-crumb', 0.065, new Vector3(0.34 + crumb * 0.11, 1.22 + (crumb % 2) * 0.08, -0.47), poseRoot, cream, 6);
    }
  } else if (archetype === 'paper-plane') {
    const plane = MeshBuilder.CreateCylinder('kid-paper-plane-prop', { diameterTop: 0, diameterBottom: 0.52, height: 0.08, tessellation: 3 }, scene);
    plane.parent = poseRoot;
    plane.position = new Vector3(0.5, 1.2, -0.36);
    plane.rotation.z = -0.38;
    plane.material = cream;
    plane.isPickable = false;
    attachBox(scene, 'kid-paper-plane-satchel', { width: 0.5, height: 0.55, depth: 0.18 }, new Vector3(-0.38, 0.95, 0.18), poseRoot, clothingDark);
  } else if (archetype === 'fort-builder') {
    const crown = MeshBuilder.CreateCylinder('kid-builder-hat', { diameterTop: 0.38, diameterBottom: 0.66, height: 0.34, tessellation: 6 }, scene);
    crown.parent = poseRoot;
    crown.position.y = 2.05;
    crown.material = accent;
    crown.isPickable = false;
    for (let brick = 0; brick < 3; brick += 1) {
      const book = attachBox(scene, 'kid-builder-book-belt', { width: 0.19, height: 0.34, depth: 0.13 }, new Vector3(-0.23 + brick * 0.23, 0.76, -0.42), poseRoot, brick % 2 === 0 ? accent : cream);
      book.rotation.z = (brick - 1) * 0.07;
    }
  } else if (archetype === 'tornado') {
    for (let spike = 0; spike < 6; spike += 1) {
      const angle = (spike / 6) * Math.PI * 2;
      const cone = MeshBuilder.CreateCylinder('kid-tornado-hair-spike', { diameterTop: 0, diameterBottom: 0.23, height: 0.48, tessellation: 5 }, scene);
      cone.parent = poseRoot;
      cone.position = new Vector3(Math.cos(angle) * 0.28, 2.03 + Math.sin(angle * 2) * 0.06, Math.sin(angle) * 0.22);
      cone.rotation.z = Math.cos(angle) * 0.55;
      cone.rotation.x = Math.sin(angle) * 0.55;
      cone.material = dark;
      cone.isPickable = false;
    }
    const spiral = MeshBuilder.CreateTorus('kid-tornado-spiral', { diameter: 0.92, thickness: 0.045, tessellation: 24 }, scene);
    spiral.parent = poseRoot;
    spiral.position.y = 0.72;
    spiral.material = accent;
    spiral.isPickable = false;
  }

  const ringMaterial = material(scene, `kid-${archetype}-marker`, definition.color, 0.62, 0.16);
  const ring = MeshBuilder.CreateTorus('kid-marker', { diameter: 1.12, thickness: archetype === 'tornado' ? 0.07 : 0.045, tessellation: 24 }, scene);
  ring.parent = root;
  ring.position.y = 0.04;
  ring.material = ringMaterial;
  ring.visibility = archetype === 'tornado' ? 0.72 : 0.52;
  ring.isPickable = false;

  return characterController(root, poseRoot, body, head, leftArm, rightArm, leftLeg, rightLeg, ring, reducedMotion, archetype, variant * 0.73);
};

export const createGenreGlyph = (
  scene: Scene,
  genreId: GenreId,
  options: GenreGlyphOptions = {},
): TransformNode => {
  const {
    name = `genre-glyph-${genreId}`,
    parent,
    position = Vector3.Zero(),
    orientation = 'floor',
    size = 0.2,
    color = '#fff0ce',
    emissiveStrength = 0.12,
  } = options;
  const root = new TransformNode(name, scene);
  root.position.copyFrom(position);
  root.parent = parent ?? null;
  const surface = material(scene, `${name}-material`, color, 0.66, emissiveStrength);

  const placeCylinder = (tessellation: number, diameter = size, thickness = size * 0.14): Mesh => {
    const glyph = MeshBuilder.CreateCylinder(`${name}-shape`, { diameter, height: thickness, tessellation }, scene);
    glyph.parent = root;
    glyph.material = surface;
    glyph.isPickable = false;
    if (orientation === 'front') glyph.rotation.x = Math.PI / 2;
    return glyph;
  };

  const placeBar = (index: number, width: number, thickness: number, angle: number, offsetA = 0, offsetB = 0): Mesh => {
    const glyph = MeshBuilder.CreateBox(
      `${name}-bar-${index}`,
      orientation === 'front'
        ? { width, height: thickness, depth: size * 0.1 }
        : { width, height: size * 0.1, depth: thickness },
      scene,
    );
    glyph.parent = root;
    glyph.material = surface;
    glyph.isPickable = false;
    if (orientation === 'front') {
      glyph.position = new Vector3(offsetA, offsetB, 0);
      glyph.rotation.z = angle;
    } else {
      glyph.position = new Vector3(offsetA, 0, offsetB);
      glyph.rotation.y = angle;
    }
    return glyph;
  };

  if (genreId === 'adventure') {
    const glyph = placeCylinder(3);
    if (orientation === 'front') glyph.rotation.z = Math.PI;
    else glyph.rotation.y = Math.PI;
  } else if (genreId === 'science') {
    for (let index = 0; index < 4; index += 1) placeBar(index, size, size * 0.12, (index * Math.PI) / 4);
  } else if (genreId === 'nature') {
    const glyph = placeCylinder(4, size * 0.88);
    if (orientation === 'front') glyph.rotation.z = Math.PI / 4;
    else glyph.rotation.y = Math.PI / 4;
  } else if (genreId === 'mystery') {
    const glyph = MeshBuilder.CreateTorus(`${name}-ring`, { diameter: size * 0.78, thickness: size * 0.14, tessellation: 18 }, scene);
    glyph.parent = root;
    glyph.material = surface;
    glyph.isPickable = false;
    if (orientation === 'front') glyph.rotation.x = Math.PI / 2;
  } else if (genreId === 'history') {
    placeBar(0, size * 0.78, size * 0.78, 0);
  } else {
    for (let index = 0; index < 5; index += 1) {
      const x = (index - 2) * size * 0.19;
      const y = Math.sin(index * 1.55) * size * 0.14;
      placeBar(index, size * 0.29, size * 0.09, index % 2 === 0 ? 0.34 : -0.34, x, y);
    }
  }

  return root;
};

export const createBookVisual = (
  scene: Scene,
  genreId: GenreId,
  index: number,
  reducedMotion = false,
): BookVisual => {
  const genre = GENRE_BY_ID[genreId];
  const root = new TransformNode(`book-${genreId}-${index}`, scene);
  const coverMaterial = material(scene, `book-cover-${genreId}`, genre.color, 0.68, 0.055);
  const pagesMaterial = material(scene, 'book-pages', '#eadbbb', 0.92);
  const iconMaterial = material(scene, 'book-spine', '#f5e9cd', 0.72, 0.06);

  const cover = stylize(MeshBuilder.CreateBox('book-cover', { width: 0.56, height: 0.16, depth: 0.8 }, scene), true, 0.022);
  cover.parent = root;
  cover.position.y = 0.15;
  cover.material = coverMaterial;

  const pageBlock = stylize(MeshBuilder.CreateBox('book-pages', { width: 0.47, height: 0.13, depth: 0.69 }, scene));
  pageBlock.parent = root;
  pageBlock.position = new Vector3(0.035, 0.15, 0);
  pageBlock.material = pagesMaterial;

  attachBox(scene, 'book-spine-band', { width: 0.065, height: 0.035, depth: 0.72 }, new Vector3(-0.24, 0.245, 0), root, iconMaterial);
  createGenreGlyph(scene, genreId, {
    name: `book-genre-mark-${index}`,
    parent: root,
    position: new Vector3(0.055, 0.247, -0.13),
    orientation: 'floor',
    size: 0.2,
    color: '#fff0ce',
    emissiveStrength: 0.1,
  });

  return {
    root,
    cover,
    pageBlock,
    genreId,
    update(time: number, moving: boolean): void {
      if (moving) {
        root.rotation.y += reducedMotion ? 0.012 : 0.035;
        root.position.y += 0.08 + Math.sin(time * 5 + index) * (reducedMotion ? 0.018 : 0.06);
      }
    },
    dispose(): void {
      root.dispose(false);
    },
  };
};

export const createEffectRing = (scene: Scene, color: string, position: Vector3, diameter: number): Mesh => {
  const surface = material(scene, `effect-${color}`, color, 0.52, 0.58);
  const ring = MeshBuilder.CreateTorus('effect-ring', { diameter, thickness: 0.09, tessellation: 48 }, scene);
  ring.position = position.clone();
  ring.position.y = 0.12;
  ring.material = surface;
  ring.isPickable = false;

  const echo = MeshBuilder.CreateTorus('effect-ring-echo', { diameter: diameter * 0.76, thickness: 0.035, tessellation: 40 }, scene);
  echo.parent = ring;
  echo.position.y = 0.02;
  echo.material = surface;
  echo.visibility = 0.58;
  echo.isPickable = false;
  return ring;
};

export const createHazardPatch = (
  scene: Scene,
  position: Vector3,
  color = '#827742',
  style: HazardVisualStyle = 'sticky',
): Mesh => {
  const surface = material(scene, `hazard-${style}-${color}`, color, 0.82, style === 'lamp' ? 0.18 : 0.055);
  const edge = material(scene, `hazard-${style}-edge`, Color3.FromHexString(color).scale(0.64).toHexString(), 0.7, style === 'noise' ? 0.16 : 0.04);
  const patch = MeshBuilder.CreateCylinder(`hazard-${style}`, { diameter: 2.05, height: 0.035, tessellation: style === 'fort' ? 8 : 28 }, scene);
  patch.position = position.clone();
  patch.position.y = 0.045;
  patch.material = surface;
  patch.isPickable = false;

  const border = MeshBuilder.CreateTorus(`hazard-${style}-border`, { diameter: 1.82, thickness: 0.055, tessellation: 28 }, scene);
  border.parent = patch;
  border.position.y = 0.05;
  border.material = edge;
  border.isPickable = false;

  if (style === 'sticky') {
    for (let index = 0; index < 4; index += 1) {
      const blob = MeshBuilder.CreateCylinder('sticky-blob', { diameter: 0.42 + index * 0.06, height: 0.05, tessellation: 14 }, scene);
      blob.parent = patch;
      blob.position = new Vector3(-0.45 + index * 0.28, 0.055, Math.sin(index * 1.8) * 0.35);
      blob.material = index % 2 === 0 ? surface : edge;
      blob.isPickable = false;
    }
  } else if (style === 'noise' || style === 'calm-zone') {
    for (let index = 0; index < 2; index += 1) {
      const wave = MeshBuilder.CreateTorus(`hazard-${style}-wave`, { diameter: 1.15 - index * 0.38, thickness: 0.045, tessellation: 24 }, scene);
      wave.parent = patch;
      wave.position.y = 0.06;
      wave.material = edge;
      wave.isPickable = false;
    }
  } else if (style === 'fort') {
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2;
      const book = MeshBuilder.CreateBox('fort-book', { width: 0.48, height: 0.26, depth: 0.17 }, scene);
      book.parent = patch;
      book.position = new Vector3(Math.cos(angle) * 0.7, 0.17, Math.sin(angle) * 0.7);
      book.rotation.y = -angle;
      book.material = index % 2 === 0 ? surface : edge;
      book.isPickable = false;
    }
  } else if (style === 'lamp') {
    for (let index = 0; index < 8; index += 1) {
      const ray = MeshBuilder.CreateBox('lamp-zone-ray', { width: 0.55, height: 0.025, depth: 0.07 }, scene);
      ray.parent = patch;
      const angle = (index / 8) * Math.PI * 2;
      ray.position = new Vector3(Math.cos(angle) * 0.55, 0.06, Math.sin(angle) * 0.55);
      ray.rotation.y = -angle;
      ray.material = edge;
      ray.isPickable = false;
    }
  }

  return patch;
};

const characterController = (
  root: TransformNode,
  poseRoot: TransformNode,
  body: Mesh,
  head: Mesh,
  leftArm: Mesh,
  rightArm: Mesh,
  leftLeg: Mesh,
  rightLeg: Mesh,
  ring: Mesh,
  reducedMotion: boolean,
  style: 'librarian' | KidArchetype,
  idlePhase: number,
): CharacterVisual => {
  let reaction: CharacterReaction | null = null;
  let reactionAmount = 0;

  return {
    root,
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    ring,
    update(time: number, speed: number, mood = 'normal', delta = 1 / 60): void {
      reactionAmount = Math.max(0, reactionAmount - delta * (reaction === 'calm' ? 1.35 : 2.6));
      if (reactionAmount === 0) reaction = null;

      const stride = Math.min(1, speed / 3.5);
      const motionScale = reducedMotion ? 0.42 : 1;
      const cadence = 6 + speed * 1.25;
      const swing = Math.sin(time * cadence + idlePhase) * 0.62 * stride * motionScale;
      const warningPulse = (Math.sin(time * 9 + idlePhase) + 1) * 0.5;
      const fleeing = mood === 'flee';
      const warning = mood === 'warning';
      const calm = mood === 'calm';

      leftArm.rotation.x = warning ? -0.95 - warningPulse * 0.22 : calm ? -0.18 : swing;
      rightArm.rotation.x = warning ? -0.95 - warningPulse * 0.22 : calm ? 0.18 : -swing;
      leftArm.rotation.z = fleeing ? -0.42 : calm ? -0.16 : 0;
      rightArm.rotation.z = fleeing ? 0.42 : calm ? 0.16 : 0;
      leftLeg.rotation.x = -swing * 0.72;
      rightLeg.rotation.x = swing * 0.72;

      const baseLean = style === 'sprinter' && stride > 0.2 ? -0.16 : 0;
      body.rotation.x = baseLean + (warning ? -0.2 : fleeing ? 0.12 : 0);
      body.rotation.z = fleeing && !reducedMotion ? Math.sin(time * 13 + idlePhase) * 0.075 : 0;
      head.rotation.x = warning ? 0.16 : calm ? -0.08 : 0;
      head.rotation.z = warning
        ? Math.sin(time * 9 + idlePhase) * 0.1 * motionScale
        : calm
          ? Math.sin(time * 2 + idlePhase) * 0.035 * motionScale
          : 0;

      const bob = reducedMotion ? 0 : Math.abs(Math.sin(time * cadence + idlePhase)) * 0.06 * stride;
      poseRoot.position.y = bob;
      poseRoot.rotation.y = style === 'tornado' && reaction === 'special' && !reducedMotion
        ? (1 - reactionAmount) * Math.PI * 2
        : 0;

      let squashX = 1;
      let squashY = 1;
      if (reaction === 'startle') {
        squashX = 1 - reactionAmount * 0.08;
        squashY = 1 + reactionAmount * 0.16;
      } else if (reaction === 'steal') {
        squashX = 1 + reactionAmount * 0.11;
        squashY = 1 - reactionAmount * 0.08;
      } else if (reaction === 'special') {
        squashX = 1 + reactionAmount * 0.12;
        squashY = 1 + reactionAmount * 0.05;
      } else if (reaction === 'calm') {
        squashX = 1 + reactionAmount * 0.04;
        squashY = 1 - reactionAmount * 0.035;
      }
      if (reducedMotion) {
        squashX = 1 + (squashX - 1) * 0.35;
        squashY = 1 + (squashY - 1) * 0.35;
      }
      poseRoot.scaling = new Vector3(squashX, squashY, squashX);
      ring.scaling.setAll(warning ? 1 + warningPulse * (reducedMotion ? 0.025 : 0.1) : 1);
      ring.visibility = warning ? 0.92 : style === 'tornado' ? 0.72 : style === 'librarian' ? 1 : 0.52;
    },
    react(nextReaction: CharacterReaction): void {
      reaction = nextReaction;
      reactionAmount = 1;
    },
    dispose(): void {
      root.dispose(false);
    },
  };
};
