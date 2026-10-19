import { normalizeCompanyName, squash } from '../core/normalize';
import type { SiteAdapter } from '../core/types';

export const RIKUNABI_HOST = 'next.rikunabi.com';
export const RIKUNABI_JOB_ID = /\/viewjob\/(jk[0-9a-f]{16})\//;

/**
 * 2026-10-20 の実ページ（tests/fixtures/rikunabi/2026-10-20-list.html）で確かめた。クラス名の末尾はビルドごとに変わるので、
 * リンクの形と data-content を優先し、クラス名は変わらない前半だけで選ぶ。サイトが変わったら新しいフィクスチャで直す
 */
export const RIKUNABI_SELECTORS = {
  jobLink: 'a[href^="/viewjob/jk"]',
  company: '[class*="employerName"]',
  title: 'h2',
  location: '[data-content="location"]',
} as const;

const LIST_PATH = /^\/job_search\//;

export const rikunabiAdapter: SiteAdapter = {
  site: 'rikunabi',
  isListPage: (url) => url.hostname === RIKUNABI_HOST && LIST_PATH.test(url.pathname),
  // 一覧の間に挟まる絞り込みの案内（li）は求人へのリンクがないので、カードにならない
  findCards: (doc) => Array.from(doc.querySelectorAll('li')).filter((li) => li.querySelector(RIKUNABI_SELECTORS.jobLink)),
  extract(card) {
    // 別のカードを包む要素は、まとめて隠さないよう認識しない。カードの中には特徴のタグの li があるので、求人へのリンクを持つ li で見分ける
    if (Array.from(card.querySelectorAll('li')).some((li) => li.querySelector(RIKUNABI_SELECTORS.jobLink))) return null;
    const jobIds = new Set<string>();
    for (const link of card.querySelectorAll(RIKUNABI_SELECTORS.jobLink)) {
      const id = RIKUNABI_JOB_ID.exec(link.getAttribute('href') ?? '')?.[1];
      if (id) jobIds.add(id);
    }
    const [jobId] = jobIds;
    if (jobIds.size !== 1 || !jobId) return null;
    const companyName = squash(card.querySelector(RIKUNABI_SELECTORS.company)?.textContent);
    if (!companyName) return null;
    return {
      jobId,
      // 会社ページへのリンクは半分ほどのカードにしかないので、社名で見分ける（仕様 4.2）
      companyKey: normalizeCompanyName(companyName),
      companyName,
      fields: {
        title: squash(card.querySelector(RIKUNABI_SELECTORS.title)?.textContent) || undefined,
        location: squash(card.querySelector(RIKUNABI_SELECTORS.location)?.textContent) || undefined,
        text: squash(card.textContent),
      },
    };
  },
};
