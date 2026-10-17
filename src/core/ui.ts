import { FIELD_LABELS } from './classify';
import type { Category, DisplayMode, Reason, Verdict } from './types';

export type CardState = 'collapsed' | 'hidden' | 'dimmed' | 'flagged' | 'pending' | 'revealed' | 'allowed' | 'plain';
export type BarAction = 'reveal' | 'notSes' | 'blockCompany' | 'unblockCompany' | 'undoAllow';
export type CounterModel = { hidden: number; flagged: number; pending: number; warnings: string[]; revealAll: boolean };
type BarButton = { action: BarAction; label: string };

export const STATE_ATTR = 'data-ses-filter';
export const BAR_TAG = 'ses-filter-bar';
export const COUNTER_TAG = 'ses-filter-counter';
export const STYLE_ID = 'ses-filter-style';

const CATEGORY_LABELS: Record<Category, string> = { ses: 'SES', haken: '派遣' };

const PAGE_CSS = [
  `[${STATE_ATTR}="collapsed"] > :not(${BAR_TAG}) { display: none !important; }`,
  `[${STATE_ATTR}="hidden"] { display: none !important; }`,
  `[${STATE_ATTR}="dimmed"] > :not(${BAR_TAG}) { opacity: 0.35 !important; }`,
  `${BAR_TAG}, ${COUNTER_TAG} { display: block; }`,
].join('\n');

const BAR_CSS = `
:host { all: initial; display: block; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 0; padding: 4px 10px;
  font: 12px/1.5 system-ui, sans-serif; color: #1f2328; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; }
.bar.flagged { background: #fff8c5; border-color: #d4a72c; }
.bar.pending { background: #ddf4ff; border-color: #54aeff; }
.bar.allowed { background: transparent; border-style: dashed; }
.bar.plain { justify-content: flex-end; margin: 0; padding: 0 4px; background: transparent; border: none; }
.text { flex: 1 1 12em; }
.text:empty { display: none; }
button { font: inherit; padding: 1px 8px; color: #1f2328; background: #fff; border: 1px solid #d0d7de; border-radius: 4px; cursor: pointer; }
.bar.plain button { padding: 0; font-size: 11px; color: #57606a; background: none; border: none; text-decoration: underline; }
`;

const COUNTER_CSS = `
:host { all: initial; position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; }
.counter { max-width: 360px; padding: 8px 12px; font: 12px/1.5 system-ui, sans-serif; color: #1f2328; background: #fff;
  border: 1px solid #d0d7de; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }
.warning { color: #9a6700; }
button { margin-top: 4px; font: inherit; padding: 1px 8px; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 4px; cursor: pointer; }
`;

const barHandlers = new WeakMap<Element, (action: BarAction) => void>();
const counterHandlers = new WeakMap<Element, () => void>();

export function stateFor(verdict: Verdict, mode: DisplayMode, revealed: boolean): CardState {
  if (verdict.userState === 'allowed') return 'allowed';
  switch (verdict.level) {
    case 'hide':
      if (revealed) return 'revealed';
      return mode === 'hide' ? 'hidden' : mode === 'dim' ? 'dimmed' : 'collapsed';
    case 'flag':
      return 'flagged';
    case 'pending':
      return 'pending';
    case 'none':
      return 'plain';
  }
}

export function formatReason(reason: Reason): string {
  return reason.field ? `${reason.label}（${FIELD_LABELS[reason.field]}）` : reason.label;
}

export function barText(verdict: Verdict, state: CardState): string {
  if (state === 'plain') return '';
  if (state === 'pending') return '判定中…（詳細ページを確認しています）';
  if (state === 'allowed') return 'あなたの指定で表示中';
  if (verdict.userState === 'blocked') return 'あなたが隠した企業';
  const head = verdict.category ? CATEGORY_LABELS[verdict.category] : 'SES・派遣';
  const label = state === 'flagged' ? `${head}の可能性（要確認）` : head;
  const shown = verdict.reasons.slice(0, 2).map(formatReason).join('、');
  const rest = verdict.reasons.length - 2;
  return `${label}：${shown}${rest > 0 ? `ほか${rest}件` : ''}`;
}

export function barTooltip(verdict: Verdict): string {
  return verdict.reasons.map((reason) => (reason.match ? `${formatReason(reason)}「${reason.match}」` : formatReason(reason))).join('\n');
}

export function actionsFor(verdict: Verdict, state: CardState): BarButton[] {
  if (state === 'pending') return [];
  if (state === 'plain') return [{ action: 'blockCompany', label: 'この企業を隠す' }];
  if (state === 'allowed') return [{ action: 'undoAllow', label: '取り消す' }];
  const buttons: BarButton[] = state === 'collapsed' || state === 'dimmed' ? [{ action: 'reveal', label: '表示' }] : [];
  if (verdict.userState === 'blocked') return [...buttons, { action: 'unblockCompany', label: '隠すのをやめる' }];
  return [...buttons, { action: 'notSes', label: 'SESではない' }, { action: 'blockCompany', label: 'この企業を常に隠す' }];
}

export function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PAGE_CSS;
  (doc.head ?? doc.documentElement).append(style);
}

/** カードに状態の属性を付け、先頭にバーを置く。内容が変わらなければバーは作り直さない */
export function applyCard(card: Element, verdict: Verdict, state: CardState, onAction: (action: BarAction) => void): void {
  // バーの中身を先に作る。ここで失敗しても、カードには何も手を付けていない状態で終わる
  const text = barText(verdict, state);
  const tooltip = barTooltip(verdict);
  const buttons = actionsFor(verdict, state);
  const signature = JSON.stringify([state, text, tooltip, buttons]);
  if (card.getAttribute(STATE_ATTR) !== state) card.setAttribute(STATE_ATTR, state);
  const doc = card.ownerDocument;
  let host = card.querySelector(`:scope > ${BAR_TAG}`);
  if (!host) {
    host = doc.createElement(BAR_TAG);
    card.prepend(host);
  }
  const barHost = host;
  barHandlers.set(barHost, onAction);
  const root = barHost.shadowRoot ?? barHost.attachShadow({ mode: 'open' });
  if (barHost.getAttribute('data-signature') === signature) return;
  barHost.setAttribute('data-signature', signature);

  const style = doc.createElement('style');
  style.textContent = BAR_CSS;
  const bar = doc.createElement('div');
  bar.className = `bar ${state}`;
  if (tooltip) bar.title = tooltip;
  const label = doc.createElement('span');
  label.className = 'text';
  label.textContent = text;
  bar.append(label);
  for (const button of buttons) {
    const element = doc.createElement('button');
    element.type = 'button';
    element.dataset.action = button.action;
    element.textContent = button.label;
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      barHandlers.get(barHost)?.(button.action);
    });
    bar.append(element);
  }
  root.replaceChildren(style, bar);
}

export function clearCard(card: Element): void {
  card.removeAttribute(STATE_ATTR);
  card.querySelector(`:scope > ${BAR_TAG}`)?.remove();
}

export function counterText(model: CounterModel): string {
  return `SES・派遣：隠した ${model.hidden}／要確認 ${model.flagged}／判定中 ${model.pending}`;
}

export function renderCounter(doc: Document, model: CounterModel, onToggleRevealAll: () => void): void {
  const existing = doc.querySelector(COUNTER_TAG);
  const visible = model.hidden + model.flagged + model.pending > 0 || model.warnings.length > 0;
  if (!visible) {
    existing?.remove();
    return;
  }
  const host = existing ?? doc.body.appendChild(doc.createElement(COUNTER_TAG));
  counterHandlers.set(host, onToggleRevealAll);
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const signature = JSON.stringify(model);
  if (host.getAttribute('data-signature') === signature) return;
  host.setAttribute('data-signature', signature);

  const style = doc.createElement('style');
  style.textContent = COUNTER_CSS;
  const box = doc.createElement('div');
  box.className = 'counter';
  const line = doc.createElement('div');
  line.className = 'text';
  line.textContent = counterText(model);
  box.append(line);
  for (const warning of model.warnings) {
    const element = doc.createElement('div');
    element.className = 'warning';
    element.textContent = `⚠ ${warning}`;
    box.append(element);
  }
  if (model.hidden > 0 || model.revealAll) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.action = 'toggleRevealAll';
    button.textContent = model.revealAll ? '［元に戻す］' : '［すべて一時的に表示］';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      counterHandlers.get(host)?.();
    });
    box.append(button);
  }
  root.replaceChildren(style, box);
}

export function removeAllUi(doc: Document): void {
  for (const element of doc.querySelectorAll(`[${STATE_ATTR}]`)) element.removeAttribute(STATE_ATTR);
  for (const element of doc.querySelectorAll(BAR_TAG)) element.remove();
  doc.querySelector(COUNTER_TAG)?.remove();
  doc.getElementById(STYLE_ID)?.remove();
}

/** 拡張機能が差し込んだ要素か（MutationObserver で自分の変更を無視するため） */
export function isOwnNode(node: Node): boolean {
  if (node.nodeType !== 1) return false;
  const element = node as Element;
  return element.localName === BAR_TAG || element.localName === COUNTER_TAG || element.id === STYLE_ID;
}
