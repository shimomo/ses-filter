import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DAY_MS,
  DEFAULT_SETTINGS,
  JOB_TTL_MS,
  applyListOp,
  clearCache,
  companyStoreKey,
  jobStoreKey,
  loadLists,
  loadRecords,
  loadSettings,
  mergeLists,
  saveBusinessHit,
  saveCardHit,
  saveJobResult,
  saveSettings,
  updateLists,
} from '../../src/core/store';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('settings', () => {
  it('returns defaults when nothing is saved', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a patch into the saved settings', async () => {
    await saveSettings({ mode: 'hide' });
    expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS, mode: 'hide' });
  });

  it('keeps paiza prefetch off until the user turns it on', async () => {
    expect((await loadSettings()).paizaPrefetch).toBe(false);
    await saveSettings({ paizaPrefetch: true });
    expect((await loadSettings()).paizaPrefetch).toBe(true);
  });

  it('fills sites missing from a partially saved object', async () => {
    await browser.storage.local.set({ settings: { mode: 'dim', sites: { green: false } } });
    expect((await loadSettings()).sites).toEqual({ paiza: true, green: false, doda: true });
  });
});

describe('user lists', () => {
  it('never keeps a company both blocked and allowed', () => {
    const blocked = applyListOp(mergeLists(undefined), { type: 'blockCompany', key: 'green:1', name: 'A社' }, 5);
    const allowed = applyListOp(blocked, { type: 'allowCompany', key: 'green:1', name: 'A社' }, 6);
    expect(allowed.blockedCompanies).toEqual({});
    expect(allowed.allowedCompanies).toEqual({ 'green:1': { name: 'A社', at: 6 } });
    const blockedAgain = applyListOp(allowed, { type: 'blockCompany', key: 'green:1', name: 'A社' }, 7);
    expect(blockedAgain.allowedCompanies).toEqual({});
    expect(blockedAgain.blockedCompanies).toEqual({ 'green:1': { name: 'A社', at: 7 } });
  });

  it('does not mutate the given lists', () => {
    const original = mergeLists(undefined);
    applyListOp(original, { type: 'allowJob', key: 'paiza:1', name: 'A社' }, 1);
    expect(original.allowedJobs).toEqual({});
  });

  it('persists operations', async () => {
    await updateLists({ type: 'blockCompany', key: 'green:1', name: 'A社' }, 5);
    await updateLists({ type: 'allowJob', key: 'paiza:9', name: 'B社' }, 6);
    await updateLists({ type: 'unallowJob', key: 'paiza:9' }, 7);
    expect(await loadLists()).toEqual({ blockedCompanies: { 'green:1': { name: 'A社', at: 5 } }, allowedCompanies: {}, allowedJobs: {} });
  });
});

describe('job and company records', () => {
  const base = { site: 'paiza' as const, companyKey: '20', companyName: 'C社', reasons: [] };

  it('saves a job with a 30 day expiry and counts it on the company once', async () => {
    await saveJobResult({ ...base, jobId: '10', level: 'hide', category: 'ses', now: 100 });
    const { job, company } = await saveJobResult({ ...base, jobId: '10', level: 'hide', category: 'ses', now: 200 });
    expect(job.expiresAt).toBe(200 + JOB_TTL_MS);
    expect(company.targetJobs).toEqual({ '10': 'ses' });
    expect(company.cleanJobs).toEqual([]);
  });

  it('moves a job from target to clean when its result changes', async () => {
    await saveJobResult({ ...base, jobId: '10', level: 'hide', category: 'ses', now: 1 });
    const { company } = await saveJobResult({ ...base, jobId: '10', level: 'none', now: 2 });
    expect(company.targetJobs).toEqual({});
    expect(company.cleanJobs).toEqual(['10']);
  });

  it('keeps unknown results for one day and does not count them', async () => {
    const { job, company } = await saveJobResult({ ...base, jobId: '11', level: 'unknown', now: 1 });
    expect(job.expiresAt).toBe(1 + DAY_MS);
    expect(company.targetJobs).toEqual({});
    expect(company.cleanJobs).toEqual([]);
  });

  it('loads fresh records and removes expired ones', async () => {
    await saveJobResult({ ...base, jobId: '10', level: 'hide', category: 'ses', now: 0 });
    await saveJobResult({ ...base, jobId: '11', level: 'unknown', now: 0 });
    const { jobs, companies } = await loadRecords('paiza', ['10', '11', '12'], ['20', '99'], DAY_MS + 1);
    expect([...jobs.keys()]).toEqual(['10']);
    expect([...companies.keys()]).toEqual(['20']);
    expect((await browser.storage.local.get(jobStoreKey('paiza', '11')))[jobStoreKey('paiza', '11')]).toBeUndefined();
  });

  it('records a business hit once', async () => {
    const first = await saveBusinessHit('green', '101', 'D社', 'ses', 1);
    const second = await saveBusinessHit('green', '101', 'D社', 'ses', 2);
    expect(first).toMatchObject({ name: 'D社', businessHit: 'ses', updatedAt: 1 });
    expect(second.updatedAt).toBe(1);
  });

  it('forgets a card hit when the card no longer hits', async () => {
    await saveCardHit('green', '500', 'M社', '1', 'ses', 1);
    const company = await saveCardHit('green', '500', 'M社', '1', null, 2);
    expect(company.targetJobs).toEqual({});
    expect(company.updatedAt).toBe(2);
  });

  it('records a card hit as a target job once', async () => {
    const first = await saveCardHit('green', '500', 'M社', '1', 'ses', 1);
    const second = await saveCardHit('green', '500', 'M社', '1', 'ses', 2);
    expect(first).toMatchObject({ name: 'M社', businessHit: null, targetJobs: { '1': 'ses' }, cleanJobs: [], updatedAt: 1 });
    expect(second.updatedAt).toBe(1);
  });

  it('clears only job and company records', async () => {
    await saveSettings({ mode: 'dim' });
    await updateLists({ type: 'blockCompany', key: 'green:1', name: 'A社' }, 1);
    await saveJobResult({ ...base, jobId: '10', level: 'hide', category: 'ses', now: 1 });
    await saveBusinessHit('green', '101', 'D社', 'ses', 1);
    expect(await clearCache()).toBe(3);
    const all = await browser.storage.local.get(null);
    expect(Object.keys(all).sort()).toEqual(['settings', 'userLists']);
    expect(companyStoreKey('green', '101')).toBe('company:green:101');
  });
});
