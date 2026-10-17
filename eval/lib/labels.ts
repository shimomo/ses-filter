import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Site } from '../../src/core/types';
import { TUNING, type EvalSet } from './sets';
import { LABELS, type EvalCard, type Label, type LabelRecord } from './types';

export const labelFile = (site: Site, root: string = process.cwd(), set: EvalSet = TUNING): string => path.join(root, set.labelsDir, `${site}.json`);

/** ラベルの形を確かめて読む。形の違うものがあれば、ファイル・何件目・求人IDを添えて例外にする（黙って数え間違えないため） */
export function parseLabels(json: string, source: string): LabelRecord[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error(`${source}: ラベルは配列で書く`);
  const seen = new Set<string>();
  return raw.map((item: unknown, index: number): LabelRecord => {
    const where = `${source} の ${index + 1} 件目`;
    if (typeof item !== 'object' || item === null) throw new Error(`${where}: オブジェクトではない`);
    const r = item as Record<string, unknown>;
    if (typeof r.jobId !== 'string' || r.jobId === '') throw new Error(`${where}: jobId がない`);
    const at = `${where}（求人 ${r.jobId}）`;
    if (seen.has(r.jobId)) throw new Error(`${at}: 同じ求人のラベルが2つある`);
    seen.add(r.jobId);
    if (!LABELS.includes(r.label as Label)) throw new Error(`${at}: label は ${LABELS.join('・')} のどれか（いまは ${JSON.stringify(r.label)}）`);
    const evidence = r.evidence;
    if (!Array.isArray(evidence) || !evidence.every((e) => typeof e === 'string')) throw new Error(`${at}: evidence は文字列の配列`);
    if (r.by !== 'claude' && r.by !== 'user') throw new Error(`${at}: by は claude か user`);
    return {
      jobId: r.jobId,
      company: typeof r.company === 'string' ? r.company : '',
      title: typeof r.title === 'string' ? r.title : '',
      label: r.label as Label,
      evidence: evidence as string[],
      by: r.by === 'user' ? 'user' : 'claude',
      note: typeof r.note === 'string' ? r.note : '',
    };
  });
}

export function readLabels(site: Site, root: string = process.cwd(), set: EvalSet = TUNING): LabelRecord[] {
  const file = labelFile(site, root, set);
  return existsSync(file) ? parseLabels(readFileSync(file, 'utf8'), path.relative(root, file)) : [];
}

export function writeLabels(site: Site, records: LabelRecord[], root: string = process.cwd(), set: EvalSet = TUNING): void {
  const file = labelFile(site, root, set);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`);
}

/** ラベルのない求人に、下書き用の空のラベル（unknown）を足す。既存のラベルはそのまま残す */
export function withSkeletons(cards: readonly EvalCard[], records: readonly LabelRecord[]): LabelRecord[] {
  const known = new Set(records.map((record) => record.jobId));
  const added = cards
    .filter((item) => !known.has(item.card.jobId))
    .map(
      (item): LabelRecord => ({
        jobId: item.card.jobId,
        company: item.card.companyName,
        title: item.card.fields.title ?? '',
        label: 'unknown',
        evidence: [],
        by: 'claude',
        note: '',
      }),
    );
  return [...records, ...added];
}

/** ページとラベルの食い違い（仕様 6.4）と、根拠の書かれていないラベル */
export function labelWarnings(cards: readonly EvalCard[], records: readonly LabelRecord[]): string[] {
  const cardIds = new Set(cards.map((item) => item.card.jobId));
  const labelIds = new Set(records.map((record) => record.jobId));
  const noLabel = cards.filter((item) => !labelIds.has(item.card.jobId)).map((item) => item.card.jobId);
  const noCard = records.filter((record) => !cardIds.has(record.jobId)).map((record) => record.jobId);
  const noEvidence = records.filter((record) => record.evidence.length === 0).map((record) => record.jobId);
  return [
    ...(noLabel.length > 0 ? [`ラベルのない求人 ${noLabel.length} 件: ${noLabel.join(', ')}`] : []),
    ...(noCard.length > 0 ? [`どのページにもない求人のラベル ${noCard.length} 件: ${noCard.join(', ')}`] : []),
    ...(noEvidence.length > 0 ? [`根拠の書かれていないラベル ${noEvidence.length} 件: ${noEvidence.join(', ')}`] : []),
  ];
}
