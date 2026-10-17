import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { pickGreenDetails } from './lib/pick';
import { runSite } from './lib/run';
import { setFromEnv } from './lib/sets';

it('lists the Green jobs whose detail pages to fetch', () => {
  const set = setFromEnv();
  const paths = pickGreenDetails(runSite('green', process.cwd(), set), set.greenDetailMax);
  mkdirSync(set.workDir, { recursive: true });
  writeFileSync(`${set.workDir}/green-details.txt`, `${paths.join('\n')}\n`);
  console.log(`${set.workDir}/green-details.txt: ${paths.length} jobs`);
});
