import type { Verdict } from '../../src/core/types';
import type { Label } from './types';

export type Metrics = {
  /** unknown を除いて数えた求人 */
  counted: number;
  unknown: number;
  targets: number;
  others: number;
  hidden: number;
  hiddenTargets: number;
  hiddenOthers: number;
  hiddenUnknown: number;
  /** 隠したもののうち対象の割合。隠したものがなければ null */
  precision: number | null;
  /** 対象のうち隠したものの割合。対象がなければ null */
  recall: number | null;
  /** SES として隠したものが派遣だった（またはその逆）件数。対象には違いないので正解に数える */
  swapped: number;
  flaggedTargets: number;
  flaggedOthers: number;
  /** 対象なのに何もしなかった件数 */
  missed: number;
};

export const isTarget = (label: Label): boolean => label === 'ses' || label === 'haken';

/** 判定とラベルの組を数える（仕様 6.3）。判定が「隠す」なら表示モードによらず隠したものとする */
export function computeMetrics(pairs: ReadonlyArray<{ label: Label; verdict: Verdict }>): Metrics {
  const c: Omit<Metrics, 'precision' | 'recall'> = {
    counted: 0,
    unknown: 0,
    targets: 0,
    others: 0,
    hidden: 0,
    hiddenTargets: 0,
    hiddenOthers: 0,
    hiddenUnknown: 0,
    swapped: 0,
    flaggedTargets: 0,
    flaggedOthers: 0,
    missed: 0,
  };
  for (const { label, verdict } of pairs) {
    const hidden = verdict.level === 'hide';
    if (label === 'unknown') {
      c.unknown += 1;
      if (hidden) c.hiddenUnknown += 1;
      continue;
    }
    c.counted += 1;
    if (isTarget(label)) {
      c.targets += 1;
      if (hidden) {
        c.hidden += 1;
        c.hiddenTargets += 1;
        if (verdict.category && verdict.category !== label) c.swapped += 1;
      } else if (verdict.level === 'flag') c.flaggedTargets += 1;
      else c.missed += 1;
    } else {
      c.others += 1;
      if (hidden) {
        c.hidden += 1;
        c.hiddenOthers += 1;
      } else if (verdict.level === 'flag') c.flaggedOthers += 1;
    }
  }
  return {
    ...c,
    precision: c.hidden > 0 ? c.hiddenTargets / c.hidden : null,
    recall: c.targets > 0 ? c.hiddenTargets / c.targets : null,
  };
}

export const formatRate = (rate: number | null): string => (rate === null ? '—' : `${(rate * 100).toFixed(1)}%`);
