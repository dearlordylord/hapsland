// Native invocation resource custody: registration, finalization and retained cleanup.
type FailureOccurrence = { readonly phase: "register" | "task" | "close" | "remove"; readonly error: unknown }
type TaskOutcome<Value> =
  | { readonly status: "not-started" }
  | { readonly status: "success"; readonly value: Value }
  | { readonly status: "failure"; readonly receipt: FailureOccurrence }
export type NativeSession = { readonly invocation: number; close(): void }

export function createNativeSessionRegistry<Session extends NativeSession = NativeSession>() {
  const sessions = new Map<number, Session>(),
    cleanupObligations = new Map<number, { session: Session | undefined; retry: () => unknown | Promise<unknown> }>()
  const retainCleanup = (session: Session, retry: () => unknown | Promise<unknown>) => {
    const previous = cleanupObligations.get(session.invocation)
    if (previous && previous.session !== session) throw new Error("Cleanup obligation owner replaced")
    cleanupObligations.set(session.invocation, { session, retry })
  }
  // Construction can fail before a session exists. Keep that exact invocation
  // in this same registry, and compose rather than replace an existing obligation.
  const retainConstructionCleanup = (
    invocation: number,
    session: Session | undefined,
    retry: () => unknown | Promise<unknown>
  ) => {
    const previous = cleanupObligations.get(invocation)
    if (previous && previous.session !== session) throw new Error("Cleanup obligation owner replaced")
    const completed = new Set()
    const combined = previous
      ? async () => {
          const failures = []
          for (const [index, cleanup] of [previous.retry, retry].entries()) {
            if (completed.has(index)) continue
            try {
              await cleanup()
              completed.add(index)
            } catch (error) {
              failures.push(error)
            }
          }
          if (failures.length === 1) throw failures[0]
          if (failures.length) throw new AggregateError(failures, "Construction cleanup remains pending")
        }
      : retry
    cleanupObligations.set(invocation, { session, retry: combined })
  }
  const retryCleanup = async () => {
    const failures = []
    for (const [id, obligation] of [...cleanupObligations]) {
      try {
        await obligation.retry()
        if (cleanupObligations.get(id) === obligation) cleanupObligations.delete(id)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length) throw new AggregateError(failures, "Resident cleanup obligations remain pending")
  }
  const register = (session: Session) => {
    if (sessions.has(session.invocation)) throw new Error("duplicate active invocation")
    sessions.set(session.invocation, session)
  }
  const remove = (session: Session) => {
    if (sessions.get(session.invocation) !== session) throw new Error("wrong registry owner")
    sessions.delete(session.invocation)
  }
  // Preserve distinct failure events even when their original thrown values are
  // identical. A whole owning workflow can compose task and finalizer causes;
  // ordinary run retains JavaScript finally's last-failure behavior.
  const runOutcome = async <Value>(session: Session, task: () => Value | Promise<Value>) => {
    const failures: FailureOccurrence[] = []
    let registered = false,
      taskOutcome: TaskOutcome<Value> = { status: "not-started" },
      rejection: FailureOccurrence | undefined
    const record = (phase: FailureOccurrence["phase"], error: unknown) => {
      const receipt = { phase, error }
      failures.push(receipt)
      rejection = receipt
      return receipt
    }
    try {
      register(session)
      registered = true
    } catch (error) {
      record("register", error)
    }
    if (registered) {
      try {
        taskOutcome = { status: "success", value: await task() }
      } catch (error) {
        taskOutcome = { status: "failure", receipt: record("task", error) }
      }
      try {
        session.close()
      } catch (error) {
        record("close", error)
      }
      try {
        remove(session)
      } catch (error) {
        record("remove", error)
      }
    }
    return { task: taskOutcome, failures, rejection }
  }
  return Object.freeze({
    retainCleanup,
    retainConstructionCleanup,
    retryCleanup,
    hasCleanup: (session: Session) => cleanupObligations.get(session.invocation)?.session === session,
    get pendingCleanup() {
      return cleanupObligations.size
    },
    get: (id: number) => sessions.get(id),
    get size() {
      return sessions.size
    },
    register,
    remove,
    runOutcome,
    async run<Value>(session: Session, task: () => Value | Promise<Value>) {
      const outcome = await runOutcome(session, task)
      if (outcome.rejection) throw outcome.rejection.error
      if (outcome.task.status !== "success") throw new Error("Unsettled service registry task")
      return outcome.task.value
    }
  })
}
