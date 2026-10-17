import type { Site } from '../../src/core/types';
import { judgeSite } from './conditions';
import { labelWarnings, readLabels } from './labels';
import { countedOnly, loadSite, SITES } from './pages';
import { TUNING, type EvalSet } from './sets';
import type { SiteRun } from './types';

/** サイトの評価ページとラベルを読み、3つの条件で判定する */
export function runSite(site: Site, root: string = process.cwd(), set: EvalSet = TUNING): SiteRun {
  // 判定はページのカードすべてで行い、数えるのは確かめ用の新しい求人だけにする（段階2b 仕様 6.1・6.2）
  const all = loadSite(site, root, set);
  const data = countedOnly(all, root, set);
  const labels = readLabels(site, root, set);
  return {
    data,
    labels,
    verdicts: { card: judgeSite(all, 'card'), company: judgeSite(all, 'company'), usual: judgeSite(all, 'usual') },
    warnings: labelWarnings(data.cards, labels),
  };
}

export const runAll = (root: string = process.cwd(), set: EvalSet = TUNING): SiteRun[] => SITES.map((site) => runSite(site, root, set));
