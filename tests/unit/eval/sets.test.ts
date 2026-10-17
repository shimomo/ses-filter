import { describe, expect, it } from 'vitest';
import { HOLDOUT, setFromEnv, TUNING } from '../../../eval/lib/sets';

describe('setFromEnv', () => {
  it('chooses the tuning set by default and the holdout set by name', () => {
    expect(setFromEnv(undefined)).toBe(TUNING);
    expect(setFromEnv('')).toBe(TUNING);
    expect(setFromEnv('tuning')).toBe(TUNING);
    expect(setFromEnv('holdout')).toBe(HOLDOUT);
    expect(() => setFromEnv('other')).toThrow('EVAL_SET');
  });

  it('keeps the holdout pages, labels and outputs apart from the tuning set', () => {
    expect(HOLDOUT.pageDirs('green')).toEqual(['eval/holdout/pages/green']);
    expect(TUNING.pageDirs('green')).toEqual(['tests/fixtures/green', 'eval/pages/green']);
    expect([HOLDOUT.labelsDir, HOLDOUT.report, HOLDOUT.review]).toEqual(['eval/holdout/labels', 'eval/holdout/report.md', 'eval/holdout/review.md']);
    expect(HOLDOUT.exclude).toBe(TUNING);
  });
});
