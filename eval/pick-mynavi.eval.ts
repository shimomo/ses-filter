import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { prefetchTargets } from './lib/conditions';
import { jobUrl, loadSite } from './lib/pages';
import { setFromEnv } from './lib/sets';

// ③で先読みする求人のうち、詳細ページをまだ保存していないものの URL を書き出す（マイナビ転職の仕様 7.1・7.6。取得は sakura 経由の curl で1秒に1件）
it('lists the mynavi jobs whose detail pages to fetch', () => {
  const set = setFromEnv();
  const data = loadSite('mynavi', process.cwd(), set);
  const urls = prefetchTargets(data)
    .filter((item) => !data.detailTexts.has(item.card.jobId))
    .map((item) => jobUrl('mynavi', item.card));
  mkdirSync(set.workDir, { recursive: true });
  writeFileSync(`${set.workDir}/mynavi-details.txt`, `${urls.join('\n')}\n`);
  console.log(`${set.workDir}/mynavi-details.txt: ${urls.length} jobs`);
});
