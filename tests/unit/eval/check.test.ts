import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findPageProblems } from '../../../eval/lib/check';
import { fixturePath, hasFixture } from '../../helpers/fixtures';

describe('findPageProblems', () => {
  it.each([
    ['<article data-ses-filter="collapsed"><ses-filter-bar></ses-filter-bar></article>', '拡張機能の印（data-ses-filter、ses-filter-*、古い版の data-ses-sieve、ses-sieve-*）'],
    ['<article data-ses-sieve="collapsed"><ses-sieve-bar></ses-sieve-bar></article>', '拡張機能の印（data-ses-filter、ses-filter-*、古い版の data-ses-sieve、ses-sieve-*）'],
    ['<div class="header_userNameWrapper"><p>山田 太郎 さん</p></div>', 'ログイン中の名前の欄'],
    ['<a href="/mypage/settings">登録情報設定</a>', 'ログイン中のメニュー（登録情報設定）'],
    ['<span class="jobCard-viewedBadge__text">閲覧済</span>', '閲覧済みの印'],
    ['<h3>あなたの閲覧履歴をもとにしたおすすめの求人</h3>', '閲覧履歴にもとづく欄'],
    ['<script src="a.js"></script>', 'スクリプト（scripts/strip-scripts.ts で取り除く）'],
  ])('finds %s', (html, problem) => {
    expect(findPageProblems(`<html><body>${html}</body></html>`)).toEqual([problem]);
  });

  for (const [site, name] of [
    ['paiza', 'list'],
    ['paiza', 'detail'],
    ['green', 'search'],
    ['doda', 'list'],
  ] as const) {
    it.skipIf(!hasFixture(site, name))(`passes the clean fixture ${site}/${name}`, () => {
      const file = fixturePath(site, name);
      if (!file) throw new Error(`fixture ${site}/${name} is missing`);
      expect(findPageProblems(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }
});
