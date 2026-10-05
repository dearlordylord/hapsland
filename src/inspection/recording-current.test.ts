import { join } from "node:path"
import { writeFile } from "node:fs/promises"
import { Effect, Scope, Exit, ConfigProvider } from "effect"
import { expect, it } from "vitest"
import { makeInspectionHttpServer } from "./http.ts"
import { makeInspectionStorage } from "./storage.ts"
import { acquireResidentFixture } from "../resident/runtime-fixture.ts"
import { residentPaths } from "../resident/paths.ts"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { configuredRules } from "../policy/rules.ts"
import { nativeDeferred } from "../test-support/native-deferred.ts"

it("shows live recording state separately when its last disabled observation was not retained", async () => {
  const root = await makeGitFixture()
  const config = join(root, ".hapsland.jsonc")
  await writeFile(config, JSON.stringify({ version: 1, sessionInspection: true }))
  const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
  const published = nativeDeferred<void>()
  const disabled = nativeDeferred<void>()
  const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
    inspectionPersistence: {
      write: (record, encoded, publication) => {
        if (record.fact.kind === "recording-state" && record.fact.state === "disabled") {
          disabled.resolve()
          return Effect.void
        }
        return history.write(record, encoded, publication).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (record.fact.kind === "evaluation-outcome") published.resolve()
            })
          )
        )
      }
    }
  })
  const scope = await Effect.runPromise(Scope.make())
  try {
    await Effect.runPromise(resident.listen())
    const edit = async (path: string) => {
      await put(root, path, "type OrderCount = number\n")
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [path])))
      if (!observation) throw new Error("missing observation")
      expect(
        Effect.runSync(
          resident.admit(observation, {
            statePath: join(root, "consent"),
            userConfigPath: join(root, "absent-user"),
            credential: null,
            controlled: {
              answers: Object.fromEntries(
                configuredRules.map((rule) => [rule.id, { _tag: "Probability" as const, probability: 0 }])
              )
            }
          })
        ).status
      ).toBe("accepted")
      await Effect.runPromise(resident.whenIdle())
    }
    await edit("first.ts")
    await published.promise
    const server = await Effect.runPromise(
      makeInspectionHttpServer(history).pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_RESIDENT_DIR: resident.paths.directory }))
        ),
        Effect.provideService(Scope.Scope, scope)
      )
    )
    const snapshot = async () =>
      (await (await fetch(`${server.url}snapshot`)).json()) as {
        recording: {
          sources: Array<{ sourceId: string; status: string; roots: Array<{ root: string; state: string }> }>
        }
        records: Array<{ fact: { kind: string; state?: string } }>
      }
    expect((await snapshot()).recording.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "observed", roots: [{ root, state: "enabled", epoch: 1 }] })
      ])
    )
    await writeFile(config, JSON.stringify({ version: 1, sessionInspection: false }))
    await edit("second.ts")
    await disabled.promise
    const current = await snapshot()
    expect(current.recording.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "observed", roots: [{ root, state: "disabled", epoch: 1 }] })
      ])
    )
    expect(
      current.records.filter((record) => record.fact.kind === "recording-state").map((record) => record.fact.state)
    ).toEqual(["enabled"])
    expect(
      await Effect.runPromise(
        resident.handle({ requestRoute: "shared", operation: "inspection-status", lifetime: "foreign" })
      )
    ).toEqual({ status: "obsolete-lifetime" })
    await Effect.runPromise(resident.close)
    expect((await snapshot()).recording.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "disconnected", roots: [] })])
    )
  } finally {
    await Effect.runPromise(resident.close)
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})
