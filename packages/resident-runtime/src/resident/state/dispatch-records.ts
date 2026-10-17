import type { CapacityLedger } from "./capacity/operations.ts"

// Native dispatch custody is shared by the executor and atomic admission publication.
export type NativeEntry<K, A> = {
  readonly key: K
  readonly value: A
  readonly operation: number
  readonly partition: number
  readonly round: number
}

export type DispatchRegistry<K, A> = {
  readonly entries: ReadonlyMap<number, NativeEntry<K, A>>
  readonly starts: readonly { readonly entry: NativeEntry<K, A>; readonly sequence: number }[]
  readonly terminalRunning: ReadonlySet<number>
  readonly terminal: boolean
  readonly executorAttached: boolean
}

export const initialDispatchRegistry = <K, A>(): DispatchRegistry<K, A> => ({
  entries: new Map(),
  starts: [],
  terminalRunning: new Set(),
  terminal: false,
  executorAttached: false
})

const terminalHandlesMatch = <K, A>(next: DispatchRegistry<K, A>): boolean =>
  next.entries.size === next.terminalRunning.size &&
  [...next.entries.keys()].every((id) => next.terminalRunning.has(id))
const handleCountMatches = <K, A>(next: DispatchRegistry<K, A>, live: readonly number[]): boolean =>
  next.terminal ? terminalHandlesMatch(next) : live.length === next.entries.size
const assertHandles = <K, A>(next: DispatchRegistry<K, A>, live: readonly number[]): void => {
  if (live.some((id) => !next.entries.has(id)) || !handleCountMatches(next, live))
    throw new Error("canonical dispatch and native job handles diverged")
}
type DispatchDraft<K, A> = {
  entries: Map<number, NativeEntry<K, A>>
  terminalRunning: Set<number>
  terminal: boolean
  starts: Array<{ readonly entry: NativeEntry<K, A>; readonly sequence: number }>
  discarded: A[]
}
const admitHandle = <K, A>(draft: DispatchDraft<K, A>, admitted: NativeEntry<K, A> | undefined): void => {
  if (admitted === undefined) return
  if (draft.entries.has(admitted.operation) || draft.terminal)
    throw new Error("canonical dispatch admission violated native handle fence")
  draft.entries.set(admitted.operation, admitted)
}
const settleHandle = <K, A>(draft: DispatchDraft<K, A>, settled: number | undefined): void => {
  if (settled === undefined) return
  draft.entries.delete(settled)
  draft.terminalRunning.delete(settled)
  draft.starts = draft.starts.filter(({ entry }) => entry.operation !== settled)
}
const closeHandleRegistry = <K, A>(
  draft: DispatchDraft<K, A>,
  event: Parameters<CapacityLedger["transition"]>[0],
  owner: CapacityLedger
): void => {
  if (event.kind !== "closeDispatch") return
  draft.terminal = true
  for (const entry of owner.canonicalProjection().dispatch.running) draft.terminalRunning.add(entry.operation)
}
const startedEntry = <K, A>(draft: DispatchDraft<K, A>, operation: number): NativeEntry<K, A> => {
  const entry = draft.entries.get(operation)
  if (entry === undefined) throw new Error("canonical dispatch started unknown job")
  return entry
}
const discardedEntry = <K, A>(draft: DispatchDraft<K, A>, operation: number): NativeEntry<K, A> => {
  const entry = draft.entries.get(operation)
  if (entry === undefined) throw new Error("canonical dispatch discarded unknown job")
  return entry
}
const reactToDispatchOutput = <K, A>(
  draft: DispatchDraft<K, A>,
  command: ReturnType<CapacityLedger["transition"]>["outputs"][number]
): void => {
  switch (command.kind) {
    case "dispatchStarted":
      draft.starts.push({ entry: startedEntry(draft, command.operation), sequence: command.sequence })
      return
    case "dispatchDiscarded":
      draft.discarded.push(discardedEntry(draft, command.operation).value)
      if (!command.running) draft.entries.delete(command.operation)
      return
    default:
      throw new Error("unexpected canonical dispatch output")
  }
}

export function commitDispatchRecords<K, A>(
  current: DispatchRegistry<K, A>,
  owner: CapacityLedger,
  event: Parameters<CapacityLedger["transition"]>[0],
  admitted?: NativeEntry<K, A>,
  settled?: number
): readonly [readonly A[] | undefined, DispatchRegistry<K, A>] {
  let next = current
  let discarded: A[] = []
  const result = owner.transition(event, (result) => {
    const draft: DispatchDraft<K, A> = {
      entries: new Map(current.entries),
      terminalRunning: new Set(current.terminalRunning),
      terminal: current.terminal,
      starts: [...current.starts],
      discarded: []
    }
    admitHandle(draft, admitted)
    settleHandle(draft, settled)
    closeHandleRegistry(draft, event, owner)
    for (const command of result.outputs) reactToDispatchOutput(draft, command)
    discarded = draft.discarded
    next = {
      ...current,
      entries: draft.entries,
      starts: draft.starts,
      terminalRunning: draft.terminalRunning,
      terminal: draft.terminal
    }
    const dispatch = result.projection.dispatch
    assertHandles(
      next,
      [...dispatch.queued, ...dispatch.running].map((entry) => entry.operation)
    )
  })
  if (result.rejection !== undefined) return [undefined, current]
  return [discarded, next]
}
