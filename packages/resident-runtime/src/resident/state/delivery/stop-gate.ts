import type { CapacityLedger } from "../capacity/operations.ts"
import { type DeliveryDraft, type PermitTransition, type EditPermit } from "./model.ts"
import { type DeliveryPorts } from "./ports.ts"

export const deliveryStopGate = (
  state: DeliveryDraft,
  canonicalOwner: Pick<
    CapacityLedger,
    "canonicalProjection" | "partitionId" | "transition" | "currentRoundId" | "roundId" | "acknowledgeStopRelease"
  >,
  {
    readGeneration,
    continuationCount,
    isDeciding,
    canonicalCommandAccepted,
    finishPermit,
    currentStop
  }: Pick<
    DeliveryPorts,
    "readGeneration" | "continuationCount" | "isDeciding" | "canonicalCommandAccepted" | "finishPermit" | "currentStop"
  >
) => {
  function isActive(partition: string, generation = readGeneration(partition)): boolean {
    const admission = canonicalOwner
      .canonicalProjection()
      .admissions.find((item) => item.partition === canonicalOwner.partitionId(partition))
    // Only accepted post-edit admission binds a host round.
    const result = canonicalOwner.transition({
      kind: "roundActivityCheck",
      bound: state.rounds.has(partition),
      hasAdmission: admission !== undefined,
      round: admission?.round ?? 0,
      active: admission?.active ?? false,
      closedAt: admission?.closedAt ?? 0,
      expectedGeneration: generation
    })
    if (result.rejection !== undefined || result.outputs.length !== 1)
      throw new Error("canonical round activity refused")
    return result.outputs[0]?.kind === "roundActive"
  }

  function beginStop(partition: string, token: string): boolean {
    const id = state.nextStopId++
    const decision = canonicalOwner.transition({
      kind: "roundBeginStopCheck",
      active: isActive(partition),
      hasStop: state.stops.has(partition),
      token: id
    })
    if (decision.rejection !== undefined || decision.outputs[0]?.kind !== "roundStopBegun") return false
    const reset = canonicalOwner.transition({
      kind: "quietRoundReset",
      partition: canonicalOwner.partitionId(partition),
      lifetime: 1,
      round: canonicalOwner.currentRoundId(partition)!
    })
    if (reset.rejection !== undefined || reset.outputs[0]?.kind !== "quietRoundResetRecorded") {
      throw new Error("canonical quiet reset refused at Stop")
    }
    state.stops.set(partition, {
      token,
      id,
      generation: readGeneration(partition),
      canonicalRound: canonicalOwner.roundId(partition),
      continuationsAtStart: continuationCount(partition)
    })
    canonicalOwner.roundId(partition)
    return true
  }

  function ownsStop(partition: string, token: string): boolean {
    const stop = state.stops.get(partition)
    const decision = canonicalOwner.transition({
      kind: "roundOwnsStopCheck",
      active: stop !== undefined && isActive(partition, stop.generation),
      tokenMatches: stop?.token === token,
      deciding: isDeciding(partition)
    })
    if (decision.rejection !== undefined || decision.outputs.length !== 1)
      throw new Error("canonical Stop ownership refused")
    return decision.outputs[0]?.kind === "roundStopOwned"
  }

  function unfinishedSourceOperations(
    projection: ReturnType<CapacityLedger["canonicalProjection"]>,
    owner: number,
    round: number
  ): Set<number> {
    return new Set(
      projection.work
        .filter(
          (item) =>
            item.partition === owner &&
            item.round === round &&
            (item.kind === "awaitingSourceRead" || item.kind === "sourceReading")
        )
        .map((item) => item.operation)
    )
  }

  function acknowledgeCutoffReservations(cutoff: PermitTransition): void {
    for (const command of cutoff.outputs)
      if (command.kind === "reservationReleased") canonicalOwner.acknowledgeStopRelease(command.id)
  }

  function releaseCutoffPermit(partition: string, key: string, permit: EditPermit): void {
    const released = canonicalOwner.transition({
      kind: "releasePermit",
      partition: canonicalOwner.partitionId(partition),
      lifetime: 1,
      token: permit.token
    })
    if (!canonicalCommandAccepted(released, "permitReleased"))
      throw new Error("canonical permit cutoff disagrees with resident")
    finishPermit(key, "released")
  }

  function releaseCutoffPermits(partition: string): void {
    for (const [key, permit] of state.permits)
      if (permit.partition === partition) releaseCutoffPermit(partition, key, permit)
  }

  function finishGate(
    partition: string,
    token: string,
    extraUnfinished: number,
    deadlineReached: boolean
  ):
    | { readonly status: "waiting" }
    | {
        readonly status: "cutoff"
        readonly cancelledSource: number[]
        readonly cancelledJev: number[]
        readonly limited: boolean
      }
    | undefined {
    const stop = currentStop(partition, token)
    if (stop === undefined) return undefined
    const canonicalRound = stop.canonicalRound
    const projection = canonicalOwner.canonicalProjection()
    const owner = canonicalOwner.partitionId(partition)
    const cutoff = canonicalOwner.transition({
      kind: "stopGroupPolled",
      group: canonicalOwner.partitionId(partition),
      lifetime: 1,
      round: canonicalRound,
      scopes: [{ partition: owner, round: canonicalRound }],
      deadline: deadlineReached,
      extraPending: extraUnfinished > 0,
      continuations: continuationCount(partition, canonicalRound)
    })
    if (cutoff.rejection !== undefined) return undefined
    if (cutoff.outputs[0]?.kind === "waitForWork") return { status: "waiting" }
    const terminal = cutoff.outputs.at(-1)?.kind
    if (terminal !== "finishReady" && terminal !== "finishLimit") throw new Error("invalid canonical Stop command")
    const source = unfinishedSourceOperations(projection, owner, canonicalRound)
    const cancelled = cutoff.outputs.filter((item) => item.kind === "cancelWork").map((item) => item.operation)
    acknowledgeCutoffReservations(cutoff)
    releaseCutoffPermits(partition)
    return {
      status: "cutoff",
      cancelledSource: cancelled.filter((id) => source.has(id)),
      cancelledJev: cancelled.filter((id) => !source.has(id)),
      limited: terminal === "finishLimit"
    }
  }
  return { isActive, beginStop, ownsStop, finishGate }
}
