import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { renderReport, summaryLines } from './lib/report';
import { runAll } from './lib/run';
import { setFromEnv } from './lib/sets';

it('measures the rules and writes the report of the chosen set', () => {
  const set = setFromEnv();
  const runs = runAll(process.cwd(), set);
  const commit = execSync('git rev-parse --short HEAD').toString().trim();
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  mkdirSync(path.dirname(set.report), { recursive: true });
  writeFileSync(set.report, renderReport(runs, { date, commit, set: set.name }));
  console.log(`${set.report}`);
  console.log(summaryLines(runs).join('\n'));
});
