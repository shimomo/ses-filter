import { defineContentScript } from 'wxt/utils/define-content-script';
import { runContentScript } from '../src/core/runtime';
import { paizaAdapter } from '../src/sites/paiza';

export default defineContentScript({
  matches: ['https://paiza.jp/*'],
  runAt: 'document_end',
  main(ctx) {
    runContentScript(ctx, paizaAdapter);
  },
});
