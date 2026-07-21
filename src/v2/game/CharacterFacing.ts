import type { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

/**
 * Character faces and front-mounted details are modeled toward local -Z.
 * Convert a world-space movement direction into the Y rotation that aims that
 * visual front along the same direction.
 */
export const characterFacingRotation = (direction: Pick<Vector3, 'x' | 'z'>): number =>
  Math.atan2(-direction.x, -direction.z);

export const characterVisualForward = (rotationY: number): { x: number; z: number } => ({
  x: -Math.sin(rotationY),
  z: -Math.cos(rotationY),
});
