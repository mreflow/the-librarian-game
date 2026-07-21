# The Librarian 2.0 release checklist

## Code and content

- [ ] `npm ci` succeeds from a clean checkout on Node 22.
- [x] `npm run verify:full` passes.
- [x] All content references and evolutions pass schema/integrity tests.
- [x] Quick and Standard schedules share a verified valid-summary path.
- [x] Same-seed retry reproduces the schedule.
- [x] Save migration and corrupt-save recovery pass.
- [x] No known P0 or P1 defect remains after the final code and browser audit.

## Visual and interaction quality

- [x] Both maps are distinguishable without their UI labels.
- [ ] All eight kid archetypes have a readable silhouette and anticipation tell.
- [x] Genres remain matchable with color removed.
- [x] Occluding shelves fade without hiding route boundaries.
- [x] Pause and draft preserve the frozen 3D playfield.
- [x] Grand Reading Room and Midnight Archives have distinct finale presentation and mechanics.
- [ ] 720p, 1080p, ultrawide, and high-DPI layouts pass.

## Accessibility and audio

- [x] Every critical action is usable by keyboard and gamepad.
- [ ] Remapped controls persist and conflicts are prevented.
- [ ] Music, SFX, UI, and Ambience controls plus mute work independently.
- [x] UI scale, high contrast, reduced motion, and reduced flashes persist.
- [ ] Relevant audio cues have captions or visible equivalents.
- [x] Focus loss pauses into a visible, resumable state.

## Performance

- [ ] Target laptop sustains 60 fps during a crowded finale.
- [ ] P95 active frame time is below 16.7 ms on the agreed device.
- [ ] A complete 15-minute run shows no continuing heap growth.
- [ ] Cold playable load is below five seconds on typical broadband.
- [x] Initial title-screen transfer is below the agreed 8 MiB development target.

## Rights and deployment

- [x] Every runtime asset is listed in `assets/v2-assets.json`.
- [ ] Every `rightsReview` entry is `approved` before public distribution.
- [ ] GitHub branch CI is green.
- [ ] Vercel preview points to the intended branch commit.
- [ ] Preview smoke test passes after deployment.
- [x] Production rollback target is recorded: `main` at `0a3b9e809b89674e9897e6b4981a44499d0e25d6`.

## Human gates

- [ ] Fresh-player comprehension targets in `docs/PLAYTEST_GUIDE.md` are met.
- [ ] At least 60% of vertical-slice testers express immediate replay intent.
- [ ] Testers can accurately explain why Chaos rises and falls.
- [ ] Structured feedback has been triaged into launch blockers and later ideas.
