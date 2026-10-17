import type { PageStats } from '../../src/core/messages';

export function formatStats(stats: PageStats | null): string[] {
  if (!stats || !stats.listPage) return ['このページは対象外です'];
  const lines = [`カード ${stats.cards}件：隠した ${stats.hidden}／要確認 ${stats.flagged}／判定中 ${stats.pending}／認識できない ${stats.unrecognized}`];
  const top = Object.entries(stats.reasons)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .slice(0, 5);
  for (const [label, count] of top) lines.push(`・${label}：${count}件`);
  for (const warning of stats.warnings) lines.push(`⚠ ${warning}`);
  return lines;
}
