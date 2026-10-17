import { describe, expect, it } from 'vitest';
import { judgeFields } from '../../../src/core/classify';
import { greenAdapter } from '../../../src/sites/green';
import { hasFixture, loadFixture } from '../../helpers/fixtures';
import { greenCard, greenListPage, parseHtml } from '../../helpers/synthetic';

const SES = {
  companyId: '101',
  jobId: '1001',
  company: '株式会社 サンプル',
  title: '【SES経験者歓迎】プライム案件のSE',
  location: '東京都, 神奈川県',
  businessName: 'システムエンジニアリングサービス',
  businessIntro: 'SES事業でエンジニアのキャリアを支援。還元率75％・案件選択制',
};

describe('greenAdapter', () => {
  it.each([
    ['https://www.green-japan.com/search', true],
    ['https://www.green-japan.com/search?page=2', true],
    ['https://www.green-japan.com/company/101/job/1001', false],
    ['https://www.green-japan.com/jobtype-l/190100', false],
  ])('isListPage(%s) is %s', (url, expected) => {
    expect(greenAdapter.isListPage(new URL(url))).toBe(expected);
  });

  it('reads ids, company, title, location and business description', () => {
    const [card] = greenAdapter.findCards(parseHtml(greenListPage([greenCard(SES)])));
    if (!card) throw new Error('no card');
    const data = greenAdapter.extract(card);
    expect(data).toMatchObject({
      jobId: '1001',
      companyKey: '101',
      companyName: '株式会社 サンプル',
      fields: { title: SES.title, location: '東京都, 神奈川県' },
    });
    expect(data?.fields.business).toContain('システムエンジニアリングサービス');
    expect(data?.fields.business).toContain('SES事業で');
    if (!data) throw new Error('no data');
    expect(judgeFields(data.fields, 'card-rule')).toMatchObject({ level: 'hide', category: 'ses', companyLevel: true });
  });

  it('leaves business empty when the card has no business block', () => {
    const [card] = greenAdapter.findCards(parseHtml(greenListPage([greenCard({ companyId: '1', jobId: '2', company: 'A社', title: 'T' })])));
    if (!card) throw new Error('no card');
    expect(greenAdapter.extract(card)?.fields.business).toBeUndefined();
  });

  it('uses the parent of the main job link as the card, once per card', () => {
    const html = greenListPage([greenCard(SES), greenCard({ ...SES, jobId: '1002' })]);
    const cards = greenAdapter.findCards(parseHtml(html));
    expect(cards).toHaveLength(2);
    expect(cards[0]?.firstElementChild?.getAttribute('href')).toBe('/company/101/job/1001');
  });

  it('does not recognize a container that holds several jobs', () => {
    const link = (jobId: string): string => parseHtml(greenCard({ ...SES, jobId })).querySelector('a')?.outerHTML ?? '';
    const cards = greenAdapter.findCards(parseHtml(`<div class="list">${link('1')}${link('2')}</div>`));
    expect(cards).toHaveLength(1);
    expect(greenAdapter.extract(cards[0] as Element)).toBeNull();
  });

  it.skipIf(!hasFixture('green', 'search'))('extracts the captured search page', () => {
    const cards = greenAdapter.findCards(loadFixture('green', 'search'));
    expect(cards.length).toBeGreaterThanOrEqual(10);
    const data = cards.map((card) => greenAdapter.extract(card));
    for (const item of data) {
      expect(item?.jobId).toMatch(/^\d+$/);
      expect(item?.companyKey).toMatch(/^\d+$/);
    }
    expect(data.filter((item) => item?.fields.business).length / data.length).toBeGreaterThanOrEqual(0.8);
    expect(data.filter((item) => item?.companyName).length / data.length).toBeGreaterThanOrEqual(0.9);
  });
});
