import { describe, expect, it } from 'vitest';
import { pickGreenDetails } from '../../../eval/lib/pick';
import { renderCardSheet, renderReport, renderReview, reviewItems, summaryLines } from '../../../eval/lib/report';
import type { EvalCard, Label, LabelRecord, SiteData, SiteRun } from '../../../eval/lib/types';
import type { Level, Site, Verdict } from '../../../src/core/types';

type Row = { id: string; label: Label; level: Level; reason?: string };

/** 3つの条件で同じ判定になる、合成のサイトの評価結果 */
function makeRun(site: Site, rows: Row[], detailIds: string[] = []): SiteRun {
  const cards: EvalCard[] = rows.map(({ id }) => ({
    page: `eval/pages/${site}/p.html`,
    url: site === 'green' ? `https://www.green-japan.com/company/9/job/${id}` : `https://example.com/${site}/${id}`,
    card: { jobId: id, companyKey: '9', companyName: `企業${id}`, fields: { title: `求人${id}`, text: `求人${id}の本文` } },
  }));
  const labels: LabelRecord[] = rows.map(({ id, label }) => ({
    jobId: id,
    company: `企業${id}`,
    title: `求人${id}`,
    label,
    evidence: [`${site} 事業：記述${id}`],
    by: 'claude',
    note: '',
  }));
  const verdictOf = ({ level, reason }: Row): Verdict => ({
    level,
    category: level === 'hide' || level === 'flag' ? 'ses' : undefined,
    reasons: reason ? [{ source: 'card-rule', category: 'ses', label: reason, field: 'title', match: reason }] : [],
  });
  const verdicts = new Map(rows.map((row) => [row.id, verdictOf(row)]));
  const data: SiteData = {
    site,
    pages: [`eval/pages/${site}/p.html`],
    cards,
    details: new Map(),
    detailTexts: new Map(detailIds.map((id) => [id, `詳細${id}`])),
    unrecognized: 1,
    withoutId: 1,
    duplicates: 2,
    excluded: 0,
  };
  return { data, labels, verdicts: { card: verdicts, company: verdicts, usual: verdicts }, warnings: [] };
}

describe('reviewItems', () => {
  it('lists the mismatches, then the unknown labels, then 20 agreements chosen with a fixed seed', () => {
    const agreements: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, label: i % 2 ? 'other' : 'ses', level: i % 2 ? 'none' : 'hide' }));
    const run = makeRun('doda', [
      { id: 'm1', label: 'other', level: 'hide' },
      { id: 'm2', label: 'other', level: 'flag' },
      { id: 'm3', label: 'ses', level: 'none' },
      { id: 'm4', label: 'haken', level: 'flag' },
      { id: 'u1', label: 'unknown', level: 'hide' },
      ...agreements,
    ]);
    const items = reviewItems([run]);
    expect(items.slice(0, 5).map((item) => [item.judged.item.card.jobId, item.why])).toEqual([
      ['m1', '判定とラベルが合わない'],
      ['m2', '判定とラベルが合わない'],
      ['m3', '判定とラベルが合わない'],
      ['m4', '判定とラベルが合わない'],
      ['u1', 'ラベルが unknown'],
    ]);
    expect(items.slice(5)).toHaveLength(20);
    expect(items.slice(5).every((item) => item.why === '無作為に選んだ一致')).toBe(true);
    expect(reviewItems([run]).map((item) => item.judged.item.card.jobId)).toEqual(items.map((item) => item.judged.item.card.jobId));
  });
});

describe('renderReview', () => {
  it('numbers the items and shows the label, its evidence, and the verdict with its reasons', () => {
    const text = renderReview([makeRun('green', [{ id: '1', label: 'other', level: 'hide', reason: 'プライム案件' }])]);
    expect(text).toContain('## 1. 判定とラベルが合わない');
    expect(text).toContain('- **[green] 企業1** — 求人1（https://www.green-japan.com/company/9/job/1）');
    expect(text).toContain('- ラベル: other（claude）— 根拠: green 事業：記述1');
    expect(text).toContain('- 判定: ①隠す ②隠す ③隠す — 理由（③）: カードのルール：プライム案件（タイトル）「プライム案件」');
  });
});

describe('renderReport', () => {
  const run = makeRun('paiza', [
    { id: '1', label: 'ses', level: 'hide', reason: '還元率' },
    { id: '2', label: 'other', level: 'hide', reason: '商流' },
    { id: '3', label: 'ses', level: 'none' },
    { id: '4', label: 'other', level: 'flag', reason: '参画・案件' },
    { id: '5', label: 'unknown', level: 'none' },
  ]);
  const text = renderReport([run], { date: '2026-10-17', commit: 'abc1234' });

  it('shows the data, a table for each of the three conditions, and the totals', () => {
    expect(text).toContain('- コミット: abc1234（測ったときの HEAD）');
    // 数えなかったカードは、アダプタが読めなかったもの（1）と求人IDのないもの（1）の合計
    expect(text).toContain('| paiza | 1 | 5 | 2 | 0 | 2 | 1 | 2 | 2 |');
    expect(text).toContain('## ① カードだけ');
    expect(text).toContain('## ③ ふだんどおり');
    expect(text).toContain('| paiza | 2 | 50.0% | 50.0% | 0 | 0 | 1 | 1 | 0 |');
    expect(text).toContain('| 全体 | 2 | 50.0% | 50.0% | 0 | 0 | 1 | 1 | 0 |');
  });

  it('groups the wrong hides and flags by reason, and the misses by evidence', () => {
    expect(text).toContain('## 誤って隠したもの（対象外を隠した）\n\n### カードのルール：商流（タイトル）（1件）');
    expect(text).toContain('## 対象外を要確認にしたもの\n\n### カードのルール：参画・案件（タイトル）（1件）');
    expect(text).toContain('## 取りこぼし（対象なのに何もしなかった）\n\n### paiza 事業（1件）');
  });

  it('heads the holdout report and shows how many tuning jobs it left out', () => {
    const holdout = makeRun('paiza', [{ id: '1', label: 'ses', level: 'hide' }]);
    holdout.data.excluded = 2;
    const text = renderReport([holdout], { date: '2026-10-20', commit: 'abc1234', set: 'holdout' });
    expect(text).toContain('# 精度の評価（確かめ用の新しいページ）');
    expect(text).toContain('- 調整用の求人と重なって数えなかった求人: paiza 2 件');
    expect(renderReport([holdout], { date: '2026-10-20', commit: 'abc1234' })).not.toContain('重なって数えなかった');
  });
});

describe('renderCardSheet', () => {
  it('shows each card with its fields and detail text, but no verdict', () => {
    const run = makeRun('paiza', [{ id: '1', label: 'unknown', level: 'hide', reason: '還元率' }], ['1']);
    const sheet = renderCardSheet(run.data, run.labels);
    expect(sheet).toContain('## 1. 企業1 — 求人1');
    expect(sheet).toContain('- カードの文字: 求人1の本文');
    expect(sheet).toContain('- 詳細ページ: 詳細1');
    expect(sheet).not.toMatch(/隠す|要確認|還元率|①|②|③/);
  });

  it('puts the deciding paiza detail fields first and leaves out fields that cannot bear on the label', () => {
    const run = makeRun('paiza', [{ id: '1', label: 'unknown', level: 'none' }], ['1']);
    run.data.details.set('1', {
      jobId: '1',
      devContentsTypes: ['受託開発（社外常駐）', 'B2B'],
      employment: '正社員',
      fields: {
        location: '顧客先（東京都）',
        business: '■事業領域：人材派遣、SES',
        text: '給与(想定年収): 500万円\n勤務地: 顧客先（東京都）\n休日休暇: 土日祝\n配属部署: 客先常駐チーム\n給与体系・詳細: 無期雇用派遣として月給制\n雇用関係: 正社員',
      },
    });
    const sheet = renderCardSheet(run.data, run.labels);
    expect(sheet).toContain('- 詳細の開発内容タイプ: 受託開発（社外常駐）、B2B');
    expect(sheet).toContain('- 詳細の雇用関係: 正社員');
    expect(sheet).toContain('- 詳細の勤務地: 顧客先（東京都）');
    // 給与体系・詳細には「無期雇用派遣」のような雇用の形が書かれることがあるので残す
    expect(sheet).toContain(
      '- 詳細ページ（給与・休日・技術・選考などの欄は省く）: 勤務地: 顧客先（東京都） ／ 配属部署: 客先常駐チーム ／ 給与体系・詳細: 無期雇用派遣として月給制 ／ 雇用関係: 正社員',
    );
    expect(sheet).not.toContain('500万円');
    expect(sheet).not.toContain('土日祝');
    expect(sheet).toContain('- 詳細の会社の説明: ■事業領域：人材派遣、SES');
  });
});

describe('label definition', () => {
  it('points the report, the review and the labeling sheet to the label definition in docs/design.md', () => {
    const run = makeRun('paiza', [{ id: '1', label: 'ses', level: 'hide', reason: '還元率' }]);
    for (const text of [renderReport([run], { date: '2026-10-17', commit: 'abc1234' }), renderReview([run]), renderCardSheet(run.data, run.labels)]) {
      expect(text).toContain('`docs/design.md` の「ラベルの定義」');
      expect(text).not.toContain('docs/superpowers');
    }
  });
});

describe('summaryLines', () => {
  it('prints the warnings and one table per condition', () => {
    const run = makeRun('doda', [{ id: '1', label: 'ses', level: 'hide' }]);
    run.warnings.push('ラベルのない求人 1 件: 9');
    const lines = summaryLines([run]).join('\n');
    expect(lines).toContain('⚠ doda: ラベルのない求人 1 件: 9');
    expect(lines).toContain('① カードだけ');
    expect(lines).toContain('| doda | 1 | 100.0% | 100.0% |');
  });
});

describe('pickGreenDetails', () => {
  it('picks hidden, then flagged, then unknown jobs without a saved detail page, up to the limit', () => {
    const run = makeRun(
      'green',
      [
        { id: '1', label: 'other', level: 'none' },
        { id: '2', label: 'unknown', level: 'none' },
        { id: '3', label: 'ses', level: 'flag' },
        { id: '4', label: 'ses', level: 'hide' },
        { id: '5', label: 'ses', level: 'hide' },
      ],
      ['5'],
    );
    expect(pickGreenDetails(run)).toEqual(['/company/9/job/4', '/company/9/job/3', '/company/9/job/2']);
    expect(pickGreenDetails(run, 2)).toEqual(['/company/9/job/4', '/company/9/job/3']);
  });
});
