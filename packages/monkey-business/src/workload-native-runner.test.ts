import { existsSync } from "node:fs";
import { vi, expect, it, beforeEach } from "vitest";
const spawn = vi.hoisted(() => vi.fn());
const preflight = vi.hoisted(() => ({
  capture: vi.fn(() => ({
    root: "/tmp/owned-output-bound-fixture.bend",
    graph: { entries: [], sha256: "graph" },
    inputs: {
      tools: { bend: { path: "/mock/bend" }, clang: { path: "/mock/clang" } },
      host: { platform: "test", architecture: "test", release: "test" },
      flags: {},
      base: "/mock/base.bend",
    },
  })),
  assert: vi.fn(),
  validate: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawnSync: spawn }));
vi.mock("../../monkey-business-bend/conformance/native-preflight.mjs", () => ({
  NATIVE_C_EMISSION_TIMEOUT_MS: 30000,
  NATIVE_CLANG_TIMEOUT_MS: 30000,
  assertNativeFixtureIdentity: preflight.assert,
  captureNativeFixtureIdentity: preflight.capture,
  validateNativeFixture: preflight.validate,
}));
import { runWorkloadNative, runWorkloadEmitted } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";

beforeEach(() => { spawn.mockReset(); preflight.capture.mockClear(); preflight.assert.mockClear(); preflight.validate.mockClear(); });

it("bounds every fresh native phase to 16MiB and keeps the phase timeouts", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" });
  expect(runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toEqual([0]);
  expect(spawn.mock.calls).toHaveLength(3);
  expect(spawn.mock.calls.map(call => { const { env, ...options } = call[2]; return options; })).toEqual([30000, 30000, 5000].map(timeout => ({
    encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024,
  })));
  expect(spawn.mock.calls[0]?.[2].env.BEND_NO_TELEMETRY).toBe("1");
  expect(spawn.mock.calls[0]?.[0]).toBe("/mock/bend");
  expect(spawn.mock.calls[1]?.[0]).toBe("/mock/clang");
  expect(preflight.capture).toHaveBeenCalledTimes(1);
  expect(preflight.assert).toHaveBeenCalledTimes(2);
  const binary = spawn.mock.calls[2]?.[0];
  if (typeof binary !== "string") throw new Error("native binary path unavailable");
  expect(existsSync(binary.slice(0, binary.lastIndexOf("/")))).toBe(false);
});

it("rejects an identity drift before executing the fresh binary", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" });
  preflight.assert.mockImplementationOnce(() => {
    throw new Error("Native workload rejected: source inputs changed during the direct native workload; refusing mixed-source artifact");
  });
  expect(() => runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend")))
    .toThrow("refusing mixed-source artifact");
  expect(spawn.mock.calls).toHaveLength(2);
  const source = spawn.mock.calls[0]?.[1]?.[2];
  if (typeof source !== "string") throw new Error("native source path unavailable");
  expect(existsSync(source.slice(0, source.lastIndexOf("/")))).toBe(false);
});

it("pins the compiler and bounds fresh emitted JavaScript", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" });
  expect(runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toEqual([0]);
  expect(spawn.mock.calls).toHaveLength(2);
  expect(spawn.mock.calls[0]?.[0]).toBe("/mock/bend");
  expect(spawn.mock.calls[0]?.[2].env.BEND_NO_TELEMETRY).toBe("1");
  expect(spawn.mock.calls.map(call => call[2].timeout)).toEqual([15000, 5000]);
  expect(preflight.capture).toHaveBeenCalledTimes(1);
  expect(preflight.assert).toHaveBeenCalledTimes(2);
});

it("rejects emitted identity drift before executing generated JavaScript", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" });
  preflight.assert.mockImplementationOnce(() => {
    throw new Error("Native workload rejected: source inputs changed during the direct native workload; refusing mixed-source artifact");
  });
  expect(() => runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend")))
    .toThrow("refusing mixed-source artifact");
  expect(spawn.mock.calls).toHaveLength(1);
  const source = spawn.mock.calls[0]?.[1]?.[2];
  if (typeof source !== "string") throw new Error("emitted source path unavailable");
  expect(existsSync(source.slice(0, source.lastIndexOf("/")))).toBe(false);
});

it("rejects emitted identity drift after executing generated JavaScript", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" });
  preflight.assert.mockImplementationOnce(() => undefined).mockImplementationOnce(() => {
    throw new Error("Native workload rejected: source inputs changed during the direct native workload; refusing mixed-source artifact");
  });
  expect(() => runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend")))
    .toThrow("refusing mixed-source artifact");
  expect(spawn.mock.calls).toHaveLength(2);
  const program = spawn.mock.calls[1]?.[1]?.[0];
  if (typeof program !== "string") throw new Error("emitted program path unavailable");
  expect(existsSync(program.slice(0, program.lastIndexOf("/")))).toBe(false);
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


it("allows an explicit bounded C allowance without changing clang or execution defaults", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" });
  expect(runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"), { emissionTimeoutMs: 45000 })).toEqual([0]);
  expect(spawn.mock.calls.map(call => call[2].timeout)).toEqual([45000, 30000, 5000]);
});

it.each([0, -1, 45001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid C allowance %s before any spawn", emissionTimeoutMs => {
  expect(() => runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"), { emissionTimeoutMs })).toThrow("invalid native C emission timeout");
  expect(spawn).not.toHaveBeenCalled();
  expect(preflight.capture).not.toHaveBeenCalled();
});

it("rejects a C override for a fixed preflight session before validation or spawn", () => {
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_MANIFEST", "/tmp/manifest.json");
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_SESSION", "session");
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256", "hash");
  try {
    const fixture = new URL("../../monkey-business-bend/conformance/permit-scenario.bend", import.meta.url);
    expect(() => runWorkloadNative(fixture, { emissionTimeoutMs: 45000 })).toThrow("preflight session fixes the C emission timeout");
    expect(preflight.validate).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});

it("identifies the failed C phase and declared allowance without retrying", () => {
  spawn.mockReturnValue({ status: null, error: { code: "ETIMEDOUT" }, stdout: "", stderr: "" });
  expect(() => runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"), { emissionTimeoutMs: 45000 }))
    .toThrow(/C emission \(declared timeout 45000ms\).*ETIMEDOUT/);
  expect(spawn).toHaveBeenCalledTimes(1);
});
