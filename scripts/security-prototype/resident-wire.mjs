/** Offline resident wire witness. Run with node --experimental-strip-types. */
import { createHash } from "node:crypto";
import nodeHttp from "node:http";
import nodeHttps from "node:https";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { adaptCodexDirectEvent } from "../../src/direct-event/adapter.ts";
import { makeGitFixture, put, updateEvent } from "../../src/direct-event/test-fixtures.ts";
import { DEFAULT_DESTINATION } from "../../src/runtime/review-config.ts";
import { residentRequest } from "../../src/resident/client.ts";
import { residentPaths } from "../../src/resident/paths.ts";
import { ResidentServer } from "../../src/resident/server.ts";
import { makeOfflineSecurityHttpClient, securityWireManifest, securityWireRule } from "./security-wire-observer.ts";

const scenario = process.argv[process.argv.indexOf("--scenario") + 1];
if (!["allowed", "exclude-at-dispatch", "exclude-at-admission"].includes(scenario)) {
  throw new Error("use --scenario allowed|exclude-at-dispatch|exclude-at-admission");
}

const manifest = securityWireManifest;
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const path = manifest.positive.path;
const oracleRule = securityWireRule;
const events = [];
const requests = [];
const authorityObservations = [];
const authorityOrder = [];
let failure;
const denyNetwork = () => {
  failure = "unexpected network HTTP attempt";
  event("unexpectedNetworkAttempt", { source: "production" });
  throw new Error("offline wire witness forbids network HTTP");
};
globalThis.fetch = async () => denyNetwork();
nodeHttp.request = denyNetwork;
nodeHttp.get = denyNetwork;
nodeHttps.request = denyNetwork;
nodeHttps.get = denyNetwork;
let release;
let prepared;
const held = new Promise((resolve) => { release = resolve; });
const reachedPrepare = new Promise((resolve) => { prepared = resolve; });
const event = (kind, fields = {}) => events.push({ kind, jobId: "job-1", ...fields });
const http = makeOfflineSecurityHttpClient((record) => {
  requests.push(record);
  authorityOrder.push({ kind: "request", path });
  event("request", { ...record, repoId: "fixture-repo", path, destination: DEFAULT_DESTINATION, source: "production" });
  if (record.classification === "forbidden") failure = "encoded request differed from independent oracle";
});
let root;
let server;
try {
  root = await makeGitFixture();
  await put(root, path, manifest.positive.source);
  await put(root, "rules.jsonc", JSON.stringify({
    schemaVersion: 2, id: "security-probe", contentVersion: "1",
    rules: [{ ...oracleRule, reviewTargets: [{ artifactKind: "typeShape",
      inputContract: "direct-event/type-shape/v2",
      capabilities: ["root-declaration", "resolved-outbound-types"] }] }],
  }));
  const config = { version: 1, packs: [{ id: "noul", enabled: false }, "rules.jsonc"] };
  if (scenario === "exclude-at-admission") config.excludes = [path];
  await put(root, ".review.jsonc", JSON.stringify(config));
  const statePath = join(root, "consent");
  event("fixtureAuthority", {
    phase: "admission", repoId: "fixture-repo", path,
    destination: DEFAULT_DESTINATION, policyRevision: scenario === "exclude-at-admission" ? "excluded" : "initial",
    source: "fixture",
  });
  const observation = await Effect.runPromise(adaptCodexDirectEvent(
    updateEvent(root, path, [manifest.positive.root]),
  ));
  if (observation === undefined) throw new Error("fixture observation failed");
  const paths = residentPaths(join(root, "runtime"));
  server = new ResidentServer(paths, undefined, {
    offlineHttpClient: http,
    dispatchAuthorityObserver: (record) => {
      authorityObservations.push(record);
      authorityOrder.push({ kind: "dispatchAuthority", path: record.path, sequence: record.sequence });
    },
    beforeEvaluate: async (unit) => {
      event("prepared", {
        repoId: "fixture-repo", path: unit.input.path,
        declaration: unit.input.declaration.name,
        sourceSha256: sha256(unit.input.declaration.source), source: "production",
      });
      prepared();
      await held;
    },
  });
  await server.listen();
  const dispatch = {
    statePath, userConfigPath: null,
    credential: {
      name: "TYPESAFE_API_KEY", environmentValue: "WIRE_KEY_SENTINEL",
      environmentOnly: true, generation: 0, statePath: join(root, "credential-state"),
    },
    controlled: null,
  };
  const admit = await residentRequest(paths, {
    version: 1, operation: "admit", lifetime: server.lifetime,
    observation, controlledWriter: true, dispatch,
  });
  event("admit", { status: admit.status, repoId: "fixture-repo", path, source: "production" });
  if (admit.status !== "accepted") throw new Error(`resident rejected fixture: ${admit.status}`);
  if (scenario !== "exclude-at-admission") await reachedPrepare;
  if (scenario === "exclude-at-dispatch") {
    await put(root, ".review.jsonc", JSON.stringify({ ...config, excludes: [path] }));
    event("fixtureAuthority", {
      phase: "dispatch", repoId: "fixture-repo", path, destination: DEFAULT_DESTINATION,
      policyRevision: "excluded", source: "fixture",
    });
  } else {
    event("fixtureAuthority", {
      phase: "dispatch", repoId: "fixture-repo", path, destination: DEFAULT_DESTINATION,
      policyRevision: scenario === "allowed" ? "initial" : "excluded",
      source: "fixture",
    });
  }
  release();
  await server.whenIdle();
  event("settled", { repoId: "fixture-repo", path, source: "production" });
  const expectedCount = scenario === "allowed" ? 1 : 0;
  if (requests.length !== expectedCount) failure = `expected ${expectedCount} request(s), observed ${requests.length}`;
  if (requests.some((request) => request.classification !== "allowed")) failure = "forbidden request observed";
  if (events.some((entry) => entry.kind === "prepared" && entry.path !== path)) failure = "unexpected prepared path";
  const expectedAuthorityCount = scenario === "exclude-at-admission" ? 0 : 1;
  if (authorityObservations.length !== expectedAuthorityCount) failure = "resident authority observation count mismatch";
  const authority = authorityObservations[0];
  if (authority !== undefined) {
    const expectedSelection = scenario === "allowed";
    if (authority.path !== path || authority.sequence !== 1 ||
        !/^[a-f0-9]{64}$/.test(authority.evaluationId) ||
        !/^[a-f0-9]{64}$/.test(authority.policyDigest) ||
        authority.selected !== expectedSelection ||
        authority.decision !== (expectedSelection ? "allow" : "deny") ||
        authority.admission !== (expectedSelection ? "admitReview" : "refuseSelection") ||
        authority.physicalRootVerified !== true ||
        !/^[a-f0-9]{64}$/.test(authority.expectedRootIdentitySha256) ||
        authority.credentialStatus !== "present" || authority.credentialGeneration !== 0) {
      failure = "resident authority observation mismatch";
    }
  }
  const orderKinds = authorityOrder.map((entry) => entry.kind);
  if (JSON.stringify(orderKinds) !== JSON.stringify(
    scenario === "allowed" ? ["dispatchAuthority", "request"]
      : scenario === "exclude-at-dispatch" ? ["dispatchAuthority"] : [],
  )) failure = "resident authority/request ordering mismatch";
  if (authorityOrder.some((entry) => entry.path !== path)) failure = "authority/request path mismatch";
  process.stdout.write(`${JSON.stringify({ version: 1, scenario, events, requests, authorityObservations, authorityOrder, verdict: failure ?? "pass" })}\n`);
  if (failure !== undefined) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`resident wire fixture failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  if (server !== undefined) await server.close();
  if (root !== undefined) await rm(root, { recursive: true, force: true });
}
