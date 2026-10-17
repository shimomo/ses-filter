import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { labelWarnings, readLabels, withSkeletons, writeLabels } from './lib/labels';
import { countedOnly, loadSite, SITES } from './lib/pages';
import { renderCardSheet } from './lib/report';
import { setFromEnv } from './lib/sets';

it('writes the labeling sheets and adds unknown labels for jobs without one', () => {
  const set = setFromEnv();
  mkdirSync(set.workDir, { recursive: true });
  for (const site of SITES) {
    const data = countedOnly(loadSite(site, process.cwd(), set), process.cwd(), set);
    const labels = withSkeletons(data.cards, readLabels(site, process.cwd(), set));
    writeLabels(site, labels, process.cwd(), set);
    writeFileSync(`${set.workDir}/${site}-cards.md`, renderCardSheet(data, labels));
    console.log(`${site}: ${data.cards.length} cards, ${labels.length} labels`);
    for (const warning of labelWarnings(data.cards, labels)) console.log(`⚠ ${site}: ${warning}`);
  }
});
