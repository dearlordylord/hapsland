import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

test("maintained game caller forwards its finite supervisor deadline before compilation", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-game-caller-"))
  const receipt = join(directory, "caller.json")
  const hook = join(directory, "observe-caller.mjs")
  const root = fileURLToPath(new URL("../", import.meta.url))
  const deadline = Date.now() + 60000
  // Intercept the compiler boundary, then execute the real maintained caller.
  // A missing option is observable here before any Bend/clang process can start.
  writeFileSync(
    hook,
    `
import { registerHooks } from "node:module";
registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith("/prototypes/canonical-defense/game-stream-runner.mjs")) {
    return { format: "module", shortCircuit: true, source: \`
      import { writeFileSync } from "node:fs";
      export async function createGameStreams(fixture, owners, options) {
        writeFileSync(process.env.HAPSLAND_GAME_CALLER_RECEIPT,
          JSON.stringify({ fixture: fixture.href, owners: owners.length, options }));
        process.exit(0);
      }
    \` };
  }
  return nextLoad(url, context);
} });
`
  )
  try {
    const result = spawnSync(process.execPath, ["--import", hook, "prototypes/canonical-defense/verify-consumer.mjs"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        HAPSLAND_GAME_OUTER_DEADLINE_MS: String(deadline),
        HAPSLAND_GAME_NATIVE_RESUME_RECEIPT: "owned-explicit-receipt.json",
        HAPSLAND_GAME_CALLER_RECEIPT: receipt
      }
    })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    const captured = JSON.parse(readFileSync(receipt, "utf8"))
    assert.ok(captured.fixture.endsWith("/DefenseConsumerConformance.bend"))
    assert.ok(captured.owners > 0)
    assert.equal(captured.options.emissionTimeoutMs, 0)
    assert.equal(captured.options.executionTimeoutMs, 180000)
    assert.equal(captured.options.overallDeadlineMs, deadline)
    assert.equal(captured.options.resumeCompilerReceipt, "owned-explicit-receipt.json")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

// Invalid allowances fail before source discovery or any compiler process.
test("game execution rejects unbounded or unsupported allowances before compilation", async () => {
  const { createGameStreams } = await import("../prototypes/canonical-defense/game-stream-runner.mjs")
  const fixture = new URL("../prototypes/canonical-defense/DefenseConsumerConformance.bend", import.meta.url)
  for (const executionTimeoutMs of [0, -1, 180001, Infinity, NaN]) {
    await assert.rejects(
      createGameStreams(fixture, [], { executionTimeoutMs }),
      /unsupported finite game execution allowance/
    )
  }
})

test("game streams join split batches once and reject incomplete or malformed lines", async () => {
  const { streamGameBatches } = await import("../prototypes/canonical-defense/game-stream-runner.mjs")
  const directory = mkdtempSync(join(tmpdir(), "hapsland-game-chunks-"))
  const child = (pieces) => [
    "-e",
    `const pieces=${JSON.stringify(pieces)}; let i=0; const timer=setInterval(()=>{if(i===pieces.length){clearInterval(timer);return;} process.stdout.write(pieces[i++]);},5);`
  ]
  try {
    const files = await streamGameBatches(
      process.execPath,
      child(["[0,", "281474976710655", "]\n[", "1]\n"]),
      directory,
      "split",
      1000
    )
    assert.deepEqual(
      files.map((file) => readFileSync(file, "utf8")),
      ["[0,281474976710655]", "[1]"]
    )
    await assert.rejects(
      streamGameBatches(process.execPath, child(["[0]"]), directory, "partial", 1000),
      /incomplete batch stream/
    )
    await assert.rejects(
      streamGameBatches(process.execPath, child(["[", "invalid]\n"]), directory, "invalid", 1000),
      /JSON|Unexpected token/
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("retained full game batches survive cleanup and require exact identity and bytes", async () => {
  const { retainGameOutputs, restoreGameOutputs } =
    await import("../prototypes/canonical-defense/game-stream-runner.mjs")
  const root = mkdtempSync(join(tmpdir(), "hapsland-game-output-"))
  const original = join(root, "original"),
    restored = join(root, "restored")
  const { mkdirSync } = await import("node:fs")
  mkdirSync(original)
  mkdirSync(restored)
  const saved = process.env.HAPSLAND_TEST_FAILURES_FILE
  const identity = {
    fixture: "exact.bend",
    sources: [{ file: "source", expected: "source-hash" }],
    tools: [{ file: "compiler", expected: "tool-hash" }],
    origin: { native: "explicit compiler receipt", emitted: "fresh JS emission" }
  }
  try {
    const files = Array.from({ length: 145 }, (_, index) => {
      const file = join(original, `batch-${index}.json`)
      writeFileSync(file, JSON.stringify([index, 281474976710655]))
      return file
    })
    delete process.env.HAPSLAND_TEST_FAILURES_FILE
    assert.equal(retainGameOutputs(files, files, identity), undefined)
    process.env.HAPSLAND_TEST_FAILURES_FILE = join(root, "failures.jsonl")
    const receipt = retainGameOutputs(files, files, identity)
    rmSync(original, { recursive: true })
    const result = restoreGameOutputs(receipt, identity, restored)
    assert.equal(result.native.length, 145)
    assert.equal(result.emitted.length, 145)
    assert.deepEqual(result.origin, identity.origin)
    assert.deepEqual(
      result.native.map((file) => JSON.parse(readFileSync(file, "utf8"))),
      Array.from({ length: 145 }, (_, index) => [index, 281474976710655])
    )
    assert.throws(() => restoreGameOutputs(receipt, { ...identity, tools: [] }, restored), /identity changed/)
    const manifest = JSON.parse(readFileSync(receipt, "utf8"))
    const { dirname } = await import("node:path")
    writeFileSync(join(dirname(receipt), manifest.native[0].file), "changed gzip")
    assert.throws(() => restoreGameOutputs(receipt, identity, restored), /gzip changed/)
  } finally {
    if (saved === undefined) delete process.env.HAPSLAND_TEST_FAILURES_FILE
    else process.env.HAPSLAND_TEST_FAILURES_FILE = saved
    rmSync(root, { recursive: true, force: true })
  }
})

test("explicit successful compiler preparations preserve identity and require completed commands", async () => {
  const { readGameCompilerReceipt } = await import("../prototypes/canonical-defense/game-stream-runner.mjs")
  const { createHash } = await import("node:crypto")
  const { chmodSync } = await import("node:fs")
  const directory = mkdtempSync(join(tmpdir(), "hapsland-game-preparation-"))
  const artifact = (name, text, mode) => {
    const path = join(directory, name)
    writeFileSync(path, text)
    if (mode) chmodSync(path, mode)
    return {
      path,
      bytes: Buffer.byteLength(text),
      sha256: createHash("sha256").update(text).digest("hex"),
      ...(mode ? { mode } : {})
    }
  }
  const identity = {
    fixture: "original.bend",
    sources: [{ file: "original.bend", expected: "source-hash" }],
    tools: [{ file: "bend", expected: "tool-hash" }]
  }
  const receipt = {
    lane: "game-compiler-preparation",
    ...identity,
    completed: ["C emission", "clang compilation"],
    commands: [
      { phase: "C emission", command: ["bend", "original.bend", "-o", "game.c"], exit: 0 },
      { phase: "clang compilation", command: ["clang", "game.c", "-o", "game"], exit: 0 }
    ],
    c: artifact("game.c", "actual C"),
    binary: artifact("game", "actual binary", 0o755)
  }
  const path = join(directory, "receipt.json")
  const save = (value) => writeFileSync(path, JSON.stringify(value))
  try {
    save(receipt)
    assert.equal(readGameCompilerReceipt(path, identity).lane, "game-compiler-preparation")
    assert.throws(() => readGameCompilerReceipt(path, { ...identity, tools: [] }), /identity changed/)
    save({ ...receipt, commands: receipt.commands.map((command) => ({ ...command, exit: 1 })) })
    assert.throws(() => readGameCompilerReceipt(path, identity), /provenance/)
    save({ ...receipt, lane: "game-compiler-failure", commands: undefined })
    assert.equal(readGameCompilerReceipt(path, identity).lane, "game-compiler-failure")
    writeFileSync(receipt.c.path, "changed")
    assert.throws(() => readGameCompilerReceipt(path, identity), /bytes changed/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
