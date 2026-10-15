import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

/** Installed only in disposable consumer processes; never in prepare or the test parent. */
export function installColdProfileNetworkGuard({ blockSubprocesses = false } = {}) {
  const attempts = [], listeners = [];
  const deny = operation => () => {
    attempts.push(operation);
    throw new Error(`Cold-profile consumer forbids ${operation}`);
  };
  net.Socket.prototype.connect = deny("net.connect");
  tls.connect = deny("tls.connect");
  const lookup = dns.lookup;
  dns.lookup = (host, ...args) => host === "127.0.0.1" || host === "::1" ? lookup(host, ...args) : deny("dns.lookup")();
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    const host = typeof args[0] === "object" ? args[0].host : typeof args[1] === "string" ? args[1] : args[2];
    if (host !== "127.0.0.1" && host !== "::1") return deny("non-loopback listen")();
    listeners.push(host);
    return listen.apply(this, args);
  };
  http.request = deny("http.request"); http.get = deny("http.get");
  https.request = deny("https.request"); https.get = deny("https.get");
  globalThis.fetch = deny("fetch");
  if (blockSubprocesses) for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) childProcess[name] = deny(`child_process.${name}`);
  syncBuiltinESMExports();
  return { attempts, listeners };
}
