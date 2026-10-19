import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from '../../../src/core/normalize';
import { RIKUNABI_JOB_ID, rikunabiAdapter } from '../../../src/sites/rikunabi';
import { hasFixture, loadFixture } from '../../helpers/fixtures';
import { parseHtml, rikunabiCard, rikunabiFilterPrompt, rikunabiListPage } from '../../helpers/synthetic';

const cardsOf = (items: string[]) => rikunabiAdapter.findCards(parseHtml(rikunabiListPage(items)));
const firstCard = (items: string[]) => rikunabiAdapter.extract(cardsOf(items)[0] as Element);

describe('rikunabi pages', () => {
  it.each([
    ['https://next.rikunabi.com/job_search/oc-technology/', true],
    ['https://next.rikunabi.com/job_search/oc-technology/?tagOcs=110', true],
    ['https://next.rikunabi.com/job_search/oc-technology/?tagOcs=110&cursor=AGQAAgDI', true],
    ['https://next.rikunabi.com/job_search/oc-transportation/', true],
    ['https://next.rikunabi.com/viewjob/jk0000000000000001/', false],
    ['https://next.rikunabi.com/', false],
    ['https://www.example.com/job_search/oc-technology/', false],
  ])('%s is a list page: %s', (url, expected) => {
    expect(rikunabiAdapter.isListPage(new URL(url))).toBe(expected);
  });
});

describe('rikunabiAdapter.extract', () => {
  it('reads the job id, company key, company name, title, location and text', () => {
    const data = firstCard([
      rikunabiCard({
        jobId: 'jk0000000000000001',
        company: '株式会社サンプル',
        title: 'Webエンジニア',
        employment: '業務委託',
        catchCopy: 'フルリモートで自社サービスを開発',
        location: '東京都渋谷区',
      }),
    ]);
    expect(data).toMatchObject({ jobId: 'jk0000000000000001', companyKey: normalizeCompanyName('株式会社サンプル'), companyName: '株式会社サンプル' });
    expect(data?.fields.title).toBe('Webエンジニア');
    expect(data?.fields.location).toBe('東京都渋谷区');
    expect(data?.fields.text).toContain('業務委託');
    expect(data?.fields.text).toContain('フルリモートで自社サービスを開発');
  });

  it('reads a card that has feature-tag list items inside', () => {
    const data = firstCard([rikunabiCard({ jobId: 'jk0000000000000001', company: '株式会社サンプル', title: '社内SE', features: ['交通費支給', '服装自由'] })]);
    expect(data).not.toBeNull();
    expect(data?.fields.text).toContain('交通費支給');
  });

  it('does not treat the filter prompts as cards', () => {
    const cards = cardsOf([rikunabiFilterPrompt(), rikunabiCard({ jobId: 'jk0000000000000001', company: '株式会社サンプル', title: '社内SE' }), rikunabiFilterPrompt()]);
    expect(cards).toHaveLength(1);
  });

  it('returns null for an element that wraps two job cards', () => {
    const inner = [
      rikunabiCard({ jobId: 'jk0000000000000001', company: '株式会社サンプル', title: '社内SE' }),
      rikunabiCard({ jobId: 'jk0000000000000002', company: '株式会社見本', title: 'Webエンジニア' }),
    ];
    const wrapper = cardsOf([`<li><ul>${inner.join('')}</ul></li>`])[0] as Element;
    expect(rikunabiAdapter.extract(wrapper)).toBeNull();
  });

  it('gives full-width and half-width company names the same key', () => {
    const wide = firstCard([rikunabiCard({ jobId: 'jk0000000000000001', company: '株式会社ＳＡＭＰＬＥ Ｔｅｃｈ', title: '社内SE' })]);
    const narrow = firstCard([rikunabiCard({ jobId: 'jk0000000000000002', company: '株式会社SAMPLE　Tech', title: 'Webエンジニア' })]);
    expect(wide?.companyKey).toBe(narrow?.companyKey);
  });

  it('uses the company name even when the card links to a company page', () => {
    const data = firstCard([rikunabiCard({ jobId: 'jk0000000000000001', company: '株式会社サンプル', title: '社内SE', companyId: '123' })]);
    expect(data?.companyKey).toBe(normalizeCompanyName('株式会社サンプル'));
  });

  it.skipIf(!hasFixture('rikunabi', 'list'))('extracts every card of the captured list page', () => {
    const cards = rikunabiAdapter.findCards(loadFixture('rikunabi', 'list'));
    expect(cards).toHaveLength(102);
    const data = cards.map((card) => rikunabiAdapter.extract(card));
    expect(data.every((d) => d !== null && d.companyName !== '' && RIKUNABI_JOB_ID.test(`/viewjob/${d.jobId}/`))).toBe(true);
    expect(new Set(data.map((d) => d?.jobId)).size).toBe(102);
  });
});
