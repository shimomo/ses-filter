import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Verdict } from '../../src/core/types';
import {
  BAR_TAG,
  COUNTER_TAG,
  STATE_ATTR,
  STYLE_ID,
  actionsFor,
  applyCard,
  barText,
  clearCard,
  ensureStyle,
  isOwnNode,
  removeAllUi,
  renderCounter,
  stateFor,
  type CardState,
} from '../../src/core/ui';

const hide: Verdict = {
  level: 'hide',
  category: 'ses',
  decidedAt: 'job',
  reasons: [
    { source: 'card-rule', category: 'ses', label: '還元率', field: 'title', match: '還元率' },
    { source: 'card-rule', category: 'ses', label: 'プロジェクト先', field: 'location', match: '各プロジェクト先' },
    { source: 'card-rule', category: 'ses', label: '帰社日', field: 'text', match: '帰社日' },
  ],
};
const haken: Verdict = { level: 'hide', category: 'haken', decidedAt: 'company', reasons: [{ source: 'card-rule', category: 'haken', label: '派遣事業', field: 'business' }] };
const flag: Verdict = { level: 'flag', category: 'ses', decidedAt: 'job', reasons: [{ source: 'card-rule', category: 'ses', label: '商流', field: 'text', match: '商流' }] };
const blocked: Verdict = { level: 'hide', reasons: [{ source: 'user', label: 'あなたが隠した企業' }], userState: 'blocked', decidedAt: 'company' };
const allowed: Verdict = { level: 'none', reasons: [{ source: 'user', label: 'あなたの指定で表示' }], userState: 'allowed', decidedAt: 'job' };
const none: Verdict = { level: 'none', reasons: [] };
const pending: Verdict = { level: 'pending', reasons: [] };

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('stateFor', () => {
  it.each<[Verdict, 'collapse' | 'hide' | 'dim', boolean, CardState]>([
    [hide, 'collapse', false, 'collapsed'],
    [hide, 'hide', false, 'hidden'],
    [hide, 'dim', false, 'dimmed'],
    [hide, 'hide', true, 'revealed'],
    [flag, 'hide', false, 'flagged'],
    [pending, 'collapse', false, 'pending'],
    [allowed, 'collapse', false, 'allowed'],
    [none, 'collapse', false, 'plain'],
  ])('case %#', (verdict, mode, revealed, expected) => {
    expect(stateFor(verdict, mode, revealed)).toBe(expected);
  });
});

describe('barText and actionsFor', () => {
  it('summarizes up to two reasons', () => {
    expect(barText(hide, 'collapsed')).toBe('SES：還元率（タイトル）、プロジェクト先（勤務地）ほか1件');
    expect(barText(haken, 'collapsed')).toBe('派遣：派遣事業（事業内容）');
    expect(barText(flag, 'flagged')).toBe('SESの可能性（要確認）：商流（本文）');
  });

  it('uses fixed texts for user decisions and waiting', () => {
    expect(barText(blocked, 'collapsed')).toBe('あなたが隠した企業');
    expect(barText(allowed, 'allowed')).toBe('あなたの指定で表示中');
    expect(barText(pending, 'pending')).toBe('判定中…（詳細ページを確認しています）');
    expect(barText(none, 'plain')).toBe('');
  });

  it.each<[Verdict, CardState, string[]]>([
    [hide, 'collapsed', ['reveal', 'notSes', 'blockCompany']],
    [hide, 'dimmed', ['reveal', 'notSes', 'blockCompany']],
    [hide, 'hidden', ['notSes', 'blockCompany']],
    [hide, 'revealed', ['notSes', 'blockCompany']],
    [flag, 'flagged', ['notSes', 'blockCompany']],
    [blocked, 'collapsed', ['reveal', 'unblockCompany']],
    [blocked, 'revealed', ['unblockCompany']],
    [allowed, 'allowed', ['undoAllow']],
    [pending, 'pending', []],
    [none, 'plain', ['blockCompany']],
  ])('actions case %#', (verdict, state, expected) => {
    expect(actionsFor(verdict, state).map((button) => button.action)).toEqual(expected);
  });

  it('labels the plain-card button differently', () => {
    expect(actionsFor(none, 'plain')).toEqual([{ action: 'blockCompany', label: 'この企業を隠す' }]);
  });
});

describe('applyCard and clearCard', () => {
  function makeCard(): Element {
    document.body.innerHTML = '<div class="card"><a href="/job/1">求人</a></div>';
    const card = document.querySelector('.card');
    if (!card) throw new Error('no card');
    return card;
  }

  it('sets the state and prepends a bar with buttons inside a shadow root', () => {
    const card = makeCard();
    applyCard(card, hide, 'collapsed', () => {});
    expect(card.getAttribute(STATE_ATTR)).toBe('collapsed');
    expect(card.firstElementChild?.localName).toBe(BAR_TAG);
    const labels = [...(card.firstElementChild?.shadowRoot?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
    expect(labels).toEqual(['表示', 'SESではない', 'この企業を常に隠す']);
    expect(card.textContent).toBe('求人');
  });

  it('calls the latest handler and keeps the click from reaching the card', () => {
    const card = makeCard();
    const cardClick = vi.fn();
    card.addEventListener('click', cardClick);
    const first = vi.fn();
    const second = vi.fn();
    applyCard(card, hide, 'collapsed', first);
    applyCard(card, hide, 'collapsed', second);
    card.querySelector(BAR_TAG)?.shadowRoot?.querySelector<HTMLButtonElement>('button[data-action="notSes"]')?.click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('notSes');
    expect(cardClick).not.toHaveBeenCalled();
    expect(card.querySelectorAll(BAR_TAG)).toHaveLength(1);
  });

  it('rebuilds the bar when the state changes', () => {
    const card = makeCard();
    applyCard(card, hide, 'collapsed', () => {});
    applyCard(card, hide, 'revealed', () => {});
    expect(card.querySelector(BAR_TAG)?.shadowRoot?.querySelectorAll('button')).toHaveLength(2);
  });

  it('leaves the card untouched when the bar cannot be built', () => {
    const card = makeCard();
    const broken = { level: 'hide', category: 'ses' } as unknown as Verdict;
    expect(() => applyCard(card, broken, 'collapsed', () => {})).toThrow();
    expect(card.hasAttribute(STATE_ATTR)).toBe(false);
    expect(card.querySelector(BAR_TAG)).toBeNull();
  });

  it('clearCard removes the state and the bar', () => {
    const card = makeCard();
    applyCard(card, hide, 'collapsed', () => {});
    clearCard(card);
    expect(card.hasAttribute(STATE_ATTR)).toBe(false);
    expect(card.querySelector(BAR_TAG)).toBeNull();
  });
});

describe('renderCounter', () => {
  it('shows the counts and toggles reveal-all', () => {
    const toggle = vi.fn();
    renderCounter(document, { hidden: 2, flagged: 1, pending: 0, warnings: [], revealAll: false }, toggle);
    const root = document.querySelector(COUNTER_TAG)?.shadowRoot;
    expect(root?.textContent).toContain('SES・派遣：隠した 2／要確認 1／判定中 0');
    expect(root?.querySelector('button')?.textContent).toBe('［すべて一時的に表示］');
    root?.querySelector<HTMLButtonElement>('button')?.click();
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('shows warnings even when nothing is hidden', () => {
    renderCounter(document, { hidden: 0, flagged: 0, pending: 0, warnings: ['カードを認識できません'], revealAll: false }, () => {});
    expect(document.querySelector(COUNTER_TAG)?.shadowRoot?.textContent).toContain('⚠ カードを認識できません');
  });

  it('removes itself when there is nothing to show', () => {
    renderCounter(document, { hidden: 1, flagged: 0, pending: 0, warnings: [], revealAll: false }, () => {});
    renderCounter(document, { hidden: 0, flagged: 0, pending: 0, warnings: [], revealAll: false }, () => {});
    expect(document.querySelector(COUNTER_TAG)).toBeNull();
  });
});

describe('page style and cleanup', () => {
  it('adds the page style once and removes every trace', () => {
    ensureStyle(document);
    ensureStyle(document);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    document.body.innerHTML = '<div class="card"></div>';
    const card = document.querySelector('.card');
    if (!card) throw new Error('no card');
    applyCard(card, hide, 'collapsed', () => {});
    renderCounter(document, { hidden: 1, flagged: 0, pending: 0, warnings: [], revealAll: false }, () => {});
    removeAllUi(document);
    expect(document.querySelector(`[${STATE_ATTR}]`)).toBeNull();
    expect(document.querySelector(BAR_TAG)).toBeNull();
    expect(document.querySelector(COUNTER_TAG)).toBeNull();
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('recognizes its own nodes', () => {
    expect(isOwnNode(document.createElement(BAR_TAG))).toBe(true);
    expect(isOwnNode(document.createElement(COUNTER_TAG))).toBe(true);
    expect(isOwnNode(document.createElement('div'))).toBe(false);
    expect(isOwnNode(document.createTextNode('x'))).toBe(false);
  });
});
