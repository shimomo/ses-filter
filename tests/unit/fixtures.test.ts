import { describe, expect, it } from 'vitest';
import { hasFixture, loadFixture } from '../helpers/fixtures';

// 保存したページ（tests/fixtures/）は公開していないので、ないときは飛ばす
describe('captured fixtures', () => {
  it.skipIf(!hasFixture('paiza', 'list'))('paiza list has job cards', () => {
    expect(loadFixture('paiza', 'list').querySelectorAll('.s-job-offer-card').length).toBeGreaterThanOrEqual(10);
  });

  it.skipIf(!hasFixture('paiza', 'detail'))('paiza detail has the development type row', () => {
    const terms = [...loadFixture('paiza', 'detail').querySelectorAll('dt.m-definitions-responsive__term')].map((dt) =>
      dt.textContent?.trim(),
    );
    expect(terms).toContain('開発内容タイプ');
  });

  it.skipIf(!hasFixture('green', 'search'))('green search has job cards', () => {
    expect(loadFixture('green', 'search').querySelectorAll('h2.job-offer-name').length).toBeGreaterThanOrEqual(10);
  });

  it.skipIf(!hasFixture('doda', 'list'))('doda list has job links', () => {
    expect(loadFixture('doda', 'list').querySelectorAll('a[href*="JobSearchDetail/j_jid__"]').length).toBeGreaterThanOrEqual(10);
  });

  for (const [site, name] of [
    ['paiza', 'list'],
    ['paiza', 'detail'],
    ['green', 'search'],
  ] as const) {
    it.skipIf(!hasFixture(site, name))(`${site} ${name} contains no script elements`, () => {
      expect(loadFixture(site, name).querySelectorAll('script')).toHaveLength(0);
    });
  }
});
