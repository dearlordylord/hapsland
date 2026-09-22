import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ResidentIpcError,
  ensureResident,
  residentRequest,
  type EnsureResidentDependencies,
} from "./client.ts";
import {
  prepareResidentDirectory,
  residentPaths,
  validateEndpointMetadata,
} from "./paths.ts";

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
  it("uses one absolute readiness deadline and caps every operation to remaining time", async () => {
    const paths = residentPaths("/not-used");
    let clock = 0;
    let launched = 0;
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
      launch: () => { launched += 1; },
      wait: async (milliseconds) => { clock += milliseconds; },
    };
    await expect(ensureResident(paths, 10_000, dependencies)).rejects.toThrow(
      "resident did not become ready within 10 seconds",
    );
    expect(clock).toBe(10_000);
    expect(launched).toBe(1);
    expect(probeBudgets.every((budget) => budget > 0 && budget <= 250)).toBe(true);
    expect(probeBudgets.at(-1)).toBeLessThanOrEqual(250);
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
    await expect(residentRequest(paths, { version: 1, operation: "hello" }, 500)).rejects.toThrow(
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
    await expect(residentRequest(paths, { version: 1, operation: "hello" }, 500)).rejects.toThrow(
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
      version: 1,
      operation: "collect",
      lifetime: "lifetime",
      root: "/tmp/root",
      recipient: {
        host: "codex-cli",
        hostVersion: "0.155.1",
        sessionId: "session",
        turnId: "turn",
        toolUseId: "tool",
        agentId: null,
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
});
