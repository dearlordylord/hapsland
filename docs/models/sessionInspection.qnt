// Purpose: review the proposed local inspection state shape before transition logic.
// Status: design sketch, not an executable or verified protocol.
// Authority: design sketch supporting https://github.com/dearlordylord/hapsland/issues/225.
// Expected use: complete the executable behaviour model before feature implementation.
// Lifecycle: replace this type-only sketch with that model under #225; revise before behaviour changes.
// Covers: identities, independent evidence lanes, source cursors, payload availability.
// Does not cover: action logic, byte content, auth, timing bounds, or native visibility.
module sessionInspection {
  type SourceId = int // endpoint + resident lifetime, opaque in the model
  type EditId = (SourceId, int)
  type UnitId = (SourceId, int)
  type RequestId = (SourceId, int)
  type FindingId = (SourceId, int)
  type BatchId = (SourceId, int)
  type PayloadId = (SourceId, int)
  type Maybe[a] = Absent | Present(a)

  type Admission = Received | Accepted | Refused(str)
  type Preparation = Preparing | Selected | Skipped(str) | Incomplete(str) | PreparationFailed
  type Evaluation = Pending | Clear | Findings(Set[FindingId]) | Unavailable(str) | Unknown
  type Route = Fresh(RequestId) | Joined(RequestId) | Cached(Maybe[RequestId]) | ExistingAdvice
  type Payload = Available(int) | Missing(str) // int is an abstract immutable byte token
  type Dispatch = Prepared | Invoked | NotSent(str)
  type Handoff = Waiting | Authorized | WriteStarted | Written | Acknowledged | Failed | Uncertain
  type Eligibility = Current | Retained | Suppressed(str) | Discarded(str)
  type SourceHealth = Connected | Unreachable | Ended

  type SourceState = {
    analyticsEnabled: bool,
    inspectionEnabled: bool,
    health: SourceHealth,
    allocatedSequence: int,
    committedWatermark: int,
    retainedAfter: int,
    droppedSequences: Set[int]
  }
  type EditEvidence = { admission: Admission, units: Set[UnitId] }
  type UnitEvidence = {
    edit: EditId,
    preparation: Preparation,
    route: Maybe[Route],
    evaluation: Evaluation
  }
  type RequestEvidence = {
    dispatch: Dispatch,
    input: Maybe[PayloadId],
    httpBody: Maybe[PayloadId],
    answer: Maybe[PayloadId],
    evaluation: Evaluation
  }
  type FindingEvidence = {
    unit: UnitId,
    request: Maybe[RequestId],
    eligibility: Eligibility
  }
  type BatchEvidence = {
    members: Set[FindingId],
    attempts: int -> Handoff,
    output: Maybe[PayloadId]
  }
  type Projection = {
    edits: EditId -> EditEvidence,
    units: UnitId -> UnitEvidence,
    requests: RequestId -> RequestEvidence,
    findings: FindingId -> FindingEvidence,
    batches: BatchId -> BatchEvidence,
    payloads: PayloadId -> Payload
  }
  type Coverage = Continuous | Gapped(Set[int]) | NotRecorded | CoverageUnavailable
  type ViewerState = {
    cursors: SourceId -> int,
    coverage: SourceId -> Coverage,
    live: bool,
    selected: Maybe[EditId],
    projection: Projection
  }
  type Event = { source: SourceId, sequence: int, fact: int }

  var sources: SourceId -> SourceState
  var journals: SourceId -> List[Event]
  var inTransit: Set[Event]
  var bridge: ViewerState
  var viewers: int -> ViewerState
}
