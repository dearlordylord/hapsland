// Purpose: deterministic protocol scenarios for inspection consent and evidence.
// Status: executable design evidence for #226, not production boundary validation.
// Authority: subordinate to accepted issue #225.
// Expected use: regress loss/consent/replay semantics alongside sampled walks.
// Lifecycle: revise with model boundary changes; retain with the executable model.
module sessionInspection_test {
  import sessionInspection.* from "./sessionInspection"
  import sessionInspectionCore.* from "./sessionInspection"
  pure val src = (1, 1)
  // An edit admitted while disabled is never reconstructed when consent arrives.
  run noRetrospectiveTest = init.then(ingress(src)).then(prepare(src))
    .expect(state.queue.size() == 0).then(enable(src))
    .expect(state.queue.forall(e => e.fact == ConsentOn))
  run disableInFlightTest = init.then(enable(src)).then(ingress(src))
    .then(prepare(src)).then(invoke(src)).then(disable(src))
    .then(result(src, Findings)).then(ready(src))
    .expect(state.queue.forall(e => e.token == 0) and state.sources.get(src).evaluation == Findings)
    .then(enable(src)).expect(state.queue.forall(e => e.token == 0))
  // Never committing models a writer whose operation cannot settle.
  run stalledWriterTest = init.then(enable(src)).then(ingress(src))
    .then(prepare(src)).then(invoke(src)).then(result(src, Findings)).then(ready(src))
    .then(authorize(src)).then(startWrite(src)).then(written(src)).then(acknowledge(src))
    .expect(state.queue.size() == QUEUE_LIMIT and state.dropped.size() > 0 and
      state.sources.get(src).acknowledged and nonInterference)
  run preparedIsUnsentTest = init.then(enable(src)).then(ingress(src)).then(prepare(src))
    .expect(state.invocations.size() == 0)
  run uncertainOutputTest = init.then(ingress(src)).then(prepare(src)).then(invoke(src))
    .then(result(src, Findings)).then(ready(src)).then(authorize(src))
    .then(startWrite(src)).then(uncertain(src))
    .expect(state.writes.size() == 0 and not(state.sources.get(src).acknowledged))
  run lifetimeIsolationTest = init.then(enable(src)).then(ingress(src)).then(retire(src))
    .then(restart(1)).expect(state.sources.get((1, 2)).evaluation == Idle and
      not(state.sources.get((1, 2)).enabled) and state.sources.get(src).evaluation == Received)
    .then(retire((1, 2))).then(restart(1).fail())
  run duplicateReplayTest = init.then(enable(src))
    .then({ nondet e = state.queue.oneOf() commit(e) }).then(snapshot)
    .then({ nondet e = state.viewer.records.oneOf() repeat(e) })
    .expect(state.viewer.records.size() == 1 and uniqueRecords)
  run exactAgeBoundaryTest = init.then(enable(src))
    .then({ nondet e = state.queue.oneOf() commit(e) })
    .then(2.reps(_ => tick))
    .expect(state.journal.forall(e => not(canPrune(state, e))))
    .then(tick).expect(state.journal.forall(e => canPrune(state, e)))
    .then({ nondet e = state.journal.oneOf() prune(e) }).then(snapshot)
    .expect(state.viewer.records.size() == 0 and state.viewer.gaps.contains(src))
  run lostAcknowledgementTest = init.then(ingress(src)).then(prepare(src)).then(invoke(src))
    .then(result(src, Findings)).then(ready(src)).then(authorize(src))
    .then(startWrite(src)).then(enable(src)).then(written(src))
    .expect(state.queue.exists(e => e.fact == OutputWritten) and not(state.sources.get(src).acknowledged))
    .then({ nondet e = state.queue.filter(e => e.fact == ConsentOn).oneOf() commit(e) })
    .then({ nondet e = state.queue.filter(e => e.fact == OutputWritten).oneOf() commit(e) })
    .then(retire(src)).then(snapshot)
    .expect(state.viewer.records.exists(e => e.fact == OutputWritten) and
      not(state.sources.get(src).acknowledged))
  run pauseReplayTest = init.then(enable(src))
    .then({ nondet e = state.queue.oneOf() commit(e) }).then(snapshot).then(pause)
    .then(ingress(src)).then({ nondet e = state.queue.oneOf() commit(e) })
    .expect(state.viewer.records.size() == 1)
    .then(resume).then(replay(src)).expect(state.viewer.records.size() == 2)
    .then({ nondet e = state.viewer.records.oneOf() repeat(e) })
    .expect(state.viewer.records.size() == 2)
  run gapAfterSnapshotTest = init.then(enable(src))
    .then({ nondet e = state.queue.oneOf() commit(e) }).then(snapshot)
    .then(ingress(src)).then({ nondet e = state.queue.oneOf() failWrite(e) })
    .then(prepare(src)).then({ nondet e = state.queue.oneOf() commit(e) })
    .then(replay(src)).expect(state.viewer.gaps.contains(src) and
      state.viewer.records.size() == 2 and
      not(state.viewer.records.exists(e => e.fact == Ingress)))
  run sharedCapacityTest = init.then(enable((1, 1))).then(enable((2, 1)))
    .then(2.reps(_ => { nondet e = state.queue.oneOf() commit(e) }))
    .then(ingress((1, 1))).then(ingress((2, 1)))
    .then(2.reps(_ => { nondet e = state.queue.oneOf() commit(e) }))
    .then(prepare(src)).expect(state.journal.size() == STORE_LIMIT and state.queue.size() == 1)
    .expect(state.queue.forall(e => not(canCommit(state, e))))
    .then({ nondet e = state.journal.oneOf() prune(e) })
    .then({ nondet e = state.queue.oneOf() commit(e) }).expect(bounds and nonInterference)
  run payloadEvictionRaceTest = init.then(enable(src))
    .then({ nondet e = state.queue.oneOf() commit(e) })
    .then(ingress(src)).then({ nondet e = state.queue.oneOf() commit(e) }).then(snapshot)
    .expect(state.viewer.records.filter(e => e.fact == Ingress).forall(e =>
      lookupPayload(state, e) == Available(e.token)))
    .then(3.reps(_ => tick))
    .then({ nondet e = state.journal.filter(e => e.fact == Ingress).oneOf() prune(e) })
    .expect(state.viewer.records.filter(e => e.fact == Ingress).forall(e =>
      lookupPayload(state, e) == Missing("retention")))
}
