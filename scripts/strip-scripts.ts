// Usage: node scripts/strip-scripts.ts <file.html>... — script・noscript・iframe 要素をファイルから取り除く（上書き）
import { readFileSync, writeFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  const html = readFileSync(file, 'utf8');
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  writeFileSync(file, stripped);
  console.log(`${file}: ${html.length} -> ${stripped.length} chars`);
}
