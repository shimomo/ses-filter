import { browser } from 'wxt/browser';
import type { Category, CompanyRecord, DetailLevel, JobRecord, Reason, Settings, Site, UserLists } from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const JOB_TTL_MS = 30 * DAY_MS;
export const UNKNOWN_TTL_MS = DAY_MS;
export const SETTINGS_KEY = 'settings';
export const LISTS_KEY = 'userLists';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: 'collapse',
  sites: { paiza: true, green: true, doda: true, mynavi: true },
  prefetch: false,
  fetchIntervalMs: 1000,
};

export const jobStoreKey = (site: Site, jobId: string): string => `job:${site}:${jobId}`;
export const companyStoreKey = (site: Site, companyKey: string): string => `company:${site}:${companyKey}`;

const DETAIL_LEVELS: readonly unknown[] = ['hide', 'flag', 'none', 'unknown'];
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** 保存済みの求人レコードとして使える形か（古い版や壊れたデータは使わない） */
export function isJobRecord(value: unknown): value is JobRecord {
  return isObject(value) && DETAIL_LEVELS.includes(value.level) && Array.isArray(value.reasons) && typeof value.expiresAt === 'number';
}

/** 保存済みの企業レコードとして使える形か */
export function isCompanyRecord(value: unknown): value is CompanyRecord {
  return (
    isObject(value) &&
    typeof value.name === 'string' &&
    (value.businessHit === null || value.businessHit === 'ses' || value.businessHit === 'haken') &&
    isObject(value.targetJobs) &&
    Array.isArray(value.cleanJobs)
  );
}

export function mergeSettings(raw: unknown): Settings {
  // 古い版の `paizaPrefetch` は `prefetch` に読み替える（マイナビ転職の対応で設定を1つにした）
  const { paizaPrefetch, ...saved } = (raw ?? {}) as Partial<Settings> & { paizaPrefetch?: boolean };
  const prefetch = saved.prefetch ?? paizaPrefetch;
  return { ...DEFAULT_SETTINGS, ...saved, ...(prefetch === undefined ? {} : { prefetch }), sites: { ...DEFAULT_SETTINGS.sites, ...saved.sites } };
}

export function mergeLists(raw: unknown): UserLists {
  const saved = (raw ?? {}) as Partial<UserLists>;
  return {
    blockedCompanies: { ...saved.blockedCompanies },
    allowedCompanies: { ...saved.allowedCompanies },
    allowedJobs: { ...saved.allowedJobs },
  };
}

export async function loadSettings(): Promise<Settings> {
  const saved = await browser.storage.local.get(SETTINGS_KEY);
  return mergeSettings(saved[SETTINGS_KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = mergeSettings({ ...(await loadSettings()), ...patch });
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function loadLists(): Promise<UserLists> {
  const saved = await browser.storage.local.get(LISTS_KEY);
  return mergeLists(saved[LISTS_KEY]);
}

export type ListOp =
  | { type: 'blockCompany'; key: string; name: string }
  | { type: 'unblockCompany'; key: string }
  | { type: 'allowCompany'; key: string; name: string }
  | { type: 'unallowCompany'; key: string }
  | { type: 'allowJob'; key: string; name: string }
  | { type: 'unallowJob'; key: string };

/** 同じ企業を「隠す」と「隠さない」の両方に入れない（片方に入れたらもう片方から外す） */
export function applyListOp(lists: UserLists, op: ListOp, now: number): UserLists {
  const next = mergeLists(lists);
  switch (op.type) {
    case 'blockCompany':
      delete next.allowedCompanies[op.key];
      next.blockedCompanies[op.key] = { name: op.name, at: now };
      break;
    case 'unblockCompany':
      delete next.blockedCompanies[op.key];
      break;
    case 'allowCompany':
      delete next.blockedCompanies[op.key];
      next.allowedCompanies[op.key] = { name: op.name, at: now };
      break;
    case 'unallowCompany':
      delete next.allowedCompanies[op.key];
      break;
    case 'allowJob':
      next.allowedJobs[op.key] = { name: op.name, at: now };
      break;
    case 'unallowJob':
      delete next.allowedJobs[op.key];
      break;
  }
  return next;
}

export async function updateLists(op: ListOp, now: number = Date.now()): Promise<UserLists> {
  const next = applyListOp(await loadLists(), op, now);
  await browser.storage.local.set({ [LISTS_KEY]: next });
  return next;
}

export type LoadedRecords = { jobs: Map<string, JobRecord>; companies: Map<string, CompanyRecord> };

export async function loadRecords(
  site: Site,
  jobIds: readonly string[],
  companyKeys: readonly string[],
  now: number = Date.now(),
): Promise<LoadedRecords> {
  const jobs = new Map<string, JobRecord>();
  const companies = new Map<string, CompanyRecord>();
  const keys = [...jobIds.map((id) => jobStoreKey(site, id)), ...companyKeys.map((key) => companyStoreKey(site, key))];
  if (keys.length === 0) return { jobs, companies };
  const saved = await browser.storage.local.get(keys);
  const expired: string[] = [];
  for (const id of jobIds) {
    const record: unknown = saved[jobStoreKey(site, id)];
    if (!isJobRecord(record)) continue;
    if (record.expiresAt <= now) expired.push(jobStoreKey(site, id));
    else jobs.set(id, record);
  }
  for (const key of companyKeys) {
    const record: unknown = saved[companyStoreKey(site, key)];
    if (isCompanyRecord(record)) companies.set(key, record);
  }
  if (expired.length > 0) await browser.storage.local.remove(expired);
  return { jobs, companies };
}

export function emptyCompany(name: string, now: number): CompanyRecord {
  return { name, businessHit: null, targetJobs: {}, cleanJobs: [], updatedAt: now };
}

/** 求人の判定を企業の記録に反映する。同じ求人を二重に数えないよう、いったん両方から外してから入れ直す */
export function withJobResult(company: CompanyRecord, jobId: string, level: DetailLevel, category: Category | undefined, now: number): CompanyRecord {
  const targetJobs = { ...company.targetJobs };
  delete targetJobs[jobId];
  const cleanJobs = company.cleanJobs.filter((id) => id !== jobId);
  if (level === 'hide') targetJobs[jobId] = category ?? 'ses';
  if (level === 'none') cleanJobs.push(jobId);
  return { ...company, targetJobs, cleanJobs, updatedAt: now };
}

/** 保存期間つきの求人レコード。「不明」は1日、それ以外は30日 */
export function makeJobRecord(level: DetailLevel, category: Category | undefined, reasons: Reason[], now: number): JobRecord {
  return { level, category, reasons, savedAt: now, expiresAt: now + (level === 'unknown' ? UNKNOWN_TTL_MS : JOB_TTL_MS) };
}

export type SaveJobArgs = {
  site: Site;
  jobId: string;
  companyKey: string;
  companyName: string;
  level: DetailLevel;
  category?: Category;
  reasons: Reason[];
  now?: number;
};

export async function saveJobResult(args: SaveJobArgs): Promise<{ job: JobRecord; company: CompanyRecord }> {
  const now = args.now ?? Date.now();
  const job = makeJobRecord(args.level, args.category, args.reasons, now);
  const companyKey = companyStoreKey(args.site, args.companyKey);
  const saved = await browser.storage.local.get(companyKey);
  const stored: unknown = saved[companyKey];
  const previous = isCompanyRecord(stored) ? stored : emptyCompany(args.companyName, now);
  const company = withJobResult(previous, args.jobId, args.level, args.category, now);
  await browser.storage.local.set({ [jobStoreKey(args.site, args.jobId)]: job, [companyKey]: company });
  return { job, company };
}

export async function saveBusinessHit(site: Site, companyKey: string, name: string, category: Category, now: number = Date.now()): Promise<CompanyRecord> {
  const key = companyStoreKey(site, companyKey);
  const saved = await browser.storage.local.get(key);
  const stored: unknown = saved[key];
  const previous = isCompanyRecord(stored) ? stored : emptyCompany(name, now);
  if (previous.businessHit === category) return previous;
  const company: CompanyRecord = { ...previous, businessHit: category, updatedAt: now };
  await browser.storage.local.set({ [key]: company });
  return company;
}

/**
 * カードの強いルールの当たりを、企業の記録の対象の求人として保存する。category が null なら、その求人を記録から外す（当たらなくなったとき。段階2b 仕様 5.1）。
 * 記録が変わらなければ書かない
 */
export async function saveCardHit(site: Site, companyKey: string, name: string, jobId: string, category: Category | null, now: number = Date.now()): Promise<CompanyRecord> {
  const key = companyStoreKey(site, companyKey);
  const saved = await browser.storage.local.get(key);
  const stored: unknown = saved[key];
  const previous = isCompanyRecord(stored) ? stored : emptyCompany(name, now);
  if ((category ?? undefined) === previous.targetJobs[jobId]) return previous;
  const company = withJobResult(previous, jobId, category ? 'hide' : 'unknown', category ?? undefined, now);
  await browser.storage.local.set({ [key]: company });
  return company;
}

/** 保存済みの判定（job:* と company:*）を消す。設定とユーザー指定は残す */
export async function clearCache(): Promise<number> {
  const all = await browser.storage.local.get(null);
  const keys = Object.keys(all).filter((key) => key.startsWith('job:') || key.startsWith('company:'));
  if (keys.length > 0) await browser.storage.local.remove(keys);
  return keys.length;
}
