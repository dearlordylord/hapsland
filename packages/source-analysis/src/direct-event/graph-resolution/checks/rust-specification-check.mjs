import { artifactValueTag, list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { lstat } from "node:fs/promises"
import { dirname, join, isAbsolute } from "node:path"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import {
  DEFAULT_DIRECT_FILE_POLICY,
  eligibleNamedPath,
  contextDirectFilePolicy
} from "@hapsland/native-observation/direct-event/selection"
const folder = import.meta.dirname,
  root = join(folder, "../../../../../.."),
  cache = join(root, "node_modules/.cache")
mkdirSync(cache, { recursive: true })
const temporary = mkdtempSync(join(cache, "rust-specification-"))
const inputs = [
  "../RustSpecification.bend",
  "../GraphSpecification.bend",
  "../Types.bend",
  "./rust-specification-check.mjs",
  "../RustMachine.bend"
]
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const sources = Object.fromEntries(inputs.map((path) => [path, hash(isAbsolute(path) ? path : join(folder, path))]))
const tag = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields }),
  label = (value) => value.$.split(".").at(-1),
  maybe = (value) => (value === undefined ? { $: "None" } : { $: "Some", value })
const normalize = (value) =>
  typeof value === "bigint"
    ? Number(value)
    : Array.isArray(value)
      ? value.map(normalize)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, key === "$" ? label(value) : normalize(item)])
          )
        : value
try {
  const emitted = join(temporary, "spec.mjs")
  execFileSync("bend", [join(folder, "../RustSpecification.bend"), "-o", emitted], { timeout: 10000 })
  const spec = (await import(pathToFileURL(emitted))).default
  const machineFile = join(temporary, "machine.mjs")
  execFileSync("bend", [join(folder, "../RustMachine.bend"), "-o", machineFile], { timeout: 10000 })
  const machine = (await import(pathToFileURL(machineFile))).default
  const sortInput = ["z", "\u{10000}", "\ue000", "\ud800", "\udfff", "a", "a\0b", "a", ""]
  assert.deepEqual(unlist(machine.sorted(list(sortInput))), sortInput.toSorted(), "production UTF-16 dependency order")
  const cases = []
  let profileIndex = 0
  const statusPlans = [
    ["src/Cargo.toml", "Cargo.toml"],
    ["src/Cargo.toml", "Cargo.toml"],
    ["src/deep/Cargo.toml", "src/Cargo.toml", "Cargo.toml"],
    ["src/deep/Cargo.toml"],
    Array.from({ length: 16 }, (_, index) => [...Array(16 - index).fill("d"), "Cargo.toml"].join("/")),
    Array.from({ length: 16 }, (_, index) => [...Array(17 - index).fill("d"), "Cargo.toml"].join("/"))
  ]
  const terminalPlans = [
    [false, 2, "UnitComplete"],
    [true, 1, "NoCommand"],
    [true, 1, "NoCommand"],
    [true, 4, "SkipImport"],
    [true, 1, "NoCommand"],
    [false, 2, "UnitComplete"]
  ]
  for (const profile of [
    { name: "no-cargo", path: "src/root.rs" },
    { name: "no-cargo-expired", path: "src/root.rs", expire: 0 },
    { name: "ancestor-cargo-directory", path: "src/deep/root.rs", cargo: "Cargo.toml", expire: 0 },
    { name: "nearest-cargo-directory", path: "src/deep/root.rs", cargo: "src/deep/Cargo.toml" },
    {
      name: "cargo-at-depth-sixteen",
      path: Array(16).fill("d").join("/") + "/root.rs",
      cargo: "d/Cargo.toml",
      expire: 0
    },
    { name: "cargo-beyond-depth-sixteen", path: Array(17).fill("d").join("/") + "/root.rs", cargo: "Cargo.toml" }
  ]) {
    const directory = join(temporary, profile.name)
    mkdirSync(directory)
    execFileSync("git", ["init", "-q", directory])
    mkdirSync(dirname(join(directory, profile.path)), { recursive: true })
    writeFileSync(join(directory, profile.path), "pub struct Root;")
    if (profile.cargo) mkdirSync(join(directory, profile.cargo), { recursive: true })
    const capture = { text: "pub struct Root;", byteLength: 16 },
      limits = { ...GRAPH_LIMIT_CEILINGS },
      host = { root: directory, policy: DEFAULT_DIRECT_FILE_POLICY }
    const statusPaths = statusPlans[profileIndex]
    const [invalid, ticksExpected, command] = terminalPlans[profileIndex++]
    const expectedTrace = [
      { operation: "InsertRootCaptureCache", path: profile.path },
      ...statusPaths.map((path) => ({ operation: "ReadFileStatus", path })),
      ...Array.from({ length: ticksExpected }, (_, tick) => [
        { operation: "ReadDeadline" },
        ...(profile.name === "nearest-cargo-directory" && tick === 2
          ? [{ operation: "AccessPath", path: "src/deep/Cargo.toml" }]
          : [])
      ]).flat()
    ]
    const limitTag = {
      $: "../../../../agent-flow-bend/ImportGraph.Limits",
      ...Object.fromEntries(
        Object.entries(limits).map(([key, value]) => [
          {
            sourceBytes: "source_bytes",
            treeBytes: "tree_bytes",
            readBytes: "read_bytes",
            outgoingEdges: "outgoing_edges"
          }[key] ?? key,
          Number(value)
        ])
      )
    }
    const token = tag("CaptureToken", { invocation: 1, id: 1 }),
      cacheToken = tag("CacheToken", { invocation: 1, id: 2 })
    const input = tag("ResolverInput", {
      invocation: 1,
      root_path: profile.path,
      root_capture: token,
      root_bytes: 16,
      root_name: "Root",
      root_source: capture.text,
      branch: tag("TypeBranch"),
      caller_cache: maybe(cacheToken),
      limits: limitTag
    })
    const actualTrace = []
    let search = spec.begin(input)
    while (label(search) === "SearchRequest") {
      const operation = search.operation,
        name = label(operation)
      let outcome
      if (name === "InsertRootCaptureCache") {
        actualTrace.push({ operation: name, path: operation.path })
        outcome = tag("RootCacheInserted")
      } else if (name === "PathDirname") outcome = tag("DirnameResult", { path: dirname(operation.path) })
      else if (name === "PathJoin") outcome = tag("JoinedResult", { path: join(...unlist(operation.parts)) })
      else if (name === "ReadFileStatus") {
        actualTrace.push({ operation: name, path: operation.path })
        const status = await lstat(join(directory, operation.path)).catch(() => undefined)
        outcome = tag("StatusResult", {
          status: tag(status === undefined ? "FileAbsent" : status.isFile() ? "ExistingFile" : "ExistingOther")
        })
      } else throw new Error(name)
      search = spec.search_reply(search.state, outcome)
    }
    assert.equal(label(search), "SearchFinished")
    let action = spec.next_iteration(search.preparation),
      ticks = 0
    while (label(action) !== "PreparationFinished") {
      const name = label(action)
      if (name === "ReadDeadline") {
        actualTrace.push({ operation: name })
        action = spec.deadline(ticks++ >= (profile.expire ?? Infinity), action.state)
      } else if (name === "ResolvePath")
        action = spec.resolved_path(
          !isAbsolute(action.path) && action.path !== ".." && !action.path.startsWith("../.."),
          action.state,
          action.path
        )
      else if (name === "CheckAccess") {
        actualTrace.push({ operation: "AccessPath", path: action.path })
        const selected = await Effect.runPromise(
          eligibleNamedPath(directory, action.path, contextDirectFilePolicy(host.policy))
        )
        action = spec.checked_path(action.state, selected !== undefined)
      } else throw new Error("unqualified capture continuation " + name)
    }
    const state = action.state
    assert.deepEqual(actualTrace, expectedTrace, profile.name + " authored cache/status/clock/access order")
    assert.equal(state.invalid, invalid, profile.name + " terminal availability")
    assert.equal(label(state.command), command, profile.name + " terminal command")
    assert.equal(label(spec.role(state)), "None", profile.name + " no invented Rust role")
    assert.deepEqual(unlist(state.dependencies), [], profile.name + " no published capture authority")
    assert.deepEqual(unlist(state.roles), [], profile.name + " no source inspection")
    cases.push({
      name: profile.name,
      orderedEffects: actualTrace.length,
      statusReads: actualTrace.filter((item) => item.operation === "ReadFileStatus").length,
      invalid: state.invalid
    })
  }
  const limitTag = {
    $: "../../../../agent-flow-bend/ImportGraph.Limits",
    ...Object.fromEntries(
      Object.entries(GRAPH_LIMIT_CEILINGS).map(([key, value]) => [
        {
          sourceBytes: "source_bytes",
          treeBytes: "tree_bytes",
          readBytes: "read_bytes",
          outgoingEdges: "outgoing_edges"
        }[key] ?? key,
        Number(value)
      ])
    )
  }
  const cacheToken = tag("CacheToken", { invocation: 1, id: 2 }),
    selection = tag("SelectionToken", { invocation: 1, id: 3 }),
    token = tag("CaptureToken", { invocation: 1, id: 4 })
  let captureComparisons = 0
  for (const count of [0, 1, 63, 64, 65])
    for (const present of [false, true])
      for (const totalBytes of [0, 16777216, 16777217]) {
        const entries = Array.from({ length: count }, (_, index) => ({
          path: present && index === 0 ? "module.rs" : "cached-" + index,
          bytes: index === 0 ? totalBytes : 0
        }))
        const expected =
          count === 0 || present
            ? undefined
            : count >= 64
              ? { resource: "files", used: count, requested: 1, limit: 64 }
              : totalBytes === 0
                ? undefined
                : { resource: "bytes", used: totalBytes, requested: 2097152, limit: 16777216 }
        const prep = spec.initialize(limitTag, "root.rs", 16, maybe())
        const start = spec.capture_start(prep, cacheToken, selection, "module.rs")
        const step = spec.capture_reply(
          start.state,
          tag("CacheSnapshot", {
            entries: list(entries.map((item) => tag("CaptureBytes", { path: item.path, bytes: Number(item.bytes) })))
          })
        )
        if (expected) {
          assert.equal(label(step.operation), "ObserveDiagnostic")
          assert.deepEqual(normalize(step.operation.diagnostic), { $: "CaptureBudgetDiagnostic", ...expected })
        } else assert.equal(label(step.operation), "LookupCaptureCache")
        captureComparisons++
      }
  for (const bytes of [16, GRAPH_LIMIT_CEILINGS.sourceBytes + 1]) {
    let action = spec.deadline(
      false,
      spec.next_iteration(spec.initialize(limitTag, "root.rs", 16, maybe("module.rs"))).state
    )
    action = spec.deadline(false, action.state)
    action = spec.resolved_path(true, action.state, "module.rs")
    action = spec.deadline(false, action.state)
    action = spec.checked_path(action.state, true)
    action = spec.deadline(false, action.state)
    const prep = action.state
    let step = spec.capture_start(prep, cacheToken, selection, "module.rs")
    step = spec.capture_reply(step.state, tag("CacheSnapshot", { entries: list([]) }))
    step = spec.capture_reply(step.state, tag("CacheResult", { outcome: tag("CacheAbsent") }))
    assert.equal(label(step.operation), "CaptureSource")
    step = spec.capture_reply(
      step.state,
      tag("CaptureResult", {
        outcome: tag("SourceCaptured", { capture: token, relative_path: "module.rs", bytes: Number(bytes) })
      })
    )
    assert.equal(label(step.operation), "StoreCaptureCache", "store precedes source-size refusal")
    step = spec.capture_reply(step.state, tag("CacheStored"))
    assert.equal(label(step.action), bytes > GRAPH_LIMIT_CEILINGS.sourceBytes ? "PreparationFinished" : "InspectTask")
    if (bytes > GRAPH_LIMIT_CEILINGS.sourceBytes) assert.equal(step.action.state.invalid, true)
    captureComparisons++
  }
  assert.deepEqual(
    Object.fromEntries(inputs.map((path) => [path, hash(isAbsolute(path) ? path : join(folder, path))])),
    sources
  )
  const record = {
    passed: true,
    productionSortCases: 1,
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    sources,
    cases,
    captureComparisons,
    scope:
      "Authored Rust specification search prefixes on six physical repositories and fixed aggregate cache/refusal/store-size cases; production RustMachine UTF-16 sorting. Full trees and observer/provider behavior are qualified by the actual Canonical owned consumer, not this specification check."
  }
  const evidenceDirectory = join(import.meta.dirname, "../../../../../../.test-runs/bend-migration")
  mkdirSync(evidenceDirectory, { recursive: true })
  writeFileSync(
    join(evidenceDirectory, "rust-specification-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
