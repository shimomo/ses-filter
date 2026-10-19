import { defineContentScript } from 'wxt/utils/define-content-script';
import { runContentScript } from '../src/core/runtime';
import { rikunabiAdapter } from '../src/sites/rikunabi';

export default defineContentScript({
  matches: ['https://next.rikunabi.com/*'],
  runAt: 'document_end',
  main(ctx) {
    runContentScript(ctx, rikunabiAdapter);
  },
});
