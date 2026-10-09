import { test } from "node:test"
import { parse } from "@babel/parser"
import assert from "node:assert/strict"
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  mkdirSync,
  chmodSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  watchScenarioBudget,
  probeAcceptanceTool,
  CandidateMutations,
  confinedPath,
  selectAcceptanceCases,
  authoredInventory,
  authoredCandidateIdentity,
  retainReceiptEvidence,
  artifactReceiptPaths,
  actualTaskCacheEvents,
  canSkipRepair,
  requireNoCompilation
} from "./run-build-workflow-acceptance.mjs"
import { zstdCompressSync, zstdDecompressSync } from "node:zlib"
import {
  requireRecoveredAssembly,
  omitCacheTarMember,
  buildAcceptanceCases,
  pendingAcceptanceCases
} from "./build-workflow-acceptance-cases.mjs"

const visitSyntax = (value, inspect) => {
  if (!value || typeof value !== "object") return
  inspect(value)
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) for (const item of child) visitSyntax(item, inspect)
    else if (child && typeof child === "object") visitSyntax(child, inspect)
  }
}
const staticProperty = (node, label) => {
  if (!node.computed && node.property?.type === "Identifier") return node.property.name
  if (node.computed && node.property?.type === "StringLiteral") return node.property.value
  assert.fail(`Unaccounted computed acceptance access: ${label}`)
}
const assertAcceptanceContextContract = (runnerSource) => {
  const uses = new Map()
  for (const name of ["build-workflow", "build-resolution", "build-watch"]) {
    const file = `${name}-acceptance-cases.mjs`
    visitSyntax(parse(readFileSync(join(import.meta.dirname, file), "utf8"), { sourceType: "module" }), (node) => {
      if (
        ["MemberExpression", "OptionalMemberExpression"].includes(node.type) &&
        node.object.type === "Identifier" &&
        node.object.name === "context"
      ) {
        const location = `${file}:${node.loc.start.line}`
        const property = staticProperty(node, location)
        uses.set(property, [...(uses.get(property) ?? []), location])
      }
    })
  }
  const providers = []
  visitSyntax(parse(runnerSource, { sourceType: "module" }), (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.object.type === "Identifier" &&
      node.callee.object.name === "cell" &&
      staticProperty(node.callee, "runner cell call") === "run"
    ) {
      assert.equal(node.arguments[0]?.type, "ObjectExpression", "Acceptance context must have explicit provider keys")
      providers.push(
        new Set(
          node.arguments[0].properties.map((property) => {
            assert.equal(property.type, "ObjectProperty", "Unaccounted acceptance provider spread or method")
            return staticProperty({ computed: property.computed, property: property.key }, "runner provider key")
          })
        )
      )
    }
  })
  assert.equal(providers.length, 1, "Expected one actual acceptance context provider")
  for (const [property, locations] of uses)
    assert(providers[0].has(property), `Missing acceptance context API ${property}: ${locations.join(", ")}`)
}

test("actual acceptance context supplies every API used by all case modules", () => {
  const source = readFileSync(join(import.meta.dirname, "run-build-workflow-acceptance.mjs"), "utf8")
  assertAcceptanceContextContract(source)
  let selected
  visitSyntax(parse(source, { sourceType: "module" }), (node) => {
    if (node.type === "ObjectProperty" && node.key.type === "Identifier" && node.key.name === "probeTool") {
      assert.equal(selected, undefined, "Expected one probeTool provider")
      selected = node
    }
  })
  assert(selected, "Actual probeTool provider is required")
  const trailing = source.slice(selected.end).match(/^\s*,/)?.[0].length ?? 0
  const omitted = source.slice(0, selected.start) + source.slice(selected.end + trailing)
  assert.notEqual(omitted, source, "Missing-method discriminator must remove the actual probeTool provider")
  assert.throws(() => assertAcceptanceContextContract(omitted), /Missing acceptance context API probeTool/)
  assert.throws(
    () => assertAcceptanceContextContract(source.replace("await cell.run({", "await cell.run({ ...unknownProvider,")),
    /Unaccounted acceptance provider spread/
  )
  assert.throws(
    () => assertAcceptanceContextContract(source.replace("await cell.run({", "await cell.run({ [unknownKey]: null,")),
    /Unaccounted computed acceptance access/
  )
})

test("mutation rollback preserves original bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-acceptance-"))
  try {
    writeFileSync(join(root, "source.ts"), "original")
    const changes = new CandidateMutations(root)
    changes.mutate("source.ts", () => "mutated")
    assert.equal(readFileSync(join(root, "source.ts"), "utf8"), "mutated")
    changes.restore()
    assert.equal(readFileSync(join(root, "source.ts"), "utf8"), "original")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
test("concurrent source change is preserved", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-acceptance-"))
  try {
    writeFileSync(join(root, "source.ts"), "original")
    const changes = new CandidateMutations(root)
    changes.mutate("source.ts", () => "mutated")
    writeFileSync(join(root, "source.ts"), "other editor")
    assert.throws(() => changes.restore(), /Concurrent source edit/)
    assert.equal(readFileSync(join(root, "source.ts"), "utf8"), "other editor")
    assert.equal(changes.files.size, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
test("removed output can be restored", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-acceptance-"))
  try {
    writeFileSync(join(root, "output.js"), "original")
    const changes = new CandidateMutations(root)
    changes.remove("output.js")
    assert.equal(existsSync(join(root, "output.js")), false)
    changes.restore()
    assert.equal(readFileSync(join(root, "output.js"), "utf8"), "original")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
test("paths and repeated mutation fail closed", () => {
  assert.throws(() => confinedPath("/candidate", "../elsewhere"), /escapes/)
  assert.throws(() => confinedPath("/candidate", "/absolute"), /escapes/)
  assert.throws(() => confinedPath("/candidate", "."), /escapes/)
})
test("unfinished obligations are distinct from runnable accepted cells", () => {
  const accepted = buildAcceptanceCases.map((item) => item.id)
  assert.equal(new Set(accepted).size, accepted.length)
  assert(pendingAcceptanceCases.length > 0)
  assert(pendingAcceptanceCases.every((id) => !accepted.includes(id)))
})

test("rename rollback restores source and removes owned destination", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-acceptance-"))
  try {
    writeFileSync(join(root, "source.ts"), "original")
    const changes = new CandidateMutations(root, join(root, "backups"))
    changes.rename("source.ts", "renamed.ts")
    assert.equal(existsSync(join(root, "source.ts")), false)
    assert.equal(readFileSync(join(root, "renamed.ts"), "utf8"), "original")
    assert.equal(readFileSync(join(root, "backups/source.ts"), "utf8"), "original")
    assert.equal(changes.identities().length, 2)
    changes.restore()
    assert.equal(readFileSync(join(root, "source.ts"), "utf8"), "original")
    assert.equal(existsSync(join(root, "renamed.ts")), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rename never overwrites an existing destination", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-acceptance-"))
  try {
    writeFileSync(join(root, "source.ts"), "original")
    writeFileSync(join(root, "renamed.ts"), "another source")
    const changes = new CandidateMutations(root)
    assert.throws(() => changes.rename("source.ts", "renamed.ts"), /already present/)
    assert.equal(readFileSync(join(root, "source.ts"), "utf8"), "original")
    assert.equal(readFileSync(join(root, "renamed.ts"), "utf8"), "another source")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

const tarFile = (name, contents) => {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100)
  header.write(contents.length.toString(8).padStart(11, "0"), 124, 11)
  header.write("ustar", 257, 5)
  const data = Buffer.alloc(Math.ceil(contents.length / 512) * 512)
  data.write(contents)
  return Buffer.concat([header, data])
}
test("incomplete-cache fixture removes only the requested emitted member", () => {
  const kept = tarFile("dist/keep.js", "kept"),
    removed = tarFile("dist/drop.js", "removed")
  const original = zstdCompressSync(Buffer.concat([kept, removed, Buffer.alloc(1024)]))
  assert.deepEqual(
    zstdDecompressSync(omitCacheTarMember(original, "dist/drop.js")),
    Buffer.concat([kept, Buffer.alloc(1024)])
  )
  assert.throws(() => omitCacheTarMember(original, "dist/absent.js"), /absent/)
})
test("incomplete-cache fixture rejects unknown and truncated archive profiles", () => {
  assert.throws(() => omitCacheTarMember(zstdCompressSync(Buffer.from("short")), "dist/x.js"))
  const unknown = Buffer.alloc(1024, 1)
  assert.throws(() => omitCacheTarMember(zstdCompressSync(unknown), "dist/x.js"), /Unsupported/)
})

test("incomplete-cache fixture recognizes GNU metadata rather than treating it as a path prefix", () => {
  const kept = tarFile("packages/hook-entry/artifacts/linux-arm64/.assembly-receipt.json", "receipt")
  const removed = tarFile("packages/hook-entry/artifacts/linux-arm64/hapsland-hook", "executable")
  for (const member of [kept, removed]) {
    member.write("ustar  \0", 257, 8)
    member.write("00000000000", 345, 11)
  }
  const original = zstdCompressSync(Buffer.concat([kept, removed, Buffer.alloc(1024)]))
  assert.deepEqual(
    zstdDecompressSync(omitCacheTarMember(original, "packages/hook-entry/artifacts/linux-arm64/hapsland-hook")),
    Buffer.concat([kept, Buffer.alloc(1024)])
  )
})

test("mutation paths reject symlink-parent escapes", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-acceptance-"))
  const elsewhere = mkdtempSync(join(tmpdir(), "hapsland-other-"))
  try {
    writeFileSync(join(elsewhere, "source.ts"), "outside")
    symlinkSync(elsewhere, join(root, "linked"), "dir")
    assert.throws(() => new CandidateMutations(root).mutate("linked/source.ts", () => "wrong"), /symlink/)
    assert.equal(readFileSync(join(elsewhere, "source.ts"), "utf8"), "outside")
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(elsewhere, { recursive: true, force: true })
  }
})

test("phased acceptance preserves declared case order and rejects duplicates", () => {
  const ids = ["warm-repeat", "administration-only", "shared-implementation-unchanged-declarations"]
  assert.deepEqual(
    selectAcceptanceCases(ids).map((cell) => cell.id),
    ids
  )
  assert.throws(() => selectAcceptanceCases(["warm-repeat", "warm-repeat"]), /Repeated/)
  assert.throws(() => selectAcceptanceCases(["unsupported"]), /Unknown/)
})

test("created authored source is owned and removed only with matching bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-acceptance-"))
  try {
    const changes = new CandidateMutations(root)
    changes.create("new.ts", "owned source")
    assert.equal(readFileSync(join(root, "new.ts"), "utf8"), "owned source")
    changes.restore()
    assert.equal(existsSync(join(root, "new.ts")), false)
    changes.create("new.ts", "owned source")
    writeFileSync(join(root, "new.ts"), "other editor")
    assert.throws(() => changes.restore(), /Concurrent source edit/)
    assert.equal(readFileSync(join(root, "new.ts"), "utf8"), "other editor")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

for (const [id, states, source] of [
  ["watch-upstream-implementation", ["ready", "building", "drift", "ready", "ready"], '"Examples:"'],
  [
    "watch-used-public-interface-break-and-repair",
    ["ready", "failed", "ready"],
    'export type PackageRole = "cli" | "doctor" | "hook" | "parser" | "resident"'
  ],
  ["watch-upstream-output-deletion", ["ready", "building", "ready"], "emitted"],
  ["watch-manifest-drift", ["ready", "building", "drift", "ready", "ready"], '{"name":"@hapsland/hook-entry"}']
]) {
  test(`${id} requires correlated watch transitions and repaired behavior`, async () => {
    let current = source,
      restored = false
    const observed = [],
      probes = [],
      mutations = []
    const executable = (role) => ({
      sha256: id === "watch-upstream-implementation" && !restored && current !== source ? `changed-${role}` : role
    })
    let initial = true
    const outputs = () => ({
      executables: Object.fromEntries(["hook", "resident", "parser", "doctor"].map((role) => [role, executable(role)]))
    })
    const evidence = (name) => ({ path: name, sha256: name.endsWith("package.json") ? current : name })
    const context = {
      profile: "linux-arm64",
      outputs: () => {
        if (initial) {
          initial = false
          return {
            executables: Object.fromEntries(
              ["hook", "resident", "parser", "doctor"].map((role) => [role, { sha256: role }])
            )
          }
        }
        return outputs()
      },
      file: evidence,
      read: () => JSON.stringify({ context: { configuration: [evidence("packages/hook-entry/package.json")] } }),
      mutate: async (name, transform) => {
        mutations.push(name)
        current = transform(current)
      },
      update: async (name, transform) => {
        assert(mutations.includes(name))
        current = transform(current)
      },
      remove: async (name) => {
        mutations.push(name)
      },
      restore: async () => {
        current = source
        restored = true
      },
      hasExecutable: () => false,
      probe: async (role) => {
        probes.push(role)
        return {
          stdout:
            id === "watch-upstream-implementation" && !restored && current !== source
              ? "Acceptance watch implementation examples:"
              : "\nExamples:\n"
        }
      },
      probeHook: async () => probes.push("quiet-hook"),
      watch: async (scenario) => {
        await scenario({
          waitFor: async (state, after) => {
            if (state !== "ready" || observed.length) {
              assert(Number.isFinite(after))
            }
            observed.push(state)
            return { state, error: "Compiler rejected incompatible consumer" }
          }
        })
      }
    }
    await buildAcceptanceCases.find((cell) => cell.id === id).run(context)
    assert.deepEqual(observed, states)
    assert(restored)
    assert.equal(current, source)
    assert(probes.includes("quiet-hook"))
    assert(mutations.length > 0)
  })
}

test("watch drift updates retain original CAS ownership and refuse concurrent edits", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-watch-cas-"))
  try {
    const path = join(root, "source.ts")
    writeFileSync(path, "original")
    const changes = new CandidateMutations(root)
    changes.mutate("source.ts", () => "initial")
    changes.update("source.ts", () => "final")
    changes.restore()
    assert.equal(readFileSync(path, "utf8"), "original")
    changes.mutate("source.ts", () => "initial")
    writeFileSync(path, "other editor")
    assert.throws(() => changes.update("source.ts", () => "final"), /lost mutation ownership/)
    assert.throws(() => changes.restore(), /Concurrent/)
    assert.equal(readFileSync(path, "utf8"), "other editor")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("authored inventory includes ABI and config but never follows generated/cache output", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-authored-"))
  try {
    const owner = join(root, "packages/agent-flow-bend")
    mkdirSync(join(owner, "abi"), { recursive: true })
    mkdirSync(join(owner, "dist"))
    writeFileSync(join(owner, "ABI.bend"), "source")
    writeFileSync(join(owner, "package.json"), "{}")
    writeFileSync(join(owner, "canonical.generated.js"), "generated")
    writeFileSync(join(owner, "abi/canonical.generated.d.ts"), "authored ABI")
    symlinkSync("/does-not-exist", join(owner, "dist/ignored-cache"))
    assert.deepEqual(
      authoredInventory(root, owner).map((x) => x.path),
      [
        "packages/agent-flow-bend/abi/canonical.generated.d.ts",
        "packages/agent-flow-bend/ABI.bend",
        "packages/agent-flow-bend/package.json"
      ]
    )
    symlinkSync("/does-not-exist", join(owner, "escaped-source"))
    assert.throws(() => authoredInventory(root, owner), /symlink/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("permanent receipts deduplicate content, bound unique bytes and refuse modified evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-receipt-"))
  try {
    writeFileSync(join(root, "receipt.json"), ' {"inputs":[{"path":"source.ts","sha256":"abc"}]}\n')
    const bytes = readFileSync(join(root, "receipt.json"))
    const budget = { bytes: 0, maxBytes: bytes.length, seen: new Set() }
    const first = retainReceiptEvidence(root, "receipt.json", budget)
    writeFileSync(join(root, "other.json"), bytes)
    const second = retainReceiptEvidence(root, "other.json", budget)
    assert.equal(first.path, second.path)
    assert.equal(budget.bytes, bytes.length)
    assert(first.path.startsWith(".test-runs/build-243/build-acceptance-receipts/"))
    assert.deepEqual(readFileSync(join(root, first.path)), bytes)
    writeFileSync(join(root, "other.json"), '{"inputs":[]}')
    assert.throws(() => retainReceiptEvidence(root, "other.json", budget), /size bound/)
    writeFileSync(join(root, first.path), "{}")
    assert.throws(() => retainReceiptEvidence(root, "receipt.json"), /modified/)
    writeFileSync(join(root, "invalid.json"), "[]")
    assert.throws(() => retainReceiptEvidence(root, "invalid.json"), /Invalid/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("candidate freeze detects auxiliary verification edits and ignores produced outputs", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-candidate-"))
  try {
    for (const directory of [
      "scripts",
      "src",
      "packages/domain/src",
      "packages/domain/dist",
      "packages/agent-flow-bend",
      "native/src"
    ])
      mkdirSync(join(root, directory), { recursive: true })
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/domain", "scripts", "src"] }))
    for (const name of ["bun.lock", "tsconfig.json", "tsconfig.package.json", "tsconfig.packages.json", "turbo.json"])
      writeFileSync(join(root, name), "{}")
    for (const [directory, name, role] of [
      ["packages/domain", "@hapsland/domain", "production"],
      ["scripts", "@hapsland/build-tooling", "tooling"],
      ["src", "@hapsland/verification", "verification"]
    ])
      writeFileSync(
        join(root, directory, "package.json"),
        JSON.stringify({ name, private: true, type: "module", hapsland: { workspaceRole: role } })
      )
    writeFileSync(join(root, "packages/domain/tsconfig.json"), "{}")
    writeFileSync(join(root, "packages/domain/src/domain.ts"), "authored")
    writeFileSync(join(root, "src/consumer.test.ts"), "original check")
    const before = authoredCandidateIdentity(root)
    assert.deepEqual(
      before.auxiliaryWorkspaces.map((x) => x.name),
      ["@hapsland/build-tooling", "@hapsland/verification"]
    )
    assert(before.auxiliaryWorkspaces[1].authored.some((x) => x.path === "src/package.json"))
    writeFileSync(join(root, "packages/domain/dist/domain.js"), "new output")
    assert.deepEqual(authoredCandidateIdentity(root), before)
    writeFileSync(join(root, "src/consumer.test.ts"), "changed check")
    assert.notDeepEqual(authoredCandidateIdentity(root), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("warm proof uses actual Turbo metadata rather than replayed producer logs", () => {
  const tasks = [
    "@hapsland/hook-entry:build",
    ...["cli", "hook", "resident", "parser", "doctor"].map((role) => `@hapsland/${role}-entry:assemble:linux-arm64`),
    "@hapsland/pi-extension:assemble:host"
  ]
  const log =
    tasks.map((task) => `${task}: cache hit, replaying logs abc`).join("\n") +
    "\n@hapsland/hook-entry:assemble:linux-arm64: Assembling standalone linux-arm64/hapsland-hook: invoking Bun assembly process"
  assert.doesNotThrow(() => requireNoCompilation({ log }, "linux-arm64", tasks))
  for (const task of tasks) {
    assert.throws(
      () =>
        requireNoCompilation({ log: log.replace(`${task}: cache hit`, `${task}: cache miss`) }, "linux-arm64", tasks),
      /executed instead of restoring/
    )
    assert.throws(
      () =>
        requireNoCompilation({ log: log.replace(`${task}: cache hit, replaying logs abc`, "") }, "linux-arm64", tasks),
      /lacked actual Turbo cache evidence/
    )
  }
})

test("owner receipt inventory follows artifact ownership and rejects symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-artifact-receipts-"))
  try {
    mkdirSync(join(root, "packages/owner/artifacts/linux-arm64"), { recursive: true })
    writeFileSync(join(root, "packages/owner/artifacts/linux-arm64/native-receipt.json"), "{}")
    writeFileSync(join(root, "packages/owner/artifacts/linux-arm64/executable"), "bytes")
    assert.deepEqual(artifactReceiptPaths(root, "packages/owner/artifacts"), [
      "packages/owner/artifacts/linux-arm64/native-receipt.json"
    ])
    symlinkSync(
      join(root, "packages/owner/artifacts/linux-arm64/native-receipt.json"),
      join(root, "packages/owner/artifacts/escape.json")
    )
    assert.throws(() => artifactReceiptPaths(root, "packages/owner/artifacts"), /symlink/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("cache corruption uses retained ordinary task metadata without an identification rebuild", async () => {
  const cell = buildAcceptanceCases.find((item) => item.id === "corrupt-task-cache")
  const calls = []
  const context = {
    outputs: () => ({}),
    latestBuild: () => ({ success: true, log: "@hapsland/hook-entry:build: cache miss, executing abc123" }),
    taskCacheEvents: actualTaskCacheEvents,
    mutateBytes: async (path, transform) => {
      assert.equal(path, ".test-runs/turbo-cache/abc123.tar.zst")
      assert.notDeepEqual(transform(Buffer.from("original")), Buffer.from("original"))
      calls.push("mutate")
    },
    remove: async (path) => {
      assert.equal(path, "packages/hook-entry/dist/hook-main.js")
      calls.push("remove")
    },
    build: async (label) => {
      calls.push(label)
      return { success: false, log: "Invalid cache receipt" }
    },
    hasExecutable: () => false
  }
  await cell.run(context)
  assert.deepEqual(calls, ["mutate", "remove", "corrupt-task-cache"])
  await assert.rejects(cell.run({ ...context, latestBuild: () => ({ success: false }) }), /latest successful ordinary/)
  await assert.rejects(cell.run({ ...context, latestBuild: () => ({ success: true, log: "" }) }), /key not observed/)
})

test("successful generated-only repair can be omitted only with unchanged source and publication", () => {
  const candidateIdentity = { source: "original" },
    candidatePublished = { executable: "original" }
  const proof = {
    success: true,
    mutatedAuthored: false,
    authoredIdentity: { ...candidateIdentity },
    candidateIdentity,
    published: () => ({ ...candidatePublished }),
    candidatePublished
  }
  assert.equal(canSkipRepair(proof), true)
  for (const change of [
    { success: false },
    { mutatedAuthored: true },
    { authoredIdentity: { source: "changed" } },
    { published: () => ({ executable: "changed" }) },
    { environmentOverrides: { NODE_OPTIONS: "--no-warnings" } }
  ])
    assert.equal(canSkipRepair({ ...proof, ...change }), false)
})

test("undeclared-edge fixture preserves valid hook shebang and targets the workspace edge", async () => {
  const { parse } = await import("@babel/parser")
  const source = readFileSync(new URL("../packages/hook-entry/src/hook-main.ts", import.meta.url), "utf8")
  let changed
  await buildAcceptanceCases
    .find((cell) => cell.id === "undeclared-edge")
    .run({
      mutate: async (name, transform) => {
        assert.equal(name, "packages/hook-entry/src/hook-main.ts")
        changed = transform(source)
      },
      build: async (label, expected) => {
        assert.equal(label, "undeclared-edge")
        assert.equal(expected, false)
        const parsed = parse(changed, { sourceType: "module", plugins: ["typescript"] })
        assert.equal(parsed.program.interpreter.value, "/usr/bin/env bun")
        assert(
          parsed.program.body.some(
            (node) =>
              node.type === "ImportDeclaration" &&
              node.source.value === "@hapsland/administration/onboarding/native-architecture"
          )
        )
        return { success: false, log: "Undeclared workspace dependency" }
      },
      hasExecutable: () => false
    })
  assert(changed.startsWith("#!/usr/bin/env bun\n"))
})

test("failed or authored-mutated cells require repair without inspecting revoked publication", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-revoked-publication-"))
  try {
    const source = { unchanged: true }
    let inspected = false
    const proof = {
      success: true,
      mutatedAuthored: false,
      authoredIdentity: source,
      candidateIdentity: source,
      candidatePublished: {},
      published: () => {
        inspected = true
        return readFileSync(join(root, "dist/hapsland"))
      }
    }
    assert.equal(canSkipRepair({ ...proof, success: false }), false)
    assert.equal(canSkipRepair({ ...proof, mutatedAuthored: true }), false)
    assert.equal(inspected, false)
    assert.throws(() => canSkipRepair(proof), { code: "ENOENT" })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("crosscompile acceptance checks owner bytes and mapped public output with producer host identity", async () => {
  const cell = buildAcceptanceCases.find((item) => item.id === "target-change-crosscompile-only")
  const file = (path) => ({ path, mode: 493, sha256: "same-bytes" })
  const context = {
    build: async () => ({ success: true }),
    assemblyReceipt: (role) => ({
      context: {
        target: "bun-darwin-arm64",
        prerequisite: { toolchain: { platform: process.platform, architecture: process.arch } }
      },
      output: file(`owner/${role}`)
    }),
    assemblyOutputPath: (role) => `owner/${role}`,
    file,
    signature: () => "cffaedfe",
    hasExecutable: () => false
  }
  await cell.run(context)
  await assert.rejects(
    cell.run({
      ...context,
      file: (path) => ({ ...file(path), sha256: path.startsWith("dist/") ? "stale-public" : "same-bytes" })
    }),
    /Published output differs/
  )
  await assert.rejects(cell.run({ ...context, signature: () => "7f454c46" }), /Mach-O/)
})

test("incomplete assembly archive fixture supports legitimate executable members above 30MB", () => {
  const header = tarFile("owner/executable", "").subarray(0, 512)
  const length = 31 * 1024 * 1024
  header.write(length.toString(8).padStart(11, "0"), 124, 11)
  const original = zstdCompressSync(Buffer.concat([header, Buffer.alloc(length), Buffer.alloc(1024)]))
  assert.deepEqual(zstdDecompressSync(omitCacheTarMember(original, "owner/executable")), Buffer.alloc(1024))
})

test("acceptance tool probe returns actual selected version output and refuses expired campaigns", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-tool-probe-"))
  try {
    writeFileSync(join(root, "tool"), "#!/bin/sh\nprintf 'fixture-version\\n'\n")
    chmodSync(join(root, "tool"), 0o755)
    const result = await probeAcceptanceTool(root, "tool", ["--version"], 1000)
    assert.equal(result.stdout, "fixture-version\n")
    assert.equal(result.code, 0)
    await assert.rejects(probeAcceptanceTool(root, "tool", [], 0), /deadline expired/)
    await assert.rejects(probeAcceptanceTool(root, "../escape", [], 1000))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checker acceptance requires actual function invocation rather than replayed task logs", async () => {
  const cell = buildAcceptanceCases.find((item) => item.id === "checker-change")
  const expected = { path: "scripts/check-workspace-imports.mjs", mode: 420, sha256: "current-checker" }
  let marker
  const context = {
    mutate: async (_path, transform) => {
      const transformed = transform(readFileSync(join(import.meta.dirname, "check-workspace-imports.mjs"), "utf8"))
      const ast = parse(transformed, { sourceType: "module" })
      const declaration = ast.program.body.find(
        (node) =>
          node.type === "ExportNamedDeclaration" &&
          node.declaration?.declarations?.[0]?.id.name === "checkWorkspaceImports"
      )
      const statement = declaration.declaration.declarations[0].init.body.body[0]
      assert.equal(statement.expression.callee.object.name, "console")
      assert.equal(statement.expression.callee.property.name, "log")
      marker = statement.expression.arguments[0].value
    },
    file: () => expected,
    build: async () => ({
      success: true,
      log: marker + "\nPublished product: fresh source, compiler, native and artifact evidence verified\n"
    }),
    probe: async () => ({ code: 0 })
  }
  await cell.run(context)
  await assert.rejects(
    cell.run({ ...context, build: async () => ({ success: true, log: `@hapsland/hook-entry:build: ${marker}\n` }) }),
    /cached task replay is insufficient/
  )
})

test("assembly recovery permits rebuilt current bytes but rejects mixed pairs and changed cache-only restores", () => {
  const old = { path: "dist/bin/linux-arm64/hapsland-hook", mode: 493, sha256: "old" }
  const fresh = { ...old, sha256: "rebuilt" }
  const physical = { ...fresh, path: "owner/artifacts/hook" }
  const before = { release: [old], executables: { hook: old } }
  const context = {
    profile: "linux-arm64",
    outputs: () => ({ release: [fresh], executables: { hook: fresh } }),
    assemblyReceipt: () => ({ output: physical }),
    assemblyOutputPath: () => physical.path,
    file: () => physical,
    taskCacheEvents: () => [{ task: "@hapsland/hook-entry:assemble:linux-arm64", state: "miss" }]
  }
  requireRecoveredAssembly(context, before, { log: "" })
  assert.throws(
    () =>
      requireRecoveredAssembly(
        { ...context, assemblyReceipt: () => ({ output: { ...physical, sha256: "old" } }) },
        before,
        { log: "" }
      ),
    /incoherent/
  )
  assert.throws(
    () =>
      requireRecoveredAssembly(
        { ...context, taskCacheEvents: () => [{ task: "@hapsland/hook-entry:assemble:linux-arm64", state: "hit" }] },
        before,
        { log: "" }
      ),
    /Cache-only restoration/
  )
})

test("assembly cache and receipt fixtures own coherent pairs through actual CAS mutations", async () => {
  for (const id of ["corrupt-assembly-task-cache", "incomplete-assembly-receipt"]) {
    const root = mkdtempSync(join(tmpdir(), "hapsland-pair-cas-"))
    const exe = "packages/hook-entry/artifacts/linux-arm64/hapsland-hook"
    const receipt = "packages/hook-entry/artifacts/linux-arm64/assembly-receipt.json"
    const archive = ".test-runs/turbo-cache/abc123.tar.zst"
    const files = {
      [exe]: "original executable",
      [receipt]: JSON.stringify({ inputs: ["a", "b"] }),
      [archive]: "original archive"
    }
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    const mutations = new CandidateMutations(root)
    const context = {
      profile: "linux-arm64",
      outputs: () => ({}),
      latestBuild: () => ({ success: true, log: "" }),
      taskCacheEvents: () => [
        { task: "@hapsland/hook-entry:assemble:linux-arm64", state: "hit", detail: ", replaying logs abc123" }
      ],
      assemblyOutputPath: () => exe,
      assemblyReceiptPath: () => receipt,
      probe: async () => ({ stdout: "help" }),
      mutateBytes: (path, transform) => mutations.mutate(path, transform, true),
      mutate: (path, transform) => mutations.mutate(path, transform),
      remove: (path) => mutations.remove(path),
      read: (path) => readFileSync(join(root, path), "utf8"),
      build: async () => ({ success: false, log: "Missing receipt output" }),
      hasExecutable: () => false
    }
    try {
      await buildAcceptanceCases.find((cell) => cell.id === id).run(context)
      assert(mutations.identities().some((item) => item.path === exe))
      assert(mutations.identities().some((item) => item.path === receipt))
      mutations.restore()
      for (const [path, text] of Object.entries(files)) assert.equal(readFileSync(join(root, path), "utf8"), text)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("missing export and source fixtures accept only target-specific compiler refusals", async () => {
  const refusal = async (id, log) =>
    buildAcceptanceCases
      .find((cell) => cell.id === id)
      .run({
        mutate: async (_path, transform) => transform(JSON.stringify({ exports: { "./runtime/cli-information": {} } })),
        rename: async () => {},
        remove: async () => {},
        build: async () => ({ success: false, log }),
        hasExecutable: () => false
      })
  await refusal(
    "manifest-export-change",
    "error TS2307: Cannot find module '@hapsland/runtime-environment/runtime/cli-information' or its corresponding type declarations."
  )
  await assert.rejects(refusal("manifest-export-change", "error TS2307: Cannot find module 'unrelated-package'"))
  const actual = readFileSync(
    join(import.meta.dirname, "../packages/runtime-inputs/src/configuration/types.ts"),
    "utf8"
  )
  assert(actual.includes('from "../domain/rule-identity.ts"'))
  for (const id of ["source-delete", "source-rename"]) {
    await refusal(
      id,
      "error TS2307: Cannot find module '../domain/rule-identity.ts' or its corresponding type declarations."
    )
    await assert.rejects(refusal(id, "error TS2307: Cannot find module '../domain/unrelated.ts'"))
    await assert.rejects(refusal(id, "Error: missing unrelated artifact"))
  }
})

test("watch scenario budget covers multiple builds while respecting campaign remaining deadline", () => {
  assert.equal(watchScenarioBudget(1200000), 600000)
  assert.equal(watchScenarioBudget(240000), 240000)
  assert(watchScenarioBudget(1200000) > 300000, "Scenario budget must differ from one ordinary build limit")
  assert.throws(() => watchScenarioBudget(0), /deadline expired/)
})
