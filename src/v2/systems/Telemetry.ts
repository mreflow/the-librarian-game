export type TelemetryEvent =
  | 'run_started'
  | 'first_pickup'
  | 'first_shelve'
  | 'first_intervention'
  | 'upgrade_offered'
  | 'upgrade_selected'
  | 'objective_started'
  | 'objective_completed'
  | 'objective_failed'
  | 'event_started'
  | 'finale_started'
  | 'last_call'
  | 'last_call_recovered'
  | 'run_finished';

interface TimelineEntry {
  event: TelemetryEvent;
  at: number;
  details?: Record<string, string | number | boolean>;
}

export class Telemetry {
  private readonly timeline: TimelineEntry[] = [];

  record(event: TelemetryEvent, at: number, details?: TimelineEntry['details']): void {
    this.timeline.push({ event, at, details });
    if (import.meta.env.DEV) console.debug(`[telemetry] ${event}`, details ?? {});
  }

  export(): TimelineEntry[] {
    return structuredClone(this.timeline);
  }

  reset(): void {
    this.timeline.length = 0;
  }
}
