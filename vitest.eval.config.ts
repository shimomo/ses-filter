import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// 精度の評価（pnpm eval など）の入口だけを動かす。通常の pnpm test には含めない
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'jsdom',
    include: ['eval/**/*.eval.ts'],
    testTimeout: 120_000,
    // vitest 5 は通ったテストの console 出力を既定で隠す。入口が画面に出す表や件数を見せるため、隠さない
    silent: false,
  },
});
