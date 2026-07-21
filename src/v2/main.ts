import './styles.css';
import { GameApp } from './GameApp';
import { assertV2Content } from './data/validateContent';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const uiRoot = document.querySelector<HTMLElement>('#game-ui');
const announcer = document.querySelector<HTMLElement>('#announcer');

if (!canvas || !uiRoot || !announcer) {
  throw new Error('The Librarian could not find its required page elements.');
}

const showFatal = (error: unknown): void => {
  console.error(error);
  uiRoot.innerHTML = `
    <section class="fatal-screen screen" role="alert">
      <p class="eyebrow">The library could not open</p>
      <h1>3D initialization failed</h1>
      <p>Your browser may not support the graphics features required by this development build.</p>
      <button type="button" data-action="retry">Try again</button>
    </section>`;
  uiRoot.querySelector('[data-action="retry"]')?.addEventListener('click', () => location.reload());
};

let app: GameApp | null = null;
try {
  assertV2Content();
  app = new GameApp(canvas, uiRoot, announcer);
  void app.start().catch(showFatal);
} catch (error: unknown) {
  showFatal(error);
}

if (import.meta.env.DEV && app) {
  (window as Window & { librarianApp?: GameApp }).librarianApp = app;
}
