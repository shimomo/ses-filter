import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { renderReview, reviewItems } from './lib/report';
import { runAll } from './lib/run';
import { setFromEnv } from './lib/sets';

it('writes the review list of the chosen set', () => {
  const set = setFromEnv();
  const runs = runAll(process.cwd(), set);
  mkdirSync(path.dirname(set.review), { recursive: true });
  writeFileSync(set.review, renderReview(runs));
  console.log(`${set.review}: ${reviewItems(runs).length} items`);
});
