import type { ReviewSettingsSnapshot } from "../runtime/review-settings.ts"
import type { Finding } from "../direct-event/output.ts"
import type { PreparedUnit } from "../direct-event/model.ts"
import type { DirectObservation } from "../direct-event/observation.ts"
import type { EvaluatedUnit } from "../direct-event/pipeline.ts"
import type { CapacityLedger, CapacityReservation } from "./capacity.ts"
import type { WorkRevision } from "./revision.ts"
import type { RoundWork } from "./round-records.ts"

export type AdviceMetadata = {
  readonly settings: ReviewSettingsSnapshot
  readonly id: string
  readonly analyticsPath: string | undefined
  readonly analyticsEnabled: boolean
  readonly analyticsControlled: boolean
  readonly canonicalRound: number
  readonly round?: RoundWork
  readonly workUnitId?: number
  readonly admissionId: number
  readonly canonicalOperationId: number
  readonly observation: DirectObservation
  readonly partition: string
  readonly reservation: CapacityReservation
  readonly prepared: PreparedUnit
  readonly sourceHash?: string
  readonly revision: WorkRevision
  readonly evaluationKey: string
  readonly sequence: number
  readonly credentialGeneration: number | null
  readonly credentialStatePath: string | null
  readonly credentialRequired: boolean
  readonly credentialEnvironmentOnly: boolean
  readonly pendingAt: number
}
export type AdviceDelivery = {
  readonly token: string
  readonly findings: ReadonlyArray<Finding>
  readonly leaseUntil: number
  readonly acknowledged: boolean
}
export type AdviceContent = {
  readonly evaluations: ReadonlyArray<EvaluatedUnit>
  readonly findings: ReadonlyArray<Finding>
  readonly collectionEligible: boolean
  readonly delivery?: AdviceDelivery
}
/** Immutable identity capability; content is read through its owning service. */
export type Advice = AdviceMetadata
export type AdviceInitial = AdviceMetadata & Pick<AdviceContent, "evaluations" | "findings">
export type AdviceRecordsState = {
  readonly entries: ReadonlyMap<string, { readonly capability: Advice; readonly content: AdviceContent }>
}
export const initialAdviceRecords = (): AdviceRecordsState => ({ entries: new Map() })
export const draftAdviceRecords = (state: AdviceRecordsState) => ({ entries: new Map(state.entries) })
export const emptyAdviceContent: AdviceContent = Object.freeze({
  evaluations: Object.freeze([]),
  findings: Object.freeze([]),
  collectionEligible: false
})
const findingsSnapshot = (findings: ReadonlyArray<Finding>): ReadonlyArray<Finding> =>
  Object.freeze(findings.map((finding) => Object.freeze({ ...finding })))
const evaluationsSnapshot = (evaluations: ReadonlyArray<EvaluatedUnit>): ReadonlyArray<EvaluatedUnit> =>
  Object.freeze(
    evaluations.map((evaluation) => Object.freeze({ ...evaluation, findings: findingsSnapshot(evaluation.findings) }))
  )
const deliverySnapshot = (
  delivery: AdviceDelivery | undefined,
  previous: AdviceDelivery | undefined
): Pick<AdviceContent, "delivery"> => {
  if (delivery === undefined) return {}
  return {
    delivery: Object.freeze({
      ...delivery,
      findings: delivery.findings === previous?.findings ? delivery.findings : findingsSnapshot(delivery.findings)
    })
  }
}
const contentSnapshot = (content: AdviceContent, previous?: AdviceContent): AdviceContent =>
  Object.freeze({
    ...content,
    evaluations:
      content.evaluations === previous?.evaluations ? content.evaluations : evaluationsSnapshot(content.evaluations),
    findings: content.findings === previous?.findings ? content.findings : findingsSnapshot(content.findings),
    ...deliverySnapshot(content.delivery, previous?.delivery)
  })
export const adviceRecordOperations = (draft: ReturnType<typeof draftAdviceRecords>, owner: CapacityLedger) => {
  const entry = (advice: Advice) => {
    const retained = draft.entries.get(advice.id)
    return retained?.capability === advice ? retained : undefined
  }
  const write = (advice: Advice, content: AdviceContent): void => {
    draft.entries.set(
      advice.id,
      Object.freeze({ capability: advice, content: contentSnapshot(content, entry(advice)?.content) })
    )
  }
  const recordFindingCount = (advice: AdviceMetadata, count: number): void => {
    if (count < 1) return
    const result = owner.transition({
      kind: "findingCountUpdated",
      partition: owner.partitionId(advice.partition),
      lifetime: 1,
      round: advice.canonicalRound,
      operation: advice.canonicalOperationId,
      count
    })
    if (result.rejection !== undefined || result.commands[0]?.kind !== "findingCountRecorded")
      throw new Error("canonical finding count update refused")
  }
  const updateDelivery = (advice: Advice, token: string, update: Partial<Omit<AdviceDelivery, "token">>): boolean => {
    const retained = entry(advice)
    const delivery = retained?.content.delivery
    if (retained === undefined || delivery?.token !== token) return false
    write(advice, { ...retained.content, delivery: { ...delivery, ...update } })
    return true
  }
  const assertAdviceIdentity = (initial: AdviceInitial): void => {
    if (
      draft.entries.has(initial.id) ||
      [...draft.entries.values()].some(
        ({ capability }) =>
          capability.evaluationKey === initial.evaluationKey ||
          capability.canonicalOperationId === initial.canonicalOperationId
      )
    )
      throw new Error("duplicate retained advice identity")
  }
  const assertAdviceFindingOwner = (initial: AdviceInitial): void => {
    const work = owner.canonicalProjection().work.find((work) => work.operation === initial.canonicalOperationId)
    if (
      work?.kind !== "pendingFinding" ||
      work.partition !== owner.knownPartitionId(initial.partition) ||
      work.round !== initial.canonicalRound ||
      work.reservation !== initial.reservation.id
    )
      throw new Error("retained advice lacks its canonical finding owner")
  }
  const retainAdviceReservation = (initial: AdviceInitial): void => {
    const reservation = owner.reservationSnapshot(initial.reservation)
    if (reservation === undefined || !owner.resize(initial.reservation, reservation.bytes, "storedResult"))
      throw new Error("Bend denied review result retention reservation")
  }
  return {
    insert: (initial: AdviceInitial, capability: (metadata: AdviceMetadata) => Advice): Advice => {
      assertAdviceIdentity(initial)
      assertAdviceFindingOwner(initial)
      retainAdviceReservation(initial)
      recordFindingCount(initial, initial.findings.length)
      const { evaluations, findings, ...metadata } = initial
      const advice = capability(Object.freeze(metadata))
      write(advice, { evaluations, findings, collectionEligible: false })
      return advice
    },
    eligible: (advice: Advice, joinedPending: boolean): boolean => {
      const retained = entry(advice)
      if (retained === undefined) return false
      const result = owner.transition({
        kind: "collectionReady",
        advice: advice.canonicalOperationId,
        partition: owner.partitionId(advice.partition),
        lifetime: owner.canonicalLifetime,
        round: advice.canonicalRound,
        observation: advice.admissionId,
        joinedPending
      })
      const command = result.commands[0]?.kind
      if (result.rejection !== undefined || (command !== "collectionEligible" && command !== "collectionWaiting"))
        throw new Error("canonical collection readiness refused")
      if (command === "collectionWaiting") return false
      write(advice, { ...retained.content, collectionEligible: true })
      return true
    },
    revise: (advice: Advice, evaluations: ReadonlyArray<EvaluatedUnit>, findings: ReadonlyArray<Finding>): boolean => {
      const retained = entry(advice)
      if (retained === undefined) return false
      recordFindingCount(advice, findings.length)
      write(advice, { ...retained.content, evaluations, findings })
      return true
    },
    reserveLease: (advice: Advice, token: string): boolean => {
      const retained = entry(advice)
      if (retained === undefined || retained.content.delivery !== undefined) return false
      const result = owner.transition({
        kind: "collectionReserveLease",
        advice: advice.canonicalOperationId,
        token: owner.collectionTokenId(token)
      })
      const command = result.commands[0]?.kind
      if (
        result.rejection !== undefined ||
        (command !== "collectionLeaseReserved" && command !== "collectionLeaseRefused")
      )
        throw new Error("canonical advice lease refused")
      if (command === "collectionLeaseRefused") return false
      write(advice, {
        ...retained.content,
        delivery: { token, findings: [], leaseUntil: Number.POSITIVE_INFINITY, acknowledged: false }
      })
      return true
    },
    releaseLease: (advice: Advice, token?: string): boolean => {
      const retained = entry(advice)
      const delivery = retained?.content.delivery
      if (retained === undefined || delivery === undefined || (token !== undefined && token !== delivery.token))
        return false
      const result = owner.transition({
        kind: "collectionReleaseLease",
        advice: advice.canonicalOperationId,
        token: owner.collectionTokenId(delivery.token)
      })
      if (result.rejection !== undefined || result.commands[0]?.kind !== "collectionLeaseReleased")
        throw new Error("canonical advice lease release refused")
      const { delivery: _, ...content } = retained.content
      write(advice, content)
      return true
    },
    checkLease: (
      advice: Advice,
      now: number,
      stopCollector: boolean,
      sameGroup: boolean,
      reofferable: boolean
    ): void => {
      const retained = entry(advice)
      const delivery = retained?.content.delivery
      if (retained === undefined || delivery === undefined) return
      const result = owner.transition({
        kind: "collectionLeaseCheck",
        advice: advice.canonicalOperationId,
        token: owner.collectionTokenId(delivery.token),
        expired: delivery.leaseUntil <= now,
        stopCollector,
        sameGroup,
        reofferable
      })
      if (result.rejection !== undefined) throw new Error("canonical collection lease check refused")
      const command = result.commands[0]?.kind
      if (command === "collectionLeaseReleased") {
        const { delivery: _, ...content } = retained.content
        write(advice, content)
      } else if (command !== "collectionLeaseKept") throw new Error("invalid canonical collection lease check")
    },
    updateDelivery,
    remove: (advice: Advice, token?: string): boolean => {
      const retained = entry(advice)
      if (retained === undefined || (token !== undefined && token !== retained.content.delivery?.token)) return false
      const retired = owner.transition({ kind: "collectionRetireAdvice", advice: advice.canonicalOperationId })
      if (retired.rejection !== undefined || retired.commands[0]?.kind !== "collectionAdviceRetired")
        throw new Error("canonical advice retirement refused")
      draft.entries.delete(advice.id)
      return true
    },
    assert: (): void => {
      const leases = owner.canonicalProjection().collection.leases
      for (const retained of draft.entries.values()) {
        const { capability: advice, content } = retained
        const lease = leases.find((lease) => lease.advice === advice.canonicalOperationId)
        if (
          (content.delivery === undefined) !== (lease === undefined) ||
          (content.delivery !== undefined && lease?.owner !== owner.collectionTokenId(content.delivery.token))
        )
          throw new Error("native advice delivery differs from canonical lease")
      }
      for (const lease of leases)
        if (![...draft.entries.values()].some(({ capability }) => capability.canonicalOperationId === lease.advice))
          throw new Error("canonical lease lost native advice")
    }
  }
}
export type AdviceRecordOperations = ReturnType<typeof adviceRecordOperations>
