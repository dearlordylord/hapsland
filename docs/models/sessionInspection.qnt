// Purpose: executable bounded inspection protocol for #225/#226.
// Status: implementation design model; sampling evidence is recorded separately.
// Authority: design evidence subordinate to the accepted specification in issue #225.
// Expected use: falsify consent, provenance, loss, retention and replay mistakes.
// Lifecycle: update and resample before changing these observation boundaries.
// Assumptions: two endpoints, two lifetimes each; atomic capture boundary; lossy
// asynchronous queue; arbitrary writer stalls; abstract ticks and immutable tokens.
// Exclusions: actual bytes, filesystem quotas/security, HTTP/native process effects,
// remote receipt, model visibility and repair. No fairness or durable audit promise.
module sessionInspectionCore {
  type Source = (int, int) // endpoint, lifetime; never reused
  type Evaluation = Idle | Received | Prepared | Invoked | Clear | Findings | Unavailable
  type Handoff = Waiting | Ready | Authorized | WriteStarted | Written | Failed | Uncertain
  type Fact = ConsentOn | ConsentOff | Ingress | Preparation | Invocation | AnswerClear
    | AnswerFindings | AnswerUnavailable | AdviceReady | WriteAuthorized | OutputStarted
    | OutputWritten | ResidentAcknowledged | OutputFailed | OutputUncertain
  type Local = {
    enabled: bool, epoch: int, sequence: int, alive: bool, started: bool, attempt: int,
    evaluation: Evaluation, handoff: Handoff, acknowledged: bool,
    decisions: int, referenceDecisions: int,
  }
  type Event = {
    source: Source, sequence: int, epoch: int, captured: int,
    fact: Fact, token: int, attempt: int,
  }
  type Payload = Available(int) | Missing(str)
  type Viewer = { cursors: Source -> int, records: Set[Event], gaps: Set[Source], live: bool }
  type State = {
    sources: Source -> Local, queue: Set[Event], journal: Set[Event],
    invocations: Set[(Source, int)], writes: Set[(Source, int)],
    watermarks: Source -> int, removed: Set[Event], dropped: Set[Event],
    viewer: Viewer, tick: int, seen: Set[str],
  }
  pure val SOURCES = Set((1, 1), (1, 2), (2, 1), (2, 2))
  pure val QUEUE_LIMIT = 2
  pure val STORE_LIMIT = 4
  pure val AGE = 3
  pure val initialLocal: Local = {
    enabled: false, epoch: 0, sequence: 0, alive: true, started: true,
    evaluation: Idle, handoff: Waiting, acknowledged: false,
    decisions: 0, referenceDecisions: 0, attempt: 0,
  }
  pure val initialViewer: Viewer = {
    cursors: SOURCES.mapBy(_ => 0), records: Set(), gaps: Set(), live: true,
  }
  pure val initial_state: State = {
    sources: SOURCES.mapBy(src => { ...initialLocal, alive: src._2 == 1, started: src._2 == 1 }), queue: Set(), journal: Set(),
    invocations: Set(), writes: Set(),
    watermarks: SOURCES.mapBy(_ => 0), removed: Set(), dropped: Set(),
    viewer: initialViewer, tick: 0, seen: Set(),
  }
  pure def mark(s: State, name: str): State = { ...s, seen: s.seen.union(Set(name)) }
  pure def canEnable(s: State, src: Source): bool =
    s.sources.get(src).alive and s.sources.get(src).epoch < 4 and not(s.sources.get(src).enabled)
  pure def applyEnable(s: State, src: Source): State = {
    val local = s.sources.get(src)
    mark(capture({ ...s, sources: s.sources.set(src, { ...local, enabled: true, epoch: local.epoch + 1 }) }, src, ConsentOn, false), "enable")
  }
  // Source-bearing captures consult consent now, never when preparation began.
  // A full queue consumes a sequence and loses the observation; review still runs.
  pure def capture(s: State, src: Source, fact: Fact, sourceBearing: bool): State = {
    val local = s.sources.get(src)
    if (sourceBearing and not(local.enabled)) s else {
      val e: Event = { source: src, sequence: local.sequence + 1,
        epoch: local.epoch, captured: s.tick, fact: fact,
        token: if (sourceBearing) local.sequence + 1 else 0, attempt: local.attempt }
      val allocated = { ...s, sources: s.sources.set(src, { ...local, sequence: e.sequence }) }
      if (s.queue.size() < QUEUE_LIMIT)
        { ...allocated, queue: s.queue.union(Set(e)) }
      else mark({ ...allocated, dropped: s.dropped.union(Set(e)) }, "overflow")
    }
  }
  pure def canDisable(s: State, src: Source): bool = s.sources.get(src).enabled
  pure def applyDisable(s: State, src: Source): State = {
    val pending = s.queue.filter(e => e.source == src and e.token > 0)
    val disabled = { ...s,
      sources: s.sources.setBy(src, local => { ...local, enabled: false }),
      queue: s.queue.exclude(pending), dropped: s.dropped.union(pending) }
    mark(capture(disabled, src, ConsentOff, false), "disable")
  }
  pure def canIngress(s: State, src: Source): bool = {
    val local = s.sources.get(src)
    local.alive and local.attempt < 3 and (local.evaluation == Idle or local.evaluation == Clear or
      local.evaluation == Findings or local.evaluation == Unavailable)
  }
  pure def applyIngress(s: State, src: Source): State = {
    val updated = { ...s, sources: s.sources.setBy(src, local => {
      ...local, evaluation: Received, handoff: Waiting, acknowledged: false,
      attempt: local.attempt + 1, decisions: local.decisions + 1,
      referenceDecisions: local.referenceDecisions + 1 }) }
    mark(capture(updated, src, Ingress, true), "ingress")
  }
  pure def canPrepare(s: State, src: Source): bool =
    s.sources.get(src).alive and s.sources.get(src).evaluation == Received
  pure def applyPrepare(s: State, src: Source): State =
    mark(capture({ ...s, sources: s.sources.setBy(src, local => {
      ...local, evaluation: Prepared }) }, src, Preparation, true), "prepare")
  pure def canInvoke(s: State, src: Source): bool =
    s.sources.get(src).alive and s.sources.get(src).evaluation == Prepared
  pure def applyInvoke(s: State, src: Source): State =
    mark(capture({ ...s, invocations: s.invocations.union(Set((src, s.sources.get(src).attempt))),
      sources: s.sources.setBy(src, local => {
      ...local, evaluation: Invoked }) }, src, Invocation, true), "invoke")
  pure def canResult(s: State, src: Source): bool =
    s.sources.get(src).alive and s.sources.get(src).evaluation == Invoked
  pure def applyResult(s: State, src: Source, outcome: Evaluation): State = {
    val fact = if (outcome == Clear) AnswerClear else
      if (outcome == Findings) AnswerFindings else AnswerUnavailable
    mark(capture({ ...s, sources: s.sources.setBy(src, local => {
      ...local, evaluation: outcome }) }, src, fact, true), "result")
  }
  pure def canReady(s: State, src: Source): bool = {
    val local = s.sources.get(src)
    local.alive and local.evaluation == Findings and local.handoff == Waiting
  }
  pure def applyReady(s: State, src: Source): State =
    mark(capture({ ...s, sources: s.sources.setBy(src, local => {
      ...local, handoff: Ready }) }, src, AdviceReady, true), "ready")
  pure def canHandoff(s: State, src: Source, before: Handoff): bool =
    s.sources.get(src).alive and s.sources.get(src).handoff == before
  pure def applyHandoff(s: State, src: Source, after: Handoff, fact: Fact, name: str): State =
    mark(capture({ ...s, writes: if (after == Written)
      s.writes.union(Set((src, s.sources.get(src).attempt))) else s.writes,
      sources: s.sources.setBy(src, local => {
      ...local, handoff: after }) }, src, fact, true), name)
  pure def canAcknowledge(s: State, src: Source): bool =
    canHandoff(s, src, Written) and not(s.sources.get(src).acknowledged)
  pure def applyAcknowledge(s: State, src: Source): State =
    mark(capture({ ...s, sources: s.sources.setBy(src, local => {
      ...local, acknowledged: true }) }, src, ResidentAcknowledged, true), "acknowledge")
  pure def canCommit(s: State, e: Event): bool =
    s.queue.contains(e) and s.journal.size() < STORE_LIMIT and
    not(s.queue.exists(other => other.source == e.source and other.sequence < e.sequence))
  pure def applyCommit(s: State, e: Event): State =
    mark({ ...s, queue: s.queue.exclude(Set(e)), journal: s.journal.union(Set(e)),
      watermarks: s.watermarks.set(e.source, e.sequence) }, "commit")
  pure def canFailWrite(s: State, e: Event): bool = s.queue.contains(e)
  pure def applyFailWrite(s: State, e: Event): State =
    mark({ ...s, queue: s.queue.exclude(Set(e)), dropped: s.dropped.union(Set(e)) }, "failWrite")
  pure def canPrune(s: State, e: Event): bool = s.journal.contains(e) and
    (s.tick - e.captured >= AGE or (s.journal.size() == STORE_LIMIT and
      not(s.journal.exists(other => other.captured < e.captured))))
  pure def applyPrune(s: State, e: Event): State =
    mark({ ...s, journal: s.journal.exclude(Set(e)), removed: s.removed.union(Set(e)) }, "prune")
  // Readers retain an immutable object identity, never a path to current source.
  pure def lookupPayload(s: State, e: Event): Payload =
    if (e.token == 0) Missing("no-payload") else
    if (s.journal.contains(e)) Available(e.token) else
    if (s.removed.contains(e)) Missing("retention") else Missing("not-captured")
  pure def applySnapshot(s: State): State = {
    val gaps = SOURCES.filter(src => s.removed.union(s.dropped).exists(e =>
      e.source == src and e.sequence <= s.watermarks.get(src)))
    mark({ ...s, viewer: { ...s.viewer, records: s.journal,
      cursors: s.watermarks, gaps: gaps } }, "snapshot")
  }
  pure def canReplay(s: State, src: Source): bool = s.viewer.live and
    s.watermarks.get(src) > s.viewer.cursors.get(src)
  pure def applyReplay(s: State, src: Source): State = {
    val cursor = s.viewer.cursors.get(src)
    val watermark = s.watermarks.get(src)
    val records = s.journal.filter(e => e.source == src and e.sequence > cursor)
    val lost = s.removed.union(s.dropped).exists(e =>
      e.source == src and e.sequence > cursor and e.sequence <= watermark)
    mark({ ...s, viewer: { ...s.viewer,
      records: s.viewer.records.union(records), cursors: s.viewer.cursors.set(src, watermark),
      gaps: if (lost) s.viewer.gaps.union(Set(src)) else s.viewer.gaps } }, "replay")
  }
  pure def applyRepeat(s: State, e: Event): State =
    mark({ ...s, viewer: { ...s.viewer, records: s.viewer.records.union(Set(e)) } }, "repeat")
  pure def applyRetire(s: State, src: Source): State = {
    val pending = s.queue.filter(e => e.source == src)
    mark({ ...s, sources: s.sources.setBy(src, local => { ...local, alive: false, enabled: false }),
      queue: s.queue.exclude(pending), dropped: s.dropped.union(pending) }, "retire")
  }
  pure def canRestart(s: State, endpoint: int): bool =
    not(s.sources.get((endpoint, 1)).alive) and not(s.sources.get((endpoint, 2)).started)
  pure def applyRestart(s: State, endpoint: int): State =
    mark({ ...s, sources: s.sources.setBy((endpoint, 2), local => { ...local, alive: true, started: true }) }, "restart")

}
module sessionInspection {
  import sessionInspectionCore.*
  var state: State
  action init = state' = initial_state
  action enable(src: Source): bool = all { canEnable(state, src), state' = applyEnable(state, src) }
  action disable(src: Source): bool = all { canDisable(state, src), state' = applyDisable(state, src) }
  action ingress(src: Source): bool = all { canIngress(state, src), state' = applyIngress(state, src) }
  action prepare(src: Source): bool = all { canPrepare(state, src), state' = applyPrepare(state, src) }
  action invoke(src: Source): bool = all { canInvoke(state, src), state' = applyInvoke(state, src) }
  action result(src: Source, outcome: Evaluation): bool = all {
    Set(Clear, Findings, Unavailable).contains(outcome), canResult(state, src),
    state' = applyResult(state, src, outcome) }
  action ready(src: Source): bool = all { canReady(state, src), state' = applyReady(state, src) }
  action authorize(src: Source): bool = all { canHandoff(state, src, Ready),
    state' = applyHandoff(state, src, Authorized, WriteAuthorized, "authorize") }
  action startWrite(src: Source): bool = all { canHandoff(state, src, Authorized),
    state' = applyHandoff(state, src, WriteStarted, OutputStarted, "startWrite") }
  action written(src: Source): bool = all { canHandoff(state, src, WriteStarted),
    state' = applyHandoff(state, src, Written, OutputWritten, "written") }
  action failOutput(src: Source): bool = all { canHandoff(state, src, Authorized),
    state' = applyHandoff(state, src, Failed, OutputFailed, "failOutput") }
  action uncertain(src: Source): bool = all { canHandoff(state, src, WriteStarted),
    state' = applyHandoff(state, src, Uncertain, OutputUncertain, "uncertain") }
  action acknowledge(src: Source): bool = all { canAcknowledge(state, src), state' = applyAcknowledge(state, src) }
  action commit(e: Event): bool = all { canCommit(state, e), state' = applyCommit(state, e) }
  action failWrite(e: Event): bool = all { canFailWrite(state, e), state' = applyFailWrite(state, e) }
  action prune(e: Event): bool = all { canPrune(state, e), state' = applyPrune(state, e) }
  action snapshot = state' = applySnapshot(state)
  action replay(src: Source): bool = all { canReplay(state, src), state' = applyReplay(state, src) }
  action repeat(e: Event): bool = all { state.viewer.records.contains(e), state' = applyRepeat(state, e) }
  action pause = all { state.viewer.live, state' = mark({ ...state,
    viewer: { ...state.viewer, live: false } }, "pause") }
  action resume = all { not(state.viewer.live), state' = mark({ ...state,
    viewer: { ...state.viewer, live: true } }, "resume") }
  action tick = all { state.tick < 12, state' = mark({ ...state, tick: state.tick + 1 }, "tick") }
  action retire(src: Source): bool = all { state.sources.get(src).alive, state' = applyRetire(state, src) }
  action restart(endpoint: int): bool = all { canRestart(state, endpoint), state' = applyRestart(state, endpoint) }
  action step = {
    nondet src = SOURCES.oneOf()
    nondet retirementDraw = 1.to(20).oneOf()
    nondet outcome = Set(Clear, Findings, Unavailable).oneOf()
    any {
      enable(src), disable(src), ingress(src), prepare(src), invoke(src), result(src, outcome),
      ready(src), authorize(src), startWrite(src), written(src), failOutput(src), uncertain(src), acknowledge(src),
      { nondet e = state.queue.oneOf()
        commit(e) },
      { nondet e = state.queue.oneOf()
        failWrite(e) },
      { nondet e = state.journal.oneOf()
        prune(e) },
      snapshot, replay(src), { nondet e = state.viewer.records.oneOf()
        repeat(e) },
      pause, resume, tick, all { retirementDraw == 1, retire(src) }, restart(src._1),
    }
  }
  // High impact (#226): capture loss cannot alter the production admission lane.
  val nonInterference = SOURCES.forall(src => state.sources.get(src).decisions == state.sources.get(src).referenceDecisions)
  // High impact (#226): no pending source-bearing bytes survive observed disable.
  val consentBoundary = state.queue.forall(e => e.token == 0 or
    (state.sources.get(e.source).enabled and e.epoch == state.sources.get(e.source).epoch))
  val bounds = state.queue.size() <= QUEUE_LIMIT and state.journal.size() <= STORE_LIMIT
  val identities = state.queue.union(state.journal).forall(e =>
    e.sequence <= state.sources.get(e.source).sequence and e.epoch > 0)
  val uniqueRecords = state.viewer.records.forall(e => not(state.viewer.records.exists(other =>
    other.source == e.source and other.sequence == e.sequence and other != e)))
  val snapshotReplay = state.viewer.records.forall(e => e.sequence <= state.viewer.cursors.get(e.source))
  // Evaluation and writer acknowledgement are independent; no model-reading state exists.
  val acknowledgedWritten = SOURCES.forall(src => state.sources.get(src).acknowledged implies
    state.sources.get(src).handoff == Written)
  val dispatchProvenance = state.queue.union(state.journal).union(state.viewer.records).forall(e =>
    e.fact == Invocation implies state.invocations.contains((e.source, e.attempt)))
  val writerProvenance = state.queue.union(state.journal).union(state.viewer.records).forall(e =>
    e.fact == OutputWritten implies state.writes.contains((e.source, e.attempt)))
  val reenabledWitness = SOURCES.exists(src => state.sources.get(src).epoch > 1)
  val safety = dispatchProvenance and writerProvenance and nonInterference and consentBoundary and bounds and identities and uniqueRecords and snapshotReplay and acknowledgedWritten
  val enableWitness = state.seen.contains("enable")
  val disableWitness = state.seen.contains("disable")
  val ingressWitness = state.seen.contains("ingress")
  val prepareWitness = state.seen.contains("prepare")
  val invokeWitness = state.seen.contains("invoke")
  val resultWitness = state.seen.contains("result")
  val readyWitness = state.seen.contains("ready")
  val authorizeWitness = state.seen.contains("authorize")
  val startWriteWitness = state.seen.contains("startWrite")
  val writtenWitness = state.seen.contains("written")
  val failOutputWitness = state.seen.contains("failOutput")
  val uncertainWitness = state.seen.contains("uncertain")
  val acknowledgeWitness = state.seen.contains("acknowledge")
  val commitWitness = state.seen.contains("commit")
  val failWriteWitness = state.seen.contains("failWrite")
  val pruneWitness = state.seen.contains("prune")
  val snapshotWitness = state.seen.contains("snapshot")
  val replayWitness = state.seen.contains("replay")
  val repeatWitness = state.seen.contains("repeat")
  val pauseWitness = state.seen.contains("pause")
  val resumeWitness = state.seen.contains("resume")
  val tickWitness = state.seen.contains("tick")
  val retireWitness = state.seen.contains("retire")
  val restartWitness = state.seen.contains("restart")
  val overflowWitness = state.seen.contains("overflow")
}
