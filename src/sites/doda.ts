import { normalizeCompanyName, squash } from '../core/normalize';
import type { SiteAdapter } from '../core/types';

/** 第三者のコード（2026-04）にもとづき、2026-10-16 の実ページ（tests/fixtures/doda/2026-10-16-list.html）で確かめた。サイトが変わったら新しいフィクスチャで直す */
export const DODA_SELECTORS = {
  card: 'article',
  detailLink: 'a[href*="JobSearchDetail/j_jid__"]',
  company: '.jobCard-header__link h2',
  title: '.jobCard-header__link p',
  infoItem: 'dl.jobCard-info',
  infoTitle: '.jobCard-info__title',
  infoContent: '.jobCard-info__content',
  /** doda が求人に付ける検索キーワードのタグ（「この求人のキーワード：…」） */
  keywordArea: '.similarKeywordArea',
} as const;

/** カードの文字。キーワードのタグは求人の本文ではないので外す（「客先常駐なし」の求人にも「客先常駐」のタグが付くため。段階2b の確かめ用で見つかった） */
function cardText(card: Element): string {
  const copy = card.cloneNode(true) as Element;
  for (const area of copy.querySelectorAll(DODA_SELECTORS.keywordArea)) area.remove();
  return squash(copy.textContent);
}

export const dodaAdapter: SiteAdapter = {
  site: 'doda',
  isListPage: (url) => url.hostname === 'doda.jp' && url.pathname.startsWith('/DodaFront/View/JobSearchList'),
  findCards: (doc) => Array.from(doc.querySelectorAll(DODA_SELECTORS.card)).filter((el) => el.querySelector(DODA_SELECTORS.detailLink)),
  extract(card) {
    // 別のカードを包む要素や、複数の求人へリンクする要素は、まとめて隠さないよう認識しない
    if (card.querySelector(`:scope ${DODA_SELECTORS.card} ${DODA_SELECTORS.detailLink}`)) return null;
    const jobIds = new Set(
      Array.from(card.querySelectorAll(DODA_SELECTORS.detailLink), (link) => /j_jid__(\d+)/.exec(link.getAttribute('href') ?? '')?.[1]).filter(Boolean),
    );
    if (jobIds.size > 1) return null;
    const companyName = squash(card.querySelector(DODA_SELECTORS.company)?.textContent);
    if (!companyName) return null;
    const href = card.querySelector(DODA_SELECTORS.detailLink)?.getAttribute('href') ?? '';
    const info = new Map<string, string>();
    for (const item of card.querySelectorAll(DODA_SELECTORS.infoItem)) {
      const label = squash(item.querySelector(DODA_SELECTORS.infoTitle)?.textContent);
      if (label) info.set(label, squash(item.querySelector(DODA_SELECTORS.infoContent)?.textContent));
    }
    return {
      jobId: /j_jid__(\d+)/.exec(href)?.[1] ?? null,
      companyKey: normalizeCompanyName(companyName),
      companyName,
      fields: {
        title: squash(card.querySelector(DODA_SELECTORS.title)?.textContent) || undefined,
        location: info.get('勤務地') || undefined,
        business: info.get('事業') || undefined,
        text: cardText(card),
      },
    };
  },
};
