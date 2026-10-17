import { describe, expect, it } from 'vitest';
import { paizaAdapter, parsePaizaDetail } from '../../../src/sites/paiza';
import { hasFixture, loadFixture } from '../../helpers/fixtures';
import { paizaCard, paizaDetailPage, paizaListPage, parseHtml } from '../../helpers/synthetic';

describe('paiza pages', () => {
  it.each([
    ['https://paiza.jp/career/job_offers', true],
    ['https://paiza.jp/career/job_offers?free_words=Go', true],
    ['https://paiza.jp/career/job_offers/list/dev_language-227', true],
    ['https://paiza.jp/career/job_offers/topics/java_in-house', true],
    ['https://paiza.jp/career/job_offers/5002', false],
    ['https://paiza.jp/recruiters/502', false],
  ])('isListPage(%s) is %s', (url, expected) => {
    expect(paizaAdapter.isListPage(new URL(url))).toBe(expected);
  });

  it('recognizes detail pages and builds their URL', () => {
    expect(paizaAdapter.detail?.isDetailPage(new URL('https://paiza.jp/career/job_offers/5002'))).toBe(true);
    expect(paizaAdapter.detail?.isDetailPage(new URL('https://paiza.jp/career/job_offers'))).toBe(false);
    expect(paizaAdapter.detail?.url({ jobId: '5002', companyKey: '1', companyName: '', fields: { text: '' } })).toBe(
      'https://paiza.jp/career/job_offers/5002',
    );
  });
});

describe('paizaAdapter.extract', () => {
  it('reads ids, company and title, ignoring the other jobs of the company', () => {
    const doc = parseHtml(
      paizaListPage([
        paizaCard({ jobId: '5001', recruiterId: '501', company: 'ダミー株式会社', title: 'Webサービスの基盤構築', subJobTitle: '還元率90%のSREエンジニア' }),
      ]),
    );
    const [card] = paizaAdapter.findCards(doc);
    if (!card) throw new Error('no card');
    const data = paizaAdapter.extract(card);
    expect(data).toMatchObject({
      jobId: '5001',
      companyKey: '501',
      companyName: 'ダミー株式会社',
      fields: { title: 'Webサービスの基盤構築' },
    });
    expect(data?.fields.text).not.toContain('還元率');
  });

  it('falls back to the job link when data-analytics-info is missing', () => {
    const html = paizaCard({ jobId: '7', recruiterId: '8', company: 'A社', title: 'T' }).replaceAll(/ data-analytics-info='[^']*'/g, '');
    const [card] = paizaAdapter.findCards(parseHtml(paizaListPage([html])));
    if (!card) throw new Error('no card');
    expect(paizaAdapter.extract(card)?.jobId).toBe('7');
  });

  it('returns null without a recruiter link', () => {
    const [card] = paizaAdapter.findCards(parseHtml('<div class="s-job-offer-card"><a class="s-job-offer-card__name" href="/career/job_offers/1">x</a></div>'));
    if (!card) throw new Error('no card');
    expect(paizaAdapter.extract(card)).toBeNull();
  });

  it('does not recognize a container that holds several recruiters', () => {
    const inner =
      paizaCard({ jobId: '1', recruiterId: '10', company: 'A社', title: 'T' }) + paizaCard({ jobId: '2', recruiterId: '20', company: 'B社', title: 'U' });
    const doc = parseHtml(paizaListPage([`<div class="s-job-offer-card">${inner}</div>`]));
    const recognized = paizaAdapter.findCards(doc).flatMap((card) => {
      const data = paizaAdapter.extract(card);
      return data ? [data.companyKey] : [];
    });
    expect(recognized.sort()).toEqual(['10', '20']);
  });

  it.skipIf(!hasFixture('paiza', 'list'))('extracts every card of the captured list page', () => {
    const cards = paizaAdapter.findCards(loadFixture('paiza', 'list'));
    expect(cards.length).toBeGreaterThanOrEqual(10);
    for (const card of cards) {
      const data = paizaAdapter.extract(card);
      expect(data?.jobId).toMatch(/^\d+$/);
      expect(data?.companyKey).toMatch(/^\d+$/);
      expect(data?.companyName).not.toBe('');
      expect(data?.fields.title).toBeTruthy();
    }
  });
});

describe('parsePaizaDetail', () => {
  it('reads development type, employment, work hours, company and title', () => {
    const doc = parseHtml(
      paizaDetailPage({ jobId: '5002', recruiterId: '502', company: 'テスト株式会社', title: 'チームで参画！大手の案件', devTypes: '受託開発（社外常駐）、B2B、WEBサイト' }),
    );
    const detail = parsePaizaDetail(doc, '5002');
    expect(detail).toMatchObject({
      jobId: '5002',
      companyKey: '502',
      companyName: 'テスト株式会社',
      devContentsTypes: ['受託開発（社外常駐）', 'B2B', 'WEBサイト'],
      employment: '無期雇用',
      fields: { location: '東京都', workHours: 'フレックスタイム制' },
    });
    expect(detail.fields.title).toContain('チームで参画');
    expect(detail.fields.text).toContain('職種名: システムエンジニア');
  });

  it('joins repeated 勤務地 rows', () => {
    const doc = parseHtml(paizaDetailPage({ jobId: '1', recruiterId: '2', company: 'A', title: 'T', devTypes: 'B2B', extraRows: [['勤務地', '東京都港区西新橋 テレワーク可']] }));
    expect(parsePaizaDetail(doc, '1').fields.location).toBe('東京都 / 東京都港区西新橋 テレワーク可');
  });

  it('returns null development types when the row is missing', () => {
    const doc = parseHtml(paizaDetailPage({ jobId: '1', recruiterId: '2', company: 'A', title: 'T' }));
    expect(parsePaizaDetail(doc, '1').devContentsTypes).toBeNull();
  });

  it.skipIf(!hasFixture('paiza', 'detail'))('parses the captured detail page', () => {
    const detail = parsePaizaDetail(loadFixture('paiza', 'detail'), '1');
    expect(detail.devContentsTypes?.length).toBeGreaterThan(0);
    expect(detail.companyKey).toMatch(/^\d+$/);
    expect(detail.companyName).toBeTruthy();
    expect(detail.employment).toBeTruthy();
    expect(detail.fields.location).toBeTruthy();
    expect(detail.fields.business).toBeTruthy();
    expect(detail.fields.text).toContain('求人概要: ');
    expect(detail.fields.text).toContain('職務内容: ');
  });

  it('reads the job summary and description as text and the company description as business', () => {
    const doc = parseHtml(
      paizaDetailPage({
        jobId: '1',
        recruiterId: '2',
        company: 'A社',
        title: 'T',
        devTypes: '受託開発（自社内開発）',
        summary: '当社にはSES・人材紹介事業もあります。',
        description: '受託開発チームでWebアプリを開発します。',
        companyFeature: '■事業内容：人材派遣、SES、受託開発',
      }),
    );
    const detail = parsePaizaDetail(doc, '1');
    expect(detail.fields.business).toBe('■事業内容：人材派遣、SES、受託開発');
    expect(detail.fields.text).toContain('求人概要: 当社にはSES・人材紹介事業もあります。');
    expect(detail.fields.text).toContain('職務内容: 受託開発チームでWebアプリを開発します。');
    expect(detail.fields.text).not.toContain('更新日');
  });

  it("reads only the company description in the job's own company box", () => {
    const html = paizaDetailPage({ jobId: '1', recruiterId: '2', company: 'A社', title: 'T', devTypes: 'B2B', companyFeature: '自社サービスを開発しています' }).replace(
      '</body>',
      "<div class='m-recruiter-feature'><div class='m-recruiter-feature__text'>他社の説明：SES事業</div></div></body>",
    );
    expect(parsePaizaDetail(parseHtml(html), '1').fields.business).toBe('自社サービスを開発しています');
  });

  it('leaves business empty and adds nothing to the text when the page has no such sections', () => {
    const detail = parsePaizaDetail(parseHtml(paizaDetailPage({ jobId: '1', recruiterId: '2', company: 'A', title: 'T', devTypes: 'B2B' })), '1');
    expect(detail.fields.business).toBeUndefined();
    expect(detail.fields.text).not.toMatch(/求人概要|職務内容/);
  });
});
