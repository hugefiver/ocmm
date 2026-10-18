import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import * as Bootstrap from '@dsmm/dsmm/history-support';

const require = createRequire(import.meta.url);
const web = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'));
const { WebServer } = await import(pathToFileURL(web.resolve('@deepseek-ai/dsh-host-webserver')));

test('independent history bootstrap reaches native index before Client initialization despite a failed Core', { timeout: 15000 }, async () => {
  assert.equal(typeof Bootstrap.apply, 'function');
  const ctx = new Context();
  try {
    await ctx.plugin(Bootstrap).await();
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }).await();
    const failed = ctx.plugin({ name: 'unavailable-core', apply() { throw new Error('synthetic Core unavailable'); } });
    await assert.rejects(failed.await());
    const server = ctx.get('webServer');
    const stop = server.registerFallback((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(server.renderIndex('<!doctype html><html><head><script>globalThis.clientRequired = globalThis.__DSMM_HISTORY_REQUIRED__ === true</script></head><body></body></html>'));
    });
    try {
      const response = await fetch(server.getOrigin());
      assert.equal(response.status, 200);
      const page = vm.createContext({ Promise });
      for (const script of (await response.text()).matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script[1], page);
      await page.__DSH_BOOT_READY__.promise;
      assert.equal(page.clientRequired, true);
      assert.equal(page.__DSMM_HISTORY_REQUIRED__, true);
    } finally { stop(); }
  } finally { await ctx.fiber.dispose(); }
});
