import { describe, expect, it } from 'vitest';
import { normalizeCompanyName, squash } from '../../src/core/normalize';

describe('normalizeCompanyName', () => {
  it.each([
    ['株式会社 サンプル', '株式会社サンプル'],
    ['（株）テスト技研', '株式会社テスト技研'],
    ['㈱テスト技研', '株式会社テスト技研'],
    ['(有)テスト商事', '有限会社テスト商事'],
    ['【東証プライム上場】株式会社ＡＢＣ', '株式会社abc'],
    ['ＸＹＺ　サンプル株式会社', 'xyzサンプル株式会社'],
    ['株式会社XYZ［東京本社］', '株式会社xyz'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeCompanyName(input)).toBe(expected);
  });
});

describe('squash', () => {
  it('collapses whitespace and trims', () => {
    expect(squash('  a\n  b\tc  ')).toBe('a b c');
  });

  it('treats null and undefined as empty', () => {
    expect(squash(null)).toBe('');
    expect(squash(undefined)).toBe('');
  });
});
