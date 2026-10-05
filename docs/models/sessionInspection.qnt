// Purpose: executable bounded inspection protocol for #225/#226.
// Status: implementation design model; sampling evidence is recorded separately.
// Authority: design evidence subordinate to the accepted specification in issue #225.
// Expected use: falsify consent, provenance, loss, retention and replay mistakes.
// Lifecycle: update and resample before changing these observation boundaries.
// Assumptions: two endpoints, two lifetimes each; atomic capture boundary; lossy
// asynchronous queue; arbitrary writer stalls; abstract ticks and immutable tokens.
// One unit per edit and one output attempt per unit; identities remain independent
// across edits. Production fan-out and many-to-many batches need boundary tests.
// Exclusions: actual bytes, filesystem quotas/security, HTTP/native process effects,
// remote receipt, model visibility and repair. No fairness or durable audit promise.
module sessionInspectionCore {
  type Source = (int, int) // endpoint, lifetime; never reused
  type Request = (Source, int) // edit/review unit; one unit per edit in this abstraction
  type Evaluation = Idle | Received | Prepared | Invoked | Clear | Findings | Unavailable
  type Handoff = Waiting | Ready | Authorized | WriteStarted | Written | Failed | Uncertain
  type Route = Fresh | Joined(Request) | Cached(Request)
  type Identity = SourceControl | WorkRequest(Request)
  type RouteEvidence = NoRoute | ObservedRoute(Route)
  type Fact = ConsentOn | ConsentOff | Ingress | Preparation | Invocation | AnswerClear
    | AnswerFindings | AnswerUnavailable | AdviceReady | WriteAuthorized | OutputStarted
    | OutputWritten | ResidentAcknowledged | OutputFailed | OutputUncertain | ReuseObserved
  type Local = { enabled: bool, epoch: int, sequence: int, alive: bool, started: bool, edits: int }
  type Review = { evaluation: Evaluation, handoff: Handoff, acknowledged: bool, route: Route }
  // This reference transition reads no inspection state. Actual transitions below
  // independently update review state, then are compared with this no-inspection lane.
  type ProductionOperation = ReceiveUnit | PrepareUnit | DispatchUnit | CompleteUnit(Evaluation)
    | ReuseUnit(Route) | SetHandoff(Handoff) | AcknowledgeOutput
  type Event = {
    source: Source, sequence: int, epoch: int, captured: int,
    fact: Fact, token: int, identity: Identity, route: RouteEvidence,
  }
  type Payload = Available(int) | Missing(str)
  type Viewer = { cursors: Source -> int, records: Set[Event], gaps: Set[Source], live: bool }
  type State = {
    sources: Source -> Local, production: Request -> Review, reference: Request -> Review,
    queue: Set[Event], journal: Set[Event], invocations: Set[Request], writes: Set[Request],
    watermarks: Source -> int, removed: Set[Event], dropped: Set[Event],
    viewer: Viewer, tick: int, seen: Set[str],
  }
  pure val ENDPOINTS = 2
  pure val LIFETIMES = 2
  pure val EDIT_LIMIT = 3
  pure val EPOCH_LIMIT = 4
  pure val CLOCK_LIMIT = 12
  pure val QUEUE_LIMIT = 2
  pure val STORE_LIMIT = 4
  pure val AGE = 3
  pure val SOURCES = 1.to(ENDPOINTS).fold(Set(), (acc, endpoint) =>
    acc.union(1.to(LIFETIMES).map(lifetime => (endpoint, lifetime))))
  pure val REQUESTS: Set[Request] = SOURCES.fold(Set(), (acc, src) =>
    acc.union(1.to(EDIT_LIMIT).map(edit => (src, edit))))
  pure val initialLocal: Local = { enabled: false, epoch: 0, sequence: 0, alive: false, started: false, edits: 0 }
  pure val initialReview: Review = { evaluation: Idle, handoff: Waiting, acknowledged: false, route: Fresh }
  pure val initialViewer: Viewer = { cursors: SOURCES.mapBy(_ => 0), records: Set(), gaps: Set(), live: true }
  pure val initial_state: State = {
    sources: SOURCES.mapBy(src => { ...initialLocal, alive: src._2 == 1, started: src._2 == 1 }),
    production: REQUESTS.mapBy(_ => initialReview), reference: REQUESTS.mapBy(_ => initialReview),
    queue: Set(), journal: Set(), invocations: Set(), writes: Set(),
    watermarks: SOURCES.mapBy(_ => 0), removed: Set(), dropped: Set(),
    viewer: initialViewer, tick: 0, seen: Set(),
  }
  pure def mark(s: State, name: str): State = { ...s, seen: s.seen.union(Set(name)) }
  pure def referenceStep(r: Review, op: ProductionOperation): Review = match op {
    | ReceiveUnit => { ...r, evaluation: Received }
    | PrepareUnit => { ...r, evaluation: Prepared }
    | DispatchUnit => { ...r, evaluation: Invoked }
    | CompleteUnit(outcome) => { ...r, evaluation: outcome }
    | ReuseUnit(route) => { ...r, evaluation: Invoked, route: route }
    | SetHandoff(after) => { ...r, handoff: after }
    | AcknowledgeOutput => { ...r, acknowledged: true }
  }
  pure def updateReview(s: State, req: Request, actual: Review, op: ProductionOperation): State =
    { ...s, production: s.production.set(req, actual),
      reference: s.reference.setBy(req, r => referenceStep(r, op)) }
  // Capture is lossy and consults consent at this boundary, never at preparation.
  pure def capture(s: State, src: Source, fact: Fact, identity: Identity, route: RouteEvidence): State = {
    val local = s.sources.get(src)
    val sourceBearing = identity != SourceControl
    if (sourceBearing and not(local.enabled)) s else {
      val e: Event = { source: src, sequence: local.sequence + 1,
        epoch: local.epoch, captured: s.tick, fact: fact,
        token: if (sourceBearing) local.sequence + 1 else 0, identity: identity, route: route }
      val allocated = { ...s, sources: s.sources.set(src, { ...local, sequence: e.sequence }) }
      if (s.queue.size() < QUEUE_LIMIT) { ...allocated, queue: s.queue.union(Set(e)) }
      else mark({ ...allocated, dropped: s.dropped.union(Set(e)) }, "overflow")
    }
  }
  pure def captureWork(s: State, req: Request, fact: Fact): State =
    capture(s, req._1, fact, WorkRequest(req), ObservedRoute(s.production.get(req).route))
  pure def canEnable(s: State, src: Source): bool =
    s.sources.get(src).alive and s.sources.get(src).epoch < EPOCH_LIMIT and not(s.sources.get(src).enabled)
  pure def applyEnable(s: State, src: Source): State = {
    val local = s.sources.get(src)
    mark(capture({ ...s, sources: s.sources.set(src, { ...local, enabled: true, epoch: local.epoch + 1 }) },
      src, ConsentOn, SourceControl, NoRoute), "enable")
  }
  pure def canDisable(s: State, src: Source): bool = s.sources.get(src).enabled
  pure def applyDisable(s: State, src: Source): State = {
    val pending = s.queue.filter(e => e.source == src and e.token > 0)
    val disabled = { ...s, sources: s.sources.setBy(src, local => { ...local, enabled: false }),
      queue: s.queue.exclude(pending), dropped: s.dropped.union(pending) }
    mark(capture(disabled, src, ConsentOff, SourceControl, NoRoute), "disable")
  }
  pure def canIngress(s: State, src: Source): bool = s.sources.get(src).alive and s.sources.get(src).edits < EDIT_LIMIT
  pure def applyIngress(s: State, src: Source): State = {
    val ordinal = s.sources.get(src).edits + 1
    val req = (src, ordinal)
    val updated = updateReview({ ...s, sources: s.sources.setBy(src, local => { ...local, edits: ordinal }) },
      req, { ...s.production.get(req), evaluation: Received }, ReceiveUnit)
    mark(captureWork(updated, req, Ingress), "ingress")
  }
  pure def canPrepare(s: State, req: Request): bool = s.sources.get(req._1).alive and s.production.get(req).evaluation == Received
  pure def applyPrepare(s: State, req: Request): State =
    mark(captureWork(updateReview(s, req, { ...s.production.get(req), evaluation: Prepared }, PrepareUnit), req, Preparation), "prepare")
  pure def canInvoke(s: State, req: Request): bool = s.sources.get(req._1).alive and s.production.get(req).evaluation == Prepared
  pure def applyInvoke(s: State, req: Request): State =
    mark(captureWork(updateReview({ ...s, invocations: s.invocations.union(Set(req)) }, req,
      { ...s.production.get(req), evaluation: Invoked }, DispatchUnit), req, Invocation), "invoke")
  pure def canResult(s: State, req: Request): bool =
    s.sources.get(req._1).alive and s.production.get(req).evaluation == Invoked and s.production.get(req).route == Fresh
  pure def applyResult(s: State, req: Request, outcome: Evaluation): State = {
    val fact = if (outcome == Clear) AnswerClear else if (outcome == Findings) AnswerFindings else AnswerUnavailable
    mark(captureWork(updateReview(s, req, { ...s.production.get(req), evaluation: outcome }, CompleteUnit(outcome)), req, fact), "result")
  }
  pure def canReuse(s: State, req: Request, original: Request): bool =
    canPrepare(s, req) and req != original and req._1 == original._1 and s.production.get(original).route == Fresh
  pure def applyReuse(s: State, req: Request, route: Route, name: str): State =
    mark(captureWork(updateReview(s, req, { ...s.production.get(req), evaluation: Invoked, route: route }, ReuseUnit(route)),
      req, ReuseObserved), name)
  pure def originalOf(route: Route): Set[Request] = match route {
    | Fresh => Set()
    | Joined(original) => Set(original)
    | Cached(original) => Set(original)
  }
  pure def canSettleReuse(s: State, req: Request, original: Request): bool =
    s.sources.get(req._1).alive and s.production.get(req).evaluation == Invoked and
      originalOf(s.production.get(req).route).contains(original) and
      Set(Clear, Findings, Unavailable).contains(s.production.get(original).evaluation)
  pure def applySettleReuse(s: State, req: Request, original: Request): State = {
    val outcome = s.production.get(original).evaluation
    mark(captureWork(updateReview(s, req, { ...s.production.get(req), evaluation: outcome }, CompleteUnit(outcome)),
      req, ReuseObserved), "settleReuse")
  }
  pure def canReady(s: State, req: Request): bool = s.sources.get(req._1).alive and
    s.production.get(req).evaluation == Findings and s.production.get(req).handoff == Waiting
  pure def applyReady(s: State, req: Request): State =
    mark(captureWork(updateReview(s, req, { ...s.production.get(req), handoff: Ready }, SetHandoff(Ready)), req, AdviceReady), "ready")
  pure def canHandoff(s: State, req: Request, before: Handoff): bool =
    s.sources.get(req._1).alive and s.production.get(req).handoff == before
  pure def applyHandoff(s: State, req: Request, after: Handoff, fact: Fact, name: str): State = {
    val updated = updateReview({ ...s, writes: if (after == Written) s.writes.union(Set(req)) else s.writes },
      req, { ...s.production.get(req), handoff: after }, SetHandoff(after))
    mark(captureWork(updated, req, fact), name)
  }
  pure def canAcknowledge(s: State, req: Request): bool =
    canHandoff(s, req, Written) and not(s.production.get(req).acknowledged)
  pure def applyAcknowledge(s: State, req: Request): State =
    mark(captureWork(updateReview(s, req, { ...s.production.get(req), acknowledged: true }, AcknowledgeOutput),
      req, ResidentAcknowledged), "acknowledge")
  pure def canCommit(s: State, e: Event): bool =
    s.queue.contains(e) and s.journal.size() < STORE_LIMIT and
    not(s.queue.exists(other => other.source == e.source and other.sequence < e.sequence))
  pure def applyCommit(s: State, e: Event): State =
    mark({ ...s, queue: s.queue.exclude(Set(e)), journal: s.journal.union(Set(e)),
      watermarks: s.watermarks.set(e.source, e.sequence) }, "commit")
  pure def canFailWrite(s: State, e: Event): bool = s.queue.contains(e)
  pure def applyFailWrite(s: State, e: Event): State =
    mark({ ...s, queue: s.queue.exclude(Set(e)), dropped: s.dropped.union(Set(e)) }, "failWrite")
  pure def canPrune(s: State, e: Event): bool = {
    val expired = s.journal.filter(other => s.tick - other.captured >= AGE)
    val candidates = if (expired.size() > 0) expired else s.journal
    s.journal.contains(e) and candidates.contains(e) and
      (expired.size() > 0 or s.journal.size() == STORE_LIMIT) and
      not(candidates.exists(other => other.captured < e.captured))
  }
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
  action retire(src: Source): bool = all { state.sources.get(src).alive, state' = applyRetire(state, src) }
  action prepare(req: Request): bool = all { canPrepare(state, req), state' = applyPrepare(state, req) }
  action invoke(req: Request): bool = all { canInvoke(state, req), state' = applyInvoke(state, req) }
  action ready(req: Request): bool = all { canReady(state, req), state' = applyReady(state, req) }
  action acknowledge(req: Request): bool = all { canAcknowledge(state, req), state' = applyAcknowledge(state, req) }
  action result(req: Request, outcome: Evaluation): bool = all {
    Set(Clear, Findings, Unavailable).contains(outcome), canResult(state, req), state' = applyResult(state, req, outcome) }
  action join(req: Request, original: Request): bool = all {
    canReuse(state, req, original), state.production.get(original).evaluation == Invoked,
    state' = applyReuse(state, req, Joined(original), "join") }
  action cache(req: Request, original: Request): bool = all {
    canReuse(state, req, original), Set(Clear, Findings).contains(state.production.get(original).evaluation),
    state' = applyReuse(state, req, Cached(original), "cache") }
  action settleReuse(req: Request, original: Request): bool = all {
    canSettleReuse(state, req, original), state' = applySettleReuse(state, req, original) }
  action authorize(req: Request): bool = all { canHandoff(state, req, Ready), state' = applyHandoff(state, req, Authorized, WriteAuthorized, "authorize") }
  action startWrite(req: Request): bool = all { canHandoff(state, req, Authorized), state' = applyHandoff(state, req, WriteStarted, OutputStarted, "startWrite") }
  action written(req: Request): bool = all { canHandoff(state, req, WriteStarted), state' = applyHandoff(state, req, Written, OutputWritten, "written") }
  action failOutput(req: Request): bool = all { canHandoff(state, req, Authorized), state' = applyHandoff(state, req, Failed, OutputFailed, "failOutput") }
  action uncertain(req: Request): bool = all { canHandoff(state, req, WriteStarted), state' = applyHandoff(state, req, Uncertain, OutputUncertain, "uncertain") }
  action commit(e: Event): bool = all { canCommit(state, e), state' = applyCommit(state, e) }
  action failWrite(e: Event): bool = all { canFailWrite(state, e), state' = applyFailWrite(state, e) }
  action prune(e: Event): bool = all { canPrune(state, e), state' = applyPrune(state, e) }
  action snapshot = state' = applySnapshot(state)
  action replay(src: Source): bool = all { canReplay(state, src), state' = applyReplay(state, src) }
  action repeat(e: Event): bool = all { state.viewer.records.contains(e), state' = applyRepeat(state, e) }
  action pause = all { state.viewer.live, state' = mark({ ...state, viewer: { ...state.viewer, live: false } }, "pause") }
  action resume = all { not(state.viewer.live), state' = mark({ ...state, viewer: { ...state.viewer, live: true } }, "resume") }
  action tick = all { state.tick < CLOCK_LIMIT, state' = mark({ ...state, tick: state.tick + 1 }, "tick") }
  action restart(endpoint: int): bool = all { canRestart(state, endpoint), state' = applyRestart(state, endpoint) }
  action step = {
    nondet src = SOURCES.oneOf()
    val active = REQUESTS.filter(r => state.sources.get(r._1).alive and state.production.get(r).evaluation != Idle)
    nondet req = (if (active.size() > 0) active else REQUESTS).oneOf()
    val originals = REQUESTS.filter(r => r._1 == req._1 and r != req and
      state.production.get(r).route == Fresh and Set(Invoked, Clear, Findings, Unavailable).contains(state.production.get(r).evaluation))
    nondet original = (if (originals.size() > 0) originals else Set(req)).oneOf()
    nondet retirementDraw = 1.to(20).oneOf()
    nondet outcome = Set(Clear, Findings, Unavailable).oneOf()
    any {
      enable(src), disable(src), ingress(src), prepare(req), invoke(req), result(req, outcome),
      join(req, original), cache(req, original), settleReuse(req, original),
      ready(req), authorize(req), startWrite(req), written(req), failOutput(req), uncertain(req), acknowledge(req),
      { nondet e = state.queue.oneOf() commit(e) },
      { nondet e = state.queue.oneOf() failWrite(e) },
      { nondet e = state.journal.oneOf() prune(e) },
      snapshot, replay(src), { nondet e = state.viewer.records.oneOf() repeat(e) },
      pause, resume, tick, all { retirementDraw == 1, retire(src) }, restart(src._1),
    }
  }
  // High (#226): optional capture/drop/persistence cannot change review or handoff outcomes.
  val nonInterference = state.production == state.reference
  // High (#226): no queued source-bearing bytes survive observed disable.
  val consentBoundary = state.queue.forall(e => e.token == 0 or
    (state.sources.get(e.source).enabled and e.epoch == state.sources.get(e.source).epoch))
  // High (#226): bounded capture and shared retention cannot grow without limit.
  val bounds = state.queue.size() <= QUEUE_LIMIT and state.journal.size() <= STORE_LIMIT
  // High (#226): lifetime and sequence provenance never alias a different source.
  val identities = state.queue.union(state.journal).forall(e =>
    e.sequence <= state.sources.get(e.source).sequence and e.epoch > 0)
  // High (#226): duplicate replay cannot multiply records or derived counters.
  val uniqueRecords = state.viewer.records.map(e => (e.source, e.sequence)).size() == state.viewer.records.size()
  // High (#226): projected records never lie beyond the observed per-source watermark.
  val snapshotReplay = state.viewer.records.forall(e => e.sequence <= state.viewer.cursors.get(e.source))
  // High (#226): resident acknowledgement does not replace actual writer evidence.
  val acknowledgedWritten = REQUESTS.forall(req => state.production.get(req).acknowledged implies
    state.production.get(req).handoff == Written)
  pure def hasOriginal(actual: Set[Request], identity: Identity): bool = match identity {
    | SourceControl => false
    | WorkRequest(req) => actual.contains(req)
  }
  // High (#226): preparation alone cannot claim transport invocation.
  val dispatchProvenance = state.queue.union(state.journal).union(state.viewer.records).forall(e =>
    e.fact == Invocation implies hasOriginal(state.invocations, e.identity))
  // High (#226): offered advice alone cannot claim written output.
  val writerProvenance = state.queue.union(state.journal).union(state.viewer.records).forall(e =>
    e.fact == OutputWritten implies hasOriginal(state.writes, e.identity))
  // High (#226/#229): reuse refers to its original invocation and adds no fresh request.
  val reuseProvenance = REQUESTS.forall(req => originalOf(state.production.get(req).route).forall(original =>
    state.invocations.contains(original) and not(state.invocations.contains(req))))
  val reenabledWitness = SOURCES.exists(src => state.sources.get(src).epoch > 1)
  val safety = dispatchProvenance and writerProvenance and reuseProvenance and nonInterference and
    consentBoundary and bounds and identities and uniqueRecords and snapshotReplay and acknowledgedWritten
  val enableWitness = state.seen.contains("enable")
  val disableWitness = state.seen.contains("disable")
  val ingressWitness = state.seen.contains("ingress")
  val prepareWitness = state.seen.contains("prepare")
  val invokeWitness = state.seen.contains("invoke")
  val resultWitness = state.seen.contains("result")
  val joinWitness = state.seen.contains("join")
  val cacheWitness = state.seen.contains("cache")
  val settleReuseWitness = state.seen.contains("settleReuse")
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
