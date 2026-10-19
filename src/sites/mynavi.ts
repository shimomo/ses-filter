import { squash } from '../core/normalize';
import type { DetailData, SiteAdapter } from '../core/types';

export const MYNAVI_HOST = 'tenshoku.mynavi.jp';
/** 求人ID（<企業ID>-<n>-<m>-<k>）。最初の数字が企業ID */
export const MYNAVI_JOB_ID = /jobinfo-(\d+(?:-\d+){3})/;
/** IT エンジニア職の検索結果（専用のカード）。他職種の一覧（/list/ 直下）は対象外 */
const LIST_PATH = /^\/engineer\/list\//;
/** 詳細ページ。adv1/ は広告型（表の行が少なく本文もほとんどない） */
const DETAIL_PATH = /^\/jobinfo-\d+(?:-\d+){3}\/(?:adv\d+\/)?$/;
const RECORDABLE_DETAIL_PATH = /^\/jobinfo-(\d+(?:-\d+){3})\/$/;

/** 2026-10-18 の実ページ（/engineer/list/o16/、tests/fixtures/mynavi/2026-10-18-list.html）で確かめた。サイトが変わったら新しいフィクスチャで直す */
export const MYNAVI_SELECTORS = {
  card: 'section.recruit.engineer',
  jobLink: 'a[href*="/jobinfo-"]',
  company: '.main_title',
  title: '.sub_title',
  infoRow: 'table.detaile_table tr',
  /** サイトが付ける「関連キーワード」の欄（見出しと一覧） */
  keywordArea: '.keyword',
} as const;

/** 「<社名> | <キャッチコピー>」の区切り。全角の縦棒も同じ扱い */
const COMPANY_SEPARATOR = /\s[|｜]\s/;

/** カードの文字。関連キーワードは求人の本文ではないので外す（doda のキーワードのタグと同じ扱い） */
function cardText(card: Element): string {
  const copy = card.cloneNode(true) as Element;
  for (const area of copy.querySelectorAll(MYNAVI_SELECTORS.keywordArea)) area.remove();
  return squash(copy.textContent);
}

/** 詳細ページの「見出し → 内容」の組（th・dt と、直後の td・dd）。同じ見出しは一番長い内容を使う（「勤務地」は3か所にある） */
function detailPairs(doc: Document): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const head of doc.querySelectorAll('th, dt')) {
    const body = head.nextElementSibling;
    if (!body || (body.tagName !== 'TD' && body.tagName !== 'DD')) continue;
    const term = squash(head.textContent);
    const value = squash(body.textContent);
    if (!term || !value) continue;
    if ((pairs.get(term)?.length ?? -1) < value.length) pairs.set(term, value);
  }
  return pairs;
}

const BODY_HEADING = 'h2.jobPointArea__title';

/**
 * 本文の区画（.jobPointArea の中の h2.jobPointArea__title ごと）を「見出し: 内容」にする。
 * 複数の見出しが同じ容器に並ぶので、見出しから次の見出しまでの兄弟要素を内容にする。ページ下部のオススメ求人（他社の求人）は .jobPointArea の外なので読まない
 */
function bodySections(doc: Document): string[] {
  const sections: string[] = [];
  for (const heading of doc.querySelectorAll(`.jobPointArea ${BODY_HEADING}`)) {
    const parts: string[] = [];
    for (let node = heading.nextElementSibling; node && !node.matches(BODY_HEADING); node = node.nextElementSibling) {
      const text = squash(node.textContent);
      if (text) parts.push(text);
    }
    const content = parts.join(' ');
    if (content) sections.push(`${squash(heading.textContent)}: ${content}`);
  }
  return sections;
}

/** 詳細ページの読み取り。サイト自身の分類はない（devContentsTypes は undefined） */
export function parseMynaviDetail(doc: Document, jobId: string): DetailData {
  const pairs = detailPairs(doc);
  const title = squash(doc.title);
  return {
    jobId,
    companyKey: /\/company\/(\d+)\//.exec(doc.querySelector('a[href*="/company/"]')?.getAttribute('href') ?? '')?.[1],
    companyName: /^(.+?)の(?:求人|メッセージ)情報／/.exec(title)?.[1],
    employment: pairs.get('雇用形態'),
    fields: {
      title: title || undefined,
      location: pairs.get('勤務地'),
      business: pairs.get('事業内容'),
      workHours: pairs.get('勤務時間'),
      text: [...Array.from(pairs, ([term, value]) => `${term}: ${value}`), ...bodySections(doc)].join('\n'),
    },
  };
}

export const mynaviAdapter: SiteAdapter = {
  site: 'mynavi',
  isListPage: (url) => url.hostname === MYNAVI_HOST && LIST_PATH.test(url.pathname),
  findCards: (doc) => Array.from(doc.querySelectorAll(MYNAVI_SELECTORS.card)),
  extract(card) {
    const jobIds = new Set<string>();
    for (const link of card.querySelectorAll(MYNAVI_SELECTORS.jobLink)) {
      const id = MYNAVI_JOB_ID.exec(link.getAttribute('href') ?? '')?.[1];
      if (id) jobIds.add(id);
    }
    // 別のカードを包む要素（求人IDが2種類以上）は、まとめて隠さないよう認識しない
    const [jobId] = jobIds;
    if (jobIds.size !== 1 || !jobId) return null;
    const companyName = squash(card.querySelector(MYNAVI_SELECTORS.company)?.textContent).split(COMPANY_SEPARATOR)[0] ?? '';
    if (!companyName) return null;
    let location: string | undefined;
    for (const row of card.querySelectorAll(MYNAVI_SELECTORS.infoRow)) {
      if (squash(row.querySelector('th')?.textContent) === '勤務地') location = squash(row.querySelector('td')?.textContent) || undefined;
    }
    return {
      jobId,
      companyKey: jobId.split('-')[0] ?? jobId,
      companyName,
      fields: {
        title: squash(card.querySelector(MYNAVI_SELECTORS.title)?.textContent) || undefined,
        location,
        text: cardText(card),
      },
    };
  },
  detail: {
    isDetailPage: (url) => url.hostname === MYNAVI_HOST && DETAIL_PATH.test(url.pathname),
    // 広告型（adv1/）は事業内容も本文もないので記録しない。記録するとカードの当たりより先に「何もしない」が効いてしまう
    jobIdOf: (url) => (url.hostname === MYNAVI_HOST ? (RECORDABLE_DETAIL_PATH.exec(url.pathname)?.[1] ?? null) : null),
    url: (card) => (card.jobId ? `https://${MYNAVI_HOST}/jobinfo-${card.jobId}/` : null),
    parse: parseMynaviDetail,
  },
};
