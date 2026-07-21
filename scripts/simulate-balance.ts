import { simulateMatrix } from '../src/v2/game/BalanceSimulator';
import type { RunMode } from '../src/v2/types';

const requestedRuns = Number.parseInt(process.argv[2] ?? '1000', 10);
const requestedMode = (process.argv[3] ?? 'standard') as RunMode;
const runs = Number.isFinite(requestedRuns) ? Math.max(10, Math.min(25_000, requestedRuns)) : 1_000;
const mode = requestedMode === 'quick' || requestedMode === 'daily' || requestedMode === 'standard'
  ? requestedMode
  : 'standard';

const results = simulateMatrix(runs, mode);

console.log(`\nThe Librarian 2.0 simplified balance simulation · ${runs.toLocaleString()} runs/cell · ${mode}\n`);
console.table(
  results.map((result) => ({
    Difficulty: result.difficulty,
    Profile: result.profile,
    'Win %': (result.completionRate * 100).toFixed(1),
    'Last Call %': (result.lastCallRate * 100).toFixed(1),
    'Avg max Chaos': result.averageMaxChaos.toFixed(1),
    'P95 max Chaos': result.p95MaxChaos.toFixed(1),
    'Avg recoveries': result.averageRecoveries.toFixed(2),
    'Avg returns': result.averageBooksReturned.toFixed(1),
    'Median seconds': result.p50Elapsed.toFixed(0),
  })),
);

console.log('\nThis is a deterministic systems smoke test, not a substitute for human completion-rate and replay-intent data.\n');
