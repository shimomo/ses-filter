import { describe, expect, it } from 'vitest';
import { seededSample } from '../../../eval/lib/sample';

describe('seededSample', () => {
  const items = Array.from({ length: 50 }, (_, i) => i);

  it('picks the same items for the same seed, without repeats, in their original order', () => {
    const first = seededSample(items, 20, 20261017);
    expect(seededSample(items, 20, 20261017)).toEqual(first);
    expect(first).toHaveLength(20);
    expect(new Set(first).size).toBe(20);
    expect([...first].sort((a, b) => a - b)).toEqual(first);
  });

  it('picks differently for another seed and returns everything when asked for more', () => {
    expect(seededSample(items, 20, 1)).not.toEqual(seededSample(items, 20, 2));
    expect(seededSample([3, 1, 2], 10, 5)).toEqual([3, 1, 2]);
  });
});
