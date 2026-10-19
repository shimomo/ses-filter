import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADAPTERS, SITES, buildSiteData, countedOnly, detailJobId, jobUrl, loadSite, pageFiles } from '../../../eval/lib/pages';
import { greenCard, greenListPage, paizaCard, paizaDetailPage, paizaListPage, parseHtml } from '../../helpers/synthetic';
import { HOLDOUT } from '../../../eval/lib/sets';

const page = (file: string, html: string) => ({ file, doc: parseHtml(html) });
const SES_GREEN = {
  companyId: '101',
  jobId: '1001',
  company: '株式会社 サンプル',
  title: 'プライム案件のエンジニア',
  businessName: 'システムエンジニアリングサービス',
  businessIntro: 'SES事業',
};
const CLEAN_GREEN = { companyId: '102', jobId: '2001', company: '株式会社 見本', title: '社内SE', businessName: '自社サービス', businessIntro: '自社開発' };

describe('buildSiteData', () => {
  it('counts a job that appears on two pages once, keeping the card from the first page', () => {
    const first = page('a.html', greenListPage([greenCard(SES_GREEN)]));
    const second = page('b.html', greenListPage([greenCard({ ...SES_GREEN, title: '別の書き方' }), greenCard(CLEAN_GREEN)]));
    const data = buildSiteData('green', [first, second], []);
    expect(data.cards.map((item) => [item.card.jobId, item.page])).toEqual([
      ['1001', 'a.html'],
      ['2001', 'b.html'],
    ]);
    expect(data.cards[0]?.card.fields.title).toBe('プライム案件のエンジニア');
    expect(data.duplicates).toBe(1);
  });

  it('leaves out cards the adapter cannot read and cards without a job ID, and counts them', () => {
    const a = paizaCard({ jobId: '11', recruiterId: '1', company: 'A社', title: 'SE' });
    const b = paizaCard({ jobId: '12', recruiterId: '2', company: 'B社', title: 'PG' });
    const noId = paizaCard({ jobId: '', recruiterId: '3', company: 'C社', title: 'QA' });
    const data = buildSiteData('paiza', [page('p.html', paizaListPage([`<div class="s-job-offer-card">${a}${b}</div>`, noId]))], []);
    expect(data.cards.map((item) => item.card.jobId)).toEqual(['11', '12']);
    expect(data.unrecognized).toBe(1);
    expect(data.withoutId).toBe(1);
  });

  it('reads paiza detail pages with the extension parser and keeps their text for labeling', () => {
    const list = page('p.html', paizaListPage([paizaCard({ jobId: '11', recruiterId: '1', company: 'A社', title: 'SE' })]));
    const detail = page(
      'eval/pages/paiza/2026-10-17-detail-11.html',
      paizaDetailPage({ jobId: '11', recruiterId: '1', company: 'A社', title: 'SE', devTypes: '受託開発（社外常駐）' }),
    );
    const data = buildSiteData('paiza', [list], [detail]);
    expect(data.details.get('11')?.devContentsTypes).toEqual(['受託開発（社外常駐）']);
    expect(data.detailTexts.get('11')).toContain('開発内容タイプ: 受託開発（社外常駐）');
  });

  it('keeps Green detail pages as text only', () => {
    const list = page('g.html', greenListPage([greenCard(SES_GREEN)]));
    const detail = page('eval/pages/green/2026-10-17-detail-1001.html', '<html><body><header>メニュー</header><main><p>勤務地：各プロジェクト先</p></main></body></html>');
    const data = buildSiteData('green', [list], [detail]);
    expect(data.details.size).toBe(0);
    expect(data.detailTexts.get('1001')).toBe('勤務地：各プロジェクト先');
  });
});

describe('SITES', () => {
  it('evaluates mynavi with its adapter', () => {
    expect(SITES).toContain('mynavi');
    expect(ADAPTERS.mynavi?.site).toBe('mynavi');
  });
});

describe('detailJobId', () => {
  it('reads the job ID from the file name first, then from the canonical link', () => {
    expect(detailJobId('eval/pages/paiza/2026-10-17-detail-5002.html', parseHtml('<html></html>'))).toBe('5002');
    const paiza = parseHtml('<html><head><link rel="canonical" href="https://paiza.jp/career/job_offers/5001"></head></html>');
    expect(detailJobId('tests/fixtures/paiza/2026-10-16-detail.html', paiza)).toBe('5001');
    const green = parseHtml('<html><head><link rel="canonical" href="https://www.green-japan.com/company/1/job/99"></head></html>');
    expect(detailJobId('x-detail.html', green)).toBe('99');
    expect(detailJobId('x-detail.html', parseHtml('<html></html>'))).toBeNull();
  });

  it('reads a hyphenated mynavi job id from the file name and from the canonical link', () => {
    expect(detailJobId('eval/pages/mynavi/2026-10-18-detail-100-1-2-1.html', parseHtml('<html></html>'))).toBe('100-1-2-1');
    const mynavi = parseHtml('<html><head><link rel="canonical" href="https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/"></head></html>');
    expect(detailJobId('tests/fixtures/mynavi/2026-10-18-detail.html', mynavi)).toBe('100-1-2-1');
  });
});

describe('pageFiles and loadSite', () => {
  it('lists tests/fixtures first, then eval/pages by file name, and separates the detail pages', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ses-eval-'));
    const files: Array<[string, string]> = [
      ['tests/fixtures/paiza', '2026-10-16-list.html'],
      ['tests/fixtures/paiza', '2026-10-16-detail.html'],
      ['eval/pages/paiza', '2026-10-17-list-3.html'],
      ['eval/pages/paiza', '2026-10-17-list-2.html'],
      ['eval/pages/paiza', '2026-10-17-detail-5.html'],
      ['eval/pages/mynavi', '2026-10-18-detail-100-1-2-1.html'],
      ['eval/pages/mynavi', '2026-10-18-list-2.html'],
    ];
    for (const [dir, name] of files) {
      mkdirSync(path.join(root, dir), { recursive: true });
      writeFileSync(path.join(root, dir, name), '<html></html>');
    }
    const { lists, details } = pageFiles('paiza', root);
    expect(lists.map((file) => path.relative(root, file))).toEqual([
      'tests/fixtures/paiza/2026-10-16-list.html',
      'eval/pages/paiza/2026-10-17-list-2.html',
      'eval/pages/paiza/2026-10-17-list-3.html',
    ]);
    expect(details.map((file) => path.relative(root, file))).toEqual(['tests/fixtures/paiza/2026-10-16-detail.html', 'eval/pages/paiza/2026-10-17-detail-5.html']);
    const mynavi = pageFiles('mynavi', root);
    expect(mynavi.lists.map((file) => path.relative(root, file))).toEqual(['eval/pages/mynavi/2026-10-18-list-2.html']);
    expect(mynavi.details.map((file) => path.relative(root, file))).toEqual(['eval/pages/mynavi/2026-10-18-detail-100-1-2-1.html']);
  });

  it('loads a Green page saved in tests/fixtures', () => {
    // 保存したページは公開していないので、合成のページを一時フォルダに置いて確かめる
    const root = mkdtempSync(path.join(tmpdir(), 'ses-eval-'));
    mkdirSync(path.join(root, 'tests/fixtures/green'), { recursive: true });
    writeFileSync(path.join(root, 'tests/fixtures/green/2026-10-16-search.html'), greenListPage([greenCard(SES_GREEN), greenCard(CLEAN_GREEN)]));
    const data = loadSite('green', root);
    expect(data.pages).toEqual(['tests/fixtures/green/2026-10-16-search.html']);
    expect(data.cards.map((item) => item.card.jobId)).toEqual(['1001', '2001']);
  });

  it('reads only the holdout folder for the holdout set and leaves out jobs labeled in the tuning set', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ses-eval-'));
    mkdirSync(path.join(root, 'eval/holdout/pages/green'), { recursive: true });
    mkdirSync(path.join(root, 'eval/labels'), { recursive: true });
    mkdirSync(path.join(root, 'tests/fixtures/green'), { recursive: true });
    writeFileSync(path.join(root, 'tests/fixtures/green/2026-10-16-search.html'), greenListPage([greenCard({ ...CLEAN_GREEN, jobId: '3001' })]));
    writeFileSync(path.join(root, 'eval/holdout/pages/green/2026-10-20-search-a.html'), greenListPage([greenCard(SES_GREEN), greenCard(CLEAN_GREEN)]));
    const tuningLabel = { jobId: '1001', company: 'X', title: 'Y', label: 'ses', evidence: ['Green 事業：SES'], by: 'claude', note: '' };
    writeFileSync(path.join(root, 'eval/labels/green.json'), JSON.stringify([tuningLabel]));
    expect(loadSite('green', root, HOLDOUT).cards).toHaveLength(2);
    const data = countedOnly(loadSite('green', root, HOLDOUT), root, HOLDOUT);
    expect(data.pages).toEqual(['eval/holdout/pages/green/2026-10-20-search-a.html']);
    expect(data.cards.map((item) => item.card.jobId)).toEqual(['2001']);
    expect(data.excluded).toBe(1);
  });

  it('builds the job page URL for each site', () => {
    expect(jobUrl('paiza', { jobId: '1', companyKey: '2' })).toBe('https://paiza.jp/career/job_offers/1');
    expect(jobUrl('green', { jobId: '1', companyKey: '2' })).toBe('https://www.green-japan.com/company/2/job/1');
    expect(jobUrl('doda', { jobId: '1', companyKey: 'x' })).toBe('https://doda.jp/DodaFront/View/JobSearchDetail/j_jid__1/');
    expect(jobUrl('mynavi', { jobId: '100-1-2-1', companyKey: '100' })).toBe('https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/');
  });
});
