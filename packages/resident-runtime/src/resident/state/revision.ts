import { canonicalValue, type PreparedReviewUnit } from "@hapsland/review-definition/direct-event/model"
import type { CapacityLedger } from "./capacity/operations.ts"

/** Identifies a source subject's registered revision; generation and token checks reject stale callbacks. */
export type WorkRevision = {
  readonly subject: string
  readonly revisionToken: string
  readonly revisionGeneration: number
}
type CurrentWork = {
  readonly revisionToken: string
  readonly revisionGeneration: number
  readonly inputIdentity: number
}
export type RevisionState = {
  readonly identities: ReadonlyMap<string, number>
  readonly current: ReadonlyMap<string, CurrentWork>
  readonly nextIdentity: number
}
type RevisionDraft = { identities: Map<string, number>; current: Map<string, CurrentWork>; nextIdentity: number }
export const initialRevision = (): RevisionState => ({ identities: new Map(), current: new Map(), nextIdentity: 1 })
export const draftRevision = (state: RevisionState): RevisionDraft => ({
  ...state,
  identities: new Map(state.identities),
  current: new Map(state.current)
})
export const workSubject = (partition: string, prepared: PreparedReviewUnit): string =>
  canonicalValue({ partition, path: prepared.input.path, declaration: prepared.input.declaration.name })

/** Bend revision decisions and native identity changes within one state draft. */
export const revisionOperations = (state: RevisionDraft, owner: CapacityLedger) => {
  const identity = (key: string, retain = false): number => {
    let id = state.identities.get(key)
    if (id === undefined) {
      id = state.nextIdentity++
      if (!Number.isSafeInteger(id)) throw new Error("resident revision identity exhausted")
      if (retain) state.identities.set(key, id)
    }
    return id
  }
  const subjectId = (subject: string, retain = false) => identity(`subject:${subject}`, retain)
  const inputId = (prepared: PreparedReviewUnit, retain = false) =>
    identity(`input:${canonicalValue(prepared.input)}`, retain)
  const prune = () => {
    const active = new Set(
      owner.canonicalProjection().revision.entries.flatMap(({ subject, input }) => [subject, input])
    )
    for (const [key, id] of state.identities) if (!active.has(id)) state.identities.delete(key)
  }
  const count = (): number => {
    const command = owner.transition({ kind: "revisionCountCheck" }).outputs[0]
    if (command?.kind !== "revisionCount") throw new Error("canonical revision count refused")
    return command.count
  }
  const generation = (subject: string): number => {
    const command = owner.transition({ kind: "revisionGenerationCheck", subject: subjectId(subject) }).outputs[0]
    if (command?.kind !== "revisionGeneration") throw new Error("canonical revision generation refused")
    return command.generation
  }
  const register = (
    partition: string,
    prepared: PreparedReviewUnit,
    addMember: boolean,
    revisionToken: string
  ): { readonly revision: WorkRevision; readonly replaced: boolean } => {
    const subject = workSubject(partition, prepared)
    const inputIdentity = inputId(prepared, true)
    const command = owner.transition({
      kind: "revisionRegister",
      subject: subjectId(subject, true),
      input: inputIdentity,
      addMember
    }).outputs[0]
    prune()
    if (command?.kind === "revisionReused") {
      const retained = state.current.get(subject)
      if (retained === undefined || retained.revisionGeneration !== command.generation) {
        throw new Error("canonical revision reuse lost its native payload")
      }
      return {
        revision: Object.freeze({
          subject,
          revisionToken: retained.revisionToken,
          revisionGeneration: command.generation
        }),
        replaced: false
      }
    }
    if (command?.kind !== "revisionReplaced") throw new Error("canonical revision registration refused")
    state.current.set(subject, Object.freeze({ revisionToken, revisionGeneration: command.generation, inputIdentity }))
    return {
      revision: Object.freeze({ subject, revisionToken, revisionGeneration: command.generation }),
      replaced: true
    }
  }
  const superseded = (subject: string, revision: WorkRevision): boolean => {
    const command = owner.transition({
      kind: "revisionSupersededCheck",
      subject: subjectId(subject),
      candidateSubject: subjectId(revision.subject),
      generation: revision.revisionGeneration
    }).outputs[0]
    if (command?.kind !== "revisionSuperseded" && command?.kind !== "revisionNotSuperseded") {
      throw new Error("canonical supersession check refused")
    }
    return command.kind === "revisionSuperseded"
  }
  const current = (revision: WorkRevision, prepared: PreparedReviewUnit): boolean => {
    const command = owner.transition({
      kind: "revisionCurrentCheck",
      subject: subjectId(revision.subject),
      input: inputId(prepared),
      generation: revision.revisionGeneration
    }).outputs[0]
    if (command?.kind !== "revisionCurrent" && command?.kind !== "revisionStale") {
      throw new Error("canonical current revision check refused")
    }
    return (
      command.kind === "revisionCurrent" &&
      state.current.get(revision.subject)?.revisionToken === revision.revisionToken
    )
  }
  const release = (revision: WorkRevision): void => {
    const retained = state.current.get(revision.subject)
    if (retained?.revisionToken !== revision.revisionToken) return
    const command = owner.transition({
      kind: "revisionRelease",
      subject: subjectId(revision.subject),
      generation: revision.revisionGeneration
    }).outputs[0]
    if (command?.kind !== "revisionReleased") throw new Error("canonical revision release refused")
    if (generation(revision.subject) === 0) state.current.delete(revision.subject)
    prune()
  }
  const assert = (): void => {
    const canonical = owner.canonicalProjection().revision.entries
    if (
      canonical.length !== state.current.size ||
      [...state.current].some(
        ([subject, work]) =>
          !canonical.some(
            (entry) =>
              entry.subject === state.identities.get(`subject:${subject}`) &&
              entry.input === work.inputIdentity &&
              entry.generation === work.revisionGeneration
          )
      )
    ) {
      throw new Error("native revision handles differ from canonical state")
    }
  }
  return { count, readRevisionGeneration: generation, register, superseded, current, release, assert }
}
export type RevisionOperations = ReturnType<typeof revisionOperations>
