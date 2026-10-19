import { dodaCard, dodaListPage, greenCard, greenListPage, mynaviCard, mynaviDetailPage, mynaviListPage, paizaDetailPage } from '../helpers/synthetic';
import { PREFETCH_AVAILABLE } from '../../src/core/features';
import { enablePrefetch, expect, extensionId, fixtureHtml, serve, test } from './fixtures';

const DETAIL_PATH = /^\/career\/job_offers\/\d+$/;
const SES_DETAIL = paizaDetailPage({ jobId: '1', recruiterId: '1', company: 'テスト株式会社', title: 'テスト求人', devTypes: '受託開発（社外常駐）、B2B' });

test('paiza: cards whose detail page says 受託開発（社外常駐） get collapsed', async ({ context }) => {
  test.skip(!PREFETCH_AVAILABLE, '先読みは 1.0.0 まで止めている');
  const list = fixtureHtml('paiza', 'list');
  test.skip(list === null, 'tests/fixtures/paiza/*-list.html がない');
  await enablePrefetch(context);
  const detailRequests: string[] = [];
  await serve(
    context,
    [
      { match: (u) => u.hostname === 'paiza.jp' && u.pathname === '/career/job_offers', html: list ?? '' },
      { match: (u) => u.hostname === 'paiza.jp' && DETAIL_PATH.test(u.pathname), html: SES_DETAIL },
    ],
    (u) => {
      if (DETAIL_PATH.test(u.pathname)) detailRequests.push(u.pathname);
    },
  );
  const page = await context.newPage();
  await page.goto('https://paiza.jp/career/job_offers');
  await expect(page.locator('[data-ses-filter]').first()).toBeAttached();
  expect(await page.locator('[data-ses-filter]').count()).toBeGreaterThanOrEqual(10);
  const first = page.locator('[data-ses-filter="collapsed"]').first();
  await expect(first).toBeAttached({ timeout: 20_000 });
  await expect(first.locator('ses-filter-bar .text')).toContainText('受託開発（社外常駐）');
  expect(detailRequests.length).toBeGreaterThan(0);
});

test('green: an SES company is collapsed, and another company can be hidden from its bar', async ({ context }) => {
  await serve(context, [
    {
      match: (u) => u.hostname === 'www.green-japan.com' && u.pathname === '/search',
      html: greenListPage([
        greenCard({ companyId: '101', jobId: '1001', company: '株式会社 サンプル', title: 'プライム案件のエンジニア', businessName: 'システムエンジニアリングサービス', businessIntro: 'SES事業でエンジニアのキャリアを支援' }),
        greenCard({ companyId: '102', jobId: '2001', company: '株式会社 見本', title: '社内SE', businessName: '自社サービスの企画・開発', businessIntro: '自社サービスを運営' }),
      ]),
    },
  ]);
  const page = await context.newPage();
  await page.goto('https://www.green-japan.com/search');
  const ses = page.locator('div:has(> a[href="/company/101/job/1001"])');
  const clean = page.locator('div:has(> a[href="/company/102/job/2001"])');
  await expect(ses).toHaveAttribute('data-ses-filter', 'collapsed');
  await expect(clean).toHaveAttribute('data-ses-filter', 'plain');
  await clean.locator('ses-filter-bar button[data-action="blockCompany"]').click();
  await expect(clean).toHaveAttribute('data-ses-filter', 'collapsed');
  await expect(clean.locator('ses-filter-bar .text')).toHaveText('あなたが隠した企業');
});

test('green: the captured search page is recognized without warnings', async ({ context }) => {
  const search = fixtureHtml('green', 'search');
  test.skip(search === null, 'tests/fixtures/green/*-search.html がない');
  await serve(context, [{ match: (u) => u.hostname === 'www.green-japan.com' && u.pathname === '/search', html: search ?? '' }]);
  const page = await context.newPage();
  await page.goto('https://www.green-japan.com/search');
  await expect(page.locator('[data-ses-filter]').first()).toBeAttached();
  expect(await page.locator('[data-ses-filter]').count()).toBeGreaterThanOrEqual(10);
  await page.waitForTimeout(6_000);
  await expect(page.locator('ses-filter-counter .warning')).toHaveCount(0);
});

test('doda: a card whose 事業 says SES is collapsed', async ({ context }) => {
  await serve(context, [
    {
      match: (u) => u.hostname === 'doda.jp' && u.pathname.startsWith('/DodaFront/View/JobSearchList'),
      html: dodaListPage([
        dodaCard({ jobId: '3000000001', company: '株式会社EXAMPLE', title: 'Javaエンジニア', location: '東京都', business: '■SES事業■人材派遣事業' }),
        dodaCard({ jobId: '3000000002', company: '株式会社テスト', title: '社内SE', location: '東京都渋谷区', business: '自社サービスの企画・開発' }),
      ]),
    },
  ]);
  const page = await context.newPage();
  await page.goto('https://doda.jp/DodaFront/View/JobSearchList/j_k__/Java/');
  await expect(page.locator('article').nth(0)).toHaveAttribute('data-ses-filter', 'collapsed');
  await expect(page.locator('article').nth(1)).toHaveAttribute('data-ses-filter', 'plain');
});

test('doda: the captured list page is recognized without warnings', async ({ context }) => {
  const list = fixtureHtml('doda', 'list');
  test.skip(list === null, 'tests/fixtures/doda/*-list.html がない');
  await serve(context, [{ match: (u) => u.hostname === 'doda.jp' && u.pathname.startsWith('/DodaFront/View/JobSearchList'), html: list ?? '' }]);
  const page = await context.newPage();
  await page.goto('https://doda.jp/DodaFront/View/JobSearchList/j_k__/Java/');
  await expect(page.locator('[data-ses-filter]').first()).toBeAttached();
  expect(await page.locator('[data-ses-filter]').count()).toBeGreaterThanOrEqual(10);
  await page.waitForTimeout(6_000);
  await expect(page.locator('ses-filter-counter .warning')).toHaveCount(0);
});

const MYNAVI_LIST = 'https://tenshoku.mynavi.jp/engineer/list/o16/';
const MYNAVI_DETAIL_PATH = /^\/jobinfo-\d+(?:-\d+){3}\/$/;

test('mynavi: a card whose 勤務地 says プロジェクト先 is collapsed, and its bar can show it', async ({ context }) => {
  await serve(context, [
    {
      match: (u) => u.hostname === 'tenshoku.mynavi.jp' && u.pathname === '/engineer/list/o16/',
      html: mynaviListPage([
        mynaviCard({ jobId: '100-1-2-1', company: '株式会社サンプル', title: 'Webエンジニア', location: '全国のプロジェクト先' }),
        mynaviCard({ jobId: '200-1-1-1', company: '株式会社見本', title: '社内SE', location: '東京都渋谷区（本社）' }),
      ]),
    },
  ]);
  const page = await context.newPage();
  await page.goto(MYNAVI_LIST);
  const ses = page.locator('section.recruit.engineer').nth(0);
  const clean = page.locator('section.recruit.engineer').nth(1);
  await expect(ses).toHaveAttribute('data-ses-filter', 'collapsed');
  await expect(ses.locator('ses-filter-bar .text')).toContainText('プロジェクト先');
  await expect(clean).toHaveAttribute('data-ses-filter', 'plain');
  await ses.locator('ses-filter-bar button[data-action="reveal"]').click();
  await expect(ses).toHaveAttribute('data-ses-filter', 'revealed');
});

test('mynavi: with prefetch on, the detail page decides a card the list cannot, without adv1 in the URL', async ({ context }) => {
  test.skip(!PREFETCH_AVAILABLE, '先読みは 1.0.0 まで止めている');
  await enablePrefetch(context);
  const detailRequests: string[] = [];
  await serve(
    context,
    [
      {
        match: (u) => u.hostname === 'tenshoku.mynavi.jp' && u.pathname === '/engineer/list/o16/',
        html: mynaviListPage([mynaviCard({ jobId: '100-1-2-1', company: '株式会社サンプル', title: 'Webエンジニア', location: '東京都' })]),
      },
      {
        match: (u) => u.hostname === 'tenshoku.mynavi.jp' && MYNAVI_DETAIL_PATH.test(u.pathname),
        html: mynaviDetailPage({ jobId: '100-1-2-1', companyId: '100', company: '株式会社サンプル', title: 'Webエンジニア', business: 'SES事業' }),
      },
    ],
    (u) => {
      if (u.pathname.startsWith('/jobinfo-')) detailRequests.push(u.pathname + u.search);
    },
  );
  const page = await context.newPage();
  await page.goto(MYNAVI_LIST);
  const card = page.locator('section.recruit.engineer').first();
  await expect(card).toHaveAttribute('data-ses-filter', 'collapsed', { timeout: 20_000 });
  await expect(card.locator('ses-filter-bar .text')).toContainText('SES事業');
  expect(detailRequests).toEqual(['/jobinfo-100-1-2-1/']);
});

test('mynavi: the captured list page is recognized without warnings', async ({ context }) => {
  const list = fixtureHtml('mynavi', 'list');
  test.skip(list === null, 'tests/fixtures/mynavi/*-list.html がない');
  await serve(context, [{ match: (u) => u.hostname === 'tenshoku.mynavi.jp' && u.pathname === '/engineer/list/o16/', html: list ?? '' }]);
  const page = await context.newPage();
  await page.goto(MYNAVI_LIST);
  await expect(page.locator('[data-ses-filter]').first()).toBeAttached();
  expect(await page.locator('[data-ses-filter]').count()).toBe(50);
  await page.waitForTimeout(6_000);
  await expect(page.locator('ses-filter-counter .warning')).toHaveCount(0);
});

test('popup: the prefetch switch is hidden while prefetch is unavailable', async ({ context }) => {
  test.skip(PREFETCH_AVAILABLE, '先読みを使えるときはスイッチを出す');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId()}/popup.html`);
  await expect(popup.locator('#enabled')).toBeChecked();
  await expect(popup.locator('#prefetch')).toHaveCount(0);
});
