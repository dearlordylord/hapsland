/** Dedicated offline resident process for the security wire witness. */
import { appendFileSync } from "node:fs";
import nodeHttp from "node:http";
import nodeHttps from "node:https";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ResidentServer } from "../../src/resident/server.ts";
import { residentPaths } from "../../src/resident/paths.ts";
import { makeOfflineSecurityHttpClient } from "./security-wire-observer.ts";

const root = process.argv[2];
if (root === undefined || !root.startsWith("/")) throw new Error("fixture root required");
const runtime = residentPaths(join(root, "runtime"));
const journal = join(root, "wire-child-journal.jsonl");
const record = (value) => appendFileSync(journal, `${JSON.stringify(value)}\n`, { mode: 0o600 });
const denyNetwork = () => {
  record({ kind: "unexpectedNetworkAttempt" });
  throw new Error("offline resident forbids network HTTP");
};
globalThis.fetch = async () => denyNetwork();
nodeHttp.request = denyNetwork;
nodeHttp.get = denyNetwork;
nodeHttps.request = denyNetwork;
nodeHttps.get = denyNetwork;
const http = makeOfflineSecurityHttpClient((request) => record({ kind: "request", ...request }));
const server = new ResidentServer(runtime, undefined, {
  offlineHttpClient: http,
  dispatchAuthorityObserver: (observation) => record(observation),
  beforeEvaluate: async (unit) => {
    record({ kind: "prepared", path: unit.input.path, declaration: unit.input.declaration.name });
    await writeFile(join(root, "wire-prepared"), "ready\n");
    while (true) {
      try { await access(join(root, "wire-release")); break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 10)); }
    }
  },
});
await server.listen();
await writeFile(join(root, "wire-ready"), server.lifetime, { mode: 0o600 });
const stop = () => { void server.close().then(() => process.exit(0)); };
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
