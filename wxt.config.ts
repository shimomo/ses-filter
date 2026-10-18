import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'SES フィルター',
    description: 'エンジニア求人サイトの検索結果で、SES・派遣の求人を理由つきで畳む拡張機能',
    permissions: ['storage'],
  },
  // WSL では WXT がブラウザを起動しないため、.output/chrome-mv3-dev を手で読み込む（README の「開発」を参照）
  webExt: { disabled: true },
});
