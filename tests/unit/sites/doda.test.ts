import { describe, expect, it } from 'vitest';
import { judgeFields } from '../../../src/core/classify';
import { DODA_SELECTORS, dodaAdapter } from '../../../src/sites/doda';
import { hasFixture, loadFixture } from '../../helpers/fixtures';
import { dodaCard, dodaListPage, parseHtml } from '../../helpers/synthetic';

describe('dodaAdapter', () => {
  it.each([
    ['https://doda.jp/DodaFront/View/JobSearchList/j_k__/Java/', true],
    ['https://doda.jp/DodaFront/View/JobSearchList/j_oc__032102S/-op__70/-preBtn__3/', true],
    ['https://doda.jp/DodaFront/View/JobSearchDetail/j_jid__3000000001/', false],
  ])('isListPage(%s) is %s', (url, expected) => {
    expect(dodaAdapter.isListPage(new URL(url))).toBe(expected);
  });

  it('reads job id, normalized company key, location and business', () => {
    const doc = parseHtml(
      dodaListPage([
        dodaCard({ jobId: '3000000001', company: '株式会社EXAMPLE', title: '【Javaエンジニア】案件選択制', location: '都内を中心とする関東のプロジェクト先', business: '■SES事業■人材派遣事業' }),
      ]),
    );
    const [card] = dodaAdapter.findCards(doc);
    if (!card) throw new Error('no card');
    const data = dodaAdapter.extract(card);
    expect(data).toMatchObject({
      jobId: '3000000001',
      companyKey: '株式会社example',
      companyName: '株式会社EXAMPLE',
      fields: { title: '【Javaエンジニア】案件選択制', location: '都内を中心とする関東のプロジェクト先', business: '■SES事業■人材派遣事業' },
    });
    if (!data) throw new Error('no data');
    expect(judgeFields(data.fields, 'card-rule')).toMatchObject({ level: 'hide', companyLevel: true });
  });

  it('leaves the keyword tags doda adds to a card out of its text', () => {
    const doc = parseHtml(dodaListPage([dodaCard({ jobId: '1', company: 'A社', title: '自社開発プログラマー／客先常駐なし', keywords: ['自社開発', '客先常駐', 'パッケージ'] })]));
    const card = dodaAdapter.extract(dodaAdapter.findCards(doc)[0] as Element);
    expect(card?.fields.text).not.toContain('この求人のキーワード');
    expect(card?.fields.text).toContain('客先常駐なし');
    expect(judgeFields(card?.fields ?? { text: '' }, 'card-rule').level).toBe('none');
  });

  it('ignores articles without a job link and returns null without a company name', () => {
    const doc = parseHtml(dodaListPage(['<article><p>広告</p></article>', dodaCard({ jobId: '1', company: '', title: 'T' })]));
    const cards = dodaAdapter.findCards(doc);
    expect(cards).toHaveLength(1);
    expect(dodaAdapter.extract(cards[0] as Element)).toBeNull();
  });

  it('does not recognize an article that wraps other job cards', () => {
    const doc = parseHtml(
      dodaListPage([`<article class="wrapper">${dodaCard({ jobId: '1', company: 'A社', title: 'T' })}${dodaCard({ jobId: '2', company: 'B社', title: 'U' })}</article>`]),
    );
    const recognized = dodaAdapter.findCards(doc).flatMap((card) => {
      const data = dodaAdapter.extract(card);
      return data ? [data.jobId] : [];
    });
    expect(recognized.sort()).toEqual(['1', '2']);
  });

  it('does not recognize a card that links to more than one job', () => {
    const html = `<article><a class="jobCard-header__link" href="/DodaFront/View/JobSearchDetail/j_jid__1/"><h2>A社</h2></a><a href="/DodaFront/View/JobSearchDetail/j_jid__2/">別の求人</a></article>`;
    const [card] = dodaAdapter.findCards(parseHtml(dodaListPage([html])));
    expect(dodaAdapter.extract(card as Element)).toBeNull();
  });

  // 保存したページ（3.7 MB）の読み込みは重いので、1つのテストで1回だけ読む
  it.skipIf(!hasFixture('doda', 'list'))('extracts the captured list page, leaving the keyword tags out of the card text', () => {
    const doc = loadFixture('doda', 'list');
    expect(doc.querySelectorAll(DODA_SELECTORS.keywordArea).length).toBeGreaterThan(0);
    const cards = dodaAdapter.findCards(doc);
    expect(cards.length).toBeGreaterThanOrEqual(10);
    const data = cards.map((card) => dodaAdapter.extract(card));
    expect(data.filter(Boolean).length / data.length).toBeGreaterThanOrEqual(0.9);
    expect(data.filter((item) => item?.fields.business).length / data.length).toBeGreaterThanOrEqual(0.5);
    expect(data.filter((item) => item?.fields.text.includes('この求人のキーワード'))).toEqual([]);
  });
});
