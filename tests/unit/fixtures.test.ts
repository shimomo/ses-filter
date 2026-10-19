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

  it.skipIf(!hasFixture('mynavi', 'list'))('mynavi list has engineer job cards', () => {
    expect(loadFixture('mynavi', 'list').querySelectorAll('section.recruit.engineer').length).toBe(50);
  });

  it.skipIf(!hasFixture('mynavi', 'detail'))('mynavi detail has the 事業内容 row and the body sections', () => {
    const doc = loadFixture('mynavi', 'detail');
    expect([...doc.querySelectorAll('th')].map((th) => th.textContent?.trim())).toContain('事業内容');
    expect(doc.querySelectorAll('.jobPointArea h2.jobPointArea__title').length).toBeGreaterThanOrEqual(3);
  });

  for (const [site, name] of [
    ['paiza', 'list'],
    ['paiza', 'detail'],
    ['green', 'search'],
    ['mynavi', 'list'],
    ['mynavi', 'detail'],
  ] as const) {
    it.skipIf(!hasFixture(site, name))(`${site} ${name} contains no script elements`, () => {
      expect(loadFixture(site, name).querySelectorAll('script')).toHaveLength(0);
    });
  }
});
