import { dodaCard, dodaListPage, greenCard, greenListPage, paizaDetailPage } from '../helpers/synthetic';
import { enablePaizaPrefetch, expect, fixtureHtml, serve, test } from './fixtures';

const DETAIL_PATH = /^\/career\/job_offers\/\d+$/;
const SES_DETAIL = paizaDetailPage({ jobId: '1', recruiterId: '1', company: 'テスト株式会社', title: 'テスト求人', devTypes: '受託開発（社外常駐）、B2B' });

test('paiza: cards whose detail page says 受託開発（社外常駐） get collapsed', async ({ context }) => {
  const list = fixtureHtml('paiza', 'list');
  test.skip(list === null, 'tests/fixtures/paiza/*-list.html がない');
  await enablePaizaPrefetch(context);
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
  await expect(page.locator('[data-ses-sieve]').first()).toBeAttached();
  expect(await page.locator('[data-ses-sieve]').count()).toBeGreaterThanOrEqual(10);
  const first = page.locator('[data-ses-sieve="collapsed"]').first();
  await expect(first).toBeAttached({ timeout: 20_000 });
  await expect(first.locator('ses-sieve-bar .text')).toContainText('受託開発（社外常駐）');
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
  await expect(ses).toHaveAttribute('data-ses-sieve', 'collapsed');
  await expect(clean).toHaveAttribute('data-ses-sieve', 'plain');
  await clean.locator('ses-sieve-bar button[data-action="blockCompany"]').click();
  await expect(clean).toHaveAttribute('data-ses-sieve', 'collapsed');
  await expect(clean.locator('ses-sieve-bar .text')).toHaveText('あなたが隠した企業');
});

test('green: the captured search page is recognized without warnings', async ({ context }) => {
  const search = fixtureHtml('green', 'search');
  test.skip(search === null, 'tests/fixtures/green/*-search.html がない');
  await serve(context, [{ match: (u) => u.hostname === 'www.green-japan.com' && u.pathname === '/search', html: search ?? '' }]);
  const page = await context.newPage();
  await page.goto('https://www.green-japan.com/search');
  await expect(page.locator('[data-ses-sieve]').first()).toBeAttached();
  expect(await page.locator('[data-ses-sieve]').count()).toBeGreaterThanOrEqual(10);
  await page.waitForTimeout(6_000);
  await expect(page.locator('ses-sieve-counter .warning')).toHaveCount(0);
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
  await expect(page.locator('article').nth(0)).toHaveAttribute('data-ses-sieve', 'collapsed');
  await expect(page.locator('article').nth(1)).toHaveAttribute('data-ses-sieve', 'plain');
});

test('doda: the captured list page is recognized without warnings', async ({ context }) => {
  const list = fixtureHtml('doda', 'list');
  test.skip(list === null, 'tests/fixtures/doda/*-list.html がない');
  await serve(context, [{ match: (u) => u.hostname === 'doda.jp' && u.pathname.startsWith('/DodaFront/View/JobSearchList'), html: list ?? '' }]);
  const page = await context.newPage();
  await page.goto('https://doda.jp/DodaFront/View/JobSearchList/j_k__/Java/');
  await expect(page.locator('[data-ses-sieve]').first()).toBeAttached();
  expect(await page.locator('[data-ses-sieve]').count()).toBeGreaterThanOrEqual(10);
  await page.waitForTimeout(6_000);
  await expect(page.locator('ses-sieve-counter .warning')).toHaveCount(0);
});
