import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Observer } from '@babylonjs/core/Misc/observable.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { Scene } from '@babylonjs/core/scene.js';

import { GENRES } from '../data/content';
import type { Bounds2, MapDefinition } from '../types';
import { createGenreGlyph } from './EntityFactory';

export interface BuiltShelf {
  id: string;
  genreIndex: number;
  position: Vector3;
  bounds: Bounds2;
  root: TransformNode;
  glow: Mesh;
}

export interface BuiltWorld {
  camera: FreeCamera;
  shelves: BuiltShelf[];
  obstacles: Bounds2[];
  eventZoneCenters: Record<string, Vector3>;
  spawnPoints: Vector3[];
  floor: AbstractMesh;

  /** Additional handles used by the run scene for cleanup and visual effects. */
  root: TransformNode;
  bounds: Bounds2;
  shadowGenerator: ShadowGenerator;
  dispose: () => void;
}

interface MaterialOptions {
  emissive?: Color3;
  alpha?: number;
  unlit?: boolean;
  specular?: Color3;
}

interface Occluder {
  bounds: Bounds2;
  meshes: AbstractMesh[];
  visibility: number;
}

interface PointLightOptions {
  color: Color3;
  intensity: number;
  range: number;
}

interface FinaleMotion {
  node: TransformNode;
  basePosition: Vector3;
  phase: number;
  amplitude: number;
  kind: 'hover' | 'sway' | 'spin' | 'spin-front' | 'pulse' | 'scan';
}

const PALETTE = {
  walnut: Color3.FromHexString('#4c2f24'),
  darkWalnut: Color3.FromHexString('#2d201c'),
  warmWood: Color3.FromHexString('#7b4c32'),
  brass: Color3.FromHexString('#c89b52'),
  parchment: Color3.FromHexString('#f0dfba'),
  ink: Color3.FromHexString('#1e2630'),
  cream: Color3.FromHexString('#fff1d2'),
  burgundy: Color3.FromHexString('#773c43'),
  archiveWood: Color3.FromHexString('#354343'),
  archiveDark: Color3.FromHexString('#1c292d'),
  moonlight: Color3.FromHexString('#8fc4d6'),
  teal: Color3.FromHexString('#50777b'),
};

const attachFinalePaper = (
  scene: Scene,
  parent: TransformNode,
  name: string,
  position: Vector3,
  surface: StandardMaterial,
): TransformNode => {
  const root = new TransformNode(name, scene);
  root.position = position;
  root.parent = parent;
  const sheet = MeshBuilder.CreateBox(`${name}:sheet`, { width: 0.72, height: 0.035, depth: 0.52 }, scene);
  sheet.material = surface;
  sheet.parent = root;
  sheet.receiveShadows = true;
  sheet.isPickable = false;
  const fold = MeshBuilder.CreateBox(`${name}:fold`, { width: 0.18, height: 0.045, depth: 0.16 }, scene);
  fold.position = new Vector3(0.25, 0.025, -0.17);
  fold.rotation.y = 0.38;
  fold.material = surface;
  fold.parent = root;
  fold.isPickable = false;
  return root;
};

/**
 * Builds the complete static library set for a run.
 *
 * The geometry intentionally uses lightweight primitives rather than downloaded
 * models. This keeps the 2.0 branch immediately deployable while establishing
 * the final visual language, collision contract, and asset-replacement seams.
 */
export class WorldBuilder {
  private readonly scene: Scene;
  private readonly map: MapDefinition;
  private readonly reducedMotion: boolean;

  private root: TransformNode | null = null;
  private camera: FreeCamera | null = null;
  private shadowGenerator: ShadowGenerator | null = null;
  private glowLayer: GlowLayer | null = null;
  private dust: ParticleSystem | null = null;
  private beforeRenderObserver: Observer<Scene> | null = null;
  private newMeshObserver: Observer<AbstractMesh> | null = null;
  private builtWorld: BuiltWorld | null = null;

  private readonly materials = new Map<string, StandardMaterial>();
  private readonly ownedLights: Array<HemisphericLight | DirectionalLight | PointLight> = [];
  private readonly occluders: Occluder[] = [];
  private readonly obstacles: Bounds2[] = [];
  private readonly animatedLamps: PointLight[] = [];
  private readonly finaleMotions: FinaleMotion[] = [];
  private elapsed = 0;
  private finaleStage = 0;
  private lastAspect = -1;

  public constructor(scene: Scene, map: MapDefinition, reducedMotion = false) {
    this.scene = scene;
    this.map = map;
    this.reducedMotion = reducedMotion;
  }

  public build(): BuiltWorld {
    if (this.builtWorld) return this.builtWorld;

    this.root = new TransformNode(`world:${this.map.id}`, this.scene);
    this.configureScene();

    const camera = this.createCamera();
    const shadowGenerator = this.createLighting();
    const floor = this.createFloor();
    this.createCutawayArchitecture();
    this.createEventZoneInlays();

    const shelves = this.map.shelfLayout.map((bounds, index) => this.createShelf(bounds, index));

    if (this.map.id === 'midnight-archives') {
      this.createMidnightArchivesSet();
    } else {
      this.createGrandReadingRoomSet();
    }

    this.createAmbientDust();

    const eventZoneCenters: Record<string, Vector3> = {};
    for (const zone of this.map.eventZones) {
      eventZoneCenters[zone.id] = new Vector3(zone.x, 0.12, zone.z);
    }

    const spawnPoints = this.map.spawnPoints.map((point) => new Vector3(point.x, 0.08, point.z));
    const root = this.requireRoot();

    this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.refreshCameraProjection();
      if (!this.reducedMotion) {
        const delta = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
        this.elapsed += delta;
        for (let index = 0; index < this.animatedLamps.length; index += 1) {
          const light = this.animatedLamps[index];
          if (!light) continue;
          light.intensity = 0.92 + Math.sin(this.elapsed * 1.7 + index * 2.13) * 0.025;
        }
        this.updateFinalePresentation(delta);
      }
    });

    this.builtWorld = {
      camera,
      shelves,
      obstacles: this.obstacles.map((bounds) => ({ ...bounds })),
      eventZoneCenters,
      spawnPoints,
      floor,
      root,
      bounds: { x: 0, z: 0, width: this.map.width, depth: this.map.depth },
      shadowGenerator,
      dispose: () => this.dispose(),
    };

    return this.builtWorld;
  }

  /**
   * Fades tall shelf geometry when it lies between the camera and librarian.
   * Call once per simulation frame after updating the player's world position.
   */
  public updateOcclusion(playerPosition: Vector3): void {
    if (!this.camera) return;

    const cameraPoint = { x: this.camera.position.x, z: this.camera.position.z };
    const playerPoint = { x: playerPosition.x, z: playerPosition.z };

    for (const occluder of this.occluders) {
      const obscuresPlayer = this.segmentIntersectsBounds(cameraPoint, playerPoint, occluder.bounds);
      const targetVisibility = obscuresPlayer ? 0.22 : 1;
      const blend = this.reducedMotion ? 1 : 0.18;
      occluder.visibility += (targetVisibility - occluder.visibility) * blend;

      if (Math.abs(occluder.visibility - targetVisibility) < 0.005) {
        occluder.visibility = targetVisibility;
      }

      for (const mesh of occluder.meshes) {
        mesh.visibility = occluder.visibility;
      }
    }
  }

  /**
   * Reveals the room-specific three-act finale set. Calls are monotonic and
   * idempotent so accelerated/debug runs can safely skip directly to stage 3.
   */
  public presentFinale(stage: number): void {
    const targetStage = Math.max(0, Math.min(3, Math.floor(stage)));
    if (!this.root || targetStage <= this.finaleStage) return;

    for (let nextStage = this.finaleStage + 1; nextStage <= targetStage; nextStage += 1) {
      if (this.map.id === 'midnight-archives') this.presentArchiveFinaleStage(nextStage);
      else this.presentGrandFinaleStage(nextStage);
    }
    this.finaleStage = targetStage;

    const key = this.scene.getLightByName('key-light');
    if (key instanceof DirectionalLight) {
      if (this.map.id === 'midnight-archives') {
        key.diffuse = Color3.Lerp(PALETTE.moonlight, Color3.FromHexString('#70d4df'), targetStage / 5);
        key.intensity = 1.28 + targetStage * 0.08;
      } else {
        key.diffuse = Color3.Lerp(Color3.FromHexString('#ffd39d'), Color3.FromHexString('#f3a15f'), targetStage / 5);
        key.intensity = 1.42 + targetStage * 0.06;
      }
    }
  }

  public dispose(): void {
    if (this.beforeRenderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
      this.beforeRenderObserver = null;
    }

    if (this.newMeshObserver) {
      this.scene.onNewMeshAddedObservable.remove(this.newMeshObserver);
      this.newMeshObserver = null;
    }

    this.dust?.dispose(true);
    this.dust = null;
    this.glowLayer?.dispose();
    this.glowLayer = null;
    this.shadowGenerator?.dispose();
    this.shadowGenerator = null;

    for (const light of this.ownedLights) light.dispose();
    this.ownedLights.length = 0;

    this.camera?.dispose();
    this.camera = null;
    this.root?.dispose(false);
    this.root = null;

    for (const material of this.materials.values()) material.dispose(true, true);
    this.materials.clear();
    this.occluders.length = 0;
    this.obstacles.length = 0;
    this.animatedLamps.length = 0;
    this.finaleMotions.length = 0;
    this.finaleStage = 0;
    this.builtWorld = null;
  }

  private configureScene(): void {
    const archive = this.map.id === 'midnight-archives';
    const background = archive ? Color3.FromHexString('#101c23') : Color3.FromHexString('#2a2021');

    this.scene.clearColor = new Color4(background.r, background.g, background.b, 1);
    this.scene.ambientColor = archive ? Color3.FromHexString('#182f36') : Color3.FromHexString('#392a26');
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = archive ? 0.009 : 0.006;
    this.scene.fogColor = background;
    this.scene.shadowsEnabled = true;

    const processing = this.scene.imageProcessingConfiguration;
    processing.toneMappingEnabled = true;
    processing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    processing.exposure = archive ? 1.05 : 1.12;
    processing.contrast = archive ? 1.18 : 1.12;

    this.glowLayer = new GlowLayer('architectural-glow', this.scene, {
      blurKernelSize: this.reducedMotion ? 16 : 28,
      mainTextureSamples: 2,
    });
    this.glowLayer.intensity = archive ? 0.3 : 0.22;
  }

  private createCamera(): FreeCamera {
    const depth = this.map.depth;
    const camera = new FreeCamera(
      'world-camera',
      new Vector3(0, depth * 0.83, -depth * 0.93),
      this.scene,
    );
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    camera.minZ = 0.1;
    camera.maxZ = 180;
    camera.inertia = 0;
    camera.inputs.clear();
    camera.setTarget(new Vector3(0, 0.65, 1.5));
    this.scene.activeCamera = camera;
    this.camera = camera;
    this.refreshCameraProjection(true);
    return camera;
  }

  private refreshCameraProjection(force = false): void {
    if (!this.camera) return;
    const engine = this.scene.getEngine();
    const aspect = Math.max(engine.getRenderWidth(), 1) / Math.max(engine.getRenderHeight(), 1);
    if (!force && Math.abs(aspect - this.lastAspect) < 0.01) return;

    this.lastAspect = aspect;
    const verticalHalf = Math.max(this.map.depth * 0.55, (this.map.width * 0.52) / aspect);
    const horizontalHalf = verticalHalf * aspect;
    this.camera.orthoLeft = -horizontalHalf;
    this.camera.orthoRight = horizontalHalf;
    this.camera.orthoTop = verticalHalf;
    this.camera.orthoBottom = -verticalHalf;
  }

  private createLighting(): ShadowGenerator {
    const archive = this.map.id === 'midnight-archives';

    const ambient = new HemisphericLight('soft-room-fill', new Vector3(-0.2, 1, -0.25), this.scene);
    ambient.intensity = archive ? 0.58 : 0.72;
    ambient.diffuse = archive ? Color3.FromHexString('#b8d7dd') : Color3.FromHexString('#ffe3b8');
    ambient.groundColor = archive ? Color3.FromHexString('#111e24') : Color3.FromHexString('#402a25');
    this.ownedLights.push(ambient);

    const key = new DirectionalLight('key-light', new Vector3(0.28, -1, 0.42), this.scene);
    key.metadata = { role: 'key-light', treatment: archive ? 'moonlight' : 'sunset-window-light' };
    key.position = new Vector3(-this.map.width * 0.3, 22, -this.map.depth * 0.32);
    key.diffuse = archive ? Color3.FromHexString('#9cc8dc') : Color3.FromHexString('#ffd39d');
    key.specular = archive ? Color3.FromHexString('#bce8f2') : Color3.FromHexString('#fff0cc');
    key.intensity = archive ? 1.28 : 1.42;
    this.ownedLights.push(key);

    const shadows = new ShadowGenerator(1024, key);
    shadows.useBlurExponentialShadowMap = true;
    shadows.blurKernel = this.reducedMotion ? 12 : 20;
    shadows.bias = 0.0006;
    shadows.normalBias = 0.018;
    shadows.transparencyShadow = true;
    this.shadowGenerator = shadows;

    // Actors are created after the world. Register their substantial body parts
    // as they arrive so characters feel planted without making every loose book
    // and effect ring an expensive dynamic shadow caster.
    this.newMeshObserver = this.scene.onNewMeshAddedObservable.add((mesh) => {
      const isCharacterPart = mesh.name.startsWith('librarian-') || mesh.name.startsWith('kid-');
      const isMarker = mesh.name.includes('ring') || mesh.name.includes('marker') || mesh.name.includes('glasses');
      if (isCharacterPart && !isMarker) shadows.addShadowCaster(mesh);
    });

    return shadows;
  }

  private createFloor(): AbstractMesh {
    const floorColor = Color3.FromHexString(this.map.floorColor);
    const archive = this.map.id === 'midnight-archives';
    const foundationMaterial = this.getMaterial(
      'diorama-foundation',
      archive ? Color3.FromHexString('#10181a') : PALETTE.darkWalnut,
      { specular: Color3.Black() },
    );
    this.createBox(
      'diorama-plinth',
      this.map.width + 1.4,
      0.72,
      this.map.depth + 1.4,
      new Vector3(0, -0.44, 0),
      foundationMaterial,
      undefined,
      false,
      false,
    );

    const floorMaterial = this.getMaterial('main-floor', floorColor, {
      specular: archive ? Color3.FromHexString('#667577').scale(0.22) : Color3.FromHexString('#bf916c').scale(0.2),
    });
    const floor = this.createBox(
      'library-floor',
      this.map.width,
      0.18,
      this.map.depth,
      new Vector3(0, -0.06, 0),
      floorMaterial,
      undefined,
      false,
      true,
    );

    if (archive) this.createArchiveFloorDetails();
    else this.createWoodFloorDetails();

    return floor;
  }

  private createWoodFloorDetails(): void {
    const line = this.getMaterial('floor-seam', Color3.Lerp(Color3.FromHexString(this.map.floorColor), PALETTE.darkWalnut, 0.42), {
      specular: Color3.Black(),
    });
    const highlight = this.getMaterial('floor-highlight', Color3.Lerp(Color3.FromHexString(this.map.floorColor), PALETTE.parchment, 0.12), {
      specular: Color3.Black(),
    });

    for (let z = -this.map.depth / 2 + 1; z < this.map.depth / 2; z += 1.18) {
      this.createBox('plank-seam', this.map.width - 0.3, 0.012, 0.026, new Vector3(0, 0.04, z), line, undefined, false, false);
    }

    let row = 0;
    for (let z = -this.map.depth / 2 + 0.52; z < this.map.depth / 2; z += 2.36) {
      const offset = row % 2 === 0 ? -3.4 : 2.8;
      for (let x = -this.map.width / 2 + 4 + offset; x < this.map.width / 2; x += 8) {
        this.createBox('plank-joint', 0.026, 0.014, 1.12, new Vector3(x, 0.047, z), line, undefined, false, false);
      }
      row += 1;
    }

    this.createBox('floor-border-north', this.map.width - 0.4, 0.018, 0.12, new Vector3(0, 0.052, this.map.depth / 2 - 0.25), highlight, undefined, false, false);
  }

  private createArchiveFloorDetails(): void {
    const grout = this.getMaterial('archive-grout', Color3.FromHexString('#293235'), { specular: Color3.Black() });
    const brass = this.getMaterial('archive-floor-brass', Color3.FromHexString('#8f7448'), {
      emissive: Color3.FromHexString('#4a3925').scale(0.12),
      specular: PALETTE.brass.scale(0.35),
    });

    for (let x = -this.map.width / 2 + 2; x < this.map.width / 2; x += 2) {
      this.createBox('tile-grout-x', 0.03, 0.014, this.map.depth - 0.2, new Vector3(x, 0.045, 0), grout, undefined, false, false);
    }
    for (let z = -this.map.depth / 2 + 2; z < this.map.depth / 2; z += 2) {
      this.createBox('tile-grout-z', this.map.width - 0.2, 0.014, 0.03, new Vector3(0, 0.046, z), grout, undefined, false, false);
    }

    this.createBox('archive-crossing-x', 0.14, 0.022, this.map.depth - 5, new Vector3(0, 0.058, 0), brass, undefined, false, false);
    this.createBox('archive-crossing-z', this.map.width - 5, 0.022, 0.14, new Vector3(0, 0.059, 0), brass, undefined, false, false);
  }

  private createCutawayArchitecture(): void {
    const archive = this.map.id === 'midnight-archives';
    const wall = this.getMaterial('wall', Color3.FromHexString(this.map.wallColor), {
      specular: Color3.FromHexString('#ffffff').scale(0.08),
    });
    const wallShadow = this.getMaterial(
      'wall-shadow',
      Color3.Lerp(Color3.FromHexString(this.map.wallColor), archive ? PALETTE.archiveDark : PALETTE.darkWalnut, 0.2),
      { specular: Color3.Black() },
    );
    const trim = this.getMaterial('architectural-trim', archive ? PALETTE.archiveWood : PALETTE.walnut, {
      specular: archive ? PALETTE.moonlight.scale(0.08) : PALETTE.brass.scale(0.12),
    });
    const wallHeight = archive ? 6.4 : 5.8;
    const wallThickness = 0.48;
    const farZ = this.map.depth / 2 + wallThickness * 0.35;

    this.createBox('far-wall', this.map.width + wallThickness, wallHeight, wallThickness, new Vector3(0, wallHeight / 2, farZ), wall, undefined, true, true);

    const sideDepth = this.map.depth * 0.69;
    const sideCenterZ = this.map.depth * 0.155;
    this.createBox('left-cutaway-wall', wallThickness, wallHeight, sideDepth, new Vector3(-this.map.width / 2 - wallThickness * 0.35, wallHeight / 2, sideCenterZ), wallShadow, undefined, true, true);
    this.createBox('right-cutaway-wall', wallThickness, wallHeight, sideDepth, new Vector3(this.map.width / 2 + wallThickness * 0.35, wallHeight / 2, sideCenterZ), wallShadow, undefined, true, true);

    this.createBox('far-baseboard', this.map.width + 0.12, 0.35, 0.16, new Vector3(0, 0.2, this.map.depth / 2 - 0.1), trim, undefined, false, false);
    this.createBox('far-picture-rail', this.map.width + 0.12, 0.14, 0.18, new Vector3(0, wallHeight - 0.65, this.map.depth / 2 - 0.1), trim, undefined, false, false);
    this.createBox('left-baseboard', 0.16, 0.35, sideDepth, new Vector3(-this.map.width / 2 + 0.1, 0.2, sideCenterZ), trim, undefined, false, false);
    this.createBox('right-baseboard', 0.16, 0.35, sideDepth, new Vector3(this.map.width / 2 - 0.1, 0.2, sideCenterZ), trim, undefined, false, false);

    const columnPositions = [-this.map.width / 2 + 0.6, -this.map.width / 4, 0, this.map.width / 4, this.map.width / 2 - 0.6];
    for (const x of columnPositions) {
      this.createBox('wall-pilaster', 0.4, wallHeight - 0.4, 0.26, new Vector3(x, wallHeight / 2 - 0.05, this.map.depth / 2 - 0.25), trim, undefined, true, false);
      this.createBox('pilaster-cap', 0.66, 0.24, 0.38, new Vector3(x, wallHeight - 0.42, this.map.depth / 2 - 0.29), trim, undefined, false, false);
    }

    this.createWindows(wallHeight);
    this.createDoor(new Vector3(this.map.width * 0.37, 0, this.map.depth / 2 - 0.32), 'STAFF');
    this.createTextSign(
      'library-title-sign',
      this.map.name.toUpperCase(),
      new Vector3(0, wallHeight - 1.05, this.map.depth / 2 - 0.37),
      Math.min(8.5, this.map.width * 0.24),
      0.78,
      false,
      archive ? PALETTE.archiveDark : PALETTE.darkWalnut,
      archive ? PALETTE.moonlight : PALETTE.parchment,
    );
  }

  private createWindows(wallHeight: number): void {
    const archive = this.map.id === 'midnight-archives';
    const recess = this.getMaterial('window-recess', Color3.FromHexString('#10171c'), { specular: Color3.Black() });
    const glassColor = archive ? Color3.FromHexString('#5b8fa5') : Color3.FromHexString('#6f8292');
    const glass = this.getMaterial('window-glass', glassColor.scale(0.62), {
      emissive: glassColor.scale(archive ? 0.5 : 0.24),
      specular: Color3.White().scale(0.35),
    });
    const frame = this.getMaterial('window-frame', archive ? PALETTE.archiveDark : PALETTE.darkWalnut, {
      specular: Color3.White().scale(0.08),
    });
    const curtain = this.getMaterial('window-curtain', archive ? PALETTE.teal.scale(0.45) : PALETTE.burgundy, {
      specular: Color3.Black(),
    });

    const positions = [-this.map.width * 0.27, 0, this.map.width * 0.27];
    for (const x of positions) {
      const y = wallHeight * 0.58;
      const z = this.map.depth / 2 - 0.3;
      this.createBox('window-recess', 4.8, 3.05, 0.12, new Vector3(x, y, z), recess, undefined, false, false);
      const pane = this.createBox('window-pane', 4.25, 2.62, 0.08, new Vector3(x, y, z - 0.09), glass, undefined, false, false);
      this.glowLayer?.addIncludedOnlyMesh(pane);
      this.createBox('window-mullion-v', 0.12, 2.75, 0.13, new Vector3(x, y, z - 0.15), frame, undefined, false, false);
      this.createBox('window-mullion-h', 4.45, 0.12, 0.13, new Vector3(x, y, z - 0.15), frame, undefined, false, false);
      if (!archive) {
        this.createBox('curtain-left', 0.36, 3.25, 0.2, new Vector3(x - 2.25, y, z - 0.25), curtain, undefined, false, false);
        this.createBox('curtain-right', 0.36, 3.25, 0.2, new Vector3(x + 2.25, y, z - 0.25), curtain, undefined, false, false);
      }
    }
  }

  private createDoor(position: Vector3, label: string): void {
    const archive = this.map.id === 'midnight-archives';
    const frame = this.getMaterial('door-frame', archive ? PALETTE.archiveDark : PALETTE.darkWalnut);
    const panel = this.getMaterial('door-panel', archive ? PALETTE.archiveWood : PALETTE.warmWood, {
      specular: Color3.White().scale(0.07),
    });
    const brass = this.getMaterial('door-brass', PALETTE.brass, {
      emissive: PALETTE.brass.scale(0.08),
      specular: Color3.White().scale(0.4),
    });

    this.createBox('door-panel', 2.55, 4.35, 0.18, new Vector3(position.x, 2.18, position.z), panel, undefined, false, false);
    this.createBox('door-frame-left', 0.24, 4.7, 0.32, new Vector3(position.x - 1.39, 2.35, position.z - 0.03), frame, undefined, false, false);
    this.createBox('door-frame-right', 0.24, 4.7, 0.32, new Vector3(position.x + 1.39, 2.35, position.z - 0.03), frame, undefined, false, false);
    this.createBox('door-frame-top', 3.02, 0.26, 0.32, new Vector3(position.x, 4.58, position.z - 0.03), frame, undefined, false, false);

    const knob = MeshBuilder.CreateSphere('door-knob', { diameter: 0.2, segments: 10 }, this.scene);
    knob.position = new Vector3(position.x + 0.83, 2.05, position.z - 0.17);
    knob.material = brass;
    knob.parent = this.requireRoot();
    knob.isPickable = false;

    this.createTextSign('door-label', label, new Vector3(position.x, 3.72, position.z - 0.18), 1.35, 0.38, false, frame, PALETTE.parchment);
  }

  private createEventZoneInlays(): void {
    const accent = Color3.FromHexString(this.map.accentColor);
    const archive = this.map.id === 'midnight-archives';

    for (let index = 0; index < this.map.eventZones.length; index += 1) {
      const zone = this.map.eventZones[index];
      if (!zone) continue;

      const zoneColor = Color3.Lerp(accent, archive ? PALETTE.moonlight : PALETTE.parchment, 0.1 + index * 0.08);
      this.createRug(
        `zone:${zone.id}`,
        new Vector3(zone.x, 0.055, zone.z),
        Math.max(3.2, zone.width * 0.72),
        Math.max(3, zone.depth * 0.68),
        zoneColor.scale(archive ? 0.42 : 0.68),
        zoneColor,
        archive,
      );

      const signZ = Math.min(this.map.depth / 2 - 1.1, zone.z + zone.depth * 0.36);
      this.createTextSign(
        `zone-sign:${zone.id}`,
        zone.label.toUpperCase(),
        new Vector3(zone.x, 0.16, signZ),
        Math.min(4.6, Math.max(2.8, zone.width * 0.45)),
        0.48,
        true,
        archive ? PALETTE.archiveDark : PALETTE.darkWalnut,
        archive ? PALETTE.moonlight : PALETTE.parchment,
      );
    }
  }

  private createShelf(bounds: Bounds2, index: number): BuiltShelf {
    const genreIndex = index % GENRES.length;
    const genre = GENRES[genreIndex];
    if (!genre) throw new Error(`Missing genre for shelf ${index}`);

    const archive = this.map.id === 'midnight-archives';
    const longAxisIsX = bounds.width >= bounds.depth;
    const length = Math.max(bounds.width, bounds.depth);
    const depth = Math.min(bounds.width, bounds.depth);
    const height = archive ? 4.25 : 3.75;
    const root = new TransformNode(`shelf:${index + 1}`, this.scene);
    root.position = new Vector3(bounds.x, 0, bounds.z);
    root.rotation.y = longAxisIsX ? 0 : Math.PI / 2;
    root.parent = this.requireRoot();

    const wood = this.getMaterial('shelf-wood', archive ? PALETTE.archiveWood : PALETTE.walnut, {
      specular: archive ? PALETTE.moonlight.scale(0.09) : PALETTE.brass.scale(0.1),
    });
    const shadow = this.getMaterial('shelf-shadow', archive ? PALETTE.archiveDark : PALETTE.darkWalnut, {
      specular: Color3.Black(),
    });
    const trim = this.getMaterial('shelf-trim', archive ? Color3.FromHexString('#7a775f') : PALETTE.brass.scale(0.82), {
      emissive: archive ? Color3.FromHexString('#302f28') : Color3.FromHexString('#3b2d1c'),
      specular: Color3.White().scale(0.22),
    });
    const genreColor = Color3.FromHexString(genre.color);
    const genreGlow = Color3.FromHexString(genre.emissive);
    const plaqueMaterial = this.getMaterial(`shelf-plaque:${genre.id}`, genreColor, {
      emissive: genreGlow.scale(0.42),
      specular: Color3.White().scale(0.24),
    });

    this.createBox('shelf-back', length - 0.18, height - 0.26, 0.16, new Vector3(0, height / 2, depth / 2 - 0.14), shadow, root, true, true);
    this.createBox('shelf-left-post', 0.24, height, depth, new Vector3(-length / 2 + 0.16, height / 2, 0), wood, root, true, true);
    this.createBox('shelf-right-post', 0.24, height, depth, new Vector3(length / 2 - 0.16, height / 2, 0), wood, root, true, true);
    this.createBox('shelf-crown', length + 0.16, 0.24, depth + 0.12, new Vector3(0, height - 0.1, 0), wood, root, true, true);
    this.createBox('shelf-plinth', length + 0.08, 0.34, depth + 0.08, new Vector3(0, 0.17, 0), shadow, root, true, true);
    this.createBox('shelf-brass-foot', length - 0.28, 0.08, depth + 0.12, new Vector3(0, 0.38, -0.03), trim, root, false, false);

    const rowCount = 3;
    const interiorHeight = height - 0.62;
    for (let row = 1; row <= rowCount; row += 1) {
      const y = 0.34 + (interiorHeight / rowCount) * row;
      this.createBox('shelf-board', length - 0.34, 0.12, depth, new Vector3(0, y, 0), wood, root, true, true);
    }

    const booksPerRow = Math.min(10, Math.max(6, Math.floor(length / 0.82)));
    const usableWidth = length - 0.72;
    const spacing = usableWidth / booksPerRow;
    for (let row = 0; row < rowCount; row += 1) {
      for (let book = 0; book < booksPerRow; book += 1) {
        const variation = (book + row * 2 + index) % 4;
        const color = this.bookColor(genreColor, variation);
        const bookMaterial = this.getMaterial(`book:${genre.id}:${variation}`, color, {
          specular: PALETTE.parchment.scale(0.08),
        });
        const bookHeight = 0.54 + ((book * 7 + row * 3 + index) % 5) * 0.055;
        const bookWidth = spacing * (0.56 + ((book + row) % 3) * 0.08);
        const x = -usableWidth / 2 + spacing * (book + 0.5);
        const y = 0.48 + row * (interiorHeight / rowCount) + bookHeight / 2;
        const z = -depth / 2 - 0.015;
        const bookMesh = this.createBox('shelf-book', bookWidth, bookHeight, 0.24, new Vector3(x, y, z), bookMaterial, root, false, false);
        bookMesh.rotation.z = ((book + row + index) % 7 === 0 ? 1 : 0) * 0.055;
      }
    }

    const plaqueWidth = longAxisIsX ? Math.min(length * 0.48, 2.8) : Math.min(1.6, depth * 0.9);
    const plaquePosition = longAxisIsX
      ? new Vector3(0, height - 0.42, -depth / 2 - 0.1)
      : new Vector3(length / 2 + 0.11, height - 0.42, 0);
    const glow = this.createBox(
      `shelf-glow:${index + 1}`,
      plaqueWidth,
      0.42,
      0.1,
      plaquePosition,
      plaqueMaterial,
      root,
      false,
      false,
    );
    if (!longAxisIsX) glow.rotation.y = -root.rotation.y;
    this.glowLayer?.addIncludedOnlyMesh(glow);

    const labelBacking = this.createTextSign(
      `shelf-label:${index + 1}`,
      genre.name.toUpperCase(),
      longAxisIsX
        ? new Vector3(0, height - 0.42, -depth / 2 - 0.165)
        : new Vector3(length / 2 + 0.17, height - 0.42, 0),
      longAxisIsX ? Math.min(length * 0.43, 2.55) : plaqueWidth * 0.9,
      0.3,
      false,
      plaqueMaterial,
      PALETTE.cream,
      root,
    );
    const labelRoot = labelBacking.parent;
    if (!longAxisIsX && labelRoot instanceof TransformNode) labelRoot.rotation.y = -root.rotation.y;

    const glyphPosition = longAxisIsX
      ? new Vector3(0, height + 0.14, -depth / 2 - 0.12)
      : new Vector3(length / 2 + 0.14, height + 0.14, 0);
    const glyphMedallion = new TransformNode(`shelf-glyph-medallion:${index + 1}`, this.scene);
    glyphMedallion.position = glyphPosition;
    glyphMedallion.parent = root;
    if (!longAxisIsX) glyphMedallion.rotation.y = -root.rotation.y;
    const medallion = MeshBuilder.CreateCylinder(
      `shelf-glyph-back:${index + 1}`,
      { diameter: 0.68, height: 0.095, tessellation: 20 },
      this.scene,
    );
    medallion.rotation.x = Math.PI / 2;
    medallion.material = plaqueMaterial;
    medallion.parent = glyphMedallion;
    medallion.receiveShadows = true;
    medallion.isPickable = false;
    const glyph = createGenreGlyph(this.scene, genre.id, {
      name: `shelf-glyph:${index + 1}`,
      parent: glyphMedallion,
      position: new Vector3(0, 0, -0.075),
      orientation: 'front',
      size: 0.34,
      color: '#fff0ce',
      emissiveStrength: 0.24,
    });
    this.glowLayer?.addIncludedOnlyMesh(medallion);
    for (const glyphMesh of glyph.getChildMeshes(false)) {
      if (glyphMesh instanceof Mesh) this.glowLayer?.addIncludedOnlyMesh(glyphMesh);
    }

    root.metadata = { kind: 'shelf', shelfId: `shelf-${index + 1}`, genreId: genre.id, genreIndex };

    const collisionBounds = { ...bounds };
    this.addObstacle(collisionBounds);
    this.occluders.push({
      bounds: this.expandBounds(collisionBounds, 0.32),
      meshes: root.getChildMeshes(false),
      visibility: 1,
    });

    return {
      id: `shelf-${index + 1}`,
      genreIndex,
      position: new Vector3(bounds.x, 0, bounds.z),
      bounds: collisionBounds,
      root,
      glow,
    };
  }

  private createGrandReadingRoomSet(): void {
    const mainZone = this.map.eventZones.find((zone) => zone.id === 'reading-room');
    const childrenZone = this.map.eventZones.find((zone) => zone.id === 'childrens-wing');
    const returnsZone = this.map.eventZones.find((zone) => zone.id === 'return-room');

    const deskZ = -this.map.depth * 0.36;
    this.createCirculationDesk(new Vector3(0, 0, deskZ), 8.2, 2.25, 'CHECKOUT');

    if (mainZone) {
      this.createReadingTable(new Vector3(mainZone.x - 2.6, 0, mainZone.z + 0.4), 3.25, 1.35, true);
      this.createReadingTable(new Vector3(mainZone.x + 2.6, 0, mainZone.z + 0.4), 3.25, 1.35, true);
    }

    if (childrenZone) {
      this.createRoundTable(new Vector3(childrenZone.x + 1.6, 0, childrenZone.z + 2.1), 2.15, true);
      this.createFloorCushions(new Vector3(childrenZone.x + 1.6, 0, childrenZone.z + 2.1));
      this.createDisplayTree(new Vector3(childrenZone.x + 4.15, 0, childrenZone.z + 0.55));
    }

    if (returnsZone) {
      this.createReturnChute(new Vector3(-this.map.width / 2 + 2.1, 0, returnsZone.z + 0.7), 'RETURNS');
    }

    this.createCoatRack(new Vector3(-this.map.width / 2 + 1.35, 0, -this.map.depth / 2 + 2.1));
    this.createNoticeBoard(new Vector3(-this.map.width / 2 + 0.45, 2.55, 0.6), Math.PI / 2);
    this.createBookCart(new Vector3(8.4, 0, -this.map.depth * 0.36), -0.08);
  }

  private createMidnightArchivesSet(): void {
    const rareZone = this.map.eventZones.find((zone) => zone.id === 'rare-books');
    const vaultZone = this.map.eventZones.find((zone) => zone.id === 'catalog-vault');

    for (const bounds of this.map.shelfLayout) {
      if (bounds.depth <= bounds.width) continue;
      const rail = this.getMaterial('rolling-rail', Color3.FromHexString('#6e735f'), {
        emissive: Color3.FromHexString('#20231d'),
        specular: PALETTE.moonlight.scale(0.22),
      });
      this.createBox('rolling-rail-left', 0.13, 0.055, bounds.depth + 1.2, new Vector3(bounds.x - 0.48, 0.075, bounds.z), rail, undefined, false, false);
      this.createBox('rolling-rail-right', 0.13, 0.055, bounds.depth + 1.2, new Vector3(bounds.x + 0.48, 0.075, bounds.z), rail, undefined, false, false);
    }

    if (rareZone) {
      this.createReadingTable(new Vector3(rareZone.x, 0, rareZone.z + 0.2), 4.4, 1.55, true);
      this.createArchiveCrates(new Vector3(-this.map.width / 2 + 2.4, 0, rareZone.z - 1.6));
    }

    if (vaultZone) {
      this.createCardCatalog(new Vector3(vaultZone.x + 4.8, 0, vaultZone.z + 1.4));
      this.createVaultDoor(new Vector3(vaultZone.x + 1.5, 0, this.map.depth / 2 - 0.39));
    }

    this.createReturnChute(new Vector3(-this.map.width / 2 + 2.0, 0, -this.map.depth * 0.18), 'NIGHT DROP');
    this.createArchiveClock(new Vector3(-this.map.width * 0.28, 3.8, this.map.depth / 2 - 0.43));
    this.createRollingLadder(new Vector3(-this.map.width / 2 + 1.1, 0, 4.8), Math.PI / 2);
  }

  private presentGrandFinaleStage(stage: number): void {
    const gold = this.getMaterial('grand-finale-gold', Color3.FromHexString('#e7b85e'), {
      emissive: Color3.FromHexString('#b66d2f').scale(0.46),
      specular: Color3.White().scale(0.42),
    });
    const amber = this.getMaterial('grand-finale-amber', Color3.FromHexString('#d66c45'), {
      emissive: Color3.FromHexString('#a93f2b').scale(0.38),
      specular: Color3.White().scale(0.2),
    });
    const cream = this.getMaterial('grand-finale-cream', PALETTE.cream, {
      emissive: PALETTE.parchment.scale(0.16),
      specular: Color3.Black(),
    });

    if (stage === 1) {
      const banner = this.createFinaleBanner(
        'grand-finale-arrival',
        'FIELD TRIP ARRIVAL',
        new Vector3(0, 4.5, this.map.depth / 2 - 0.48),
        9.2,
        PALETTE.burgundy,
        PALETTE.cream,
      );
      this.registerFinaleMotion(banner, 'sway', 0.025, 0.4);
      this.createPennantLine(new Vector3(0, 5.15, this.map.depth / 2 - 0.53), 12.5);

      for (let index = 0; index < 6; index += 1) {
        const z = -this.map.depth / 2 + 2.6 + index * 2.05;
        const chevron = this.createFloorChevron(`arrival-chevron-${index}`, new Vector3(0, 0.09, z), index % 2 === 0 ? gold : amber);
        this.registerFinaleMotion(chevron, 'pulse', 0.035, index * 0.65);
      }
      this.createBox('arrival-threshold', this.map.width * 0.46, 0.035, 0.16, new Vector3(0, 0.095, -this.map.depth / 2 + 1.4), gold, undefined, false, false);
    } else if (stage === 2) {
      const children = this.map.eventZones.find((zone) => zone.id === 'childrens-wing');
      const banner = this.createFinaleBanner(
        'grand-finale-storytime',
        'STORYTIME SURGE',
        new Vector3(children?.x ?? 12, 3.7, children?.z ?? 7),
        5.3,
        PALETTE.walnut,
        PALETTE.parchment,
      );
      this.registerFinaleMotion(banner, 'hover', 0.08, 1.2);

      const start = new Vector3(this.map.width / 2 - 2.2, 0.1, this.map.depth / 2 - 3.1);
      const end = new Vector3(1.5, 0.1, 0.8);
      this.createFootprintTrail(start, end, 11, amber, gold);
      for (let index = 0; index < 5; index += 1) {
        const paper = attachFinalePaper(
          this.scene,
          this.requireRoot(),
          `grand-finale-paper-${index}`,
          new Vector3(-4 + index * 2.2, 2.15 + (index % 2) * 0.4, -0.8 + Math.sin(index) * 1.6),
          index % 2 === 0 ? cream : amber,
        );
        this.registerFinaleMotion(paper, 'hover', 0.18, index * 0.9);
      }
    } else if (stage === 3) {
      const banner = this.createFinaleBanner(
        'grand-finale-final-bell',
        'FINAL BELL · PERFECT SORT',
        new Vector3(0, 3.62, this.map.depth / 2 - 0.52),
        10.3,
        PALETTE.darkWalnut,
        Color3.FromHexString('#ffe29a'),
      );
      this.registerFinaleMotion(banner, 'pulse', 0.025, 0);
      this.createFinalBell(new Vector3(0, 5.45, this.map.depth / 2 - 1.0), gold);

      const center = this.map.eventZones.find((zone) => zone.id === 'reading-room');
      const origin = new Vector3(center?.x ?? 0, 2.2, center?.z ?? 0);
      for (let index = 0; index < GENRES.length; index += 1) {
        const genre = GENRES[index];
        if (!genre) continue;
        const angle = (index / GENRES.length) * Math.PI * 2;
        const position = origin.add(new Vector3(Math.cos(angle) * 4.2, (index % 2) * 0.35, Math.sin(angle) * 3.1));
        const book = this.createFinaleBook(`grand-golden-book-${index}`, position, genre.id, gold);
        book.rotation.y = -angle + Math.PI / 2;
        this.registerFinaleMotion(book, 'hover', 0.22, index * 0.8);
      }
    }
  }

  private presentArchiveFinaleStage(stage: number): void {
    const cyan = this.getMaterial('archive-finale-cyan', Color3.FromHexString('#67c9d6'), {
      emissive: Color3.FromHexString('#49b8ca').scale(0.56),
      specular: Color3.White().scale(0.42),
    });
    const warning = this.getMaterial('archive-finale-warning', Color3.FromHexString('#d45d55'), {
      emissive: Color3.FromHexString('#b5333d').scale(0.48),
      specular: Color3.White().scale(0.24),
    });
    const gold = this.getMaterial('archive-finale-gold', Color3.FromHexString('#d8b86c'), {
      emissive: Color3.FromHexString('#9d7c35').scale(0.38),
      specular: Color3.White().scale(0.38),
    });

    if (stage === 1) {
      const banner = this.createFinaleBanner(
        'archive-finale-lockdown',
        'CATALOG LOCKDOWN',
        new Vector3(0, 4.55, this.map.depth / 2 - 0.49),
        8.6,
        PALETTE.archiveDark,
        PALETTE.moonlight,
      );
      this.registerFinaleMotion(banner, 'pulse', 0.025, 0.3);

      for (const bounds of this.map.shelfLayout.filter((candidate) => candidate.depth > candidate.width)) {
        const beacon = this.createArchiveBeacon(
          new Vector3(bounds.x, 4.58, bounds.z - bounds.depth / 2 - 0.12),
          cyan,
          warning,
        );
        this.registerFinaleMotion(beacon, 'spin', 1.5, bounds.x * 0.1);
      }

      for (let index = 0; index < 5; index += 1) {
        const z = -this.map.depth / 2 + 3.2 + index * 3.0;
        this.createBox(
          `lockdown-rail-${index}`,
          this.map.width - 8,
          0.028,
          0.08,
          new Vector3(0, 0.102, z),
          index % 2 === 0 ? cyan : warning,
          undefined,
          false,
          false,
        );
      }
    } else if (stage === 2) {
      const banner = this.createFinaleBanner(
        'archive-finale-search',
        'INDEX SEARCH ACTIVE',
        new Vector3(-9.5, 3.75, this.map.depth / 2 - 0.52),
        6.5,
        PALETTE.archiveDark,
        Color3.FromHexString('#8fe4e8'),
      );
      this.registerFinaleMotion(banner, 'pulse', 0.035, 1.1);

      const scannerRoot = new TransformNode('catalog-scanner-root', this.scene);
      scannerRoot.position = new Vector3(0, 0.13, 0);
      scannerRoot.parent = this.requireRoot();
      const scanner = this.createBox(
        'catalog-scanner-beam',
        6.5,
        0.04,
        0.16,
        Vector3.Zero(),
        cyan,
        scannerRoot,
        false,
        false,
      );
      scanner.visibility = 0.78;
      this.registerFinaleMotion(scannerRoot, 'scan', this.map.width * 0.34, 0);

      for (let index = 0; index < 8; index += 1) {
        const x = -this.map.width / 2 + 4 + index * ((this.map.width - 8) / 7);
        const marker = this.createFloorChevron(
          `archive-index-chevron-${index}`,
          new Vector3(x, 0.115, index % 2 === 0 ? -0.75 : 0.75),
          index % 2 === 0 ? cyan : warning,
          Math.PI / 2,
        );
        this.registerFinaleMotion(marker, 'pulse', 0.028, index * 0.42);
      }
    } else if (stage === 3) {
      const banner = this.createFinaleBanner(
        'archive-finale-gold-index',
        'RESTORE THE GOLD INDEX',
        new Vector3(5.8, 3.62, this.map.depth / 2 - 0.53),
        7.8,
        PALETTE.archiveDark,
        Color3.FromHexString('#f0d58a'),
      );
      this.registerFinaleMotion(banner, 'pulse', 0.025, 0.2);

      const vault = this.map.eventZones.find((zone) => zone.id === 'catalog-vault');
      const dialCenter = new Vector3(vault?.x ?? 10, 5.15, this.map.depth / 2 - 0.72);
      this.createCatalogFinaleDial(dialCenter, cyan, gold);

      const cardOrigin = new Vector3(vault?.x ?? 10, 2.3, vault?.z ?? 8);
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        const card = attachFinalePaper(
          this.scene,
          this.requireRoot(),
          `gold-index-card-${index}`,
          cardOrigin.add(new Vector3(Math.cos(angle) * 4.8, (index % 3) * 0.28, Math.sin(angle) * 3.1)),
          index % 3 === 0 ? cyan : gold,
        );
        card.rotation.y = -angle;
        this.registerFinaleMotion(card, 'hover', 0.2, index * 0.62);
      }
    }
  }

  private createFinaleBanner(
    name: string,
    text: string,
    position: Vector3,
    width: number,
    background: Color3,
    foreground: Color3,
  ): TransformNode {
    const backing = this.createTextSign(name, text, position, width, 0.68, false, background, foreground);
    const root = backing.parent;
    if (!(root instanceof TransformNode)) throw new Error(`Finale banner ${name} did not create a transform root.`);
    for (const mesh of root.getChildMeshes(false)) {
      if (mesh instanceof Mesh) this.glowLayer?.addIncludedOnlyMesh(mesh);
    }
    return root;
  }

  private createPennantLine(position: Vector3, width: number): void {
    const root = new TransformNode('field-trip-pennant-line', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const cord = this.getMaterial('pennant-cord', PALETTE.darkWalnut, { specular: Color3.Black() });
    this.createBox('pennant-cord', width, 0.035, 0.035, Vector3.Zero(), cord, root, false, false);

    for (let index = 0; index < 11; index += 1) {
      const genre = GENRES[index % GENRES.length];
      if (!genre) continue;
      const pennantMaterial = this.getMaterial(`pennant:${genre.id}`, Color3.FromHexString(genre.color), {
        emissive: Color3.FromHexString(genre.emissive).scale(0.12),
        specular: Color3.Black(),
      });
      const pennant = MeshBuilder.CreateCylinder(
        'field-trip-pennant',
        { diameter: 0.65, height: 0.045, tessellation: 3 },
        this.scene,
      );
      pennant.position = new Vector3(-width / 2 + 0.7 + index * ((width - 1.4) / 10), -0.35, 0);
      pennant.rotation.x = Math.PI / 2;
      pennant.rotation.z = Math.PI;
      pennant.material = pennantMaterial;
      pennant.parent = root;
      pennant.isPickable = false;
    }
    this.registerFinaleMotion(root, 'sway', 0.018, 0);
  }

  private createFloorChevron(
    name: string,
    position: Vector3,
    surface: StandardMaterial,
    rotationY = 0,
  ): TransformNode {
    const root = new TransformNode(name, this.scene);
    root.position = position;
    root.rotation.y = rotationY;
    root.parent = this.requireRoot();
    const left = this.createBox(`${name}:left`, 0.82, 0.025, 0.13, new Vector3(-0.28, 0, 0), surface, root, false, false);
    left.rotation.y = 0.62;
    const right = this.createBox(`${name}:right`, 0.82, 0.025, 0.13, new Vector3(0.28, 0, 0), surface, root, false, false);
    right.rotation.y = -0.62;
    return root;
  }

  private createFootprintTrail(
    start: Vector3,
    end: Vector3,
    count: number,
    first: StandardMaterial,
    second: StandardMaterial,
  ): void {
    const direction = end.subtract(start);
    const angle = Math.atan2(direction.x, direction.z);
    for (let index = 0; index < count; index += 1) {
      const progress = count <= 1 ? 0 : index / (count - 1);
      const center = Vector3.Lerp(start, end, progress);
      const side = index % 2 === 0 ? -0.24 : 0.24;
      const foot = MeshBuilder.CreateCylinder('field-trip-footprint', { diameter: 0.3, height: 0.025, tessellation: 12 }, this.scene);
      foot.position = new Vector3(center.x + Math.cos(angle) * side, center.y, center.z - Math.sin(angle) * side);
      foot.scaling.z = 1.6;
      foot.rotation.y = angle + (index % 2 === 0 ? -0.12 : 0.12);
      foot.material = index % 2 === 0 ? first : second;
      foot.parent = this.requireRoot();
      foot.isPickable = false;
    }
  }

  private createFinalBell(position: Vector3, surface: StandardMaterial): void {
    const root = new TransformNode('grand-final-bell', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const mount = this.getMaterial('final-bell-mount', PALETTE.darkWalnut, { specular: Color3.Black() });
    this.createBox('bell-mount', 2.15, 0.2, 0.22, new Vector3(0, 0.62, 0.15), mount, root, true, true);
    const bell = MeshBuilder.CreateSphere('final-bell', { diameter: 1.2, segments: 16, slice: 0.58 }, this.scene);
    bell.position.y = 0.04;
    bell.rotation.x = Math.PI;
    bell.scaling.y = 1.14;
    bell.material = surface;
    bell.parent = root;
    bell.isPickable = false;
    this.shadowGenerator?.addShadowCaster(bell);
    const rim = MeshBuilder.CreateTorus('final-bell-rim', { diameter: 1.08, thickness: 0.1, tessellation: 24 }, this.scene);
    rim.position.y = -0.28;
    rim.material = surface;
    rim.parent = root;
    rim.isPickable = false;
    const clapper = MeshBuilder.CreateSphere('final-bell-clapper', { diameter: 0.24, segments: 10 }, this.scene);
    clapper.position.y = -0.48;
    clapper.material = surface;
    clapper.parent = root;
    clapper.isPickable = false;
    this.glowLayer?.addIncludedOnlyMesh(bell);
    this.glowLayer?.addIncludedOnlyMesh(rim);
    this.registerFinaleMotion(root, 'sway', 0.1, 0);
  }

  private createFinaleBook(
    name: string,
    position: Vector3,
    genreId: (typeof GENRES)[number]['id'],
    accent: StandardMaterial,
  ): TransformNode {
    const root = new TransformNode(name, this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const genre = GENRES.find((entry) => entry.id === genreId);
    const coverMaterial = this.getMaterial(`finale-cover:${genreId}`, Color3.FromHexString(genre?.color ?? '#b98b4f'), {
      emissive: Color3.FromHexString(genre?.emissive ?? '#e1b76c').scale(0.28),
      specular: Color3.White().scale(0.28),
    });
    this.createBox(`${name}:cover`, 0.78, 0.16, 1.02, Vector3.Zero(), coverMaterial, root, false, true);
    this.createBox(`${name}:pages`, 0.65, 0.12, 0.9, new Vector3(0.04, -0.03, 0), accent, root, false, true);
    const glyph = createGenreGlyph(this.scene, genreId, {
      name: `${name}:glyph`,
      parent: root,
      position: new Vector3(0, 0.105, -0.12),
      orientation: 'floor',
      size: 0.32,
      color: '#fff2c8',
      emissiveStrength: 0.34,
    });
    for (const mesh of glyph.getChildMeshes(false)) {
      if (mesh instanceof Mesh) this.glowLayer?.addIncludedOnlyMesh(mesh);
    }
    return root;
  }

  private createArchiveBeacon(
    position: Vector3,
    baseMaterial: StandardMaterial,
    beamMaterial: StandardMaterial,
  ): TransformNode {
    const root = new TransformNode('archive-lockdown-beacon', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const base = MeshBuilder.CreateCylinder('archive-beacon-base', { diameter: 0.52, height: 0.18, tessellation: 14 }, this.scene);
    base.material = baseMaterial;
    base.parent = root;
    base.isPickable = false;
    const bulb = MeshBuilder.CreateSphere('archive-beacon-bulb', { diameter: 0.32, segments: 10 }, this.scene);
    bulb.position.y = 0.25;
    bulb.material = beamMaterial;
    bulb.parent = root;
    bulb.isPickable = false;
    this.glowLayer?.addIncludedOnlyMesh(bulb);
    const rotor = new TransformNode('archive-beacon-rotor', this.scene);
    rotor.position.y = 0.27;
    rotor.parent = root;
    this.createBox('archive-beacon-ray-a', 1.15, 0.035, 0.08, Vector3.Zero(), beamMaterial, rotor, false, false).visibility = 0.65;
    this.createBox('archive-beacon-ray-b', 0.08, 0.035, 1.15, Vector3.Zero(), beamMaterial, rotor, false, false).visibility = 0.65;
    return rotor;
  }

  private createCatalogFinaleDial(
    position: Vector3,
    ringMaterial: StandardMaterial,
    spokeMaterial: StandardMaterial,
  ): void {
    const root = new TransformNode('catalog-finale-dial', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const outer = MeshBuilder.CreateTorus('catalog-dial-outer', { diameter: 2.2, thickness: 0.12, tessellation: 36 }, this.scene);
    outer.rotation.x = Math.PI / 2;
    outer.material = ringMaterial;
    outer.parent = root;
    outer.isPickable = false;
    const inner = MeshBuilder.CreateTorus('catalog-dial-inner', { diameter: 1.45, thickness: 0.075, tessellation: 28 }, this.scene);
    inner.rotation.x = Math.PI / 2;
    inner.material = spokeMaterial;
    inner.parent = root;
    inner.isPickable = false;
    for (let index = 0; index < 8; index += 1) {
      const spoke = this.createBox('catalog-dial-spoke', 0.84, 0.07, 0.07, Vector3.Zero(), index % 2 === 0 ? ringMaterial : spokeMaterial, root, false, false);
      spoke.rotation.z = (index / 8) * Math.PI * 2;
    }
    this.glowLayer?.addIncludedOnlyMesh(outer);
    this.glowLayer?.addIncludedOnlyMesh(inner);
    this.registerFinaleMotion(root, 'spin-front', 0.24, 0);
  }

  private registerFinaleMotion(
    node: TransformNode,
    kind: FinaleMotion['kind'],
    amplitude: number,
    phase: number,
  ): void {
    this.finaleMotions.push({ node, basePosition: node.position.clone(), kind, amplitude, phase });
  }

  private updateFinalePresentation(delta: number): void {
    for (const motion of this.finaleMotions) {
      if (motion.node.isDisposed()) continue;
      const wave = Math.sin(this.elapsed * 2.25 + motion.phase);
      if (motion.kind === 'hover') {
        motion.node.position.y = motion.basePosition.y + wave * motion.amplitude;
      } else if (motion.kind === 'sway') {
        motion.node.rotation.z = wave * motion.amplitude;
      } else if (motion.kind === 'spin') {
        motion.node.rotation.y += delta * motion.amplitude;
      } else if (motion.kind === 'spin-front') {
        motion.node.rotation.z += delta * motion.amplitude;
      } else if (motion.kind === 'pulse') {
        motion.node.scaling.setAll(1 + wave * motion.amplitude);
      } else {
        motion.node.position.x = motion.basePosition.x + wave * motion.amplitude;
      }
    }
  }

  private createCirculationDesk(position: Vector3, width: number, depth: number, label: string): void {
    const root = new TransformNode('circulation-desk', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const wood = this.getMaterial('desk-wood', PALETTE.warmWood, { specular: PALETTE.brass.scale(0.12) });
    const dark = this.getMaterial('desk-dark', PALETTE.darkWalnut, { specular: Color3.Black() });
    const brass = this.getMaterial('desk-brass', PALETTE.brass, {
      emissive: Color3.FromHexString('#4a3219').scale(0.12),
      specular: Color3.White().scale(0.3),
    });

    this.createBox('desk-front', width, 1.25, 0.36, new Vector3(0, 0.67, -depth / 2 + 0.18), wood, root, true, true);
    this.createBox('desk-top', width + 0.22, 0.2, depth, new Vector3(0, 1.35, 0), dark, root, true, true);
    this.createBox('desk-trim', width - 0.25, 0.08, 0.08, new Vector3(0, 1.08, -depth / 2 - 0.045), brass, root, false, false);
    this.createBox('desk-side-left', 0.38, 1.24, depth, new Vector3(-width / 2 + 0.2, 0.67, 0), wood, root, true, true);
    this.createBox('desk-side-right', 0.38, 1.24, depth, new Vector3(width / 2 - 0.2, 0.67, 0), wood, root, true, true);
    this.createTextSign('desk-label', label, new Vector3(0, 0.76, -depth / 2 - 0.055), 2.5, 0.43, false, dark, PALETTE.parchment, root);
    this.createDeskLamp(new Vector3(-width * 0.27, 1.45, 0), root, true);
    this.createDeskLamp(new Vector3(width * 0.27, 1.45, 0), root, true);

    this.addObstacle({ x: position.x, z: position.z, width, depth });
  }

  private createReadingTable(position: Vector3, width: number, depth: number, lit: boolean): void {
    const root = new TransformNode('reading-table', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const archive = this.map.id === 'midnight-archives';
    const wood = this.getMaterial('table-wood', archive ? PALETTE.archiveWood : PALETTE.warmWood, {
      specular: PALETTE.parchment.scale(0.1),
    });
    const leather = this.getMaterial('chair-upholstery', archive ? PALETTE.teal.scale(0.58) : PALETTE.burgundy.scale(0.82));

    this.createBox('table-top', width, 0.18, depth, new Vector3(0, 1.03, 0), wood, root, true, true);
    for (const x of [-width / 2 + 0.32, width / 2 - 0.32]) {
      for (const z of [-depth / 2 + 0.27, depth / 2 - 0.27]) {
        this.createBox('table-leg', 0.18, 1, 0.18, new Vector3(x, 0.5, z), wood, root, true, true);
      }
    }

    this.createChair(new Vector3(0, 0, -depth / 2 - 0.62), 0, leather, root);
    this.createChair(new Vector3(0, 0, depth / 2 + 0.62), Math.PI, leather, root);
    this.createDeskLamp(new Vector3(0, 1.13, 0), root, lit);
    this.addObstacle({ x: position.x, z: position.z, width: width + 0.25, depth: depth + 0.25 });
  }

  private createRoundTable(position: Vector3, diameter: number, lit: boolean): void {
    const root = new TransformNode('childrens-table', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const wood = this.getMaterial('children-table-wood', Color3.FromHexString('#b27b4e'), {
      specular: PALETTE.parchment.scale(0.12),
    });
    const top = MeshBuilder.CreateCylinder('round-table-top', { diameter, height: 0.18, tessellation: 32 }, this.scene);
    top.position = new Vector3(0, 0.78, 0);
    top.material = wood;
    top.parent = root;
    top.receiveShadows = true;
    top.isPickable = false;
    this.shadowGenerator?.addShadowCaster(top);

    const leg = MeshBuilder.CreateCylinder('round-table-leg', { diameter: 0.38, height: 0.78, tessellation: 16 }, this.scene);
    leg.position = new Vector3(0, 0.39, 0);
    leg.material = wood;
    leg.parent = root;
    leg.receiveShadows = true;
    leg.isPickable = false;
    this.shadowGenerator?.addShadowCaster(leg);
    this.createDeskLamp(new Vector3(0, 0.9, 0), root, lit);
    this.addObstacle({ x: position.x, z: position.z, width: diameter, depth: diameter });
  }

  private createChair(position: Vector3, rotationY: number, material: StandardMaterial, parent: TransformNode): void {
    const root = new TransformNode('reading-chair', this.scene);
    root.position = position;
    root.rotation.y = rotationY;
    root.parent = parent;
    this.createBox('chair-seat', 0.76, 0.16, 0.64, new Vector3(0, 0.52, 0), material, root, true, true);
    this.createBox('chair-back', 0.78, 0.86, 0.14, new Vector3(0, 0.92, 0.28), material, root, true, true);
    const legMaterial = this.getMaterial('chair-leg', this.map.id === 'midnight-archives' ? PALETTE.archiveDark : PALETTE.darkWalnut);
    for (const x of [-0.27, 0.27]) {
      for (const z of [-0.2, 0.2]) {
        this.createBox('chair-leg', 0.12, 0.5, 0.12, new Vector3(x, 0.25, z), legMaterial, root, true, true);
      }
    }
  }

  private createDeskLamp(position: Vector3, parent: TransformNode, withLight: boolean): void {
    const brass = this.getMaterial('lamp-brass', PALETTE.brass.scale(0.84), {
      emissive: PALETTE.brass.scale(0.07),
      specular: Color3.White().scale(0.4),
    });
    const shadeMaterial = this.getMaterial('lamp-shade', Color3.FromHexString('#3f6f62'), {
      specular: Color3.White().scale(0.2),
    });
    const bulbMaterial = this.getMaterial('lamp-bulb', Color3.FromHexString('#ffd78c'), {
      emissive: Color3.FromHexString('#ffc66c').scale(0.78),
      specular: Color3.White(),
    });

    const lampRoot = new TransformNode('desk-lamp', this.scene);
    lampRoot.position = position;
    lampRoot.parent = parent;

    const base = MeshBuilder.CreateCylinder('lamp-base', { diameter: 0.48, height: 0.08, tessellation: 20 }, this.scene);
    base.position.y = 0.05;
    base.material = brass;
    base.parent = lampRoot;
    base.isPickable = false;

    const stem = MeshBuilder.CreateCylinder('lamp-stem', { diameter: 0.075, height: 0.74, tessellation: 12 }, this.scene);
    stem.position.y = 0.42;
    stem.material = brass;
    stem.parent = lampRoot;
    stem.isPickable = false;

    const shade = MeshBuilder.CreateCylinder(
      'lamp-shade',
      { diameterTop: 0.28, diameterBottom: 0.78, height: 0.42, tessellation: 24 },
      this.scene,
    );
    shade.position.y = 0.83;
    shade.material = shadeMaterial;
    shade.parent = lampRoot;
    shade.isPickable = false;

    const bulb = MeshBuilder.CreateSphere('lamp-glow', { diameter: 0.17, segments: 10 }, this.scene);
    bulb.position.y = 0.68;
    bulb.material = bulbMaterial;
    bulb.parent = lampRoot;
    bulb.isPickable = false;
    this.glowLayer?.addIncludedOnlyMesh(bulb);

    if (withLight && this.animatedLamps.length < 4) {
      const light = this.createPointLight(
        'reading-lamp-light',
        position.add(new Vector3(parent.getAbsolutePosition().x, 0.8, parent.getAbsolutePosition().z)),
        { color: Color3.FromHexString('#ffd396'), intensity: 0.94, range: 8.5 },
      );
      this.animatedLamps.push(light);
    }
  }

  private createFloorCushions(center: Vector3): void {
    const colors = ['#b8574d', '#d29a48', '#4d7f77', '#6d5d91'];
    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2;
      const radius = 1.7 + (index % 2) * 0.22;
      const material = this.getMaterial(`cushion:${index % colors.length}`, Color3.FromHexString(colors[index % colors.length] ?? '#b8574d'), {
        specular: Color3.Black(),
      });
      const cushion = MeshBuilder.CreateCylinder('floor-cushion', { diameter: 0.72, height: 0.18, tessellation: 16 }, this.scene);
      cushion.position = new Vector3(center.x + Math.cos(angle) * radius, 0.17, center.z + Math.sin(angle) * radius);
      cushion.scaling.z = 0.82;
      cushion.rotation.y = angle;
      cushion.material = material;
      cushion.parent = this.requireRoot();
      cushion.receiveShadows = true;
      cushion.isPickable = false;
    }
  }

  private createDisplayTree(position: Vector3): void {
    const root = new TransformNode('storybook-tree', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const trunk = this.getMaterial('tree-trunk', PALETTE.warmWood);
    const leaf = this.getMaterial('tree-canopy', Color3.FromHexString('#597d5d'), {
      emissive: Color3.FromHexString('#1a2d1b').scale(0.08),
      specular: Color3.Black(),
    });
    const trunkMesh = MeshBuilder.CreateCylinder('tree-trunk', { height: 2.5, diameterTop: 0.36, diameterBottom: 0.62, tessellation: 12 }, this.scene);
    trunkMesh.position.y = 1.25;
    trunkMesh.material = trunk;
    trunkMesh.parent = root;
    trunkMesh.isPickable = false;
    this.shadowGenerator?.addShadowCaster(trunkMesh);

    const canopyPositions = [
      new Vector3(0, 2.8, 0),
      new Vector3(-0.55, 2.52, 0.12),
      new Vector3(0.5, 2.56, -0.1),
      new Vector3(0.08, 3.18, 0),
    ];
    for (const canopyPosition of canopyPositions) {
      const canopy = MeshBuilder.CreateSphere('tree-canopy', { diameter: 1.35, segments: 12 }, this.scene);
      canopy.position = canopyPosition;
      canopy.scaling.y = 0.78;
      canopy.material = leaf;
      canopy.parent = root;
      canopy.isPickable = false;
      this.shadowGenerator?.addShadowCaster(canopy);
    }
  }

  private createReturnChute(position: Vector3, label: string): void {
    const root = new TransformNode('return-chute', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const archive = this.map.id === 'midnight-archives';
    const body = this.getMaterial('chute-body', archive ? PALETTE.archiveWood : PALETTE.warmWood, {
      specular: Color3.White().scale(0.12),
    });
    const dark = this.getMaterial('chute-mouth', Color3.FromHexString('#12191c'), { specular: Color3.Black() });
    const glowMaterial = this.getMaterial('chute-glow', archive ? PALETTE.moonlight : PALETTE.brass, {
      emissive: (archive ? PALETTE.moonlight : PALETTE.brass).scale(0.46),
      specular: Color3.White().scale(0.32),
    });

    this.createBox('chute-cabinet', 1.55, 2.25, 1.4, new Vector3(0, 1.12, 0), body, root, true, true);
    this.createBox('chute-mouth', 1.06, 0.47, 0.13, new Vector3(0, 1.48, -0.72), dark, root, false, false);
    const glow = this.createBox('chute-edge', 1.2, 0.08, 0.12, new Vector3(0, 1.75, -0.74), glowMaterial, root, false, false);
    this.glowLayer?.addIncludedOnlyMesh(glow);
    this.createTextSign('chute-label', label, new Vector3(0, 1.96, -0.76), 1.32, 0.31, false, dark, PALETTE.parchment, root);
    this.addObstacle({ x: position.x, z: position.z, width: 1.7, depth: 1.55 });
  }

  private createCoatRack(position: Vector3): void {
    const wood = this.getMaterial('coat-rack', PALETTE.darkWalnut);
    const stem = MeshBuilder.CreateCylinder('coat-rack-stem', { height: 2.5, diameter: 0.14, tessellation: 12 }, this.scene);
    stem.position = position.add(new Vector3(0, 1.25, 0));
    stem.material = wood;
    stem.parent = this.requireRoot();
    stem.isPickable = false;
    const base = MeshBuilder.CreateCylinder('coat-rack-base', { height: 0.1, diameter: 0.9, tessellation: 16 }, this.scene);
    base.position = position.add(new Vector3(0, 0.06, 0));
    base.material = wood;
    base.parent = this.requireRoot();
    base.isPickable = false;
  }

  private createNoticeBoard(position: Vector3, rotationY: number): void {
    const board = this.getMaterial('notice-board', Color3.FromHexString('#8d623e'));
    const paper = this.getMaterial('notice-paper', Color3.FromHexString('#e9d8b6'), { specular: Color3.Black() });
    const frame = this.getMaterial('notice-frame', PALETTE.darkWalnut);
    const root = new TransformNode('notice-board', this.scene);
    root.position = position;
    root.rotation.y = rotationY;
    root.parent = this.requireRoot();
    this.createBox('notice-frame', 3.1, 2.2, 0.18, Vector3.Zero(), frame, root, false, false);
    this.createBox('notice-cork', 2.72, 1.82, 0.08, new Vector3(0, 0, -0.12), board, root, false, false);
    const notes = [
      new Vector3(-0.76, 0.38, -0.18),
      new Vector3(0.32, 0.5, -0.18),
      new Vector3(0.78, -0.36, -0.18),
      new Vector3(-0.34, -0.42, -0.18),
    ];
    for (const note of notes) this.createBox('notice', 0.62, 0.54, 0.025, note, paper, root, false, false);
  }

  private createBookCart(position: Vector3, rotationY: number): void {
    const root = new TransformNode('returns-book-cart', this.scene);
    root.position = position;
    root.rotation.y = rotationY;
    root.parent = this.requireRoot();
    const frame = this.getMaterial('book-cart-frame', PALETTE.brass.scale(0.76), {
      emissive: PALETTE.brass.scale(0.04),
      specular: Color3.White().scale(0.28),
    });
    const tray = this.getMaterial('book-cart-tray', PALETTE.walnut, {
      specular: PALETTE.parchment.scale(0.1),
    });
    const wheelMaterial = this.getMaterial('book-cart-wheel', Color3.FromHexString('#1f2020'), {
      specular: Color3.White().scale(0.12),
    });

    this.createBox('cart-lower-tray', 2.7, 0.14, 1.02, new Vector3(0, 0.58, 0), tray, root, true, true);
    this.createBox('cart-upper-tray', 2.7, 0.14, 1.02, new Vector3(0, 1.4, 0), tray, root, true, true);
    for (const x of [-1.24, 1.24]) {
      this.createBox('cart-upright', 0.12, 1.62, 0.12, new Vector3(x, 1.02, 0), frame, root, true, true);
      this.createBox('cart-handle', 0.15, 0.12, 1.55, new Vector3(x, 1.83, 0), frame, root, false, false);
    }
    for (const x of [-1.06, 1.06]) {
      for (const z of [-0.39, 0.39]) {
        const wheel = MeshBuilder.CreateCylinder('cart-wheel', { diameter: 0.38, height: 0.13, tessellation: 16 }, this.scene);
        wheel.position = new Vector3(x, 0.25, z);
        wheel.rotation.z = Math.PI / 2;
        wheel.material = wheelMaterial;
        wheel.parent = root;
        wheel.isPickable = false;
      }
    }

    for (let index = 0; index < 9; index += 1) {
      const genre = GENRES[index % GENRES.length];
      if (!genre) continue;
      const surface = this.getMaterial(`cart-book:${genre.id}`, Color3.FromHexString(genre.color), {
        specular: PALETTE.parchment.scale(0.08),
      });
      const book = this.createBox(
        'cart-book',
        0.2 + (index % 2) * 0.04,
        0.58 + (index % 3) * 0.07,
        0.34,
        new Vector3(-1.0 + index * 0.25, 1.75 + (index % 3) * 0.035, -0.05),
        surface,
        root,
        false,
        true,
      );
      book.rotation.z = (index % 4 === 0 ? -1 : 0) * 0.06;
    }

    const longAxisX = Math.abs(Math.cos(rotationY)) >= 0.7;
    this.addObstacle({
      x: position.x,
      z: position.z,
      width: longAxisX ? 3.0 : 1.25,
      depth: longAxisX ? 1.25 : 3.0,
    });
  }

  private createRollingLadder(position: Vector3, rotationY: number): void {
    const root = new TransformNode('archive-rolling-ladder', this.scene);
    root.position = position;
    root.rotation.y = rotationY;
    root.rotation.z = -0.1;
    root.parent = this.requireRoot();
    const metal = this.getMaterial('ladder-metal', Color3.FromHexString('#718184'), {
      specular: PALETTE.moonlight.scale(0.3),
    });
    const brass = this.getMaterial('ladder-brass', PALETTE.brass.scale(0.7), {
      emissive: PALETTE.brass.scale(0.035),
      specular: Color3.White().scale(0.26),
    });
    for (const x of [-0.5, 0.5]) {
      this.createBox('ladder-rail', 0.13, 3.9, 0.14, new Vector3(x, 1.95, 0), metal, root, true, true);
    }
    for (let rung = 0; rung < 8; rung += 1) {
      this.createBox('ladder-rung', 1.08, 0.1, 0.12, new Vector3(0, 0.42 + rung * 0.46, -0.03), rung % 2 === 0 ? brass : metal, root, false, true);
    }
    for (const x of [-0.5, 0.5]) {
      const wheel = MeshBuilder.CreateCylinder('ladder-wheel', { diameter: 0.3, height: 0.12, tessellation: 14 }, this.scene);
      wheel.position = new Vector3(x, 0.12, 0);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = brass;
      wheel.parent = root;
      wheel.isPickable = false;
    }
  }

  private createArchiveCrates(position: Vector3): void {
    const wood = this.getMaterial('archive-crate', Color3.FromHexString('#66533b'));
    const brass = this.getMaterial('crate-corners', Color3.FromHexString('#8e7d5c'), { specular: PALETTE.moonlight.scale(0.2) });
    const crates = [
      { offset: new Vector3(0, 0, 0), width: 1.45, height: 1.05, depth: 1.1 },
      { offset: new Vector3(0.35, 0.95, 0.08), width: 1.05, height: 0.8, depth: 0.92 },
      { offset: new Vector3(1.35, 0, 0.22), width: 0.95, height: 0.72, depth: 0.88 },
    ];
    for (const crate of crates) {
      const center = position.add(crate.offset).add(new Vector3(0, crate.height / 2, 0));
      this.createBox('archive-crate', crate.width, crate.height, crate.depth, center, wood, undefined, true, true);
      this.createBox('crate-band', crate.width + 0.03, 0.08, crate.depth + 0.03, center.add(new Vector3(0, crate.height * 0.25, 0)), brass, undefined, false, false);
    }
    this.addObstacle({ x: position.x + 0.65, z: position.z + 0.1, width: 2.7, depth: 1.45 });
  }

  private createCardCatalog(position: Vector3): void {
    const root = new TransformNode('card-catalog', this.scene);
    root.position = position;
    root.parent = this.requireRoot();
    const wood = this.getMaterial('catalog-wood', PALETTE.archiveWood);
    const drawer = this.getMaterial('catalog-drawer', Color3.FromHexString('#415052'));
    const brass = this.getMaterial('catalog-brass', PALETTE.brass.scale(0.76), {
      emissive: PALETTE.brass.scale(0.05),
      specular: Color3.White().scale(0.26),
    });
    this.createBox('catalog-body', 3.5, 2.45, 1.12, new Vector3(0, 1.22, 0), wood, root, true, true);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        const x = -1.42 + column * 0.565;
        const y = 0.43 + row * 0.53;
        this.createBox('catalog-drawer', 0.48, 0.42, 0.08, new Vector3(x, y, -0.6), drawer, root, false, false);
        this.createBox('catalog-handle', 0.21, 0.07, 0.06, new Vector3(x, y - 0.04, -0.68), brass, root, false, false);
      }
    }
    this.addObstacle({ x: position.x, z: position.z, width: 3.65, depth: 1.3 });
  }

  private createVaultDoor(position: Vector3): void {
    const dark = this.getMaterial('vault-dark', Color3.FromHexString('#162327'), { specular: PALETTE.moonlight.scale(0.18) });
    const metal = this.getMaterial('vault-metal', Color3.FromHexString('#637578'), { specular: Color3.White().scale(0.32) });
    const glow = this.getMaterial('vault-glow', PALETTE.moonlight.scale(0.72), {
      emissive: PALETTE.moonlight.scale(0.48),
      specular: Color3.White().scale(0.4),
    });
    this.createBox('vault-frame', 4.1, 4.8, 0.3, new Vector3(position.x, 2.4, position.z), dark, undefined, true, false);
    this.createBox('vault-door', 3.55, 4.25, 0.24, new Vector3(position.x, 2.25, position.z - 0.2), metal, undefined, true, false);
    const wheel = MeshBuilder.CreateTorus('vault-wheel', { diameter: 1.3, thickness: 0.12, tessellation: 32 }, this.scene);
    wheel.position = new Vector3(position.x, 2.3, position.z - 0.38);
    wheel.rotation.x = Math.PI / 2;
    wheel.material = glow;
    wheel.parent = this.requireRoot();
    wheel.isPickable = false;
    this.glowLayer?.addIncludedOnlyMesh(wheel);
    for (let spoke = 0; spoke < 4; spoke += 1) {
      const bar = this.createBox('vault-spoke', 1.25, 0.08, 0.08, new Vector3(position.x, 2.3, position.z - 0.4), glow, undefined, false, false);
      bar.rotation.z = (spoke * Math.PI) / 4;
    }
  }

  private createArchiveClock(position: Vector3): void {
    const rim = this.getMaterial('clock-rim', PALETTE.brass.scale(0.8), { specular: Color3.White().scale(0.28) });
    const face = this.getMaterial('clock-face', Color3.FromHexString('#d8d8ca'), { emissive: Color3.FromHexString('#6c746f').scale(0.1) });
    const hand = this.getMaterial('clock-hand', PALETTE.archiveDark);
    const clock = MeshBuilder.CreateCylinder('archive-clock', { diameter: 1.65, height: 0.18, tessellation: 32 }, this.scene);
    clock.position = position;
    clock.rotation.x = Math.PI / 2;
    clock.material = rim;
    clock.parent = this.requireRoot();
    clock.isPickable = false;
    const clockFace = MeshBuilder.CreateCylinder('archive-clock-face', { diameter: 1.42, height: 0.04, tessellation: 32 }, this.scene);
    clockFace.position = position.add(new Vector3(0, 0, -0.12));
    clockFace.rotation.x = Math.PI / 2;
    clockFace.material = face;
    clockFace.parent = this.requireRoot();
    clockFace.isPickable = false;
    const hour = this.createBox('clock-hour', 0.08, 0.58, 0.035, position.add(new Vector3(0, 0.18, -0.17)), hand, undefined, false, false);
    hour.rotation.z = -0.6;
    const minute = this.createBox('clock-minute', 0.07, 0.72, 0.035, position.add(new Vector3(0.18, -0.07, -0.18)), hand, undefined, false, false);
    minute.rotation.z = 1.1;
  }

  private createRug(
    name: string,
    position: Vector3,
    width: number,
    depth: number,
    color: Color3,
    borderColor: Color3,
    angular: boolean,
  ): void {
    const material = this.getMaterial(`${name}:material`, color, { specular: Color3.Black() });
    const border = this.getMaterial(`${name}:border`, borderColor.scale(0.82), {
      emissive: borderColor.scale(0.04),
      specular: Color3.Black(),
    });

    if (angular) {
      this.createBox(name, width, 0.045, depth, position, material, undefined, false, false);
      this.createBox(`${name}:north`, width, 0.025, 0.08, position.add(new Vector3(0, 0.034, depth / 2 - 0.08)), border, undefined, false, false);
      this.createBox(`${name}:south`, width, 0.025, 0.08, position.add(new Vector3(0, 0.034, -depth / 2 + 0.08)), border, undefined, false, false);
      this.createBox(`${name}:east`, 0.08, 0.025, depth, position.add(new Vector3(width / 2 - 0.08, 0.034, 0)), border, undefined, false, false);
      this.createBox(`${name}:west`, 0.08, 0.025, depth, position.add(new Vector3(-width / 2 + 0.08, 0.034, 0)), border, undefined, false, false);
      for (const x of [-width / 2 + 0.34, width / 2 - 0.34]) {
        for (const z of [-depth / 2 + 0.34, depth / 2 - 0.34]) {
          const corner = this.createBox(`${name}:corner-inlay`, 0.28, 0.028, 0.28, position.add(new Vector3(x, 0.038, z)), border, undefined, false, false);
          corner.rotation.y = Math.PI / 4;
        }
      }
      return;
    }

    const rug = MeshBuilder.CreateCylinder(name, { diameter: 2, height: 0.045, tessellation: 48 }, this.scene);
    rug.position = position;
    rug.scaling = new Vector3(width / 2, 1, depth / 2);
    rug.material = material;
    rug.parent = this.requireRoot();
    rug.receiveShadows = true;
    rug.isPickable = false;

    const ring = MeshBuilder.CreateTorus(`${name}:border`, { diameter: 1.62, thickness: 0.06, tessellation: 48 }, this.scene);
    ring.position = position.add(new Vector3(0, 0.04, 0));
    ring.scaling = new Vector3(width / 2, 1, depth / 2);
    ring.material = border;
    ring.parent = this.requireRoot();
    ring.isPickable = false;

    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      const dot = MeshBuilder.CreateCylinder(`${name}:woven-medallion`, { diameter: 0.12, height: 0.025, tessellation: 10 }, this.scene);
      dot.position = position.add(new Vector3(Math.cos(angle) * width * 0.31, 0.055, Math.sin(angle) * depth * 0.31));
      dot.material = border;
      dot.parent = this.requireRoot();
      dot.isPickable = false;
    }
  }

  private createTextSign(
    name: string,
    text: string,
    position: Vector3,
    width: number,
    height: number,
    horizontal: boolean,
    background: Color3 | StandardMaterial,
    foreground: Color3,
    parent?: TransformNode,
  ): Mesh {
    const backgroundMaterial = background instanceof StandardMaterial
      ? background
      : this.getMaterial(`${name}:back`, background, { specular: PALETTE.brass.scale(0.08) });
    const signRoot = new TransformNode(`${name}:root`, this.scene);
    signRoot.position = position;
    signRoot.parent = parent ?? this.requireRoot();

    const backing = this.createBox(`${name}:backing`, width, height, 0.075, Vector3.Zero(), backgroundMaterial, signRoot, false, false);
    backing.isPickable = false;

    const texture = new DynamicTexture(`${name}:texture`, { width: 768, height: 192 }, this.scene, true);
    texture.hasAlpha = true;
    texture.drawText(
      text,
      null,
      124,
      `700 ${Math.max(38, Math.min(72, Math.round(780 / Math.max(text.length, 9))))}px Georgia`,
      this.colorToCss(foreground),
      'transparent',
      true,
      true,
    );

    const textMaterial = new StandardMaterial(`${name}:text-material`, this.scene);
    textMaterial.diffuseTexture = texture;
    textMaterial.opacityTexture = texture;
    textMaterial.useAlphaFromDiffuseTexture = true;
    textMaterial.emissiveColor = foreground.scale(0.28);
    textMaterial.specularColor = Color3.Black();
    textMaterial.backFaceCulling = false;
    this.materials.set(`${name}:text-material`, textMaterial);

    const textPlane = MeshBuilder.CreatePlane(`${name}:text`, { width: width * 0.9, height: height * 0.76 }, this.scene);
    textPlane.position = new Vector3(0, 0, -0.045);
    textPlane.material = textMaterial;
    textPlane.parent = signRoot;
    textPlane.isPickable = false;

    if (horizontal) {
      signRoot.rotation.x = Math.PI / 2;
    }

    return backing;
  }

  private createPointLight(name: string, position: Vector3, options: PointLightOptions): PointLight {
    const light = new PointLight(name, position, this.scene);
    light.diffuse = options.color;
    light.specular = options.color.scale(0.75);
    light.intensity = options.intensity;
    light.range = options.range;
    this.ownedLights.push(light);
    return light;
  }

  private createAmbientDust(): void {
    if (this.reducedMotion) return;

    const texture = new DynamicTexture('dust-particle', { width: 32, height: 32 }, this.scene, false);
    texture.hasAlpha = true;
    texture.drawText('•', null, 25, '26px Arial', '#fff7dc', 'transparent', true, true);

    const dust = new ParticleSystem('floating-dust', 180, this.scene);
    dust.particleTexture = texture;
    dust.emitter = new Vector3(0, 3.2, 0);
    dust.color1 = new Color4(1, 0.88, 0.62, 0.2);
    dust.color2 = this.map.id === 'midnight-archives'
      ? new Color4(0.58, 0.82, 0.9, 0.12)
      : new Color4(1, 0.76, 0.44, 0.12);
    dust.colorDead = new Color4(0.4, 0.4, 0.35, 0);
    dust.minSize = 0.025;
    dust.maxSize = 0.075;
    dust.minLifeTime = 8;
    dust.maxLifeTime = 15;
    dust.emitRate = 8;
    dust.minEmitPower = 0.02;
    dust.maxEmitPower = 0.08;
    dust.updateSpeed = 0.012;
    dust.gravity = new Vector3(0, 0.008, 0);
    dust.createBoxEmitter(
      new Vector3(-0.04, 0.01, -0.03),
      new Vector3(0.04, 0.04, 0.03),
      new Vector3(-this.map.width / 2, 0.2, -this.map.depth / 2),
      new Vector3(this.map.width / 2, 4.8, this.map.depth / 2),
    );
    dust.start();
    this.dust = dust;
  }

  private createBox(
    name: string,
    width: number,
    height: number,
    depth: number,
    position: Vector3,
    material: StandardMaterial,
    parent?: TransformNode,
    castsShadow = true,
    receivesShadow = true,
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, this.scene);
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.parent = parent ?? this.requireRoot();
    mesh.receiveShadows = receivesShadow;
    mesh.isPickable = false;
    if (castsShadow) this.shadowGenerator?.addShadowCaster(mesh);
    return mesh;
  }

  private getMaterial(name: string, color: Color3, options: MaterialOptions = {}): StandardMaterial {
    const key = `${name}:${this.colorToCss(color)}:${options.alpha ?? 1}`;
    const existing = this.materials.get(key);
    if (existing) return existing;

    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color;
    material.ambientColor = color.scale(0.28);
    material.specularColor = options.specular ?? Color3.White().scale(0.12);
    material.specularPower = 48;
    material.emissiveColor = options.emissive ?? Color3.Black();
    material.alpha = options.alpha ?? 1;
    material.disableLighting = options.unlit ?? false;
    this.materials.set(key, material);
    return material;
  }

  private bookColor(base: Color3, variation: number): Color3 {
    switch (variation) {
      case 0:
        return base;
      case 1:
        return Color3.Lerp(base, PALETTE.parchment, 0.2);
      case 2:
        return Color3.Lerp(base, PALETTE.ink, 0.22);
      default:
        return Color3.Lerp(base, PALETTE.brass, 0.16);
    }
  }

  private addObstacle(bounds: Bounds2): void {
    this.obstacles.push({ ...bounds });
  }

  private expandBounds(bounds: Bounds2, amount: number): Bounds2 {
    return {
      x: bounds.x,
      z: bounds.z,
      width: bounds.width + amount * 2,
      depth: bounds.depth + amount * 2,
    };
  }

  private segmentIntersectsBounds(
    start: { x: number; z: number },
    end: { x: number; z: number },
    bounds: Bounds2,
  ): boolean {
    const minX = bounds.x - bounds.width / 2;
    const maxX = bounds.x + bounds.width / 2;
    const minZ = bounds.z - bounds.depth / 2;
    const maxZ = bounds.z + bounds.depth / 2;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    let minimum = 0;
    let maximum = 0.94;

    const axes: Array<[number, number, number, number]> = [
      [start.x, deltaX, minX, maxX],
      [start.z, deltaZ, minZ, maxZ],
    ];

    for (const [origin, delta, minimumBound, maximumBound] of axes) {
      if (Math.abs(delta) < 0.0001) {
        if (origin < minimumBound || origin > maximumBound) return false;
        continue;
      }

      const inverse = 1 / delta;
      let entry = (minimumBound - origin) * inverse;
      let exit = (maximumBound - origin) * inverse;
      if (entry > exit) [entry, exit] = [exit, entry];
      minimum = Math.max(minimum, entry);
      maximum = Math.min(maximum, exit);
      if (minimum > maximum) return false;
    }

    return maximum >= 0 && minimum <= 0.94;
  }

  private colorToCss(color: Color3): string {
    const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0');
    return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
  }

  private requireRoot(): TransformNode {
    if (!this.root) throw new Error('WorldBuilder.build() must initialize the root before creating geometry.');
    return this.root;
  }
}
