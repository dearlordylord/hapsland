import { expect, it } from "vitest"
import {
  runWorkloadNative,
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"
import { createRun, replayRun, type RunInput } from "./index.ts"
import type { CanonicalEvent } from "../../../src/canonical/adapter.ts"

/** Expected counts come from the accepted notice/cooldown contract, not the
 * implementation's projection or a second copy of notice policy. */
const noticeInputs = (): RunInput[] => {
  const inputs: RunInput[] = []
  const send = (at: number, event: CanonicalEvent) => inputs.push({ at, kind: "canonical", event })
  const failure = (at: number, key: number, remaining?: number) =>
    send(at, {
      kind: "noticeAdvance",
      key,
      ...(remaining === undefined ? {} : { remaining }),
      maximumKeys: 2,
      proposed: key,
      sequence: key,
      maxCount: 2 ** 48 - 1
    })
  for (const [partition, key, reservation] of [
    [1, 101, 1],
    [2, 202, 2]
  ] as const) {
    failure(0, key)
    send(0, { kind: "reserveCapacity", partition, bytes: 128, purpose: "operationalNotice" })
    send(0, {
      kind: "noticeCommit",
      key,
      partition,
      group: 7,
      reservation,
      pending: key,
      sequence: key,
      maximumKeys: 2
    })
  }
  failure(1, 101, 9)
  failure(2, 202, 8)
  failure(3, 101, 7)
  failure(10, 101, 0)
  send(11, { kind: "noticeSelect", partition: 1, group: 7, composed: false, authorityBound: false, allowed: [] })
  send(12, { kind: "noticeLease", key: 101, leased: true })
  failure(13, 101, 0)
  send(14, { kind: "noticeSelect", partition: 2, group: 7, composed: false, authorityBound: false, allowed: [] })
  send(15, { kind: "noticeSelect", partition: 1, group: 7, composed: true, authorityBound: false, allowed: [] })
  send(16, { kind: "noticeClearPending", key: 101 })
  send(17, { kind: "noticeSelect", partition: 1, group: 7, composed: false, authorityBound: false, allowed: [] })
  send(18, { kind: "noticeSelect", partition: 2, group: 7, composed: false, authorityBound: true, allowed: [101] })
  send(19, { kind: "noticeSelect", partition: 2, group: 7, composed: false, authorityBound: true, allowed: [202] })
  return inputs
}

it("keeps concurrent failure counts, cooldown and ordinary collection scoped without findings", () => {
  const run = createRun({ inputs: noticeInputs() })
  run.advance({ untilTime: 3, maxEvents: 100 })
  expect(run.projection.notices.map((n) => [n.partition, n.suppressed]).sort()).toEqual([
    [1, 2],
    [2, 1]
  ])
  run.advance({ untilTime: 10, maxEvents: 100 })
  const first = run.projection.notices.find((n) => n.partition === 1)!
  expect(first.suppressed).toBe(0)
  expect(first.pending?.count).toBe(2)
  expect(run.projection.notices.find((n) => n.partition === 2)?.suppressed).toBe(1)
  run.advance({ untilTime: 19, maxEvents: 100 })
  const selections = run.observations.flatMap((f) => f.commands.filter((c) => c.kind === "noticeSelected"))
  expect(selections).toEqual([
    { kind: "noticeSelected", ids: [101] },
    { kind: "noticeSelected", ids: [202] },
    { kind: "noticeSelected", ids: [202] },
    { kind: "noticeSelected", ids: [] },
    { kind: "noticeSelected", ids: [] },
    { kind: "noticeSelected", ids: [202] }
  ])
  expect(run.projection.notices.find((n) => n.partition === 1)?.pending).toBeUndefined()
  expect(run.projection.notices.find((n) => n.partition === 2)?.pending?.id).toBe(202)
  expect(run.projection.global.bytes).toBe(256)
  expect(run.projection.work).toEqual([])
  const replay = replayRun(JSON.parse(JSON.stringify(run.exportReplay())))
  replay.advance({ untilTime: 19, maxEvents: 100 })
  expect(replay.observe()).toEqual(run.observe())
})

it("keeps backend failure diagnostics separate from ordinary advice", () => {
  const run = createRun({ outcome: "backendFailure", inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }] })
  run.advance({ untilTime: 100, maxEvents: 100 })
  expect(run.projection.notices).toEqual([])
  expect(run.projection.work.some((w) => w.kind === "pendingFinding")).toBe(false)
})

it(
  "matches native Bend to independent intermediate public notice observations",
  () => {
    const run = createRun({ inputs: noticeInputs() })
    const row = (partition: number) => {
      const n = run.projection.notices.find((n) => n.partition === partition)!
      return [n.partition, n.suppressed, n.pending?.id ?? 0, n.pending?.count ?? 0, Number(n.pending?.leased ?? false)]
    }
    const selectedAt = (at: number) => {
      const selected = run.observations
        .find((f) => f.time === at && f.event.kind === "noticeSelect")
        ?.commands.find((c) => c.kind === "noticeSelected")
      if (selected?.kind !== "noticeSelected") throw new Error("missing notice selection")
      return [...selected.ids]
    }
    const rows: number[][] = []
    run.advance({ untilTime: 3, maxEvents: 100 })
    rows.push(row(1), row(2))
    run.advance({ untilTime: 10, maxEvents: 100 })
    rows.push(row(1))
    run.advance({ untilTime: 11, maxEvents: 100 })
    rows.push(selectedAt(11))
    run.advance({ untilTime: 13, maxEvents: 100 })
    rows.push(row(1))
    run.advance({ untilTime: 15, maxEvents: 100 })
    rows.push(selectedAt(14), selectedAt(15))
    run.advance({ untilTime: 16, maxEvents: 100 })
    rows.push(row(1), row(2))
    run.advance({ untilTime: 19, maxEvents: 100 })
    rows.push(selectedAt(18), selectedAt(19))
    const expected = [
      [1, 2, 101, 0, 0],
      [2, 1, 202, 0, 0],
      [1, 0, 101, 2, 0],
      [101],
      [1, 0, 101, 2, 1],
      [202],
      [202],
      [1, 0, 0, 0, 0],
      [2, 1, 202, 0, 0],
      [],
      [202]
    ]
    expect(rows).toEqual(expected)
    const native = runWorkloadNative(new URL("../../monkey-business-bend/conformance/notices.bend", import.meta.url))
    expect(native).toEqual(expected)
  },
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
)
