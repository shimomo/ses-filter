// Usage: node scripts/check-pages.ts <file.html>... — 保存したページに、拡張機能の印・ログイン中の表示・閲覧の記録・スクリプトがないか確かめる
import { readFileSync } from 'node:fs';
import { findPageProblems } from '../eval/lib/check.ts';

let bad = 0;
for (const file of process.argv.slice(2)) {
  const problems = findPageProblems(readFileSync(file, 'utf8'));
  if (problems.length > 0) {
    bad += 1;
    console.log(`NG ${file}: ${problems.join('、')}`);
  } else {
    console.log(`OK ${file}`);
  }
}
process.exitCode = bad > 0 ? 1 : 0;
