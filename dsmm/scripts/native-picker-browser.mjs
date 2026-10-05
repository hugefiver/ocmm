import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { bootstrapFacade, carrierBootstrap, createBootGraph } from "./profile-ui-harness-browser.mjs";

export const PICKER_COMPOSITION_ID = "@dsmm/native-picker-owned-diagnostic";
export const PICKER_ENTRY_PACKAGES = Object.freeze(["@deepseek-ai/dsh-client-ui-model-selection", "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-layout"]);

/** Walk exact published client metadata; cycles are prefetch edges, not activation order. */
export async function nativePickerClosure(nativeRequire) {
  const declarations = new Map();
  const visit = async (id) => {
    if (declarations.has(id)) return;
    const manifest = JSON.parse(await readFile(nativeRequire.resolve(`${id}/package.json`), "utf8"));
    assert.equal(manifest.version, "0.2.0-rc.2");
    assert.ok(manifest.dsh?.client, `${id} has no native client metadata`);
    declarations.set(id, manifest.dsh.client);
    for (const dependency of manifest.dsh.client.inject ?? []) await visit(dependency);
  };
  for (const id of PICKER_ENTRY_PACKAGES) await visit(id);
  return declarations;
}

/** Native Layout, Conversation and ModelSelect own every visual/slot contribution. */
export function pickerCompositionBundle() {
  return `window.__ModuleLoader__.load({id:${JSON.stringify(PICKER_COMPOSITION_ID)},factory(require){
    const {installConnection}=require('@deepseek-ai/dsh-client-connection/client');
    const {LocaleRuntime}=require('@deepseek-ai/dsh-client-locale/client');
    return {inject:['slots'],apply(ctx){
      installConnection(ctx,{transport:{rpc:window.__dsmmOwnedCarrier,ownsHost:true}});
      const locale=new LocaleRuntime(ctx,undefined,{languages:['en'],preference:'en'});
      ctx.provide('locale',locale);ctx.slots.installLocale(locale);
      window.__dsmmUiContext=ctx;
    }};
  }});`;
}

/** Approved diagnostic-only public DSMM method forwarding; no vendor bundle rewrite. */
export function pickerObserverTraceBootstrap() {
  return `(()=>{
    window.__dsmmObserverAttachmentTrace=[];
    const loader=window.__ModuleLoader__,load=loader.load;
    loader.load=function(row){
      if(row.id!=='@dsmm/dsmm')return Reflect.apply(load,this,[row]);
      const factory=row.factory;
      return Reflect.apply(load,this,[{...row,factory:function(...args){
        const exports=Reflect.apply(factory,this,args);
        const prototype=exports.ProfilesController?.prototype;
        for(const method of ['attachModelSelectionSource','attachModelEventSource','attachModelInteractionSource']){
          const original=prototype?.[method];
          if(typeof original!=='function'){window.__dsmmObserverAttachmentTrace.push({method,available:false});continue;}
          prototype[method]=function(...args){
            const [sessionId,source]=args;let snapshot,readFailure;
            try{snapshot=source?.getSnapshot();}catch(error){readFailure=String(error);}
            window.__dsmmObserverAttachmentTrace.push({method,sessionId,present:source!=null,snapshotDefined:snapshot!==undefined,status:snapshot?.status,readFailure});
            return Reflect.apply(original,this,args);
          };
        }
        return exports;
      }}]);
    };
  })();`;
}

export async function startNativePickerServer({ nativeRequire, packageRoot, revision, dsmm, observerTrace = false }) {
  const frontend = await realpath(join(dirname(nativeRequire.resolve("@deepseek-ai/dsh-web-frontend/package.json")), "dist"));
  const assets = await readdir(join(frontend, "assets"));
  const main = assets.filter((name) => /^index-.*\.js$/u.test(name));
  assert.equal(main.length, 1);
  const declarations = await nativePickerClosure(nativeRequire);
  declarations.set("@deepseek-ai/dsh-client-modules", {});
  const bundles = new Map();
  const rows = [];
  for (const [id, declaration] of declarations) {
    const url = `/bundles/native-${rows.length}.js`;
    bundles.set(url, await readFile(nativeRequire.resolve(`${id}/client`)));
    const inject = [...(declaration.inject ?? [])];
    if (id === "@deepseek-ai/dsh-api-gateway") inject.push(PICKER_COMPOSITION_ID);
    rows.push({ id, url, inject, external: declaration.external ?? [] });
  }
  bundles.set("/bundles/owned-carrier.js", Buffer.from(pickerCompositionBundle()));
  rows.push({ id: PICKER_COMPOSITION_ID, url: "/bundles/owned-carrier.js", inject: ["@deepseek-ai/dsh-client-ui-renderer"], external: ["@deepseek-ai/dsh-client-connection/client", "@deepseek-ai/dsh-client-locale/client"] });
  if (dsmm) {
    bundles.set("/bundles/dsmm.js", await readFile(join(packageRoot, "lib", "client.js")));
    const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")).dsh.client;
    rows.push({ id: "@dsmm/dsmm", url: "/bundles/dsmm.js", inject: [...metadata.inject, PICKER_COMPOSITION_ID], external: metadata.external ?? [] });
  }
  const graph = createBootGraph(rows, revision);
  const styles = assets.filter((name) => /^(?:index|vendor)-.*\.css$/u.test(name));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Owned native model picker diagnosis</title><link rel="icon" href="/native/favicon.svg">${styles.map((name) => `<link rel="stylesheet" href="/native/assets/${name}">`).join("")}<script>${bootstrapFacade()}${observerTrace ? pickerObserverTraceBootstrap() : ""}${carrierBootstrap()}window.__DSH_BOOT__=${JSON.stringify(graph).replaceAll("<", "\\u003c")};</script>${rows.map(({ url }) => `<script src="${url}"></script>`).join("")}</head><body><div id="root"></div><script type="module" src="/native/assets/${main[0]}"></script></body></html>`;
  const errors = [];
  const mime = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method !== "GET") { response.writeHead(405).end(); return; }
      if (url.pathname === "/") { response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }).end(html); return; }
      if (bundles.has(url.pathname)) { response.writeHead(200, { "content-type": mime[extname(url.pathname)], "cache-control": "no-store" }).end(bundles.get(url.pathname)); return; }
      if (url.pathname.startsWith("/native/")) {
        const target = await realpath(resolve(frontend, decodeURIComponent(url.pathname.slice(8))));
        const child = relative(frontend, target);
        assert.ok(child !== "" && !child.startsWith("..") && !isAbsolute(child));
        response.writeHead(200, { "content-type": mime[extname(target)] ?? "application/octet-stream" }).end(await readFile(target)); return;
      }
      response.writeHead(404).end();
    })().catch((error) => { errors.push(error.message); if (!response.headersSent) response.writeHead(500); response.end(); });
  });
  await new Promise((settle, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", settle); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { origin: `http://127.0.0.1:${address.port}`, errors, nativePackages: [...declarations.keys()], rewrittenProductionBundles: false,
    async close() { server.closeAllConnections(); await new Promise((settle, reject) => server.close((error) => error ? reject(error) : settle())); } };
}
