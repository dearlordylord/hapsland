import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ResidentIpcError,
  ensureResident,
  admitTicketedObservation,
  collectOutcome,
  residentRequest,
  type EnsureResidentDependencies,
} from "./client.ts";
import {
  prepareResidentDirectory,
  residentPaths,
  validateEndpointMetadata,
} from "./paths.ts";
import type { DirectObservation } from "../direct-event/model.ts";

const directories: Array<string> = [];
const servers: Array<Server> = [];
const sockets: Array<Socket> = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const socket of sockets.splice(0)) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("resident client trust boundary", () => {
  it("pins Claude collection to its admitting owner without a ticket-wide terminal outcome", async () => {
    const directory = await mkdtemp(join(tmpdir(), "resident-ticket-client-"));
    directories.push(directory);
    await chmod(directory, 0o700);
    const paths = residentPaths(directory);
    const observation: DirectObservation = {
      root: "/tmp/root",
      rootIdentity: { rootDevice: "1", rootInode: "2", gitDirectory: "/tmp/root/.git", gitDevice: "1", gitInode: "3" },
      advicee: { host: "claude-code", hostVersion: "2.1.218", sessionId: "session", turnId: null, toolUseId: "tool", subagentId: null },
      candidates: [{ operation: "add", path: "/tmp/root/type.ts", addedLines: ["type A = number"] }],
    };
    const dispatch = { statePath: "/tmp/state", userConfigPath: null, credential: null, controlled: {} };
    const requests: Array<Record<string, unknown>> = [];
    const outcomes: Array<Record<string, unknown>> = [
      { version: 1, status: "pending" },
      { version: 1, status: "advice", token: "lease", findingCount: 1, output: {
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "review advice" },
      } },
      { version: 1, status: "empty" },
      { version: 1, status: "unavailable", reason: "stale" },
      { status: "empty" }, // old resident response cannot prove clear
    ];
    const server = createServer((socket) => {
      sockets.push(socket);
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString("utf8")) as Record<string, unknown>;
        requests.push(request);
        const response = request.operation === "hello"
          ? { version: 1, status: "ready", lifetime: "original-owner", pid: 12 }
          : request.operation === "admit"
            ? { version: 1, status: "accepted", ticket: { nonce: "ticket", lifetime: "original-owner" } }
            : outcomes.shift();
        socket.end(`${JSON.stringify(response)}\n`);
      });
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(paths.socket, resolve);
    });
    await chmod(paths.socket, 0o600);
    const accepted = await admitTicketedObservation(observation, dispatch, paths);
    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted") return;
    expect(await collectOutcome(accepted.admission)).toEqual({ status: "pending" });
    expect(await collectOutcome(accepted.admission)).toEqual({ status: "advice", advice: {
      output: { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "review advice" } },
      token: "lease", lifetime: "original-owner", paths, root: observation.root,
      advicee: observation.advicee, activityPath: undefined, findingCount: 1,
    } });
    expect(await collectOutcome(accepted.admission)).toEqual({ status: "empty" });
    expect(await collectOutcome(accepted.admission)).toEqual({ status: "unavailable", reason: "stale" });
    expect(await collectOutcome(accepted.admission)).toEqual({ status: "unavailable", reason: "lost" });
    expect(requests.map((request) => request.operation)).toEqual([
      "hello", "admit", "collect", "collect", "collect", "collect", "collect",
    ]);
    expect(requests.slice(2).every((request) =>
      request.version === 1 && request.lifetime === "original-owner" &&
      JSON.stringify(request.ticket) === JSON.stringify({ nonce: "ticket", lifetime: "original-owner" })
    )).toBe(true);
  });
  it("uses one absolute readiness deadline and caps every operation to remaining time", async () => {
    const paths = residentPaths("/not-used");
    let clock = 0;
    const launchCalls: Array<{ readonly at: number; readonly budget: number }> = [];
    const probeBudgets: Array<number> = [];
    const dependencies: EnsureResidentDependencies = {
      now: () => clock,
      prepare: async (_paths, timeoutMs) => {
        expect(timeoutMs).toBe(10_000);
        clock += 100;
      },
      probe: async (_paths, timeoutMs) => {
        probeBudgets.push(timeoutMs);
        clock += timeoutMs;
        throw new ResidentIpcError("not ready");
      },
      launch: (_paths, timeoutMs) => { launchCalls.push({ at: clock, budget: timeoutMs }); },
      wait: async (milliseconds) => { clock += milliseconds; },
    };
    await expect(ensureResident(paths, 10_000, dependencies)).rejects.toThrow(
      "resident did not become ready within 10 seconds",
    );
    expect(clock).toBe(10_000);
    expect(launchCalls.length).toBeGreaterThan(1);
    expect(launchCalls.every(({ at, budget }) => at < 10_000 && budget === 10_000 - at)).toBe(true);
    expect(probeBudgets.every((budget) => budget > 0 && budget <= 250)).toBe(true);
    expect(probeBudgets.at(-1)).toBeLessThanOrEqual(250);
  });

  it("retries owner acquisition after a losing owner exits within the same deadline", async () => {
    const paths = residentPaths("/not-used");
    let clock = 0;
    let launchCount = 0;
    let endpointReady = false;
    let ownerPresent = true;
    const calls: Array<{ readonly operation: string; readonly at: number; readonly budget: number }> = [];
    const dependencies: EnsureResidentDependencies = {
      now: () => clock,
      prepare: async (_paths, timeoutMs) => {
        calls.push({ operation: "prepare", at: clock, budget: timeoutMs });
      },
      probe: async (_paths, timeoutMs) => {
        calls.push({ operation: "probe", at: clock, budget: timeoutMs });
        clock += Math.min(100, timeoutMs);
        if (endpointReady) return { status: "ready", lifetime: "second-owner", pid: 42 };
        throw new ResidentIpcError("not ready");
      },
      launch: (_paths, timeoutMs) => {
        calls.push({ operation: "launch", at: clock, budget: timeoutMs });
        launchCount += 1;
        if (!ownerPresent) endpointReady = true;
      },
      wait: async (milliseconds) => {
        calls.push({ operation: "wait", at: clock, budget: milliseconds });
        clock += milliseconds;
        ownerPresent = false;
      },
    };

    await expect(ensureResident(paths, 10_000, dependencies)).resolves.toEqual({
      status: "ready",
      lifetime: "second-owner",
      pid: 42,
    });
    expect(launchCount).toBe(2);
    expect(clock).toBeGreaterThanOrEqual(350);
    expect(calls.every(({ at, budget }) => at < 10_000 && budget > 0 && budget <= 10_000 - at)).toBe(true);
  });

  it("rejects wrong ownership, unsafe mode, symlinks, and wrong endpoint types", () => {
    const uid = typeof process.getuid === "function" ? process.getuid() : process.pid;
    const safe = { uid, mode: 0o140600, isDirectory: false, isSocket: true, isFile: false, isSymbolicLink: false };
    expect(validateEndpointMetadata(safe, "socket", uid)).toBe(true);
    expect(validateEndpointMetadata({ ...safe, uid: uid + 1 }, "socket", uid)).toBe(false);
    expect(validateEndpointMetadata({ ...safe, mode: 0o140666 }, "socket", uid)).toBe(false);
    expect(validateEndpointMetadata({ ...safe, isSymbolicLink: true }, "socket", uid)).toBe(false);
    expect(validateEndpointMetadata({ ...safe, isSocket: false, isFile: true }, "socket", uid)).toBe(false);
  });

  it("rejects a precreated symlink runtime directory", async () => {
    const parent = await mkdtemp(join(tmpdir(), "resident-symlink-test-"));
    const target = await mkdtemp(join(tmpdir(), "resident-symlink-target-"));
    directories.push(parent, target);
    const link = join(parent, "runtime");
    await symlink(target, link);
    await expect(prepareResidentDirectory(residentPaths(link))).rejects.toThrow("private user-owned");
  });

  it.each([
    ["malformed", "not-json\n"],
    ["forged extra context", '{"status":"ready","lifetime":"fake","pid":1,"context":{"injected":true}}\n'],
    ["wrong field type", '{"status":"ready","lifetime":"fake","pid":"1"}\n'],
    ["invalid IPC version", '{"version":null,"status":"empty"}\n'],
  ])("schema-rejects %s server responses", async (_label, response) => {
    const directory = await mkdtemp(join(tmpdir(), "resident-response-test-"));
    directories.push(directory);
    await chmod(directory, 0o700);
    const paths = residentPaths(directory);
    const server = createServer((socket) => socket.end(response));
    server.on("connection", (socket) => sockets.push(socket));
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(paths.socket, resolve);
    });
    await chmod(paths.socket, 0o600);
    await expect(residentRequest(paths, { requestRoute: "shared", operation: "hello" }, 500)).rejects.toThrow(
      "resident response was invalid",
    );
  });

  it("rejects a precreated permissive endpoint before accepting its context", async () => {
    const directory = await mkdtemp(join(tmpdir(), "resident-attacker-endpoint-"));
    directories.push(directory);
    await chmod(directory, 0o700);
    const paths = residentPaths(directory);
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      socket.end('{"status":"ready","lifetime":"forged","pid":1}\n');
    });
    server.on("connection", (socket) => sockets.push(socket));
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(paths.socket, resolve);
    });
    await chmod(paths.socket, 0o666);
    await expect(residentRequest(paths, { requestRoute: "shared", operation: "hello" }, 500)).rejects.toThrow(
      "private user-owned socket",
    );
    expect(connections).toBe(0);
  });

  it("bounds a collect response when the connected server never responds", async () => {
    const directory = await mkdtemp(join(tmpdir(), "resident-timeout-test-"));
    directories.push(directory);
    await chmod(directory, 0o700);
    const paths = residentPaths(directory);
    const server = createServer(() => undefined);
    server.on("connection", (socket) => sockets.push(socket));
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(paths.socket, resolve);
    });
    await chmod(paths.socket, 0o600);
    await expect(residentRequest(paths, {
      requestRoute: "shared",
      operation: "collect",
      lifetime: "lifetime",
      root: "/tmp/root",
      advicee: {
        host: "codex-cli",
        hostVersion: "0.155.1",
        sessionId: "session",
        turnId: "turn",
        toolUseId: "tool",
        subagentId: null,
      },
      dispatch: {
        statePath: "/tmp/consent",
        userConfigPath: null,
        credential: null,
        controlled: {},
      },
    }, 20)).rejects.toThrow(
      "deadline exceeded",
    );
  });

  it("rejects an oversized request before writing advicee-bearing bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "resident-oversized-request-"));
    directories.push(directory);
    await chmod(directory, 0o700);
    const paths = residentPaths(directory);
    let received = 0;
    const server = createServer((socket) => socket.on("data", (chunk) => {
      received += typeof chunk === "string" ? Buffer.byteLength(chunk, "utf8") : chunk.byteLength;
    }));
    server.on("connection", (socket) => sockets.push(socket));
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(paths.socket, resolve);
    });
    await chmod(paths.socket, 0o600);
    await expect(residentRequest(paths, {
      requestRoute: "shared",
      operation: "collect",
      lifetime: "lifetime",
      root: "/tmp/root",
      advicee: {
        host: "codex-cli",
        hostVersion: "0.155.1",
        sessionId: "session",
        turnId: "turn",
        toolUseId: "tool",
        subagentId: null,
      },
      dispatch: {
        statePath: "/tmp/consent",
        userConfigPath: null,
        credential: {
          name: "JEV_API_KEY",
          environmentValue: "x".repeat(300_000),
          environmentOnly: true,
          generation: 0,
          statePath: "/tmp/credential-state",
        },
        controlled: null,
      },
    }, 500)).rejects.toThrow("request exceeded frame bound");
    expect(received).toBe(0);
  });
});
