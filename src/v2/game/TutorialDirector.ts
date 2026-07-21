export type TutorialEvent = 'book-collected' | 'book-shelved' | 'intervene' | 'signature';

export type TutorialStepId = 'pickup' | 'return' | 'intervene' | 'signature' | 'chaos';

export interface TutorialStep {
  id: TutorialStepId;
  number: number;
  total: number;
  title: string;
  description: string;
  key: string;
}

const TOTAL_STEPS = 5;

const STEPS: TutorialStep[] = [
  {
    id: 'pickup',
    number: 1,
    total: TOTAL_STEPS,
    title: 'Pick up the glowing book',
    description: 'Walk to the gold ring. Loose books jump into your carry rack automatically.',
    key: 'WASD / left stick',
  },
  {
    id: 'return',
    number: 2,
    total: TOTAL_STEPS,
    title: 'Match the shelf',
    description: 'Follow the gold marker to the shelf with the same color and symbol.',
    key: 'Follow the marker',
  },
  {
    id: 'intervene',
    number: 3,
    total: TOTAL_STEPS,
    title: 'Stop nearby trouble',
    description: 'Get close to the highlighted visitor, then Intervene. This is fast and local.',
    key: 'Space / A',
  },
  {
    id: 'signature',
    number: 4,
    total: TOTAL_STEPS,
    title: 'Calm the whole group',
    description: 'Use Shush Wave when several visitors are inside its wide radius.',
    key: 'Q / LB',
  },
  {
    id: 'chaos',
    number: 5,
    total: TOTAL_STEPS,
    title: 'Keep Chaos below 100',
    description: 'Books create Clutter, visitors create Noise, and hazards create Disorder. Solve the biggest source first.',
    key: 'Watch Library condition',
  },
];

const EXPECTED_EVENT: Partial<Record<TutorialStepId, TutorialEvent>> = {
  pickup: 'book-collected',
  return: 'book-shelved',
  intervene: 'intervene',
  signature: 'signature',
};

export class TutorialDirector {
  private index = 0;
  private elapsedInStep = 0;
  private completed = false;

  constructor(readonly enabled: boolean) {
    this.completed = !enabled;
  }

  get active(): boolean {
    return this.enabled && !this.completed;
  }

  get current(): TutorialStep | null {
    return this.active ? (STEPS[this.index] ?? null) : null;
  }

  record(event: TutorialEvent): TutorialStep | null {
    const step = this.current;
    if (!step || EXPECTED_EVENT[step.id] !== event) return null;
    this.index = Math.min(STEPS.length - 1, this.index + 1);
    this.elapsedInStep = 0;
    return this.current;
  }

  update(delta: number): boolean {
    const step = this.current;
    if (!step) return false;
    this.elapsedInStep += Math.max(0, delta);
    if (step.id !== 'chaos' || this.elapsedInStep < 4.5) return false;
    this.completed = true;
    return true;
  }

  snapshot(): { active: boolean; step: TutorialStep | null } {
    return { active: this.active, step: this.current };
  }
}
