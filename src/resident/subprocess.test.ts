import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import { addEvent, makeGitFixture, put, recipient } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import { acknowledgeAdvice, collectReady, residentRequest } from "./client.ts";
import { residentPaths } from "./paths.ts";
import { DELIVERY_LEASE_MS, type ResidentDispatchContext } from "./protocol.ts";

const processes: Array<number> = [];
const directories: Array<string> = [];

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

describe("resident separate-process lifecycle", { timeout: 30_000 }, () => {
  it("converges concurrent starters and keeps timed-out client work resident-owned", async () => {
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
      REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH: collectGate,
      REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH: ackGate,
      REVIEW_RESIDENT_CLOCK_PATH: clockPath,
      REVIEW_CONTROL_JSON: JSON.stringify({ answers }),
    };
    const ensureScript = [
      "import { ensureResident } from './src/resident/client.ts';",
      "const value = await ensureResident();",
      "console.log(JSON.stringify(value));",
    ].join("");
    const starters = Array.from({ length: 8 }, () => spawn(process.execPath, [
      "--input-type=module", "-e", ensureScript,
    ], { cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"] }));
    const owners = await Promise.all(starters.map(childResult));
    const identities = owners.map((encoded) => JSON.parse(encoded) as { pid: number; lifetime: string });
    expect(new Set(identities.map(({ pid }) => pid)).size).toBe(1);
    expect(new Set(identities.map(({ lifetime }) => lifetime)).size).toBe(1);
    processes.push(identities[0]!.pid);

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
    const admitting = spawn(process.execPath, ["--input-type=module", "-e", admissionScript], {
      cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    expect(await childResult(admitting)).toBe("");
    await waitFor(async () => existsSync(acceptedPath) ? true : undefined);

    const paths = residentPaths(runtime);
    const owner = identities[0]!;
    const dispatch = dispatchFor(statePath);
    for (let index = 0; index < 2; index++) {
      await residentRequest(paths, {
        version: 1,
        operation: "admit",
        lifetime: owner.lifetime,
        observation: { ...observation, recipient: { ...observation.recipient, toolUseId: `extra-${index}` } },
        controlledWriter: true,
        dispatch,
      }, 50).catch(() => undefined);
    }
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
    const disconnected = new Promise<void>((resolve) => disconnecting.once("close", () => resolve()));
    disconnecting.kill("SIGKILL");
    await writeFile(`${collectGate}.release`, "release\n");
    await disconnected;
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
    const acknowledgementClosed = new Promise<void>((resolve) => acknowledging.once("close", () => resolve()));
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
});
