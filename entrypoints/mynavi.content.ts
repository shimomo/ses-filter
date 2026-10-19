import { defineContentScript } from 'wxt/utils/define-content-script';
import { runContentScript } from '../src/core/runtime';
import { mynaviAdapter } from '../src/sites/mynavi';

export default defineContentScript({
  matches: ['https://tenshoku.mynavi.jp/*'],
  runAt: 'document_end',
  main(ctx) {
    runContentScript(ctx, mynaviAdapter);
  },
});
