import { Engine } from '@babylonjs/core/Engines/engine.js';
import { LibraryGame } from './game/LibraryGame';
import { TitleDiorama } from './game/TitleDiorama';
import { AudioManager } from './systems/AudioManager';
import { InputManager } from './systems/InputManager';
import { SaveService } from './systems/SaveService';
import { Telemetry } from './systems/Telemetry';
import type {
  BindingChange,
  GameAction,
  GamepadAction,
  GamepadBindingChange,
  RunOptions,
  RunStats,
  SettingsData,
  UpgradeChoice,
} from './types';
import { UIController, type UIActions } from './ui/UIController';

export class GameApp implements UIActions {
  private readonly engine: Engine;
  private readonly saves: SaveService;
  private readonly ui: UIController;
  private readonly input: InputManager;
  private readonly audio: AudioManager;
  private titleDiorama: TitleDiorama | null = null;
  private game: LibraryGame | null = null;
  private lastOptions: RunOptions | null = null;
  private screen: 'title' | 'playing' | 'summary' = 'title';
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    announcer: HTMLElement,
  ) {
    this.saves = new SaveService();
    const save = this.saves.snapshot;
    this.ui = new UIController(uiRoot, announcer, save);
    this.input = new InputManager(save.settings);
    this.audio = new AudioManager(save.settings, (cue) => this.ui.showSoundCue(cue));
    this.engine = new Engine(canvas, true, {
      adaptToDeviceRatio: true,
      preserveDrawingBuffer: false,
      stencil: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    this.ui.connect(this);
    this.ui.showLoading('Opening the Grand Reading Room…');
    this.installLifecycleHandlers();
  }

  async start(): Promise<void> {
    await document.fonts.ready.catch(() => undefined);
    this.showTitleWorld();
    this.engine.runRenderLoop(() => {
      if (this.disposed) return;
      if (this.game) this.game.update();
      else this.titleDiorama?.update();
    });
  }

  startRun(options: RunOptions): void {
    void this.audio.unlock();
    this.lastOptions = options;
    this.titleDiorama?.dispose();
    this.titleDiorama = null;
    this.game?.destroy();
    this.ui.showHud();
    this.screen = 'playing';
    this.audio.playRunMusic();
    const save = this.saves.snapshot;
    this.game = new LibraryGame(
      this.engine,
      options,
      save,
      save.settings,
      this.input,
      this.audio,
      new Telemetry(),
      {
        onHud: (state) => this.ui.updateHud(state),
        onPause: () => this.resume(),
        onDraft: (choices) => this.ui.showDraft(choices),
        onFinish: (stats) => this.finishRun(stats),
        onLabel: (message, tone) => this.ui.flashWorldLabel(message, tone),
        onTutorial: (title, body, key) => this.ui.showTutorial(title, body, key),
        onTutorialComplete: () => {
          this.ui.hideTutorial();
          if (this.lastOptions) this.lastOptions = { ...this.lastOptions, tutorial: false };
        },
      },
    );
    window.onkeydown = null;
  }

  resume(): void {
    if (!this.game || this.screen !== 'playing') return;
    const paused = !this.game.isPaused();
    this.game.setPaused(paused);
    if (paused) {
      this.ui.showPause();
      this.audio.pause();
    } else {
      this.ui.hidePause();
      this.audio.resume();
    }
  }

  restart(sameSeed: boolean): void {
    if (!this.lastOptions) return;
    const options = {
      ...this.lastOptions,
      seed: sameSeed ? this.lastOptions.seed : Math.floor(Math.random() * 0x7fffffff),
      tutorial: this.lastOptions.tutorial,
    };
    this.startRun(options);
  }

  quitToTitle(): void {
    this.game?.destroy();
    this.game = null;
    this.screen = 'title';
    this.showTitleWorld();
  }

  chooseUpgrade(choice: UpgradeChoice): void {
    this.ui.hideDraft();
    this.game?.chooseUpgrade(choice);
  }

  updateSettings(settings: Partial<SettingsData>): void {
    const save = this.saves.updateSettings(settings);
    this.ui.updateSave(save);
    this.input.updateSettings(save.settings);
    this.audio.updateSettings(save.settings);
  }

  rebindKey(action: GameAction, code: string): BindingChange {
    const change = this.input.rebind(action, code);
    const save = this.saves.updateSettings({ keyBindings: change.bindings });
    this.ui.updateSave(save);
    this.input.updateSettings(save.settings);
    return { ...change, bindings: save.settings.keyBindings };
  }

  rebindGamepad(action: GamepadAction, button: number): GamepadBindingChange {
    const change = this.input.rebindGamepad(action, button);
    const save = this.saves.updateSettings({ gamepadBindings: change.bindings });
    this.ui.updateSave(save);
    this.input.updateSettings(save.settings);
    return { ...change, bindings: save.settings.gamepadBindings };
  }

  restoreSettings(): void {
    const save = this.saves.restoreSettings();
    this.ui.updateSave(save);
    this.input.updateSettings(save.settings);
    this.audio.updateSettings(save.settings);
  }

  resetProgress(): void {
    const save = this.saves.reset();
    this.ui.updateSave(save);
    this.input.updateSettings(save.settings);
    this.audio.updateSettings(save.settings);
    this.quitToTitle();
  }

  suppressGameplayInputUntilRelease(): void {
    this.input.suppressUntilRelease();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.stopRenderLoop();
    this.titleDiorama?.dispose();
    this.game?.destroy();
    this.ui.destroy();
    this.input.destroy();
    this.audio.destroy();
    this.engine.dispose();
  }

  private finishRun(stats: RunStats): void {
    const completedStats: RunStats = {
      ...stats,
      difficulty: stats.difficulty ?? this.lastOptions?.difficulty ?? 'classic',
    };
    const save = this.saves.recordRun(completedStats);
    this.ui.updateSave(save);
    this.ui.showSummary(completedStats, save);
    this.screen = 'summary';
  }

  private showTitleWorld(): void {
    const save = this.saves.snapshot;
    this.ui.updateSave(save);
    this.ui.showTitle();
    this.titleDiorama?.dispose();
    this.titleDiorama = new TitleDiorama(this.engine, save.settings.reducedMotion);
    this.audio.playMenuMusic();
  }

  private installLifecycleHandlers(): void {
    const resize = (): void => this.engine.resize();
    window.addEventListener('resize', resize);
    window.addEventListener('beforeunload', () => this.destroy(), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && this.screen === 'playing' && !this.game.isPaused()) this.resume();
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }
}
