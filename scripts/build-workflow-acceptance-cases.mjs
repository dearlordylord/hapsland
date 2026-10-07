import assert from "node:assert/strict"
import { resolutionAcceptanceCases } from "./build-resolution-acceptance-cases.mjs"
import { watchAcceptanceCases } from "./build-watch-acceptance-cases.mjs"
import { zstdDecompressSync, zstdCompressSync } from "node:zlib"

export function omitCacheTarMember(bytes, target) {
  const tar = zstdDecompressSync(bytes, { maxOutputLength: 256 * 1024 * 1024 }),
    chunks = []
  let offset = 0,
    omitted = false
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) {
      chunks.push(tar.subarray(offset))
      offset = tar.length
      break
    }
    assert.equal(header.subarray(257, 262).toString(), "ustar", "Unsupported task cache archive profile")
    const field = (start, length) =>
      header
        .subarray(start, start + length)
        .toString()
        .split("\0")[0]
    // GNU tar stores atime/ctime at 345; only POSIX ustar uses that area as a path prefix.
    const name =
      header.subarray(257, 265).toString() === "ustar  \0"
        ? field(0, 100)
        : [field(345, 155), field(0, 100)].filter(Boolean).join("/")
    const sizeText = field(124, 12).trim()
    assert.match(sizeText, /^[0-7]+$/)
    const size = Number.parseInt(sizeText, 8),
      end = offset + 512 + Math.ceil(size / 512) * 512
    assert(end <= tar.length, "Incomplete task cache archive")
    if (name === target) {
      assert(!omitted, "Duplicate cache member")
      omitted = true
    } else chunks.push(tar.subarray(offset, end))
    offset = end
  }
  assert(omitted, "Required emitted member absent from original cache")
  assert.equal(offset, tar.length, "Unsupported trailing cache data")
  return zstdCompressSync(Buffer.concat(chunks))
}

const containsEvidence = (value, expected) => {
  if (!value || typeof value !== "object") return false
  if (value.path === expected.path && value.sha256 === expected.sha256 && value.mode === expected.mode) return true
  return Object.values(value).some((item) => containsEvidence(item, expected))
}

export function requireRecoveredAssembly(context, before, result, role = "hook") {
  const receipt = context.assemblyReceipt(role)
  const physical = context.file(context.assemblyOutputPath(role))
  assert.deepEqual(receipt.output, physical, "Recovered assembly executable and receipt are incoherent")
  const after = context.outputs()
  const published = after.executables[role]
  assert.deepEqual(
    { ...published, path: physical.path },
    physical,
    "Recovered assembly publication differs from physical artifact"
  )
  const task = `@hapsland/${role}-entry:assemble:${context.profile}`
  const rebuilt = context.taskCacheEvents(result.log).some((event) => event.task === task && event.state !== "hit")
  if (!rebuilt) assert.deepEqual(after, before, "Cache-only restoration changed cached bytes")
  else {
    const unchanged = (value) => ({
      release: value.release.filter((item) => item.path !== published.path),
      executables: Object.fromEntries(Object.entries(value.executables).filter(([name]) => name !== role))
    })
    assert.deepEqual(unchanged(after), unchanged(before), "Rebuilding affected assembly changed unrelated publication")
    assert.equal(published.mode, before.executables[role].mode, "Rebuilt executable mode changed")
  }
}

async function taskCacheCase(
  context,
  incomplete,
  task = "@hapsland/hook-entry:build",
  member = "packages/hook-entry/dist/hook-main.js"
) {
  const before = context.outputs(),
    identification = context.latestBuild()
  assert(identification?.success, "Cache mutation requires latest successful ordinary build evidence")
  const event = context
    .taskCacheEvents(identification.log)
    .find((entry) => entry.task === task && ["hit", "miss"].includes(entry.state))
  const key = /^, (?:replaying logs|executing) ([a-f0-9]+)$/.exec(event?.detail ?? "")?.[1]
  assert(key, `Current ${task} task cache key not observed`)
  const archive = `.test-runs/turbo-cache/${key}.tar.zst`
  const assembly = task.includes(":assemble:")
  const originalHelp = assembly ? (await context.probe("hook", ["--help"])).stdout : undefined
  if (assembly) await context.remove(context.assemblyReceiptPath("hook"))
  await context.mutateBytes(archive, (bytes) =>
    incomplete ? omitCacheTarMember(bytes, member) : Buffer.from("Corrupt acceptance task cache")
  )
  await context.remove(member)
  const result = await context.build(incomplete ? "incomplete-task-cache" : "corrupt-task-cache", null)
  if (result.success) {
    if (assembly) {
      requireRecoveredAssembly(context, before, result)
      assert.equal((await context.probe("hook", ["--help"])).stdout, originalHelp, "Rebuilt hook behavior changed")
    } else assert.deepEqual(context.outputs(), before, "Invalid task cache produced stale released bytes")
    assert(context.file(member))
    await context.probeHook()
  } else {
    assert.match(result.log, /cache|receipt|corrupt|missing|restore|output/i)
    assert.equal(context.hasExecutable("hook"), false, "Invalid task cache left publishable hook")
  }
}

export const buildAcceptanceCases = [
  ...watchAcceptanceCases,
  {
    id: "target-change-crosscompile-only",
    async run(context) {
      await context.build("target-change-crosscompile-only", true, { HAPSLAND_BUILD_PROFILE: "darwin-arm64" })
      for (const name of ["hapsland", "hapsland-hook", "hapsland-resident", "hapsland-parser", "hapsland-doctor"]) {
        const receipt = context.assemblyReceipt(
          name === "hapsland" ? "cli" : name.slice("hapsland-".length),
          "darwin-arm64"
        )
        assert.equal(receipt.context.target, "bun-darwin-arm64")
        assert.equal(
          receipt.context.prerequisite.toolchain.platform,
          process.platform,
          "Crosscompile must retain actual producer host identity"
        )
        const role = name === "hapsland" ? "cli" : name.slice("hapsland-".length)
        assert.equal(receipt.context.prerequisite.toolchain.architecture, process.arch)
        const physical = context.file(context.assemblyOutputPath(role, "darwin-arm64"))
        const published = context.file(`dist/bin/darwin-arm64/${name}`)
        assert.deepEqual(receipt.output, physical)
        assert.deepEqual(
          { ...published, path: physical.path },
          physical,
          "Published output differs from owner artifact"
        )
        assert(
          ["cffaedfe", "feedfacf"].includes(context.signature(`dist/bin/darwin-arm64/${name}`)),
          "Cross-target output is not thin Mach-O64"
        )
      }
      assert.equal(context.hasExecutable("hook"), false, "Target change reused native-profile release executable")
      // No Darwin executable is launched on this Linux host. Runtime support remains unverified.
    }
  },
  {
    id: "toolchain-byte-change",
    async run(context) {
      const before = JSON.parse(context.read(".test-runs/build-toolchain.json")).bun
      const version = await context.probeTool(before.path, ["--version"])
      await context.mutateBytes(before.path, (bytes) =>
        Buffer.concat([bytes, Buffer.from("\nHapsland build acceptance tool identity marker.\n")])
      )
      const mutatedVersion = await context.probeTool(before.path, ["--version"])
      assert.equal(mutatedVersion.stdout, version.stdout, "Byte mutation changed selected tool runtime version")
      const result = await context.build("toolchain-byte-change")
      for (const role of ["cli", "hook", "resident", "parser", "doctor"]) {
        const task = `@hapsland/${role}-entry:assemble:${context.profile}`
        assert(
          context.taskCacheEvents(result.log).some((event) => event.task === task && event.state !== "hit"),
          "Changed Bun bytes restored prior assembly task"
        )
      }
      const after = JSON.parse(context.read(".test-runs/build-toolchain.json")).bun
      assert.notEqual(after.sha256, before.sha256, "Selected Bun bytes did not invalidate tool identity")
      assert.deepEqual(after, context.file(before.path))
      for (const role of ["hook", "resident", "parser", "doctor"]) {
        const receipt = context.assemblyReceipt(role)
        assert.deepEqual(receipt.context.executable, after, "Assembly reused prior selected tool bytes")
        await context.probe(role, ["--version"])
      }
    }
  },
  {
    id: "dependency-byte-change",
    async run(context) {
      const before = JSON.parse(context.read(".test-runs/build-toolchain.json")).dependencies
      await context.mutate(
        "node_modules/effect/dist/Effect.js",
        (text) => text + "\n// Build acceptance changes dependency bytes with unchanged exports.\n"
      )
      const result = await context.build("dependency-byte-change")
      const after = JSON.parse(context.read(".test-runs/build-toolchain.json")).dependencies
      assert.notEqual(after, before, "Dependency byte mutation did not invalidate strong identity")
      for (const role of ["hook", "resident", "parser", "doctor"]) {
        const receipt = context.assemblyReceipt(role)
        assert(
          context
            .taskCacheEvents(result.log)
            .some(
              (event) => event.task === `@hapsland/${role}-entry:assemble:${context.profile}` && event.state !== "hit"
            ),
          "Changed runtime dependency restored stale assembly"
        )
        assert.equal(
          receipt.context.prerequisite.toolchain.dependencies,
          after,
          "Assembly reused prior dependency identity"
        )
        await context.probe(role, ["--version"])
      }
    }
  },
  {
    id: "native-input-change",
    async run(context) {
      const source = "native/src/inspection-lock.c"
      await context.mutate(
        source,
        (text) => text + "\n/* Build acceptance changes native compiler input identity. */\n"
      )
      const expected = context.file(source)
      const result = await context.build("native-input-change")
      const artifact = context.nativeArtifact(source)
      const event = context.taskCacheEvents(result.log).find((item) => item.task === artifact.task)
      assert(event && event.state !== "hit", "Changed native source restored stale task archive")
      const receipt = JSON.parse(context.read(artifact.receipt))
      assert(containsEvidence(receipt, expected), "Native receipt omitted mutated source contribution")
      await context.probeHook()
    }
  },
  {
    id: "build-adapter-change",
    async run(context) {
      const adapter = "scripts/compile-standalone.mjs"
      await context.mutate(adapter, (text) => text + "\n// Build acceptance changes executable adapter identity.\n")
      const expected = context.file(adapter)
      const result = await context.build("build-adapter-change")
      assert.doesNotMatch(result.log, /:build: cache miss/)
      for (const role of ["hook", "resident", "parser", "doctor"]) {
        const receipt = context.assemblyReceipt(role)
        assert.deepEqual(
          receipt.context.prerequisite.configuration.find((input) => input.path === adapter),
          expected
        )
        await context.probe(role, ["--version"])
      }
    }
  },
  {
    id: "boundary-policy-change",
    async run(context) {
      await context.mutate("package.json", (text) => {
        const manifest = JSON.parse(text)
        manifest.hapsland.buildBoundaries["standalone-hook"].forbiddenExternalPackages.push("effect")
        return JSON.stringify(manifest, null, 2) + "\n"
      })
      const result = await context.build("boundary-policy-change", false)
      assert.match(result.log, /effect|forbidden|boundary/i)
      assert.equal(context.hasExecutable("hook"), false, "Warm task cache bypassed tightened source policy")
    }
  },
  {
    id: "checker-change",
    async run(context) {
      const checker = "scripts/check-workspace-imports.mjs"
      const marker = `Hapsland acceptance checker invoked ${Date.now()}-${process.pid}`
      await context.mutate(checker, (text) => {
        const entry = "export const checkWorkspaceImports = (root) => {"
        assert(text.includes(entry), "Checker invocation fixture entry changed")
        return text.replace(entry, entry + `\n  console.log(${JSON.stringify(marker)})`)
      })
      const expected = context.file(checker)
      const result = await context.build("checker-change")
      assert(result.success, "Fresh checker gate must complete before publication")
      assert(
        result.log.split(/\r?\n/).includes(marker),
        "Fresh checker invocation marker absent; cached task replay is insufficient"
      )
      assert.deepEqual(context.file(checker), expected, "Checker bytes changed during ordinary invocation")
      for (const role of ["hook", "resident", "parser", "doctor"]) {
        await context.probe(role, ["--version"])
      }
    }
  },
  { id: "corrupt-task-cache", run: (context) => taskCacheCase(context, false) },
  { id: "incomplete-task-cache", run: (context) => taskCacheCase(context, true) },
  {
    id: "incomplete-interaction-task-cache",
    run: (context) =>
      taskCacheCase(
        context,
        true,
        "@hapsland/administration:build",
        "packages/administration/dist/interaction/selection.js"
      )
  },
  {
    id: "corrupt-assembly-task-cache",
    run: (context) =>
      taskCacheCase(
        context,
        false,
        `@hapsland/hook-entry:assemble:${context.profile}`,
        context.assemblyOutputPath("hook")
      )
  },
  {
    id: "incomplete-assembly-task-cache",
    run: (context) =>
      taskCacheCase(
        context,
        true,
        `@hapsland/hook-entry:assemble:${context.profile}`,
        context.assemblyOutputPath("hook")
      )
  },
  {
    id: "incomplete-assembly-receipt",
    async run(context) {
      const before = context.outputs()
      await context.remove(context.assemblyOutputPath("hook"))
      await context.mutate(context.assemblyReceiptPath("hook"), (text) => {
        const receipt = JSON.parse(text)
        assert(receipt.inputs.length > 1)
        receipt.inputs.pop()
        return JSON.stringify(receipt, null, 2) + "\n"
      })
      const result = await context.build("incomplete-assembly-receipt", null)
      if (result.success) {
        requireRecoveredAssembly(context, before, result)
        await context.probeHook()
      } else {
        assert.match(result.log, /integrity|digest|receipt|contribution/i)
        assert.equal(context.hasExecutable("hook"), false, "Incomplete receipt permitted stale release")
      }
    }
  },
  {
    id: "clean-dependency-order",
    async run(context) {
      const before = context.outputs()
      for (const owner of context.owners) {
        const directory = owner.manifest.path.slice(0, -"package.json".length)
        for (const output of context.inventory(directory + "dist")) await context.remove(output.path)
      }
      const result = await context.build("clean-dependency-order", true, { TURBO_FORCE: "true" })
      assert.match(result.log, /force executing|cache miss/)
      for (const owner of context.owners) {
        const directory = owner.manifest.path.slice(0, -"package.json".length)
        if (owner.compiler === "native") continue
        const receipt = JSON.parse(
          context.read(
            directory + (owner.compiler === "bend" ? "dist/.bend-receipt.json" : "dist/.compile-receipt.json")
          )
        )
        for (const input of receipt.inputs)
          assert.deepEqual(context.file(input.path), input, "Consumer compiled against stale dependency input")
      }
      const after = context.outputs()
      const executablePaths = new Set(Object.values(after.executables).map((item) => item.path))
      assert.deepEqual(
        after.release.filter((item) => !executablePaths.has(item.path)),
        before.release.filter((item) => !executablePaths.has(item.path)),
        "Clean compilation changed unrelated release artifacts"
      )
      for (const role of ["cli", "hook", "resident", "parser", "doctor"]) {
        const physical = context.file(context.assemblyOutputPath(role))
        assert.deepEqual(context.assemblyReceipt(role).output, physical)
        assert.deepEqual({ ...after.executables[role], path: physical.path }, physical)
        assert.equal(after.executables[role].mode, before.executables[role].mode)
        const event = context
          .taskCacheEvents(result.log)
          .find((item) => item.task === `@hapsland/${role}-entry:assemble:${context.profile}`)
        if (event?.state === "hit")
          assert.deepEqual(
            after.executables[role],
            before.executables[role],
            "Cache restoration changed executable bytes"
          )
      }
      await context.probeHook()
    }
  },
  {
    id: "environment-change",
    async run(context) {
      const result = await context.build("environment-change", true, { NODE_OPTIONS: "--no-warnings" })
      assert.match(result.log, /:build: cache miss/)
      for (const role of ["hook", "resident", "parser", "doctor"]) {
        const receipt = context.assemblyReceipt(role)
        assert.equal(receipt.context.environment.NODE_OPTIONS, "--no-warnings")
        await context.probe(role, ["--version"])
      }
    }
  },
  {
    id: "host-asset-change",
    async run(context) {
      const source = "packages/review-definition/src/rules/defaults/absence_confusion.json"
      await context.mutate(source, (text) => {
        const rule = JSON.parse(text)
        rule.message = "Build acceptance observes current host asset."
        return JSON.stringify(rule, null, 2) + "\n"
      })
      await context.build("host-asset-change")
      const packaged = JSON.parse(context.read("dist/rules/defaults/absence_confusion.json"))
      assert.equal(packaged.message, "Build acceptance observes current host asset.")
      await context.probe("hook", ["--version"])
    }
  },
  {
    id: "manifest-dependency-change",
    async run(context) {
      await context.mutate("packages/hook-entry/package.json", (text) => {
        const manifest = JSON.parse(text)
        manifest.dependencies["@hapsland/acceptance-missing-owner"] = "workspace:*"
        return JSON.stringify(manifest, null, 2) + "\n"
      })
      const result = await context.build("manifest-dependency-change", false)
      assert.match(result.log, /unknown|missing|undeclared|workspace|owner/i)
      assert.equal(context.hasExecutable("hook"), false)
    }
  },
  {
    id: "manifest-export-change",
    async run(context) {
      await context.mutate("packages/runtime-environment/package.json", (text) => {
        const manifest = JSON.parse(text)
        assert(manifest.exports["./runtime/cli-information"])
        delete manifest.exports["./runtime/cli-information"]
        return JSON.stringify(manifest, null, 2) + "\n"
      })
      const result = await context.build("manifest-export-change", false)
      assert.match(result.log, /TS2307: Cannot find module '@hapsland\/runtime-environment\/runtime\/cli-information'/)
      assert.equal(context.hasExecutable("hook"), false)
    }
  },
  {
    id: "generated-config-drift",
    async run(context) {
      await context.mutate("packages/hook-entry/tsconfig.json", (text) => {
        const configuration = JSON.parse(text)
        assert(configuration.references.length > 0)
        configuration.references = []
        return JSON.stringify(configuration, null, 2) + "\n"
      })
      const result = await context.build("generated-config-drift", false)
      assert.match(result.log, /config|stale|generated|reference/i)
      assert.equal(context.hasExecutable("hook"), false)
    }
  },

  {
    id: "source-rename",
    async run(context) {
      await context.rename(
        "packages/runtime-inputs/src/domain/rule-identity.ts",
        "packages/runtime-inputs/src/domain/acceptance-renamed-rule-identity.ts"
      )
      const result = await context.build("source-rename", false)
      assert.match(
        result.log,
        /TS2307: Cannot find module '[^'\n]*\/rule-identity\.(?:ts|js)'|(?:missing|not found|ENOENT|resolve)[^\n]*rule-identity|rule-identity[^\n]*(?:missing|not found|ENOENT|resolve)/i
      )
      assert.equal(context.hasExecutable("hook"), false, "Renamed upstream source left released hook")
    }
  },
  {
    id: "source-delete",
    async run(context) {
      await context.remove("packages/runtime-inputs/src/domain/rule-identity.ts")
      const result = await context.build("source-delete", false)
      assert.match(
        result.log,
        /TS2307: Cannot find module '[^'\n]*\/rule-identity\.(?:ts|js)'|(?:missing|not found|ENOENT|resolve)[^\n]*rule-identity|rule-identity[^\n]*(?:missing|not found|ENOENT|resolve)/i
      )
      assert.equal(context.hasExecutable("hook"), false, "Deleted upstream source left released hook")
    }
  },
  {
    id: "shared-implementation-unchanged-declarations",
    async run(context) {
      const before = context.outputs()
      const declaration = context.file("packages/runtime-environment/dist/runtime/cli-information.d.ts")
      await context.mutate("packages/runtime-environment/src/runtime/cli-information.ts", (text) => {
        assert.equal(text.split('"Examples:"').length, 2)
        return text.replace('"Examples:"', '"Acceptance examples:"')
      })
      await context.build("shared-implementation")
      assert.deepEqual(
        context.file("packages/runtime-environment/dist/runtime/cli-information.d.ts"),
        declaration,
        "Shared implementation mutation unexpectedly changed public declarations"
      )
      const after = context.outputs()
      for (const role of ["hook", "resident", "parser", "doctor"]) {
        assert.notEqual(
          after.executables[role].sha256,
          before.executables[role].sha256,
          `${role} failed to embed changed shared implementation`
        )
        const result = await context.probe(role, ["--help"])
        assert.match(result.stdout, /Acceptance examples:/, `${role} executes stale shared code`)
      }
    }
  },
  {
    id: "used-public-type-break-and-repair",
    async run(context) {
      await context.mutate("packages/runtime-environment/src/runtime/package-runtime.ts", (text) => {
        const declaration = 'export type PackageRole = "cli" | "doctor" | "hook" | "parser" | "resident"'
        assert.equal(text.split(declaration).length, 2)
        return text.replace(declaration, 'export type PackageRole = "cli" | "doctor" | "parser" | "resident"')
      })
      const result = await context.build("used-public-type-break", false)
      assert.match(result.log, /not assignable|TS2322|TS2345/)
      assert.equal(context.hasExecutable("hook"), false, "Incompatible public interface left released hook")
    }
  },
  {
    id: "warm-repeat",
    async run(context) {
      const before = context.outputs()
      const result = await context.build("warm-repeat")
      assert.deepEqual(context.outputs(), before, "Warm build changed released bytes or modes")
      context.requireNoCompilation(result)
    }
  },
  {
    id: "administration-only",
    async run(context) {
      const before = context.outputs()
      await context.mutate("packages/administration/src/onboarding/native-architecture.ts", (text) => {
        assert.equal(text.split('architecture === "arm64" ? 183 : 62').length, 2)
        return text.replace('architecture === "arm64" ? 183 : 62', 'architecture === "arm64" ? 184 : 62')
      })
      const result = await context.build("administration-only")
      const after = context.outputs()
      for (const role of ["hook", "resident", "parser"]) {
        assert.deepEqual(after.executables[role], before.executables[role], `${role} changed for administration edit`)
        context.requireTaskHits(result, [
          `@hapsland/${role}-entry:build`,
          `@hapsland/${role}-entry:assemble:${context.profile}`
        ])
      }
      assert.notEqual(
        after.executables.doctor.sha256,
        before.executables.doctor.sha256,
        "Doctor failed to embed administration change"
      )
    }
  },
  {
    id: "administration-interaction-only",
    async run(context) {
      const before = context.outputs()
      const pi = context.inventory("packages/pi-extension/artifacts/host")
      const source = "packages/administration/src/interaction/selection.ts"
      await context.mutate(source, (text) => {
        assert.equal(text.split('"Space: select"').length, 2)
        return text.replace('"Space: select"', '"Space: acceptance selection"')
      })
      const result = await context.build("administration-interaction-only")
      const after = context.outputs()
      for (const task of [
        "@hapsland/administration:build",
        "@hapsland/cli-entry:build",
        `@hapsland/cli-entry:assemble:${context.profile}`
      ]) {
        assert(
          context.taskCacheEvents(result.log).some((event) => event.task === task && event.state === "miss"),
          `Interaction edit failed to rebuild ${task}`
        )
      }
      assert.notEqual(
        after.executables.cli.sha256,
        before.executables.cli.sha256,
        "Administration executable omitted the changed interaction implementation"
      )
      const emitted = source.replace("/src/", "/dist/").replace(/\.ts$/, ".js")
      assert.match(context.read(emitted), /Space: acceptance selection/)
      assert(
        context
          .assemblyReceipt("cli")
          .inputs.some((input) => input.path === emitted && input.sha256 === context.file(emitted).sha256),
        "Administration assembly lacks the current interaction input"
      )
      for (const role of ["hook", "resident", "parser"]) {
        assert.deepEqual(after.executables[role], before.executables[role], `${role} changed for interaction edit`)
        context.requireTaskHits(result, [
          `@hapsland/${role}-entry:build`,
          `@hapsland/${role}-entry:assemble:${context.profile}`
        ])
      }
      context.requireTaskHits(result, ["@hapsland/pi-extension:build", "@hapsland/pi-extension:assemble:host"])
      assert.deepEqual(
        context.inventory("packages/pi-extension/artifacts/host"),
        pi,
        "Interaction edit changed host-loaded Pi artifacts"
      )
      await context.probeHook()
    }
  },
  {
    id: "undeclared-edge",
    async run(context) {
      await context.mutate(
        "packages/hook-entry/src/hook-main.ts",
        (text) => `${text}\nimport "@hapsland/administration/onboarding/native-architecture"\n`
      )
      const result = await context.build("undeclared-edge", false)
      assert.match(result.log, /undeclared|forbidden|export|boundary/i)
      assert.equal(context.hasExecutable("hook"), false, "Undeclared source edge left publishable hook")
    }
  },
  {
    id: "upstream-failure",
    async run(context) {
      await context.mutate(
        "packages/runtime-inputs/src/domain/rule-identity.ts",
        (text) => `${text}\nconst acceptanceTypeError: never = 1\nvoid acceptanceTypeError\n`
      )
      const result = await context.build("upstream-failure", false)
      assert.match(result.log, /not assignable|TS2322/)
      assert.equal(context.hasExecutable("hook"), false, "Failed root build left publishable hook executable")
    }
  },
  {
    id: "missing-emitted-and-executable",
    async run(context) {
      const before = context.outputs()
      await context.remove("packages/runtime-inputs/dist/domain/rule-identity.js")
      await context.remove(`dist/bin/${context.profile}/hapsland-hook`)
      const result = await context.build("missing-emitted-and-executable")
      assert.deepEqual(context.outputs(), before, "Restored artifacts differ from original current outputs")
      context.requireNoCompilation(result)
      await context.probeHook()
    }
  },
  ...resolutionAcceptanceCases
]

// These are obligations, not passing cells. The runner preserves this inventory in evidence.
export const pendingAcceptanceCases = ["platform-host-change-unverified"]
