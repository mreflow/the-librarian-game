import type {
  BindingChange,
  GameAction,
  GamepadAction,
  GamepadBindingChange,
  GamepadBindings,
  KeyBindings,
  SettingsData,
} from '../types';

export interface InputFrame {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  intervenePressed: boolean;
  signaturePressed: boolean;
  pausePressed: boolean;
  usingGamepad: boolean;
}

export const DEFAULT_BINDINGS: KeyBindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  intervene: ['Space'],
  signature: ['KeyQ'],
  pause: ['Escape', 'KeyP'],
};

export const createDefaultBindings = (): KeyBindings => structuredClone(DEFAULT_BINDINGS);

export const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  sprint: 7,
  intervene: 0,
  signature: 4,
  pause: 9,
};

export const createDefaultGamepadBindings = (): GamepadBindings => structuredClone(DEFAULT_GAMEPAD_BINDINGS);

export class InputManager {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private bindings: KeyBindings;
  private gamepadBindings: GamepadBindings;
  private gamepadPrevious = new Map<number, boolean>();
  private sprintLatched = false;
  private sprintKeyWasDown = false;
  private gamepadSuppressedUntilRelease = false;

  constructor(private settings: SettingsData) {
    this.bindings = this.normalizeBindings(settings.keyBindings);
    this.gamepadBindings = { ...createDefaultGamepadBindings(), ...settings.gamepadBindings };
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
  }

  updateSettings(settings: SettingsData): void {
    this.settings = settings;
    this.bindings = this.normalizeBindings(settings.keyBindings);
    this.gamepadBindings = { ...createDefaultGamepadBindings(), ...settings.gamepadBindings };
    if (!settings.sprintToggle) this.sprintLatched = false;
  }

  remap(action: GameAction, codes: string[]): void {
    const uniqueCodes = [...new Set(codes.filter(Boolean))];
    if (uniqueCodes.length === 0) return;
    for (const candidate of Object.keys(this.bindings) as GameAction[]) {
      if (candidate === action) continue;
      const remaining = this.bindings[candidate].filter((code) => !uniqueCodes.includes(code));
      if (remaining.length > 0) this.bindings[candidate] = remaining;
    }
    this.bindings[action] = uniqueCodes;
  }

  rebind(action: GameAction, code: string): BindingChange {
    const previousCodes = [...this.bindings[action]];
    if (!code || previousCodes.includes(code)) {
      return { action, code, bindings: this.getBindings() };
    }

    let swappedWith: GameAction | undefined;
    let conflictIndex = -1;
    for (const candidate of Object.keys(this.bindings) as GameAction[]) {
      if (candidate === action) continue;
      const index = this.bindings[candidate].indexOf(code);
      if (index >= 0) {
        swappedWith = candidate;
        conflictIndex = index;
        break;
      }
    }

    const replacedCode = previousCodes[0];
    this.bindings[action] = [code, ...previousCodes.slice(1).filter((candidate) => candidate !== code)];
    if (swappedWith) {
      const conflictCodes = [...this.bindings[swappedWith]];
      if (replacedCode) conflictCodes[conflictIndex] = replacedCode;
      else conflictCodes.splice(conflictIndex, 1);
      this.bindings[swappedWith] = [...new Set(conflictCodes)];
    }

    this.clear();
    return { action, code, bindings: this.getBindings(), swappedWith };
  }

  getBindings(): KeyBindings {
    return structuredClone(this.bindings);
  }

  rebindGamepad(action: GamepadAction, button: number): GamepadBindingChange {
    const normalizedButton = Math.max(0, Math.floor(button));
    const previousButton = this.gamepadBindings[action];
    if (previousButton === normalizedButton) {
      return { action, button: normalizedButton, bindings: this.getGamepadBindings() };
    }

    const swappedWith = (Object.keys(this.gamepadBindings) as GamepadAction[]).find(
      (candidate) => candidate !== action && this.gamepadBindings[candidate] === normalizedButton,
    );
    this.gamepadBindings[action] = normalizedButton;
    if (swappedWith) this.gamepadBindings[swappedWith] = previousButton;
    this.gamepadPrevious.clear();
    return { action, button: normalizedButton, bindings: this.getGamepadBindings(), swappedWith };
  }

  getGamepadBindings(): GamepadBindings {
    return structuredClone(this.gamepadBindings);
  }

  resetBindings(): KeyBindings {
    this.bindings = createDefaultBindings();
    this.clear();
    return this.getBindings();
  }

  suppressUntilRelease(): void {
    this.pressed.clear();
    this.sprintLatched = false;
    this.sprintKeyWasDown = false;
    const gamepad = navigator.getGamepads?.()[0] ?? null;
    this.syncGamepadButtons(gamepad);
    this.gamepadSuppressedUntilRelease = Boolean(gamepad?.buttons.some((button) => button.pressed));
  }

  frame(): InputFrame {
    const gamepad = navigator.getGamepads?.()[0] ?? null;
    if (document.querySelector('[data-overlay]')) {
      this.pressed.clear();
      this.syncGamepadButtons(gamepad);
      return this.neutralFrame();
    }
    if (this.gamepadSuppressedUntilRelease) {
      const hasPressedButton = Boolean(gamepad?.buttons.some((button) => button.pressed));
      this.syncGamepadButtons(gamepad);
      if (!hasPressedButton) this.gamepadSuppressedUntilRelease = false;
      this.pressed.clear();
      return this.neutralFrame();
    }
    const deadzone = 0.2;
    let moveX = Number(this.actionDown('right')) - Number(this.actionDown('left'));
    let moveZ = Number(this.actionDown('down')) - Number(this.actionDown('up'));
    let usingGamepad = false;

    if (gamepad) {
      const axisX = Math.abs(gamepad.axes[0] ?? 0) > deadzone ? (gamepad.axes[0] ?? 0) : 0;
      const axisY = Math.abs(gamepad.axes[1] ?? 0) > deadzone ? (gamepad.axes[1] ?? 0) : 0;
      if (axisX || axisY) {
        moveX = axisX;
        moveZ = axisY;
        usingGamepad = true;
      }
    }

    const magnitude = Math.hypot(moveX, moveZ);
    if (magnitude > 1) {
      moveX /= magnitude;
      moveZ /= magnitude;
    }

    const keyboardSprint = this.actionDown('sprint');
    const gamepadSprint = Boolean(gamepad?.buttons[this.gamepadBindings.sprint]?.pressed);
    const sprintDown = keyboardSprint || gamepadSprint;
    if (this.settings.sprintToggle && sprintDown && !this.sprintKeyWasDown) {
      this.sprintLatched = !this.sprintLatched;
    }
    this.sprintKeyWasDown = sprintDown;

    const frame: InputFrame = {
      moveX,
      moveZ,
      sprint: this.settings.sprintToggle ? this.sprintLatched : sprintDown,
      intervenePressed: this.consumeAction('intervene') || this.gamepadPressed(gamepad, this.gamepadBindings.intervene),
      signaturePressed: this.consumeAction('signature') || this.gamepadPressed(gamepad, this.gamepadBindings.signature),
      pausePressed: this.consumeAction('pause') || this.gamepadPressed(gamepad, this.gamepadBindings.pause),
      usingGamepad,
    };
    this.pressed.clear();
    return frame;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clear);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('button, input, select, textarea, [contenteditable="true"]')
    ) {
      return;
    }
    if (Object.values(this.bindings).some((codes) => codes.includes(event.code))) event.preventDefault();
    if (!this.down.has(event.code)) this.pressed.add(event.code);
    this.down.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.down.delete(event.code);
  };

  private readonly clear = (): void => {
    this.down.clear();
    this.pressed.clear();
    this.sprintLatched = false;
  };

  private actionDown(action: GameAction): boolean {
    return this.bindings[action].some((code) => this.down.has(code));
  }

  private consumeAction(action: GameAction): boolean {
    return this.bindings[action].some((code) => this.pressed.has(code));
  }

  private gamepadPressed(gamepad: Gamepad | null, index: number): boolean {
    const now = Boolean(gamepad?.buttons[index]?.pressed);
    const before = this.gamepadPrevious.get(index) ?? false;
    this.gamepadPrevious.set(index, now);
    return now && !before;
  }

  private syncGamepadButtons(gamepad: Gamepad | null): void {
    this.gamepadPrevious.clear();
    gamepad?.buttons.forEach((button, index) => this.gamepadPrevious.set(index, button.pressed));
  }

  private neutralFrame(): InputFrame {
    return {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      intervenePressed: false,
      signaturePressed: false,
      pausePressed: false,
      usingGamepad: false,
    };
  }

  private normalizeBindings(bindings: KeyBindings | undefined): KeyBindings {
    const defaults = createDefaultBindings();
    if (!bindings) return defaults;
    for (const action of Object.keys(defaults) as GameAction[]) {
      const codes = bindings[action];
      if (Array.isArray(codes) && codes.some(Boolean)) defaults[action] = [...new Set(codes.filter(Boolean))];
    }
    return defaults;
  }
}
