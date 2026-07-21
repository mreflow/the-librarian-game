import { expect, test, type Page } from '@playwright/test';

import { ALL_TOOLS, SAVE_KEY, debugSnapshot, openTitle, startRun, unlockedSave } from './helpers';

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test('opens the 3D title screen and its field guide', async ({ page }) => {
  await openTitle(page);

  await expect(page).toHaveTitle(/The Librarian: After Hours/i);
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: /Start guided tutorial/i })).toBeEnabled();
  await expect(page.getByText(/Babylon 3D/i)).toBeVisible();

  await page.getByRole('button', { name: /How to play/i }).click();
  const guide = page.getByRole('dialog');
  await expect(guide.getByRole('heading', { name: 'Field guide' })).toBeVisible();
  await expect(guide).toContainText('Move with purpose');
  await expect(guide).toContainText('Last Call');
  await guide.getByRole('button', { name: 'Close Field guide' }).click();
  await expect(guide).toBeHidden();
});

test('persists accessibility and interface settings across reloads', async ({ page }) => {
  await openTitle(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });

  await settings.locator('[data-setting="highContrast"]').check();
  await settings.locator('[data-setting="reducedMotion"]').check();
  await settings.locator('[data-setting="uiScale"]').fill('1.2');
  await expect(page.locator('body')).toHaveClass(/high-contrast/);
  await expect(page.locator('body')).toHaveClass(/reduced-motion/);
  await settings.getByRole('button', { name: 'Close Settings' }).click();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /The Librarian/i })).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/high-contrast/);
  await expect(page.locator('body')).toHaveClass(/reduced-motion/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim()))
    .toBe('1.2');
});

test('renders the catalog and every persisted unlock', async ({ page }) => {
  await openTitle(page, unlockedSave());

  await expect(page.getByRole('radio', { name: /Midnight Archives/i })).toBeEnabled();
  await expect(page.getByRole('radio', { name: /Elias Index/i })).toBeEnabled();
  await page.getByRole('button', { name: /Catalog/i }).click();
  const catalog = page.getByRole('dialog', { name: 'The catalog' });

  await expect(catalog.locator('.catalog-item')).toHaveCount(ALL_TOOLS.length);
  await expect(catalog).toContainText('Shush Wave');
  await expect(catalog).toContainText('Reading Lamp');
  await expect(catalog).toContainText('123');
  await expect(catalog).not.toContainText('Undiscovered tool');
});

test('starts, pauses, and resumes a fresh shift', async ({ page }) => {
  await openTitle(page, unlockedSave({
    totalRuns: 1,
    unlockedLibrarians: ['head-librarian'],
    unlockedMaps: ['grand-reading-room'],
  }));
  await startRun(page);

  const hud = page.getByRole('region', { name: 'Shift status' });
  await expect(hud.getByText('Library condition')).toBeVisible();
  await expect(hud.getByText(/Level 1/)).toBeVisible();
  await expect(hud.getByRole('button', { name: 'Pause game' })).toBeVisible();

  await page.keyboard.press('Escape');
  const pauseDialog = page.getByRole('dialog', { name: 'Quiet moment' });
  await expect(pauseDialog).toBeVisible();
  await pauseDialog.getByRole('button', { name: /Resume shift/i }).click();
  await expect(pauseDialog).toBeHidden();
});

test('opens a first run with an immediate guided task and the corrected W/S direction', async ({ page }) => {
  await openTitle(page);
  await startRun(page);

  const hud = page.getByRole('region', { name: 'Shift status' });
  await expect(hud.locator('[data-hud="objective-title"]')).toHaveText(/Step 1 of 5 · Pick up the glowing book/i);
  await expect(hud.locator('[data-hud="tutorial"]')).toContainText('Loose books jump into your carry rack automatically');

  const before = await debugSnapshot(page);
  expect(before.options).toMatchObject({ mode: 'quick', difficulty: 'calm', tutorial: true });
  expect(before.tutorial.step?.id).toBe('pickup');

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(260);
  await page.keyboard.up('KeyW');
  const afterW = await debugSnapshot(page);
  expect(afterW.player.z).toBeGreaterThan(before.player.z);

  await page.keyboard.down('KeyS');
  await page.waitForTimeout(140);
  await page.keyboard.up('KeyS');
  const afterS = await debugSnapshot(page);
  expect(afterS.player.z).toBeLessThan(afterW.player.z);
});

test('offers a replayable tutorial after prior shifts', async ({ page }) => {
  await openTitle(page, unlockedSave({ totalRuns: 4 }));
  await page.getByRole('button', { name: 'Replay tutorial' }).click();
  await expect(page.getByRole('region', { name: 'Shift status' })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.librarianDebug));

  expect((await debugSnapshot(page)).options).toMatchObject({
    mode: 'quick',
    difficulty: 'calm',
    mapId: 'grand-reading-room',
    librarianId: 'head-librarian',
    tutorial: true,
  });
});

test('gates the complete tutorial on pickup, return, Intervene, and Shush Wave', async ({ page }) => {
  await openTitle(page);
  await startRun(page);

  const teleportToMarker = async (): Promise<void> => {
    const marker = (await debugSnapshot(page)).tutorial.marker;
    expect(marker).not.toBeNull();
    await page.evaluate(({ x, z }) => window.librarianDebug?.teleport(x, z), marker as { x: number; z: number });
  };

  await teleportToMarker();
  await expect.poll(async () => (await debugSnapshot(page)).tutorial.step?.id).toBe('return');

  await teleportToMarker();
  await expect.poll(async () => (await debugSnapshot(page)).tutorial.step?.id).toBe('intervene');

  await teleportToMarker();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await debugSnapshot(page)).tutorial.step?.id).toBe('signature');

  await teleportToMarker();
  await page.keyboard.press('Space');
  expect((await debugSnapshot(page)).tutorial.step?.id).toBe('signature');
  await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await debugSnapshot(page)).tutorial.step?.id).toBe('chaos');

  await page.evaluate(() => {
    if (window.librarianDebug) window.librarianDebug.timeScale = 10;
  });
  await expect.poll(async () => (await debugSnapshot(page)).tutorial.active).toBe(false);
  await expect(page.locator('[data-hud="objective-title"]')).toHaveText('Return the loose books');
  const opening = await debugSnapshot(page);
  expect(opening.director.kids).toBeGreaterThanOrEqual(2);
  expect(opening.director.tutorialKids).toBe(0);
  expect(opening.director.elapsed).toBeLessThan(5);
  expect(opening.progression).toMatchObject({ level: 1, xp: 0 });
  expect(opening.stats).toMatchObject({
    booksCollected: 0,
    booksShelved: 0,
    kidsCalmed: 0,
    objectivesCompleted: 0,
    bestCombo: 0,
    toolUses: {},
  });
  expect(opening.stats.maxChaos).toBeLessThan(15);

  await page.evaluate(() => window.librarianDebug?.finish(true));
  await expect(page.getByRole('heading', { name: 'Order restored' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry same schedule' }).click();
  await expect(page.getByRole('region', { name: 'Shift status' })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.librarianDebug));
  expect((await debugSnapshot(page)).options.tutorial).toBe(false);
});

test('starts ordinary shifts with visible returns and a concrete objective', async ({ page }) => {
  await openTitle(page, unlockedSave({ totalRuns: 2 }));
  await startRun(page);

  const hud = page.getByRole('region', { name: 'Shift status' });
  await expect(hud.locator('[data-hud="objective-title"]')).toHaveText('Return the loose books');
  await expect(hud.locator('[data-hud="objective-detail"]')).toContainText('Pick up three books');
  expect((await debugSnapshot(page)).director.looseBooks).toBeGreaterThanOrEqual(7);
});

test('opens an upgrade draft and applies a deterministic progression choice', async ({ page }) => {
  await openTitle(page, unlockedSave({ totalRuns: 1 }));
  await startRun(page);

  await page.evaluate(() => window.librarianDebug?.awardXp(100));
  const draft = page.getByRole('dialog', { name: 'Choose what happens next' });
  await expect(draft).toBeVisible();
  await expect(draft.locator('.upgrade-card')).toHaveCount(3);
  const before = await debugSnapshot(page);
  expect(before.progression.level).toBeGreaterThanOrEqual(2);

  await draft.locator('.upgrade-card').first().click();
  await expect(draft).toBeHidden();
  const after = await debugSnapshot(page);
  const ranks = [...Object.values(after.progression.tools), ...Object.values(after.progression.passives)];
  expect(ranks.reduce((total, rank) => total + rank, 0)).toBeGreaterThan(1);
});

test('serializes stacked level drafts without leaving a stale modal', async ({ page }) => {
  await openTitle(page, unlockedSave({ totalRuns: 1 }));
  await startRun(page);

  await page.evaluate(() => {
    window.librarianDebug?.awardXp(100);
    window.librarianDebug?.awardXp(100);
  });
  const drafts = page.locator('[data-overlay="draft"]');
  await expect(drafts).toHaveCount(1);
  await drafts.locator('.upgrade-card').first().click();
  await expect(drafts).toHaveCount(1);
  await drafts.locator('.upgrade-card').first().click();
  await expect(drafts).toHaveCount(0);
  expect((await debugSnapshot(page)).progression.level).toBeGreaterThanOrEqual(3);
});

test('supports title, pause, and draft flow using gamepad buttons only', async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    const gamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: 'Playwright gamepad',
      index: 0,
      mapping: 'standard',
      timestamp: 0,
      vibrationActuator: null,
      hapticActuators: [],
    } as unknown as Gamepad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [gamepad] });
    (window as Window & { __setGamepadButton?: (index: number, pressed: boolean) => void }).__setGamepadButton = (index, pressed) => {
      const button = buttons[index];
      if (!button) return;
      button.pressed = pressed;
      button.touched = pressed;
      button.value = Number(pressed);
      Object.defineProperty(gamepad, 'timestamp', { configurable: true, value: performance.now() });
    };
  });
  const press = async (index: number): Promise<void> => {
    await page.evaluate((button) => {
      (window as Window & { __setGamepadButton?: (index: number, pressed: boolean) => void }).__setGamepadButton?.(button, true);
    }, index);
    await page.waitForTimeout(90);
    await page.evaluate((button) => {
      (window as Window & { __setGamepadButton?: (index: number, pressed: boolean) => void }).__setGamepadButton?.(button, false);
    }, index);
    await page.waitForTimeout(90);
  };

  await openTitle(page, unlockedSave({
    totalRuns: 1,
    unlockedLibrarians: ['head-librarian'],
    unlockedMaps: ['grand-reading-room'],
  }));
  await page.waitForTimeout(120);
  for (let step = 0; step < 9; step += 1) await press(13);
  await expect(page.getByRole('button', { name: /Start shift/i })).toBeFocused();
  await press(0);
  await expect(page.getByRole('region', { name: 'Shift status' })).toBeVisible();

  await press(9);
  const pause = page.getByRole('dialog', { name: 'Quiet moment' });
  await expect(pause).toBeVisible();
  await press(9);
  await expect(pause).toBeHidden();

  await page.evaluate(() => window.librarianDebug?.awardXp(100));
  const draft = page.getByRole('dialog', { name: 'Choose what happens next' });
  await expect(draft.locator('.upgrade-card').first()).toBeFocused();
  await press(0);
  await expect(draft).toBeHidden();
});

test('completes a run, persists its reward, unlocks the second map, and retries the same seed', async ({ page }) => {
  await openTitle(page, unlockedSave({ totalRuns: 1, unlockedMaps: ['grand-reading-room'], stamps: 0 }));
  await startRun(page);
  const seed = (await debugSnapshot(page)).options.seed;

  await page.evaluate(() => window.librarianDebug?.finish(true));
  await expect(page.getByRole('heading', { name: 'Order restored' })).toBeVisible();
  await expect(page.getByText(/Catalog stamps/)).toBeVisible();

  const persisted = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), SAVE_KEY);
  expect(persisted.totalRuns).toBe(2);
  expect(persisted.stamps).toBeGreaterThan(0);
  expect(persisted.unlockedMaps).toContain('midnight-archives');

  await page.getByRole('button', { name: 'Retry same schedule' }).click();
  await expect(page.getByRole('region', { name: 'Shift status' })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.librarianDebug));
  expect((await debugSnapshot(page)).options.seed).toBe(seed);
});

test('loads the unlocked Midnight Archives with the selected librarian', async ({ page }) => {
  await openTitle(page, unlockedSave());
  await page.getByRole('radio', { name: /Midnight Archives/i }).click();
  await page.getByRole('radio', { name: /Elias Index/i }).click();
  await startRun(page);

  expect((await debugSnapshot(page)).options).toMatchObject({
    mapId: 'midnight-archives',
    librarianId: 'archivist',
  });
});

test('pauses automatically when the page loses visibility', async ({ page }) => {
  await openTitle(page, unlockedSave({ totalRuns: 1 }));
  await startRun(page);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(page.getByRole('dialog', { name: 'Quiet moment' })).toBeVisible();
});

test('advances the real run schedule to its first objective', async ({ page }) => {
  await openTitle(page, unlockedSave({ totalRuns: 1 }));
  await page.getByRole('radio', { name: /Quick shift/i }).click();
  await startRun(page);

  await page.evaluate(() => {
    if (!window.librarianDebug) throw new Error('Debug controls are unavailable.');
    window.librarianDebug.invulnerable = true;
    window.librarianDebug.advance(110);
  });

  const objective = page.locator('[data-hud="objective-title"]');
  await expect(objective).toHaveText(/Return the loose books|Clear the returns cart|Adventure storytime|Quiet the reading room|Restore indoor voices|Staff the help desk|Clear the west stacks|Perfect the route|Make the rounds/);
  expect((await debugSnapshot(page)).options.mode).toBe('quick');
});

test('keeps the title and modal controls usable on a narrow touch viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTitle(page);

  await expect(page.getByRole('button', { name: /Start guided tutorial/i })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  await page.getByRole('button', { name: /How to play/i }).click();
  const panel = page.locator('.detail-panel');
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect((bounds?.x ?? -1) >= 0).toBe(true);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(391);
});
