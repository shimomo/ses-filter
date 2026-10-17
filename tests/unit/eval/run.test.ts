import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runSite } from '../../../eval/lib/run';
import { HOLDOUT } from '../../../eval/lib/sets';
import { greenCard, greenListPage } from '../../helpers/synthetic';

describe('runSite on the holdout set', () => {
  it('lets a tuning job left out of the count still make its company a target', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ses-eval-'));
    mkdirSync(path.join(root, 'eval/holdout/pages/green'), { recursive: true });
    mkdirSync(path.join(root, 'eval/labels'), { recursive: true });
    const known = greenCard({ companyId: '500', jobId: '1', company: 'M社', title: 'SES案件多数のインフラエンジニア' });
    const fresh = greenCard({ companyId: '500', jobId: '2', company: 'M社', title: '自社サービスのWebエンジニア' });
    writeFileSync(path.join(root, 'eval/holdout/pages/green/2026-10-20-search-a.html'), greenListPage([known, fresh]));
    const tuningLabel = { jobId: '1', company: 'M社', title: 'T', label: 'ses', evidence: ['Green タイトル：SES案件多数'], by: 'claude', note: '' };
    writeFileSync(path.join(root, 'eval/labels/green.json'), JSON.stringify([tuningLabel]));
    const run = runSite('green', root, HOLDOUT);
    expect(run.data.cards.map((item) => item.card.jobId)).toEqual(['2']);
    expect(run.data.excluded).toBe(1);
    expect(run.verdicts.company.get('2')).toMatchObject({ level: 'hide', decidedAt: 'company' });
  });
});
