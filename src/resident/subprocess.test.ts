import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import { addEvent, makeGitFixture, put, recipient } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import { acknowledgeAdvice, collectReady, residentRequest } from "./client.ts";
import { residentPaths } from "./paths.ts";
import { DELIVERY_LEASE_MS, type ResidentDispatchContext } from "./protocol.ts";

const processes: Array<number> = [];
const directories: Array<string> = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  for (const pid of processes.splice(0)) {
    try { process.kill(pid, "SIGTERM"); } catch { /* already stopped */ }
  }
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

const childResult = (child: ChildProcessWithoutNullStreams) => new Promise<string>((resolve, reject) => {
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
});

const childClosed = (child: ChildProcessWithoutNullStreams): Promise<void> =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise((resolve) => child.once("close", () => resolve()));

const waitFor = async <A>(read: () => Promise<A | undefined>, milliseconds = 5_000): Promise<A> => {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition did not become ready");
};

const enable = (root: string, statePath: string) => Effect.runPromise(Effect.gen(function* () {
  const consent = yield* Consent.Service;
  const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
  yield* consent.enable(proposal);
}).pipe(Effect.provide(Consent.layer({ statePath }))));

const answers = Object.fromEntries(configuredRules.map((rule) => [
  rule.id,
  { _tag: "Probability", probability: 0.9 },
]));

const dispatchFor = (
  statePath: string,
  options: { readonly capturePath?: string } = {},
): ResidentDispatchContext => ({
  statePath,
  userConfigPath: null,
  credential: null,
  controlled: {
    answers,
    ...(options.capturePath === undefined ? {} : { capturePath: options.capturePath }),
  },
});

describe("resident separate-process lifecycle", { timeout: 45_000 }, () => {
  it("converges 100 starters across eight clients and keeps timed-out/disconnected work resident-owned", async () => {
    const root = await makeGitFixture();
    const otherRoot = await makeGitFixture();
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-test-"));
    directories.push(root, otherRoot, temporary);
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(temporary, "consent");
    const runtime = join(temporary, "runtime");
    const gate = join(temporary, "backend.gate");
    const acceptedPath = join(temporary, "admission.accepted");
    const collectGate = join(temporary, "collect-response");
    const collectDisconnected = join(temporary, "collect-disconnected");
    const ackGate = join(temporary, "ack-response");
    const clockPath = join(temporary, "clock");
    await writeFile(clockPath, "100\n");
    await enable(root, statePath);
    const env = {
      ...process.env,
      REVIEW_RESIDENT_DIR: runtime,
      // Deliberately wrong: per-request dispatch context, not first-launch
      // environment, owns configuration and consent lookup.
      REVIEW_STATE_PATH: join(temporary, "wrong-launch-consent"),
      REVIEW_RESIDENT_CONTROLLED: "1",
      REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
      REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH: acceptedPath,
      REVIEW_RESIDENT_ADMIT_RESPONSE_GATE_PATH: join(temporary, "admit-response"),
      REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH: collectGate,
      REVIEW_RESIDENT_COLLECT_DISCONNECT_PATH: collectDisconnected,
      REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH: ackGate,
      REVIEW_RESIDENT_CLOCK_PATH: clockPath,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers }),
    };
    const ensureScript = [
      "import { ensureResident } from './src/resident/client.ts';",
      "const count=Number(process.argv[1]);",
      "const values=await Promise.all(Array.from({length:count},()=>ensureResident()));",
      "console.log(JSON.stringify(values));",
    ].join("");
    // This retains the accepted prototype stress shape at the production
    // process boundary: exactly 100 concurrent callers distributed over eight
    // otherwise independent short-lived command clients.
    const starters = Array.from({ length: 8 }, (_, index) => spawn(process.execPath, [
      "--input-type=module", "-e", ensureScript, index < 4 ? "13" : "12",
    ], { cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"] }));
    const owners = await Promise.all(starters.map(childResult));
    const identities = owners.flatMap((encoded) => JSON.parse(encoded) as Array<{ pid: number; lifetime: string }>);
    expect(identities).toHaveLength(100);
    expect(new Set(identities.map(({ pid }) => pid)).size).toBe(1);
    expect(new Set(identities.map(({ lifetime }) => lifetime)).size).toBe(1);
    processes.push(identities[0]!.pid);

    // Losing the pathname is not evidence that the lock owner died. A stale
    // endpoint cannot make a contender displace that still-live owner, and
    // the readiness attempt remains bounded.
    const liveSocket = `${residentPaths(runtime).socket}.live`;
    await rename(residentPaths(runtime).socket, liveSocket);
    const staleScript = [
      "import {createServer} from 'node:net';",
      "import {chmodSync} from 'node:fs';",
      `const path=${JSON.stringify(residentPaths(runtime).socket)};`,
      "const server=createServer();server.listen(path,()=>{chmodSync(path,0o600);console.log('ready')});",
    ].join("");
    const stale = spawn(process.execPath, ["--input-type=module", "-e", staleScript], {
      cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      stale.once("error", reject);
      stale.stdout.once("data", () => resolve());
    });
    const staleClosed = childClosed(stale);
    stale.kill("SIGKILL");
    await staleClosed;
    const boundedScript = [
      "import {ensureResident} from './src/resident/client.ts';",
      `const paths=${JSON.stringify(residentPaths(runtime))};`,
      "await ensureResident(paths,250);",
    ].join("");
    const bounded = spawn(process.execPath, ["--input-type=module", "-e", boundedScript], {
      cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    const readinessStarted = performance.now();
    await expect(childResult(bounded)).rejects.toThrow();
    expect(performance.now() - readinessStarted).toBeLessThan(2_000);
    expect(() => process.kill(identities[0]!.pid, 0)).not.toThrow();
    await rm(residentPaths(runtime).socket, { force: true });
    await rename(liveSocket, residentPaths(runtime).socket);

    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const admissionScript = [
      "import * as Effect from 'effect/Effect';",
      "import {connect} from 'node:net';",
      "import { adaptCodexDirectEvent } from './src/direct-event/adapter.ts';",
      `const event=${JSON.stringify(addEvent(root))};`,
      `const dispatch=${JSON.stringify(dispatchFor(statePath))};`,
      `const socketPath=${JSON.stringify(residentPaths(runtime).socket)};`,
      `const lifetime=${JSON.stringify(identities[0]!.lifetime)};`,
      "const observation=await Effect.runPromise(adaptCodexDirectEvent(event));",
      "const socket=connect(socketPath);",
      "socket.once('connect',()=>socket.write(JSON.stringify({version:1,operation:'admit',lifetime,observation,controlledWriter:true,dispatch})+'\\n',()=>process.exit(0)));",
    ].join("");
    const admitGate = env.REVIEW_RESIDENT_ADMIT_RESPONSE_GATE_PATH;
    await writeFile(`${admitGate}.enabled`, "enabled\n");
    const admitting = spawn(process.execPath, ["--input-type=module", "-e", admissionScript], {
      cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    await waitFor(async () => existsSync(acceptedPath) ? true : undefined);
    await waitFor(async () => existsSync(`${admitGate}.entered`) ? true : undefined);
    const admissionClosed = childClosed(admitting);
    admitting.kill("SIGKILL");
    await admissionClosed;

    const paths = residentPaths(runtime);
    const owner = identities[0]!;
    const dispatch: ResidentDispatchContext = {
      ...dispatchFor(statePath),
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
        ])),
      },
    };
    for (let index = 0; index < 2; index++) {
      await expect(residentRequest(paths, {
        version: 1,
        operation: "admit",
        lifetime: owner.lifetime,
        observation: { ...observation, recipient: { ...observation.recipient, toolUseId: `extra-${index}` } },
        controlledWriter: true,
        dispatch,
      }, 50)).rejects.toThrow("outcome is uncertain");
    }
    await writeFile(`${admitGate}.release`, "release\n");
    const gated = await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: owner.lifetime });
      // The first prompt lone item is a complete finite cycle. Arrivals after
      // its dispatch wait for the next cycle and cannot extend it.
      return stats.status === "stats" && stats.running === 1 && stats.queued === 2 ? stats : undefined;
    });
    expect(gated.retainedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    await writeFile(gate, "release\n");
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: owner.lifetime });
      // Event/tool ids do not distinguish complete evaluation identity: the
      // three accepted observations converge on one evaluation and advice.
      return stats.status === "stats" && stats.pendingAdvice === 1 ? stats : undefined;
    });

    expect(await collectReady(root, recipient({ agentId: "other-child" }), dispatch, paths)).toBeUndefined();
    expect(await collectReady(otherRoot, recipient(), dispatch, paths)).toBeUndefined();
    await writeFile(`${collectGate}.enabled`, "enabled\n");
    const disconnectScript = [
      "import {collectReady} from './src/resident/client.ts';",
      `const root=${JSON.stringify(root)};`,
      `const recipient=${JSON.stringify(recipient({ turnId: "later", toolUseId: "disconnect" }))};`,
      `const dispatch=${JSON.stringify(dispatch)};`,
      `const paths=${JSON.stringify(paths)};`,
      "await collectReady(root,recipient,dispatch,paths);",
    ].join("");
    const disconnecting = spawn(process.execPath, ["--input-type=module", "-e", disconnectScript], {
      cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    await waitFor(async () => existsSync(`${collectGate}.entered`) ? true : undefined);
    const disconnected = childClosed(disconnecting);
    disconnecting.kill("SIGKILL");
    await disconnected;
    await waitFor(async () => existsSync(collectDisconnected) ? true : undefined);
    await writeFile(`${collectGate}.release`, "release\n");
    const advice = await waitFor(() => collectReady(
      root,
      recipient({ turnId: "later", toolUseId: "bash" }),
      dispatch,
      paths,
    ), 10_000);
    expect(advice?.output.hookSpecificOutput.additionalContext).toContain("type.ts");
    if (advice === undefined) return;

    await writeFile(`${ackGate}.enabled`, "enabled\n");
    const ackScript = [
      "import {acknowledgeAdvice} from './src/resident/client.ts';",
      `const advice=${JSON.stringify(advice)};`,
      "await acknowledgeAdvice(advice);",
    ].join("");
    const acknowledging = spawn(process.execPath, ["--input-type=module", "-e", ackScript], {
      cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    await waitFor(async () => existsSync(`${ackGate}.entered`) ? true : undefined);
    const acknowledgementClosed = childClosed(acknowledging);
    acknowledging.kill("SIGKILL");
    await writeFile(`${ackGate}.release`, "release\n");
    await acknowledgementClosed;
    await writeFile(clockPath, `${100 + DELIVERY_LEASE_MS}\n`);
    const reclaimed = await collectReady(
      root,
      recipient({ turnId: "later", toolUseId: "after-ack-failure" }),
      dispatch,
      paths,
    );
    expect(reclaimed).toBeDefined();
    if (reclaimed !== undefined) expect(await acknowledgeAdvice(reclaimed)).toBe(true);

    await put(root, "type.ts", "type ChangedAfterReview = string\n");
    expect(await collectReady(root, recipient({ turnId: "later-2", toolUseId: "bash-2" }), dispatch, paths)).toBeUndefined();
  });

  it("rechecks consent after admission and before backend dispatch", async () => {
    const root = await makeGitFixture();
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-revoke-"));
    directories.push(root, temporary);
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(temporary, "consent");
    const runtime = join(temporary, "runtime");
    const gate = join(temporary, "backend.gate");
    const capturePath = join(temporary, "backend-called");
    await enable(root, statePath);
    const env = {
      ...process.env,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_CONTROLLED: "1",
      REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers, capturePath }),
    };
    const script = "import {ensureResident} from './src/resident/client.ts'; console.log(JSON.stringify(await ensureResident()));";
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    const owner = JSON.parse(await childResult(child)) as { pid: number; lifetime: string };
    processes.push(owner.pid);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const paths = residentPaths(runtime);
    const dispatch = dispatchFor(statePath, { capturePath });
    expect((await residentRequest(paths, {
      version: 1, operation: "admit", lifetime: owner.lifetime, observation, controlledWriter: true, dispatch,
    })).status).toBe("accepted");
    await Effect.runPromise(Effect.gen(function* () {
      const consent = yield* Consent.Service;
      yield* consent.disable(root, "jev", "https://api.typesafe.ai/v1/systemone");
    }).pipe(Effect.provide(Consent.layer({ statePath }))));
    await writeFile(gate, "release\n");
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: owner.lifetime });
      return stats.status === "stats" && stats.running === 0 ? stats : undefined;
    });
    expect(existsSync(capturePath)).toBe(false);
    expect(await collectReady(root, recipient(), dispatch, paths)).toBeUndefined();
    expect(JSON.parse(await readFile(paths.owner, "utf8"))).toMatchObject({ pid: owner.pid });
  });

  it("loads current configuration at dispatch rather than freezing admission config", async () => {
    const root = await makeGitFixture();
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-config-"));
    directories.push(root, temporary);
    await put(root, "type.ts", "type OrderCount = number\n");
    const statePath = join(temporary, "consent");
    const runtime = join(temporary, "runtime");
    const gate = join(temporary, "backend.gate");
    const capturePath = join(temporary, "backend-called");
    await enable(root, statePath);
    const env = {
      ...process.env,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_CONTROLLED: "1",
      REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers, capturePath }),
    };
    const script = "import {ensureResident} from './src/resident/client.ts'; console.log(JSON.stringify(await ensureResident()));";
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    const owner = JSON.parse(await childResult(child)) as { pid: number; lifetime: string };
    processes.push(owner.pid);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const paths = residentPaths(runtime);
    const dispatch = dispatchFor(statePath, { capturePath });
    expect((await residentRequest(paths, {
      version: 1, operation: "admit", lifetime: owner.lifetime, observation, controlledWriter: true, dispatch,
    })).status).toBe("accepted");
    await put(root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    await writeFile(gate, "release\n");
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: owner.lifetime });
      return stats.status === "stats" && stats.running === 0 ? stats : undefined;
    });
    expect(existsSync(capturePath)).toBe(false);
    expect(await collectReady(root, recipient(), dispatch, paths)).toBeUndefined();
  });

  it("kills one lifetime, rejects obsolete messages, restarts empty, and cleans up only when idle", async () => {
    const root = await makeGitFixture();
    const temporary = await mkdtemp(join(tmpdir(), "product-resident-restart-"));
    const otherRoot = join(temporary, "other-worktree");
    directories.push(root, temporary);
    await put(root, "type.ts", "type OrderCount = number\n");
    await put(root, "second.ts", "type CustomerCount = number\n");
    await execFileAsync("git", ["-C", root, "add", "type.ts", "second.ts"]);
    await execFileAsync("git", ["-C", root, "commit", "-qm", "resident lifecycle fixture"]);
    await execFileAsync("git", ["-C", root, "worktree", "add", "--detach", otherRoot, "HEAD"]);

    const statePath = join(temporary, "consent");
    const runtime = join(temporary, "runtime");
    const backendGate = join(temporary, "backend.gate");
    await enable(root, statePath);
    await enable(otherRoot, statePath);
    await writeFile(backendGate, "release\n");
    const env = {
      ...process.env,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_RESIDENT_BACKEND_GATE_PATH: backendGate,
    };
    const ensureScript = "import {ensureResident} from './src/resident/client.ts'; console.log(JSON.stringify(await ensureResident()));";
    const start = async () => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", ensureScript], {
        cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
      });
      return JSON.parse(await childResult(child)) as { pid: number; lifetime: string };
    };
    const paths = residentPaths(runtime);
    const dispatch: ResidentDispatchContext = {
      ...dispatchFor(statePath),
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
        ])),
      },
    };
    const failingDispatch: ResidentDispatchContext = {
      ...dispatch,
      controlled: { failure: "fixture backend unavailable" },
    };
    const observe = async (
      targetRoot: string,
      pathsInEvent: ReadonlyArray<string>,
      overrides: Readonly<Record<string, unknown>> = {},
    ) => {
      const adapted = await Effect.runPromise(adaptCodexDirectEvent(addEvent(targetRoot, pathsInEvent, overrides)));
      expect(adapted).toBeDefined();
      if (adapted === undefined) throw new Error("fixture did not adapt");
      return adapted;
    };

    const first = await start();
    processes.push(first.pid);
    const rootObservation = await observe(root, ["type.ts"]);
    expect((await residentRequest(paths, {
      version: 1, operation: "admit", lifetime: first.lifetime,
      observation: rootObservation, controlledWriter: true, dispatch,
    })).status).toBe("accepted");
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: first.lifetime });
      return stats.status === "stats" && stats.pendingAdvice === 1 && stats.successfulCacheEntries === 1
        ? stats
        : undefined;
    });
    // An equivalent completed input joins the retained advice/cache identity.
    expect((await residentRequest(paths, {
      version: 1, operation: "admit", lifetime: first.lifetime,
      observation: { ...rootObservation, recipient: { ...rootObservation.recipient, toolUseId: "joined" } },
      controlledWriter: true, dispatch,
    })).status).toBe("accepted");
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: first.lifetime });
      return stats.status === "stats" && stats.running === 0 && stats.queued === 0 ? stats : undefined;
    });

    const noticeObservation = await observe(root, ["type.ts"], { agent_id: "notice-child" });
    for (const toolUseId of ["notice-1", "notice-2"]) {
      expect((await residentRequest(paths, {
        version: 1, operation: "admit", lifetime: first.lifetime,
        observation: { ...noticeObservation, recipient: { ...noticeObservation.recipient, toolUseId } },
        controlledWriter: true, dispatch: failingDispatch,
      })).status).toBe("accepted");
    }
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: first.lifetime });
      return stats.status === "stats" && stats.running === 0 && stats.noticeCooldowns === 1
        ? stats
        : undefined;
    });
    expect((await residentRequest(paths, {
      version: 1, operation: "cleanup", lifetime: first.lifetime,
    })).status).toBe("busy");

    // Accepted work remains resident-owned with no client callback. Cleanup
    // refuses it, and killing the actual owner is the explicit loss boundary.
    await rm(backendGate, { force: true });
    const blockedObservation = await observe(root, ["second.ts"], { tool_use_id: "blocked-before-kill" });
    expect((await residentRequest(paths, {
      version: 1, operation: "admit", lifetime: first.lifetime,
      observation: blockedObservation, controlledWriter: true, dispatch,
    })).status).toBe("accepted");
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: first.lifetime });
      return stats.status === "stats" && stats.running > 0 ? stats : undefined;
    });
    expect((await residentRequest(paths, {
      version: 1, operation: "cleanup", lifetime: first.lifetime,
    })).status).toBe("busy");
    expect((await readdir(runtime)).sort()).toEqual(["owner.json", "owner.lock", "resident.sock"]);
    process.kill(first.pid, "SIGKILL");
    await waitFor(async () => {
      try { process.kill(first.pid, 0); return undefined; } catch { return true; }
    });

    await writeFile(backendGate, "release\n");
    const second = await start();
    processes.push(second.pid);
    expect(second.lifetime).not.toBe(first.lifetime);
    expect((await residentRequest(paths, {
      version: 1, operation: "admit", lifetime: first.lifetime,
      observation: blockedObservation, controlledWriter: true, dispatch,
    })).status).toBe("obsolete-lifetime");
    expect(await residentRequest(paths, {
      version: 1, operation: "stats", lifetime: second.lifetime,
    })).toMatchObject({
      status: "stats",
      queued: 0,
      running: 0,
      pendingAdvice: 0,
      retainedBytes: 0,
      successfulCacheEntries: 0,
      pendingEvaluations: 0,
      noticeCooldowns: 0,
      currentWork: 0,
    });
    expect(await collectReady(root, recipient(), dispatch, paths)).toBeUndefined();

    // One two-unit batch, one child partition, and one distinct existing Git
    // worktree travel through the new process. Revocation after admission keeps
    // the other worktree from dispatching and cannot leak its advice.
    const batch = await observe(root, ["type.ts", "second.ts"], { tool_use_id: "batch" });
    const child = await observe(root, ["type.ts"], { agent_id: "child-2", tool_use_id: "child" });
    const other = await observe(otherRoot, ["type.ts"], { tool_use_id: "other-worktree" });
    await rm(backendGate, { force: true });
    for (const observation of [batch, { ...batch, recipient: { ...batch.recipient, toolUseId: "batch-join" } }, child, other]) {
      expect((await residentRequest(paths, {
        version: 1, operation: "admit", lifetime: second.lifetime,
        observation, controlledWriter: true, dispatch,
      })).status).toBe("accepted");
    }
    await Effect.runPromise(Effect.gen(function* () {
      const consent = yield* Consent.Service;
      yield* consent.disable(otherRoot, "jev", "https://api.typesafe.ai/v1/systemone");
    }).pipe(Effect.provide(Consent.layer({ statePath }))));
    await writeFile(backendGate, "release\n");
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: second.lifetime });
      return stats.status === "stats" && stats.running === 0 && stats.queued === 0 && stats.pendingAdvice === 3
        ? stats
        : undefined;
    });
    expect(await collectReady(otherRoot, recipient(), dispatch, paths)).toBeUndefined();
    const rootBatch = await collectReady(root, recipient({ turnId: "collect", toolUseId: "batch" }), dispatch, paths);
    expect(rootBatch?.output.hookSpecificOutput.additionalContext).toContain("type.ts");
    expect(rootBatch?.output.hookSpecificOutput.additionalContext).toContain("second.ts");
    if (rootBatch === undefined) return;
    expect((await residentRequest(paths, {
      version: 1, operation: "cleanup", lifetime: second.lifetime,
    })).status).toBe("busy");
    expect(await acknowledgeAdvice(rootBatch)).toBe(true);
    expect((await residentRequest(paths, {
      version: 1, operation: "admit", lifetime: second.lifetime,
      observation: { ...batch, recipient: { ...batch.recipient, toolUseId: "cache-reuse" } },
      controlledWriter: true, dispatch,
    })).status).toBe("accepted");
    const cachedBatch = await waitFor(() => collectReady(
      root,
      recipient({ turnId: "collect-cache", toolUseId: "cache-reuse" }),
      dispatch,
      paths,
    ));
    expect(cachedBatch.output.hookSpecificOutput.additionalContext).toContain("type.ts");
    expect(cachedBatch.output.hookSpecificOutput.additionalContext).toContain("second.ts");
    expect(await acknowledgeAdvice(cachedBatch)).toBe(true);
    const childAdvice = await collectReady(
      root,
      recipient({ agentId: "child-2", turnId: "collect", toolUseId: "child" }),
      dispatch,
      paths,
    );
    expect(childAdvice).toBeDefined();
    if (childAdvice !== undefined) expect(await acknowledgeAdvice(childAdvice)).toBe(true);

    const beforeCleanup = await residentRequest(paths, {
      version: 1, operation: "stats", lifetime: second.lifetime,
    });
    expect(beforeCleanup).toMatchObject({ status: "stats", pendingAdvice: 0 });
    if (beforeCleanup.status === "stats") expect(beforeCleanup.successfulCacheEntries).toBeGreaterThan(0);
    expect((await residentRequest(paths, {
      version: 1, operation: "cleanup", lifetime: second.lifetime,
    })).status).toBe("cleaned");
    await waitFor(async () => {
      try { process.kill(second.pid, 0); return undefined; } catch { return true; }
    });

    const third = await start();
    processes.push(third.pid);
    expect(third.lifetime).not.toBe(second.lifetime);
    expect(await residentRequest(paths, {
      version: 1, operation: "stats", lifetime: third.lifetime,
    })).toMatchObject({
      status: "stats", queued: 0, running: 0, pendingAdvice: 0,
      retainedBytes: 0, successfulCacheEntries: 0, noticeCooldowns: 0,
    });
  });
});
