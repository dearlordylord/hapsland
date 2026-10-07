import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect } from "effect"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  prepareResidentDirectory,
  residentPaths,
  resolveResidentPaths,
  verifyRemovableSocket
} from "@hapsland/resident-transport/resident/paths"

const directory = Effect.fn("ResidentEndpointFixture.directory")(function* () {
  const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "hapsland-endpoint-")))
  yield* Effect.addFinalizer(() => Effect.promise(() => rm(root, { recursive: true, force: true })))
  return root
})

it.effect("allows an absent socket pathname after private directory preparation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const paths = residentPaths(yield* directory())
      yield* prepareResidentDirectory(paths)
      yield* verifyRemovableSocket(paths)
    })
  )
)

for (const kind of ["regular", "dangling-symlink"] as const) {
  it.effect(`refuses to remove a ${kind} pathname`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const paths = residentPaths(yield* directory())
        if (kind === "regular")
          yield* Effect.promise(() => writeFile(paths.socket, "retained fixture", { mode: 0o600 }))
        else yield* Effect.promise(() => symlink(join(paths.directory, "missing-target"), paths.socket))
        const failure = yield* verifyRemovableSocket(paths).pipe(Effect.flip)
        expect(failure).toMatchObject({
          _tag: "ResidentEndpointError",
          operation: "verifyRemovableSocket",
          message: "resident socket pathname is unsafe"
        })
      })
    )
  )
}

it.effect("preserves metadata errors other than an absent endpoint", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory()
      const parent = join(root, "regular-parent")
      yield* Effect.promise(() => writeFile(parent, "fixture", { mode: 0o600 }))
      const failure = yield* verifyRemovableSocket(residentPaths(parent)).pipe(Effect.flip)
      expect(failure).toMatchObject({ _tag: "ResidentEndpointError", operation: "inspectEndpoint", code: "ENOTDIR" })
      expect(failure.message).not.toContain(root)
    })
  )
)

for (const [configuration, expected] of [
  [{ REVIEW_RESIDENT_DIR: "/explicit", XDG_RUNTIME_DIR: "/runtime" }, "/explicit"],
  [{ XDG_RUNTIME_DIR: "/runtime" }, join("/runtime", "hapsland")],
  [{}, join(tmpdir(), `hapsland-${typeof process.getuid === "function" ? process.getuid() : process.pid}`)]
] as const) {
  it.effect(`resolves the resident directory to ${expected}`, () =>
    Effect.gen(function* () {
      const paths = yield* resolveResidentPaths().pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(configuration)))
      )
      expect(paths).toEqual(residentPaths(expected))
    })
  )
}

it.effect("reads path configuration at execution and isolates provider overrides", () =>
  Effect.gen(function* () {
    const resolve = resolveResidentPaths()
    const first = yield* resolve.pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_RESIDENT_DIR: "/first" })))
    )
    const second = yield* resolve.pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_RESIDENT_DIR: "/second" })))
    )
    expect(first.directory).toBe("/first")
    expect(second.directory).toBe("/second")
  })
)

it.effect("reports a configuration source failure without exposing its payload", () =>
  Effect.gen(function* () {
    const failure = yield* resolveResidentPaths().pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.make(() => Effect.fail(new ConfigProvider.SourceError({ message: "private-path" })))
        )
      ),
      Effect.flip
    )
    expect(failure).toMatchObject({ _tag: "ResidentEndpointError", operation: "resolveConfiguration" })
    expect(JSON.stringify(failure)).not.toContain("private-path")
  })
)

it.effect("rejects empty endpoint configuration rather than falling back", () =>
  Effect.gen(function* () {
    for (const environment of [
      { REVIEW_RESIDENT_DIR: "", XDG_RUNTIME_DIR: "/runtime" },
      { XDG_RUNTIME_DIR: "" },
      { REVIEW_RESIDENT_DIR: "/explicit", XDG_RUNTIME_DIR: "" }
    ]) {
      const failure = yield* resolveResidentPaths().pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: environment, preserveEmptyStrings: true }))),
        Effect.flip
      )
      expect(failure).toMatchObject({ _tag: "ResidentEndpointError", operation: "resolveConfiguration" })
    }
  })
)
