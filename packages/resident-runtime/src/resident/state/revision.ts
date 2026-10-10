import { canonicalValue, type PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import type { CapacityLedger } from "./capacity.ts"

export type WorkRevision = { readonly subject: string; readonly token: string; readonly generation: number }
type CurrentWork = { readonly token: string; readonly generation: number; readonly inputIdentity: number }
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
export const workSubject = (partition: string, prepared: PreparedUnit): string =>
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
  const inputId = (prepared: PreparedUnit, retain = false) =>
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
    prepared: PreparedUnit,
    addMember: boolean,
    token: string
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
      if (retained === undefined || retained.generation !== command.generation) {
        throw new Error("canonical revision reuse lost its native payload")
      }
      return {
        revision: Object.freeze({ subject, token: retained.token, generation: command.generation }),
        replaced: false
      }
    }
    if (command?.kind !== "revisionReplaced") throw new Error("canonical revision registration refused")
    state.current.set(subject, Object.freeze({ token, generation: command.generation, inputIdentity }))
    return { revision: Object.freeze({ subject, token, generation: command.generation }), replaced: true }
  }
  const superseded = (subject: string, revision: WorkRevision): boolean => {
    const command = owner.transition({
      kind: "revisionSupersededCheck",
      subject: subjectId(subject),
      candidateSubject: subjectId(revision.subject),
      generation: revision.generation
    }).outputs[0]
    if (command?.kind !== "revisionSuperseded" && command?.kind !== "revisionNotSuperseded") {
      throw new Error("canonical supersession check refused")
    }
    return command.kind === "revisionSuperseded"
  }
  const current = (revision: WorkRevision, prepared: PreparedUnit): boolean => {
    const command = owner.transition({
      kind: "revisionCurrentCheck",
      subject: subjectId(revision.subject),
      input: inputId(prepared),
      generation: revision.generation
    }).outputs[0]
    if (command?.kind !== "revisionCurrent" && command?.kind !== "revisionStale") {
      throw new Error("canonical current revision check refused")
    }
    return command.kind === "revisionCurrent" && state.current.get(revision.subject)?.token === revision.token
  }
  const release = (revision: WorkRevision): void => {
    const retained = state.current.get(revision.subject)
    if (retained?.token !== revision.token) return
    const command = owner.transition({
      kind: "revisionRelease",
      subject: subjectId(revision.subject),
      generation: revision.generation
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
              entry.generation === work.generation
          )
      )
    ) {
      throw new Error("native revision handles differ from canonical state")
    }
  }
  return { count, generation, register, superseded, current, release, assert }
}
export type RevisionOperations = ReturnType<typeof revisionOperations>
