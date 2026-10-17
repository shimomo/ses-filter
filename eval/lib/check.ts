/**
 * 保存したページに入っていてはいけないもの（仕様 4.2）。拡張機能の印、ログイン中の表示、閲覧の記録、スクリプト。
 * ログアウト中の paiza のページにも「ログアウト」の文字があるので、その語は使わない
 */
export const PAGE_PROBLEMS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /data-ses-(?:filter|sieve)|<ses-(?:filter|sieve)-/, label: '拡張機能の印（data-ses-filter、ses-filter-*、古い版の data-ses-sieve、ses-sieve-*）' },
  { pattern: /header_userNameWrapper/, label: 'ログイン中の名前の欄' },
  { pattern: /登録情報設定/, label: 'ログイン中のメニュー（登録情報設定）' },
  { pattern: /閲覧済/, label: '閲覧済みの印' },
  { pattern: /閲覧履歴をもとに/, label: '閲覧履歴にもとづく欄' },
  { pattern: /<script\b/i, label: 'スクリプト（scripts/strip-scripts.ts で取り除く）' },
];

export function findPageProblems(html: string): string[] {
  return PAGE_PROBLEMS.filter(({ pattern }) => pattern.test(html)).map(({ label }) => label);
}
