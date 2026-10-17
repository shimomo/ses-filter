import { describe, expect, it } from 'vitest';
import { labelWarnings, parseLabels, withSkeletons } from '../../../eval/lib/labels';
import type { EvalCard, LabelRecord } from '../../../eval/lib/types';

const label = (jobId: string, overrides: Partial<LabelRecord> = {}): LabelRecord => ({
  jobId,
  company: 'A社',
  title: 'SE',
  label: 'other',
  evidence: ['doda 事業：自社サービスの開発'],
  by: 'claude',
  note: '',
  ...overrides,
});
const card = (jobId: string): EvalCard => ({
  page: 'p.html',
  url: `https://example.com/${jobId}`,
  card: { jobId, companyKey: 'k', companyName: 'A社', fields: { title: 'SE', text: 'SE' } },
});

describe('parseLabels', () => {
  it('reads valid labels', () => {
    expect(parseLabels(JSON.stringify([label('1')]), 'eval/labels/doda.json')).toEqual([label('1')]);
  });

  it.each<[unknown, string]>([
    [[{ ...label('1'), label: 'SES' }], 'label は ses・haken・other・unknown のどれか'],
    [[{ ...label('1'), label: 'other ' }], 'label は ses・haken・other・unknown のどれか'],
    [[label('1'), label('1')], '同じ求人のラベルが2つある'],
    [[{ ...label('1'), evidence: 'doda 事業' }], 'evidence は文字列の配列'],
    [[{ ...label('1'), by: 'me' }], 'by は claude か user'],
    [[{ ...label('1'), jobId: 1 }], 'jobId がない'],
    [{}, 'ラベルは配列で書く'],
  ])('rejects malformed labels (%#)', (value, message) => {
    expect(() => parseLabels(JSON.stringify(value), 'eval/labels/doda.json')).toThrow(message);
  });

  it('names the file, the position and the job in the error', () => {
    const json = JSON.stringify([label('1'), { ...label('42'), label: 'SES' }]);
    expect(() => parseLabels(json, 'eval/labels/doda.json')).toThrow('eval/labels/doda.json の 2 件目（求人 42）');
  });
});

describe('withSkeletons', () => {
  it('adds an unknown label for each job without one and keeps the existing labels', () => {
    const existing = [label('1', { label: 'ses', by: 'user' })];
    expect(withSkeletons([card('1'), card('2')], existing)).toEqual([
      existing[0],
      { jobId: '2', company: 'A社', title: 'SE', label: 'unknown', evidence: [], by: 'claude', note: '' },
    ]);
  });
});

describe('labelWarnings', () => {
  it('warns about labels of jobs on no page and labels without evidence', () => {
    expect(labelWarnings([card('1'), card('2')], [label('1'), label('3'), label('2', { evidence: [] })])).toEqual([
      'どのページにもない求人のラベル 1 件: 3',
      '根拠の書かれていないラベル 1 件: 2',
    ]);
  });

  it('warns about jobs without a label', () => {
    expect(labelWarnings([card('1'), card('2')], [label('1')])).toEqual(['ラベルのない求人 1 件: 2']);
  });
});
