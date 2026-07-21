# The Librarian 2.0 implementation status

This document maps the roadmap to executable evidence. A checked implementation item means the feature exists in the branch and has an automated or direct browser verification path. Human playtest and public-release gates stay separate.

## Playable product

- [x] Babylon.js + TypeScript + Vite 3D runtime isolated from the preserved 1.0 source.
- [x] Fixed three-quarter orthographic diorama camera, cutaway walls, lighting, shadows, fog, glow, and occlusion fading.
- [x] Grand Reading Room and Midnight Archives with authored routes, landmarks, event zones, and different visual languages.
- [x] Automatic book pickup, visible carry stack, matching-shelf return, genre color + symbol, and return animation.
- [x] Move, sprint/stamina, Intervene, signature tool, pause, gamepad input, and focus-loss pause.
- [x] Clutter, Noise, Disorder, dominant-source HUD, thresholds, recoverable Last Call, and Second Wind.
- [x] Eight behavioral kid archetypes plus Field Trip waves.
- [x] Ten tools, twelve passives, upgrade drafts, and tool/passive evolutions.
- [x] Sorting feedback including Neat Stack, Perfect Sort, Dewey Chain, and Aisle Clear.
- [x] Eight section objectives, a dedicated three-book finale objective, six authored events, seeded schedules, and mechanically distinct map-specific three-stage finales.
- [x] 15-minute Standard, 8-minute Quick, deterministic Daily, and optional Endless modes.
- [x] Three librarians, two maps, catalog stamps, unlocks, same-seed retry, and versioned persistence.
- [x] Production title/HUD/pause/draft/summary/catalog/help/settings surfaces.

## Quality infrastructure

- [x] Strict TypeScript and production Vite build.
- [x] Deterministic simulation/content/save unit tests.
- [x] Playwright browser journeys for the critical screen and run flows.
- [x] SHA-256 asset manifest with provenance and rights status.
- [x] GitHub Actions verification and Vercel preview configuration.
- [x] Browser-captured reference images for both maps.
- [x] Debug time scale, XP, spawn, Chaos, invulnerability, finish, and runtime snapshot controls.

## Latest verified build

Evidence captured on July 20, 2026 from the production build on `codex/librarian-2.0`:

- `npm run verify:full`: lint, strict typecheck, 11/11 asset references, 94/94 unit tests, production build, and 12/12 Chromium journeys passed.
- Production output: 2.084 MB JavaScript (498.53 KB gzip), 55.33 KB CSS (12.73 KB gzip), two bundled code assets, and no module-preload fan-out.
- Built artifact: approximately 12 MB including 9.4 MB of inherited music. The title-screen transfer is approximately 4.9 MB, below the 8 MiB development target.
- Direct browser stress captures with 17 active visitors stayed below the 16.7 ms frame-time budget: Grand Reading Room P95 9.1 ms and Midnight Archives P95 10.3 ms on the development Mac.
- Browser QA covered both map finales, normal gameplay, the title screen at ultrawide width, and debug-hidden production presentation. Reference captures live in `docs/visuals/`.

These frame timings establish a healthy development baseline, not the target-hardware or 15-minute memory-soak gate.

## Gates that require external evidence

- [ ] Fresh-player comprehension and replay-intent targets.
- [ ] 15-minute target-hardware memory and P95 performance capture.
- [ ] Final ownership approval for inherited audio assets.
- [ ] Public-production approval and merge to `main`.

The development preview is intentionally allowed to carry `rightsReview: required` for inherited audio. Public distribution is not.
