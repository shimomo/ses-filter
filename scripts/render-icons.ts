// Usage: node scripts/render-icons.ts — assets/ のアイコンの SVG を public/icon/<大きさ>.png に書き出す。
// WXT は public/icon/ の PNG を manifest の icons に自動で入れ、ツールバーのアイコンにも使われる
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public/icon');
// 16px は、網目と粒を省いた絵を使う
const SOURCES: ReadonlyArray<{ size: number; source: string }> = [
  { size: 16, source: 'assets/icon-16.svg' },
  { size: 32, source: 'assets/icon.svg' },
  { size: 48, source: 'assets/icon.svg' },
  { size: 128, source: 'assets/icon.svg' },
];

mkdirSync(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { size, source } of SOURCES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const svg = readFileSync(path.join(ROOT, source)).toString('base64');
    await page.setContent(`<style>html, body { margin: 0; background: transparent; } img { display: block; width: ${size}px; height: ${size}px; }</style><img src="data:image/svg+xml;base64,${svg}">`);
    await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    const output = path.join(OUTPUT_DIR, `${size}.png`);
    await page.screenshot({ path: output, omitBackground: true });
    await page.close();
    console.log(`saved ${path.relative(process.cwd(), output)}`);
  }
} finally {
  await browser.close();
}
