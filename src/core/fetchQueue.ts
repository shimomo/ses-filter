export type FetchTask = { jobId: string; url: string };

export type FetchQueueOptions = {
  intervalMs: number;
  maxPerPage?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  maxConsecutiveFailures?: number;
  fetchFn: (url: string, init: RequestInit) => Promise<Response>;
  onResult: (task: FetchTask, html: string) => void | Promise<void>;
  /** その求人の取得をあきらめた（404、再試行の失敗、停止） */
  onGiveUp: (task: FetchTask) => void;
  /** 失敗が続いたので、このタブでは取得をやめた */
  onStop: () => void;
};

export type EnqueueResult = 'queued' | 'duplicate' | 'rejected';

type Outcome = { kind: 'ok'; html: string } | { kind: 'gone' } | { kind: 'failed' } | { kind: 'aborted' };

/** 同一オリジンの詳細ページを1件ずつ、間隔をあけて取得する */
export class FetchQueue {
  private readonly options: FetchQueueOptions;
  private readonly maxPerPage: number;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly maxFailures: number;
  private tasks: FetchTask[] = [];
  private readonly known = new Set<string>();
  private inFlight: FetchTask | null = null;
  private acceptedThisPage = 0;
  private failures = 0;
  private running = false;
  private stoppedFlag = false;
  private generation = 0;
  private pageAbort = new AbortController();

  constructor(options: FetchQueueOptions) {
    this.options = options;
    this.maxPerPage = options.maxPerPage ?? 30;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retryDelayMs = options.retryDelayMs ?? 3_000;
    this.maxFailures = options.maxConsecutiveFailures ?? 3;
  }

  get stopped(): boolean {
    return this.stoppedFlag;
  }

  enqueue(task: FetchTask): EnqueueResult {
    if (this.known.has(task.jobId)) return 'duplicate';
    if (this.stoppedFlag || this.acceptedThisPage >= this.maxPerPage) return 'rejected';
    this.known.add(task.jobId);
    this.acceptedThisPage += 1;
    this.tasks.push(task);
    void this.pump();
    return 'queued';
  }

  /** 保存済みの判定が消されたときなどに、取得済みの求人をもう一度受け付けるようにする */
  forget(jobId: string): void {
    if (this.inFlight?.jobId === jobId || this.tasks.some((t) => t.jobId === jobId)) return;
    this.known.delete(jobId);
  }

  /** URL が変わったとき: 待っている分と取得中の分をやめ、ページあたりの上限を数え直す */
  resetPage(): void {
    this.generation += 1;
    this.pageAbort.abort();
    this.pageAbort = new AbortController();
    for (const t of this.tasks) this.known.delete(t.jobId);
    if (this.inFlight) this.known.delete(this.inFlight.jobId);
    this.tasks = [];
    this.acceptedThisPage = 0;
    this.running = false;
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const generation = this.generation;
    try {
      while (generation === this.generation && !this.stoppedFlag) {
        const task = this.tasks.shift();
        if (!task) break;
        const html = await this.fetchWithRetry(task, generation);
        if (generation !== this.generation) return;
        if (html !== null) {
          try {
            await this.options.onResult(task, html);
          } catch (error) {
            console.warn('[ses-sieve] failed to handle a fetched page', error);
          }
        }
        if (this.tasks.length > 0 && !this.stoppedFlag) await this.sleep(this.options.intervalMs);
      }
    } finally {
      if (generation === this.generation) this.running = false;
    }
  }

  private async fetchWithRetry(task: FetchTask, generation: number): Promise<string | null> {
    this.inFlight = task;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) await this.sleep(this.retryDelayMs);
        if (generation !== this.generation || this.stoppedFlag) return null;
        const outcome = await this.attempt(task.url);
        if (outcome.kind === 'ok') {
          this.failures = 0;
          return outcome.html;
        }
        if (outcome.kind === 'aborted') return null;
        if (outcome.kind === 'gone') {
          this.options.onGiveUp(task);
          return null;
        }
        this.failures += 1;
        if (this.failures >= this.maxFailures) {
          this.options.onGiveUp(task);
          this.stop();
          return null;
        }
      }
      this.options.onGiveUp(task);
      return null;
    } finally {
      this.inFlight = null;
    }
  }

  private async attempt(url: string): Promise<Outcome> {
    const controller = new AbortController();
    const pageSignal = this.pageAbort.signal;
    const onPageAbort = (): void => controller.abort();
    pageSignal.addEventListener('abort', onPageAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.options.fetchFn(url, { credentials: 'same-origin', signal: controller.signal });
      if (res.status === 404 || res.status === 410) return { kind: 'gone' };
      if (!res.ok) return { kind: 'failed' };
      return { kind: 'ok', html: await res.text() };
    } catch {
      return pageSignal.aborted ? { kind: 'aborted' } : { kind: 'failed' };
    } finally {
      clearTimeout(timer);
      pageSignal.removeEventListener('abort', onPageAbort);
    }
  }

  private stop(): void {
    if (this.stoppedFlag) return;
    this.stoppedFlag = true;
    const dropped = this.tasks;
    this.tasks = [];
    for (const t of dropped) this.options.onGiveUp(t);
    this.options.onStop();
  }

  private sleep(ms: number): Promise<void> {
    const signal = this.pageAbort.signal;
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
