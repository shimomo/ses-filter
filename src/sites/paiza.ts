import { squash } from '../core/normalize';
import type { DetailData, SiteAdapter } from '../core/types';

const HOST = 'paiza.jp';
const LIST_PATH = /^\/career\/job_offers(?:\/list\/.+|\/topics\/.+)?\/?$/;
const DETAIL_PATH = /^\/career\/job_offers\/\d+\/?$/;

function jobIdOf(card: Element): string | null {
  const info = card.querySelector('.s-job-offer-card__inner [data-analytics-info]')?.getAttribute('data-analytics-info');
  if (info) {
    try {
      const id: unknown = (JSON.parse(info) as { id?: unknown }).id;
      if (typeof id === 'number' || typeof id === 'string') return String(id);
    } catch {
      // 壊れた JSON はリンクから取り直す
    }
  }
  const href = card.querySelector('a.s-job-offer-card__name')?.getAttribute('href') ?? '';
  return /\/job_offers\/(\d+)/.exec(href)?.[1] ?? null;
}

/** 見出しの下の文章をまとめて読む（求人概要・職務内容・会社の説明。段階2b 仕様 5.4） */
function prose(doc: Document, selector: string): string {
  return Array.from(doc.querySelectorAll(selector))
    .map((element) => squash(element.textContent))
    .filter(Boolean)
    .join(' ');
}

/** 詳細ページの「見出し → 内容」の組から、判定に使う項目を取り出す */
export function parsePaizaDetail(doc: Document, jobId: string): DetailData {
  const pairs: Array<[string, string]> = [];
  for (const dt of doc.querySelectorAll('dt.m-definitions-responsive__term')) {
    const dd = dt.nextElementSibling;
    if (dd?.tagName !== 'DD') continue;
    pairs.push([squash(dt.textContent), squash(dd.textContent)]);
  }
  const values = (term: string): string[] => pairs.filter(([t]) => t === term).map(([, d]) => d);
  const devTypes = values('開発内容タイプ')[0];
  const location = values('勤務地').join(' / ');
  const title = squash(doc.title);
  const summary = prose(doc, '#job-offer-feature > .o-recruiters-show__content-text:not(.p-job-offer-updated-date)');
  const description = prose(doc, '#job-offer-description .o-recruiters-show__content-text');
  // その求人の企業の欄の説明だけを読む（ほかの企業の紹介が同じページに並んでも拾わない）
  const business = prose(doc, '.o-recruiters-show__recruiter_box .m-recruiter-feature__text');
  return {
    jobId,
    companyKey: /\/recruiters\/(\d+)/.exec(doc.querySelector('a[href^="/recruiters/"]')?.getAttribute('href') ?? '')?.[1],
    companyName: /の求人:(.+?) \|/.exec(title)?.[1],
    devContentsTypes: devTypes === undefined ? null : devTypes.split('、').map((s) => s.trim()).filter(Boolean),
    employment: values('雇用関係')[0],
    fields: {
      title: title || undefined,
      location: location || undefined,
      business: business || undefined,
      workHours: values('勤務時間')[0],
      text: [
        ...pairs.map(([t, d]) => `${t}: ${d}`),
        ...(summary ? [`求人概要: ${summary}`] : []),
        ...(description ? [`職務内容: ${description}`] : []),
      ].join('\n'),
    },
  };
}

export const paizaAdapter: SiteAdapter = {
  site: 'paiza',
  isListPage: (url) => url.hostname === HOST && LIST_PATH.test(url.pathname),
  findCards: (doc) => Array.from(doc.querySelectorAll('.s-job-offer-card')),
  extract(card) {
    // 複数の企業のカードを包む要素は、まとめて隠さないよう認識しない
    if (card.querySelectorAll('a.s-job-offer-card__recruiter-name').length !== 1) return null;
    const recruiter = card.querySelector('a.s-job-offer-card__recruiter-name');
    const companyId = /\/recruiters\/(\d+)/.exec(recruiter?.getAttribute('href') ?? '')?.[1];
    if (!recruiter || !companyId) return null;
    const inner = card.querySelector('.s-job-offer-card__inner') ?? card;
    return {
      jobId: jobIdOf(card),
      companyKey: companyId,
      companyName: squash(recruiter.textContent),
      fields: {
        title: squash(card.querySelector('.s-job-offer-card__name')?.textContent) || undefined,
        text: squash(inner.textContent),
      },
    };
  },
  detail: {
    isDetailPage: (url) => url.hostname === HOST && DETAIL_PATH.test(url.pathname),
    jobIdOf: (url) => /^\/career\/job_offers\/(\d+)/.exec(url.pathname)?.[1] ?? null,
    url: (card) => (card.jobId ? `https://paiza.jp/career/job_offers/${card.jobId}` : null),
    parse: parsePaizaDetail,
  },
};
