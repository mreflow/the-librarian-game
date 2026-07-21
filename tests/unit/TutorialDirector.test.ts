import { describe, expect, it } from 'vitest';

import { TutorialDirector } from '../../src/v2/game/TutorialDirector';

describe('TutorialDirector', () => {
  it('requires the real core actions in order', () => {
    const tutorial = new TutorialDirector(true);
    expect(tutorial.current?.id).toBe('pickup');

    expect(tutorial.record('intervene')).toBeNull();
    expect(tutorial.current?.id).toBe('pickup');
    expect(tutorial.record('book-collected')?.id).toBe('return');

    expect(tutorial.record('signature')).toBeNull();
    expect(tutorial.record('book-shelved')?.id).toBe('intervene');
    expect(tutorial.record('intervene')?.id).toBe('signature');
    expect(tutorial.record('signature')?.id).toBe('chaos');
  });

  it('finishes only after the Chaos recap has stayed visible', () => {
    const tutorial = new TutorialDirector(true);
    tutorial.record('book-collected');
    tutorial.record('book-shelved');
    tutorial.record('intervene');
    tutorial.record('signature');

    expect(tutorial.update(4.4)).toBe(false);
    expect(tutorial.active).toBe(true);
    expect(tutorial.update(0.1)).toBe(true);
    expect(tutorial.active).toBe(false);
  });

  it('stays inactive when tutorial mode is disabled', () => {
    const tutorial = new TutorialDirector(false);
    expect(tutorial.active).toBe(false);
    expect(tutorial.current).toBeNull();
    expect(tutorial.record('book-collected')).toBeNull();
  });
});
