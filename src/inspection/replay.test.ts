import { join } from "node:path"
import { writeFile } from "node:fs/promises"
import { Effect, Scope, Exit } from "effect"
import { expect, it } from "vitest"
import { makeInspectionHttpServer } from "./http.ts"
import { makeInspectionStorage } from "./storage.ts"
import type { makeInspectionReplay } from "./replay.ts"
import type { InspectionRecord } from "./contract.ts"
import { acquireResidentFixture } from "../resident/runtime-fixture.ts"
import { residentPaths } from "../resident/paths.ts"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { configuredRules, connectDefaultRuleFixture } from "../test-support/default-rules.ts"
import { nativeDeferred } from "../test-support/native-deferred.ts"

type ReplaySnapshot = ReturnType<ReturnType<typeof makeInspectionReplay>["describe"]> & {
  readonly records: InspectionRecord[]
  readonly retained: Array<{ sourceId: string; sequences: number[] }>
}

it("replays real per-source increments after a snapshot and resets honestly when its retained anchors expire", async () => {
  const roots = [await makeGitFixture(), await makeGitFixture()]
  let now = Date.now()
  const history = makeInspectionStorage(join(roots[0]!, "inspection"), {
    retentionMs: 86400000,
    storageBytes: 1048576,
    now: () => now
  })
  const residents: Array<Awaited<ReturnType<typeof acquireResidentFixture>>> = []
  const scope = await Effect.runPromise(Scope.make())
  try {
    const publish: Array<(path: string) => Promise<void>> = []
    for (const root of roots) {
      await writeFile(
        join(root, ".hapsland.jsonc"),
        JSON.stringify({ version: 1, rules: connectDefaultRuleFixture(root), sessionInspection: true })
      )
      let stored = nativeDeferred<void>()
      const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
        inspectionPersistence: {
          write: (record, encoded, publication) =>
            history.write(record, encoded, publication).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (record.fact.kind === "evaluation-outcome") stored.resolve()
                })
              )
            )
        }
      })
      residents.push(resident)
      publish.push(async (path) => {
        stored = nativeDeferred<void>()
        await put(root, path, "type OrderCount = number\n")
        const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [path])))
        if (!observation) throw new Error("missing observation")
        expect(
          (
            await Effect.runPromise(
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
            )
          ).status
        ).toBe("accepted")
        await stored.promise
        await Effect.runPromise(resident.whenIdle())
      })
    }
    await publish[0]!("日本語-first.ts")
    await publish[1]!("first.ts")
    const server = await Effect.runPromise(
      makeInspectionHttpServer({
        snapshot: () =>
          history
            .snapshot()
            .pipe(Effect.map((journal) => ({ ...journal, records: [...journal.records, ...journal.records] })))
      }).pipe(Effect.provideService(Scope.Scope, scope))
    )
    const initial = (await (await fetch(`${server.url}snapshot`)).json()) as ReplaySnapshot
    expect(initial.watermark.sources).toHaveLength(2)
    expect(initial.replay.coverage).toBe("retained-observations-only")
    await publish[0]!("second.ts")
    await publish[1]!("日本語-second.ts")
    await Promise.all(residents.map((resident) => Effect.runPromise(resident.close)))
    const resumed = (await (
      await fetch(`${server.url}snapshot?cursor=${initial.watermark.cursor}`)
    ).json()) as ReplaySnapshot
    expect(resumed.replay.state).toBe("resumed")
    expect(resumed.replay.gaps).toEqual([])
    for (const position of initial.watermark.sources) {
      const increments = resumed.records.filter(
        (record: InspectionRecord) => record.source.id === position.sourceId && record.sequence > position.sequence
      )
      expect(increments.some((record: InspectionRecord) => record.fact.kind === "edit-received")).toBe(true)
      expect(
        resumed.replay.sources.find((item: { sourceId: string }) => item.sourceId === position.sourceId)
      ).toMatchObject({ after: position.sequence, retainedIncrements: increments.length })
    }
    expect(
      new Set(resumed.records.map((record: InspectionRecord) => `${record.source.id}:${record.sequence}`)).size
    ).toBe(resumed.records.length)
    const repeated = (await (
      await fetch(`${server.url}snapshot?cursor=${resumed.watermark.cursor}`)
    ).json()) as ReplaySnapshot
    expect(repeated.replay.sources.every((item: { retainedIncrements: number }) => item.retainedIncrements === 0)).toBe(
      true
    )
    const readReplay = async (cursor: string) => {
      const events = await fetch(`${server.url}events`, { headers: { "last-event-id": cursor } })
      const reader = events.body!.getReader()
      let frame = ""
      try {
        const decoder = new TextDecoder()
        while (!frame.includes("\n\n")) {
          const chunk = await reader.read()
          if (chunk.done) throw new Error("replay ended before a complete event")
          frame += decoder.decode(chunk.value, { stream: true })
          if (Buffer.byteLength(frame) > 1048576 + 16384) throw new Error("replay exceeds frame bound")
        }
      } finally {
        await reader.cancel()
      }
      return { frame, value: JSON.parse(frame.split("data: ")[1]!.split("\n\n")[0]!) as ReplaySnapshot }
    }
    const identity = (record: InspectionRecord) => `${record.source.id}:${record.sequence}`
    const afterSnapshot = await readReplay(initial.watermark.cursor)
    expect(afterSnapshot.frame).toContain("event: increment")
    const original = new Map(initial.watermark.sources.map((position) => [position.sourceId, position.sequence]))
    const expected = resumed.records.filter((record) => record.sequence > (original.get(record.source.id) ?? 0))
    expect(afterSnapshot.value.records.map(identity).sort()).toEqual(expected.map(identity).sort())
    expect(afterSnapshot.value.retained).toEqual(resumed.retained)
    const repeatedReplay = await readReplay(resumed.watermark.cursor)
    expect(repeatedReplay.frame).toContain(`id: ${resumed.watermark.cursor}`)
    expect(repeatedReplay.frame).toContain("event: increment")
    expect(repeatedReplay.value.records).toEqual([])
    const forged = (await (
      await fetch(`${server.url}snapshot?cursor=${initial.watermark.cursor.slice(0, -2)}`)
    ).json()) as ReplaySnapshot
    expect(forged.replay).toMatchObject({ state: "reset", gaps: [{ reason: "invalid-cursor" }] })
    now += 2 * 86400000
    const expired = (await (
      await fetch(`${server.url}snapshot?cursor=${resumed.watermark.cursor}`)
    ).json()) as ReplaySnapshot
    expect(expired.records).toEqual([])
    expect(expired.replay.state).toBe("reset")
    expect(expired.replay.gaps).toHaveLength(2)
    expect(expired.replay.gaps.every((gap: { reason: string }) => gap.reason === "expired")).toBe(true)
    const expiredReplay = await readReplay(resumed.watermark.cursor)
    expect(expiredReplay.frame).toContain("event: snapshot")
    expect(expiredReplay.value.records).toEqual([])
    expect(expiredReplay.value.replay.state).toBe("reset")
  } finally {
    await Promise.all(residents.map((resident) => Effect.runPromise(resident.close)))
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})
