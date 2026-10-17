import { describe, expect, it } from 'vitest';
import { computeMetrics, formatRate } from '../../../eval/lib/metrics';
import type { Label } from '../../../eval/lib/types';
import type { Verdict } from '../../../src/core/types';

const v = (level: Verdict['level'], category?: 'ses' | 'haken'): Verdict => ({ level, category, reasons: [] });
const pair = (label: Label, verdict: Verdict) => ({ label, verdict });

describe('computeMetrics', () => {
  it('counts hides, flags and misses against the labels, leaving unknown out', () => {
    const m = computeMetrics([
      pair('ses', v('hide', 'ses')),
      pair('haken', v('hide', 'ses')),
      pair('other', v('hide', 'ses')),
      pair('ses', v('flag', 'ses')),
      pair('other', v('flag', 'ses')),
      pair('ses', v('none')),
      pair('other', v('none')),
      pair('unknown', v('hide', 'ses')),
      pair('unknown', v('none')),
    ]);
    expect(m).toMatchObject({
      counted: 7,
      unknown: 2,
      targets: 4,
      others: 3,
      hidden: 3,
      hiddenTargets: 2,
      hiddenOthers: 1,
      hiddenUnknown: 1,
      swapped: 1,
      flaggedTargets: 1,
      flaggedOthers: 1,
      missed: 1,
    });
    expect(m.precision).toBeCloseTo(2 / 3);
    expect(m.recall).toBeCloseTo(2 / 4);
  });

  it('has no precision when nothing is hidden and no recall when there is no target', () => {
    const m = computeMetrics([pair('other', v('none'))]);
    expect(m.precision).toBeNull();
    expect(m.recall).toBeNull();
    expect(formatRate(m.precision)).toBe('—');
    expect(formatRate(0.9876)).toBe('98.8%');
  });
});
