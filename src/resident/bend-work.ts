import type { CanonicalProjection } from "../canonical/adapter.ts"

/** Pure work view for one partition/round in an explicit canonical projection. */
export const workView = (
  projection: Pick<CanonicalProjection, "work" | "pendingFindings">,
  partition: number,
  round: number
) => {
  const findWork = (operation: number) =>
    projection.work.find((item) => item.partition === partition && item.round === round && item.operation === operation)
  return {
    admit(observation: number): number {
      if (findWork(observation)?.kind !== "awaitingSourceRead") throw new Error("canonical source admission missing")
      return observation
    },

    spawn(observation: number, operation: number): number | undefined {
      const work = findWork(operation)
      return work?.parent === observation && work.kind === "reviewing" ? operation : undefined
    },

    cachedFinding(observation: number, _count: number, _bytes: number, operation: number): number | undefined {
      const work = findWork(operation)
      return work?.parent === observation && work.kind === "pendingFinding" ? operation : undefined
    },

    startSource(observation: number): boolean {
      return findWork(observation)?.kind === "awaitingSourceRead"
    },
    completeSource(observation: number): boolean {
      return findWork(observation)?.kind === "sourceReading"
    },
    startUnit(operation: number): boolean {
      return findWork(operation)?.kind === "reviewing"
    },
    outcome(operation: number, _outcome: unknown): boolean {
      return findWork(operation)?.kind === "atJev"
    },
    reviseFinding(operation: number, _count: number, _bytes: number): boolean {
      return findWork(operation)?.kind === "pendingFinding"
    },
    retire(operation: number): boolean {
      return findWork(operation)?.kind === "pendingFinding"
    },

    unfinished(): number {
      return projection.work.filter(
        (item) => item.partition === partition && item.round === round && item.kind !== "pendingFinding"
      ).length
    },
    pendingFindings(): number {
      return projection.pendingFindings.reduce(
        (count, entry) => count + (findWork(entry.operation)?.kind === "pendingFinding" ? entry.count : 0),
        0
      )
    },
    pendingFor(operation: number): number {
      return findWork(operation)?.kind === "pendingFinding"
        ? (projection.pendingFindings.find((entry) => entry.operation === operation)?.count ?? 0)
        : 0
    }
  }
}

export type BendWorkView = ReturnType<typeof workView>
