import { describe, expect, it } from 'vitest';
import { formatStats } from '../../entrypoints/popup/format';
import type { PageStats } from '../../src/core/messages';

const stats = (partial: Partial<PageStats> = {}): PageStats => ({
  site: 'paiza',
  listPage: true,
  cards: 20,
  hidden: 9,
  flagged: 2,
  pending: 3,
  unrecognized: 0,
  reasons: {},
  warnings: [],
  ...partial,
});

describe('formatStats', () => {
  it('says the page is not a target when there is no list', () => {
    expect(formatStats(null)).toEqual(['このページは対象外です']);
    expect(formatStats(stats({ listPage: false }))).toEqual(['このページは対象外です']);
  });

  it('shows counts, the top five reasons and warnings', () => {
    const lines = formatStats(
      stats({ reasons: { 還元率: 3, 'SES事業': 6, 帰社日: 2, 商流: 1, 派遣事業: 4, 案件選択: 5 }, warnings: ['詳細ページの取得を停止しました'] }),
    );
    expect(lines).toEqual([
      'カード 20件：隠した 9／要確認 2／判定中 3／認識できない 0',
      '・SES事業：6件',
      '・案件選択：5件',
      '・派遣事業：4件',
      '・還元率：3件',
      '・帰社日：2件',
      '⚠ 詳細ページの取得を停止しました',
    ]);
  });
});
