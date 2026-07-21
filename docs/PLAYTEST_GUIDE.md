# The Librarian 2.0 playtest guide

## Purpose

This test is designed to answer whether the new 3D game is understandable, satisfying, and worth replaying—not whether a tester can find every feature. Run the first session without coaching. Use the questions only after the run.

## Recommended build

- Use the Vercel preview for `codex/librarian-2.0`.
- Begin in a fresh browser profile or choose **Reset progress** in Settings.
- Use a laptop or desktop with a keyboard for the first pass.
- Run at the tester's normal resolution and browser zoom.

## Session protocol

### Session A — fresh-player comprehension

1. Open the game and say only: “Please play until the shift ends or you decide to stop.”
2. Do not point out Help, controls, Chaos, shelf symbols, or tools.
3. Record observable times for:
   - first movement;
   - first book pickup;
   - first correct shelf return;
   - first Intervene or signature use;
   - first upgrade choice;
   - first authored event;
   - first confusion lasting more than ten seconds.
4. When the run ends, ask the questions below before explaining anything.

### Session B — build depth

1. Let the tester choose a librarian, map, mode, and difficulty.
2. Ask them to pursue a visibly different tool build.
3. Afterward, use one-click same-seed retry or start a Daily Schedule.
4. Note whether the second run changes their route, upgrade priorities, or tool timing.

### Session C — accessibility and device pass

Test keyboard-only navigation, a gamepad, 125% and 135% UI scale, high contrast, reduced motion, reduced flashes, captions/visual cues, muted audio, focus loss, and at least one 720p viewport.

## Questions

Ask without suggesting the desired answer:

1. What were you trying to do most of the time?
2. How did you know which shelf wanted each book?
3. What made Chaos rise, and what made it fall?
4. What did Space do? What did the signature tool do?
5. Which problem did you choose to solve first, and why?
6. What changed about your build during the run?
7. Did the final crisis feel different from the rest of the shift?
8. Was any important information conveyed only by color or sound?
9. What was the most satisfying moment?
10. Would you start another run right now? Why or why not?

## Decision gates

The roadmap's external gates require evidence from real fresh players. Automation cannot certify them.

| Gate | Target |
|---|---:|
| Identifies next useful action within 20 seconds | 90% |
| Completes onboarding without Help | 80% |
| Correctly names dominant Chaos source | 85% |
| First pickup | under 10 seconds |
| First meaningful route choice | under 30 seconds |
| First upgrade | 60–90 seconds |
| Immediate replay intent | 60% or more |
| Default finale completion after three learning runs | 20–35% |

Do not promote the preview to `main` if comprehension is below target or if players cannot explain Chaos. Revise the vertical slice before adding or tuning more content.

## Results template

```text
Build/commit:
Tester code:
Fresh or returning:
Device/browser/resolution:
Input method:

First pickup:
First return:
First intervention:
First upgrade:
First event:
Run result/time:
Replay intent (yes/no):

Observed confusion:
Chaos explanation:
Build description:
Most satisfying moment:
Accessibility/device notes:
Defects:
```
