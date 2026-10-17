import { cardTargetCategory, judgeDetail, judgeFields } from '../../src/core/classify';
import { decide } from '../../src/core/decide';
import { emptyCompany, makeJobRecord, mergeLists, withJobResult } from '../../src/core/store';
import type { CompanyRecord, JobRecord, Verdict } from '../../src/core/types';
import type { ConditionId, EvalCard, SiteData } from './types';

/** 評価で使う時刻。保存期間で記録が消えないよう固定する（仕様 6.1） */
export const EVAL_NOW = Date.UTC(2026, 9, 17);

/** ユーザーの指定は、どの条件でも空にする（仕様 6.2） */
const NO_LISTS = mergeLists(undefined);

/** 事業内容の欄で強いルールに当たった企業を記録する（src/core/runtime.ts の recordBusinessHit と同じ手順） */
function recordBusinessHits(data: SiteData, companies: Map<string, CompanyRecord>, now: number): void {
  for (const { card } of data.cards) {
    if (!card.fields.business) continue;
    const result = judgeFields({ business: card.fields.business, text: '' }, 'card-rule');
    if (result.level !== 'hide' || !result.category) continue;
    const previous = companies.get(card.companyKey) ?? emptyCompany(card.companyName, now);
    companies.set(card.companyKey, { ...previous, businessHit: result.category, updatedAt: now });
  }
}

/** カードのほかの欄で強いルールに当たった求人を、企業の記録の対象の求人にする（src/core/runtime.ts の recordCardHit と同じ手順。段階2b 仕様 6.1） */
function recordCardHits(data: SiteData, jobs: Map<string, JobRecord>, companies: Map<string, CompanyRecord>, now: number): void {
  for (const { card } of data.cards) {
    const category = cardTargetCategory(judgeFields(card.fields, 'card-rule'));
    if (!category) continue;
    const job = jobs.get(card.jobId);
    if (job && job.level !== 'unknown') continue;
    companies.set(card.companyKey, withJobResult(companies.get(card.companyKey) ?? emptyCompany(card.companyName, now), card.jobId, 'hide', category, now));
  }
}

/** 1回のページ表示で先読みする詳細ページの上限（プロトタイプ仕様 6.2） */
const MAX_DETAILS_PER_PAGE = 30;

function verdictFor(data: SiteData, card: EvalCard['card'], jobs: Map<string, JobRecord>, companies: Map<string, CompanyRecord>, canPrefetch: boolean): Verdict {
  return decide({
    site: data.site,
    card,
    lists: NO_LISTS,
    job: jobs.get(card.jobId),
    company: companies.get(card.companyKey),
    cardResult: judgeFields(card.fields, 'card-rule'),
    canPrefetch,
  });
}

/**
 * paiza の詳細ページのうち、拡張機能が先読みするものだけを、求人と企業の記録にする（src/core/runtime.ts の enqueueDetail と saveDetail と同じ手順）。
 * ページを順に開いたとして、各ページで判定中になるカード（カードのルールでも企業単位でも決まらないもの）を並び順に30件まで取る。
 * 拡張機能は最初の表示で判定中になったカードをすべて取得キューに入れるので、そのページの記録は取るカードを決めてから作る。
 */
function recordDetails(data: SiteData, jobs: Map<string, JobRecord>, companies: Map<string, CompanyRecord>, now: number): void {
  for (const file of data.pages) {
    const fetched = data.cards
      .filter((item) => item.page === file && verdictFor(data, item.card, jobs, companies, true).level === 'pending')
      .slice(0, MAX_DETAILS_PER_PAGE);
    for (const { card } of fetched) {
      // 保存した詳細ページがない求人は、先読みできなかったときと同じくカードの文言で判定する（仕様 6.2）
      const detail = data.details.get(card.jobId);
      if (!detail) continue;
      const companyKey = detail.companyKey ?? card.companyKey;
      const judgement = judgeDetail(detail);
      const name = detail.companyName ?? card.companyName;
      jobs.set(card.jobId, makeJobRecord(judgement.level, judgement.category, judgement.reasons, now));
      companies.set(companyKey, withJobResult(companies.get(companyKey) ?? emptyCompany(name, now), card.jobId, judgement.level, judgement.category, now));
    }
  }
}

/** 条件ごとに、すべてのカードを拡張機能と同じ優先順位（decide）で判定する。最後の判定は判定中にしない（記録はそろっている） */
export function judgeSite(data: SiteData, condition: ConditionId, now: number = EVAL_NOW): Map<string, Verdict> {
  const jobs = new Map<string, JobRecord>();
  const companies = new Map<string, CompanyRecord>();
  if (condition !== 'card') {
    recordBusinessHits(data, companies, now);
    recordCardHits(data, jobs, companies, now);
  }
  if (condition === 'usual') recordDetails(data, jobs, companies, now);
  return new Map(data.cards.map(({ card }) => [card.jobId, verdictFor(data, card, jobs, companies, false)]));
}
