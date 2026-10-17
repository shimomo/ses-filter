import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { cardTargetCategory, judgeDetail, judgeFields } from './classify';
import { decide, listKey } from './decide';
import { FetchQueue, type FetchQueueOptions, type FetchTask } from './fetchQueue';
import { STATS_MESSAGE, type PageStats } from './messages';
import {
  LISTS_KEY,
  SETTINGS_KEY,
  applyListOp,
  emptyCompany,
  isCompanyRecord,
  isJobRecord,
  loadLists,
  loadRecords,
  loadSettings,
  makeJobRecord,
  mergeLists,
  mergeSettings,
  saveBusinessHit,
  saveCardHit,
  saveJobResult,
  updateLists,
  withJobResult,
  type ListOp,
} from './store';
import type { CardData, CompanyRecord, DetailData, JobRecord, Settings, SiteAdapter, UserLists, Verdict } from './types';
import { applyCard, clearCard, ensureStyle, isOwnNode, removeAllUi, renderCounter, stateFor, type BarAction } from './ui';

export const WARN_UNRECOGNIZED = 'カードを認識できません（サイト改修の可能性）';
export const WARN_FETCH_STOPPED = '詳細ページの取得を停止しました（エラーが続いたため）';

export type RuntimeDeps = {
  doc: Document;
  adapter: SiteAdapter;
  getUrl?: () => string;
  now?: () => number;
  fetchFn?: FetchQueueOptions['fetchFn'];
  schedule?: (callback: () => void) => void;
  setTimer?: (callback: () => void, ms: number) => void;
  healthCheckMs?: number;
  queueOptions?: Pick<FetchQueueOptions, 'retryDelayMs' | 'timeoutMs' | 'maxPerPage'>;
};

type CardEntry = { data: CardData | null; verdict?: Verdict };
type StorageChanges = Record<string, { newValue?: unknown }>;

const revealKey = (card: CardData): string => card.jobId ?? `company:${card.companyKey}`;
/** アダプタが判定に使う属性（求人リンク、Green の事業内容の画像、paiza の求人情報） */
const OBSERVED_ATTRIBUTES = ['href', 'alt', 'data-analytics-info'];

export class Runtime {
  private readonly doc: Document;
  private readonly adapter: SiteAdapter;
  private readonly getUrl: () => string;
  private readonly now: () => number;
  private readonly fetchFn: FetchQueueOptions['fetchFn'];
  private readonly schedule: (callback: () => void) => void;
  private readonly setTimer: (callback: () => void, ms: number) => void;
  private readonly healthCheckMs: number;
  private readonly queueOptions: RuntimeDeps['queueOptions'];

  private settings: Settings | null = null;
  private lists: UserLists = mergeLists(undefined);
  private readonly jobs = new Map<string, JobRecord>();
  private readonly companies = new Map<string, CompanyRecord>();
  private readonly lookedUpJobs = new Set<string>();
  private readonly lookedUpCompanies = new Set<string>();
  /** 取得をあきらめた求人（このタブの間は取り直さない） */
  private readonly givenUp = new Set<string>();
  /** ページあたりの上限で取得キューに入らなかった求人（URL が変わったら数え直す） */
  private readonly skipped = new Set<string>();
  private cards = new Map<Element, CardEntry>();
  private readonly revealed = new Set<string>();
  private revealAll = false;
  private readonly warnings = new Set<string>();
  private observer: MutationObserver | null = null;
  private queue: FetchQueue | null = null;
  private active = false;
  private stopped = false;
  private url: string;
  private scanScheduled = false;
  private renderScheduled = false;
  private scanning: Promise<void> | null = null;
  private rescanRequested = false;

  constructor(deps: RuntimeDeps) {
    this.doc = deps.doc;
    this.adapter = deps.adapter;
    this.getUrl = deps.getUrl ?? (() => deps.doc.URL);
    this.now = deps.now ?? (() => Date.now());
    this.fetchFn = deps.fetchFn ?? ((url, init) => fetch(url, init));
    this.schedule =
      deps.schedule ??
      ((callback) => {
        requestAnimationFrame(() => callback());
      });
    this.setTimer =
      deps.setTimer ??
      ((callback, ms) => {
        setTimeout(callback, ms);
      });
    this.healthCheckMs = deps.healthCheckMs ?? 5000;
    this.queueOptions = deps.queueOptions;
    this.url = this.getUrl();
  }

  async start(): Promise<void> {
    const [settings, lists] = await Promise.all([loadSettings(), loadLists()]);
    if (this.stopped) return;
    this.settings = settings;
    this.lists = lists;
    browser.storage.onChanged.addListener(this.onStorageChanged);
    await this.activate();
  }

  stop(): void {
    this.stopped = true;
    browser.storage.onChanged.removeListener(this.onStorageChanged);
    this.deactivate();
  }

  async onUrlChange(): Promise<void> {
    if (this.stopped) return;
    const url = this.getUrl();
    if (url === this.url) return;
    this.url = url;
    this.revealed.clear();
    this.revealAll = false;
    this.skipped.clear();
    this.warnings.delete(WARN_UNRECOGNIZED);
    this.deactivate();
    await this.activate();
  }

  async scanNow(): Promise<void> {
    if (this.scanning) {
      this.rescanRequested = true;
      return this.scanning;
    }
    this.scanning = (async () => {
      do {
        this.rescanRequested = false;
        await this.scanOnce();
      } while (this.rescanRequested && this.active);
    })().finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  stats(): PageStats {
    let hidden = 0;
    let flagged = 0;
    let pending = 0;
    let unrecognized = 0;
    const reasons: Record<string, number> = {};
    for (const entry of this.cards.values()) {
      if (!entry.data) {
        unrecognized += 1;
        continue;
      }
      const verdict = entry.verdict;
      if (!verdict) continue;
      if (verdict.level === 'hide') hidden += 1;
      else if (verdict.level === 'flag') flagged += 1;
      else if (verdict.level === 'pending') pending += 1;
      if (verdict.level === 'hide' || verdict.level === 'flag') {
        for (const reason of verdict.reasons) reasons[reason.label] = (reasons[reason.label] ?? 0) + 1;
      }
    }
    return { site: this.adapter.site, listPage: this.active, cards: this.cards.size, hidden, flagged, pending, unrecognized, reasons, warnings: [...this.warnings] };
  }

  private enabledHere(): boolean {
    return Boolean(this.settings?.enabled && this.settings.sites[this.adapter.site]);
  }

  private async activate(): Promise<void> {
    if (this.stopped || !this.enabledHere()) {
      this.deactivate();
      return;
    }
    const url = new URL(this.getUrl());
    if (this.adapter.detail?.isDetailPage(url)) {
      this.deactivate();
      await this.learnFromThisPage(url);
      return;
    }
    if (!this.adapter.isListPage(url)) {
      this.deactivate();
      return;
    }
    this.active = true;
    ensureStyle(this.doc);
    this.ensureQueue();
    this.observe();
    this.armHealthCheck();
    await this.scanNow();
  }

  private deactivate(): void {
    this.active = false;
    this.observer?.disconnect();
    this.observer = null;
    this.queue?.resetPage();
    this.cards = new Map();
    removeAllUi(this.doc);
  }

  private observe(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((records) => {
      if (this.getUrl() !== this.url) {
        void this.onUrlChange();
        return;
      }
      // 文字や属性の書き換えは、拡張機能自身は行わない（バーは Shadow DOM の中、自分の属性は監視の対象外）
      const onlyOwnChanges = records.every(
        (record) => record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(isOwnNode),
      );
      if (!onlyOwnChanges) this.scheduleScan();
    });
    this.observer.observe(this.doc.documentElement, {
      childList: true,
      subtree: true,
      // サイトが要素を残したまま文字やリンクだけを書き換えても判定し直す（アダプタが読む属性だけを見る）
      characterData: true,
      attributes: true,
      attributeFilter: OBSERVED_ATTRIBUTES,
    });
  }

  private scheduleScan(): void {
    if (this.scanScheduled) return;
    this.scanScheduled = true;
    this.schedule(() => {
      this.scanScheduled = false;
      void this.scanNow();
    });
  }

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    this.schedule(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  private armHealthCheck(): void {
    const url = this.url;
    this.setTimer(() => {
      if (!this.active || this.url !== url) return;
      const total = this.cards.size;
      const recognized = [...this.cards.values()].filter((entry) => entry.data !== null).length;
      if (total === 0 || recognized / total < 0.5) {
        this.warnings.add(WARN_UNRECOGNIZED);
        console.warn('[ses-sieve] cards not recognized', { site: this.adapter.site, url, total, recognized });
        this.render();
      }
    }, this.healthCheckMs);
  }

  private extractSafe(element: Element): CardEntry {
    try {
      return { data: this.adapter.extract(element) };
    } catch (error) {
      console.warn('[ses-sieve] failed to read a card', error);
      return { data: null };
    }
  }

  /** 毎回すべてのカードを読み直す。サイトが要素を使い回して中身だけ替えても、新しい中身で判定するため */
  private async scanOnce(): Promise<void> {
    if (!this.active) return;
    const next = new Map<Element, CardEntry>();
    for (const element of this.adapter.findCards(this.doc)) next.set(element, this.extractSafe(element));
    // カードでなくなった要素（中身が差し替わった・囲みが変わったなど）に古い表示を残さない
    for (const element of this.cards.keys()) if (!next.has(element)) clearCard(element);
    this.cards = next;
    const cards = [...next.values()].flatMap((entry) => (entry.data ? [entry.data] : []));
    await this.lookUpRecords(cards);
    for (const card of cards) await this.recordBusinessHit(card);
    for (const card of cards) await this.recordCardHit(card);
    this.render();
  }

  private async lookUpRecords(cards: CardData[]): Promise<void> {
    const jobIds = [...new Set(cards.flatMap((card) => (card.jobId && !this.lookedUpJobs.has(card.jobId) ? [card.jobId] : [])))];
    const companyKeys = [...new Set(cards.map((card) => card.companyKey).filter((key) => !this.lookedUpCompanies.has(key)))];
    if (jobIds.length === 0 && companyKeys.length === 0) return;
    for (const id of jobIds) this.lookedUpJobs.add(id);
    for (const key of companyKeys) this.lookedUpCompanies.add(key);
    try {
      const { jobs, companies } = await loadRecords(this.adapter.site, jobIds, companyKeys, this.now());
      for (const [id, record] of jobs) this.jobs.set(id, record);
      for (const [key, record] of companies) this.companies.set(key, record);
    } catch (error) {
      console.warn('[ses-sieve] failed to read saved judgements', error);
    }
  }

  private async recordBusinessHit(card: CardData): Promise<void> {
    if (!card.fields.business) return;
    const result = judgeFields({ business: card.fields.business, text: '' }, 'card-rule');
    if (result.level !== 'hide' || !result.category) return;
    if (this.companies.get(card.companyKey)?.businessHit === result.category) return;
    const now = this.now();
    try {
      this.companies.set(card.companyKey, await saveBusinessHit(this.adapter.site, card.companyKey, card.companyName, result.category, now));
    } catch (error) {
      console.warn('[ses-sieve] failed to save a company record; keeping it in memory', error);
      const previous = this.companies.get(card.companyKey) ?? emptyCompany(card.companyName, now);
      this.companies.set(card.companyKey, { ...previous, businessHit: result.category, updatedAt: now });
    }
  }

  /**
   * カードのほかの欄の強いルールの当たりを、企業の記録の対象の求人にする。当たらなくなったら記録から外す（段階2b 仕様 5.1）。
   * 詳細判定の記録がある求人は扱わない
   */
  private async recordCardHit(card: CardData): Promise<void> {
    if (!card.jobId) return;
    const job = this.jobs.get(card.jobId);
    if (job && job.level !== 'unknown') return;
    const category = cardTargetCategory(judgeFields(card.fields, 'card-rule'));
    if ((category ?? undefined) === this.companies.get(card.companyKey)?.targetJobs[card.jobId]) return;
    const now = this.now();
    try {
      this.companies.set(card.companyKey, await saveCardHit(this.adapter.site, card.companyKey, card.companyName, card.jobId, category, now));
    } catch (error) {
      console.warn('[ses-sieve] failed to save a company record; keeping it in memory', error);
      const previous = this.companies.get(card.companyKey) ?? emptyCompany(card.companyName, now);
      this.companies.set(card.companyKey, withJobResult(previous, card.jobId, category ? 'hide' : 'unknown', category ?? undefined, now));
    }
  }

  private render(): void {
    if (!this.active || !this.settings) return;
    const mode = this.settings.mode;
    let hidden = 0;
    let flagged = 0;
    let pending = 0;
    for (const [element, entry] of this.cards) {
      const data = entry.data;
      if (!data) {
        clearCard(element);
        continue;
      }
      try {
        const verdict = this.decideFor(data);
        const state = stateFor(verdict, mode, this.revealAll || this.revealed.has(revealKey(data)));
        applyCard(element, verdict, state, (action) => {
          void this.onAction(data, verdict, action);
        });
        entry.verdict = verdict;
        if (verdict.level === 'hide') hidden += 1;
        else if (verdict.level === 'flag') flagged += 1;
        else if (verdict.level === 'pending') {
          pending += 1;
          this.enqueueDetail(data);
        }
      } catch (error) {
        // 1枚の失敗で残りのカードを止めない。失敗したカードは隠さず、認識できなかったカードとして数える
        console.warn('[ses-sieve] failed to show a card', error);
        clearCard(element);
        entry.data = null;
        entry.verdict = undefined;
      }
    }
    renderCounter(this.doc, { hidden, flagged, pending, warnings: [...this.warnings], revealAll: this.revealAll }, () => {
      this.revealAll = !this.revealAll;
      this.render();
    });
  }

  private decideFor(card: CardData): Verdict {
    return decide({
      site: this.adapter.site,
      card,
      lists: this.lists,
      job: card.jobId ? this.jobs.get(card.jobId) : undefined,
      company: this.companies.get(card.companyKey),
      cardResult: judgeFields(card.fields, 'card-rule'),
      canPrefetch: this.canPrefetch(card),
    });
  }

  private canPrefetch(card: CardData): boolean {
    if (!this.adapter.detail || !this.settings?.paizaPrefetch || !this.queue || this.queue.stopped || !card.jobId) return false;
    return !this.givenUp.has(card.jobId) && !this.skipped.has(card.jobId);
  }

  private enqueueDetail(card: CardData): void {
    const url = this.adapter.detail?.url(card);
    if (!url || !card.jobId || !this.queue) return;
    if (this.queue.enqueue({ jobId: card.jobId, url }) === 'rejected') {
      this.skipped.add(card.jobId);
      this.scheduleRender();
    }
  }

  private listOpFor(card: CardData, verdict: Verdict, action: Exclude<BarAction, 'reveal'>): ListOp {
    const site = this.adapter.site;
    const companyId = listKey(site, card.companyKey);
    const jobKey = verdict.decidedAt === 'job' && card.jobId ? listKey(site, card.jobId) : null;
    switch (action) {
      case 'notSes':
        return jobKey ? { type: 'allowJob', key: jobKey, name: card.companyName } : { type: 'allowCompany', key: companyId, name: card.companyName };
      case 'blockCompany':
        return { type: 'blockCompany', key: companyId, name: card.companyName };
      case 'unblockCompany':
        return { type: 'unblockCompany', key: companyId };
      case 'undoAllow':
        return jobKey ? { type: 'unallowJob', key: jobKey } : { type: 'unallowCompany', key: companyId };
    }
  }

  private async onAction(card: CardData, verdict: Verdict, action: BarAction): Promise<void> {
    if (action === 'reveal') {
      this.revealed.add(revealKey(card));
      this.render();
      return;
    }
    const op = this.listOpFor(card, verdict, action);
    try {
      this.lists = await updateLists(op, this.now());
    } catch (error) {
      console.warn('[ses-sieve] failed to save your choice; keeping it for this page', error);
      this.lists = applyListOp(this.lists, op, this.now());
    }
    this.render();
  }

  private ensureQueue(): void {
    if (this.queue || !this.adapter.detail || !this.settings) return;
    this.queue = new FetchQueue({
      ...this.queueOptions,
      intervalMs: this.settings.fetchIntervalMs,
      fetchFn: this.fetchFn,
      onResult: (task, html) => this.onDetailFetched(task, html),
      onGiveUp: (task) => {
        this.givenUp.add(task.jobId);
        this.scheduleRender();
      },
      onStop: () => {
        this.warnings.add(WARN_FETCH_STOPPED);
        this.scheduleRender();
      },
    });
  }

  private async onDetailFetched(task: FetchTask, html: string): Promise<void> {
    const detail = this.adapter.detail;
    if (!detail) return;
    let parsed: DetailData;
    try {
      parsed = detail.parse(new DOMParser().parseFromString(html, 'text/html'), task.jobId);
    } catch (error) {
      console.warn('[ses-sieve] failed to read a fetched detail page', error);
      parsed = { jobId: task.jobId, devContentsTypes: null, fields: { text: '' } };
    }
    await this.saveDetail(parsed, this.cardDataFor(task.jobId));
    this.render();
  }

  private cardDataFor(jobId: string): CardData | undefined {
    for (const entry of this.cards.values()) if (entry.data?.jobId === jobId) return entry.data;
    return undefined;
  }

  /** 判定を保存する。保存に失敗しても、このページ表示の間はメモリ上の結果で動き続ける */
  private async saveDetail(detail: DetailData, card?: CardData): Promise<void> {
    const companyKey = detail.companyKey ?? card?.companyKey;
    if (!companyKey) return;
    const judgement = judgeDetail(detail);
    const companyName = detail.companyName ?? card?.companyName ?? '';
    const now = this.now();
    let job: JobRecord;
    let company: CompanyRecord;
    try {
      ({ job, company } = await saveJobResult({
        site: this.adapter.site,
        jobId: detail.jobId,
        companyKey,
        companyName,
        level: judgement.level,
        category: judgement.category,
        reasons: judgement.reasons,
        now,
      }));
    } catch (error) {
      console.warn('[ses-sieve] failed to save a judgement; keeping it in memory', error);
      job = makeJobRecord(judgement.level, judgement.category, judgement.reasons, now);
      company = withJobResult(this.companies.get(companyKey) ?? emptyCompany(companyName, now), detail.jobId, judgement.level, judgement.category, now);
    }
    this.jobs.set(detail.jobId, job);
    this.lookedUpJobs.add(detail.jobId);
    this.companies.set(companyKey, company);
    this.lookedUpCompanies.add(companyKey);
  }

  private async learnFromThisPage(url: URL): Promise<void> {
    const detail = this.adapter.detail;
    const jobId = /(\d+)\/?$/.exec(url.pathname)?.[1];
    if (!detail || !jobId) return;
    try {
      await this.saveDetail(detail.parse(this.doc, jobId));
    } catch (error) {
      console.warn('[ses-sieve] failed to read this detail page', error);
    }
  }

  private readonly onStorageChanged = (changes: StorageChanges, area: string): void => {
    if (area !== 'local' || this.stopped) return;
    const settingsChange = changes[SETTINGS_KEY];
    if (settingsChange) {
      this.settings = mergeSettings(settingsChange.newValue);
      void this.activate();
      return;
    }
    let dirty = false;
    const listsChange = changes[LISTS_KEY];
    if (listsChange) {
      this.lists = mergeLists(listsChange.newValue);
      dirty = true;
    }
    const jobPrefix = `job:${this.adapter.site}:`;
    const companyPrefix = `company:${this.adapter.site}:`;
    for (const [key, change] of Object.entries(changes)) {
      if (key.startsWith(jobPrefix)) {
        const id = key.slice(jobPrefix.length);
        if (isJobRecord(change.newValue)) {
          this.jobs.set(id, change.newValue);
        } else {
          this.jobs.delete(id);
          this.lookedUpJobs.delete(id);
          this.givenUp.delete(id);
          this.queue?.forget(id);
        }
        dirty = true;
      } else if (key.startsWith(companyPrefix)) {
        const companyKey = key.slice(companyPrefix.length);
        if (isCompanyRecord(change.newValue)) {
          this.companies.set(companyKey, change.newValue);
        } else {
          this.companies.delete(companyKey);
          this.lookedUpCompanies.delete(companyKey);
        }
        dirty = true;
      }
    }
    if (dirty && this.active) this.scheduleRender();
  };
}

/** コンテンツスクリプトの入口から呼ぶ。WXT の ctx が無効になったら片づける */
export function runContentScript(ctx: ContentScriptContext, adapter: SiteAdapter): Runtime {
  const runtime = new Runtime({
    doc: document,
    adapter,
    schedule: (callback) => {
      ctx.requestAnimationFrame(() => callback());
    },
    setTimer: (callback, ms) => {
      ctx.setTimeout(callback, ms);
    },
  });
  const onMessage = (message: unknown, _sender: unknown, sendResponse: (response: PageStats) => void): void => {
    if ((message as { type?: unknown } | null)?.type === STATS_MESSAGE) sendResponse(runtime.stats());
  };
  browser.runtime.onMessage.addListener(onMessage);
  ctx.onInvalidated(() => {
    browser.runtime.onMessage.removeListener(onMessage);
    runtime.stop();
  });
  ctx.addEventListener(window, 'wxt:locationchange', () => {
    void runtime.onUrlChange();
  });
  ctx.addEventListener(window, 'popstate', () => {
    void runtime.onUrlChange();
  });
  void runtime.start();
  return runtime;
}
