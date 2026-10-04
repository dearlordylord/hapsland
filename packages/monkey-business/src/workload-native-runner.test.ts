import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
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


it("retains full offline vectors with identity and distinct JS execution receipts", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-output-receipts-"));
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", join(directory, "failures.jsonl"));
  const fullOutput = JSON.stringify([[0, 1, 2], [3, 4, 5], Array.from({ length: 100 }, (_, i) => i)]);
  spawn.mockReturnValue({ status: 0, stdout: fullOutput, stderr: "" });
  try {
    const fixture = new URL("file:///tmp/owned-output-bound-fixture.bend");
    expect(runWorkloadEmitted(fixture)).toEqual(JSON.parse(fullOutput));
    expect(runWorkloadEmitted(fixture)).toEqual(JSON.parse(fullOutput));
    expect(runWorkloadNative(fixture)).toEqual(JSON.parse(fullOutput));
    const outputs = join(directory, "workload-outputs");
    const entries = readdirSync(outputs);
    expect(entries).toHaveLength(3);
    const receipts = entries.map(entry => JSON.parse(readFileSync(join(outputs, entry, "receipt.json"), "utf8")));
    expect(receipts.filter(receipt => receipt.lane === "emitted-js")).toHaveLength(2);
    for (const receipt of receipts) {
      const retained = gunzipSync(readFileSync(receipt.outputPath));
      expect(retained.toString("utf8")).toBe(fullOutput);
      expect(receipt.outputBytes).toBe(Buffer.byteLength(fullOutput));
      expect(receipt.outputSha256).toBe(createHash("sha256").update(fullOutput).digest("hex"));
      expect(receipt.identity).toEqual(preflight.capture.mock.results[0]?.value);
      expect(receipt.timeouts.execution).toBe(5000);
    }
    const sources = spawn.mock.calls.filter(call => call[0] === "/mock/bend").map(call => call[1][2]);
    for (const source of sources) expect(existsSync(source)).toBe(false);
  } finally { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); }
});

it("does not retain a vector rejected by the post-execution identity guard", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-output-receipts-"));
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", join(directory, "failures.jsonl"));
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" });
  preflight.assert.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error("source drift"); });
  try {
    expect(() => runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow("source drift");
    expect(existsSync(join(directory, "workload-outputs"))).toBe(false);
  } finally { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); }
});

it("keeps unscoped execution temporary and does not create receipt artifacts", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-output-receipts-"));
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", "");
  const outputLog = vi.spyOn(console, "log").mockImplementation(() => {});
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" });
  try {
    expect(runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toEqual([0]);
    expect(readdirSync(directory)).toEqual([]);
    expect(outputLog).not.toHaveBeenCalled();
    const generated = spawn.mock.calls[0]?.[1]?.[2];
    expect(existsSync(generated)).toBe(false);
  } finally { outputLog.mockRestore(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); }
});


it("retains preflight output with its already validated manifest reference", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-output-receipts-"));
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", join(directory, "failures.jsonl"));
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_MANIFEST", "/tmp/manifest.json");
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_SESSION", "session");
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256", "hash");
  preflight.validate.mockReturnValueOnce({ binaryPath: "/mock/native" });
  spawn.mockReturnValue({ status: 0, stdout: "[[7,8]]", stderr: "" });
  try {
    const fixture = new URL("../../monkey-business-bend/conformance/permit-scenario.bend", import.meta.url);
    expect(runWorkloadNative(fixture)).toEqual([[7, 8]]);
    const outputs = join(directory, "workload-outputs");
    const [entry] = readdirSync(outputs);
    const receipt = JSON.parse(readFileSync(join(outputs, entry!, "receipt.json"), "utf8"));
    expect(receipt.identity).toEqual({ fixture: fixture.href, validatedPreflight: { manifestPath: "/tmp/manifest.json", manifestHash: "hash", sessionId: "session" } });
    expect(gunzipSync(readFileSync(receipt.outputPath)).toString("utf8")).toBe("[[7,8]]");
    expect(preflight.capture).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); }
});
