import { squash } from '../core/normalize';
import type { SiteAdapter } from '../core/types';

const JOB_LINK = 'a[href^="/company/"][href*="/job/"]';
const JOB_HREF = /^\/company\/(\d+)\/job\/(\d+)/;

/** 求人タイトル（h2.job-offer-name）を含むリンクが、そのカードの本体 */
function mainLinks(root: ParentNode): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>(JOB_LINK)).filter((link) => link.querySelector('h2.job-offer-name'));
}

export const greenAdapter: SiteAdapter = {
  site: 'green',
  isListPage: (url) => url.hostname === 'www.green-japan.com' && url.pathname === '/search',
  findCards(doc) {
    const cards = new Set<Element>();
    for (const link of mainLinks(doc)) {
      if (link.parentElement) cards.add(link.parentElement);
    }
    return [...cards];
  },
  extract(card) {
    // 複数の求人を含む要素（カードごとの囲みがなくなった場合など）は、まとめて隠さないよう認識しない
    const links = mainLinks(card);
    const link = links.length === 1 ? links[0] : undefined;
    const match = JOB_HREF.exec(link?.getAttribute('href') ?? '');
    const companyId = match?.[1];
    const jobId = match?.[2];
    if (!link || !companyId || !jobId) return null;
    const nameAlt = link.querySelector('img[alt$="のイメージ画像1"]')?.getAttribute('alt') ?? '';
    const businessImage = link.querySelector('img[alt^="事業内容："]');
    const business =
      squash(businessImage?.parentElement?.parentElement?.textContent) ||
      squash(businessImage?.getAttribute('alt')?.replace(/^事業内容：/, ''));
    return {
      jobId,
      companyKey: companyId,
      companyName: nameAlt.replace(/のイメージ画像1$/, '').trim(),
      fields: {
        title: squash(link.querySelector('h2.job-offer-name')?.textContent) || undefined,
        location: squash(link.querySelector('[aria-label="勤務地"]')?.textContent) || undefined,
        business: business || undefined,
        text: squash(link.textContent),
      },
    };
  },
};
