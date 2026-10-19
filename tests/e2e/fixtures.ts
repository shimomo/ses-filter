import { chromium, test as base, type BrowserContext } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fixturePath } from '../helpers/fixtures';

const EXTENSION_DIR = path.resolve('.output/chrome-mv3');

/** 展開して読み込んだ拡張機能の ID。Chrome は、フォルダの絶対パスの SHA-256 の先頭16バイトを、a〜p の文字で書いたものにする */
export function extensionId(dir: string = EXTENSION_DIR): string {
  const hex = createHash('sha256').update(realpathSync(dir)).digest('hex').slice(0, 32);
  return [...hex].map((digit) => String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(digit, 16))).join('');
}

export function fixtureHtml(site: string, name: string): string | null {
  const file = fixturePath(site, name);
  return file ? readFileSync(file, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') : null;
}

export type ServedRoute = { match: (url: URL) => boolean; html: string };

/** 指定した URL にだけ HTML を返し、それ以外の通信はすべて止める（本物のサイトには接続しない） */
export async function serve(context: BrowserContext, routes: ServedRoute[], onServed?: (url: URL) => void): Promise<void> {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const hit = routes.find((r) => r.match(url));
    if (!hit) {
      await route.abort();
      return;
    }
    onServed?.(url);
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: hit.html });
  });
}

export const test = base.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      locale: 'ja-JP',
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await use(context);
    await context.close();
  },
});

export const expect = test.expect;

/** ポップアップで「詳細ページを先読みする」をオンにし、保存されるまで待つ（先読みは既定でオフ） */
export async function enablePrefetch(context: BrowserContext): Promise<void> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId()}/popup.html`);
  await popup.locator('#prefetch').check();
  await expect
    .poll(() => popup.evaluate('chrome.storage.local.get("settings").then((saved) => saved.settings?.prefetch === true)'))
    .toBe(true);
  await popup.close();
}
