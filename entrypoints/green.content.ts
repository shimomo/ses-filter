import { defineContentScript } from 'wxt/utils/define-content-script';
import { runContentScript } from '../src/core/runtime';
import { greenAdapter } from '../src/sites/green';

export default defineContentScript({
  matches: ['https://www.green-japan.com/*'],
  runAt: 'document_end',
  main(ctx) {
    runContentScript(ctx, greenAdapter);
  },
});
