import type { RuleResult } from './classify';
import type { CardData, Category, CompanyRecord, JobRecord, Reason, Site, UserLists, Verdict } from './types';

export type DecideInput = {
  site: Site;
  card: CardData;
  lists: UserLists;
  job: JobRecord | undefined;
  company: CompanyRecord | undefined;
  cardResult: RuleResult;
  canPrefetch: boolean;
};

export const listKey = (site: Site, id: string): string => `${site}:${id}`;

/**
 * 企業単位の判定（段階2b 仕様 5.1）。事業内容の欄で当たったか、対象の求人が1件でもあれば対象の企業。
 * counts で数える求人を選ぶ（decide は、その求人自身と、ユーザーが「SESではない」とした求人を数えない）
 */
export function companyTarget(company: CompanyRecord | undefined, counts: (jobId: string) => boolean = () => true): { category: Category; label: string } | null {
  if (!company) return null;
  if (company.businessHit) return { category: company.businessHit, label: '同じ企業の事業内容' };
  const categories = Object.entries(company.targetJobs)
    .filter(([jobId]) => counts(jobId))
    .map(([, category]) => category);
  if (categories.length === 0) return null;
  return { category: categories.includes('ses') ? 'ses' : 'haken', label: '同じ企業の求人が対象' };
}

/** 優先順位どおりに判定する（プロトタイプ仕様 5.1 を段階2b 仕様 5.2 で変えた順。上から順に見て最初に決まったもの） */
export function decide(input: DecideInput): Verdict {
  const { site, card, lists, job, company, cardResult, canPrefetch } = input;
  const companyId = listKey(site, card.companyKey);
  const jobId = card.jobId ? listKey(site, card.jobId) : null;

  if (jobId && lists.allowedJobs[jobId]) {
    return { level: 'none', reasons: [{ source: 'user', label: 'あなたの指定で表示' }], userState: 'allowed', decidedAt: 'job' };
  }
  if (lists.allowedCompanies[companyId]) {
    return { level: 'none', reasons: [{ source: 'user', label: 'あなたの指定で表示' }], userState: 'allowed', decidedAt: 'company' };
  }
  if (lists.blockedCompanies[companyId]) {
    return { level: 'hide', reasons: [{ source: 'user', label: 'あなたが隠した企業' }], userState: 'blocked', decidedAt: 'company' };
  }
  if (job?.level === 'hide') {
    return { level: 'hide', category: job.category, reasons: job.reasons, decidedAt: 'job' };
  }
  // 企業単位の判定は、詳細判定の「要確認」「何もしない」より先に効かせる（段階2b 仕様 5.2）
  const companyHit = companyTarget(company, (id) => id !== card.jobId && !lists.allowedJobs[listKey(site, id)]);
  if (companyHit) {
    const reasons: Reason[] =
      cardResult.level === 'hide' ? cardResult.reasons : [{ source: 'company', category: companyHit.category, label: companyHit.label }];
    // 自分のカードの強い当たり（事業内容の欄でない）でも隠れる求人は、「SESではない」を求人単位で記録する（段階2b 仕様 5.2）
    const decidedAt = cardResult.level === 'hide' && !cardResult.companyLevel ? 'job' : 'company';
    return { level: 'hide', category: companyHit.category, reasons, decidedAt };
  }
  if (job && job.level !== 'unknown') {
    return { level: job.level, category: job.category, reasons: job.reasons, decidedAt: 'job' };
  }
  const cardVerdict: Verdict = {
    level: cardResult.level,
    category: cardResult.category,
    reasons: cardResult.reasons,
    decidedAt: cardResult.companyLevel ? 'company' : 'job',
  };
  if (cardResult.level === 'hide') return cardVerdict;
  // 中程度の文言だけのカードは、取得できるならサイト自身の分類（詳細ページ）で決める
  if (canPrefetch && card.jobId && !job) return { level: 'pending', reasons: [] };
  if (cardResult.level === 'flag') return cardVerdict;
  return { level: 'none', reasons: [] };
}
