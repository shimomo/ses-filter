import { afterEach, describe, expect, it, vi } from 'vitest';
import { eachInTurn, newTurns, StopError } from '../../../eval/lib/turns';

describe('eachInTurn', () => {
  // 止めた理由は画面に出すだけなので、テストでは出さない
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});
  afterEach(() => vi.restoreAllMocks());

  it('stops at a 403 or 429 and skips the later loops that share the turns', async () => {
    quiet();
    const turns = newTurns();
    const done: number[] = [];
    await eachInTurn(turns, [1, 2, 3], 0, async (n) => {
      if (n === 2) throw new StopError('HTTP 429');
      done.push(n);
    });
    await eachInTurn(turns, [4, 5], 0, async (n) => {
      done.push(n);
    });
    expect(done).toEqual([1]);
    expect(turns.stopped).toBe(true);
  });

  it('counts errors in a row across loops and stops at the third', async () => {
    quiet();
    const turns = newTurns();
    const tried: number[] = [];
    const fail = async (n: number) => {
      tried.push(n);
      throw new Error('timeout');
    };
    await eachInTurn(turns, [1, 2], 0, fail);
    await eachInTurn(turns, [3, 4], 0, fail);
    expect(tried).toEqual([1, 2, 3]);
    expect(turns.stopped).toBe(true);
  });

  it('starts counting again after a success', async () => {
    quiet();
    const turns = newTurns();
    const tried: number[] = [];
    await eachInTurn(turns, [1, 2, 3, 4, 5], 0, async (n) => {
      tried.push(n);
      if (n !== 3) throw new Error('timeout');
    });
    expect(tried).toEqual([1, 2, 3, 4, 5]);
    expect(turns.stopped).toBe(false);
  });
});
