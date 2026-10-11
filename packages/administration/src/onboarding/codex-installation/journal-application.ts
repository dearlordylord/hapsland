import { type Journal } from "./journal.ts"
import { atomicWrite, atomicRemove } from "./file-writes.ts"
import { encodeJson } from "./configuration-values.ts"
import { type Mutation, snapshot, validateMutationCurrent } from "./file-snapshots.ts"

const recordCompletedMutation = (
  journalPath: string,
  journal: Journal,
  completed: ReadonlyArray<number>,
  index: number
) => {
  const next = [...completed, index]
  atomicWrite(journalPath, encodeJson({ ...journal, completed: next }))
  return next
}

const applyJournalMutation = (
  change: Mutation,
  index: number,
  completed: ReadonlyArray<number>,
  journalPath: string,
  journal: Journal,
  failAfter: number
) => {
  const current = snapshot(change.path)
  if (current.digest === change.afterDigest) {
    return recordCompletedMutation(journalPath, journal, completed, index)
  }
  if (current.digest !== change.beforeDigest) {
    throw new Error(`concurrent change detected for ${change.path}; no stale content was restored`)
  }
  if (change.afterContent === null) atomicRemove(change.path)
  else atomicWrite(change.path, change.afterContent)
  const next = recordCompletedMutation(journalPath, journal, completed, index)
  if (failAfter >= 0 && next.length >= failAfter) throw new Error("injected multi-file failure")
  return next
}

export const applyJournal = (journalPath: string, journal: Journal, failAfter: number) => {
  let completed = [...journal.completed]
  for (let index = 0; index < journal.mutations.length; index += 1) {
    const change = journal.mutations[index]
    if (change === undefined) continue
    validateMutationCurrent(change, completed.includes(index))
  }
  atomicWrite(journalPath, encodeJson(journal))
  for (let index = 0; index < journal.mutations.length; index += 1) {
    const change = journal.mutations[index]
    if (change === undefined || completed.includes(index)) continue
    completed = applyJournalMutation(change, index, completed, journalPath, journal, failAfter)
  }
  atomicRemove(journalPath)
}
