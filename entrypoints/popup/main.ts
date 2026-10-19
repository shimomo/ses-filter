import { browser } from 'wxt/browser';
import { PREFETCH_AVAILABLE } from '../../src/core/features';
import { STATS_MESSAGE, type PageStats } from '../../src/core/messages';
import { clearCache, loadSettings, saveSettings } from '../../src/core/store';
import type { DisplayMode, Site } from '../../src/core/types';
import { formatStats } from './format';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} not found`);
  return element as T;
}

async function fetchStats(): Promise<PageStats | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  try {
    return (await browser.tabs.sendMessage(tab.id, { type: STATS_MESSAGE })) as PageStats;
  } catch {
    return null;
  }
}

async function init(): Promise<void> {
  // 設定を読む前に消し、スイッチが一瞬見えないようにする
  if (!PREFETCH_AVAILABLE) byId('prefetch').closest('label')?.remove();
  const settings = await loadSettings();

  const enabled = byId<HTMLInputElement>('enabled');
  enabled.checked = settings.enabled;
  enabled.addEventListener('change', () => void saveSettings({ enabled: enabled.checked }));

  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
    radio.checked = radio.value === settings.mode;
    radio.addEventListener('change', () => {
      if (radio.checked) void saveSettings({ mode: radio.value as DisplayMode });
    });
  }

  for (const box of document.querySelectorAll<HTMLInputElement>('input[data-site]')) {
    const site = box.dataset.site as Site;
    box.checked = settings.sites[site];
    box.addEventListener('change', async () => {
      const current = await loadSettings();
      await saveSettings({ sites: { ...current.sites, [site]: box.checked } });
    });
  }

  if (PREFETCH_AVAILABLE) {
    const prefetch = byId<HTMLInputElement>('prefetch');
    prefetch.checked = settings.prefetch;
    prefetch.addEventListener('change', () => void saveSettings({ prefetch: prefetch.checked }));
  }

  byId('clear-cache').addEventListener('click', async () => {
    const removed = await clearCache();
    byId('status').textContent = `保存済みの判定を ${removed} 件消去しました`;
  });

  const lines = formatStats(await fetchStats());
  byId('stats-body').replaceChildren(...lines.map((line) => Object.assign(document.createElement('p'), { textContent: line })));
}

void init();
