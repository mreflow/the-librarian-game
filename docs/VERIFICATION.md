# Version 2 verification

The v2 branch treats deterministic game data, save compatibility, production compilation, and a real browser boot as release gates.

## Local commands

- `npm ci` installs the exact dependency graph used by CI and Vercel.
- `npm run lint` rejects source, test, and script warnings with Oxlint.
- `npm run typecheck` checks the strict TypeScript application and unit tests.
- `npm run validate:assets` verifies runtime asset coverage, file size, SHA-256, and provenance metadata.
- `npm test` runs deterministic logic and content-integrity tests.
- `npm run balance:simulate -- 1000 standard` prints the deterministic 3 × 3 difficulty/expertise balance matrix.
- `npm run build` creates the Vercel production artifact in `dist/`.
- `npm run test:e2e` builds the game, serves the production artifact, and runs deterministic Chromium lifecycle tests.
- `npm run verify:full` runs every local gate in release order.

Install the Playwright browser once on a new workstation with `npx playwright install chromium`.

## Asset provenance gate

Every local image, model, video, font, or audio URL referenced by `index.html` or `src/v2/` must have an entry in `assets/v2-assets.json`. The validator fails when:

- a referenced runtime asset is not manifested;
- a source file is missing;
- its byte size or SHA-256 has changed;
- a runtime or source path is duplicated; or
- provenance and rights-review status are absent.

When replacing an asset, verify its origin and distribution terms before updating the manifest hash. A `rightsReview` value of `required` is acceptable for development previews, but all entries must be `approved` before a public release.

## Continuous integration

`.github/workflows/ci.yml` runs the quality gate on pull requests and pushes to `main` or `codex/**`. Chromium smoke tests run only after typechecking, unit tests, asset validation, and the production build pass. Failed browser runs upload the Playwright HTML report for seven days.

The browser suite opens the app with the opt-in `?debug=1` harness. It still drives the real Babylon world and persistent UI, while deterministic XP, time acceleration, and run completion avoid waiting through a full shift. Its 12 journeys cover title/help, persisted settings, catalog unlocks, pause/resume, upgrade drafts, serialized stacked drafts, gamepad-only title/run/pause/draft navigation, run completion and same-seed retry, the second map and librarian, visibility-loss pause, an accelerated scheduled objective, and a narrow touch viewport. Every scenario fails on uncaught page errors.

The unit suite also locks the simplified balance simulator to reproducible seed results, all nine difficulty/expertise cells, monotonic difficulty and expertise behavior, and a 20–35% completion target for a learning player on Classic. These aggregate checks use 250 deterministic runs per cell and complete in well under a second on a typical development machine.

## Latest local evidence

The July 20, 2026 release-candidate run passed lint, typechecking, 11/11 manifested runtime references, 94/94 unit tests, the production build, and 12/12 Chromium journeys. The production code output is intentionally one JavaScript and one CSS asset: direct Babylon module imports keep the JavaScript at 2.085 MB raw / 498.56 KB gzip, while disabling shader code splitting avoids hundreds of tiny module-preload requests.

## Vercel previews

`vercel.json` pins the project to the Vite build, `npm ci`, and the `dist/` output. Once the GitHub repository is connected to Vercel, pushes to the v2 development branch produce an isolated preview deployment without changing production.
