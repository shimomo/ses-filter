export type Site = 'paiza' | 'green' | 'doda' | 'mynavi' | 'rikunabi';
export type Category = 'ses' | 'haken';
export type FieldName = 'title' | 'location' | 'business' | 'workHours' | 'text';

export type CardFields = {
  title?: string;
  location?: string;
  /** 事業内容（会社についての記述） */
  business?: string;
  workHours?: string;
  /** カードまたは詳細ページ全体の文字列 */
  text: string;
};

export type CardData = {
  jobId: string | null;
  /** 企業ID。doda だけは正規化した社名 */
  companyKey: string;
  companyName: string;
  fields: CardFields;
};

export type DetailData = {
  jobId: string;
  companyKey?: string;
  companyName?: string;
  /**
   * サイト自身の分類（paiza の開発内容タイプ）。
   * string[] = 読めた。null = 分類があるはずのサイトで読めなかった（不明）。undefined = 分類のないサイト（マイナビ転職。ルールで判定する）
   */
  devContentsTypes?: string[] | null;
  employment?: string;
  fields: CardFields;
};

export interface SiteAdapter {
  site: Site;
  isListPage(url: URL): boolean;
  findCards(doc: Document): Element[];
  extract(card: Element): CardData | null;
  detail?: {
    isDetailPage(url: URL): boolean;
    /** 開いた詳細ページの URL から求人IDを読む。記録しないページ（マイナビ転職の広告型など）は null */
    jobIdOf(url: URL): string | null;
    url(card: CardData): string | null;
    parse(doc: Document, jobId: string): DetailData;
  };
}

export type Level = 'hide' | 'flag' | 'pending' | 'none';

export type Reason = {
  source: 'user' | 'site' | 'detail-rule' | 'company' | 'card-rule';
  category?: Category;
  label: string;
  field?: FieldName;
  match?: string;
};

export type Verdict = {
  level: Level;
  category?: Category;
  reasons: Reason[];
  /** 隠す・要確認のとき、判定を決めた単位。「SESではない」をどの単位で記録するかに使う */
  decidedAt?: 'job' | 'company';
  userState?: 'allowed' | 'blocked';
};

export type DisplayMode = 'collapse' | 'hide' | 'dim';

export type Settings = {
  enabled: boolean;
  mode: DisplayMode;
  sites: Record<Site, boolean>;
  /** 詳細ページの先読み。先読みのあるサイト（paiza、マイナビ転職）すべてに効く。保存済みの古い `paizaPrefetch` は読み替える */
  prefetch: boolean;
  fetchIntervalMs: number;
};

export type ListEntry = { name: string; at: number };

export type UserLists = {
  blockedCompanies: Record<string, ListEntry>;
  allowedCompanies: Record<string, ListEntry>;
  allowedJobs: Record<string, ListEntry>;
};

export type DetailLevel = 'hide' | 'flag' | 'none' | 'unknown';

export type JobRecord = {
  level: DetailLevel;
  category?: Category;
  reasons: Reason[];
  savedAt: number;
  expiresAt: number;
};

export type CompanyRecord = {
  name: string;
  businessHit: Category | null;
  /** 求人ID → 分類（対象と判定した求人） */
  targetJobs: Record<string, Category>;
  /** 対象外と判定した求人ID */
  cleanJobs: string[];
  updatedAt: number;
};
