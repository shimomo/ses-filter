import { FIELD_LABELS } from '../../src/core/classify';
import type { Level, Reason } from '../../src/core/types';
import { computeMetrics, formatRate, isTarget, type Metrics } from './metrics';
import { REVIEW_SEED, seededSample } from './sample';
import { CONDITIONS, type ConditionId, type Judged, type LabelRecord, type SiteData, type SiteRun } from './types';

/** ラベルの基準を書いた文書（公開リポジトリにもある） */
const LABEL_DEFINITION = '`docs/design.md` の「ラベルの定義」';
const SOURCE_LABELS: Record<Reason['source'], string> = {
  user: 'ユーザー',
  site: 'サイトの分類',
  'detail-rule': '詳細のルール',
  company: '企業単位',
  'card-rule': 'カードのルール',
};
const LEVEL_LABELS: Record<Level, string> = { hide: '隠す', flag: '要確認', pending: '判定中', none: 'なし' };

/** 判定の理由のまとめ方（ルールの名前と欄、またはサイトの分類・企業単位） */
export const reasonKey = (reason: Reason | undefined): string =>
  reason ? `${SOURCE_LABELS[reason.source]}：${reason.label}${reason.field ? `（${FIELD_LABELS[reason.field]}）` : ''}` : '（理由なし）';
export const reasonText = (reason: Reason): string => `${reasonKey(reason)}${reason.match ? `「${reason.match}」` : ''}`;
/** ラベルの根拠のまとめ方（「<サイト> <欄>」の部分） */
export const evidenceKey = (label: LabelRecord): string => label.evidence[0]?.split('：')[0] ?? '（根拠なし）';

/** ラベルのある求人と、その条件での判定の組（カードの順） */
export function judgedFor(run: SiteRun, condition: ConditionId): Judged[] {
  const labels = new Map(run.labels.map((label) => [label.jobId, label]));
  return run.data.cards.flatMap((item) => {
    const label = labels.get(item.card.jobId);
    const verdict = run.verdicts[condition].get(item.card.jobId);
    return label && verdict ? [{ item, label, verdict }] : [];
  });
}

const metricsOf = (judged: readonly Judged[]): Metrics => computeMetrics(judged.map(({ label, verdict }) => ({ label: label.label, verdict })));

const TABLE_HEAD = [
  '| サイト | 隠した | 適合率 | 再現率 | 取り違え | 対象を要確認 | 対象外を要確認 | 取りこぼし | 隠した不明 |',
  '|---|---|---|---|---|---|---|---|---|',
];
const tableRow = (name: string, m: Metrics): string =>
  `| ${name} | ${m.hidden} | ${formatRate(m.precision)} | ${formatRate(m.recall)} | ${m.swapped} | ${m.flaggedTargets} | ${m.flaggedOthers} | ${m.missed} | ${m.hiddenUnknown} |`;

function conditionTable(runs: readonly SiteRun[], condition: ConditionId): string {
  const rows = runs.map((run) => tableRow(run.data.site, metricsOf(judgedFor(run, condition))));
  const total = tableRow('全体', metricsOf(runs.flatMap((run) => judgedFor(run, condition))));
  return [...TABLE_HEAD, ...rows, total].join('\n');
}

type Entry = { run: SiteRun; judged: Judged };

function itemLines({ run, judged }: Entry): string[] {
  const { item, label, verdict } = judged;
  const levels = CONDITIONS.map(({ id, mark }) => `${mark}${LEVEL_LABELS[run.verdicts[id].get(item.card.jobId)?.level ?? 'none']}`).join(' ');
  const reasons = verdict.reasons.map(reasonText).join('、') || 'なし';
  const note = label.note ? ` — メモ: ${label.note}` : '';
  return [
    `- **[${run.data.site}] ${item.card.companyName}** — ${item.card.fields.title ?? '（タイトルなし）'}（${item.url}）`,
    `  - ラベル: ${label.label}（${label.by}）— 根拠: ${label.evidence.join(' ／ ') || 'なし'}${note}`,
    `  - 判定: ${levels} — 理由（③）: ${reasons}`,
  ];
}

function groupedList(entries: readonly Entry[], keyOf: (judged: Judged) => string): string {
  if (entries.length === 0) return 'なし';
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = keyOf(entry.judged);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ja'))
    .map(([key, list]) => [`### ${key}（${list.length}件）`, '', ...list.flatMap(itemLines)].join('\n'))
    .join('\n\n');
}

function dataRow(run: SiteRun): string {
  const counts: Record<LabelRecord['label'], number> = { ses: 0, haken: 0, other: 0, unknown: 0 };
  const ids = new Set(run.data.cards.map((item) => item.card.jobId));
  for (const label of run.labels) if (ids.has(label.jobId)) counts[label.label] += 1;
  const { site, pages, cards, duplicates, unrecognized, withoutId } = run.data;
  return `| ${site} | ${pages.length} | ${cards.length} | ${counts.ses} | ${counts.haken} | ${counts.other} | ${counts.unknown} | ${duplicates} | ${unrecognized + withoutId} |`;
}

export type ReportMeta = { date: string; commit: string; set?: 'tuning' | 'holdout' };

/** eval/report.md（仕様 7.2）。一覧は条件③の判定で作る */
export function renderReport(runs: readonly SiteRun[], meta: ReportMeta): string {
  const usual: Entry[] = runs.flatMap((run) => judgedFor(run, 'usual').map((judged) => ({ run, judged })));
  const hiddenOthers = usual.filter(({ judged }) => judged.label.label === 'other' && judged.verdict.level === 'hide');
  const flaggedOthers = usual.filter(({ judged }) => judged.label.label === 'other' && judged.verdict.level === 'flag');
  const missed = usual.filter(({ judged }) => isTarget(judged.label.label) && judged.verdict.level === 'none');
  const warnings = runs.flatMap((run) => run.warnings.map((warning) => `- ${run.data.site}: ${warning}`));
  return [
    meta.set === 'holdout' ? '# 精度の評価（確かめ用の新しいページ）' : '# 精度の評価',
    '',
    `- 日付: ${meta.date}`,
    `- コミット: ${meta.commit}（測ったときの HEAD）`,
    ...(meta.set === 'holdout' ? [`- 調整用の求人と重なって数えなかった求人: ${runs.map((run) => `${run.data.site} ${run.data.excluded} 件`).join('、')}`] : []),
    `- ラベルの基準: ${LABEL_DEFINITION}`,
    '- 一覧は条件③（ふだんどおり）の判定。「判定」の欄は条件①②③の順',
    '',
    '## データ',
    '',
    '| サイト | ページ | 求人 | ses | haken | other | unknown | 重複 | 数えなかったカード |',
    '|---|---|---|---|---|---|---|---|---|',
    ...runs.map(dataRow),
    '',
    '## 警告',
    '',
    warnings.length > 0 ? warnings.join('\n') : 'なし',
    '',
    ...CONDITIONS.flatMap(({ id, name }) => [`## ${name}`, '', conditionTable(runs, id), '']),
    '## 誤って隠したもの（対象外を隠した）',
    '',
    groupedList(hiddenOthers, (judged) => reasonKey(judged.verdict.reasons[0])),
    '',
    '## 対象外を要確認にしたもの',
    '',
    groupedList(flaggedOthers, (judged) => reasonKey(judged.verdict.reasons[0])),
    '',
    '## 取りこぼし（対象なのに何もしなかった）',
    '',
    groupedList(missed, (judged) => evidenceKey(judged.label)),
    '',
  ].join('\n');
}

export type ReviewItem = Entry & { why: '判定とラベルが合わない' | 'ラベルが unknown' | '無作為に選んだ一致' };

/** 確認用の一覧に載せる求人（仕様 5.3）。条件③の判定で、合わないもの → unknown → 一致から種で固定した sampleSize 件 */
export function reviewItems(runs: readonly SiteRun[], seed: number = REVIEW_SEED, sampleSize = 20): ReviewItem[] {
  const all: Entry[] = runs.flatMap((run) => judgedFor(run, 'usual').map((judged) => ({ run, judged })));
  const disagrees = ({ judged }: Entry): boolean => (isTarget(judged.label.label) ? judged.verdict.level !== 'hide' : judged.verdict.level !== 'none');
  const known = all.filter(({ judged }) => judged.label.label !== 'unknown');
  return [
    ...known.filter(disagrees).map((entry): ReviewItem => ({ ...entry, why: '判定とラベルが合わない' })),
    ...all.filter(({ judged }) => judged.label.label === 'unknown').map((entry): ReviewItem => ({ ...entry, why: 'ラベルが unknown' })),
    ...seededSample(
      known.filter((entry) => !disagrees(entry)),
      sampleSize,
      seed,
    ).map((entry): ReviewItem => ({ ...entry, why: '無作為に選んだ一致' })),
  ];
}

/** eval/review.md（仕様 7.3） */
export function renderReview(runs: readonly SiteRun[]): string {
  const items = reviewItems(runs);
  const count = (why: ReviewItem['why']): number => items.filter((item) => item.why === why).length;
  return [
    '# ラベルの確認',
    '',
    `違うものは、番号と正しいラベル（ses・haken・other・unknown）を教えてください。基準は ${LABEL_DEFINITION}です。`,
    '',
    `全 ${items.length} 件（判定とラベルが合わない ${count('判定とラベルが合わない')} 件、unknown ${count('ラベルが unknown')} 件、無作為に選んだ一致 ${count('無作為に選んだ一致')} 件）`,
    '',
    ...items.flatMap((item, index) => [`## ${index + 1}. ${item.why}`, '', ...itemLines(item), '']),
  ].join('\n');
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * ラベルの決め手にならない paiza の詳細の欄（給与・休日・福利厚生・技術・選考など）。ラベル付け用の一覧では省き、一覧を短くする。
 * 必須要件・歓迎要件・求める人物像・勤務時間は「客先常駐に抵抗がない方」「客先に準ずる」のような手がかりが、
 * 給与体系・詳細には「無期雇用派遣」のような雇用の形が出るので残す
 */
const SHEET_SKIPPED_TERMS = new Set([
  '給与(想定年収)',
  '休日休暇',
  '諸手当',
  'インセンティブ',
  '昇給・昇格',
  '保険',
  '試用期間',
  '最寄り駅',
  '募集人数',
  '選考フロー',
  '開発言語',
  'フレームワーク',
  'クラウドプラットフォーム',
  'データベース',
  '主要開発技術',
  '開発手法',
  '開発支援ツール',
  'インフラ管理',
  '環境',
  'その他開発環境',
  '支給マシン',
]);

/** 詳細の「見出し: 内容」の行のうち、決め手になりうる欄だけを1行にまとめる */
const sheetDetailText = (text: string): string =>
  text
    .split('\n')
    .filter((line) => !SHEET_SKIPPED_TERMS.has(line.split(': ')[0] ?? ''))
    .join(' ／ ');

/** ラベル付け用の一覧（仕様 5.3 の1）。ルールの判定は載せない */
export function renderCardSheet(data: SiteData, labels: readonly LabelRecord[]): string {
  const byId = new Map(labels.map((label) => [label.jobId, label]));
  return [
    `# ${data.site} のカード（ラベル付け用）`,
    '',
    `ルールの結果は載せていない。基準は ${LABEL_DEFINITION}。`,
    '',
    ...data.cards.flatMap(({ page, card, url }, index) => {
      const label = byId.get(card.jobId);
      const detail = data.detailTexts.get(card.jobId);
      const parsed = data.details.get(card.jobId);
      // paiza は決め手の欄を先に出し、残りは決め手になりうる欄だけを載せる。Green は詳細ページの本文をそのまま載せる
      const detailLines = parsed
        ? [
            // サイトの分類のないサイト（マイナビ転職。devContentsTypes が undefined）では、この行は出さない
            ...(parsed.devContentsTypes === undefined ? [] : [`- 詳細の開発内容タイプ: ${parsed.devContentsTypes ? parsed.devContentsTypes.join('、') : '（見出しなし）'}`]),
            `- 詳細の雇用関係: ${parsed.employment ?? '（なし）'}`,
            `- 詳細の勤務地: ${parsed.fields.location ?? '（なし）'}`,
            ...(parsed.fields.business ? [`- 詳細の会社の説明: ${clip(parsed.fields.business, 1500)}`] : []),
            `- 詳細ページ（給与・休日・技術・選考などの欄は省く）: ${clip(sheetDetailText(parsed.fields.text), 8000)}`,
          ]
        : [`- 詳細ページ: ${detail ? clip(detail, 4000) : 'なし'}`];
      return [
        `## ${index + 1}. ${card.companyName} — ${card.fields.title ?? '（タイトルなし）'}`,
        '',
        `- 求人ID: ${card.jobId} ／ ページ: ${page} ／ ${url}`,
        ...(card.fields.location ? [`- 勤務地: ${card.fields.location}`] : []),
        ...(card.fields.business ? [`- 事業内容: ${card.fields.business}`] : []),
        ...(card.fields.workHours ? [`- 勤務時間: ${card.fields.workHours}`] : []),
        `- カードの文字: ${clip(card.fields.text, 1200)}`,
        ...detailLines,
        `- いまのラベル: ${label ? `${label.label}（${label.by}）— ${label.evidence.join(' ／ ') || '根拠なし'}` : 'なし'}`,
        '',
      ];
    }),
  ].join('\n');
}

/** 画面に出す要約（警告と、条件ごとの表） */
export function summaryLines(runs: readonly SiteRun[]): string[] {
  const warnings = runs.flatMap((run) => run.warnings.map((warning) => `⚠ ${run.data.site}: ${warning}`));
  return [...warnings, ...CONDITIONS.flatMap(({ id, name }) => ['', name, conditionTable(runs, id)])];
}
