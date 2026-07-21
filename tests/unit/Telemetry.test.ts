import { describe, expect, it } from 'vitest';

import { Telemetry } from '../../src/v2/systems/Telemetry';

describe('Telemetry', () => {
  it('clears training events before the real shift begins', () => {
    const telemetry = new Telemetry();
    telemetry.record('run_started', 0, { mode: 'quick' });
    telemetry.record('first_pickup', 3);

    telemetry.reset();
    telemetry.record('run_started', 0, { mode: 'quick' });

    expect(telemetry.export()).toEqual([
      { event: 'run_started', at: 0, details: { mode: 'quick' } },
    ]);
  });
});
