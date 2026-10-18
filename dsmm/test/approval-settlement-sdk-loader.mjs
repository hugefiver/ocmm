import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = createRequire(new URL('../package.json', import.meta.url));
const anchors = [new URL('../package.json', import.meta.url).href, pathToFileURL(root.resolve('@deepseek-ai/dsh-api-session-controller')).href];
const gatewayEntry = pathToFileURL(root.resolve('@deepseek-ai/dsh-api-gateway')).href;
const folders = { 'dsh-user-approval': 'approval', 'dsh-api-gateway': 'gateway', 'dsh-api-remotes': 'remotes', 'dsh-client-ui-approval': 'ui' };
const patched = process.env.DSMM_APPROVAL_SDK_DIR;
const permissionSdk = process.env.DSMM_PERMISSION_SDK_DIR;
const installed = new Map();
if (patched && process.env.DSMM_APPROVAL_INSTALLED === '1') {
  const local = createRequire(resolve(patched, 'package.json'));
  for (const name of Object.keys(folders)) for (const tail of ['', '/package.json', '/client', '/types', '/stream-protocol']) {
    const specifier = `@deepseek-ai/${name}${tail}`;
    try { installed.set(specifier, pathToFileURL(local.resolve(specifier)).href); } catch {}
  }
}
const { transformSync } = root('esbuild');
registerHooks({ resolve(specifier, context, next) {
  if (permissionSdk) {
    for (const name of ['web', 'subagent']) {
      if (specifier === `@deepseek-ai/dsh-${name}`) return { url: pathToFileURL(resolve(permissionSdk, name, 'lib/index.js')).href, shortCircuit: true };
      if (specifier === `@deepseek-ai/dsh-${name}/package.json`) return { url: pathToFileURL(resolve(permissionSdk, name, 'package.json')).href, shortCircuit: true };
    }
  }
  if (patched && specifier.startsWith('@deepseek-ai/')) {
    if (installed.has(specifier)) return { url: installed.get(specifier), shortCircuit: true };
    const [name, ...rest] = specifier.slice('@deepseek-ai/'.length).split('/');
    if (folders[name]) {
      const tail = rest.join('/');
      const entry = tail === 'client' ? 'lib/client.node.js' : tail === 'package.json' ? tail
        : tail === 'stream-protocol' ? 'lib/types/stream-protocol.js' : tail === 'types' ? 'lib/types/types.js' : !tail ? 'lib/index.js' : undefined;
      if (entry) return { url: pathToFileURL(resolve(patched, folders[name], entry)).href, shortCircuit: true };
    }
  }
  if (specifier.endsWith('.js') && context.parentURL?.includes('/dsmm/src/')) {
    try { return next(specifier.replace(/\.js$/, '.ts'), context); } catch {}
  }
  try { return next(specifier, context); }
  catch (error) {
    if (specifier === 'ws') return next(specifier, { ...context, parentURL: gatewayEntry });
    if (!specifier.startsWith('@deepseek-ai/')) throw error;
    for (const parentURL of anchors) { try { return next(specifier, { ...context, parentURL }); } catch {} }
    throw error;
  }
}, load(url, context, next) {
  if (url.includes('/dsmm/src/') && /\.tsx?$/u.test(url)) return { format: 'module', shortCircuit: true,
    source: transformSync(readFileSync(fileURLToPath(url), 'utf8'), { loader: url.endsWith('.tsx') ? 'tsx' : 'ts', format: 'esm', target: 'es2022' }).code };
  return next(url, context);
} });
