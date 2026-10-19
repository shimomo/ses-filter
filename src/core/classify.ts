import { RULES, type Rule } from './rules';
import type { CardFields, Category, DetailData, DetailLevel, FieldName, Reason } from './types';

export type RuleHit = { rule: Rule; field: FieldName; match: string };

export type RuleResult = {
  level: 'hide' | 'flag' | 'none';
  category?: Category;
  reasons: Reason[];
  /** 判定を決めた当たりに事業内容の欄が含まれる（会社についての記述で決まった） */
  companyLevel: boolean;
};

export type DetailJudgement = { level: DetailLevel; category?: Category; reasons: Reason[] };

export const FIELD_LABELS: Record<FieldName, string> = {
  title: 'タイトル',
  location: '勤務地',
  business: '事業内容',
  workHours: '勤務時間',
  text: '本文',
};

const FIELD_ORDER: readonly FieldName[] = ['business', 'location', 'workHours', 'title', 'text'];
// 「客先常駐原則なし」「客先常駐無＊」「客先常駐など転々とした働き方もありません」も否定に数える（段階3a、マイナビ転職の確かめ用）
// カタカナの「客先常駐ナシ」も否定に数える（段階3b、リクナビNEXTの確かめ用）
const NEGATION =
  /^(?:(?:[・、/][^\s・、。/]{1,6})?[はがも]?(?:原則)?(?:なし|ナシ|無し|ない|なく|無い|無く|無(?=[\s＊*・、。/（）()【】｜|]|$)|ありません|ございません|一切|では(?:ありません|ない)|行って(?:い|おり)ません|しません|いたしません|致しません|ゼロ|0%)|など[^\s、。/]{0,12}?[はがも]?(?:ありません|ございません|なし|無し|ない))/;
// 「客先常駐の働き方から脱却」のように、間に短い言葉が入っても「〜から脱却」などは除く。区切り（／・括弧・記号）はまたがない
// 「SES企業での開発経験」のような応募者の経歴も除く（段階3a、マイナビ転職の最初の測定）
// 「客先常駐・SESから自社サービス＆自社内勤務への転職」のように「から」と「転職」の間に言葉が入る形、「「客先常駐で孤独」…といった現状を変えたい」のような引用も除く（段階3a）
const EXCLUDED_AFTER =
  /^(?:を卒業|[^\s、。/()【】■◆★]{0,10}?から(?:の|[^\s、。/()【】■◆★]{0,14}?への?)?(?:脱却|卒業|転職|脱出)|経験者|経験|出身|歓迎|[^\s、。]{0,6}?(?:とは(?:異なり|違い|違って)|ではなく|じゃなく)|[^\s、。/()【】■◆★]{0,6}?での(?:開発|実務|業務|就業)?経験|[^\s、。/()【】]{0,10}?」[^\s、。]{0,24}?(?:変えたい|変えた|卒業|脱却))/;
// 「SES企業のように、案件ごとに常駐先が変わる働き方ではありません」のように、比べたあと離れて否定が来る形も除く（同じ文の中、40文字まで）
const COMPARED_AFTER = /^のよう(?:に|な)[^。]{0,40}?(?:では(?:ありません|ない)|とは(?:異なり|違い|違って)|ではなく|じゃなく|しません|いたしません)/;
// 「脱SES」「非SES」「元SES」は除く。「高還元SES」の「元」は「還元」の一部なので除かない
const EXCLUDED_BEFORE = /(?:[脱非]|(?<!還)元)$/;
const AWS_BEFORE = /Amazon|AWS/i;
const PAIZA_SES_TYPE = '受託開発(社外常駐)';

/** 当たった文字列が否定（「なし」など）や除外する文脈（「脱SES」「SES経験者」「Amazon SES」）にあるか */
export function isNegatedOrExcluded(text: string, start: number, end: number, matched: string): boolean {
  const after = text.slice(end, end + 40);
  if (NEGATION.test(after) || EXCLUDED_AFTER.test(after) || COMPARED_AFTER.test(text.slice(end, end + 60))) return true;
  if (EXCLUDED_BEFORE.test(text.slice(Math.max(0, start - 2), start))) return true;
  return matched.includes('SES') && AWS_BEFORE.test(text.slice(Math.max(0, start - 10), start));
}

/** 欄ごとにルールを当てる。1つのルールは最初に当たった欄だけを数える */
export function findHits(fields: CardFields, rules: readonly Rule[] = RULES): RuleHit[] {
  const hits: RuleHit[] = [];
  const seen = new Set<string>();
  for (const field of FIELD_ORDER) {
    const raw = fields[field];
    if (!raw) continue;
    const text = raw.normalize('NFKC');
    for (const rule of rules) {
      if (seen.has(rule.id) || (rule.fields && !rule.fields.includes(field))) continue;
      for (const match of text.matchAll(rule.pattern)) {
        const start = match.index ?? 0;
        if (isNegatedOrExcluded(text, start, start + match[0].length, match[0])) continue;
        hits.push({ rule, field, match: match[0].slice(0, 40) });
        seen.add(rule.id);
        break;
      }
    }
  }
  return hits;
}

export function judgeFields(fields: CardFields, source: 'card-rule' | 'detail-rule'): RuleResult {
  const hits = findHits(fields);
  if (hits.length === 0) return { level: 'none', reasons: [], companyLevel: false };
  const strong = hits.filter((hit) => hit.rule.strength === 'strong');
  const deciding = strong.length > 0 ? strong : hits;
  return {
    level: strong.length > 0 ? 'hide' : 'flag',
    category: deciding.some((hit) => hit.rule.category === 'ses') ? 'ses' : 'haken',
    reasons: deciding.map((hit) => ({ source, category: hit.rule.category, label: hit.rule.label, field: hit.field, match: hit.match })),
    companyLevel: deciding.some((hit) => hit.field === 'business'),
  };
}

/**
 * カードの強いルールの当たりのうち、事業内容の欄を含まずに決まったものの分類。企業の記録の「対象の求人」にする（段階2b 仕様 5.1）。
 * 事業内容の欄の当たりは businessHit として記録するので、ここでは返さない
 */
export function cardTargetCategory(result: RuleResult): Category | null {
  return result.level === 'hide' && result.category && !result.companyLevel ? result.category : null;
}

/**
 * 詳細ページの判定。サイトの分類（paiza の開発内容タイプ）を最優先し、なければ雇用形態と詳細の各欄のルールで判定する。
 * 分類のないサイト（devContentsTypes が undefined。マイナビ転職）は、雇用形態とルールだけで判定する
 */
export function judgeDetail(detail: DetailData): DetailJudgement {
  if (detail.devContentsTypes === null) return { level: 'unknown', reasons: [] };
  if (detail.devContentsTypes?.some((type) => type.normalize('NFKC') === PAIZA_SES_TYPE)) {
    return {
      level: 'hide',
      category: 'ses',
      reasons: [{ source: 'site', category: 'ses', label: '受託開発（社外常駐）', match: '開発内容タイプ' }],
    };
  }
  if (detail.employment?.includes('派遣')) {
    return {
      level: 'hide',
      category: 'haken',
      reasons: [{ source: 'site', category: 'haken', label: '雇用関係が派遣', match: detail.employment.slice(0, 40) }],
    };
  }
  const result = judgeFields(detail.fields, 'detail-rule');
  // 開発内容タイプが自社内なら、中くらいのルールだけでは要確認にしない。サイト自身の分類を優先する（段階2b 仕様 4.2）。分類のないサイトでは要確認のまま
  if (result.level === 'flag' && detail.devContentsTypes !== undefined) return { level: 'none', reasons: [] };
  return { level: result.level, category: result.category, reasons: result.reasons };
}
