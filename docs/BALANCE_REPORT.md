# Automated balance smoke report

## Baseline

Command:

```bash
npm run balance:simulate -- 1000 standard
```

The runner executes 9,000 deterministic simplified Standard runs across three difficulty levels and three player-behavior profiles. It uses the production Chaos model, mode/difficulty multipliers, seeded randomness, authored event/finale pressure windows, intervention cadence, routing efficiency, tool cadence, and book-return relief.

| Difficulty | Profile | Completion | Last Call | Average max Chaos | Average returns |
|---|---|---:|---:|---:|---:|
| Calm | Newcomer | 3.5% | 98.0% | 99.7 | 193.8 |
| Calm | Learning | 98.9% | 2.3% | 31.2 | 299.6 |
| Calm | Expert | 100.0% | 0.0% | 13.1 | 307.6 |
| Classic | Newcomer | 0.0% | 100.0% | 100.0 | 148.9 |
| Classic | Learning | 21.3% | 88.0% | 97.5 | 378.9 |
| Classic | Expert | 77.2% | 35.3% | 75.4 | 419.4 |
| Heated | Newcomer | 0.0% | 100.0% | 100.0 | 132.8 |
| Heated | Learning | 0.2% | 99.9% | 100.0 | 383.5 |
| Heated | Expert | 16.9% | 92.0% | 98.7 | 453.3 |

## Interpretation

- The modeled Classic learning profile lands inside the roadmap's intended 20–35% completion band after several learning runs.
- Calm meaningfully changes the experience rather than applying a cosmetic label.
- Heated is a mastery challenge; even the expert model wins fewer than one in five runs.
- Classic produces recoverable crisis pressure rather than a uniformly safe run.
- The contextual tutorial starts with fewer books and visitors than this general-run model, so the simulated Calm newcomer result is not an onboarding completion forecast.

This is a tuning regression tool, not proof of fun or a substitute for human play. Collision, route choice, upgrade judgment, visual comprehension, and voluntary replay intent require the external protocol in `docs/PLAYTEST_GUIDE.md`.
