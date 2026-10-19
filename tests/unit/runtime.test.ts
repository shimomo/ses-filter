import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { Runtime, WARN_FETCH_STOPPED, WARN_UNRECOGNIZED, type RuntimeDeps } from '../../src/core/runtime';
import { DAY_MS, companyStoreKey, jobStoreKey, loadLists, saveSettings } from '../../src/core/store';
import { BAR_TAG, COUNTER_TAG, STATE_ATTR, STYLE_ID } from '../../src/core/ui';
import { dodaAdapter } from '../../src/sites/doda';
import { greenAdapter } from '../../src/sites/green';
import { mynaviAdapter } from '../../src/sites/mynavi';
import { paizaAdapter } from '../../src/sites/paiza';
import { dodaCard, greenCard, mynaviCard, mynaviDetailPage, mynaviListPage, paizaCard, paizaDetailPage, parseHtml } from '../helpers/synthetic';

const GREEN_URL = 'https://www.green-japan.com/search';
const PAIZA_URL = 'https://paiza.jp/career/job_offers';
const DODA_URL = 'https://doda.jp/DodaFront/View/JobSearchList/j_k__/Java/';
const MYNAVI_URL = 'https://tenshoku.mynavi.jp/engineer/list/o16/';

const SES_GREEN = {
  companyId: '101',
  jobId: '1001',
  company: '株式会社 サンプル',
  title: 'プライム案件のエンジニア',
  businessName: 'システムエンジニアリングサービス',
  businessIntro: 'SES事業でエンジニアのキャリアを支援',
};
const CLEAN_GREEN = {
  companyId: '102',
  jobId: '2001',
  company: '株式会社 見本',
  title: '社内SE',
  businessName: '自社サービスの企画・開発',
  businessIntro: '自社サービスを運営',
};

let currentUrl = GREEN_URL;
let runtime: Runtime | null = null;

const respond = (body: string, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body }) as unknown as Response;

/** 先読みの処理を確かめるため、既定では先読みを使える状態で起動する（PREFETCH_AVAILABLE とは別） */
async function start(deps: Partial<RuntimeDeps> & Pick<RuntimeDeps, 'adapter'>): Promise<Runtime> {
  runtime = new Runtime({
    doc: document,
    prefetchAvailable: true,
    getUrl: () => currentUrl,
    schedule: (callback) => {
      setTimeout(callback, 0);
    },
    setTimer: (callback, ms) => {
      setTimeout(callback, ms);
    },
    ...deps,
  });
  await runtime.start();
  return runtime;
}

function greenCardElement(jobId: string): Element {
  const link = document.querySelector(`a[href$="/job/${jobId}"]`);
  if (!link?.parentElement) throw new Error(`card ${jobId} not found`);
  return link.parentElement;
}

function only(selector: string): Element {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`${selector} not found`);
  return element;
}

const stateOf = (card: Element): string | null => card.getAttribute(STATE_ATTR);
const barTextOf = (card: Element): string => card.querySelector(`:scope > ${BAR_TAG}`)?.shadowRoot?.querySelector('.text')?.textContent ?? '';
const counterTextNow = (): string => document.querySelector(COUNTER_TAG)?.shadowRoot?.textContent ?? '';

function click(card: Element, action: string): void {
  const button = card.querySelector(`:scope > ${BAR_TAG}`)?.shadowRoot?.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!button) throw new Error(`button ${action} not found`);
  button.click();
}

beforeEach(() => {
  fakeBrowser.reset();
  currentUrl = GREEN_URL;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  runtime?.stop();
  runtime = null;
  vi.restoreAllMocks();
});

describe('Runtime on Green', () => {
  it('collapses an SES card, marks a clean card plain and counts the hidden one', async () => {
    document.body.innerHTML = greenCard(SES_GREEN) + greenCard(CLEAN_GREEN);
    await start({ adapter: greenAdapter });
    expect(stateOf(greenCardElement('1001'))).toBe('collapsed');
    expect(barTextOf(greenCardElement('1001'))).toContain('SES事業（事業内容）');
    expect(stateOf(greenCardElement('2001'))).toBe('plain');
    expect(counterTextNow()).toContain('隠した 1');
  });

  it('switches to hidden mode when the setting changes', async () => {
    document.body.innerHTML = greenCard(SES_GREEN);
    await start({ adapter: greenAdapter });
    await saveSettings({ mode: 'hide' });
    await vi.waitFor(() => expect(stateOf(greenCardElement('1001'))).toBe('hidden'));
  });

  it('hides a company from the bar of a plain card', async () => {
    document.body.innerHTML = greenCard(CLEAN_GREEN);
    await start({ adapter: greenAdapter });
    click(greenCardElement('2001'), 'blockCompany');
    await vi.waitFor(() => expect(stateOf(greenCardElement('2001'))).toBe('collapsed'));
    expect(barTextOf(greenCardElement('2001'))).toBe('あなたが隠した企業');
    expect((await loadLists()).blockedCompanies['green:102']?.name).toBe('株式会社 見本');
  });

  it('records "SESではない" on the company when the reason is the business description', async () => {
    document.body.innerHTML = greenCard(SES_GREEN);
    await start({ adapter: greenAdapter });
    click(greenCardElement('1001'), 'notSes');
    await vi.waitFor(() => expect(stateOf(greenCardElement('1001'))).toBe('allowed'));
    expect(Object.keys((await loadLists()).allowedCompanies)).toEqual(['green:101']);
  });

  it('reveals a card for this page view without saving anything', async () => {
    document.body.innerHTML = greenCard(SES_GREEN);
    await start({ adapter: greenAdapter });
    click(greenCardElement('1001'), 'reveal');
    expect(stateOf(greenCardElement('1001'))).toBe('revealed');
    expect(await loadLists()).toEqual({ blockedCompanies: {}, allowedCompanies: {}, allowedJobs: {} });
  });

  it('leaves the page untouched when the site is turned off', async () => {
    await saveSettings({ sites: { paiza: true, green: false, doda: true, mynavi: true } });
    document.body.innerHTML = greenCard(SES_GREEN);
    await start({ adapter: greenAdapter });
    expect(stateOf(greenCardElement('1001'))).toBeNull();
    expect(document.querySelector(COUNTER_TAG)).toBeNull();
  });

  it('follows the new content when the site reuses a card element for another job', async () => {
    document.body.innerHTML = greenCard(CLEAN_GREEN);
    await start({ adapter: greenAdapter });
    const card = greenCardElement('2001');
    expect(stateOf(card)).toBe('plain');
    const replacement = parseHtml(greenCard({ ...SES_GREEN, companyId: '777', jobId: '2001' })).body.firstElementChild;
    card.innerHTML = replacement?.innerHTML ?? '';
    await runtime?.scanNow();
    expect(stateOf(card)).toBe('collapsed');
    expect(card.querySelectorAll(`:scope > ${BAR_TAG}`)).toHaveLength(1);
  });

  it('notices when the site rewrites the text of a card in place', async () => {
    document.body.innerHTML = greenCard(CLEAN_GREEN);
    await start({ adapter: greenAdapter });
    const card = greenCardElement('2001');
    expect(stateOf(card)).toBe('plain');
    const businessName = card.querySelector('.css-163sxhg')?.firstChild;
    if (!businessName) throw new Error('no business name');
    businessName.nodeValue = 'SES事業';
    await vi.waitFor(() => expect(stateOf(card)).toBe('collapsed'));
  });

  it('notices when the site points a card at another job by changing its link', async () => {
    await browser.storage.local.set({
      [companyStoreKey('green', SES_GREEN.companyId)]: { name: SES_GREEN.company, businessHit: 'ses', targetJobs: {}, cleanJobs: [], updatedAt: 0 },
    });
    document.body.innerHTML = greenCard(CLEAN_GREEN);
    await start({ adapter: greenAdapter });
    const card = greenCardElement('2001');
    expect(stateOf(card)).toBe('plain');
    card.querySelector('a')?.setAttribute('href', `/company/${SES_GREEN.companyId}/job/${SES_GREEN.jobId}`);
    await vi.waitFor(() => expect(stateOf(card)).toBe('collapsed'));
  });

  it('removes its marks from an element that is no longer a card', async () => {
    document.body.innerHTML = greenCard(SES_GREEN);
    await start({ adapter: greenAdapter });
    const card = greenCardElement('1001');
    expect(stateOf(card)).toBe('collapsed');
    const placeholder = document.createElement('p');
    placeholder.textContent = '読み込み中';
    card.querySelector('a')?.replaceWith(placeholder);
    await runtime?.scanNow();
    expect(stateOf(card)).toBeNull();
    expect(card.querySelector(BAR_TAG)).toBeNull();
    expect(runtime?.stats()).toMatchObject({ hidden: 0 });
  });

  it('removes everything on stop, and a new runtime does not duplicate bars', async () => {
    document.body.innerHTML = greenCard(SES_GREEN) + greenCard(CLEAN_GREEN);
    const first = await start({ adapter: greenAdapter });
    first.stop();
    runtime = null;
    expect(document.querySelectorAll(`[${STATE_ATTR}]`)).toHaveLength(0);
    expect(document.querySelectorAll(BAR_TAG)).toHaveLength(0);
    expect(document.querySelector(COUNTER_TAG)).toBeNull();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    await start({ adapter: greenAdapter });
    expect(document.querySelectorAll(BAR_TAG)).toHaveLength(2);
  });

  it('removes its UI when the page navigates away from the list', async () => {
    document.body.innerHTML = greenCard(SES_GREEN);
    await start({ adapter: greenAdapter });
    currentUrl = 'https://www.green-japan.com/company/101';
    await runtime?.onUrlChange();
    expect(document.querySelectorAll(`[${STATE_ATTR}]`)).toHaveLength(0);
    expect(document.querySelector(COUNTER_TAG)).toBeNull();
  });

  it('warns when a list page has no recognizable cards', async () => {
    document.body.innerHTML = '<main><p>求人はありません</p></main>';
    await start({ adapter: greenAdapter, healthCheckMs: 10 });
    await vi.waitFor(() => expect(counterTextNow()).toContain(WARN_UNRECOGNIZED));
  });

  it('reports page statistics', async () => {
    document.body.innerHTML = greenCard(SES_GREEN) + greenCard(CLEAN_GREEN);
    await start({ adapter: greenAdapter });
    expect(runtime?.stats()).toMatchObject({ site: 'green', listPage: true, cards: 2, hidden: 1, flagged: 0, pending: 0, unrecognized: 0 });
    expect(runtime?.stats().reasons['SES事業']).toBe(1);
  });

  it('keeps working in memory when saving fails', async () => {
    document.body.innerHTML = greenCard(CLEAN_GREEN);
    await start({ adapter: greenAdapter });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(browser.storage.local, 'set').mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    click(greenCardElement('2001'), 'blockCompany');
    await vi.waitFor(() => expect(stateOf(greenCardElement('2001'))).toBe('collapsed'));
    expect(warn).toHaveBeenCalled();
  });

  const MIXED_SES = { companyId: '500', jobId: '1', company: '株式会社 混在', title: 'SES案件多数のインフラエンジニア' };
  const MIXED_IN_HOUSE = { companyId: '500', jobId: '2', company: '株式会社 混在', title: '自社サービスのWebエンジニア' };

  it('hides every card of a company once one of its cards hits a strong rule', async () => {
    document.body.innerHTML = greenCard(MIXED_SES) + greenCard(MIXED_IN_HOUSE);
    await start({ adapter: greenAdapter });
    await vi.waitFor(() => expect(stateOf(greenCardElement('2'))).toBe('collapsed'));
    expect(stateOf(greenCardElement('1'))).toBe('collapsed');
    expect(barTextOf(greenCardElement('2'))).toContain('同じ企業の求人が対象');
    const saved = await browser.storage.local.get(companyStoreKey('green', '500'));
    expect(saved[companyStoreKey('green', '500')]).toMatchObject({ targetJobs: { '1': 'ses' } });
  });

  it('forgets a saved card hit once that card no longer hits, and shows the rest of the company', async () => {
    await browser.storage.local.set({
      [companyStoreKey('green', '500')]: { name: '株式会社 混在', businessHit: null, targetJobs: { '1': 'ses' }, cleanJobs: [], updatedAt: 0 },
    });
    document.body.innerHTML = greenCard({ ...MIXED_SES, title: 'インフラエンジニア' }) + greenCard(MIXED_IN_HOUSE);
    await start({ adapter: greenAdapter });
    await vi.waitFor(async () => {
      const saved = await browser.storage.local.get(companyStoreKey('green', '500'));
      expect(saved[companyStoreKey('green', '500')]).toMatchObject({ targetJobs: {} });
    });
    await vi.waitFor(() => expect(stateOf(greenCardElement('2'))).toBe('plain'));
  });

  it('keeps hiding the rest of the company in memory when saving a card hit fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(browser.storage.local, 'set').mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    document.body.innerHTML = greenCard(MIXED_SES) + greenCard(MIXED_IN_HOUSE);
    await start({ adapter: greenAdapter });
    await vi.waitFor(() => expect(stateOf(greenCardElement('2'))).toBe('collapsed'));
    expect(warn).toHaveBeenCalled();
  });

  it('shows the rest of the company again when its only target job is marked not SES', async () => {
    document.body.innerHTML = greenCard(MIXED_SES) + greenCard(MIXED_IN_HOUSE);
    await start({ adapter: greenAdapter });
    await vi.waitFor(() => expect(stateOf(greenCardElement('2'))).toBe('collapsed'));
    click(greenCardElement('1'), 'notSes');
    await vi.waitFor(() => expect(stateOf(greenCardElement('2'))).toBe('plain'));
    expect(stateOf(greenCardElement('1'))).toBe('allowed');
    expect(Object.keys((await loadLists()).allowedJobs)).toEqual(['green:1']);
  });
});

describe('Runtime on doda', () => {
  it('does not read its own bar text as card text', async () => {
    currentUrl = DODA_URL;
    document.body.innerHTML = dodaCard({ jobId: '3000000001', company: '株式会社EXAMPLE', title: 'Javaエンジニア', location: '東京都', business: '■SES事業■人材派遣事業' });
    await start({ adapter: dodaAdapter });
    const card = only('article');
    expect(stateOf(card)).toBe('collapsed');
    const text = dodaAdapter.extract(card)?.fields.text ?? '';
    expect(text).not.toContain('この企業を常に隠す');
    expect(text).not.toContain('SES：');
  });
});

describe('Runtime on mynavi', () => {
  const mynaviCardElement = (): Element => only('section.recruit.engineer');

  it('records the result of a detail page the user opens, and hides the card on the next list', async () => {
    const doc = parseHtml(mynaviDetailPage({ jobId: '100-1-2-1', companyId: '100', company: '株式会社サンプル', title: 'Webエンジニア', business: 'SES事業' }));
    const fetchFn = vi.fn();
    runtime = new Runtime({ doc, adapter: mynaviAdapter, getUrl: () => 'https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/', fetchFn });
    await runtime.start();
    const jobKey = jobStoreKey('mynavi', '100-1-2-1');
    expect((await browser.storage.local.get(jobKey))[jobKey]).toMatchObject({ level: 'hide', category: 'ses' });
    expect((await browser.storage.local.get('company:mynavi:100'))['company:mynavi:100']).toMatchObject({ name: '株式会社サンプル', targetJobs: { '100-1-2-1': 'ses' } });
    expect(fetchFn).not.toHaveBeenCalled();
    runtime.stop();

    currentUrl = MYNAVI_URL;
    document.body.innerHTML = mynaviCard({ jobId: '100-1-2-1', company: '株式会社サンプル', title: 'Webエンジニア' });
    await start({ adapter: mynaviAdapter });
    expect(stateOf(mynaviCardElement())).toBe('collapsed');
  });

  it('does not record an ad-type detail page the user opens', async () => {
    const doc = parseHtml(mynaviDetailPage({ jobId: '100-1-2-1', companyId: '100', company: '株式会社サンプル', title: 'Webエンジニア', ad: true }));
    runtime = new Runtime({ doc, adapter: mynaviAdapter, getUrl: () => 'https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/adv1/', fetchFn: vi.fn() });
    await runtime.start();
    expect(Object.keys(await browser.storage.local.get(null)).filter((key) => key.startsWith('job:') || key.startsWith('company:'))).toEqual([]);
    runtime.stop();

    // 一覧ではカードの「還元率」で隠れたまま
    currentUrl = MYNAVI_URL;
    document.body.innerHTML = mynaviCard({ jobId: '100-1-2-1', company: '株式会社サンプル', title: 'Webエンジニア', point: '還元率最大90%' });
    await start({ adapter: mynaviAdapter });
    expect(stateOf(mynaviCardElement())).toBe('collapsed');
  });

  it('marks a card pending and collapses it once the fetched detail says 派遣社員', async () => {
    await saveSettings({ fetchIntervalMs: 0, prefetch: true });
    currentUrl = MYNAVI_URL;
    document.body.innerHTML = mynaviListPage([mynaviCard({ jobId: '100-1-2-1', company: '株式会社サンプル', title: 'Webエンジニア' })]).replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '');
    const fetchFn = vi.fn(async () => respond(mynaviDetailPage({ jobId: '100-1-2-1', companyId: '100', company: '株式会社サンプル', title: 'Webエンジニア', employment: '派遣社員' })));
    await start({ adapter: mynaviAdapter, fetchFn });
    await vi.waitFor(() => expect(stateOf(mynaviCardElement())).toBe('collapsed'));
    expect(fetchFn).toHaveBeenCalledWith('https://tenshoku.mynavi.jp/jobinfo-100-1-2-1/', expect.objectContaining({ credentials: 'same-origin' }));
    expect(barTextOf(mynaviCardElement())).toContain('派遣');
  });
});

describe('Runtime on paiza', () => {
  it('marks a card pending, then collapses it once the detail page says 受託開発（社外常駐）', async () => {
    await saveSettings({ fetchIntervalMs: 0, prefetch: true });
    currentUrl = PAIZA_URL;
    document.body.innerHTML = paizaCard({ jobId: '5001', recruiterId: '501', company: 'A社', title: '基盤構築' });
    let release: (value: Response) => void = () => {};
    const fetchFn = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    await start({ adapter: paizaAdapter, fetchFn });
    const card = only('.s-job-offer-card');
    expect(stateOf(card)).toBe('pending');
    expect(fetchFn).toHaveBeenCalledWith('https://paiza.jp/career/job_offers/5001', expect.objectContaining({ credentials: 'same-origin' }));
    release(respond(paizaDetailPage({ jobId: '5001', recruiterId: '501', company: 'A社', title: '基盤構築', devTypes: '受託開発（社外常駐）、B2B' })));
    await vi.waitFor(() => expect(stateOf(card)).toBe('collapsed'));
    expect(barTextOf(card)).toBe('SES：受託開発（社外常駐）');
    const key = jobStoreKey('paiza', '5001');
    expect((await browser.storage.local.get(key))[key]).toMatchObject({ level: 'hide', category: 'ses' });
  });

  it('keeps the card visible and remembers "unknown" for a day when the detail has no development type', async () => {
    await saveSettings({ fetchIntervalMs: 0, prefetch: true });
    currentUrl = PAIZA_URL;
    document.body.innerHTML = paizaCard({ jobId: '5', recruiterId: '6', company: 'B社', title: 'Webエンジニア' });
    const fetchFn = vi.fn(async () => respond('<html><head><title>ログイン | paiza</title></head><body>ログインしてください</body></html>'));
    await start({ adapter: paizaAdapter, fetchFn, now: () => 1_000 });
    const key = jobStoreKey('paiza', '5');
    await vi.waitFor(async () => expect((await browser.storage.local.get(key))[key]).toMatchObject({ level: 'unknown', expiresAt: 1_000 + DAY_MS }));
    await vi.waitFor(() => expect(stateOf(only('.s-job-offer-card'))).toBe('plain'));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('records the result of a detail page the user opens, without fetching', async () => {
    const doc = parseHtml(
      paizaDetailPage({ jobId: '5002', recruiterId: '502', company: 'サンプル開発株式会社', title: 'チームで参画', devTypes: '受託開発（社外常駐）、B2B' }),
    );
    const fetchFn = vi.fn();
    runtime = new Runtime({ doc, adapter: paizaAdapter, getUrl: () => 'https://paiza.jp/career/job_offers/5002', fetchFn });
    await runtime.start();
    const jobKey = jobStoreKey('paiza', '5002');
    expect((await browser.storage.local.get(jobKey))[jobKey]).toMatchObject({ level: 'hide', category: 'ses' });
    const company = (await browser.storage.local.get('company:paiza:502'))['company:paiza:502'];
    expect(company).toMatchObject({ name: 'サンプル開発株式会社', targetJobs: { '5002': 'ses' } });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stops fetching after repeated errors and leaves the cards visible', async () => {
    await saveSettings({ fetchIntervalMs: 0, prefetch: true });
    currentUrl = PAIZA_URL;
    document.body.innerHTML =
      paizaCard({ jobId: '1', recruiterId: '10', company: 'C社', title: 'A' }) + paizaCard({ jobId: '2', recruiterId: '20', company: 'D社', title: 'B' });
    const fetchFn = vi.fn(async () => respond('', 500));
    await start({ adapter: paizaAdapter, fetchFn, queueOptions: { retryDelayMs: 0 } });
    await vi.waitFor(() => expect(counterTextNow()).toContain(WARN_FETCH_STOPPED));
    for (const card of document.querySelectorAll('.s-job-offer-card')) expect(stateOf(card)).toBe('plain');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('ignores a saved record with an unexpected shape', async () => {
    await saveSettings({ prefetch: false });
    await browser.storage.local.set({ [jobStoreKey('paiza', '5001')]: { level: 'hide', category: 'ses', savedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER } });
    currentUrl = PAIZA_URL;
    document.body.innerHTML =
      paizaCard({ jobId: '5001', recruiterId: '501', company: 'A社', title: '基盤構築' }) +
      paizaCard({ jobId: '2', recruiterId: '20', company: 'D社', title: '還元率90%のSE' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await start({ adapter: paizaAdapter });
    const [broken, other] = document.querySelectorAll('.s-job-offer-card');
    expect(stateOf(broken as Element)).toBe('plain');
    expect(stateOf(other as Element)).toBe('collapsed');
  });

  it('keeps showing the other cards when one card cannot be shown', async () => {
    await saveSettings({ prefetch: false });
    await browser.storage.local.set({ [jobStoreKey('paiza', '5001')]: { level: 'hide', category: 'ses', reasons: [null], savedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER } });
    currentUrl = PAIZA_URL;
    document.body.innerHTML =
      paizaCard({ jobId: '5001', recruiterId: '501', company: 'A社', title: '基盤構築' }) +
      paizaCard({ jobId: '2', recruiterId: '20', company: 'D社', title: '還元率90%のSE' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await start({ adapter: paizaAdapter });
    const [broken, other] = document.querySelectorAll('.s-job-offer-card');
    expect(stateOf(broken as Element)).toBeNull();
    expect((broken as Element).querySelector(BAR_TAG)).toBeNull();
    expect(stateOf(other as Element)).toBe('collapsed');
    expect(runtime?.stats()).toMatchObject({ hidden: 1, unrecognized: 1 });
    expect(warn).toHaveBeenCalled();
  });

  it('does not record a card hit for a job whose detail result is saved', async () => {
    await saveSettings({ prefetch: false });
    await browser.storage.local.set({ [jobStoreKey('paiza', '2')]: { level: 'none', reasons: [], savedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER } });
    currentUrl = PAIZA_URL;
    document.body.innerHTML =
      paizaCard({ jobId: '2', recruiterId: '20', company: 'D社', title: '還元率90%のSE' }) + paizaCard({ jobId: '3', recruiterId: '20', company: 'D社', title: 'Webエンジニア' });
    await start({ adapter: paizaAdapter });
    const [own, other] = document.querySelectorAll('.s-job-offer-card');
    expect(stateOf(own as Element)).toBe('plain');
    expect(stateOf(other as Element)).toBe('plain');
    expect((await browser.storage.local.get(companyStoreKey('paiza', '20')))[companyStoreKey('paiza', '20')]).toBeUndefined();
  });

  it('does not fetch the detail page of a card whose company another card already marks', async () => {
    await saveSettings({ fetchIntervalMs: 0, prefetch: true });
    currentUrl = PAIZA_URL;
    const fetchFn = vi.fn(async () => respond(paizaDetailPage({ jobId: '3', recruiterId: '20', company: 'D社', title: 'Webエンジニア', devTypes: '自社製品/自社サービス' })));
    document.body.innerHTML =
      paizaCard({ jobId: '2', recruiterId: '20', company: 'D社', title: '還元率90%のSE' }) + paizaCard({ jobId: '3', recruiterId: '20', company: 'D社', title: 'Webエンジニア' });
    await start({ adapter: paizaAdapter, fetchFn });
    const [, other] = document.querySelectorAll('.s-job-offer-card');
    await vi.waitFor(() => expect(stateOf(other as Element)).toBe('collapsed'));
    expect(barTextOf(other as Element)).toContain('同じ企業の求人が対象');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not fetch while prefetch is unavailable, even if a saved setting turns it on', async () => {
    await saveSettings({ fetchIntervalMs: 0, prefetch: true });
    currentUrl = PAIZA_URL;
    document.body.innerHTML = paizaCard({ jobId: '1', recruiterId: '10', company: 'C社', title: 'A' });
    const fetchFn = vi.fn();
    await start({ adapter: paizaAdapter, fetchFn, prefetchAvailable: false });
    expect(stateOf(only('.s-job-offer-card'))).toBe('plain');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not fetch when prefetch is off', async () => {
    await saveSettings({ prefetch: false });
    currentUrl = PAIZA_URL;
    document.body.innerHTML = paizaCard({ jobId: '1', recruiterId: '10', company: 'C社', title: 'A' });
    const fetchFn = vi.fn();
    await start({ adapter: paizaAdapter, fetchFn });
    expect(stateOf(only('.s-job-offer-card'))).toBe('plain');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not fetch detail pages with the default settings', async () => {
    currentUrl = PAIZA_URL;
    document.body.innerHTML = paizaCard({ jobId: '1', recruiterId: '10', company: 'C社', title: 'A' });
    const fetchFn = vi.fn();
    await start({ adapter: paizaAdapter, fetchFn });
    expect(stateOf(only('.s-job-offer-card'))).toBe('plain');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
