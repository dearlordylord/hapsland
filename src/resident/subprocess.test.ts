import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptCodexAdd } from "../direct-event/adapter.ts";
import { addEvent, makeGitFixture, put, recipient } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import { acknowledgeAdvice, collectReady, residentRequest } from "./client.ts";
import { residentPaths } from "./paths.ts";

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
    await enable(root, statePath);
    const env = {
      ...process.env,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_STATE_PATH: statePath,
      REVIEW_RESIDENT_CONTROLLED: "1",
      REVIEW_RESIDENT_BACKEND_GATE_PATH: gate,
      REVIEW_RESIDENT_ADMISSION_RESPONSE_DELAY_MS: "1800",
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

    const observation = await Effect.runPromise(adaptCodexAdd(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const admissionScript = [
      "import * as Effect from 'effect/Effect';",
      "import { adaptCodexAdd } from './src/direct-event/adapter.ts';",
      "import { admitObservation } from './src/resident/client.ts';",
      `const event=${JSON.stringify(addEvent(root))};`,
      "const observation=await Effect.runPromise(adaptCodexAdd(event));",
      "try { await admitObservation(observation,true); console.log('ack'); }",
      "catch { console.log('timeout-uncertain'); }",
    ].join("");
    const admitting = spawn(process.execPath, ["--input-type=module", "-e", admissionScript], {
      cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    expect(await childResult(admitting)).toBe("timeout-uncertain");

    const paths = residentPaths(runtime);
    const owner = identities[0]!;
    for (let index = 0; index < 2; index++) {
      await residentRequest(paths, {
        version: 1,
        operation: "admit",
        lifetime: owner.lifetime,
        observation: { ...observation, recipient: { ...observation.recipient, toolUseId: `extra-${index}` } },
        controlledWriter: true,
      }, 50).catch(() => undefined);
    }
    const gated = await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: owner.lifetime });
      return stats.status === "stats" && stats.running === 2 && stats.queued === 1 ? stats : undefined;
    });
    expect(gated.retainedBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    await writeFile(gate, "release\n");
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: owner.lifetime });
      return stats.status === "stats" && stats.pendingAdvice === 3 ? stats : undefined;
    });

    expect(await collectReady(root, recipient({ agentId: "other-child" }), paths)).toBeUndefined();
    expect(await collectReady(otherRoot, recipient(), paths)).toBeUndefined();
    const advice = await collectReady(root, recipient({ turnId: "later", toolUseId: "bash" }), paths);
    expect(advice?.output.hookSpecificOutput.additionalContext).toContain("type.ts");
    if (advice !== undefined) await acknowledgeAdvice(advice);

    await put(root, "type.ts", "type ChangedAfterReview = string\n");
    expect(await collectReady(root, recipient({ turnId: "later-2", toolUseId: "bash-2" }), paths)).toBeUndefined();
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
    const observation = await Effect.runPromise(adaptCodexAdd(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const paths = residentPaths(runtime);
    expect((await residentRequest(paths, {
      version: 1, operation: "admit", lifetime: owner.lifetime, observation, controlledWriter: true,
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
    expect(await collectReady(root, recipient(), paths)).toBeUndefined();
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
    const observation = await Effect.runPromise(adaptCodexAdd(addEvent(root)));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const paths = residentPaths(runtime);
    expect((await residentRequest(paths, {
      version: 1, operation: "admit", lifetime: owner.lifetime, observation, controlledWriter: true,
    })).status).toBe("accepted");
    await put(root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    await writeFile(gate, "release\n");
    await waitFor(async () => {
      const stats = await residentRequest(paths, { version: 1, operation: "stats", lifetime: owner.lifetime });
      return stats.status === "stats" && stats.running === 0 ? stats : undefined;
    });
    expect(existsSync(capturePath)).toBe(false);
    expect(await collectReady(root, recipient(), paths)).toBeUndefined();
  });
});
