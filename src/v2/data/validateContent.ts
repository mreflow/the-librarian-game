import { GENRES, KIDS, LIBRARIANS, PASSIVES, TOOLS } from './content';
import { MAPS } from './maps';
import { EVENTS, FINALES, FINALE_OBJECTIVE, MODE_DURATION, OBJECTIVES, RUN_SCHEDULES } from './runContent';
import type { KidArchetype } from '../types';

export interface ContentValidationResult {
  ok: boolean;
  errors: string[];
}

const duplicateIds = (ids: string[]): string[] =>
  ids.filter((id, index) => ids.indexOf(id) !== index);

export const validateV2Content = (): ContentValidationResult => {
  const errors: string[] = [];
  const records = [
    ['kid', KIDS],
    ['tool', TOOLS],
    ['passive', PASSIVES],
    ['librarian', LIBRARIANS],
    ['map', MAPS],
  ] as const;

  for (const [kind, record] of records) {
    for (const [id, definition] of Object.entries(record)) {
      if (!definition || definition.id !== id) errors.push(`${kind} key ${id} does not match its embedded id.`);
    }
  }

  const genreDuplicates = duplicateIds(GENRES.map((genre) => genre.id));
  if (genreDuplicates.length) errors.push(`Duplicate genre ids: ${genreDuplicates.join(', ')}.`);
  if (new Set(GENRES.map((genre) => genre.icon)).size !== GENRES.length) errors.push('Genre symbols must be unique.');

  for (const tool of Object.values(TOOLS)) {
    if (tool.cooldown <= 0 || tool.maxRank <= 0) errors.push(`${tool.id} has an invalid cooldown or rank cap.`);
    if (tool.evolution && !PASSIVES[tool.evolution.passive]) errors.push(`${tool.id} references a missing evolution passive.`);
  }
  for (const librarian of Object.values(LIBRARIANS)) {
    if (!TOOLS[librarian.startingTool]) errors.push(`${librarian.id} references a missing starting tool.`);
  }
  for (const map of Object.values(MAPS)) {
    if (map.shelfLayout.length < 6 || map.spawnPoints.length < 4 || map.eventZones.length < 3) {
      errors.push(`${map.id} does not meet the authored-map topology minimums.`);
    }
  }

  const objectiveDuplicates = duplicateIds([...OBJECTIVES, FINALE_OBJECTIVE].map((objective) => objective.id));
  const eventDuplicates = duplicateIds(EVENTS.map((event) => event.id));
  if (objectiveDuplicates.length) errors.push(`Duplicate objective ids: ${objectiveDuplicates.join(', ')}.`);
  if (eventDuplicates.length) errors.push(`Duplicate event ids: ${eventDuplicates.join(', ')}.`);
  const eventIds = new Set(EVENTS.map((event) => event.id));
  for (const [mode, schedule] of Object.entries(RUN_SCHEDULES)) {
    let previous = -1;
    for (const beat of schedule) {
      if (beat.atRatio <= previous || beat.atRatio <= 0 || beat.atRatio >= 1) errors.push(`${mode} has an invalid schedule ratio.`);
      previous = beat.atRatio;
      if (beat.kind === 'event' && (!beat.id || !eventIds.has(beat.id))) errors.push(`${mode} references missing event ${beat.id}.`);
      if (beat.kind === 'archetype' && (!beat.id || !KIDS[beat.id as KidArchetype])) errors.push(`${mode} references missing kid ${beat.id}.`);
    }
    if (schedule.at(-1)?.kind !== 'finale') errors.push(`${mode} does not end in a finale beat.`);
    if (!Number.isFinite(MODE_DURATION[mode as keyof typeof RUN_SCHEDULES])) errors.push(`${mode} must have a finite duration.`);
  }
  if (!FINALES['field-trip'] || !FINALES['catalog-lockdown']) errors.push('Both map-specific finales are required.');

  return { ok: errors.length === 0, errors };
};

export const assertV2Content = (): void => {
  const result = validateV2Content();
  if (!result.ok) throw new Error(`Invalid Librarian 2.0 content:\n${result.errors.join('\n')}`);
};
