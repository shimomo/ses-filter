/** 社名の表記揺れをそろえる。doda の企業キーと照合に使う */
export function normalizeCompanyName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/\(株\)/g, '株式会社')
    .replace(/\(有\)/g, '有限会社')
    .replace(/【[^】]*】|\[[^\]]*\]/g, '')
    .toLowerCase();
}

/** 連続する空白を1つにして前後を削る */
export function squash(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}
