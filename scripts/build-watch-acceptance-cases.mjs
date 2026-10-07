import assert from "node:assert/strict"

const information = "packages/runtime-environment/src/runtime/cli-information.ts"
const publicInterface = "packages/runtime-environment/src/runtime/package-runtime.ts"
const roles = ["hook", "resident", "parser", "doctor"]

async function originalBehavior(context) {
  for (const role of roles) {
    const result = await context.probe(role, ["--help"])
    assert.match(result.stdout, /\nExamples:\n/)
    assert.doesNotMatch(result.stdout, /Acceptance watch/)
  }
  await context.probeHook()
}

async function restoreReady(context, watch) {
  const changedAt = Date.now()
  await context.restore()
  await watch.waitFor("ready", changedAt)
  await originalBehavior(context)
}

export const watchAcceptanceCases = [
  {
    id: "watch-upstream-implementation",
    async run(context) {
      await context.watch(async (watch) => {
        await watch.waitFor("ready")
        const before = context.outputs()
        const declaration = context.file("packages/runtime-environment/dist/runtime/cli-information.d.ts")
        let changedAt = Date.now()
        await context.mutate(information, (text) => {
          assert.equal(text.split('"Examples:"').length, 2)
          return text.replace('"Examples:"', '"Acceptance watch initial implementation examples:"')
        })
        await watch.waitFor("building", changedAt)
        changedAt = Date.now()
        await context.update(information, (text) =>
          text.replace(
            '"Acceptance watch initial implementation examples:"',
            '"Acceptance watch implementation examples:"'
          )
        )
        await watch.waitFor("drift", changedAt)
        await watch.waitFor("ready", changedAt)
        assert.deepEqual(context.file("packages/runtime-environment/dist/runtime/cli-information.d.ts"), declaration)
        const after = context.outputs()
        for (const role of roles) {
          assert.notEqual(after.executables[role].sha256, before.executables[role].sha256)
          assert.match((await context.probe(role, ["--help"])).stdout, /Acceptance watch implementation examples:/)
        }
        await context.probeHook()
        await restoreReady(context, watch)
      })
    }
  },
  {
    id: "watch-used-public-interface-break-and-repair",
    async run(context) {
      await context.watch(async (watch) => {
        await watch.waitFor("ready")
        const changedAt = Date.now()
        await context.mutate(publicInterface, (text) => {
          const original = 'export type PackageRole = "cli" | "doctor" | "hook" | "parser" | "resident"'
          assert.equal(text.split(original).length, 2)
          return text.replace(original, 'export type PackageRole = "cli" | "doctor" | "parser" | "resident"')
        })
        const failed = await watch.waitFor("failed", changedAt)
        assert.equal(typeof failed.error, "string")
        assert.equal(context.hasExecutable("hook"), false, "Incompatible watch interface left publishable hook")
        await restoreReady(context, watch)
      })
    }
  },
  {
    id: "watch-upstream-output-deletion",
    async run(context) {
      await context.watch(async (watch) => {
        await watch.waitFor("ready")
        const before = context.outputs()
        const emitted = "packages/runtime-inputs/dist/domain/rule-identity.js"
        const originalEmitted = context.file(emitted)
        const changedAt = Date.now()
        await context.remove(emitted)
        await context.remove(`dist/bin/${context.profile}/hapsland-hook`)
        await watch.waitFor("building", changedAt)
        await watch.waitFor("ready", changedAt)
        assert.deepEqual(context.file(emitted), originalEmitted, "Watch did not restore upstream emitted bytes")
        assert.deepEqual(context.outputs(), before, "Watch published different bytes after output deletion")
        await originalBehavior(context)
        await context.restore()
      })
    }
  },
  {
    id: "watch-manifest-drift",
    async run(context) {
      await context.watch(async (watch) => {
        await watch.waitFor("ready")
        const manifestPath = "packages/hook-entry/package.json"
        let changedAt = Date.now()
        await context.mutate(manifestPath, (text) => {
          const manifest = JSON.parse(text)
          manifest.description = "Acceptance watch initial manifest"
          return JSON.stringify(manifest, null, 2) + "\n"
        })
        await watch.waitFor("building", changedAt)
        changedAt = Date.now()
        await context.update(manifestPath, (text) => {
          const manifest = JSON.parse(text)
          manifest.description = "Acceptance watch final manifest"
          return JSON.stringify(manifest, null, 2) + "\n"
        })
        await watch.waitFor("drift", changedAt)
        await watch.waitFor("ready", changedAt)
        const receipt = JSON.parse(context.read("packages/hook-entry/dist/.compile-receipt.json"))
        assert.deepEqual(
          receipt.context.configuration.find((input) => input.path === manifestPath),
          context.file(manifestPath)
        )
        await originalBehavior(context)
        await restoreReady(context, watch)
      })
    }
  }
]
