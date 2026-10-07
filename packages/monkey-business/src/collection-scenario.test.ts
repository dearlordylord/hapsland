import { expect, it } from "vitest"
import { createRun, restoreReplay } from "./index.ts"
import {
  captureCollectionResponse,
  encodeCollectionResponse,
  encodeCollectionFindingFacts
} from "./collection-scenario.ts"
import {
  runWorkloadNative,
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"
import type { CanonicalEvent } from "@hapsland/canonical-policy/canonical/adapter"

it("freezes response issuance scope and refuses foreign or out-of-range facts synchronously", () => {
  const original = { partition: 1, lifetime: 2, round: 3, started: 7, deadline: 17, admittedBlock: false }
  const captured = captureCollectionResponse(original)
  original.lifetime = 9
  expect(captured).toEqual({ partition: 1, lifetime: 2, round: 3, started: 7, deadline: 17, admittedBlock: false })
  expect(Object.isFrozen(captured)).toBe(true)
  expect(encodeCollectionResponse(captured)).toMatchObject({ lifetime: 2, round: 3, admitted_block: false })
  expect(() => captureCollectionResponse({ ...captured, deadline: 6 })).toThrow(TypeError)
  expect(() => captureCollectionResponse({ ...captured, currentLifetime: 9 })).toThrow(TypeError)
  expect(() =>
    encodeCollectionFindingFacts({
      unit: 1,
      partition: 1,
      round: 3,
      snapshot: 1,
      currentSnapshot: 1,
      credential: 1,
      currentCredential: 1,
      ageMs: 0,
      soloBytes: 2 ** 47,
      ready: true,
      selectedCount: 0,
      prospectiveBytes: 100
    })
  ).toThrow(TypeError)
})

// Literal outcomes come from the accepted collection contract, not a second
// Canonical execution. These are prerequisite decision fixtures; full response
// orchestration still requires the shared response-control integration seam.
const collectionDecisionCases: readonly { event: CanonicalEvent; expected: string }[] = [
  { event: { kind: "collectorGateCheck", expired: false, credentialValid: true }, expected: "collectorProceed" },
  { event: { kind: "collectorGateCheck", expired: true, credentialValid: true }, expected: "collectorUnavailable" },
  { event: { kind: "collectorGateCheck", expired: false, credentialValid: false }, expected: "collectorUnavailable" },
  {
    event: { kind: "collectorFinalAuthorityCheck", admittedBlock: true, currentBlock: false },
    expected: "collectorFinalRelease"
  },
  {
    event: { kind: "collectorFinalAuthorityCheck", admittedBlock: false, currentBlock: true },
    expected: "collectorFinalProceed"
  },
  { event: { kind: "collectionOrderCheck", leftSequence: 1, rightSequence: 2 }, expected: "collectionBefore" },
  { event: { kind: "collectionOrderCheck", leftSequence: 2, rightSequence: 2 }, expected: "collectionEqual" },
  { event: { kind: "collectionOrderCheck", leftSequence: 3, rightSequence: 2 }, expected: "collectionAfter" },
  ...[true, false].map((authorityOwns) => ({
    event: {
      kind: "collectionCandidateCheck" as const,
      samePartition: true,
      unleased: true,
      hasUnsuppressed: true,
      authorityOwns
    },
    expected: authorityOwns ? "collectionCandidate" : "collectionSkip"
  }))
]
it("observes exact response, ordering and owner refusal decisions through the public replay boundary", () => {
  const run = createRun({ inputs: collectionDecisionCases.map(({ event }, at) => ({ at, kind: "canonical", event })) })
  for (const { expected } of collectionDecisionCases) {
    const frame = run.step()
    expect(frame?.rejection).toBeUndefined()
    expect(frame?.commands.map((command) => command.kind)).toEqual([expected])
    expect(frame?.after.delivery.submissions.batches).toEqual([])
  }
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
})

it(
  "compares original native response facts against literal decisions and public emitted observations",
  () => {
    const native = runWorkloadNative(
      new URL("../../monkey-business-bend/conformance/collection-decisions.bend", import.meta.url)
    )
    const expected = [[1], [2], [2], [3], [4], [5], [6], [7], [8], [9]]
    expect(native).toEqual(expected)
    const run = createRun({
      inputs: collectionDecisionCases.map(({ event }, at) => ({ at, kind: "canonical", event }))
    })
    run.advance({ untilTime: 9, maxEvents: 10 })
    const codes = new Map(collectionDecisionCases.map(({ expected: name }, index) => [name, expected[index]![0]]))
    expect(run.observations.map((frame) => frame.commands.map((command) => codes.get(command.kind)))).toEqual(expected)
  },
  WORKLOAD_CONFORMANCE_TIMEOUT_MS
)

const eligibleFinding: Extract<CanonicalEvent, { kind: "collectionFindingCheck" }> = {
  kind: "collectionFindingCheck",
  selectionPartition: 1,
  selectionRound: 3,
  unit: 1,
  partition: 1,
  round: 3,
  snapshot: 7,
  currentSnapshot: 7,
  credential: 2,
  currentCredential: 2,
  ageMs: 599999,
  soloBytes: 100,
  collectionReady: true,
  selectedCount: 0,
  prospectiveBytes: 100
}
it.each([
  [{}, "collectionFindingSelected"],
  [{ collectionReady: false }, "collectionFindingExpired"],
  [{ partition: 2 }, "collectionFindingExpired"],
  [{ round: 4 }, "collectionFindingExpired"],
  [{ currentSnapshot: 8 }, "collectionFindingExpired"],
  [{ currentCredential: 3 }, "collectionFindingExpired"],
  [{ ageMs: 600000 }, "collectionFindingExpired"],
  [{ soloBytes: 10241 }, "collectionFindingLimited"],
  [{ selectedCount: 1, prospectiveBytes: 10241 }, "collectionFindingRetained"]
] as const)("pins independent candidate eligibility %j -> %s", (changed, expected) => {
  const run = createRun({ inputs: [{ at: 0, kind: "canonical", event: { ...eligibleFinding, ...changed } }] })
  expect(run.step()?.commands.map((command) => command.kind)).toEqual([expected])
  expect(run.projection.delivery.submissions.batches).toEqual([])
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
})
