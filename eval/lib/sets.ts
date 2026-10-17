import type { Site } from '../../src/core/types';

/**
 * 評価に使うページとラベルのひとまとまり（段階2b 仕様 6.2）。パスは root からの相対。
 * tuning は調整に使う287件、holdout は調整のあとに集めた確かめ用の新しいページ
 */
export type EvalSet = {
  name: 'tuning' | 'holdout';
  /** 一覧と詳細ページを読むフォルダ（読む順） */
  pageDirs(site: Site): string[];
  labelsDir: string;
  report: string;
  review: string;
  /** ラベル付け用の一覧など、作業用のファイルを置くフォルダ */
  workDir: string;
  /** この組でラベルのある求人は数えない（確かめ用で、調整用と同じ求人を外すため） */
  exclude?: EvalSet;
  /** Green の詳細ページを取る上限（段階2a 仕様 4.1、段階2b 仕様 6.2） */
  greenDetailMax: number;
};

export const TUNING: EvalSet = {
  name: 'tuning',
  pageDirs: (site) => [`tests/fixtures/${site}`, `eval/pages/${site}`],
  labelsDir: 'eval/labels',
  report: 'eval/report.md',
  review: 'eval/review.md',
  workDir: 'eval/.work',
  greenDetailMax: 30,
};

export const HOLDOUT: EvalSet = {
  name: 'holdout',
  pageDirs: (site) => [`eval/holdout/pages/${site}`],
  labelsDir: 'eval/holdout/labels',
  report: 'eval/holdout/report.md',
  review: 'eval/holdout/review.md',
  workDir: 'eval/.work/holdout',
  exclude: TUNING,
  greenDetailMax: 20,
};

/** 環境変数 EVAL_SET（なければ tuning）から組を選ぶ */
export function setFromEnv(value: string | undefined = process.env.EVAL_SET): EvalSet {
  if (value === undefined || value === '' || value === 'tuning') return TUNING;
  if (value === 'holdout') return HOLDOUT;
  throw new Error(`EVAL_SET は tuning か holdout（いまは ${value}）`);
}
