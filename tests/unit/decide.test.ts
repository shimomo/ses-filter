import { describe, expect, it } from 'vitest';
import type { RuleResult } from '../../src/core/classify';
import { companyTarget, decide, listKey, type DecideInput } from '../../src/core/decide';
import type { CompanyRecord, JobRecord, UserLists } from '../../src/core/types';

const lists = (partial: Partial<UserLists> = {}): UserLists => ({ blockedCompanies: {}, allowedCompanies: {}, allowedJobs: {}, ...partial });
const entry = { name: 'テスト株式会社', at: 1 };
const NONE: RuleResult = { level: 'none', reasons: [], companyLevel: false };
const STRONG: RuleResult = {
  level: 'hide',
  category: 'ses',
  reasons: [{ source: 'card-rule', category: 'ses', label: '還元率', field: 'title', match: '還元率' }],
  companyLevel: false,
};
const STRONG_BUSINESS: RuleResult = { ...STRONG, companyLevel: true };
const MEDIUM: RuleResult = {
  level: 'flag',
  category: 'ses',
  reasons: [{ source: 'card-rule', category: 'ses', label: '商流', field: 'text', match: '商流' }],
  companyLevel: false,
};

const job = (level: JobRecord['level']): JobRecord => ({
  level,
  category: level === 'hide' ? 'ses' : undefined,
  reasons: level === 'hide' ? [{ source: 'site', category: 'ses', label: '受託開発（社外常駐）' }] : [],
  savedAt: 0,
  expiresAt: 1,
});

const company = (partial: Partial<CompanyRecord>): CompanyRecord => ({
  name: 'テスト株式会社',
  businessHit: null,
  targetJobs: {},
  cleanJobs: [],
  updatedAt: 0,
  ...partial,
});

const input = (partial: Partial<DecideInput> = {}): DecideInput => ({
  site: 'paiza',
  card: { jobId: '10', companyKey: '20', companyName: 'テスト株式会社', fields: { text: '' } },
  lists: lists(),
  job: undefined,
  company: undefined,
  cardResult: NONE,
  canPrefetch: false,
  ...partial,
});

describe('decide', () => {
  it('shows a job the user allowed even if the company is blocked and the card looks like SES', () => {
    const verdict = decide(input({ lists: lists({ allowedJobs: { 'paiza:10': entry }, blockedCompanies: { 'paiza:20': entry } }), cardResult: STRONG }));
    expect(verdict).toMatchObject({ level: 'none', userState: 'allowed', decidedAt: 'job' });
  });

  it('shows a company the user allowed even if a saved result says SES', () => {
    const verdict = decide(input({ lists: lists({ allowedCompanies: { 'paiza:20': entry } }), job: job('hide') }));
    expect(verdict).toMatchObject({ level: 'none', userState: 'allowed', decidedAt: 'company' });
  });

  it('hides a company the user blocked', () => {
    expect(decide(input({ lists: lists({ blockedCompanies: { 'paiza:20': entry } }) }))).toEqual({
      level: 'hide',
      reasons: [{ source: 'user', label: 'あなたが隠した企業' }],
      userState: 'blocked',
      decidedAt: 'company',
    });
  });

  it('uses a saved hide result before company records and card rules', () => {
    expect(decide(input({ job: job('hide'), company: company({ businessHit: 'haken' }) }))).toMatchObject({ level: 'hide', category: 'ses', decidedAt: 'job' });
  });

  it('hides a job at company level even when its saved detail result is none', () => {
    expect(decide(input({ job: job('none'), company: company({ businessHit: 'ses' }) }))).toMatchObject({
      level: 'hide',
      category: 'ses',
      decidedAt: 'company',
    });
    expect(decide(input({ job: job('none'), company: company({ targetJobs: { '1': 'ses' } }) }))).toMatchObject({ level: 'hide', decidedAt: 'company' });
  });

  it('uses a saved none result when the company is not a target', () => {
    expect(decide(input({ job: job('none'), cardResult: STRONG }))).toMatchObject({ level: 'none', decidedAt: 'job' });
  });

  it('carries the reasons of a saved hide result', () => {
    expect(decide(input({ job: job('hide') }))).toMatchObject({
      level: 'hide',
      category: 'ses',
      decidedAt: 'job',
      reasons: [{ label: '受託開発（社外常駐）' }],
    });
  });

  it('falls through an unknown detail result to the card rules', () => {
    expect(decide(input({ job: job('unknown'), cardResult: STRONG }))).toMatchObject({ level: 'hide', decidedAt: 'job', reasons: STRONG.reasons });
  });

  it('hides by a company business hit and keeps the card reasons when the card itself is strong', () => {
    expect(decide(input({ company: company({ businessHit: 'haken' }) }))).toEqual({
      level: 'hide',
      category: 'haken',
      reasons: [{ source: 'company', category: 'haken', label: '同じ企業の事業内容' }],
      decidedAt: 'company',
    });
    expect(decide(input({ company: company({ businessHit: 'ses' }), cardResult: STRONG_BUSINESS }))).toMatchObject({
      level: 'hide',
      reasons: STRONG.reasons,
      decidedAt: 'company',
    });
  });

  it('hides every job of a company with one target job, even when a clean job is known', () => {
    expect(decide(input({ company: company({ targetJobs: { '1': 'ses' }, cleanJobs: ['3'] }) }))).toMatchObject({
      level: 'hide',
      reasons: [{ source: 'company', label: '同じ企業の求人が対象' }],
      decidedAt: 'company',
    });
  });

  it('keeps a job hidden by its own card at job level even when another job of the company also hits', () => {
    // 「SESではない」はその求人だけに記録する（段階2b 仕様 5.2）。企業全体の指定にしない
    expect(decide(input({ cardResult: STRONG, company: company({ targetJobs: { '10': 'ses', '1': 'ses' } }) }))).toMatchObject({
      level: 'hide',
      reasons: STRONG.reasons,
      decidedAt: 'job',
    });
    expect(decide(input({ job: job('none'), cardResult: STRONG, company: company({ businessHit: 'ses' }) }))).toMatchObject({ level: 'hide', decidedAt: 'job' });
  });

  it('does not count the job itself or a job the user allowed as company evidence', () => {
    // カードの文字が変わって当たりが消えた求人は、自分自身の古い記録では隠れない（Review Focus 2）
    expect(decide(input({ company: company({ targetJobs: { '10': 'ses' } }) })).level).toBe('none');
    // 誤って隠した1件を「SESではない」にすれば、企業のほかの求人も戻る（Review Focus 1）
    expect(decide(input({ lists: lists({ allowedJobs: { 'paiza:1': entry } }), company: company({ targetJobs: { '1': 'ses' } }) })).level).toBe('none');
    expect(decide(input({ lists: lists({ allowedJobs: { 'paiza:1': entry } }), company: company({ targetJobs: { '1': 'ses', '2': 'haken' } }) }))).toMatchObject({
      level: 'hide',
      category: 'haken',
    });
  });

  it('uses card rules: strong hides, business hits decide at company level, medium flags', () => {
    expect(decide(input({ cardResult: STRONG }))).toMatchObject({ level: 'hide', decidedAt: 'job' });
    expect(decide(input({ cardResult: STRONG_BUSINESS }))).toMatchObject({ level: 'hide', decidedAt: 'company' });
    expect(decide(input({ cardResult: MEDIUM }))).toMatchObject({ level: 'flag', decidedAt: 'job' });
  });

  it('lets the detail page decide a card that only has medium signals', () => {
    expect(decide(input({ cardResult: MEDIUM, canPrefetch: true })).level).toBe('pending');
    expect(decide(input({ cardResult: MEDIUM, canPrefetch: true, job: job('unknown') }))).toMatchObject({ level: 'flag' });
    expect(decide(input({ cardResult: STRONG, canPrefetch: true })).level).toBe('hide');
  });

  it('waits for the detail page only when it can be fetched and nothing is saved yet', () => {
    expect(decide(input({ canPrefetch: true })).level).toBe('pending');
    expect(decide(input({ canPrefetch: true, job: job('unknown') })).level).toBe('none');
    expect(decide(input({ canPrefetch: true, card: { jobId: null, companyKey: '20', companyName: 'A', fields: { text: '' } } })).level).toBe('none');
    expect(decide(input({ canPrefetch: false })).level).toBe('none');
  });
});

describe('companyTarget and listKey', () => {
  it('needs a business hit or one counted target job', () => {
    expect(companyTarget(undefined)).toBeNull();
    expect(companyTarget(company({}))).toBeNull();
    expect(companyTarget(company({ targetJobs: { '1': 'haken' }, cleanJobs: ['2'] }))).toEqual({ category: 'haken', label: '同じ企業の求人が対象' });
    expect(companyTarget(company({ targetJobs: { '1': 'haken', '2': 'ses' } }))).toEqual({ category: 'ses', label: '同じ企業の求人が対象' });
    expect(companyTarget(company({ targetJobs: { '1': 'ses' } }), (jobId) => jobId !== '1')).toBeNull();
  });

  it('joins site and id', () => {
    expect(listKey('green', '101')).toBe('green:101');
  });
});
