import { CONDITIONS, type SiteRun } from './types';

/**
 * Green の詳細ページを取る求人のパス（仕様 4.1）。どれかの条件で隠す求人 → 要確認の求人 → ラベルが unknown の求人の順。
 * 詳細ページをすでに保存してある求人は除き、max 件まで
 */
export function pickGreenDetails(run: SiteRun, max = 30): string[] {
  const labelOf = new Map(run.labels.map((label) => [label.jobId, label.label]));
  const rank = (jobId: string): number => {
    const levels = CONDITIONS.map(({ id }) => run.verdicts[id].get(jobId)?.level);
    if (levels.includes('hide')) return 0;
    if (levels.includes('flag')) return 1;
    return (labelOf.get(jobId) ?? 'unknown') === 'unknown' ? 2 : 3;
  };
  return run.data.cards
    .filter(({ card }) => !run.data.detailTexts.has(card.jobId))
    .map((item, index) => ({ item, index, rank: rank(item.card.jobId) }))
    .filter((entry) => entry.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, max)
    .map(({ item }) => new URL(item.url).pathname);
}
