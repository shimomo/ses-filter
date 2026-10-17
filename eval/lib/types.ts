import type { CardData, DetailData, Site, Verdict } from '../../src/core/types';

/** 正解ラベル（仕様 5.1）。ses と haken が隠す対象 */
export type Label = 'ses' | 'haken' | 'other' | 'unknown';
export const LABELS: readonly Label[] = ['ses', 'haken', 'other', 'unknown'];

export type LabelRecord = {
  jobId: string;
  company: string;
  title: string;
  label: Label;
  /** 「<サイト> <欄>：<記述>」の形の根拠 */
  evidence: string[];
  by: 'claude' | 'user';
  note: string;
};

/** ① カードだけ ② 企業単位の記録あり ③ ふだんどおり（仕様 6.2） */
export type ConditionId = 'card' | 'company' | 'usual';
export const CONDITIONS: ReadonlyArray<{ id: ConditionId; name: string; mark: string }> = [
  { id: 'card', name: '① カードだけ', mark: '①' },
  { id: 'company', name: '② 企業単位の記録あり', mark: '②' },
  { id: 'usual', name: '③ ふだんどおり', mark: '③' },
];

export type EvalCard = { page: string; card: CardData & { jobId: string }; url: string };

export type SiteData = {
  site: Site;
  /** 読んだ一覧ページ（読んだ順） */
  pages: string[];
  /** 重複を除いたカード（最初に出たページのもの） */
  cards: EvalCard[];
  /** paiza の詳細ページを拡張機能と同じく読み取った結果（求人ID → 内容） */
  details: Map<string, DetailData>;
  /** ラベル付け用の、詳細ページの文字（求人ID → 文字） */
  detailTexts: Map<string, string>;
  /** アダプタが認識しなかったカード */
  unrecognized: number;
  /** 求人IDのないカード */
  withoutId: number;
  /** 前のページに出た求人なので数えなかったカード */
  duplicates: number;
  /** 確かめ用で、調整用と同じ求人なので数えなかったカード（調整用では 0） */
  excluded: number;
};

export type SiteRun = {
  data: SiteData;
  labels: LabelRecord[];
  verdicts: Record<ConditionId, Map<string, Verdict>>;
  warnings: string[];
};

export type Judged = { item: EvalCard; label: LabelRecord; verdict: Verdict };
