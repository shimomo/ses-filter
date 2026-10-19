import { describe, expect, it } from 'vitest';
import { mynaviAdapter, parseMynaviDetail } from '../../../src/sites/mynavi';
import { hasFixture, loadFixture } from '../../helpers/fixtures';
import { mynaviCard, mynaviDetailPage, mynaviListPage, parseHtml } from '../../helpers/synthetic';

const firstCard = (html: string) => mynaviAdapter.extract(mynaviAdapter.findCards(parseHtml(html))[0] as Element);

describe('mynavi pages', () => {
  it.each([
    ['https://tenshoku.mynavi.jp/engineer/list/o16/', true],
    ['https://tenshoku.mynavi.jp/engineer/list/o16/pg2/', true],
    ['https://tenshoku.mynavi.jp/engineer/list/o16/kwJava/', true],
    ['https://tenshoku.mynavi.jp/list/o16/', false],
    ['https://tenshoku.mynavi.jp/engineer/', false],
    ['https://tenshoku.mynavi.jp/jobinfo-100-1-1-1/', false],
    ['https://www.example.com/engineer/list/o16/', false],
  ])('%s is a list page: %s', (url, expected) => {
    expect(mynaviAdapter.isListPage(new URL(url))).toBe(expected);
  });
});

describe('mynaviAdapter.extract', () => {
  it('reads the job id, company key, company name, title, location and text', () => {
    const data = firstCard(
      mynaviListPage([
        mynaviCard({
          jobId: '100-1-2-1',
          company: '株式会社サンプル',
          catchCopy: '年休125日',
          title: 'Webエンジニア',
          location: '東京都（全国のプロジェクト先）',
          keywords: ['Java', '客先常駐'],
        }),
      ]),
    );
    expect(data).toMatchObject({ jobId: '100-1-2-1', companyKey: '100', companyName: '株式会社サンプル' });
    expect(data?.fields.title).toBe('Webエンジニア');
    expect(data?.fields.location).toBe('東京都（全国のプロジェクト先）');
    expect(data?.fields.text).toContain('年休125日');
    expect(data?.fields.text).toContain('Webエンジニア');
    // 関連キーワードはサイトが付ける欄なので読まない
    expect(data?.fields.text).not.toContain('客先常駐');
    expect(data?.fields.text).not.toContain('関連キーワード');
  });

  it('reads the company name when the title has no catch copy', () => {
    const data = firstCard(mynaviListPage([mynaviCard({ jobId: '100-1-2-1', company: '株式会社サンプル', title: 'Webエンジニア' })]));
    expect(data?.companyName).toBe('株式会社サンプル');
    expect(data?.fields.text).toContain('株式会社サンプル');
  });

  it('gives the jobs of one company the same company key', () => {
    const doc = parseHtml(
      mynaviListPage([
        mynaviCard({ jobId: '100-1-2-1', company: '株式会社サンプル', title: 'A' }),
        mynaviCard({ jobId: '100-1-3-1', company: '株式会社サンプル', title: 'B' }),
      ]),
    );
    const data = mynaviAdapter.findCards(doc).map((card) => mynaviAdapter.extract(card));
    expect(data.map((d) => d?.jobId)).toEqual(['100-1-2-1', '100-1-3-1']);
    expect(data.map((d) => d?.companyKey)).toEqual(['100', '100']);
  });

  it('does not recognize a container that links to two jobs', () => {
    const inner = mynaviCard({ jobId: '100-1-2-1', company: 'A社', title: 'A' }) + mynaviCard({ jobId: '200-1-1-1', company: 'B社', title: 'B' });
    const doc = parseHtml(mynaviListPage([`<section class="recruit engineer">${inner}</section>`]));
    const recognized = mynaviAdapter.findCards(doc).flatMap((card) => {
      const data = mynaviAdapter.extract(card);
      return data ? [data.companyKey] : [];
    });
    expect(recognized.sort()).toEqual(['100', '200']);
  });

  it('returns null without a job link', () => {
    expect(firstCard(mynaviListPage(['<section class="recruit engineer"><p class="main_title">A社</p></section>']))).toBeNull();
  });

  it.skipIf(!hasFixture('mynavi', 'list'))('extracts every card of the captured list page', () => {
    const cards = mynaviAdapter.findCards(loadFixture('mynavi', 'list'));
    expect(cards.length).toBe(50);
    for (const card of cards) {
      const data = mynaviAdapter.extract(card);
      expect(data?.jobId).toMatch(/^\d+(?:-\d+){3}$/);
      expect(data?.companyKey).toBe(data?.jobId?.split('-')[0]);
      expect(data?.companyName).not.toBe('');
      expect(data?.companyName).not.toContain('|');
      expect(data?.fields.title).toBeTruthy();
      expect(data?.fields.location).toBeTruthy();
      expect(data?.fields.text).not.toContain('関連キーワード');
    }
  });
});

describe('mynavi detail pages', () => {
  it('recognizes detail pages, reads their job id and builds the URL without adv1', () => {
    const d = mynaviAdapter.detail;
    expect(d?.isDetailPage(new URL('https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/'))).toBe(true);
    expect(d?.isDetailPage(new URL('https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/adv1/'))).toBe(true);
    expect(d?.isDetailPage(new URL('https://tenshoku.mynavi.jp/engineer/list/o16/'))).toBe(false);
    expect(d?.isDetailPage(new URL('https://tenshoku.mynavi.jp/jobinfo-100/'))).toBe(false);
    expect(d?.jobIdOf(new URL('https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/'))).toBe('100-1-2-1');
    expect(d?.jobIdOf(new URL('https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/adv1/'))).toBeNull();
    expect(d?.url({ jobId: '100-1-2-1', companyKey: '100', companyName: '', fields: { text: '' } })).toBe('https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/');
  });
});

const detailOptions = { jobId: '100-1-2-1', companyId: '100', company: '株式会社サンプル', title: 'Webエンジニア' };

describe('parseMynaviDetail', () => {
  it('reads business, the longest 勤務地, work hours, employment, company and title', () => {
    const detail = parseMynaviDetail(
      parseHtml(mynaviDetailPage({ ...detailOptions, business: '自社サービスの開発', location: '東京都新宿区（本社）', workHours: '9:00～18:00', employment: '正社員' })),
      '100-1-2-1',
    );
    expect(detail).toMatchObject({ jobId: '100-1-2-1', companyKey: '100', companyName: '株式会社サンプル', employment: '正社員' });
    expect(detail.devContentsTypes).toBeUndefined();
    expect(detail.fields.business).toBe('自社サービスの開発');
    expect(detail.fields.location).toBe('東京都新宿区（本社）');
    expect(detail.fields.workHours).toBe('9:00～18:00');
    expect(detail.fields.title).toContain('Webエンジニア');
    expect(detail.fields.text).toContain('業種: ソフトウェア・情報処理');
  });

  it('uses the longest of repeated 勤務地 rows', () => {
    const html = mynaviDetailPage({ ...detailOptions, location: '東京都' }).replace('<h1>', '<table><tr><th>勤務地</th><td>東京都新宿区のプロジェクト先</td></tr></table><h1>');
    expect(parseMynaviDetail(parseHtml(html), '100-1-2-1').fields.location).toBe('東京都新宿区のプロジェクト先');
  });

  it('adds the body sections to the text and reads the ad-type title', () => {
    const detail = parseMynaviDetail(parseHtml(mynaviDetailPage({ ...detailOptions, ad: true, body: [['仕事内容', '客先に常駐して開発します']] })), '100-1-2-1');
    expect(detail.fields.text).toContain('仕事内容: 客先に常駐して開発します');
    expect(detail.companyName).toBe('株式会社サンプル');
    expect(detail.fields.business).toBeUndefined();
    expect(detail.fields.workHours).toBeUndefined();
  });

  it('keeps each body section under its own heading, once', () => {
    const detail = parseMynaviDetail(
      parseHtml(mynaviDetailPage({ ...detailOptions, body: [['仕事内容', '客先に常駐して開発します'], ['対象となる方', '実務経験3年以上']] })),
      '100-1-2-1',
    );
    const lines = detail.fields.text.split('\n');
    expect(lines).toContain('仕事内容: 客先に常駐して開発します');
    expect(lines).toContain('対象となる方: 実務経験3年以上');
    expect(detail.fields.text.match(/客先に常駐して開発します/g)).toHaveLength(1);
    expect(lines.find((line) => line.startsWith('募集要項:'))).not.toContain('客先に常駐');
  });

  it('ignores the recommended jobs below the posting', () => {
    const detail = parseMynaviDetail(parseHtml(mynaviDetailPage({ ...detailOptions, business: '自社開発', recommended: ['還元率最大90%のエンジニア'] })), '100-1-2-1');
    expect(detail.fields.text).not.toContain('還元率');
  });

  it.skipIf(!hasFixture('mynavi', 'detail'))('reads the captured detail page', () => {
    const doc = loadFixture('mynavi', 'detail');
    const jobId = /jobinfo-(\d+(?:-\d+){3})\//.exec(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '')?.[1] ?? '';
    const detail = parseMynaviDetail(doc, jobId);
    expect(detail.companyKey).toBe(jobId.split('-')[0]);
    expect(detail.companyName).not.toBe('');
    expect(detail.fields.business).toBeTruthy();
    expect(detail.fields.location).toContain('東京都');
    expect(detail.fields.workHours).toBeTruthy();
    expect(detail.employment).toBe('正社員');
    expect(detail.fields.text).toContain('仕事内容:');
    expect(detail.fields.text).not.toContain('オススメ求人');
    // 区画ごとに本文を重複させない（見出しの数だけ左カラム全体を繰り返していた誤りを防ぐ）
    expect(detail.fields.text.length).toBeLessThan(15_000);
    const target = detail.fields.text.split('\n').find((line) => line.startsWith('対象となる方:'));
    expect(target).toBeDefined();
    expect(target).not.toContain('募集要項');
  });
});
