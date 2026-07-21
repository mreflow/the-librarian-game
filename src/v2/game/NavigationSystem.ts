import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Bounds2, MapDefinition } from '../types';
import type { Rng } from '../systems/Rng';

const expanded = (bounds: Bounds2, radius: number): Bounds2 => ({
  x: bounds.x,
  z: bounds.z,
  width: bounds.width + radius * 2,
  depth: bounds.depth + radius * 2,
});

export class NavigationSystem {
  constructor(
    private readonly map: MapDefinition,
    private readonly obstacles: Bounds2[],
    private readonly rng: Rng,
  ) {}

  move(position: Vector3, desiredDelta: Vector3, radius: number): Vector3 {
    const result = position.clone();
    result.x = this.clampX(result.x + desiredDelta.x, radius);
    if (this.collides(result.x, result.z, radius)) result.x = position.x;
    result.z = this.clampZ(result.z + desiredDelta.z, radius);
    if (this.collides(result.x, result.z, radius)) result.z = position.z;
    return result;
  }

  steer(position: Vector3, target: Vector3, speed: number, delta: number, radius: number, avoidanceSign: -1 | 1 = 1): Vector3 {
    const safeTarget = this.nearestOpenPoint(target, radius);
    const direct = safeTarget.subtract(position);
    direct.y = 0;
    if (direct.lengthSquared() < 0.01) return position.clone();
    const distance = direct.length();
    const step = Math.min(distance, Math.max(0, speed * delta));
    const forward = direct.scale(1 / distance);
    const directMove = this.move(position, forward.scale(step), radius);
    const directProgress = Vector3.Dot(directMove.subtract(position), forward);
    if (directProgress >= step * 0.62 || Vector3.DistanceSquared(directMove, safeTarget) < 0.02) return directMove;

    // Commit to one side of an obstacle instead of accepting tiny movements
    // back toward the center line. The old behavior alternated left/right at
    // table edges, making visitors look frozen while their models flickered.
    const tangent = new Vector3(-forward.z, 0, forward.x).scaleInPlace(avoidanceSign);
    const candidates = [
      tangent.add(forward.scale(0.18)).normalize(),
      tangent,
      tangent.scale(-1).add(forward.scale(0.18)).normalize(),
      tangent.scale(-1),
      forward.scale(-1),
    ];
    for (const direction of candidates) {
      const option = this.move(position, direction.scale(step), radius);
      if (Vector3.DistanceSquared(option, position) >= Math.max(0.0001, step * step * 0.08)) return option;
    }
    return directMove;
  }

  randomPoint(margin = 2): Vector3 {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const point = new Vector3(
        this.rng.range(-this.map.width / 2 + margin, this.map.width / 2 - margin),
        0,
        this.rng.range(-this.map.depth / 2 + margin, this.map.depth / 2 - margin),
      );
      if (!this.collides(point.x, point.z, 0.75)) return point;
    }
    return new Vector3(0, 0, 0);
  }

  nearestOpenPoint(point: Vector3, radius = 0.7): Vector3 {
    const origin = new Vector3(this.clampX(point.x, radius), 0, this.clampZ(point.z, radius));
    if (!this.collides(origin.x, origin.z, radius)) return origin;
    for (let ring = 1; ring <= 8; ring += 1) {
      for (let step = 0; step < 12; step += 1) {
        const angle = (step / 12) * Math.PI * 2;
        const candidate = new Vector3(
          this.clampX(origin.x + Math.cos(angle) * ring, radius),
          0,
          this.clampZ(origin.z + Math.sin(angle) * ring, radius),
        );
        if (!this.collides(candidate.x, candidate.z, radius)) return candidate;
      }
    }
    return new Vector3(0, 0, 0);
  }

  collides(x: number, z: number, radius: number): boolean {
    return this.obstacles.some((obstacle) => {
      const bounds = expanded(obstacle, radius);
      return (
        x >= bounds.x - bounds.width / 2 &&
        x <= bounds.x + bounds.width / 2 &&
        z >= bounds.z - bounds.depth / 2 &&
        z <= bounds.z + bounds.depth / 2
      );
    });
  }

  private clampX(value: number, radius: number): number {
    return Math.max(-this.map.width / 2 + radius, Math.min(this.map.width / 2 - radius, value));
  }

  private clampZ(value: number, radius: number): number {
    return Math.max(-this.map.depth / 2 + radius, Math.min(this.map.depth / 2 - radius, value));
  }
}
