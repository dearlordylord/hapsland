import assert from "node:assert/strict"

const ownerManifest = "packages/runtime-environment/package.json"
const informationSource = "packages/runtime-environment/src/runtime/cli-information.ts"
const informationSpecifier = "@hapsland/runtime-environment/runtime/cli-information"
const hookSource = "packages/hook-entry/src/hook-main.ts"
const marker = "Resolved subpath acceptance examples:"
const json = (value) => JSON.stringify(value, null, 2) + "\n"
const replaceExactly = (text, before, after) => {
  assert.equal(text.split(before).length, 2, `Expected one resolution fixture anchor: ${before}`)
  return text.replace(before, after)
}

async function requireRejected(context, label, diagnostic) {
  const result = await context.build(label, false)
  assert.equal(result.success, false, "Unsupported resolution unexpectedly built")
  assert.match(result.log, diagnostic)
  assert.equal(context.hasExecutable("hook"), false, "Rejected resolution left a publishable hook")
}

// These definitions require the real ordinary-build runner. Rollback and the
// subsequent ordinary repair build belong to that runner, not these cells.
export const resolutionAcceptanceCases = [
  {
    id: "exact-subpath-retarget-behavior",
    async run(context) {
      const target = "packages/runtime-environment/src/runtime/acceptance-cli-information.ts"
      await context.create(
        target,
        replaceExactly(context.read(informationSource), '"Examples:"', JSON.stringify(marker))
      )
      await context.mutate(ownerManifest, (text) => {
        const manifest = JSON.parse(text)
        assert.deepEqual(manifest.exports["./runtime/cli-information"], {
          types: "./dist/runtime/cli-information.d.ts",
          default: "./dist/runtime/cli-information.js"
        })
        manifest.exports["./runtime/cli-information"] = {
          types: "./dist/runtime/acceptance-cli-information.d.ts",
          default: "./dist/runtime/acceptance-cli-information.js"
        }
        return json(manifest)
      })
      await context.build("exact-subpath-retarget-behavior")
      assert.match(
        context.read("packages/runtime-environment/dist/runtime/acceptance-cli-information.js"),
        /Resolved subpath acceptance examples:/
      )
      for (const role of ["hook", "resident", "parser", "doctor"]) {
        const receipt = context.assemblyReceipt(role)
        assert(
          receipt.inputs.some((input) => input.path === target.replace("/src/", "/dist/").replace(/\.ts$/, ".js")),
          `${role} omitted the selected emitted subpath target`
        )
        const result = await context.probe(role, ["--help"])
        assert.match(
          result.stdout,
          /Resolved subpath acceptance examples:/,
          `${role} executed the previous subpath target`
        )
      }
      await context.probeHook()
    },
    verifyRepair(context) {
      const stale = context
        .inventory("packages/runtime-environment/dist")
        .filter((item) => /(?:^|\/)acceptance-cli-information\.(?:js|js\.map|d\.ts|d\.ts\.map)$/.test(item.path))
      assert.deepEqual(stale, [], "Ordinary source-revert repair retained removed subpath emitted members")
    }
  },
  {
    id: "unsupported-workspace-node-condition",
    async run(context) {
      await context.mutate(ownerManifest, (text) => {
        const manifest = JSON.parse(text)
        const exported = manifest.exports["./runtime/cli-information"]
        assert(exported)
        // Even an equivalent node branch is unsupported by the exact
        // types/default workspace profile and must never be silently ignored.
        manifest.exports["./runtime/cli-information"] = {
          types: exported.types,
          node: exported.default,
          default: exported.default
        }
        return json(manifest)
      })
      await requireRejected(context, "unsupported-workspace-node-condition", /unsupported workspace export conditions/i)
    }
  },
  {
    id: "unsupported-typescript-module-alias",
    async run(context) {
      await context.mutate("tsconfig.package.json", (text) => {
        const configuration = JSON.parse(text)
        configuration.compilerOptions = {
          ...configuration.compilerOptions,
          paths: {
            ...configuration.compilerOptions?.paths,
            "@acceptance/information": ["./" + informationSource.replace("/src/", "/dist/").replace(/\.ts$/, ".d.ts")]
          }
        }
        return json(configuration)
      })
      await context.mutate(hookSource, (text) =>
        replaceExactly(text, JSON.stringify(informationSpecifier), '"@acceptance/information"')
      )
      await requireRejected(
        context,
        "unsupported-typescript-module-alias",
        /undeclared dependency|unsupported.*(?:alias|paths|baseUrl)/i
      )
    }
  },
  {
    id: "unsupported-package-imports-alias",
    async run(context) {
      await context.mutate("packages/hook-entry/package.json", (text) => {
        const manifest = JSON.parse(text)
        manifest.imports = { ...manifest.imports, "#acceptance-information": informationSpecifier }
        return json(manifest)
      })
      await context.mutate(hookSource, (text) =>
        replaceExactly(text, JSON.stringify(informationSpecifier), '"#acceptance-information"')
      )
      await requireRejected(
        context,
        "unsupported-package-imports-alias",
        /undeclared dependency|unsupported.*(?:alias|imports)/i
      )
    }
  }
]
