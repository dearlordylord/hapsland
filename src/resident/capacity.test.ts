import { describe, expect, it } from "vitest"
import { it as effectIt } from "@effect/vitest"
import { Effect, Exit } from "effect"
import {
  makeResidentState,
  MAX_COLLECTION_TOKEN_IDENTITIES,
  MAX_PARTITION_IDENTITIES,
  encodedBytesWithin
} from "@hapsland/resident-runtime/resident/capacity"

const preparedReview = () => {
  const ledger = Effect.runSync(makeResidentState())
  const round = Effect.runSync(ledger.roundId("review-agent"))
  const observation = Effect.runSync(ledger.admitObservation("review-agent", round))
  if (!Effect.runSync(ledger.observation("review-agent", observation, "startObservation", round))) {
    throw new Error("fixture observation did not start")
  }
  const preparation = Effect.runSync(ledger.beginObservedPreparation("review-agent", observation, 20, round))
  if (preparation.status !== "admitted") throw new Error("fixture preparation refused")
  const [unit] = Effect.runSync(
    ledger.completePreparation("review-agent", preparation.operation, preparation.reservation, [10], round)
  )
  if (unit === undefined) throw new Error("fixture review unit refused")
  return { ledger, round, unit }
}

describe("resident logical capacity ledger", () => {
  it("does not prepare observation work discarded by the finish decision", () => {
    const ledger = Effect.runSync(makeResidentState())
    const partition = Effect.runSync(ledger.partitionId("agent"))
    const round = Effect.runSync(ledger.roundId("agent"))
    const observation = Effect.runSync(ledger.admitObservation("agent", round))
    expect(Effect.runSync(ledger.observation("agent", observation, "startObservation", round))).toBe(true)
    const decision = Effect.runSync(
      ledger.transition({
        kind: "stopGroupPolled",
        group: partition,
        lifetime: 1,
        round,
        scopes: [{ partition, round }],
        deadline: true,
        extraPending: false,
        continuations: 0
      })
    )
    expect(decision.rejection).toBeUndefined()

    const beforeLatePreparation = Effect.runSync(ledger.canonicalProjection())
    expect(Effect.runSync(ledger.beginObservedPreparation("agent", observation, 10, round))).toEqual({
      status: "unavailable",
      reason: "wrong-stage"
    })
    expect(Effect.runSync(ledger.canonicalProjection())).toEqual(beforeLatePreparation)
  })

  it.each(["finding", "clear", "unavailable", "interrupted", "discarded"] as const)(
    "settles completed review outcome %s and retains bytes only for a finding",
    (outcome) => {
      const { ledger, round, unit } = preparedReview()
      const forged = Object.freeze({ id: unit.reservation.id, partition: unit.reservation.partition })

      expect(Effect.runSync(ledger.completeReview("review-agent", unit.operation, forged, outcome, round))).toBe(false)
      expect(Effect.runSync(ledger.reservationSnapshot(unit.reservation))?.purpose).toBe("reviewUnit")

      expect(Effect.runSync(ledger.startReview("review-agent", unit.operation, round))).toBe(true)
      expect(
        Effect.runSync(ledger.completeReview("review-agent", unit.operation, unit.reservation, outcome, round))
      ).toBe(true)

      if (outcome === "finding") {
        expect(Effect.runSync(ledger.reservationSnapshot(unit.reservation))).toEqual({
          bytes: 10,
          purpose: "storedResult"
        })
        expect(Effect.runSync(ledger.snapshot())).toMatchObject({ items: 1, bytes: 10 })
      } else {
        expect(Effect.runSync(ledger.reservationSnapshot(unit.reservation))).toBeUndefined()
        expect(Effect.runSync(ledger.snapshot())).toEqual({ items: 0, bytes: 0, partitions: {} })
      }
    }
  )

  it.each([
    ["finding", true, "findingRetained"],
    ["clear", true, "clearSettled"],
    ["clear", false, "staleClearSettled"],
    ["finding", false, "staleFindingRetired"]
  ] as const)(
    "maps observed %s with currentWork=%s to %s and releases only non-current results",
    (outcome, currentWork, disposition) => {
      const { ledger, round, unit } = preparedReview()
      const forged = Object.freeze({ id: unit.reservation.id, partition: unit.reservation.partition })
      expect(() =>
        Effect.runSync(ledger.observeReview("review-agent", unit.operation, forged, outcome, currentWork, round))
      ).toThrow("unknown review reservation")
      expect(Effect.runSync(ledger.reservationSnapshot(unit.reservation))?.purpose).toBe("reviewUnit")
      expect(Effect.runSync(ledger.startReview("review-agent", unit.operation, round))).toBe(true)
      expect(
        Effect.runSync(
          ledger.observeReview("review-agent", unit.operation, unit.reservation, outcome, currentWork, round)
        )
      ).toBe(disposition)

      if (disposition === "findingRetained") {
        expect(Effect.runSync(ledger.reservationSnapshot(unit.reservation))).toEqual({
          bytes: 10,
          purpose: "storedResult"
        })
        expect(Effect.runSync(ledger.snapshot())).toMatchObject({ items: 1, bytes: 10 })
      } else {
        expect(Effect.runSync(ledger.reservationSnapshot(unit.reservation))).toBeUndefined()
        expect(Effect.runSync(ledger.snapshot())).toEqual({ items: 0, bytes: 0, partitions: {} })
      }
    }
  )

  it("distinguishes preparation capacity refusal from invalid measurement and wrong stage", () => {
    const ledger = Effect.runSync(
      makeResidentState({ globalItems: 4, globalBytes: 100, partitionItems: 3, partitionBytes: 80 })
    )
    const round = Effect.runSync(ledger.roundId("agent"))
    const observation = Effect.runSync(ledger.admitObservation("agent", round))
    expect(Effect.runSync(ledger.beginObservedPreparation("agent", observation, NaN, round))).toEqual({
      status: "invalid-measurement"
    })
    expect(Effect.runSync(ledger.beginObservedPreparation("agent", observation, 10, round))).toEqual({
      status: "unavailable",
      reason: "wrong-stage"
    })
    expect(Effect.runSync(ledger.observation("agent", observation, "startObservation", round))).toBe(true)
    expect(Effect.runSync(ledger.beginObservedPreparation("agent", observation, 81, round))).toEqual({
      status: "capacity-refused"
    })
    expect(Effect.runSync(ledger.snapshot()).bytes).toBe(0)
    const preparation = Effect.runSync(ledger.beginObservedPreparation("agent", observation, 80, round))
    if (preparation.status !== "admitted") throw new Error("fixture preparation refused")
    expect(Effect.runSync(ledger.resize(preparation.reservation, Infinity))).toEqual({ status: "invalid-measurement" })
    expect(Effect.runSync(ledger.resize(preparation.reservation, 81))).toEqual({
      status: "capacity-refused",
      constraint: "partitionBytes"
    })
    expect(Effect.runSync(ledger.reservationSnapshot(preparation.reservation))?.bytes).toBe(80)
  })

  it("keeps reservation metadata private and fences a reused numeric ID", () => {
    const ledger = Effect.runSync(makeResidentState())
    const issued = Effect.runSync(ledger.reserve("agent", 20, "preparation"))
    if (issued === undefined) throw new Error("fixture reservation refused")
    expect(Object.isFrozen(issued)).toBe(true)
    expect(Object.keys(issued)).toEqual(["id", "partition"])
    expect(Reflect.set(issued, "bytes", 999)).toBe(false)
    expect(Reflect.set(issued, "purpose", "storedResult")).toBe(false)
    expect(Effect.runSync(ledger.resize(issued, 30, "storedResult"))).toEqual({ status: "resized" })
    expect(Effect.runSync(ledger.reservationSnapshot(issued))?.bytes).toBe(30)
    expect(Effect.runSync(ledger.reservationSnapshot(issued))?.purpose).toBe("storedResult")
    expect(Effect.runSync(ledger.snapshot()).bytes).toBe(30)

    Effect.runSync(ledger.clear())
    const replacement = Effect.runSync(ledger.reserve("other-agent", 90, "reviewUnit"))
    expect(replacement?.id).toBe(issued.id)
    expect(Effect.runSync(ledger.reservationSnapshot(issued))).toBeUndefined()
    expect(Effect.runSync(ledger.release(issued))).toBe(false)
    expect(Effect.runSync(ledger.resize(issued, 1))).toEqual({ status: "invalid-reservation" })
    expect(replacement === undefined ? undefined : Effect.runSync(ledger.reservationSnapshot(replacement))?.bytes).toBe(
      90
    )
    expect(Effect.runSync(ledger.snapshot()).bytes).toBe(90)
  })

  it("publishes neither canonical state nor native identities when registration fails", () => {
    const ledger = Effect.runSync(makeResidentState())
    const partition = Effect.runSync(ledger.partitionId("agent"))
    const before = Effect.runSync(ledger.canonicalProjection())
    expect(() =>
      Effect.runSync(
        ledger.transition({ kind: "openRound", partition, lifetime: 1 }, () => {
          throw new Error("native registration failed")
        })
      )
    ).toThrow("native registration failed")
    expect(Effect.runSync(ledger.canonicalProjection())).toEqual(before)
    expect(Effect.runSync(ledger.currentRoundId("agent"))).toBeUndefined()
    const round = Effect.runSync(ledger.roundId("agent"))
    expect(round).toBe(1)
    expect(Effect.runSync(ledger.canonicalProjection()).rounds).toEqual([
      { partition, lifetime: 1, id: round, deciding: false, waiting: false, uncertain: false }
    ])
  })

  it("rejects a reentrant mutation and rolls back the enclosing commit", () => {
    const ledger = Effect.runSync(makeResidentState())
    const partition = Effect.runSync(ledger.partitionId("agent"))
    const before = Effect.runSync(ledger.canonicalProjection())
    expect(() =>
      Effect.runSync(
        ledger.transition({ kind: "openRound", partition, lifetime: 1 }, () => {
          // Read-only inspection observes the published state, not the staged draft.
          expect(Effect.runSync(ledger.canonicalProjection())).toEqual(before)
          Effect.runSync(ledger.reserve("nested-agent", 10, "preparation"))
        })
      )
    ).toThrow("resident capacity commit cannot be reentered")
    expect(Effect.runSync(ledger.canonicalProjection())).toEqual(before)
    expect(Effect.runSync(ledger.knownPartitionId("nested-agent"))).toBeUndefined()
    expect(Effect.runSync(ledger.partitionIdentityCount())).toBe(1)
    // The failed commit releases its fence and does not consume a reservation ID.
    expect(Effect.runSync(ledger.reserve("agent", 10, "preparation"))?.id).toBe(1)
  })

  it("forgets idle advicee identities at the metadata limit and fences older starts", () => {
    const ledger = Effect.runSync(makeResidentState())
    for (let index = 0; index < MAX_PARTITION_IDENTITIES; index++) {
      Effect.runSync(ledger.partitionId(`advicee-${index}`))
    }
    const first = Effect.runSync(ledger.knownPartitionId("advicee-0"))
    expect(first).toBeDefined()
    Effect.runSync(ledger.partitionId("next-advicee"))
    expect(Effect.runSync(ledger.partitionIdentityCount())).toBe(MAX_PARTITION_IDENTITIES)
    expect(Effect.runSync(ledger.knownPartitionId("advicee-0"))).toBeUndefined()
    expect(Effect.runSync(ledger.minimumFreshStart())).toBeGreaterThan(0)
    const stale = Effect.runSync(
      ledger.transition({
        kind: "issuePermit",
        partition: Effect.runSync(ledger.knownPartitionId("next-advicee"))!,
        lifetime: 1,
        tool: 1,
        started: Effect.runSync(ledger.minimumFreshStart()),
        deadline: Effect.runSync(ledger.minimumFreshStart()) + 1000,
        now: Effect.runSync(ledger.minimumFreshStart()),
        minimumStarted: Effect.runSync(ledger.minimumFreshStart()),
        facts: {
          clockValid: true,
          hookWindow: 2500,
          startedUpper: Effect.runSync(ledger.minimumFreshStart()),
          nowLower: Effect.runSync(ledger.minimumFreshStart()),
          adviceePermitLimit: 32,
          residentPermitLimit: 4096
        }
      })
    )
    expect(stale.rejection).toBe("StaleInvocation")
    expect(Effect.runSync(ledger.canonicalProjection()).admissions).toEqual([])
  })

  it("prunes completed collection tokens but retains canonical live tokens", () => {
    const ledger = Effect.runSync(makeResidentState())
    const partition = Effect.runSync(ledger.partitionId("agent"))
    const live = Effect.runSync(ledger.collectionTokenId("live"))
    expect(
      Effect.runSync(
        ledger.transition({
          kind: "collectionClaimBackground",
          group: partition,
          token: live,
          active: true,
          capacity: 1
        })
      ).outputs[0]?.kind
    ).toBe("collectionBackgroundClaimed")
    for (let index = 0; index < 1000; index++) Effect.runSync(ledger.collectionTokenId(`finished-${index}`))
    Effect.runSync(ledger.pruneCollectionTokenIds(new Set()))
    expect(Effect.runSync(ledger.collectionTokenIdentityCount())).toBe(1)
    expect(Effect.runSync(ledger.collectionTokenId("live"))).toBe(live)
    expect(
      Effect.runSync(ledger.transition({ kind: "collectionReleaseBackground", group: partition, token: live }))
        .outputs[0]?.kind
    ).toBe("collectionBackgroundReleased")
    Effect.runSync(ledger.pruneCollectionTokenIds(new Set()))
    expect(Effect.runSync(ledger.collectionTokenIdentityCount())).toBe(0)
    expect(MAX_COLLECTION_TOKEN_IDENTITIES).toBeGreaterThan(1000)
  })

  it.each(["released", "consumed-and-closed"])(
    "retains permit-owned advicee identity until its lifecycle ends: %s",
    (ending) => {
      const ledger = Effect.runSync(makeResidentState())
      const partition = Effect.runSync(ledger.partitionId("permit-agent"))
      const issued = Effect.runSync(
        ledger.transition({
          kind: "issuePermit",
          partition,
          lifetime: 1,
          tool: 7,
          started: 100,
          deadline: 300,
          now: 110,
          minimumStarted: 0,
          facts: {
            clockValid: true,
            hookWindow: 2500,
            startedUpper: 100,
            nowLower: 101,
            adviceePermitLimit: 32,
            residentPermitLimit: 4096
          }
        })
      ).outputs[0]
      if (issued?.kind !== "permitIssued") throw new Error("fixture permit refused")
      const pending = Effect.runSync(ledger.canonicalProjection())
      Effect.runSync(ledger.discardUnusedPartition("permit-agent"))
      expect(Effect.runSync(ledger.knownPartitionId("permit-agent"))).toBe(partition)
      expect(Effect.runSync(ledger.canonicalProjection())).toEqual(pending)
      if (ending === "released") {
        expect(
          Effect.runSync(ledger.transition({ kind: "releasePermit", partition, lifetime: 1, token: issued.token }))
            .rejection
        ).toBeUndefined()
      } else {
        expect(
          Effect.runSync(
            ledger.transition({ kind: "consumePermit", partition, lifetime: 1, token: issued.token, tool: 7, now: 120 })
          ).outputs[0]?.kind
        ).toBe("permitConsumed")
        const admitted = Effect.runSync(ledger.canonicalProjection())
        Effect.runSync(ledger.discardUnusedPartition("permit-agent"))
        expect(Effect.runSync(ledger.knownPartitionId("permit-agent"))).toBe(partition)
        expect(Effect.runSync(ledger.canonicalProjection())).toEqual(admitted)
        expect(
          Effect.runSync(
            ledger.transition({ kind: "closePermitRound", partition, lifetime: 1, round: issued.round, at: 130 })
          ).rejection
        ).toBeUndefined()
        // Closing admission does not discard the canonical round's retained resources.
        Effect.runSync(ledger.discardUnusedPartition("permit-agent"))
        expect(Effect.runSync(ledger.knownPartitionId("permit-agent"))).toBe(partition)
        expect(
          Effect.runSync(
            ledger.transition({ kind: "retirePartition", partition, lifetime: 1, round: issued.round })
          ).outputs.at(-1)?.kind
        ).toBe("partitionRetired")
      }
      Effect.runSync(ledger.discardUnusedPartition("permit-agent"))
      expect(Effect.runSync(ledger.knownPartitionId("permit-agent"))).toBeUndefined()
      expect(Effect.runSync(ledger.partitionIdentityBytes())).toBe(0)
      expect(Effect.runSync(ledger.canonicalProjection()).admissions).toEqual([])
    }
  )

  it("retains a canonical background collection owner until its claim is released", () => {
    const ledger = Effect.runSync(makeResidentState())
    const partition = Effect.runSync(ledger.partitionId("collector"))
    const token = Effect.runSync(ledger.collectionTokenId("claim"))
    expect(
      Effect.runSync(
        ledger.transition({ kind: "collectionClaimBackground", group: partition, token, active: true, capacity: 1 })
      ).outputs[0]?.kind
    ).toBe("collectionBackgroundClaimed")
    const owned = Effect.runSync(ledger.canonicalProjection())
    Effect.runSync(ledger.discardUnusedPartition("collector"))
    expect(Effect.runSync(ledger.knownPartitionId("collector"))).toBe(partition)
    expect(Effect.runSync(ledger.canonicalProjection())).toEqual(owned)
    expect(
      Effect.runSync(ledger.transition({ kind: "collectionReleaseBackground", group: partition, token })).outputs[0]
        ?.kind
    ).toBe("collectionBackgroundReleased")
    Effect.runSync(ledger.discardUnusedPartition("collector"))
    expect(Effect.runSync(ledger.knownPartitionId("collector"))).toBeUndefined()
  })

  it("retains charged native work and forgets its identity only after release", () => {
    const ledger = Effect.runSync(makeResidentState())
    const reservation = Effect.runSync(ledger.reserve("preparing", 20, "preparation"))
    if (reservation === undefined) throw new Error("fixture reservation refused")
    const partition = Effect.runSync(ledger.knownPartitionId("preparing"))
    expect(partition).toBeDefined()
    Effect.runSync(ledger.discardUnusedPartition("preparing"))
    expect(Effect.runSync(ledger.knownPartitionId("preparing"))).toBe(partition)
    expect(Effect.runSync(ledger.reservationSnapshot(reservation))?.bytes).toBe(20)
    expect(Effect.runSync(ledger.release(reservation))).toBe(true)
    Effect.runSync(ledger.discardUnusedPartition("preparing"))
    expect(Effect.runSync(ledger.knownPartitionId("preparing"))).toBeUndefined()
    expect(Effect.runSync(ledger.partitionIdentityBytes())).toBe(0)
    const forgotten = Effect.runSync(ledger.canonicalProjection())
    Effect.runSync(ledger.discardUnusedPartition("preparing"))
    expect(Effect.runSync(ledger.canonicalProjection())).toEqual(forgotten)
    expect(Effect.runSync(ledger.partitionIdentityCount())).toBe(0)
  })

  it("retains a native round identity until the canonical round is retired", () => {
    const ledger = Effect.runSync(makeResidentState())
    const round = Effect.runSync(ledger.roundId("round-owner"))
    const partition = Effect.runSync(ledger.knownPartitionId("round-owner"))
    expect(partition).toBeDefined()

    Effect.runSync(ledger.discardUnusedPartition("round-owner"))
    expect(Effect.runSync(ledger.currentRoundId("round-owner"))).toBe(round)
    expect(Effect.runSync(ledger.knownPartitionId("round-owner"))).toBe(partition)
    expect(Effect.runSync(ledger.canonicalProjection()).rounds).toHaveLength(1)

    Effect.runSync(ledger.retireRound("round-owner", round))
    Effect.runSync(ledger.discardUnusedPartition("round-owner"))
    expect(Effect.runSync(ledger.currentRoundId("round-owner"))).toBeUndefined()
    expect(Effect.runSync(ledger.knownPartitionId("round-owner"))).toBeUndefined()
    expect(Effect.runSync(ledger.partitionIdentityBytes())).toBe(0)
  })

  it("does not accumulate Bend delivery counters across completed rounds", () => {
    const ledger = Effect.runSync(makeResidentState())
    for (let index = 0; index < 200; index++) {
      const partition = `agent-${index}`
      const group = Effect.runSync(ledger.partitionId(partition))
      const round = Effect.runSync(ledger.roundId(partition))
      expect(Effect.runSync(ledger.transition({ kind: "continuationConsume", group, round })).outputs[0]?.kind).toBe(
        "continuationConsumed"
      )
      Effect.runSync(ledger.retireRound(partition, round))
      expect(Effect.runSync(ledger.canonicalProjection()).delivery.counters).toEqual([])
      Effect.runSync(ledger.discardUnusedPartition(partition))
    }
    expect(Effect.runSync(ledger.partitionIdentityCount())).toBe(0)
  })

  it("routes delivery terminal and finding decisions through canonical Bend", () => {
    const ledger = Effect.runSync(makeResidentState())
    for (const [event, kind] of [
      [{ kind: "deliveryAcknowledgeCheck", items: 0, anyExpired: false }, "deliveryAckEmpty"],
      [{ kind: "deliveryAcknowledgeCheck", items: 1, anyExpired: true }, "deliveryAckExpired"],
      [{ kind: "deliveryAcknowledgeCheck", items: 1, anyExpired: false }, "deliveryAckReady"],
      [{ kind: "deliveryFinalizeCheck", items: 1, allAcknowledged: false, anyExpired: false }, "deliveryFinalEmpty"],
      [{ kind: "deliveryFinalizeCheck", items: 1, allAcknowledged: true, anyExpired: true }, "deliveryFinalExpired"],
      [{ kind: "deliveryFinalizeCheck", items: 1, allAcknowledged: true, anyExpired: false }, "deliveryFinalReady"],
      [{ kind: "deliveryFindingDispositionCheck", composed: true, remaining: 0 }, "deliveryKeepForReoffer"],
      [{ kind: "deliveryFindingDispositionCheck", composed: false, remaining: 1 }, "deliveryKeepRemaining"],
      [{ kind: "deliveryFindingDispositionCheck", composed: false, remaining: 0 }, "deliveryRetireAdvice"]
    ] as const) {
      expect(Effect.runSync(ledger.transition(event)).outputs).toEqual([{ category: "decision", kind }])
    }
  })

  it("routes composed submission and credential gates through canonical Bend", () => {
    const ledger = Effect.runSync(makeResidentState())
    const valid = {
      roundActive: true,
      hasRound: true,
      hasUnit: true,
      hasDelivery: true,
      pendingCapacity: true,
      submissionAllowed: true,
      currentWork: true,
      credentialAuthorized: true
    }
    expect(
      Effect.runSync(ledger.transition({ kind: "deliverySubmissionCandidateCheck", facts: valid })).outputs
    ).toEqual([{ category: "decision", kind: "deliverySubmissionCandidate" }])
    expect(
      Effect.runSync(
        ledger.transition({ kind: "deliverySubmissionCandidateCheck", facts: { ...valid, currentWork: false } })
      ).outputs
    ).toEqual([{ category: "decision", kind: "deliverySubmissionRefused" }])
    expect(
      Effect.runSync(ledger.transition({ kind: "deliverySubmissionBatchCheck", count: 0, allValid: true })).outputs
    ).toEqual([{ category: "decision", kind: "deliveryBatchRelease" }])
    expect(
      Effect.runSync(ledger.transition({ kind: "deliverySubmissionBatchCheck", count: 1, allValid: true })).outputs
    ).toEqual([{ category: "decision", kind: "deliveryBatchProceed" }])
    expect(
      Effect.runSync(
        ledger.transition({
          kind: "deliveryCredentialObserveCheck",
          invalidSeen: false,
          generationValid: true,
          authorized: true
        })
      ).outputs
    ).toEqual([{ category: "decision", kind: "deliveryCredentialValid" }])
    expect(
      Effect.runSync(
        ledger.transition({
          kind: "deliveryCredentialObserveCheck",
          invalidSeen: false,
          generationValid: false,
          authorized: false
        })
      ).outputs
    ).toEqual([{ category: "decision", kind: "deliveryCredentialInvalid" }])
    expect(
      Effect.runSync(
        ledger.transition({ kind: "deliveryFinalCredentialCheck", sharedCollect: true, invalidSeen: true })
      ).outputs
    ).toEqual([{ category: "decision", kind: "deliveryBatchRelease" }])
    expect(
      Effect.runSync(
        ledger.transition({ kind: "deliveryFinalCredentialCheck", sharedCollect: false, invalidSeen: true })
      ).outputs
    ).toEqual([{ category: "decision", kind: "deliveryBatchProceed" }])
  })

  it("routes revalidation and final handoff candidates through canonical Bend", () => {
    const ledger = Effect.runSync(makeResidentState())
    expect(
      Effect.runSync(ledger.transition({ kind: "validationRouteCheck", ownerCurrent: false, status: "current" }))
        .outputs
    ).toEqual([{ category: "decision", kind: "ignoreCandidate" }])
    expect(
      Effect.runSync(ledger.transition({ kind: "validationRouteCheck", ownerCurrent: true, status: "stale" })).outputs
    ).toEqual([{ category: "decision", kind: "retireCandidate" }])
    expect(
      Effect.runSync(ledger.transition({ kind: "validationRouteCheck", ownerCurrent: true, status: "current" })).outputs
    ).toEqual([{ category: "decision", kind: "continueCandidate" }])
    expect(
      Effect.runSync(
        ledger.transition({ kind: "postValidationCheck", workAccepted: true, expired: false, hasFitting: false })
      ).outputs
    ).toEqual([{ category: "decision", kind: "releaseCandidate" }])
    expect(
      Effect.runSync(
        ledger.transition({ kind: "postValidationCheck", workAccepted: true, expired: false, hasFitting: true })
      ).outputs
    ).toEqual([{ category: "decision", kind: "retainCandidate" }])
    expect(
      Effect.runSync(
        ledger.transition({
          kind: "finalCandidateCheck",
          ownerCurrent: true,
          credentialGeneration: true,
          credentialAuthorized: true,
          expired: true,
          workCurrent: true,
          hasFindings: true
        })
      ).outputs
    ).toEqual([{ category: "decision", kind: "retireCandidate" }])
  })

  it("routes Stop ownership, expiry, and submission through canonical Bend", () => {
    const ledger = Effect.runSync(makeResidentState())
    expect(
      Effect.runSync(ledger.transition({ kind: "roundBeginStopCheck", active: true, hasStop: false, token: 1 })).outputs
    ).toEqual([{ category: "decision", kind: "roundStopBegun" }])
    expect(
      Effect.runSync(ledger.transition({ kind: "roundBeginStopCheck", active: true, hasStop: true, token: 2 })).outputs
    ).toEqual([{ category: "decision", kind: "roundStopRefused" }])
    expect(
      Effect.runSync(
        ledger.transition({
          kind: "roundActivityCheck",
          bound: true,
          hasAdmission: true,
          round: 0,
          active: false,
          closedAt: 0,
          expectedGeneration: 1
        })
      ).outputs
    ).toEqual([{ category: "decision", kind: "roundInactive" }])
    expect(
      Effect.runSync(
        ledger.transition({
          kind: "roundActivityCheck",
          bound: true,
          hasAdmission: true,
          round: 1,
          active: false,
          closedAt: 100,
          expectedGeneration: 1
        })
      ).outputs
    ).toEqual([{ category: "decision", kind: "roundInactive" }])
    expect(
      Effect.runSync(ledger.transition({ kind: "roundBarrierCheck", hasStop: true, usedAtStart: 1, usedNow: 2 }))
        .outputs
    ).toEqual([{ category: "decision", kind: "roundBarrierRaised" }])
    expect(
      Effect.runSync(ledger.transition({ kind: "roundBarrierCheck", hasStop: false, usedAtStart: 1, usedNow: 2 }))
        .outputs
    ).toEqual([{ category: "decision", kind: "roundBarrierClear" }])
    expect(
      Effect.runSync(
        ledger.transition({ kind: "roundOwnsStopCheck", active: true, tokenMatches: true, deciding: true })
      ).outputs
    ).toEqual([{ category: "decision", kind: "roundStopNotOwned" }])
    expect(
      Effect.runSync(
        ledger.transition({ kind: "roundStopTerminalCheck", hasOutput: true, authorized: false, requestedClose: false })
      ).outputs
    ).toEqual([{ category: "decision", kind: "roundStopTerminal", revokeProvisional: true, close: true }])
    expect(
      Effect.runSync(ledger.transition({ kind: "roundExpireCloseCheck", barrier: false, authorizedOutput: true }))
        .outputs
    ).toEqual([{ category: "decision", kind: "roundExpireKeeps" }])
    expect(
      Effect.runSync(ledger.transition({ kind: "roundContinuationBudgetCheck", active: true, count: 4 })).outputs
    ).toEqual([{ category: "decision", kind: "roundContinuationExhausted" }])
    expect(
      Effect.runSync(
        ledger.transition({
          kind: "deliverySubmissionAllowedCheck",
          active: true,
          barrier: true,
          deciding: false,
          surface: "background",
          existingToken: false,
          finishPermit: false
        })
      ).outputs
    ).toEqual([{ category: "decision", kind: "deliverySubmissionDenied" }])
    expect(
      Effect.runSync(
        ledger.transition({
          kind: "deliveryExistingTokenCheck",
          surface: "stop",
          existingToken: true,
          finishPermit: false
        })
      ).outputs
    ).toEqual([{ category: "decision", kind: "deliveryExistingTokenDenied" }])
    expect(
      Effect.runSync(ledger.transition({ kind: "deliveryUnreservedStopCheck", active: true, deciding: true })).outputs
    ).toEqual([{ category: "decision", kind: "deliveryUnreservedStopDenied" }])
  })

  it("keeps permit and capacity transitions in one canonical resident state", () => {
    const ledger = Effect.runSync(makeResidentState())
    const partition = Effect.runSync(ledger.partitionId("agent"))
    const issued = Effect.runSync(
      ledger.transition({
        kind: "issuePermit",
        partition,
        lifetime: 1,
        tool: 7,
        started: 100,
        deadline: 300,
        now: 110,
        minimumStarted: 0,
        facts: {
          clockValid: true,
          hookWindow: 2500,
          startedUpper: 100,
          nowLower: 101,
          adviceePermitLimit: 32,
          residentPermitLimit: 4096
        }
      })
    )
    expect(issued.outputs[0]).toEqual({ category: "event", kind: "permitIssued", token: 1, round: 1 })
    const charge = Effect.runSync(ledger.reserve("agent", 10, "observationDispatch"))
    expect(charge).toBeDefined()
    expect(Effect.runSync(ledger.canonicalProjection())).toMatchObject({
      global: { items: 1, bytes: 10 },
      admissions: [{ partition, permits: [{ token: 1, tool: 7, round: 1 }] }]
    })
    expect(
      Effect.runSync(ledger.transition({ kind: "consumePermit", partition, lifetime: 1, token: 1, tool: 7, now: 120 }))
        .outputs[0]
    ).toEqual({ category: "event", kind: "permitConsumed", round: 1 })
    if (charge !== undefined) expect(Effect.runSync(ledger.release(charge))).toBe(true)
    expect(Effect.runSync(ledger.canonicalProjection())).toMatchObject({
      global: { items: 0, bytes: 0 },
      admissions: [{ partition, active: true, permits: [] }]
    })
  })

  it("fences late work callbacks after round retirement without opening a new round", () => {
    const ledger = Effect.runSync(makeResidentState())
    const round = Effect.runSync(ledger.roundId("agent"))
    const observation = Effect.runSync(ledger.admitObservation("agent"))
    expect(Effect.runSync(ledger.observation("agent", observation, "startObservation", round))).toBe(true)
    const preparation = Effect.runSync(ledger.beginObservedPreparation("agent", observation, 10, round))
    expect(preparation.status).toBe("admitted")
    const completion = ledger.observation("agent", observation, "completeObservation", round)
    const latePreparation = ledger.beginObservedPreparation("agent", observation, 10, round)
    const split =
      preparation.status !== "admitted"
        ? undefined
        : ledger.completePreparation("agent", preparation.operation, preparation.reservation, [5], round)
    Effect.runSync(ledger.retireRound("agent", round))
    expect(Effect.runSync(completion)).toBe(false)
    expect(Effect.runSync(latePreparation)).toEqual({ status: "unavailable", reason: "wrong-stage" })
    if (split !== undefined) expect(() => Effect.runSync(split)).toThrow("invalid canonical preparation completion")
    expect(Effect.runSync(ledger.canonicalProjection()).rounds).toEqual([])
    expect(Effect.runSync(ledger.canonicalProjection()).work).toEqual([])
    expect(Effect.runSync(ledger.snapshot())).toEqual({ items: 0, bytes: 0, partitions: {} })
  })

  it("fences old callbacks and retirement after a successor round opens", () => {
    const ledger = Effect.runSync(makeResidentState())
    const oldRound = Effect.runSync(ledger.roundId("agent"))
    const oldSource = Effect.runSync(ledger.admitObservation("agent", oldRound))
    Effect.runSync(ledger.retireRound("agent", oldRound))
    const nextRound = Effect.runSync(ledger.roundId("agent"))
    const source = Effect.runSync(ledger.admitObservation("agent", nextRound))
    Effect.runSync(ledger.retireRound("agent", oldRound))
    expect(Effect.runSync(ledger.roundId("agent"))).toBe(nextRound)
    expect(Effect.runSync(ledger.observation("agent", oldSource, "startObservation", oldRound))).toBe(false)
    expect(Effect.runSync(ledger.observation("agent", source, "startObservation", oldRound))).toBe(false)
    expect(Effect.runSync(ledger.beginObservedPreparation("agent", source, 10, oldRound))).toEqual({
      status: "unavailable",
      reason: "wrong-stage"
    })
    expect(Effect.runSync(ledger.observation("agent", source, "startObservation", nextRound))).toBe(true)
    const preparation = Effect.runSync(ledger.beginObservedPreparation("agent", source, 10, nextRound))
    expect(preparation.status).toBe("admitted")
    if (preparation.status !== "admitted") throw new Error("preparation missing")
    const [unit] = Effect.runSync(
      ledger.completePreparation("agent", preparation.operation, preparation.reservation, [5], nextRound)
    )
    if (unit === undefined) throw new Error("unit missing")
    expect(Effect.runSync(ledger.startReview("agent", unit.operation, oldRound))).toBe(false)
    expect(Effect.runSync(ledger.completeReview("agent", unit.operation, unit.reservation, "clear", oldRound))).toBe(
      false
    )
    expect(Effect.runSync(ledger.startReview("agent", unit.operation, nextRound))).toBe(true)
    expect(
      Effect.runSync(
        ledger.readyJevRequest(
          "agent",
          unit.operation,
          unit.reservation,
          {
            rootValid: true,
            configurationValid: true,
            credentialReady: true,
            selected: true,
            currentWork: true,
            physicalAvailable: true
          },
          oldRound
        )
      )
    ).toEqual({ status: "stale" })
    expect(Effect.runSync(ledger.canonicalProjection()).rounds).toHaveLength(1)
    expect(Effect.runSync(ledger.snapshot())).toMatchObject({ items: 1, bytes: 5 })
  })

  it("selects the current supported profile limits by default", () => {
    const ledger = Effect.runSync(makeResidentState())
    expect(Effect.runSync(ledger.canonicalProjection()).limits).toEqual({
      globalItems: 512,
      globalBytes: 512 * 1024 * 1024,
      partitionItems: 16,
      partitionBytes: 256 * 1024 * 1024
    })
  })

  it("admits a Dalph-sized workspace and enforces enlarged default byte boundaries", () => {
    const ledger = Effect.runSync(makeResidentState())
    const partitionBytes = 256 * 1024 * 1024
    const workspace = Effect.runSync(ledger.reserve("one", 203 * 1024 * 1024, "preparation"))
    expect(workspace).toBeDefined()
    if (workspace === undefined) throw new Error("large preparation workspace refused")
    expect(Effect.runSync(ledger.resize(workspace, partitionBytes, "preparation"))).toMatchObject({ status: "resized" })
    expect(Effect.runSync(ledger.resize(workspace, partitionBytes + 1, "preparation"))).toMatchObject({
      status: "capacity-refused"
    })
    expect(Effect.runSync(ledger.reserve("one", 1, "reviewUnit"))).toBeUndefined()
    const other = Effect.runSync(ledger.reserve("two", partitionBytes, "preparation"))
    expect(other).toBeDefined()
    expect(Effect.runSync(ledger.reserve("three", 1, "reviewUnit"))).toBeUndefined()
    expect(Effect.runSync(ledger.snapshot())).toMatchObject({ bytes: 512 * 1024 * 1024, items: 2 })
    expect(Effect.runSync(ledger.release(workspace))).toBe(true)
    expect(Effect.runSync(ledger.release(workspace))).toBe(false)
    if (other === undefined) throw new Error("second partition refused at global boundary")
    expect(Effect.runSync(ledger.release(other))).toBe(true)
    expect(Effect.runSync(ledger.snapshot())).toEqual({ bytes: 0, items: 0, partitions: {} })
  })

  it("accepts exact count boundaries and isolates partition pressure", () => {
    const ledger = Effect.runSync(
      makeResidentState({ globalItems: 4, globalBytes: 100, partitionItems: 2, partitionBytes: 60 })
    )
    const first = Effect.runSync(ledger.reserve("one", 20, "reviewUnit"))
    const second = Effect.runSync(ledger.reserve("one", 40, "reviewUnit"))
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(Effect.runSync(ledger.reserve("one", 0, "reviewUnit"))).toBeUndefined()
    expect(Effect.runSync(ledger.reserve("two", 20, "reviewUnit"))).toBeDefined()
    expect(Effect.runSync(ledger.reserve("three", 20, "reviewUnit"))).toBeDefined()
    expect(Effect.runSync(ledger.snapshot())).toMatchObject({ items: 4, bytes: 100 })
    expect(Effect.runSync(ledger.reserve("four", 0, "reviewUnit"))).toBeUndefined()
  })

  it("accepts exact byte boundaries, rejects one byte over, and releases idempotently", () => {
    const ledger = Effect.runSync(
      makeResidentState({ globalItems: 3, globalBytes: 10, partitionItems: 2, partitionBytes: 6 })
    )
    const local = Effect.runSync(ledger.reserve("one", 6, "reviewUnit"))
    expect(local).toBeDefined()
    expect(Effect.runSync(ledger.reserve("one", 1, "reviewUnit"))).toBeUndefined()
    const global = Effect.runSync(ledger.reserve("two", 4, "reviewUnit"))
    expect(global).toBeDefined()
    expect(Effect.runSync(ledger.reserve("three", 1, "reviewUnit"))).toBeUndefined()
    if (local === undefined || global === undefined) return
    expect(Effect.runSync(ledger.release(local))).toBe(true)
    expect(Effect.runSync(ledger.release(local))).toBe(false)
    expect(Effect.runSync(ledger.release(global))).toBe(true)
    expect(Effect.runSync(ledger.snapshot())).toEqual({ items: 0, bytes: 0, partitions: {} })
  })

  it("clears all reservations at a lifecycle terminal", () => {
    const ledger = Effect.runSync(makeResidentState())
    const running = Effect.runSync(ledger.reserve("one", 10, "reviewUnit"))
    expect(running).toBeDefined()
    Effect.runSync(ledger.clear())
    expect(Effect.runSync(ledger.snapshot())).toEqual({ items: 0, bytes: 0, partitions: {} })
    if (running !== undefined) expect(Effect.runSync(ledger.release(running))).toBe(false)
  })

  it("reports partition names that overlap Object.prototype keys", () => {
    const ledger = Effect.runSync(makeResidentState())
    expect(Effect.runSync(ledger.reserve("__proto__", 1, "reviewUnit"))).toBeDefined()
    expect(Object.hasOwn(Effect.runSync(ledger.snapshot()).partitions, "__proto__")).toBe(true)
    expect(Effect.runSync(ledger.snapshot()).partitions["__proto__"]).toEqual({ items: 1, bytes: 1 })
  })

  it("resizes preparation workspace and atomically replaces it with exact units", () => {
    const ledger = Effect.runSync(
      makeResidentState({ globalItems: 4, globalBytes: 100, partitionItems: 3, partitionBytes: 80 })
    )
    const workspace = Effect.runSync(ledger.reserve("one", 20, "preparation"))
    expect(workspace).toBeDefined()
    if (workspace === undefined) return
    expect(Effect.runSync(ledger.resize(workspace, 80))).toEqual({ status: "resized" })
    expect(Effect.runSync(ledger.resize(workspace, 81))).toEqual({
      status: "capacity-refused",
      constraint: "partitionBytes"
    })
    const replacements = Effect.runSync(ledger.replace(workspace, [30, 30, 20, 1]))
    expect(replacements.slice(0, 3).every((item) => item !== undefined)).toBe(true)
    expect(replacements[3]).toBeUndefined()
    expect(Effect.runSync(ledger.snapshot())).toMatchObject({ items: 3, bytes: 80 })
  })

  it("shares capacity across advicees and releases each replacement exactly once", () => {
    const ledger = Effect.runSync(
      makeResidentState({ globalItems: 3, globalBytes: 100, partitionItems: 2, partitionBytes: 60 })
    )
    const first = Effect.runSync(ledger.reserve("agent-a", 30, "preparation"))
    const second = Effect.runSync(ledger.reserve("agent-b", 40, "preparation"))
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) return
    const [one, refused, three] = Effect.runSync(ledger.replace(first, [10, 60, 20]))
    expect(one === undefined ? undefined : Effect.runSync(ledger.reservationSnapshot(one))?.purpose).toBe("reviewUnit")
    expect(refused).toBeUndefined()
    expect(three === undefined ? undefined : Effect.runSync(ledger.reservationSnapshot(three))?.purpose).toBe(
      "reviewUnit"
    )
    expect(Effect.runSync(ledger.snapshot())).toEqual({
      items: 3,
      bytes: 70,
      partitions: { "agent-a": { items: 2, bytes: 30 }, "agent-b": { items: 1, bytes: 40 } }
    })
    expect(Effect.runSync(ledger.replace(first, [5]))).toEqual([undefined])
    expect(Effect.runSync(ledger.release(first))).toBe(false)
    if (one === undefined || three === undefined) return
    expect(Effect.runSync(ledger.release(second))).toBe(true)
    expect(Effect.runSync(ledger.resize(one, 20, "adviceRecheck"))).toEqual({ status: "resized" })
    expect(Effect.runSync(ledger.reservationSnapshot(one))?.purpose).toBe("adviceRecheck")
    expect(Effect.runSync(ledger.release(one))).toBe(true)
    expect(Effect.runSync(ledger.release(one))).toBe(false)
    expect(Effect.runSync(ledger.release(three))).toBe(true)
    expect(Effect.runSync(ledger.snapshot())).toEqual({ items: 0, bytes: 0, partitions: {} })
  })

  it("rejects unknown, negative, and unsafe output reservations", () => {
    const ledger = Effect.runSync(makeResidentState())
    expect(Effect.runSync(ledger.reserve("partition", Number.NaN, "reviewUnit"))).toBeUndefined()
    expect(Effect.runSync(ledger.reserve("partition", Number.POSITIVE_INFINITY, "reviewUnit"))).toBeUndefined()
    expect(Effect.runSync(ledger.reserve("partition", -1, "reviewUnit"))).toBeUndefined()
    expect(Effect.runSync(ledger.reserve("partition", Number.MAX_SAFE_INTEGER + 1, "reviewUnit"))).toBeUndefined()
    expect(Effect.runSync(ledger.reserve("partition", 2 ** 47, "reviewUnit"))).toBeUndefined()
    expect(Effect.runSync(ledger.snapshot())).toEqual({ items: 0, bytes: 0, partitions: {} })
  })

  it("releases preparation space when measured replacement input violates the Bend bound", () => {
    const ledger = Effect.runSync(makeResidentState())
    const workspace = Effect.runSync(ledger.reserve("agent", 20, "preparation"))
    if (workspace === undefined) throw new Error("missing preparation reservation")
    expect(() => Effect.runSync(ledger.replace(workspace, [2 ** 47]))).toThrow(TypeError)
    expect(Effect.runSync(ledger.release(workspace))).toBe(false)
    expect(Effect.runSync(ledger.snapshot())).toEqual({ items: 0, bytes: 0, partitions: {} })
  })

  it("rejects malformed and oversized unknown output before retention", () => {
    const maximum = 64
    const base = Buffer.byteLength(JSON.stringify({ output: "" }), "utf8")
    expect(encodedBytesWithin({ output: "x".repeat(maximum - base) }, maximum)).toBe(maximum)
    expect(encodedBytesWithin({ output: "x".repeat(maximum - base + 1) }, maximum)).toBeUndefined()
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(encodedBytesWithin(cyclic, maximum)).toBeUndefined()
    expect(encodedBytesWithin(1n, maximum)).toBeUndefined()
  })
})

effectIt.effect("reads reservation metadata on execution and fences foreign or recycled capabilities", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const reservation = (yield* owner.reserve("fixture", 10, "preparation"))!
    const read = owner.reservationSnapshot(reservation)
    const initial = yield* read
    expect(initial).toEqual({ bytes: 10, purpose: "preparation" })
    expect(Object.isFrozen(initial)).toBe(true)
    expect(yield* owner.resize(reservation, 20)).toEqual({ status: "resized" })
    expect(yield* read).toEqual({ bytes: 20, purpose: "preparation" })
    expect(initial?.bytes).toBe(10)
    expect(yield* owner.reservationSnapshot({ ...reservation })).toBeUndefined()
    const forged = {
      id: reservation.id,
      partition: reservation.partition,
      get bytes(): number {
        throw new Error("foreign metadata getter")
      },
      get purpose(): "preparation" {
        throw new Error("foreign metadata getter")
      }
    }
    expect(yield* owner.resize(forged, 21)).toEqual({ status: "invalid-reservation" })
    expect(yield* owner.resize(reservation, 20, "storedResult")).toEqual({ status: "resized" })
    expect(yield* owner.resize(reservation, 21)).toEqual({ status: "resized" })
    expect(yield* read).toEqual({ bytes: 21, purpose: "storedResult" })
    const clear = owner.clear()
    expect(yield* read).toEqual({ bytes: 21, purpose: "storedResult" })
    yield* clear
    const replacement = (yield* owner.reserve("fixture", 30, "preparation"))!
    expect(replacement.id).toBe(reservation.id)
    expect(yield* read).toBeUndefined()
    expect(yield* owner.reservationSnapshot(replacement)).toEqual({ bytes: 30, purpose: "preparation" })
  })
)

effectIt.effect("defers dispatch identity allocation and shares one partition across competing executions", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const identity = owner.dispatchIdentity("agent", 7)
    expect(yield* owner.partitionIdentityCount()).toBe(0)
    const identities = yield* Effect.forEach(Array.from({ length: 16 }), () => identity, { concurrency: "unbounded" })
    expect(identities).toEqual(Array.from({ length: 16 }, () => ({ partition: 1, round: 7 })))
    expect(yield* owner.partitionIdentityCount()).toBe(1)
    const partition = owner.partitionId("other")
    expect(yield* owner.partitionIdentityCount()).toBe(1)
    const allocated = yield* Effect.forEach(Array.from({ length: 16 }), () => partition, { concurrency: "unbounded" })
    expect(allocated).toEqual(Array.from({ length: 16 }, () => 2))
    expect(yield* owner.dispatchIdentity("other", 8)).toEqual({ partition: 2, round: 8 })
    expect(yield* owner.partitionIdentityCount()).toBe(2)
  })
)

effectIt.effect("allocates one collection token identity on execution and prunes only released keys", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const allocate = owner.collectionTokenId("collector")
    expect(yield* owner.collectionTokenIdentityCount()).toBe(0)
    const ids = yield* Effect.forEach(Array.from({ length: 16 }), () => allocate, { concurrency: "unbounded" })
    expect(new Set(ids).size).toBe(1)
    expect(yield* owner.collectionTokenIdentityCount()).toBe(1)
    yield* owner.pruneCollectionTokenIds(new Set(["collector"]))
    expect(yield* allocate).toBe(ids[0])
    const prune = owner.pruneCollectionTokenIds(new Set())
    expect(yield* owner.collectionTokenIdentityCount()).toBe(1)
    yield* prune
    expect(yield* owner.collectionTokenIdentityCount()).toBe(0)
  })
)

effectIt.effect("opens one canonical round for competing deferred identity requests", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const round = owner.roundId("agent")
    const read = owner.currentRoundId("agent")
    expect(yield* read).toBeUndefined()
    expect(yield* owner.partitionIdentityCount()).toBe(0)
    const rounds = yield* Effect.forEach(Array.from({ length: 16 }), () => round, { concurrency: "unbounded" })
    expect(new Set(rounds).size).toBe(1)
    expect(rounds[0]).toBeGreaterThan(0)
    expect(yield* read).toBe(rounds[0])
    expect(yield* owner.partitionIdentityCount()).toBe(1)
    expect(yield* round).toBe(rounds[0])
    const retire = owner.retireRound("agent", rounds[0]!)
    expect(yield* read).toBe(rounds[0])
    yield* retire
    expect(yield* read).toBeUndefined()
    const replacement = yield* round
    expect(replacement).toBeGreaterThan(rounds[0]!)
    yield* retire
    expect(yield* read).toBe(replacement)
  })
)

effectIt.effect("defers observation admission and rolls back an invalid round", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const admission = owner.admitObservation("agent")
    const before = yield* owner.canonicalProjection()
    expect(yield* owner.currentRoundId("agent")).toBeUndefined()
    expect(yield* owner.canonicalProjection()).toEqual(before)
    const admissions = yield* Effect.forEach(Array.from({ length: 16 }), () => admission, { concurrency: "unbounded" })
    expect(new Set(admissions).size).toBe(16)
    const round = yield* owner.currentRoundId("agent")
    if (round === undefined) throw new Error("fixture round missing")
    const retained = yield* owner.canonicalProjection()
    const failed = yield* Effect.exit(owner.admitObservation("agent", round + 1))
    expect(Exit.isFailure(failed)).toBe(true)
    expect(yield* owner.canonicalProjection()).toEqual(retained)
    expect(yield* owner.currentRoundId("agent")).toBe(round)
  })
)

it.each([
  [0, true, true, true],
  [1, true, true, false],
  [0, false, true, false],
  [0, true, false, false]
])("classifies empty preparation with ready=%s, attempted=%s, authority=%s", (ready, attempted, authority, lost) => {
  const owner = Effect.runSync(makeResidentState())
  expect(Effect.runSync(owner.emptyPrepared(ready, attempted, authority))).toBe(lost)
  expect(Effect.runSync(owner.snapshot()).items).toBe(0)
})

it.each([
  [2, 2, false, true],
  [2, 1, false, false],
  [2, 2, true, false],
  [0, 0, false, true]
])(
  "bounds discard scope to named jobs when named=%s, cancelled=%s, unnamed=%s",
  (named, cancelled, unnamed, namedOnly) => {
    const owner = Effect.runSync(makeResidentState())
    expect(Effect.runSync(owner.dispatchScope(named, cancelled, unnamed))).toBe(namedOnly)
    expect(Effect.runSync(owner.snapshot()).items).toBe(0)
  }
)
