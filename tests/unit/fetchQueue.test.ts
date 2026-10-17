// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchQueue, type FetchQueueOptions, type FetchTask } from '../../src/core/fetchQueue';

/** fake timers と組み合わせても止まらないよう、本物の Response の代わりに必要な部分だけを持つ値を返す */
const response = (status: number, body = '<html></html>'): Response =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body }) as unknown as Response;
const task = (id: string): FetchTask => ({ jobId: id, url: `https://paiza.jp/career/job_offers/${id}` });

function setup(statuses: number[], overrides: Partial<FetchQueueOptions> = {}) {
  const fetchFn = vi.fn<FetchQueueOptions['fetchFn']>();
  for (const status of statuses) fetchFn.mockImplementationOnce(async () => response(status));
  fetchFn.mockImplementation(async () => response(200));
  const onResult = vi.fn();
  const onGiveUp = vi.fn();
  const onStop = vi.fn();
  const queue = new FetchQueue({ intervalMs: 1000, fetchFn, onResult, onGiveUp, onStop, ...overrides });
  return { queue, fetchFn, onResult, onGiveUp, onStop };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FetchQueue', () => {
  it('fetches one task at a time with the configured interval', async () => {
    const { queue, fetchFn, onResult } = setup([]);
    expect(queue.enqueue(task('1'))).toBe('queued');
    expect(queue.enqueue(task('2'))).toBe('queued');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledWith(task('1'), '<html></html>');
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('rejects tasks over the per-page limit and reports duplicates', () => {
    const { queue } = setup([], { maxPerPage: 2 });
    expect(queue.enqueue(task('1'))).toBe('queued');
    expect(queue.enqueue(task('1'))).toBe('duplicate');
    expect(queue.enqueue(task('2'))).toBe('queued');
    expect(queue.enqueue(task('3'))).toBe('rejected');
  });

  it('retries once after 3 seconds', async () => {
    const { queue, fetchFn, onResult } = setup([500]);
    queue.enqueue(task('1'));
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('gives up after a failed retry and stops after 3 consecutive failures', async () => {
    const { queue, onGiveUp, onStop } = setup([500, 500, 429]);
    queue.enqueue(task('1'));
    queue.enqueue(task('2'));
    queue.enqueue(task('3'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(onGiveUp.mock.calls.map(([t]) => (t as FetchTask).jobId)).toEqual(['1', '2', '3']);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(queue.stopped).toBe(true);
    expect(queue.enqueue(task('4'))).toBe('rejected');
  });

  it('gives up on 404 without retrying or counting a failure', async () => {
    const { queue, fetchFn, onGiveUp, onResult } = setup([404]);
    queue.enqueue(task('1'));
    queue.enqueue(task('2'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(onGiveUp).toHaveBeenCalledWith(task('1'));
    expect(onResult).toHaveBeenCalledWith(task('2'), '<html></html>');
  });

  it('treats a timeout as a failure', async () => {
    const { queue, fetchFn, onResult } = setup([]);
    fetchFn.mockImplementationOnce(
      (_url, init) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    queue.enqueue(task('1'));
    await vi.advanceTimersByTimeAsync(9999);
    expect(onResult).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1 + 3000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('resets the failure count after a success', async () => {
    const { queue, onGiveUp, onStop } = setup([500, 200, 500, 500]);
    queue.enqueue(task('1'));
    queue.enqueue(task('2'));
    await vi.advanceTimersByTimeAsync(8000);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onGiveUp).toHaveBeenCalledWith(task('2'));
    expect(onStop).not.toHaveBeenCalled();
    expect(queue.stopped).toBe(false);
  });

  it('drops queued tasks on resetPage and accepts them again', async () => {
    const { queue, fetchFn } = setup([]);
    queue.enqueue(task('1'));
    queue.enqueue(task('2'));
    await vi.advanceTimersByTimeAsync(0);
    queue.resetPage();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(queue.enqueue(task('1'))).toBe('duplicate');
    expect(queue.enqueue(task('2'))).toBe('queued');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('forget allows a finished task to be fetched again', async () => {
    const { queue, fetchFn } = setup([]);
    queue.enqueue(task('1'));
    await vi.advanceTimersByTimeAsync(0);
    queue.forget('1');
    expect(queue.enqueue(task('1'))).toBe('queued');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
