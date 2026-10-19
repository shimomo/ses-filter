import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { squash } from '../../src/core/normalize';
import type { CardData, DetailData, Site, SiteAdapter } from '../../src/core/types';
import { dodaAdapter } from '../../src/sites/doda';
import { greenAdapter } from '../../src/sites/green';
import { mynaviAdapter } from '../../src/sites/mynavi';
import { rikunabiAdapter } from '../../src/sites/rikunabi';
import { paizaAdapter } from '../../src/sites/paiza';
import { readLabels } from './labels';
import { TUNING, type EvalSet } from './sets';
import type { EvalCard, SiteData } from './types';

export const SITES: readonly Site[] = ['paiza', 'green', 'doda', 'mynavi', 'rikunabi'];
export const ADAPTERS: Record<Site, SiteAdapter> = { paiza: paizaAdapter, green: greenAdapter, doda: dodaAdapter, mynavi: mynaviAdapter, rikunabi: rikunabiAdapter };

/** 詳細ページのファイル名（…-detail-<求人ID>.html）。マイナビ転職の求人IDはハイフンを含む（<企業ID>-<n>-<m>-<k>） */
const DETAIL_FILE = /-detail(?:-(\d+(?:-\d+)*))?\.html$/;

/** 評価に使うページ。組のフォルダ（調整用は tests/fixtures/<site>/、eval/pages/<site>/ の順）を、それぞれファイル名の順に並べる（仕様 6.4） */
export function pageFiles(site: Site, root: string = process.cwd(), set: EvalSet = TUNING): { lists: string[]; details: string[] } {
  const lists: string[] = [];
  const details: string[] = [];
  for (const dir of set.pageDirs(site).map((name) => path.join(root, name))) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((file) => file.endsWith('.html')).sort()) {
      (DETAIL_FILE.test(name) ? details : lists).push(path.join(dir, name));
    }
  }
  return { lists, details };
}

/** 詳細ページの求人ID。ファイル名（…-detail-<ID>.html）を優先し、なければ canonical リンクから読む */
export function detailJobId(file: string, doc: Document): string | null {
  const fromName = DETAIL_FILE.exec(path.basename(file))?.[1];
  if (fromName) return fromName;
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
  return /\/job(?:_offers)?\/(\d+)/.exec(canonical)?.[1] ?? /\/jobinfo-(\d+(?:-\d+){3})\//.exec(canonical)?.[1] ?? null;
}

export function jobUrl(site: Site, card: { jobId: string; companyKey: string }): string {
  switch (site) {
    case 'paiza':
      return `https://paiza.jp/career/job_offers/${card.jobId}`;
    case 'green':
      return `https://www.green-japan.com/company/${card.companyKey}/job/${card.jobId}`;
    case 'doda':
      return `https://doda.jp/DodaFront/View/JobSearchDetail/j_jid__${card.jobId}/`;
    case 'mynavi':
      return `https://tenshoku.mynavi.jp/jobinfo-${card.jobId}/`;
    case 'rikunabi':
      return `https://next.rikunabi.com/viewjob/${card.jobId}/`;
  }
}

function extractSafe(adapter: SiteAdapter, element: Element): CardData | null {
  try {
    return adapter.extract(element);
  } catch {
    return null;
  }
}

function parseDetailSafe(adapter: SiteAdapter, doc: Document, jobId: string): DetailData | undefined {
  try {
    return adapter.detail?.parse(doc, jobId);
  } catch {
    return undefined;
  }
}

export type ParsedPage = { file: string; doc: Document };

/** ページからカードを取り出す。同じ求人は最初に出たページの1件だけ数え、認識できないカードと求人IDのないカードは件数だけ残す */
export function buildSiteData(site: Site, lists: readonly ParsedPage[], details: readonly ParsedPage[]): SiteData {
  const adapter = ADAPTERS[site];
  const seen = new Set<string>();
  const cards: EvalCard[] = [];
  let unrecognized = 0;
  let withoutId = 0;
  let duplicates = 0;
  for (const { file, doc } of lists) {
    for (const element of adapter.findCards(doc)) {
      const data = extractSafe(adapter, element);
      if (!data) {
        unrecognized += 1;
        continue;
      }
      const jobId = data.jobId;
      if (!jobId) {
        withoutId += 1;
        continue;
      }
      if (seen.has(jobId)) {
        duplicates += 1;
        continue;
      }
      seen.add(jobId);
      const card = { ...data, jobId };
      cards.push({ page: file, card, url: jobUrl(site, card) });
    }
  }
  const parsed = new Map<string, DetailData>();
  const detailTexts = new Map<string, string>();
  for (const { file, doc } of details) {
    const jobId = detailJobId(file, doc);
    if (!jobId || detailTexts.has(jobId)) continue;
    const detail = parseDetailSafe(adapter, doc, jobId);
    if (detail) parsed.set(jobId, detail);
    detailTexts.set(jobId, detail ? detail.fields.text : squash((doc.querySelector('main') ?? doc.body)?.textContent));
  }
  return { site, pages: lists.map((item) => item.file), cards, details: parsed, detailTexts, unrecognized, withoutId, duplicates, excluded: 0 };
}

/** サイトの評価ページをすべて読み込む（ファイルは root からの相対パスで残す） */
export function loadSite(site: Site, root: string = process.cwd(), set: EvalSet = TUNING): SiteData {
  const { lists, details } = pageFiles(site, root, set);
  const parse = (file: string): ParsedPage => ({
    file: path.relative(root, file),
    doc: new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'text/html'),
  });
  return buildSiteData(site, lists.map(parse), details.map(parse));
}

/**
 * 数える求人だけにする。確かめ用では、調整用にラベルのある求人を外し、件数だけ残す（段階2b 仕様 6.2）。
 * 判定には外す前のデータを使う。拡張機能はページのカードをすべて見るので、外した求人も企業の記録のもとになる（仕様 6.1）
 */
export function countedOnly(data: SiteData, root: string = process.cwd(), set: EvalSet = TUNING): SiteData {
  if (!set.exclude) return data;
  const known = new Set(readLabels(data.site, root, set.exclude).map((label) => label.jobId));
  const cards = data.cards.filter(({ card }) => !known.has(card.jobId));
  return { ...data, cards, excluded: data.cards.length - cards.length };
}
