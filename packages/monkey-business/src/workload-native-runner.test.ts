import { existsSync } from "node:fs";
import { vi, expect, it, beforeEach } from "vitest";
const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawnSync: spawn }));
import { runWorkloadNative } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";

beforeEach(() => { spawn.mockReset(); });
it("bounds every fresh native phase to 16MiB and keeps the phase timeouts", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" });
  expect(runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toEqual([0]);
  expect(spawn.mock.calls).toHaveLength(3);
  expect(spawn.mock.calls.map(call => call[2])).toEqual([5000, 15000, 5000].map(timeout => ({
    encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024,
  })));
  const binary = spawn.mock.calls[2]?.[0];
  if (typeof binary !== "string") throw new Error("native binary path unavailable");
  expect(existsSync(binary.slice(0, binary.lastIndexOf("/")))).toBe(false);
});
it("reports a bounded-output failure and cleans the fresh directory", () => {
  spawn.mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
    .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
    .mockReturnValueOnce({ status: null, error: { code: "ENOBUFS" }, stdout: "", stderr: "" });
  expect(() => runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow("ENOBUFS");
  const binary = spawn.mock.calls[2]?.[0];
  if (typeof binary !== "string") throw new Error("native binary path unavailable");
  expect(existsSync(binary.slice(0, binary.lastIndexOf("/")))).toBe(false);
});
