import { GENRE_BY_ID, KIDS, LIBRARIANS, PASSIVES, TOOLS } from '../data/content';
import { ACHIEVEMENTS } from '../data/achievements';
import { MAPS } from '../data/maps';
import type {
  BindingChange,
  Difficulty,
  GameAction,
  GamepadAction,
  GamepadBindingChange,
  GamepadBindings,
  HudState,
  KeyBindings,
  LibrarianId,
  MapId,
  RunMode,
  RunOptions,
  RunStats,
  SaveData,
  SettingsData,
  UpgradeChoice,
} from '../types';
import { dailySeed } from '../systems/Rng';

export interface UIActions {
  startRun(options: RunOptions): void;
  resume(): void;
  restart(sameSeed: boolean): void;
  quitToTitle(): void;
  chooseUpgrade(choice: UpgradeChoice): void;
  updateSettings(settings: Partial<SettingsData>): void;
  rebindKey(action: GameAction, code: string): BindingChange;
  rebindGamepad(action: GamepadAction, button: number): GamepadBindingChange;
  restoreSettings(): void;
  resetProgress(): void;
  suppressGameplayInputUntilRelease(): void;
}

const modeLabel: Record<RunMode, string> = {
  quick: 'Quick shift · 8 min',
  standard: 'Standard shift · 15 min',
  endless: 'Endless night',
  daily: 'Daily schedule',
};

const difficultyLabel: Record<Difficulty, { name: string; description: string }> = {
  calm: { name: 'Calm', description: 'Gentler arrivals' },
  classic: { name: 'Classic', description: 'The intended shift' },
  heated: { name: 'Heated', description: 'Faster, louder nights' },
};

const actionLabel: Record<GameAction, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  sprint: 'Sprint',
  intervene: 'Intervene',
  signature: 'Signature tool',
  pause: 'Pause',
};

const bindableActions = Object.keys(actionLabel) as GameAction[];
const gamepadActions: GamepadAction[] = ['sprint', 'intervene', 'signature', 'pause'];

interface DebugApi {
  timeScale: number;
  invulnerable: boolean;
  awardXp(amount?: number): void;
  spawn(archetype?: string, count?: number): void;
  setChaos(amount: number): void;
  finish(won?: boolean): void;
  snapshot(): unknown;
}

export class UIController {
  private actions: UIActions | null = null;
  private save: SaveData;
  private selectedMode: RunMode = 'standard';
  private selectedDifficulty: Difficulty = 'classic';
  private selectedMap: MapId = 'grand-reading-room';
  private selectedLibrarian: LibrarianId = 'head-librarian';
  private hudLastSecond = -1;
  private hudElements = new Map<string, HTMLElement>();
  private latestStats: RunStats | null = null;
  private soundCueTimer = 0;
  private bindingCaptureCleanup: (() => void) | null = null;
  private gamepadCaptureCleanup: (() => void) | null = null;
  private focusBeforePanel: HTMLElement | null = null;
  private focusBeforeConfirm: HTMLElement | null = null;
  private gamepadUiFrame = 0;
  private announcementFrame = 0;
  private gamepadUiPrevious = new Map<number, boolean>();
  private gamepadUiSurface: HTMLElement | null = null;
  private gamepadNavigationHeld: 'up' | 'down' | 'left' | 'right' | null = null;
  private gamepadNavigationRepeatAt = 0;
  private destroyed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly announcer: HTMLElement,
    save: SaveData,
  ) {
    this.save = save;
    this.selectedMode = save.totalRuns === 0 ? 'quick' : 'standard';
    this.selectedDifficulty = save.settings.defaultDifficulty;
    document.documentElement.style.setProperty('--ui-scale', String(save.settings.uiScale));
    this.applySettingsClasses(save.settings);
    this.root.addEventListener('keydown', this.handleDialogKeyboard);
    this.gamepadUiFrame = requestAnimationFrame(this.pollGamepadUi);
  }

  connect(actions: UIActions): void {
    this.actions = actions;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelBindingCapture();
    this.cancelGamepadCapture();
    cancelAnimationFrame(this.gamepadUiFrame);
    cancelAnimationFrame(this.announcementFrame);
    window.clearTimeout(this.soundCueTimer);
    this.root.removeEventListener('keydown', this.handleDialogKeyboard);
    window.onkeydown = null;
    this.gamepadUiPrevious.clear();
    this.gamepadUiSurface = null;
    this.hudElements.clear();
    this.actions = null;
  }

  updateSave(save: SaveData): void {
    const previousRuns = this.save.totalRuns;
    this.save = save;
    if (save.totalRuns === 0 && previousRuns > 0) this.selectedMode = 'quick';
    this.selectedDifficulty = save.settings.defaultDifficulty;
    this.applySettingsClasses(save.settings);
    if (!save.unlockedMaps.includes(this.selectedMap)) this.selectedMap = 'grand-reading-room';
    if (!save.unlockedLibrarians.includes(this.selectedLibrarian)) this.selectedLibrarian = 'head-librarian';
  }

  showLoading(message = 'Opening the library…'): void {
    this.root.innerHTML = `<section class="loading-screen screen"><div class="loader-mark" aria-hidden="true">L</div><p>${message}</p></section>`;
  }

  showTitle(): void {
    this.root.innerHTML = `
      <section class="title-screen screen" aria-labelledby="game-title">
        <div class="title-brand">
          <p class="eyebrow">Morrow & Finch Public Library · closing shift</p>
          <h1 id="game-title"><span>The</span> Librarian</h1>
          <p class="subtitle">After Hours</p>
          <p class="title-copy">Restore order before the final bell.</p>
        </div>
        <div class="start-console" aria-label="Start a shift">
          <div class="selection-row" role="radiogroup" aria-label="Shift length">
            ${(['quick', 'standard', 'daily', 'endless'] as RunMode[])
              .map(
                (mode) => `<button type="button" role="radio" aria-checked="${mode === this.selectedMode}" class="choice-tab ${mode === this.selectedMode ? 'selected' : ''}" data-mode="${mode}">
                  ${modeLabel[mode]}
                </button>`,
              )
              .join('')}
          </div>
          <div class="difficulty-row" role="radiogroup" aria-label="Library intensity">
            <span class="field-label">Intensity</span>
            ${(['calm', 'classic', 'heated'] as Difficulty[])
              .map(
                (difficulty) => `<button type="button" role="radio" aria-checked="${difficulty === this.selectedDifficulty}" class="difficulty-choice ${difficulty === this.selectedDifficulty ? 'selected' : ''}" data-difficulty="${difficulty}" title="${difficultyLabel[difficulty].description}">
                  <strong>${difficultyLabel[difficulty].name}</strong><small>${difficultyLabel[difficulty].description}</small>
                </button>`,
              )
              .join('')}
          </div>
          <div class="selection-grid">
            <div>
              <p class="field-label">Librarian on duty</p>
              <div class="portrait-options" role="radiogroup" aria-label="Librarian on duty">
                ${Object.values(LIBRARIANS)
                  .map((librarian) => {
                    const unlocked = this.save.unlockedLibrarians.includes(librarian.id);
                    return `<button type="button" role="radio" aria-checked="${librarian.id === this.selectedLibrarian}" class="portrait-card ${librarian.id === this.selectedLibrarian ? 'selected' : ''}" data-librarian="${librarian.id}" ${unlocked ? '' : 'disabled'}>
                      <span class="portrait-swatch" style="--portrait:${librarian.color}">${librarian.name.slice(0, 1)}</span>
                      <span><strong>${librarian.name}</strong><small>${unlocked ? librarian.title : 'Locked in catalog'}</small></span>
                    </button>`;
                  })
                  .join('')}
              </div>
            </div>
            <div>
              <p class="field-label">Tonight's floor</p>
              <div class="map-options" role="radiogroup" aria-label="Library floor">
                ${Object.values(MAPS)
                  .map((map) => {
                    const unlocked = this.save.unlockedMaps.includes(map.id);
                    return `<button type="button" role="radio" aria-checked="${map.id === this.selectedMap}" class="map-card ${map.id === this.selectedMap ? 'selected' : ''}" data-map="${map.id}" ${unlocked ? '' : 'disabled'}>
                      <span class="map-miniature" style="--floor:${map.floorColor};--wall:${map.wallColor}"><i></i><i></i><i></i></span>
                      <span><strong>${map.name}</strong><small>${unlocked ? map.subtitle : 'Complete a standard shift'}</small></span>
                    </button>`;
                  })
                  .join('')}
              </div>
            </div>
          </div>
          <button class="primary-action" data-action="start"><span>${this.save.totalRuns === 0 ? 'Start first shift' : 'Start shift'}</span><kbd>Enter</kbd></button>
          <nav class="title-links" aria-label="Game information">
            <button data-panel="help">How to play</button>
            <button data-panel="catalog">Catalog <span>${this.save.stamps} stamps</span></button>
            <button data-panel="settings">Settings</button>
          </nav>
        </div>
        <p class="build-mark">2.0 development branch · Babylon 3D</p>
      </section>`;
    this.bindTitle();
    this.announce('Title screen. Choose a shift, librarian, and map.');
  }

  showHud(): void {
    this.root.innerHTML = `
      <section class="hud" aria-label="Shift status">
        <div class="hud-top">
          <article class="objective-panel">
            <p class="hud-kicker">Current task</p>
            <strong data-hud="objective-title">Keep the library orderly</strong>
            <div class="objective-track"><i data-hud="objective-progress"></i></div>
            <small data-hud="objective-detail">Watch for trouble</small>
          </article>
          <article class="chaos-panel" data-chaos-state="orderly">
            <div class="chaos-heading"><span>Library condition</span><strong data-hud="chaos-value">0%</strong></div>
            <div class="chaos-track"><i data-hud="chaos-fill"></i><b></b><b></b><b></b></div>
            <div class="chaos-source"><span data-hud="chaos-source">Orderly</span><small data-hud="chaos-breakdown">Clutter 0 · Noise 0 · Disorder 0</small></div>
            <div class="last-call hidden" data-hud="last-call">LAST CALL · <span>10.0</span></div>
          </article>
          <article class="shift-panel">
            <p data-hud="phase">Opening</p>
            <strong data-hud="timer">15:00</strong>
            <small data-hud="event">The doors are quiet</small>
          </article>
        </div>
        <div class="world-label" data-hud="world-label" aria-live="polite"></div>
        <div class="tutorial-card hidden" data-hud="tutorial"></div>
        <canvas class="minimap" data-hud="minimap" width="180" height="126" aria-label="Library minimap"></canvas>
        <div class="hud-bottom">
          <article class="carry-panel">
            <p class="hud-kicker">Carry rack</p>
            <div class="carry-rack" data-hud="carry"></div>
            <small data-hud="combo">Start a sorting streak</small>
          </article>
          <article class="ability-panel">
            <button class="ability-orb" data-action="signature" aria-label="Use signature tool" aria-keyshortcuts="${this.ariaKeyShortcuts(this.save.settings.keyBindings.signature)}">
              <span data-hud="ability-icon">SHH</span>
              <i data-hud="ability-cooldown"></i>
            </button>
            <div><strong data-hud="ability-name">Shush Wave</strong><small><kbd>${this.keyName(this.save.settings.keyBindings.signature[0] ?? 'KeyQ')}</kbd> / LB · signature</small></div>
          </article>
          <article class="player-panel">
            <div class="level-row"><strong data-hud="level">Level 1</strong><span data-hud="xp-label">0 / 100 XP</span></div>
            <div class="xp-track"><i data-hud="xp-fill"></i></div>
            <div class="stamina-row"><span>Stamina</span><div><i data-hud="stamina-fill"></i></div><kbd>Shift</kbd></div>
          </article>
        </div>
        <button class="pause-button" data-action="pause" aria-label="Pause game" aria-keyshortcuts="${this.ariaKeyShortcuts(this.save.settings.keyBindings.pause)}">II</button>
        ${this.debugPanelMarkup()}
      </section>`;
    this.root.querySelector('[data-action="pause"]')?.addEventListener('click', () => this.actions?.resume());
    this.root.querySelector('[data-action="signature"]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('librarian:signature'));
    });
    this.bindDebugControls();
    this.collectHudElements();
  }

  updateHud(state: HudState): void {
    if (this.hudElements.size === 0) return;
    this.setHudText('chaos-value', `${Math.round(state.chaos.total)}%`);
    this.setHudStyle('chaos-fill', 'width', `${state.chaos.total}%`);
    this.setHudText('chaos-source', `${this.pretty(state.chaos.threshold)} · mostly ${state.chaos.dominant}`);
    this.setHudText(
      'chaos-breakdown',
      `Clutter ${Math.round(state.chaos.clutter)} · Noise ${Math.round(state.chaos.noise)} · Disorder ${Math.round(state.chaos.disorder)}`,
    );
    this.hudElements.get('chaos-value')?.closest('.chaos-panel')?.setAttribute('data-chaos-state', state.chaos.threshold);
    this.toggleHud('last-call', state.chaos.threshold === 'last-call');
    const lastCall = this.hudElements.get('last-call')?.querySelector('span');
    if (lastCall) lastCall.textContent = state.chaos.lastCallRemaining.toFixed(1);

    const remaining = Math.max(0, state.duration - state.elapsed);
    this.setHudText('timer', state.duration === Infinity ? this.formatTime(state.elapsed) : this.formatTime(remaining));
    this.setHudText('phase', this.pretty(state.phase));
    this.setHudText('event', state.eventLabel ? `${state.eventLabel} · ${Math.ceil(state.eventRemaining)}s` : 'Listen for the next announcement');
    this.setHudText('level', `Level ${state.level}`);
    this.setHudText('xp-label', `${state.xp} / ${state.xpToNext} XP`);
    this.setHudStyle('xp-fill', 'width', `${Math.min(100, (state.xp / state.xpToNext) * 100)}%`);
    this.setHudStyle('stamina-fill', 'width', `${(state.stamina / state.maxStamina) * 100}%`);
    this.setHudStyle(
      'ability-cooldown',
      'transform',
      `scaleY(${Math.max(0, Math.min(1, state.activeToolCooldown / Math.max(0.01, state.activeToolCooldownMax)))})`,
    );
    this.setHudText('ability-icon', TOOLS[state.activeTool].icon);
    this.setHudText('ability-name', TOOLS[state.activeTool].name);
    this.setHudText('combo', state.combo > 1 ? `Dewey Chain ×${state.combo}` : 'Build a sorting streak');

    const carry = this.hudElements.get('carry');
    if (carry) {
      carry.innerHTML = Array.from({ length: state.carryCapacity }, (_, index) => {
        const genreId = state.carriedGenres[index];
        const genre = genreId ? GENRE_BY_ID[genreId] : null;
        return `<span class="book-slot ${genre ? 'filled' : ''}" ${genre ? `style="--book:${genre.color}" title="${genre.name}"` : ''}>${genre?.icon ?? ''}</span>`;
      }).join('');
    }

    if (state.objective) {
      this.setHudText('objective-title', state.objective.title);
      this.setHudText('objective-detail', `${Math.floor(state.objective.progress)} / ${state.objective.target} · ${Math.ceil(state.objective.remaining)}s`);
      this.setHudStyle('objective-progress', 'width', `${Math.min(100, (state.objective.progress / state.objective.target) * 100)}%`);
    } else {
      this.setHudText('objective-title', 'Keep the library orderly');
      this.setHudText('objective-detail', `${state.kids} active visitors`);
      this.setHudStyle('objective-progress', 'width', '0%');
    }

    const second = Math.floor(state.elapsed);
    if (second !== this.hudLastSecond) {
      this.hudLastSecond = second;
      this.drawMinimap(state);
    }
  }

  showTutorial(title: string, body: string, key: string): void {
    const tutorial = this.hudElements.get('tutorial');
    if (!tutorial) return;
    tutorial.innerHTML = `<span>${title}</span><p>${body}</p><kbd>${key}</kbd>`;
    tutorial.classList.remove('hidden');
    this.announce(`${title}. ${body}`);
  }

  hideTutorial(): void {
    this.hudElements.get('tutorial')?.classList.add('hidden');
  }

  flashWorldLabel(message: string, tone: 'good' | 'warning' | 'event' = 'event'): void {
    const label = this.hudElements.get('world-label');
    if (!label) return;
    label.textContent = message;
    label.dataset.tone = tone;
    label.classList.remove('visible');
    requestAnimationFrame(() => label.classList.add('visible'));
    window.setTimeout(() => label.classList.remove('visible'), 2200);
    this.announce(message);
  }

  showSoundCue(cue: string): void {
    if (!this.save.settings.soundCues) return;
    let caption = this.root.querySelector<HTMLElement>('[data-sound-caption]');
    if (!caption) {
      this.root.insertAdjacentHTML(
        'beforeend',
        '<div class="sound-caption" data-sound-caption role="status" aria-live="polite" aria-atomic="true"></div>',
      );
      caption = this.root.querySelector<HTMLElement>('[data-sound-caption]');
    }
    if (!caption) return;
    window.clearTimeout(this.soundCueTimer);
    caption.textContent = `[${cue}]`;
    caption.classList.remove('visible');
    requestAnimationFrame(() => caption?.classList.add('visible'));
    this.soundCueTimer = window.setTimeout(() => caption?.classList.remove('visible'), 1800);
  }

  showPause(): void {
    this.root.querySelectorAll('[data-overlay="pause"]').forEach((overlay) => overlay.remove());
    this.root.insertAdjacentHTML(
      'beforeend',
      `<section class="modal-layer pause-layer" data-overlay="pause" aria-modal="true" role="dialog" aria-labelledby="pause-title">
        <div class="modal-panel pause-panel">
          <p class="eyebrow">The clock is stopped</p>
          <h2 id="pause-title">Quiet moment</h2>
          <button class="primary-action" data-action="resume">Resume shift <kbd>${this.keyName(this.save.settings.keyBindings.pause[0] ?? 'Escape')}</kbd></button>
          <div class="modal-actions">
            <button data-panel="settings">Settings</button>
            <button data-panel="help">Controls</button>
            <button data-action="restart">Restart shift</button>
            <button data-action="quit">Return to title</button>
          </div>
        </div>
      </section>`,
    );
    this.bindOverlay();
    this.focusDialog(this.root.querySelector<HTMLElement>('[data-overlay="pause"]'));
  }

  hidePause(): void {
    const overlays = this.root.querySelectorAll('[data-overlay="pause"]');
    if (overlays.length === 0) return;
    overlays.forEach((overlay) => overlay.remove());
    this.actions?.suppressGameplayInputUntilRelease();
  }

  showDraft(choices: UpgradeChoice[]): void {
    // Several XP awards can resolve in one simulation step. Keep only the newest
    // draft surface so an older modal can never remain underneath it.
    this.root.querySelectorAll('[data-overlay="draft"]').forEach((overlay) => overlay.remove());
    this.root.insertAdjacentHTML(
      'beforeend',
      `<section class="modal-layer draft-layer" data-overlay="draft" aria-modal="true" role="dialog" aria-labelledby="draft-title">
        <div class="draft-shell">
          <p class="eyebrow">The clock is stopped · stamina restored</p>
          <h2 id="draft-title">Choose what happens next</h2>
          <div class="draft-grid">
            ${choices
              .map(
                (choice, index) => `<button class="upgrade-card" data-choice="${index}">
                  <span class="upgrade-number">0${index + 1}</span>
                  <span class="upgrade-icon">${choice.icon}</span>
                  <span class="upgrade-type">${choice.kind}${choice.evolutionReady ? ' · evolution ready' : ''}</span>
                  <strong>${choice.name}</strong>
                  <p>${choice.description}</p>
                  <small>Rank ${choice.currentRank} → ${choice.currentRank + 1} / ${choice.maxRank}</small>
                  ${this.evolutionHint(choice)}
                </button>`,
              )
              .join('')}
          </div>
        </div>
      </section>`,
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const choice = choices[Number(button.dataset.choice)];
        if (choice) this.actions?.chooseUpgrade(choice);
      });
    });
    this.focusDialog(this.root.querySelector<HTMLElement>('[data-overlay="draft"]'));
    this.announce('Level up. Choose one of three upgrades.');
  }

  hideDraft(): void {
    const overlays = this.root.querySelectorAll('[data-overlay="draft"]');
    if (overlays.length === 0) return;
    overlays.forEach((overlay) => overlay.remove());
    this.actions?.suppressGameplayInputUntilRelease();
  }

  showSummary(stats: RunStats, save: SaveData): void {
    this.latestStats = stats;
    this.save = save;
    const points = stats.timeline
      .map((entry, index) => {
        const x = stats.timeline.length <= 1 ? 0 : (index / (stats.timeline.length - 1)) * 300;
        const y = 92 - (entry.chaos / 100) * 84;
        return `${x},${y}`;
      })
      .join(' ');
    const mostUsedTool = stats.mostUsedTool
      ?? (Object.entries(stats.toolUses ?? {}) as Array<[keyof typeof TOOLS, number]>).sort((left, right) => right[1] - left[1])[0]?.[0];
    const mostUsedToolName = mostUsedTool ? TOOLS[mostUsedTool].name : TOOLS[LIBRARIANS[stats.librarianId].startingTool].name;
    this.root.innerHTML = `
      <section class="summary-screen screen ${stats.won ? 'won' : 'lost'}">
        <div class="summary-heading">
          <p class="eyebrow">Shift report · ${MAPS[stats.mapId].name} · ${difficultyLabel[stats.difficulty ?? 'classic'].name}</p>
          <h1>${stats.won ? 'Order restored' : 'The library closed early'}</h1>
          <p>${stats.won ? 'The final bell rang on a library still standing.' : stats.failureReason ?? 'Chaos took the floor.'}</p>
        </div>
        <div class="summary-layout">
          <article class="report-card graph-card">
            <header><span>Chaos over time</span><strong>Peak ${Math.round(stats.maxChaos)}%</strong></header>
            <svg viewBox="0 0 300 100" role="img" aria-label="Chaos timeline"><path d="M0 92 H300"/><polyline points="${points || '0,92'}"/></svg>
            <small>${this.formatTime(stats.elapsed)} on duty · seed ${stats.seed}</small>
          </article>
          <article class="report-card stat-ledger">
            <dl>
              <div><dt>Books returned</dt><dd>${stats.booksShelved}</dd></div>
              <div><dt>Kids calmed</dt><dd>${stats.kidsCalmed}</dd></div>
              <div><dt>Tasks completed</dt><dd>${stats.objectivesCompleted}</dd></div>
              <div><dt>Best Dewey Chain</dt><dd>×${stats.bestCombo}</dd></div>
            </dl>
          </article>
          <article class="report-card stamp-card">
            <p class="hud-kicker">Tonight's pay</p><strong>+${stats.stampsEarned}</strong><span>Catalog stamps</span>
            <small>${save.stamps} total · new possibilities unlock automatically</small>
          </article>
          <article class="report-card build-card">
            <p class="hud-kicker">Build identity</p>
            <strong>${stats.evolutions[0] ?? 'Practical generalist'}</strong>
            <p>${stats.evolutions.length ? stats.evolutions.join(' · ') : 'No evolution completed this shift.'}</p>
            <small>Most used: ${mostUsedToolName} · Save of the shift: ${stats.maxChaos >= 90 ? 'Recovered from critical chaos' : 'Kept the room under control'}</small>
          </article>
        </div>
        <div class="summary-actions">
          <button class="primary-action" data-action="retry">Retry same schedule</button>
          <button data-action="new">New shift</button>
          <button data-panel="catalog">Open catalog</button>
        </div>
      </section>`;
    this.root.querySelector('[data-action="retry"]')?.addEventListener('click', () => this.actions?.restart(true));
    this.root.querySelector('[data-action="new"]')?.addEventListener('click', () => this.actions?.quitToTitle());
    this.root.querySelector('[data-panel="catalog"]')?.addEventListener('click', () => this.showCatalog(true));
    this.announce(stats.won ? 'Order restored. Shift complete.' : 'The library closed early.');
  }

  private bindTitle(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedMode = button.dataset.mode as RunMode;
        this.updateTitleRadio('[data-mode]', 'mode', this.selectedMode);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedDifficulty = button.dataset.difficulty as Difficulty;
        this.actions?.updateSettings({ defaultDifficulty: this.selectedDifficulty });
        this.updateTitleRadio('[data-difficulty]', 'difficulty', this.selectedDifficulty);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-librarian]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedLibrarian = button.dataset.librarian as LibrarianId;
        this.updateTitleRadio('[data-librarian]', 'librarian', this.selectedLibrarian);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedMap = button.dataset.map as MapId;
        this.updateTitleRadio('[data-map]', 'map', this.selectedMap);
      });
    });
    this.root.querySelector('[data-action="start"]')?.addEventListener('click', () => this.beginSelectedRun());
    this.root.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((button) => {
      button.addEventListener('click', () => this.openPanel(button.dataset.panel ?? 'help'));
    });
    window.onkeydown = (event) => {
      const target = event.target;
      const isInteractive = target instanceof HTMLElement && Boolean(target.closest('button, a, input, select, textarea'));
      if (event.code === 'Enter' && !isInteractive && !this.root.querySelector('.modal-layer')) this.beginSelectedRun();
    };
  }

  private beginSelectedRun(): void {
    this.actions?.suppressGameplayInputUntilRelease();
    this.actions?.startRun({
      mode: this.selectedMode,
      difficulty: this.selectedDifficulty,
      mapId: this.selectedMap,
      librarianId: this.selectedLibrarian,
      seed: this.selectedMode === 'daily' ? dailySeed() : Math.floor(Math.random() * 0x7fffffff),
      tutorial: this.save.totalRuns === 0,
    });
  }

  private bindOverlay(): void {
    this.root.querySelector('[data-action="resume"]')?.addEventListener('click', () => this.actions?.resume());
    this.root.querySelector('[data-action="restart"]')?.addEventListener('click', () => this.confirmAction('Restart this shift?', () => this.actions?.restart(true)));
    this.root.querySelector('[data-action="quit"]')?.addEventListener('click', () => this.confirmAction('Leave this shift?', () => this.actions?.quitToTitle()));
    this.root.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((button) => {
      button.addEventListener('click', () => this.openPanel(button.dataset.panel ?? 'help'));
    });
  }

  private openPanel(panel: string): void {
    if (panel === 'settings') this.showSettings();
    else if (panel === 'catalog') this.showCatalog(false);
    else this.showHelp();
  }

  private showHelp(): void {
    this.addPanel(
      'Field guide',
      `<div class="help-layout">
        <div><p class="field-label">Your shift</p><h3>Move with purpose</h3><p>Pick up loose books automatically, then carry them to shelves with the same color and symbol. Every resolved problem lowers Chaos.</p></div>
        <dl class="control-list">
          <div><dt>Move</dt><dd>${(['up', 'left', 'down', 'right'] as GameAction[]).map((action) => `<kbd>${this.keyName(this.save.settings.keyBindings[action][0] ?? '')}</kbd>`).join('')} <span>or left stick</span></dd></div>
          <div><dt>Sprint</dt><dd>${this.bindingKeys('sprint')} <span>or right trigger</span></dd></div>
          <div><dt>Intervene</dt><dd>${this.bindingKeys('intervene')} <span>or A</span></dd></div>
          <div><dt>Signature</dt><dd>${this.bindingKeys('signature')} <span>or LB</span></dd></div>
          <div><dt>Pause</dt><dd>${this.bindingKeys('pause')} <span>or Menu</span></dd></div>
        </dl>
        <div class="guide-grid">
          <article><strong>Clutter</strong><p>Loose and carried books. Return them.</p></article>
          <article><strong>Noise</strong><p>Active disruptions. Calm the loudest area.</p></article>
          <article><strong>Disorder</strong><p>Forts, spills, and failed tasks. Intervene nearby.</p></article>
        </div>
        <p class="guide-note">At 100 Chaos, Last Call gives you ten seconds to recover. The shift only ends if the room stays out of control.</p>
      </div>`,
    );
  }

  private showSettings(): void {
    const settings = this.save.settings;
    this.addPanel(
      'Settings',
      `<form class="settings-form" aria-label="Game settings">
        <section class="settings-section" aria-labelledby="audio-settings-title">
          <header><span>01</span><div><h3 id="audio-settings-title">Audio desk</h3><p>Mix each part of the library independently.</p></div></header>
          <div class="settings-group">
            ${this.toggleSetting('Mute all audio', 'muted', settings.muted, 'Sound captions remain visible when audio is muted.')}
            ${this.rangeSetting('Music', 'musicVolume', settings.musicVolume, 0, 1, 0.05)}
            ${this.rangeSetting('Sound effects', 'sfxVolume', settings.sfxVolume, 0, 1, 0.05)}
            ${this.rangeSetting('Interface sounds', 'uiVolume', settings.uiVolume, 0, 1, 0.05)}
            ${this.rangeSetting('Ambience', 'ambienceVolume', settings.ambienceVolume, 0, 1, 0.05)}
            ${this.toggleSetting('Sound captions', 'soundCues', settings.soundCues, 'Shows short captions for meaningful audio cues and nearby sounds.')}
          </div>
        </section>
        <section class="settings-section" aria-labelledby="control-settings-title">
          <header><span>02</span><div><h3 id="control-settings-title">Key desk</h3><p>Select a binding, then press a new key. Conflicts swap automatically.</p></div></header>
          <div class="keybind-grid" role="group" aria-labelledby="control-settings-title">
            ${bindableActions.map((action) => this.keybindSetting(action, settings.keyBindings)).join('')}
          </div>
          <div class="gamepad-bindings" role="group" aria-label="Gamepad buttons">
            <p class="field-label">Gamepad · left stick moves</p>
            <div class="gamepad-bind-grid">
              ${gamepadActions.map((action) => this.gamepadSetting(action, settings.gamepadBindings)).join('')}
            </div>
          </div>
          <p class="binding-status" data-binding-status role="status" aria-live="polite">All keys are available.</p>
          <div class="settings-group compact-settings">
            ${this.toggleSetting('Toggle sprint', 'sprintToggle', settings.sprintToggle, 'Press once to sprint instead of holding the key.')}
          </div>
        </section>
        <section class="settings-section" aria-labelledby="access-settings-title">
          <header><span>03</span><div><h3 id="access-settings-title">Reading comfort</h3><p>Adjust presentation without changing the rules.</p></div></header>
          <div class="settings-group">
            ${this.rangeSetting('Interface scale', 'uiScale', settings.uiScale, 0.85, 1.35, 0.05, 'scale')}
            ${this.toggleSetting('Color-safe symbols', 'colorSafe', settings.colorSafe, 'Adds stronger patterns and symbols so color is never the only cue.')}
            ${this.toggleSetting('High contrast', 'highContrast', settings.highContrast, 'Strengthens outlines, controls, and text contrast.')}
            ${this.toggleSetting('Reduced motion', 'reducedMotion', settings.reducedMotion, 'Removes camera pushes, bobbing, and large transitions.')}
            ${this.toggleSetting('Reduced flashes', 'reducedFlash', settings.reducedFlash, 'Uses steady warnings instead of pulsing ones.')}
          </div>
        </section>
        <div class="settings-footer">
          <button type="button" data-action="restore-settings">Restore defaults</button>
          <button type="button" class="danger-text" data-action="reset-progress">Reset all progress</button>
        </div>
      </form>`,
    );
    this.root.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.setting as keyof SettingsData;
        const value = input.type === 'checkbox' ? input.checked : Number(input.value);
        this.actions?.updateSettings({ [key]: value });
        const output = input.closest('.range-setting')?.querySelector<HTMLOutputElement>('output');
        if (output && typeof value === 'number') output.textContent = this.settingValue(value, input.dataset.format);
        if (key === 'soundCues' && value === false) this.root.querySelector('[data-sound-caption]')?.remove();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-bind-action]').forEach((button) => {
      button.addEventListener('click', () => this.beginBindingCapture(button.dataset.bindAction as GameAction, button));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-gamepad-action]').forEach((button) => {
      button.addEventListener('click', () => this.beginGamepadCapture(button.dataset.gamepadAction as GamepadAction, button));
    });
    this.root.querySelector('[data-action="restore-settings"]')?.addEventListener('click', () => {
      this.cancelBindingCapture();
      this.cancelGamepadCapture();
      this.actions?.restoreSettings();
      this.closePanel();
      this.showSettings();
      this.announce('Settings restored to defaults.');
    });
    this.root.querySelector('[data-action="reset-progress"]')?.addEventListener('click', () =>
      this.confirmAction('Reset every unlock and statistic?', () => this.actions?.resetProgress()),
    );
  }

  private showCatalog(fromSummary: boolean): void {
    const toolEntries = Object.values(TOOLS)
      .map((tool) => `<li class="catalog-item ${this.save.unlockedTools.includes(tool.id) ? '' : 'locked'}"><span>${tool.icon}</span><div><strong>${this.save.unlockedTools.includes(tool.id) ? tool.name : 'Undiscovered tool'}</strong><small>${this.save.unlockedTools.includes(tool.id) ? tool.description : 'Complete challenges during a shift to reveal this entry.'}</small></div></li>`)
      .join('');
    const achievementEntries = ACHIEVEMENTS
      .map((achievement) => {
        const unlocked = this.save.achievements.includes(achievement.id);
        return `<li class="achievement-item ${unlocked ? '' : 'locked'}"><span aria-hidden="true">${unlocked ? '✓' : '—'}</span><div><strong>${achievement.name}</strong><small>${achievement.description}</small></div></li>`;
      })
      .join('');
    const lifetime = this.save.lifetimeStats;
    this.addPanel(
      'The catalog',
      `<div class="catalog-head"><div><span>${this.save.stamps}</span><small>Catalog stamps</small></div><p>Stamps record service, not purchased power. New entries unlock new strategies.</p></div>
      <div class="catalog-stats"><span>${this.save.totalRuns} shifts</span><span>${lifetime.victories} victories</span><span>${this.save.totalBooksShelved} books returned</span><span>${lifetime.totalKidsCalmed} visitors calmed</span><span>${lifetime.totalObjectivesCompleted} tasks</span><span>Best chain ×${lifetime.highestCombo}</span><span>${this.formatTime(lifetime.totalPlaySeconds)} on duty</span><span>${this.save.achievements.length}/${ACHIEVEMENTS.length} achievements</span></div>
      <h3 class="catalog-section-title">Tools</h3>
      <ul class="catalog-list">${toolEntries}</ul>
      <h3 class="catalog-section-title">Achievements</h3>
      <ul class="achievement-list">${achievementEntries}</ul>
      ${fromSummary ? '<button class="primary-action catalog-return" data-action="catalog-return">Return to report</button>' : ''}`,
    );
    this.root.querySelector('[data-action="catalog-return"]')?.addEventListener('click', () => {
      this.closePanel();
      if (this.latestStats) this.showSummary(this.latestStats, this.save);
    });
  }

  private addPanel(title: string, content: string): void {
    this.cancelBindingCapture();
    this.cancelGamepadCapture();
    this.root.querySelector('[data-overlay="panel"]')?.remove();
    this.focusBeforePanel = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.insertAdjacentHTML(
      'beforeend',
      `<section class="modal-layer panel-layer" data-overlay="panel" aria-modal="true" role="dialog" aria-labelledby="panel-title">
        <div class="modal-panel detail-panel" role="document"><header><p class="eyebrow">Librarian's desk</p><h2 id="panel-title">${title}</h2><button type="button" data-action="close-panel" aria-label="Close ${title}">×</button></header>${content}</div>
      </section>`,
    );
    this.root.querySelector('[data-action="close-panel"]')?.addEventListener('click', () => this.closePanel());
    this.focusDialog(this.root.querySelector<HTMLElement>('[data-overlay="panel"]'));
  }

  private closePanel(): void {
    this.cancelBindingCapture();
    this.cancelGamepadCapture();
    const panel = this.root.querySelector('[data-overlay="panel"]');
    if (!panel) return;
    panel.remove();
    this.actions?.suppressGameplayInputUntilRelease();
    this.applySettingsClasses(this.save.settings);
    const focusTarget = this.focusBeforePanel;
    this.focusBeforePanel = null;
    requestAnimationFrame(() => focusTarget?.focus());
  }

  private confirmAction(question: string, action: () => void): void {
    const existing = this.root.querySelector('[data-overlay="confirm"]');
    existing?.remove();
    this.focusBeforeConfirm = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.insertAdjacentHTML(
      'beforeend',
      `<section class="modal-layer confirm-layer" data-overlay="confirm" aria-modal="true" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-description"><div class="confirm-card"><h3 id="confirm-title">${question}</h3><p id="confirm-description">Unsaved progress from this shift will be lost.</p><div><button type="button" data-action="cancel">Keep playing</button><button type="button" class="danger" data-action="confirm">Confirm</button></div></div></section>`,
    );
    this.root.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.closeConfirm());
    this.root.querySelector('[data-action="confirm"]')?.addEventListener('click', action);
    this.focusDialog(this.root.querySelector<HTMLElement>('[data-overlay="confirm"]'));
  }

  private collectHudElements(): void {
    this.hudElements.clear();
    this.root.querySelectorAll<HTMLElement>('[data-hud]').forEach((element) => {
      if (element.dataset.hud) this.hudElements.set(element.dataset.hud, element);
    });
  }

  private setHudText(key: string, value: string): void {
    const element = this.hudElements.get(key);
    if (element && element.textContent !== value) element.textContent = value;
  }

  private setHudStyle(key: string, property: string, value: string): void {
    this.hudElements.get(key)?.style.setProperty(property, value);
  }

  private toggleHud(key: string, visible: boolean): void {
    this.hudElements.get(key)?.classList.toggle('hidden', !visible);
  }

  private drawMinimap(state: HudState): void {
    const canvas = this.hudElements.get('minimap') as HTMLCanvasElement | undefined;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const { width, depth } = state.minimap.world;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(20, 17, 13, .78)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(236, 222, 190, .28)';
    context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    for (const hotspot of state.minimap.hotspots.slice(0, 8)) {
      const x = ((hotspot.x + width / 2) / width) * (canvas.width - 16) + 8;
      const y = ((hotspot.z + depth / 2) / depth) * (canvas.height - 16) + 8;
      context.fillStyle = '#d8754e';
      context.beginPath();
      context.arc(x, y, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    const playerX = ((state.minimap.player.x + width / 2) / width) * (canvas.width - 16) + 8;
    const playerY = ((state.minimap.player.z + depth / 2) / depth) * (canvas.height - 16) + 8;
    context.fillStyle = '#f1d17a';
    context.beginPath();
    context.arc(playerX, playerY, 5, 0, Math.PI * 2);
    context.fill();
  }

  private evolutionHint(choice: UpgradeChoice): string {
    if (choice.kind !== 'tool') return '';
    const evolution = TOOLS[choice.id as keyof typeof TOOLS].evolution;
    if (!evolution) return '';
    return `<span class="evolution-hint">Evolution: ${evolution.name} with ${PASSIVES[evolution.passive].name}</span>`;
  }

  private rangeSetting(
    label: string,
    key: keyof SettingsData,
    value: number,
    min: number,
    max: number,
    step: number,
    format = 'percent',
  ): string {
    const id = `setting-${String(key)}`;
    return `<label class="range-setting" for="${id}"><span><strong>${label}</strong><output for="${id}">${this.settingValue(value, format)}</output></span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${String(key)}" data-format="${format}" /></label>`;
  }

  private toggleSetting(label: string, key: keyof SettingsData, checked: boolean, description: string): string {
    const id = `setting-${String(key)}`;
    const descriptionId = `${id}-description`;
    return `<label class="toggle-setting" for="${id}"><span><strong>${label}</strong><small id="${descriptionId}">${description}</small></span><input id="${id}" type="checkbox" data-setting="${String(key)}" aria-describedby="${descriptionId}" ${checked ? 'checked' : ''}/><i aria-hidden="true"></i></label>`;
  }

  private keybindSetting(action: GameAction, bindings: KeyBindings): string {
    const labelId = `binding-${action}-label`;
    const codes = bindings[action];
    return `<div class="keybind-setting"><span id="${labelId}">${actionLabel[action]}</span><button type="button" class="keybind-button" data-bind-action="${action}" aria-labelledby="${labelId}" aria-label="${actionLabel[action]}: ${codes.map((code) => this.keyName(code)).join(' or ')}. Activate to change the primary key.">${this.bindingKeycaps(codes)}</button></div>`;
  }

  private gamepadSetting(action: GamepadAction, bindings: GamepadBindings): string {
    const labelId = `gamepad-${action}-label`;
    const button = bindings[action];
    return `<div class="gamepad-setting"><span id="${labelId}">${actionLabel[action]}</span><button type="button" class="gamepad-bind-button" data-gamepad-action="${action}" aria-labelledby="${labelId}" aria-label="${actionLabel[action]}: ${this.gamepadButtonName(button)}. Activate, then press a gamepad button."><kbd>${this.gamepadButtonName(button)}</kbd></button></div>`;
  }

  private beginBindingCapture(action: GameAction, button: HTMLButtonElement): void {
    this.cancelBindingCapture();
    this.cancelGamepadCapture();
    button.classList.add('listening');
    button.setAttribute('aria-pressed', 'true');
    button.innerHTML = '<span>Press a key</span><small>Esc cancels</small>';
    this.setBindingStatus(`Listening for a new ${actionLabel[action]} key. Press Escape to cancel.`);

    const handler = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') {
        this.cancelBindingCapture();
        this.setBindingStatus(`${actionLabel[action]} was not changed.`);
        button.focus();
        return;
      }
      if (!this.isBindableCode(event.code)) {
        this.setBindingStatus(`${this.keyName(event.code)} is reserved for navigation. Choose another key.`);
        return;
      }

      const result = this.actions?.rebindKey(action, event.code);
      this.cancelBindingCapture();
      if (!result) {
        this.setBindingStatus('The input system is not ready. Try again.');
        return;
      }
      this.updateBindingButtons(result.bindings);
      const message = result.swappedWith
        ? `${this.keyName(result.code)} moved to ${actionLabel[action]}; ${actionLabel[result.swappedWith]} received the previous key.`
        : `${actionLabel[action]} is now ${this.keyName(result.code)}.`;
      this.setBindingStatus(message);
      this.announce(message);
      button.focus();
    };
    window.addEventListener('keydown', handler, true);
    this.bindingCaptureCleanup = () => {
      window.removeEventListener('keydown', handler, true);
      button.classList.remove('listening');
      button.removeAttribute('aria-pressed');
      this.updateBindingButtons(this.save.settings.keyBindings);
    };
  }

  private beginGamepadCapture(action: GamepadAction, button: HTMLButtonElement): void {
    this.cancelBindingCapture();
    this.cancelGamepadCapture();
    button.classList.add('listening');
    button.setAttribute('aria-pressed', 'true');
    button.innerHTML = '<span>Press button</span><small>Esc cancels</small>';
    this.setBindingStatus(`Listening for a new ${actionLabel[action]} gamepad button. Release held buttons first.`);

    let frame = 0;
    let armed = false;
    const poll = (): void => {
      const gamepad = navigator.getGamepads?.()[0] ?? null;
      const pressedButton = gamepad?.buttons.findIndex((candidate) => candidate.pressed) ?? -1;
      if (!armed) armed = pressedButton < 0;
      else if (pressedButton >= 0) {
        const result = this.actions?.rebindGamepad(action, pressedButton);
        this.cancelGamepadCapture();
        if (!result) {
          this.setBindingStatus('No gamepad input system is available.');
          return;
        }
        this.updateGamepadButtons(result.bindings);
        const message = result.swappedWith
          ? `${this.gamepadButtonName(result.button)} moved to ${actionLabel[action]}; ${actionLabel[result.swappedWith]} received the previous button.`
          : `${actionLabel[action]} now uses ${this.gamepadButtonName(result.button)}.`;
        this.setBindingStatus(message);
        this.announce(message);
        button.focus();
        return;
      }
      frame = requestAnimationFrame(poll);
    };
    const cancelWithEscape = (event: KeyboardEvent): void => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancelGamepadCapture();
      this.setBindingStatus(`${actionLabel[action]} gamepad button was not changed.`);
      button.focus();
    };
    window.addEventListener('keydown', cancelWithEscape, true);
    frame = requestAnimationFrame(poll);
    this.gamepadCaptureCleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', cancelWithEscape, true);
      button.classList.remove('listening');
      button.removeAttribute('aria-pressed');
      this.updateGamepadButtons(this.save.settings.gamepadBindings);
    };
  }

  private cancelBindingCapture(): void {
    const cleanup = this.bindingCaptureCleanup;
    this.bindingCaptureCleanup = null;
    cleanup?.();
  }

  private cancelGamepadCapture(): void {
    const cleanup = this.gamepadCaptureCleanup;
    this.gamepadCaptureCleanup = null;
    cleanup?.();
  }

  private updateBindingButtons(bindings: KeyBindings): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-bind-action]').forEach((button) => {
      const action = button.dataset.bindAction as GameAction;
      const codes = bindings[action];
      button.innerHTML = this.bindingKeycaps(codes);
      button.setAttribute(
        'aria-label',
        `${actionLabel[action]}: ${codes.map((code) => this.keyName(code)).join(' or ')}. Activate to change the primary key.`,
      );
    });
  }

  private updateGamepadButtons(bindings: GamepadBindings): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-gamepad-action]').forEach((button) => {
      const action = button.dataset.gamepadAction as GamepadAction;
      const name = this.gamepadButtonName(bindings[action]);
      button.innerHTML = `<kbd>${name}</kbd>`;
      button.setAttribute('aria-label', `${actionLabel[action]}: ${name}. Activate, then press a gamepad button.`);
    });
  }

  private setBindingStatus(message: string): void {
    const status = this.root.querySelector<HTMLElement>('[data-binding-status]');
    if (status) status.textContent = message;
  }

  private bindingKeycaps(codes: string[]): string {
    return codes.slice(0, 2).map((code) => `<kbd>${this.keyName(code)}</kbd>`).join('<span aria-hidden="true">or</span>');
  }

  private bindingKeys(action: GameAction): string {
    return this.bindingKeycaps(this.save.settings.keyBindings[action]);
  }

  private isBindableCode(code: string): boolean {
    return Boolean(code) && !['Tab', 'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'Unidentified'].includes(code);
  }

  private keyName(code: string): string {
    const names: Record<string, string> = {
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      ShiftLeft: 'L Shift',
      ShiftRight: 'R Shift',
      ControlLeft: 'L Ctrl',
      ControlRight: 'R Ctrl',
      AltLeft: 'L Alt',
      AltRight: 'R Alt',
      Escape: 'Esc',
      Space: 'Space',
      Enter: 'Enter',
      Backspace: 'Backspace',
      Delete: 'Delete',
      BracketLeft: '[',
      BracketRight: ']',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/',
      Backslash: '\\',
      Minus: '-',
      Equal: '=',
    };
    return names[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
  }

  private gamepadButtonName(button: number): string {
    const names: Record<number, string> = {
      0: 'A / Cross',
      1: 'B / Circle',
      2: 'X / Square',
      3: 'Y / Triangle',
      4: 'LB / L1',
      5: 'RB / R1',
      6: 'LT / L2',
      7: 'RT / R2',
      8: 'View / Share',
      9: 'Menu / Options',
      10: 'Left stick',
      11: 'Right stick',
    };
    return names[button] ?? `Button ${button}`;
  }

  private ariaKeyShortcuts(codes: string[]): string {
    return codes
      .map((code) => {
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        if (code.startsWith('Shift')) return 'Shift';
        return code;
      })
      .join(' ');
  }

  private settingValue(value: number, format = 'percent'): string {
    return format === 'scale' ? `${Math.round(value * 100)}%` : `${Math.round(value * 100)}%`;
  }

  private closeConfirm(): void {
    const confirm = this.root.querySelector('[data-overlay="confirm"]');
    if (!confirm) return;
    confirm.remove();
    this.actions?.suppressGameplayInputUntilRelease();
    const focusTarget = this.focusBeforeConfirm;
    this.focusBeforeConfirm = null;
    requestAnimationFrame(() => focusTarget?.focus());
  }

  private focusDialog(dialog: HTMLElement | null): void {
    if (!dialog) return;
    requestAnimationFrame(() => {
      const preferred = dialog.querySelector<HTMLElement>(
        '[data-action="cancel"], [data-action="resume"], [data-choice], [data-action="close-panel"], button:not(:disabled), input:not(:disabled)',
      );
      preferred?.focus();
    });
  }

  private readonly handleDialogKeyboard = (event: KeyboardEvent): void => {
    const overlays = [...this.root.querySelectorAll<HTMLElement>('[data-overlay]')];
    const dialog = overlays.at(-1);
    if (!dialog) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (dialog.dataset.overlay === 'confirm') this.closeConfirm();
      else if (dialog.dataset.overlay === 'panel') this.closePanel();
      else if (dialog.dataset.overlay === 'pause') this.actions?.resume();
      else this.announce('Choose an upgrade to continue the shift.');
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!dialog.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  };

  private readonly pollGamepadUi = (timestamp: number): void => {
    if (this.destroyed) return;
    const gamepad = navigator.getGamepads?.()[0] ?? null;
    if (!gamepad) {
      this.gamepadUiPrevious.clear();
      this.gamepadNavigationHeld = null;
      this.gamepadUiFrame = requestAnimationFrame(this.pollGamepadUi);
      return;
    }

    if (this.gamepadCaptureCleanup) {
      this.syncGamepadUiButtons(gamepad);
      this.gamepadNavigationHeld = null;
      this.gamepadUiFrame = requestAnimationFrame(this.pollGamepadUi);
      return;
    }

    const surface = this.activeGamepadSurface();
    if (surface !== this.gamepadUiSurface) {
      this.gamepadUiSurface = surface;
      this.gamepadNavigationHeld = null;
      this.syncGamepadUiButtons(gamepad);
      if (surface && !surface.contains(document.activeElement)) this.gamepadFocusable(surface)[0]?.focus();
      this.gamepadUiFrame = requestAnimationFrame(this.pollGamepadUi);
      return;
    }
    if (surface) {
      const confirmPressed = this.gamepadUiPressed(gamepad, 0);
      const backPressed = this.gamepadUiPressed(gamepad, 1)
        || (surface.dataset.overlay === 'pause' && this.gamepadUiPressed(gamepad, 9));
      const direction = this.gamepadDirection(gamepad);

      if (direction !== this.gamepadNavigationHeld) {
        this.gamepadNavigationHeld = direction;
        this.gamepadNavigationRepeatAt = timestamp + 360;
        if (direction) this.navigateGamepadSurface(surface, direction);
      } else if (direction && timestamp >= this.gamepadNavigationRepeatAt) {
        this.gamepadNavigationRepeatAt = timestamp + 120;
        this.navigateGamepadSurface(surface, direction);
      }

      if (backPressed) this.gamepadBack(surface);
      else if (confirmPressed) this.activateGamepadFocus(surface);
    } else {
      this.gamepadNavigationHeld = null;
    }

    this.syncGamepadUiButtons(gamepad);
    this.gamepadUiFrame = requestAnimationFrame(this.pollGamepadUi);
  };

  private activeGamepadSurface(): HTMLElement | null {
    const overlays = [...this.root.querySelectorAll<HTMLElement>('[data-overlay]')];
    return overlays.at(-1)
      ?? this.root.querySelector<HTMLElement>('.title-screen, .summary-screen');
  }

  private gamepadDirection(gamepad: Gamepad): 'up' | 'down' | 'left' | 'right' | null {
    const axisX = gamepad.axes[0] ?? 0;
    const axisY = gamepad.axes[1] ?? 0;
    if (gamepad.buttons[12]?.pressed || axisY < -0.55) return 'up';
    if (gamepad.buttons[13]?.pressed || axisY > 0.55) return 'down';
    if (gamepad.buttons[14]?.pressed || axisX < -0.55) return 'left';
    if (gamepad.buttons[15]?.pressed || axisX > 0.55) return 'right';
    return null;
  }

  private navigateGamepadSurface(
    surface: HTMLElement,
    direction: 'up' | 'down' | 'left' | 'right',
  ): void {
    const controls = this.gamepadFocusable(surface);
    if (controls.length === 0) return;
    const active = document.activeElement instanceof HTMLElement && surface.contains(document.activeElement)
      ? document.activeElement
      : null;
    if (!active) {
      controls[0]?.focus();
      return;
    }

    if ((direction === 'left' || direction === 'right') && this.adjustGamepadControl(active, direction)) return;

    const currentIndex = Math.max(0, controls.indexOf(active));
    const offset = direction === 'up' || direction === 'left' ? -1 : 1;
    controls[(currentIndex + offset + controls.length) % controls.length]?.focus();
  }

  private adjustGamepadControl(control: HTMLElement, direction: 'left' | 'right'): boolean {
    if (control instanceof HTMLInputElement && control.type === 'range') {
      if (direction === 'left') control.stepDown();
      else control.stepUp();
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (control instanceof HTMLSelectElement) {
      const offset = direction === 'left' ? -1 : 1;
      const nextIndex = Math.max(0, Math.min(control.options.length - 1, control.selectedIndex + offset));
      if (nextIndex !== control.selectedIndex) {
        control.selectedIndex = nextIndex;
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  private activateGamepadFocus(surface: HTMLElement): void {
    const controls = this.gamepadFocusable(surface);
    if (controls.length === 0) return;
    const active = document.activeElement instanceof HTMLElement && surface.contains(document.activeElement)
      ? document.activeElement
      : null;
    if (!active) {
      controls[0]?.focus();
      return;
    }
    this.actions?.suppressGameplayInputUntilRelease();
    active.click();
  }

  private gamepadBack(surface: HTMLElement): void {
    const overlay = surface.dataset.overlay;
    if (!overlay) return;
    this.actions?.suppressGameplayInputUntilRelease();
    if (overlay === 'confirm') this.closeConfirm();
    else if (overlay === 'panel') this.closePanel();
    else if (overlay === 'pause') this.actions?.resume();
    else this.announce('Choose an upgrade to continue the shift.');
  }

  private gamepadFocusable(surface: HTMLElement): HTMLElement[] {
    return [...surface.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute('hidden') && !element.closest('[hidden]'));
  }

  private gamepadUiPressed(gamepad: Gamepad, index: number): boolean {
    return Boolean(gamepad.buttons[index]?.pressed) && !(this.gamepadUiPrevious.get(index) ?? false);
  }

  private syncGamepadUiButtons(gamepad: Gamepad): void {
    this.gamepadUiPrevious.clear();
    gamepad.buttons.forEach((button, index) => this.gamepadUiPrevious.set(index, button.pressed));
  }

  private updateTitleRadio(selector: string, dataKey: string, value: string): void {
    this.root.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
      const selected = button.dataset[dataKey] === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', String(selected));
    });
  }

  private debugPanelMarkup(): string {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return '';
    const archetypes = Object.values(KIDS)
      .map((kid) => `<option value="${kid.id}">${kid.name}</option>`)
      .join('');
    return `<details class="debug-panel" data-debug-panel>
      <summary>Debug tools</summary>
      <div class="debug-body">
        <label><span>Time scale</span><select data-debug="time-scale"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option></select></label>
        <label class="debug-check"><span>Invulnerable</span><input type="checkbox" data-debug="invulnerable" /></label>
        <div class="debug-row"><button type="button" data-debug="xp">+100 XP</button><label><span class="sr-only">Chaos</span><input type="number" min="0" max="100" value="50" data-debug="chaos-value" aria-label="Chaos percentage" /></label><button type="button" data-debug="chaos">Set Chaos</button></div>
        <div class="debug-row debug-spawn"><select data-debug="archetype" aria-label="Kid archetype">${archetypes}</select><input type="number" min="1" max="20" value="1" data-debug="spawn-count" aria-label="Spawn count" /><button type="button" data-debug="spawn">Spawn</button></div>
        <div class="debug-row"><button type="button" data-debug="win">Force win</button><button type="button" data-debug="loss">Force loss</button><button type="button" data-debug="snapshot">Snapshot</button></div>
        <pre data-debug-output hidden tabindex="0"></pre>
      </div>
    </details>`;
  }

  private bindDebugControls(): void {
    const panel = this.root.querySelector<HTMLElement>('[data-debug-panel]');
    if (!panel) return;
    const api = (): DebugApi | undefined => (window as Window & { librarianDebug?: DebugApi }).librarianDebug;
    panel.querySelector<HTMLSelectElement>('[data-debug="time-scale"]')?.addEventListener('change', (event) => {
      const value = Number((event.currentTarget as HTMLSelectElement).value);
      const controls = api();
      if (controls) controls.timeScale = value;
    });
    panel.querySelector<HTMLInputElement>('[data-debug="invulnerable"]')?.addEventListener('change', (event) => {
      const controls = api();
      if (controls) controls.invulnerable = (event.currentTarget as HTMLInputElement).checked;
    });
    panel.querySelector('[data-debug="xp"]')?.addEventListener('click', () => api()?.awardXp(100));
    panel.querySelector('[data-debug="chaos"]')?.addEventListener('click', () => {
      const value = Number(panel.querySelector<HTMLInputElement>('[data-debug="chaos-value"]')?.value ?? 0);
      api()?.setChaos(value);
    });
    panel.querySelector('[data-debug="spawn"]')?.addEventListener('click', () => {
      const archetype = panel.querySelector<HTMLSelectElement>('[data-debug="archetype"]')?.value ?? 'browser';
      const count = Number(panel.querySelector<HTMLInputElement>('[data-debug="spawn-count"]')?.value ?? 1);
      api()?.spawn(archetype, Math.max(1, Math.min(20, count)));
    });
    panel.querySelector('[data-debug="win"]')?.addEventListener('click', () => api()?.finish(true));
    panel.querySelector('[data-debug="loss"]')?.addEventListener('click', () => api()?.finish(false));
    panel.querySelector('[data-debug="snapshot"]')?.addEventListener('click', () => {
      const output = panel.querySelector<HTMLElement>('[data-debug-output]');
      if (!output) return;
      output.hidden = false;
      output.textContent = JSON.stringify(api()?.snapshot() ?? { status: 'Runtime API not ready' }, null, 2);
      output.focus();
    });
  }

  private applySettingsClasses(settings: SettingsData): void {
    document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
    document.body.classList.toggle('reduced-flash', settings.reducedFlash);
    document.body.classList.toggle('high-contrast', settings.highContrast);
    document.body.classList.toggle('color-safe', settings.colorSafe);
    document.body.classList.toggle('audio-muted', settings.muted);
    if (!settings.soundCues) this.root.querySelector('[data-sound-caption]')?.remove();
  }

  private announce(message: string): void {
    cancelAnimationFrame(this.announcementFrame);
    this.announcer.textContent = '';
    this.announcementFrame = requestAnimationFrame(() => {
      this.announcer.textContent = message;
    });
  }

  private formatTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }

  private pretty(value: string): string {
    return value
      .split('-')
      .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
      .join(' ');
  }
}
