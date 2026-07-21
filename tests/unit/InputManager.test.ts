import { describe, expect, it } from 'vitest';

import { gamepadMovementAxes, keyboardMovementAxes } from '../../src/v2/systems/InputManager';

describe('gameplay movement orientation', () => {
  it('maps keyboard up to positive world Z and down to negative world Z', () => {
    expect(keyboardMovementAxes(false, false, true, false)).toEqual({ moveX: 0, moveZ: 1 });
    expect(keyboardMovementAxes(false, false, false, true)).toEqual({ moveX: 0, moveZ: -1 });
  });

  it('maps standard gamepad up to positive world Z and down to negative world Z', () => {
    expect(gamepadMovementAxes(0, -1)).toEqual({ moveX: 0, moveZ: 1, active: true });
    expect(gamepadMovementAxes(0, 1)).toEqual({ moveX: 0, moveZ: -1, active: true });
  });

  it('keeps small analog drift inside the deadzone neutral', () => {
    expect(gamepadMovementAxes(0.1, -0.12)).toEqual({ moveX: 0, moveZ: 0, active: false });
  });
});
