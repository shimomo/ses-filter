import { defineContentScript } from 'wxt/utils/define-content-script';
import { runContentScript } from '../src/core/runtime';
import { dodaAdapter } from '../src/sites/doda';

export default defineContentScript({
  matches: ['https://doda.jp/*'],
  runAt: 'document_end',
  main(ctx) {
    runContentScript(ctx, dodaAdapter);
  },
});
