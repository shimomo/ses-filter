// 評価ページの取得（scripts/capture-eval.ts）で、1件ずつ順に取りに行き、止めどきを決める（仕様 4.2）

/** 続けても無駄な失敗（403・429）。そのサイトの取得をすぐ止める */
export class StopError extends Error {}

/** 1サイトの取得の状態。一覧と詳細ページのように続けて回すループで共有し、止めたら後のループも動かさない */
export type Turns = { stopped: boolean; failures: number };

export const newTurns = (): Turns => ({ stopped: false, failures: 0 });

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 1件ずつ順に処理する。403・429 ならすぐ止め、ほかのエラーが3回続いても（ループをまたいでも）止める */
export async function eachInTurn<T>(turns: Turns, items: readonly T[], intervalMs: number, run: (item: T) => Promise<void>): Promise<void> {
  for (const [index, item] of items.entries()) {
    if (turns.stopped) return;
    if (index > 0) await pause(intervalMs);
    try {
      await run(item);
      turns.failures = 0;
    } catch (error) {
      if (error instanceof StopError) {
        console.error(`stopped: ${error.message}`);
        turns.stopped = true;
        return;
      }
      turns.failures += 1;
      console.error(`failed: ${error instanceof Error ? error.message : String(error)}`);
      if (turns.failures >= 3) {
        console.error('stopped: 3 errors in a row');
        turns.stopped = true;
        return;
      }
    }
  }
}
