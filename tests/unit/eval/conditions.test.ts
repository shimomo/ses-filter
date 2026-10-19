import { describe, expect, it } from 'vitest';
import { judgeSite, prefetchTargets } from '../../../eval/lib/conditions';
import { buildSiteData } from '../../../eval/lib/pages';
import { dodaCard, dodaListPage, greenCard, greenListPage, paizaCard, paizaDetailPage, paizaListPage, parseHtml } from '../../helpers/synthetic';

const page = (file: string, html: string) => ({ file, doc: parseHtml(html) });

describe('judgeSite on Green', () => {
  // 同じ企業の2枚。片方だけに事業内容の欄がある。事業内容のないカードを先に置き、読む順によらないことも確かめる
  const ses = greenCard({ companyId: '101', jobId: '1', company: 'X社', title: 'Webエンジニア', businessName: 'システムエンジニアリングサービス', businessIntro: 'SES事業' });
  const sameCompany = greenCard({ companyId: '101', jobId: '2', company: 'X社', title: 'インフラエンジニア' });
  const data = buildSiteData('green', [page('g.html', greenListPage([sameCompany, ses]))], []);

  it('judges each card alone in condition ①', () => {
    const verdicts = judgeSite(data, 'card');
    expect(verdicts.get('1')?.level).toBe('hide');
    expect(verdicts.get('2')?.level).toBe('none');
  });

  it('spreads a business-description hit to the whole company in condition ②', () => {
    expect(judgeSite(data, 'company').get('2')).toMatchObject({ level: 'hide', category: 'ses', decidedAt: 'company' });
  });

  it('gives the same result as condition ② in condition ③', () => {
    expect(judgeSite(data, 'usual')).toEqual(judgeSite(data, 'company'));
  });
});

describe('judgeSite on doda', () => {
  it('records the company by its name in condition ②', () => {
    const haken = dodaCard({ jobId: '10', company: '株式会社テスト', title: 'SE', business: '■労働者派遣事業' });
    const other = dodaCard({ jobId: '11', company: '株式会社テスト', title: 'PG' });
    const data = buildSiteData('doda', [page('d.html', dodaListPage([haken, other]))], []);
    expect(judgeSite(data, 'card').get('11')?.level).toBe('none');
    expect(judgeSite(data, 'company').get('11')).toMatchObject({ level: 'hide', category: 'haken', decidedAt: 'company' });
  });
});

describe('judgeSite on paiza', () => {
  const cards = [
    paizaCard({ jobId: '1', recruiterId: '7', company: 'Y社', title: 'SE' }),
    paizaCard({ jobId: '2', recruiterId: '7', company: 'Y社', title: 'PG' }),
    paizaCard({ jobId: '3', recruiterId: '7', company: 'Y社', title: 'インフラ' }),
    paizaCard({ jobId: '4', recruiterId: '8', company: 'Z社', title: '還元率90%のSE' }),
    paizaCard({ jobId: '5', recruiterId: '9', company: 'W社', title: '大規模案件のPM' }),
  ];
  const detail = (jobId: string, devTypes: string, recruiterId = '7', company = 'Y社') =>
    page(`eval/pages/paiza/2026-10-17-detail-${jobId}.html`, paizaDetailPage({ jobId, recruiterId, company, title: 'SE', devTypes }));
  const data = buildSiteData('paiza', [page('p.html', paizaListPage(cards))], [detail('1', '受託開発（社外常駐）'), detail('2', '受託開発（社外常駐）、B2B')]);

  it('uses only the card text in conditions ① and ②, and never waits for a detail page', () => {
    for (const condition of ['card', 'company'] as const) {
      expect([...judgeSite(data, condition).values()].map((verdict) => verdict.level)).toEqual(['none', 'none', 'none', 'hide', 'flag']);
    }
  });

  it('uses the detail pages and the per-company count in condition ③', () => {
    const verdicts = judgeSite(data, 'usual');
    expect(verdicts.get('1')).toMatchObject({ level: 'hide', category: 'ses', decidedAt: 'job' });
    expect(verdicts.get('2')).toMatchObject({ level: 'hide', category: 'ses', decidedAt: 'job' });
    expect(verdicts.get('3')).toMatchObject({ level: 'hide', category: 'ses', decidedAt: 'company' });
  });

  it('judges a card without a saved detail page by its card text in condition ③, without waiting for it', () => {
    expect(judgeSite(data, 'usual').get('4')).toMatchObject({ level: 'hide', decidedAt: 'job' });
    // 中程度の文言だけのカードは、先読みできるなら判定中になる。詳細ページがなければ、先読みできなかったときと同じくカードの文言で決める
    expect(judgeSite(data, 'usual').get('5')).toMatchObject({ level: 'flag', decidedAt: 'job' });
  });

  // 拡張機能は、判定中になったカードの詳細ページだけを、1ページあたり30件まで取りに行く（プロトタイプ仕様 6.1・6.2）
  it('does not use the detail page of a card that the card text already hides', () => {
    const own = buildSiteData('paiza', [page('p.html', paizaListPage([cards[3] ?? '']))], [detail('4', '自社製品/自社サービス', '8', 'Z社')]);
    const verdict = judgeSite(own, 'usual').get('4');
    expect(verdict).toMatchObject({ level: 'hide', category: 'ses', decidedAt: 'job' });
    expect(verdict?.reasons.map((reason) => reason.source)).toEqual(['card-rule']);
  });

  it('does not use the detail page of a later card that the earlier pages decided at the company level', () => {
    const later = paizaCard({ jobId: '6', recruiterId: '7', company: 'Y社', title: 'QA' });
    const pages = [page('p1.html', paizaListPage(cards.slice(0, 2))), page('p2.html', paizaListPage([later]))];
    const twoPages = buildSiteData('paiza', pages, [detail('1', '受託開発（社外常駐）'), detail('2', '受託開発（社外常駐）'), detail('6', '自社製品/自社サービス')]);
    expect(judgeSite(twoPages, 'usual').get('6')).toMatchObject({ level: 'hide', category: 'ses', decidedAt: 'company' });
  });

  it('uses at most 30 detail pages for each list page', () => {
    const ids = Array.from({ length: 31 }, (_, i) => String(100 + i));
    const many = ids.map((id) => paizaCard({ jobId: id, recruiterId: id, company: `会社${id}`, title: 'SE' }));
    const details = ids.map((id) => detail(id, '受託開発（社外常駐）', id, `会社${id}`));
    const verdicts = judgeSite(buildSiteData('paiza', [page('p.html', paizaListPage(many))], details), 'usual');
    expect(verdicts.get('129')?.level).toBe('hide');
    expect(verdicts.get('130')?.level).toBe('none');
  });

  it('does not count saved detail pages of jobs without a card toward the company', () => {
    const lone = buildSiteData('paiza', [page('p.html', paizaListPage([cards[2] ?? '']))], [detail('1', '受託開発（社外常駐）'), detail('2', '受託開発（社外常駐）')]);
    expect(judgeSite(lone, 'usual').get('3')?.level).toBe('none');
  });
});

describe('prefetchTargets', () => {
  const detail = (jobId: string, devTypes: string) =>
    page(`eval/pages/paiza/2026-10-17-detail-${jobId}.html`, paizaDetailPage({ jobId, recruiterId: jobId, company: `会社${jobId}`, title: 'SE', devTypes }));

  it('lists the pending cards of each page in order, at most 30 per page, whether or not a detail page is saved', () => {
    const ids = Array.from({ length: 35 }, (_, i) => String(100 + i));
    const first = ids.map((id) => paizaCard({ jobId: id, recruiterId: id, company: `会社${id}`, title: 'SE' }));
    const second = ['200', '201'].map((id) => paizaCard({ jobId: id, recruiterId: id, company: `会社${id}`, title: 'SE' }));
    const data = buildSiteData('paiza', [page('p1.html', paizaListPage(first)), page('p2.html', paizaListPage(second))], [detail('100', '自社製品/自社サービス')]);
    const targets = prefetchTargets(data).map((item) => item.card.jobId);
    expect(targets).toEqual([...ids.slice(0, 30), '200', '201']);
  });

  it('skips cards that the card text or an earlier page already decided', () => {
    const cards = [
      paizaCard({ jobId: '1', recruiterId: '7', company: 'Y社', title: '還元率90%のSE' }),
      paizaCard({ jobId: '2', recruiterId: '7', company: 'Y社', title: 'PG' }),
      paizaCard({ jobId: '3', recruiterId: '8', company: 'Z社', title: 'インフラ' }),
    ];
    const data = buildSiteData('paiza', [page('p.html', paizaListPage(cards))], []);
    // 1 はカードで隠れ、2 は同じ企業なので企業単位で隠れる。3 だけ判定中
    expect(prefetchTargets(data).map((item) => item.card.jobId)).toEqual(['3']);
  });
});

describe('judgeSite spreads strong card hits to the company', () => {
  it('hides the other jobs of the company in conditions ② and ③, but not ①', () => {
    const ses = greenCard({ companyId: '500', jobId: '1', company: 'M社', title: 'SES案件多数のインフラエンジニア' });
    const inHouse = greenCard({ companyId: '500', jobId: '2', company: 'M社', title: '自社サービスのWebエンジニア' });
    const data = buildSiteData('green', [page('g.html', greenListPage([inHouse, ses]))], []);
    expect(judgeSite(data, 'card').get('2')?.level).toBe('none');
    expect(judgeSite(data, 'company').get('2')).toMatchObject({ level: 'hide', category: 'ses', decidedAt: 'company' });
    expect(judgeSite(data, 'usual').get('2')).toMatchObject({ level: 'hide', decidedAt: 'company' });
    expect(judgeSite(data, 'company').get('1')).toMatchObject({ level: 'hide', decidedAt: 'job' });
  });
});
