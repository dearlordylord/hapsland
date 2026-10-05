import {
  runWorkloadNative,
  runWorkloadEmitted,
  readRetainedWorkloadOutput
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"
import { createHash } from "node:crypto"
import { gunzipSync, gzipSync } from "node:zlib"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs"
import { vi, expect, it, beforeEach } from "vitest"
const spawn = vi.hoisted(() => vi.fn())
const preflight = vi.hoisted(() => ({
  capture: vi.fn(() => ({
    root: "/tmp/owned-output-bound-fixture.bend",
    graph: { entries: [], sha256: "graph" },
    inputs: {
      tools: { bend: { path: "/mock/bend" }, clang: { path: "/mock/clang" } },
      host: { platform: "test", architecture: "test", release: "test" },
      flags: {},
      base: "/mock/base.bend"
    }
  })),
  assert: vi.fn(),
  validate: vi.fn()
}))
vi.mock("node:child_process", () => ({ spawnSync: spawn }))
vi.mock("../../monkey-business-bend/conformance/native-preflight.mjs", () => ({
  NATIVE_C_EMISSION_TIMEOUT_MS: 30000,
  NATIVE_CLANG_TIMEOUT_MS: 30000,
  assertNativeFixtureIdentity: preflight.assert,
  captureNativeFixtureIdentity: preflight.capture,
  validateNativeFixture: preflight.validate
}))

beforeEach(() => {
  spawn.mockReset()
  preflight.capture.mockClear()
  preflight.assert.mockClear()
  preflight.validate.mockClear()
})

it("bounds every fresh native phase to 16MiB and keeps the phase timeouts", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  expect(runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toEqual([0])
  expect(spawn.mock.calls).toHaveLength(3)
  expect(
    spawn.mock.calls.map((call) => {
      const { env: _env, ...options } = call[2]
      return options
    })
  ).toEqual([30000, 30000, 5000].map((timeout) => ({ encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 })))
  expect(spawn.mock.calls[0]?.[2].env.BEND_NO_TELEMETRY).toBe("1")
  expect(spawn.mock.calls[0]?.[0]).toBe("/mock/bend")
  expect(spawn.mock.calls[1]?.[0]).toBe("/mock/clang")
  expect(preflight.capture).toHaveBeenCalledTimes(1)
  expect(preflight.assert).toHaveBeenCalledTimes(2)
  const binary = spawn.mock.calls[2]?.[0]
  if (typeof binary !== "string") throw new Error("native binary path unavailable")
  expect(existsSync(binary.slice(0, binary.lastIndexOf("/")))).toBe(false)
})

it("rejects an identity drift before executing the fresh binary", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  preflight.assert.mockImplementationOnce(() => {
    throw new Error(
      "Native workload rejected: source inputs changed during the direct native workload; refusing mixed-source artifact"
    )
  })
  expect(() => runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow(
    "refusing mixed-source artifact"
  )
  expect(spawn.mock.calls).toHaveLength(2)
  const source = spawn.mock.calls[0]?.[1]?.[2]
  if (typeof source !== "string") throw new Error("native source path unavailable")
  expect(existsSync(source.slice(0, source.lastIndexOf("/")))).toBe(false)
})

it("pins the compiler and bounds fresh emitted JavaScript", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  expect(runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toEqual([0])
  expect(spawn.mock.calls).toHaveLength(2)
  expect(spawn.mock.calls[0]?.[0]).toBe("/mock/bend")
  expect(spawn.mock.calls[0]?.[2].env.BEND_NO_TELEMETRY).toBe("1")
  expect(spawn.mock.calls.map((call) => call[2].timeout)).toEqual([15000, 5000])
  expect(preflight.capture).toHaveBeenCalledTimes(1)
  expect(preflight.assert).toHaveBeenCalledTimes(2)
})

it("rejects emitted identity drift before executing generated JavaScript", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  preflight.assert.mockImplementationOnce(() => {
    throw new Error(
      "Native workload rejected: source inputs changed during the direct native workload; refusing mixed-source artifact"
    )
  })
  expect(() => runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow(
    "refusing mixed-source artifact"
  )
  expect(spawn.mock.calls).toHaveLength(1)
  const source = spawn.mock.calls[0]?.[1]?.[2]
  if (typeof source !== "string") throw new Error("emitted source path unavailable")
  expect(existsSync(source.slice(0, source.lastIndexOf("/")))).toBe(false)
})

it("rejects emitted identity drift after executing generated JavaScript", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  preflight.assert
    .mockImplementationOnce(() => undefined)
    .mockImplementationOnce(() => {
      throw new Error(
        "Native workload rejected: source inputs changed during the direct native workload; refusing mixed-source artifact"
      )
    })
  expect(() => runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow(
    "refusing mixed-source artifact"
  )
  expect(spawn.mock.calls).toHaveLength(2)
  const program = spawn.mock.calls[1]?.[1]?.[0]
  if (typeof program !== "string") throw new Error("emitted program path unavailable")
  expect(existsSync(program.slice(0, program.lastIndexOf("/")))).toBe(false)
})
it("reports a bounded-output failure and cleans the fresh directory", () => {
  spawn
    .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
    .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
    .mockReturnValueOnce({ status: null, error: { code: "ENOBUFS" }, stdout: "", stderr: "" })
  expect(() => runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow("ENOBUFS")
  const binary = spawn.mock.calls[2]?.[0]
  if (typeof binary !== "string") throw new Error("native binary path unavailable")
  expect(existsSync(binary.slice(0, binary.lastIndexOf("/")))).toBe(false)
})

it("allows an explicit bounded C allowance without changing clang or execution defaults", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  expect(
    runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"), { emissionTimeoutMs: 90000 })
  ).toEqual([0])
  expect(spawn.mock.calls.map((call) => call[2].timeout)).toEqual([90000, 30000, 5000])
})

it("allows an explicit clang90 allowance without changing emission or execution defaults", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  expect(runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"), { clangTimeoutMs: 90000 })).toEqual([
    0
  ])
  expect(spawn.mock.calls.map((call) => call[2].timeout)).toEqual([30000, 90000, 5000])
})

it("allows execution15 while leaving default execution5 unchanged", () => {
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  const fixture = new URL("file:///tmp/owned-output-bound-fixture.bend")
  expect(runWorkloadNative(fixture, { executionTimeoutMs: 15000 })).toEqual([0])
  expect(runWorkloadNative(fixture)).toEqual([0])
  expect(spawn.mock.calls.map((call) => call[2].timeout)).toEqual([30000, 30000, 15000, 30000, 30000, 5000])
})
it.each([0, -1, 15001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid execution allowance %s before identity or spawn",
  (executionTimeoutMs) => {
    expect(() =>
      runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"), { executionTimeoutMs })
    ).toThrow("invalid native execution timeout")
    expect(preflight.capture).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  }
)

it("rejects a clang allowance over120 before identity capture or spawn", () => {
  expect(() =>
    runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"), { clangTimeoutMs: 120001 })
  ).toThrow("invalid native clang timeout")
  expect(spawn).not.toHaveBeenCalled()
  expect(preflight.capture).not.toHaveBeenCalled()
})

it.each([0, -1, 90001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid C allowance %s before any spawn",
  (emissionTimeoutMs) => {
    expect(() =>
      runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"), { emissionTimeoutMs })
    ).toThrow("invalid native C emission timeout")
    expect(spawn).not.toHaveBeenCalled()
    expect(preflight.capture).not.toHaveBeenCalled()
  }
)

it("rejects a C override for a fixed preflight session before validation or spawn", () => {
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_MANIFEST", "/tmp/manifest.json")
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_SESSION", "session")
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256", "hash")
  try {
    const fixture = new URL("../../monkey-business-bend/conformance/permit-scenario.bend", import.meta.url)
    expect(() => runWorkloadNative(fixture, { emissionTimeoutMs: 45000 })).toThrow(
      "preflight session fixes the C emission timeout"
    )
    expect(preflight.validate).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllEnvs()
  }
})

it("identifies the failed C phase and declared allowance without retrying", () => {
  spawn.mockReturnValue({ status: null, error: { code: "ETIMEDOUT" }, stdout: "", stderr: "" })
  expect(() =>
    runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"), { emissionTimeoutMs: 45000 })
  ).toThrow(/C emission \(declared timeout 45000ms\).*ETIMEDOUT/)
  expect(spawn).toHaveBeenCalledTimes(1)
})

it("retains full offline vectors with identity and distinct JS execution receipts", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-output-receipts-"))
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", join(directory, "failures.jsonl"))
  const fullOutput = JSON.stringify([[0, 1, 2], [3, 4, 5], Array.from({ length: 100 }, (_, i) => i)])
  spawn.mockReturnValue({ status: 0, stdout: fullOutput, stderr: "" })
  try {
    const fixture = new URL("file:///tmp/owned-output-bound-fixture.bend")
    expect(runWorkloadEmitted(fixture)).toEqual(JSON.parse(fullOutput))
    expect(runWorkloadEmitted(fixture)).toEqual(JSON.parse(fullOutput))
    expect(runWorkloadNative(fixture)).toEqual(JSON.parse(fullOutput))
    const outputs = join(directory, "workload-outputs")
    const entries = readdirSync(outputs)
    expect(entries).toHaveLength(3)
    const receipts = entries.map((entry) => JSON.parse(readFileSync(join(outputs, entry, "receipt.json"), "utf8")))
    expect(receipts.filter((receipt) => receipt.lane === "emitted-js")).toHaveLength(2)
    for (const receipt of receipts) {
      const retained = gunzipSync(readFileSync(receipt.outputPath))
      expect(retained.toString("utf8")).toBe(fullOutput)
      expect(receipt.outputBytes).toBe(Buffer.byteLength(fullOutput))
      expect(receipt.outputSha256).toBe(createHash("sha256").update(fullOutput).digest("hex"))
      expect(receipt.identity).toEqual(preflight.capture.mock.results[0]?.value)
      expect(receipt.timeouts.execution).toBe(5000)
    }
    const sources = spawn.mock.calls.filter((call) => call[0] === "/mock/bend").map((call) => call[1][2])
    for (const source of sources) expect(existsSync(source)).toBe(false)
  } finally {
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  }
})

it("does not retain a vector rejected by the post-execution identity guard", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-output-receipts-"))
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", join(directory, "failures.jsonl"))
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  preflight.assert
    .mockImplementationOnce(() => undefined)
    .mockImplementationOnce(() => {
      throw new Error("source drift")
    })
  try {
    expect(() => runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow("source drift")
    expect(existsSync(join(directory, "workload-outputs"))).toBe(false)
  } finally {
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  }
})

it("keeps unscoped execution temporary and does not create receipt artifacts", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-output-receipts-"))
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", "")
  const outputLog = vi.spyOn(console, "log").mockImplementation(() => {})
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  try {
    expect(runWorkloadEmitted(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toEqual([0])
    expect(readdirSync(directory)).toEqual([])
    expect(outputLog).not.toHaveBeenCalled()
    const generated = spawn.mock.calls[0]?.[1]?.[2]
    expect(existsSync(generated)).toBe(false)
  } finally {
    outputLog.mockRestore()
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  }
})

it("retains preflight output with its already validated manifest reference", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-output-receipts-"))
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", join(directory, "failures.jsonl"))
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_MANIFEST", "/tmp/manifest.json")
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_SESSION", "session")
  vi.stubEnv("HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256", "hash")
  preflight.validate.mockReturnValueOnce({ binaryPath: "/mock/native" })
  spawn.mockReturnValue({ status: 0, stdout: "[[7,8]]", stderr: "" })
  try {
    const fixture = new URL("../../monkey-business-bend/conformance/permit-scenario.bend", import.meta.url)
    expect(runWorkloadNative(fixture)).toEqual([[7, 8]])
    const outputs = join(directory, "workload-outputs")
    const [entry] = readdirSync(outputs)
    const receipt = JSON.parse(readFileSync(join(outputs, entry!, "receipt.json"), "utf8"))
    expect(receipt.identity).toEqual({
      fixture: fixture.href,
      validatedPreflight: { manifestPath: "/tmp/manifest.json", manifestHash: "hash", sessionId: "session" }
    })
    expect(gunzipSync(readFileSync(receipt.outputPath)).toString("utf8")).toBe("[[7,8]]")
    expect(preflight.capture).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledTimes(1)
  } finally {
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each([
  { failedCall: 0, phase: "C emission", completed: [false] },
  { failedCall: 1, phase: "clang compilation", completed: [true, false] },
  { failedCall: 2, phase: "native execution", completed: [true, true, false] }
])("retains exact C and phase evidence after $phase fails", ({ failedCall, phase, completed }) => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-native-failure-"))
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", join(directory, "failures.jsonl"))
  const c = "/* complete offline fixture C, or partial emission on compiler failure */\n"
  let call = 0
  spawn.mockImplementation((_command, args) => {
    if (call === 0) writeFileSync(args[2], c)
    if (call === 1 && failedCall === 2) writeFileSync(args[4], "offline binary bytes")
    const failed = call++ === failedCall
    return failed
      ? { status: null, stdout: "", stderr: "phase timeout", error: { code: "ETIMEDOUT" }, signal: "SIGTERM" }
      : { status: 0, stdout: "[0]", stderr: "" }
  })
  try {
    expect(() => runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow(phase)
    const outputs = join(directory, "workload-outputs")
    const entries = readdirSync(outputs)
    expect(entries).toHaveLength(1)
    const receipt = JSON.parse(readFileSync(join(outputs, entries[0]!, "receipt.json"), "utf8"))
    expect(receipt.lane).toBe("fresh-native-failure")
    expect(receipt.identity).toEqual(preflight.capture.mock.results[0]?.value)
    expect(receipt.phases.map((item: { completed: boolean }) => item.completed)).toEqual(completed)
    expect(receipt.phases.at(-1)).toMatchObject({ phase, errorCode: "ETIMEDOUT", completed: false })
    expect(receipt.timeouts).toEqual({ emission: 30000, clang: 30000, execution: 5000 })
    expect(readFileSync(receipt.c.path, "utf8")).toBe(c)
    expect(receipt.c.bytes).toBe(Buffer.byteLength(c))
    expect(receipt.c.sha256).toBe(createHash("sha256").update(c).digest("hex"))
    if (failedCall === 2) {
      expect(readFileSync(receipt.binary.path, "utf8")).toBe("offline binary bytes")
      expect(receipt.binary.sha256).toBe(createHash("sha256").update("offline binary bytes").digest("hex"))
    } else expect(receipt.binary).toBeNull()
    expect(existsSync(spawn.mock.calls[0]?.[1][2])).toBe(false)
    expect(spawn).toHaveBeenCalledTimes(failedCall + 1)
  } finally {
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  }
})

it("cleans failed unscoped native compilation without retained artifacts", () => {
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", "")
  const outputLog = vi.spyOn(console, "log").mockImplementation(() => {})
  spawn.mockImplementation((_command, args) => {
    writeFileSync(args[2], "partial C")
    return { status: 1, stdout: "", stderr: "compiler rejected fixture" }
  })
  try {
    expect(() => runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow("C emission")
    expect(outputLog).not.toHaveBeenCalled()
    expect(existsSync(spawn.mock.calls[0]?.[1][2])).toBe(false)
  } finally {
    outputLog.mockRestore()
    vi.unstubAllEnvs()
  }
})

it("preserves the original phase error when failure evidence cannot be written", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-native-retention-error-"))
  const blocker = join(directory, "not-a-directory")
  writeFileSync(blocker, "owned fixture blocker")
  vi.stubEnv("HAPSLAND_TEST_FAILURES_FILE", join(blocker, "failures.jsonl"))
  const evidenceLog = vi.spyOn(console, "error").mockImplementation(() => {})
  spawn.mockReturnValue({ status: null, stdout: "", stderr: "original compiler timeout", error: { code: "ETIMEDOUT" } })
  try {
    expect(() => runWorkloadNative(new URL("file:///tmp/owned-output-bound-fixture.bend"))).toThrow(
      /C emission.*ETIMEDOUT.*original compiler timeout/
    )
    expect(evidenceLog).toHaveBeenCalledWith("Offline workload failure evidence could not be retained")
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(existsSync(spawn.mock.calls[0]?.[1][2])).toBe(false)
    expect(readFileSync(blocker, "utf8")).toBe("owned fixture blocker")
  } finally {
    evidenceLog.mockRestore()
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each(["C", "fixture", "source", "tool", "incomplete"])(
  "rejects a changed %s resume receipt before compiler spawn",
  (change) => {
    const directory = mkdtempSync(join(tmpdir(), "native-resume-guard-"))
    const fixture = new URL("file:///tmp/owned-output-bound-fixture.bend")
    const identity = preflight.capture()
    const path = join(directory, "scenario.c"),
      receiptPath = join(directory, "receipt.json")
    const bytes = Buffer.from("actual retained C")
    writeFileSync(path, bytes)
    const receipt = {
      lane: "fresh-native-failure",
      identity: structuredClone(identity),
      phases: [{ phase: "C emission", completed: true, status: 0 }],
      c: { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
      binary: null
    }
    if (change === "C") writeFileSync(path, "modified C")
    if (change === "fixture") receipt.identity.root = "/tmp/other.bend"
    if (change === "source") receipt.identity.graph.sha256 = "changed"
    if (change === "tool") receipt.identity.inputs.tools.bend.path = "/changed/bend"
    if (change === "incomplete") receipt.phases[0]!.completed = false
    writeFileSync(receiptPath, JSON.stringify(receipt))
    try {
      expect(() => runWorkloadNative(fixture, { resumeNativeCompilerReceipt: receiptPath })).toThrow()
      expect(spawn).not.toHaveBeenCalled()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
it("explicitly resumes verified C without recompiling it", () => {
  const directory = mkdtempSync(join(tmpdir(), "native-resume-valid-"))
  const fixture = new URL("file:///tmp/owned-output-bound-fixture.bend")
  const path = join(directory, "scenario.c"),
    receiptPath = join(directory, "receipt.json"),
    bytes = Buffer.from("retained complete C")
  writeFileSync(path, bytes)
  writeFileSync(
    receiptPath,
    JSON.stringify({
      lane: "fresh-native-failure",
      identity: preflight.capture(),
      phases: [{ phase: "C emission", completed: true, status: 0 }],
      c: { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
      binary: null
    })
  )
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  try {
    expect(runWorkloadNative(fixture, { resumeNativeCompilerReceipt: receiptPath, clangTimeoutMs: 120000 })).toEqual([
      0
    ])
    expect(spawn.mock.calls.map((call) => call[0])).toEqual([
      "/mock/clang",
      expect.stringContaining("hapsland-workload-native-")
    ])
    expect(spawn.mock.calls.map((call) => call[2].timeout)).toEqual([120000, 5000])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each([false, true])("checks retained binary integrity before execution (changed=%s)", (changed) => {
  const directory = mkdtempSync(join(tmpdir(), "native-resume-binary-"))
  const fixture = new URL("file:///tmp/owned-output-bound-fixture.bend")
  const c = Buffer.from("C"),
    binary = Buffer.from("compiled binary")
  const source = join(directory, "scenario.c"),
    executable = join(directory, "scenario"),
    receiptPath = join(directory, "receipt.json")
  writeFileSync(source, c)
  writeFileSync(executable, binary)
  chmodSync(executable, 0o700)
  const artifact = (path: string, bytes: Buffer) => ({
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex")
  })
  writeFileSync(
    receiptPath,
    JSON.stringify({
      lane: "fresh-native-failure",
      identity: preflight.capture(),
      phases: [
        { phase: "C emission", completed: true, status: 0 },
        { phase: "clang compilation", completed: true, status: 0 }
      ],
      c: artifact(source, c),
      binary: { ...artifact(executable, binary), mode: 0o700 }
    })
  )
  if (changed) writeFileSync(executable, "changed binary")
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  try {
    if (changed) {
      expect(() => runWorkloadNative(fixture, { resumeNativeCompilerReceipt: receiptPath })).toThrow(
        "artifact bytes changed"
      )
      expect(spawn).not.toHaveBeenCalled()
    } else {
      expect(runWorkloadNative(fixture, { resumeNativeCompilerReceipt: receiptPath })).toEqual([0])
      expect(spawn).toHaveBeenCalledTimes(1)
      expect(spawn.mock.calls[0]?.[2].timeout).toBe(5000)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each(["none", "output", "source", "lane"])(
  "explicit retained comparison checks unchanged producer and complete output (%s)",
  (change) => {
    const directory = mkdtempSync(join(tmpdir(), "native-retained-comparison-"))
    const fixture = new URL("file:///tmp/owned-output-bound-fixture.bend")
    const outputPath = join(directory, "output.json.gz"),
      receiptPath = join(directory, "receipt.json")
    const bytes = Buffer.from("[[1,2],[3,4]]")
    const identity = preflight.capture()
    const receipt = {
      lane: "fresh-native",
      identity,
      outputPath,
      outputBytes: bytes.length,
      outputSha256: createHash("sha256").update(bytes).digest("hex")
    }
    writeFileSync(outputPath, gzipSync(bytes))
    if (change === "output") writeFileSync(outputPath, gzipSync(Buffer.from("[[1,2],[3,5]]")))
    if (change === "source") receipt.identity.graph.sha256 = "changed"
    if (change === "lane") receipt.lane = "emitted-js"
    writeFileSync(receiptPath, JSON.stringify(receipt))
    try {
      if (change === "none")
        expect(readRetainedWorkloadOutput(fixture, receiptPath, "fresh-native")).toEqual([
          [1, 2],
          [3, 4]
        ])
      else expect(() => readRetainedWorkloadOutput(fixture, receiptPath, "fresh-native")).toThrow()
      expect(spawn).not.toHaveBeenCalled()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
)

it("labels resumed execution with its retained compiler phase provenance", () => {
  const directory = mkdtempSync(join(tmpdir(), "native-resume-provenance-"))
  const fixture = new URL("file:///tmp/owned-output-bound-fixture.bend")
  const path = join(directory, "scenario.c"),
    receiptPath = join(directory, "receipt.json"),
    bytes = Buffer.from("retained C")
  writeFileSync(path, bytes)
  writeFileSync(
    receiptPath,
    JSON.stringify({
      lane: "fresh-native-failure",
      identity: preflight.capture(),
      phases: [{ phase: "C emission", completed: true, status: 0 }],
      c: { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
      binary: null
    })
  )
  const oldFailureFile = process.env.HAPSLAND_TEST_FAILURES_FILE
  process.env.HAPSLAND_TEST_FAILURES_FILE = join(directory, "failures.jsonl")
  spawn.mockReturnValue({ status: 0, stdout: "[0]", stderr: "" })
  try {
    expect(runWorkloadNative(fixture, { resumeNativeCompilerReceipt: receiptPath })).toEqual([0])
    const outputs = join(directory, "workload-outputs")
    const result = JSON.parse(readFileSync(join(outputs, readdirSync(outputs)[0]!, "receipt.json"), "utf8"))
    expect(result.lane).toBe("resumed-native")
    expect(result.resume.receiptPath).toBe(receiptPath)
    expect(result.resume.reusedPhases).toEqual(["C emission"])
  } finally {
    if (oldFailureFile === undefined) delete process.env.HAPSLAND_TEST_FAILURES_FILE
    else process.env.HAPSLAND_TEST_FAILURES_FILE = oldFailureFile
    rmSync(directory, { recursive: true, force: true })
  }
})
