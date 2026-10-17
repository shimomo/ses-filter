import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** tests/fixtures/<site>/ にある `-<name>.html` で終わるファイルのうち、日付が最も新しいもの */
export function fixturePath(site: string, name: string): string | null {
  const dir = path.resolve('tests/fixtures', site);
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir)
    .filter((f) => f.endsWith(`-${name}.html`))
    .sort()
    .at(-1);
  return file ? path.join(dir, file) : null;
}

export const hasFixture = (site: string, name: string): boolean => fixturePath(site, name) !== null;

export function loadFixture(site: string, name: string): Document {
  const file = fixturePath(site, name);
  if (!file) throw new Error(`fixture not found: tests/fixtures/${site}/*-${name}.html`);
  return new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'text/html');
}
