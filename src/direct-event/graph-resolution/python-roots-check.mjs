import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm, writeFile, mkdir, readFile, symlink } from "node:fs/promises"
import { join, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { parse } from "smol-toml"
import { tomlValue } from "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs"
import {
  createServiceSession,
  unlist
} from "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs"
const temp = await mkdtemp("/tmp/hapsland-python-roots-"),
  t = (name, fields = {}) => ({ $: "Types." + name, ...fields }),
  s = (name, fields = {}) => ({ $: "python-module/Session." + name, ...fields })
try {
  const emitted = join(temp, "child.mjs")
  execFileSync(
    "taskset",
    [
      "-c",
      "10",
      "bend",
      join(
        import.meta.dirname,
        "../../../packages/source-analysis/src/direct-event/graph-resolution/PythonModule.bend"
      ),
      "-o",
      emitted
    ],
    { timeout: 5000 }
  )
  const { default: child } = await import(pathToFileURL(emitted))
  const fixtures = [
    { name: "no-metadata", roots: [".", "src"] },
    { name: "default", metadata: '[project]\nname="x"', roots: [".", "src"] },
    { name: "declared", metadata: 'tool.setuptools.package-dir={""="lib"}', roots: [".", "src", "lib"] },
    { name: "deduplicated", metadata: 'tool.setuptools.package-dir={""="src"}', roots: [".", "src"] },
    { name: "trailing", metadata: 'tool.setuptools.package-dir={""="lib/"}', roots: [".", "src", "lib/"] },
    { name: "malformed", metadata: "this [ is invalid" },
    { name: "conflicting-policy", metadata: "[tool.poetry]" },
    { name: "setup-py", alternative: "setup.py" },
    { name: "setup-cfg", alternative: "setup.cfg" },
    { name: "metadata-directory", directory: true },
    { name: "metadata-symlink", link: true },
    { name: "metadata-excluded", excluded: true },
    { name: "capture-unavailable", metadata: "[project]", unavailable: true },
    { name: "parser-exception-after-store", metadata: "[project]", parserThrows: true },
    { name: "deadline", expired: true },
    { name: "zero-work", work: 0 }
  ]
  let requests = 0
  for (const [index, fixture] of fixtures.entries()) {
    const root = join(temp, String(index))
    await mkdir(root)
    if (fixture.metadata !== undefined) await writeFile(join(root, "pyproject.toml"), fixture.metadata)
    if (fixture.directory) await mkdir(join(root, "pyproject.toml"))
    if (fixture.link) {
      await writeFile(join(root, "actual.toml"), "")
      await symlink("actual.toml", join(root, "pyproject.toml"))
    }
    if (fixture.alternative) await writeFile(join(root, fixture.alternative), "")
    let started = false
    const operations = [],
      io = createServiceSession({
        invocation: index + 1,
        root,
        now: () => (fixture.expired && started ? 5000 : 0),
        selectContextPath: (path) => !(fixture.excluded && path === "pyproject.toml"),
        access: async (path) => ({ relativePath: path }),
        capture: async (selection) =>
          fixture.unavailable
            ? {
                status: "unavailable",
                diagnostic: { stage: "capture", code: "capture-unavailable", args: { reason: "missing" } }
              }
            : {
                status: "available",
                capture: {
                  text: await readFile(join(root, selection.relativePath), "utf8"),
                  byteLength: Buffer.byteLength(fixture.metadata ?? "")
                }
              },
        parseCargo: (source) => {
          if (fixture.parserThrows) throw new Error("parser observer failed")
          try {
            return tomlValue(parse(source))
          } catch {
            return undefined
          }
        }
      })
    try {
      const clock = (await io.perform(t("Request", { invocation: index + 1, id: 0, operation: t("StartClock") })))
        .outcome.clock
      started = true
      const cache = (
        await io.perform(t("Request", { invocation: index + 1, id: 1, operation: t("CreateInvocationCache") }))
      ).outcome.cache
      const state = child.initial_session(
        "root.py",
        1024n,
        4n,
        s("Remaining", {
          files: s("Nonnegative", { value: 10n }),
          read_bytes: s("Nonnegative", { value: 10000n }),
          work: s("Nonnegative", { value: BigInt(fixture.work ?? 40) })
        })
      )
      let step = child.absolute_roots(state, clock, cache, sep, BigInt(index + 1), 2n)
      while (step.$.endsWith(".Await")) {
        requests++
        operations.push(step.request.operation)
        step = child.resume_roots(step, await io.perform(step.request))
      }
      if (fixture.parserThrows) {
        assert.equal(step.$, "python-module/RootsMachine.Failed", fixture.name)
        assert.deepEqual(unlist(step.session.dependencies), ["pyproject.toml"])
        assert.equal(unlist(step.session.authority).length, 1)
        assert.equal(io.cacheSnapshot(cache).length, 1)
        assert.ok(step.next_request > 2n)
        continue
      }
      assert.equal(step.$, "python-module/RootsMachine.Returned", fixture.name)
      assert.deepEqual(step.roots.$ === "Some" ? unlist(step.roots.value) : undefined, fixture.roots, fixture.name)
      const repeated = child.absolute_roots(step.session, clock, cache, sep, BigInt(index + 1), step.next_request)
      assert.deepEqual(repeated, step, fixture.name + " repeated attempt")
      const probes = operations.filter((op) => op.$ === "Types.ReadPathMembership").map((op) => op.path)
      if (fixture.alternative === "setup.py") assert.deepEqual(probes, ["pyproject.toml", "setup.py"])
      if (fixture.roots) assert.deepEqual(probes, ["pyproject.toml", "setup.py", "setup.cfg"])
      if (fixture.metadata !== undefined && !fixture.unavailable)
        assert.deepEqual(
          unlist(step.session.dependencies),
          ["pyproject.toml"],
          fixture.name + " captures stay charged after unsupported metadata"
        )
    } finally {
      await io.close()
    }
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      cases: fixtures.length,
      requests,
      scope: "physical membership/native TOML with injected capture and selection; not full production GraphSession"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
