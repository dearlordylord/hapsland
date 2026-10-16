import Base

# Advice and findings are native capability handles. This cursor owns both
# collection passes; Canonical Collection/Delivery remains their only authority.
type Pass is Data:
  Pass{final: Bool, remaining: List<&2, Nat>, selected: List<&2, Nat>, retained: List<&2, Nat>}
type Selection is Data:
  Selection{token: Nat, pass: Pass}
type Command is Data:
  AllocateToken{}
  OpenFresh{candidate: Nat}
  PullFresh{stream: Nat, candidate: Nat}
  CloseStream{stream: Nat}
  Reserve{advice: Nat, token: Nat}
  Barrier{advice: Nat, final: Bool}
  OpenRetained{advice: Nat}
  PullRetained{stream: Nat, advice: Nat}
  ReadDelivery{advice: Nat, token: Nat}
  CheckWork{advice: Nat}
  RemoveStale{advice: Nat, token: Nat}
  OpenFindings{advice: Nat, content: Nat}
  PullFinding{stream: Nat}
  Suppressed{advice: Nat, stream: Nat, finding: Nat}
  ObserveSuppressed{advice: Nat, finding: Nat}
  Fit{advice: Nat, retained: List<&2, Nat>, candidates: List<&2, Nat>}
  RecordLimited{advice: Nat}
  PostCheck{has_fitting: Bool}
  Remove{advice: Nat, token: Nat}
  Release{advice: Nat}
  Update{advice: Nat, token: Nat, findings: List<&2, Nat>}
type Disposition is Data:
  Retain{}
  Retire{}
  ReleaseCandidate{}
  Other{}
type Response is Data:
  Ack{}
  Handle{handle: Nat}
  Exhausted{}
  Fresh{advice: Nat, same_id: Bool, unleased: Bool}
  Owner{same_id: Bool, same_pointer: Bool}
  Content{handle: Nat, owned: Bool}
  Truth{value: Bool}
  Fitting{findings: List<&2, Nat>, limited: Nat}
  Route{disposition: Disposition}
type AfterClose is Data:
  ReserveFresh{advice: Nat}
  NextAdvice{}
  ReadOwned{advice: Nat}
  FitFindings{advice: Nat, findings: List<&2, Nat>}
type Phase is Data:
  Token{candidates: List<&2, Nat>}
  FreshOpening{selection: Selection, candidate: Nat}
  FreshPulling{selection: Selection, stream: Nat, candidate: Nat}
  Closing{selection: Selection, after: AfterClose}
  Reserving{selection: Selection, advice: Nat}
  BarrierPassed{selection: Selection, advice: Nat}
  RetainedOpening{selection: Selection, advice: Nat}
  RetainedPulling{selection: Selection, stream: Nat, advice: Nat}
  DeliveryRead{selection: Selection, advice: Nat}
  WorkChecked{selection: Selection, advice: Nat, content: Nat}
  StaleRemoved{selection: Selection}
  FindingsOpening{selection: Selection, advice: Nat}
  FindingsPulling{selection: Selection, advice: Nat, stream: Nat, findings: List<&2, Nat>}
  SuppressionChecked{
    selection: Selection,
    advice: Nat,
    stream: Nat,
    finding: Nat,
    findings: List<&2, Nat>
  }
  SuppressionObserved{selection: Selection, advice: Nat, stream: Nat, findings: List<&2, Nat>}
  Fitted{selection: Selection, advice: Nat}
  LimitedRecorded{selection: Selection, advice: Nat, findings: List<&2, Nat>, remaining: Nat}
  PostChecked{selection: Selection, advice: Nat, findings: List<&2, Nat>}
  Disposed{selection: Selection}
  FinalDeliveryRead{selection: Selection, advice: Nat, findings: List<&2, Nat>}
  Updated{selection: Selection, advice: Nat, findings: List<&2, Nat>}
type State is Data:
  State{invocation: Nat, next: Nat, phase: Phase}
type Request is Data:
  Request{invocation: Nat, id: Nat, command: Command}
type Reply is Data:
  Reply{invocation: Nat, id: Nat, response: Response}
type Step is Data:
  Await{state: State, request: Request}
  Empty{}
  Selected{token: Nat, advice: List<&2, Nat>}
  Rejected{}

def issue(+invocation: Nat, +next: Nat, phase: Phase, command: Command) -> Step:
  Await{State{invocation, next, phase}, Request{invocation, next, command}}

def barrier(invocation: Nat, next: Nat, +selection: Selection, +advice: Nat) -> Step:
  match selection:
    case Selection{_, Pass{final, _, _, _}}:
      issue(invocation, next, BarrierPassed{selection, advice}, Barrier{advice, final})

def fresh_or_final(invocation: Nat, next: Nat, +selection: Selection, +candidate: Nat) -> Step:
  match selection:
    case Selection{_, Pass{True{}, _, _, _}}: barrier(invocation, next, selection, candidate)
    case _: issue(invocation, next, FreshOpening{selection, candidate}, OpenFresh{candidate})

def final_pass(invocation: Nat, next: Nat, token: Nat, candidates: List<&2, Nat>) -> Step:
  match candidates:
    case Nil{}: Empty{}
    case candidate <> rest:
      barrier(invocation, next, Selection{token, Pass{True{}, rest, [], []}}, candidate)

def next_advice(invocation: Nat, next: Nat, selection: Selection) -> Step:
  match selection:
    case Selection{token, Pass{final, candidate <> rest, selected, retained}}:
      fresh_or_final(
        invocation,
        next,
        Selection{token, Pass{final, rest, selected, retained}},
        candidate
      )
    case Selection{_, Pass{_, Nil{}, Nil{}, _}}: Empty{}
    case Selection{token, Pass{False{}, Nil{}, selected, _}}:
      final_pass(invocation, next, token, List.reverse(&2, Nat, selected))
    case Selection{token, Pass{True{}, Nil{}, selected, _}}:
      Selected{token, List.reverse(&2, Nat, selected)}

def initial(+invocation: Nat, candidates: List<&2, Nat>) -> Step:
  issue(invocation, 1n, Token{candidates}, AllocateToken{})

def close_stream(
  invocation: Nat,
  next: Nat,
  selection: Selection,
  stream: Nat,
  after: AfterClose
) -> Step:
  issue(invocation, next, Closing{selection, after}, CloseStream{stream})

def pull_fresh(
  invocation: Nat,
  next: Nat,
  selection: Selection,
  +stream: Nat,
  +candidate: Nat
) -> Step:
  issue(invocation, next, FreshPulling{selection, stream, candidate}, PullFresh{stream, candidate})

def pull_retained(
  invocation: Nat,
  next: Nat,
  selection: Selection,
  +stream: Nat,
  +advice: Nat
) -> Step:
  issue(invocation, next, RetainedPulling{selection, stream, advice}, PullRetained{stream, advice})

def read_delivery(invocation: Nat, next: Nat, +selection: Selection, +advice: Nat) -> Step:
  match selection:
    case Selection{token, _}: issue(
      invocation,
      next,
      DeliveryRead{selection, advice},
      ReadDelivery{advice, token}
    )

def fit(
  invocation: Nat,
  next: Nat,
  +selection: Selection,
  +advice: Nat,
  candidates: List<&2, Nat>
) -> Step:
  match selection:
    case Selection{_, Pass{_, _, _, retained}}:
      issue(invocation, next, Fitted{selection, advice}, Fit{advice, retained, candidates})

def closed(invocation: Nat, next: Nat, +selection: Selection, after: AfterClose) -> Step:
  match selection after:
    case Selection{token, _} ReserveFresh{+advice}:
      issue(invocation, next, Reserving{selection, advice}, Reserve{advice, token})
    case _ NextAdvice{}: next_advice(invocation, next, selection)
    case _ ReadOwned{advice}: read_delivery(invocation, next, selection, advice)
    case _ FitFindings{advice, findings}: fit(
      invocation,
      next,
      selection,
      advice,
      List.reverse(&2, Nat, findings)
    )

def fresh_item(invocation: Nat, next: Nat, selection: Selection, stream: Nat, candidate: Nat,
    advice: Nat, same_id: Bool, unleased: Bool) -> Step:
  match same_id unleased:
    case True{} True{}: close_stream(invocation, next, selection, stream, ReserveFresh{advice})
    case _ _: pull_fresh(invocation, next, selection, stream, candidate)

def retained_item(invocation: Nat, next: Nat, selection: Selection, stream: Nat, advice: Nat,
    same_id: Bool, same_pointer: Bool) -> Step:
  match same_id same_pointer:
    case False{} _: pull_retained(invocation, next, selection, stream, advice)
    case True{} False{}: close_stream(invocation, next, selection, stream, NextAdvice{})
    case True{} True{}: close_stream(invocation, next, selection, stream, ReadOwned{advice})

def pull_finding(invocation: Nat, next: Nat, selection: Selection, +advice: Nat,
    +stream: Nat, findings: List<&2, Nat>) -> Step:
  issue(invocation, next, FindingsPulling{selection, advice, stream, findings}, PullFinding{stream})

def has_findings(findings: List<&2, Nat>) -> Bool:
  match findings:
    case Nil{}: False{}
    case _: True{}

def record_limited(invocation: Nat, next: Nat, selection: Selection, +advice: Nat,
    +findings: List<&2, Nat>, count: Nat) -> Step:
  match count:
    case 0n:
      issue(invocation, next, PostChecked{selection, advice, findings},
        PostCheck{has_findings(findings)})
    case 1n++remaining:
      issue(
        invocation,
        next,
        LimitedRecorded{selection, advice, findings, remaining},
        RecordLimited{advice}
      )

def update(
  invocation: Nat,
  next: Nat,
  +selection: Selection,
  +advice: Nat,
  +findings: List<&2, Nat>
) -> Step:
  match selection:
    case Selection{token, _}:
      issue(invocation, next, Updated{selection, advice, findings}, Update{advice, token, findings})

def retain(
  invocation: Nat,
  next: Nat,
  +selection: Selection,
  +advice: Nat,
  +findings: List<&2, Nat>
) -> Step:
  match selection:
    case Selection{token, Pass{True{}, _, _, _}}:
      issue(
        invocation,
        next,
        FinalDeliveryRead{selection, advice, findings},
        ReadDelivery{advice, token}
      )
    case _: update(invocation, next, selection, advice, findings)

def disposition(invocation: Nat, next: Nat, +selection: Selection, +advice: Nat,
    findings: List<&2, Nat>, route: Disposition) -> Step:
  match selection route:
    case _ Retain{}: retain(invocation, next, selection, advice, findings)
    case Selection{token, _} Retire{}:
      issue(invocation, next, Disposed{selection}, Remove{advice, token})
    case _ _:
      issue(invocation, next, Disposed{selection}, Release{advice})

def updated(
  invocation: Nat,
  next: Nat,
  selection: Selection,
  advice: Nat,
  findings: List<&2, Nat>
) -> Step:
  match selection:
    case Selection{token, Pass{final, remaining, selected, retained}}:
      next_advice(invocation, next, Selection{token, Pass{final, remaining, advice <> selected,
        List.append(&2, Nat, retained, findings)}})

def owned_delivery(invocation: Nat, next: Nat, selection: Selection, +advice: Nat,
    content: Nat, owned: Bool) -> Step:
  match owned:
    case False{}: next_advice(invocation, next, selection)
    case True{}: issue(invocation, next, WorkChecked{selection, advice, content}, CheckWork{advice})

def checked_work(invocation: Nat, next: Nat, +selection: Selection, +advice: Nat,
    content: Nat, current: Bool) -> Step:
  match selection current:
    case Selection{token, _} False{}:
      issue(invocation, next, StaleRemoved{selection}, RemoveStale{advice, token})
    case _ True{}:
      issue(invocation, next, FindingsOpening{selection, advice}, OpenFindings{advice, content})

def suppressed(invocation: Nat, next: Nat, selection: Selection, +advice: Nat,
    stream: Nat, +finding: Nat, findings: List<&2, Nat>, yes: Bool) -> Step:
  match yes:
    case True{}:
      issue(
        invocation,
        next,
        SuppressionObserved{selection, advice, stream, findings},
        ObserveSuppressed{advice, finding}
      )
    case False{}: pull_finding(invocation, next, selection, advice, stream, finding <> findings)

def phase_response(invocation: Nat, next: Nat, phase: Phase, response: Response) -> Step:
  match phase response:
    case Token{candidates} Handle{token}:
      next_advice(invocation, next, Selection{token, Pass{False{}, candidates, [], []}})
    case FreshOpening{selection, candidate} Handle{stream}: pull_fresh(
      invocation,
      next,
      selection,
      stream,
      candidate
    )
    case FreshPulling{selection, stream, candidate} Fresh{advice, same_id, unleased}:
      fresh_item(invocation, next, selection, stream, candidate, advice, same_id, unleased)
    case FreshPulling{selection, stream, _} Exhausted{}:
      close_stream(invocation, next, selection, stream, NextAdvice{})
    case Closing{selection, after} Ack{}: closed(invocation, next, selection, after)
    case Reserving{selection, advice} Truth{True{}}: barrier(invocation, next, selection, advice)
    case Reserving{selection, _} Truth{False{}}: next_advice(invocation, next, selection)
    case BarrierPassed{selection, +advice} Ack{}:
      issue(invocation, next, RetainedOpening{selection, advice}, OpenRetained{advice})
    case RetainedOpening{selection, advice} Handle{stream}: pull_retained(
      invocation,
      next,
      selection,
      stream,
      advice
    )
    case RetainedPulling{selection, stream, advice} Owner{same_id, same_pointer}:
      retained_item(invocation, next, selection, stream, advice, same_id, same_pointer)
    case RetainedPulling{selection, stream, _} Exhausted{}:
      close_stream(invocation, next, selection, stream, NextAdvice{})
    case DeliveryRead{selection, advice} Content{content, owned}:
      owned_delivery(invocation, next, selection, advice, content, owned)
    case WorkChecked{selection, advice, content} Truth{current}: checked_work(
      invocation,
      next,
      selection,
      advice,
      content,
      current
    )
    case StaleRemoved{selection} Ack{}: next_advice(invocation, next, selection)
    case FindingsOpening{selection, advice} Handle{stream}: pull_finding(
      invocation,
      next,
      selection,
      advice,
      stream,
      []
    )
    case FindingsPulling{selection, advice, stream, findings} Exhausted{}:
      close_stream(invocation, next, selection, stream, FitFindings{advice, findings})
    case FindingsPulling{selection, +advice, +stream, findings} Handle{+finding}:
      issue(
        invocation,
        next,
        SuppressionChecked{selection, advice, stream, finding, findings},
        Suppressed{advice, stream, finding}
      )
    case SuppressionChecked{selection, advice, stream, finding, findings} Truth{yes}:
      suppressed(invocation, next, selection, advice, stream, finding, findings, yes)
    case SuppressionObserved{selection, advice, stream, findings} Ack{}:
      pull_finding(invocation, next, selection, advice, stream, findings)
    case Fitted{selection, advice} Fitting{findings, count}: record_limited(
      invocation,
      next,
      selection,
      advice,
      findings,
      count
    )
    case LimitedRecorded{selection, advice, findings, count} Ack{}:
      record_limited(invocation, next, selection, advice, findings, count)
    case PostChecked{selection, advice, findings} Route{route}: disposition(
      invocation,
      next,
      selection,
      advice,
      findings,
      route
    )
    case Disposed{selection} Ack{}: next_advice(invocation, next, selection)
    case FinalDeliveryRead{selection, advice, findings} Content{_, True{}}:
      update(invocation, next, selection, advice, findings)
    case FinalDeliveryRead{selection, _, _} Content{_, False{}}: next_advice(
      invocation,
      next,
      selection
    )
    case Updated{selection, advice, findings} Ack{}: updated(
      invocation,
      next,
      selection,
      advice,
      findings
    )
    case _ _: Rejected{}

def correlated(matches: Bool, invocation: Nat, next: Nat, phase: Phase, response: Response) -> Step:
  match matches:
    case True{}: phase_response(invocation, Nat.add(next, 1n), phase, response)
    case False{}: Rejected{}

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Await{State{+invocation, +next, phase}, _} Reply{actual, id, response}:
      correlated(
        Bool.and(Nat.is_eq(invocation, actual), Nat.is_eq(next, id)),
        invocation,
        next,
        phase,
        response
      )
    case _ _: Rejected{}

def atomic(step: Step) -> Bool:
  match step:
    case Await{State{_, _, Fitted{_, _}}, _}: True{}
    case Await{State{_, _, LimitedRecorded{_, _, _, _}}, _}: True{}
    case _: False{}

# Full collection continuation. Native handles retain the original snapshots;
# these phases do not introduce another advice, lease or delivery authority.
type FlowCommand is Data:
  CCaptureFrame{}
  CReadDeciding{}
  CSetStop{value: Bool}
  CExpirePending{}
  CPruneNotices{}
  CCaptureCredential{}
  COpenAdvice{copy: Bool}
  CPullAdvice{stream: Nat}
  COpenSnapshots{}
  CPullSnapshot{stream: Nat}
  CCheckCredential{advice: Nat}
  CRemoveCredential{advice: Nat}
  CCheckLease{advice: Nat}
  CCandidateFacts{advice: Nat, content: Nat}
  CCandidateCheck{same_scope: Bool, unleased: Bool, unsuppressed: Bool, authority: Bool}
  CSetEligibility{advice: Nat}
  CReadEligibility{advice: Nat}
  CCompare{left: Nat, right: Nat}
  CPrimitive{command: Command}
  CHandoffClock{}
  CPullOwner{stream: Nat, advice: Nat}
  CHandoffInfo{advice: Nat, retained: Maybe<&2, Nat>, token: Nat}
  CCredentialMetadata{advice: Nat}
  CReadCredential{}
  CCheckExpiry{advice: Nat}
  CFinalRoute{info: Nat, credential_authorized: Bool, expired: Bool, current: Bool}
  CRenew{advice: Nat, token: Nat}
  CHandoffOffers{advice: Nat}
  CFitHandoff{offers: List<&2, Nat>}
  CHandoffLimited{offer: Nat}
  CDeliveryFindings{advice: Nat}
  CResponseContent{advice: Nat}
  CResponseFindings{advice: Nat, content: Nat}
type FlowResponse is Data:
  RAck{}
  RTruth{value: Bool}
  RHandle{handle: Nat}
  RAdvice{advice: Nat}
  RSnapshot{advice: Nat, content: Nat, leased: Bool}
  RExhausted{}
  RCandidate{same_scope: Bool, unleased: Bool, authority: Bool}
  RPrimitive{response: Response}
  ROwner{advice: Nat, same_id: Bool}
  RInfo{handle: Nat, owner: Bool, generation: Bool, has_delivery: Bool}
  RCredentialMetadata{absent: Bool, environment_only: Bool}
  RCredentialState{present: Bool, generation: Bool, suspended: Bool}
  RRoute{disposition: Disposition}
  RFindings{owned: Bool, findings: List<&2, Nat>}
  RItems{items: List<&2, Nat>}
  RFitting{selected: List<&2, Nat>, limited: List<&2, Nat>}
type CandidateScan is Data:
  CandidateScan{stream: Nat, available: List<&2, Nat>}
type Candidate is Data:
  Candidate{scan: CandidateScan, advice: Nat, same_scope: Bool, unleased: Bool, authority: Bool}
type HandoffScan is Data:
  HandoffScan{token: Nat, remaining: List<&2, Nat>, retained: List<&2, Nat>}
type Finish is Data:
  Finish{token: Nat, advice: List<&2, Nat>, accepted: List<&2, Nat>}
type ResponseItem is Data:
  ResponseItem{advice: Nat, content: Nat}
type Filtered is Data:
  Filtered{index: Nat, findings: List<&2, Nat>}
type FlowPhase is Data:
  PFrame{composed: Bool, turn_end: Bool}
  PDeciding{turn_end: Bool}
  PStopSet{}
  PExpired{}
  PPruned{}
  PCredentialCaptured{}
  PCredentialsOpen{}
  PCredentialsPull{stream: Nat}
  PCredentialChecked{stream: Nat, advice: Nat}
  PCredentialRemoved{stream: Nat}
  PLeasesOpen{}
  PLeasesPull{stream: Nat}
  PLeaseChecked{stream: Nat}
  PCandidatesOpen{}
  PCandidatesPull{scan: CandidateScan}
  PCandidateRead{scan: CandidateScan, advice: Nat, content: Nat}
  PCandidateFindingsOpen{candidate: Candidate}
  PCandidateFinding{candidate: Candidate, stream: Nat}
  PCandidateSuppression{candidate: Candidate, stream: Nat, finding: Nat}
  PCandidateObserved{candidate: Candidate, stream: Nat}
  PCandidateChecked{scan: CandidateScan, advice: Nat}
  PEligibilitySet{remaining: List<&2, Nat>, available: List<&2, Nat>}
  PEligibilityRead{advice: Nat, remaining: List<&2, Nat>, eligible: List<&2, Nat>}
  PInsertCompared{
    item: Nat,
    remaining: List<&2, Nat>,
    left: Nat,
    prefix: List<&2, Nat>,
    suffix: List<&2, Nat>
  }
  PSelection{step: Step}
  PFinalClock{token: Nat, advice: List<&2, Nat>}
  POwnersOpen{scan: HandoffScan, advice: Nat}
  POwnersPull{scan: HandoffScan, advice: Nat, stream: Nat}
  PInfoRead{scan: HandoffScan, advice: Nat}
  PCredentialMetadataRead{scan: HandoffScan, advice: Nat, info: Nat, has_delivery: Bool}
  PCredentialStateRead{
    scan: HandoffScan,
    advice: Nat,
    info: Nat,
    has_delivery: Bool,
    environment_only: Bool
  }
  PExpiryRead{scan: HandoffScan, advice: Nat, info: Nat, has_delivery: Bool}
  PWorkRead{scan: HandoffScan, advice: Nat, info: Nat, has_delivery: Bool, expired: Bool}
  PFinalRouted{scan: HandoffScan, advice: Nat, has_delivery: Bool}
  PFinalDisposed{scan: HandoffScan}
  PRenewed{scan: HandoffScan, advice: Nat}
  POffersRead{token: Nat, advice: List<&2, Nat>, remaining: List<&2, Nat>, offers: List<&2, Nat>}
  PHandoffFitted{token: Nat, advice: List<&2, Nat>, offers: List<&2, Nat>}
  PLimitedReported{finish: Finish, remaining: List<&2, Nat>}
  PDeliveryRead{finish: Finish, advice: Nat, remaining: List<&2, Nat>, index: Nat}
  PDeliveryUpdated{finish: Finish, advice: Nat, remaining: List<&2, Nat>, index: Nat}
  PDeliveryRechecked{finish: Finish, advice: Nat, remaining: List<&2, Nat>, index: Nat}
  PDeliveryReleased{finish: Finish, remaining: List<&2, Nat>, index: Nat}
  PContentRead{
    finish: Finish,
    advice: Nat,
    remaining: List<&2, Nat>,
    contents: List<&2, ResponseItem>
  }
  PResponseRead{finish: Finish, remaining: List<&2, ResponseItem>, findings: List<&2, Nat>}
  PClosed{phase: FlowPhase, command: FlowCommand}
  PCandidatesClosed{available: List<&2, Nat>}
type FlowState is Data:
  FlowState{invocation: Nat, next: Nat, phase: FlowPhase}
type FlowRequest is Data:
  FlowRequest{invocation: Nat, id: Nat, command: FlowCommand}
type FlowReply is Data:
  FlowReply{invocation: Nat, id: Nat, response: FlowResponse}
type FlowStep is Data:
  FlowAwait{state: FlowState, request: FlowRequest}
  FlowEmpty{}
  FlowDone{token: Nat, advice: List<&2, Nat>, findings: List<&2, Nat>}
  FlowRejected{}

def flow_issue(+invocation: Nat, +next: Nat, +phase: FlowPhase, +command: FlowCommand) -> FlowStep:
  FlowAwait{FlowState{invocation, next, phase}, FlowRequest{invocation, next, command}}

def flow_close(
  +invocation: Nat,
  +next: Nat,
  +stream: Nat,
  +phase: FlowPhase,
  +command: FlowCommand
) -> FlowStep:
  flow_issue(invocation, next, PClosed{phase, command}, CPrimitive{CloseStream{stream}})

def flow_select(+invocation: Nat, +next: Nat, +step: Step) -> FlowStep:
  match step:
    case Await{_, Request{_, _, +command}}:
      flow_issue(invocation, next, PSelection{step}, CPrimitive{command})
    case Selected{+token, +advice}:
      flow_issue(invocation, next, PFinalClock{token, advice}, CHandoffClock{})
    case Empty{}: FlowEmpty{}
    case Rejected{}: FlowRejected{}

def flow_compare(
  +invocation: Nat,
  +next: Nat,
  +item: Nat,
  +remaining: List<&2, Nat>,
  +prefix: List<&2, Nat>,
  +suffix: List<&2, Nat>
) -> FlowStep:
  match prefix:
    case +left <> +rest:
      flow_issue(
        invocation,
        next,
        PInsertCompared{item, remaining, left, rest, suffix},
        CCompare{left, item}
      )
    case Nil{}: FlowRejected{}

def flow_sort(
  +remaining: List<&2, Nat>,
  +invocation: Nat,
  +next: Nat,
  +ordered: List<&2, Nat>
) -> FlowStep:
  match remaining:
    case Nil{}: flow_select(invocation, next, initial(invocation, ordered))
    case +item <> +rest: flow_compare(
      invocation,
      next,
      item,
      rest,
      List.reverse(&2, Nat, ordered),
      []
    )

def flow_begin_sort(+invocation: Nat, +next: Nat, +eligible: List<&2, Nat>) -> FlowStep:
  match eligible:
    case Nil{}: flow_select(invocation, next, initial(invocation, []))
    case +item <> +rest: flow_sort(rest, invocation, next, [item])

def flow_read_eligibility(
  +remaining: List<&2, Nat>,
  +invocation: Nat,
  +next: Nat,
  +eligible: List<&2, Nat>
) -> FlowStep:
  match remaining:
    case Nil{}: flow_begin_sort(invocation, next, List.reverse(&2, Nat, eligible))
    case +advice <> +rest: flow_issue(
      invocation,
      next,
      PEligibilityRead{advice, rest, eligible},
      CReadEligibility{advice}
    )

def flow_set_eligibility(
  +remaining: List<&2, Nat>,
  +invocation: Nat,
  +next: Nat,
  +available: List<&2, Nat>
) -> FlowStep:
  match remaining:
    case Nil{}: flow_read_eligibility(available, invocation, next, [])
    case +advice <> +rest: flow_issue(
      invocation,
      next,
      PEligibilitySet{rest, available},
      CSetEligibility{advice}
    )

def flow_candidate_check(
  +invocation: Nat,
  +next: Nat,
  +candidate: Candidate,
  +unsuppressed: Bool
) -> FlowStep:
  match candidate:
    case Candidate{+scan, +advice, +same_scope, +unleased, +authority}:
      flow_issue(
        invocation,
        next,
        PCandidateChecked{scan, advice},
        CCandidateCheck{same_scope, unleased, unsuppressed, authority}
      )

def flow_offers(
  +remaining: List<&2, Nat>,
  +invocation: Nat,
  +next: Nat,
  +token: Nat,
  +advice: List<&2, Nat>,
  +offers: List<&2, Nat>
) -> FlowStep:
  match remaining:
    case Nil{}: flow_issue(
      invocation,
      next,
      PHandoffFitted{token, advice, offers},
      CFitHandoff{offers}
    )
    case +item <> +rest: flow_issue(
      invocation,
      next,
      POffersRead{token, advice, rest, offers},
      CHandoffOffers{item}
    )

def flow_next_handoff(+invocation: Nat, +next: Nat, +scan: HandoffScan) -> FlowStep:
  match scan:
    case HandoffScan{+token, +advice <> +rest, +retained}:
      flow_issue(
        invocation,
        next,
        POwnersOpen{HandoffScan{token, rest, retained}, advice},
        COpenAdvice{False{}}
      )
    case HandoffScan{+token, Nil{}, +retained}:
      flow_offers(
        List.reverse(&2, Nat, retained),
        invocation,
        next,
        token,
        List.reverse(&2, Nat, retained),
        []
      )

def flow_response_findings(
  +contents: List<&2, ResponseItem>,
  +invocation: Nat,
  +next: Nat,
  +finish: Finish,
  +findings: List<&2, Nat>
) -> FlowStep:
  match contents finish:
    case Nil{} Finish{+token, +advice, _}: FlowDone{token, advice, findings}
    case ResponseItem{+advice, +content} <> +rest _:
      flow_issue(
        invocation,
        next,
        PResponseRead{finish, rest, findings},
        CResponseFindings{advice, content}
      )

def flow_response_contents(
  +remaining: List<&2, Nat>,
  +invocation: Nat,
  +next: Nat,
  +finish: Finish,
  +contents: List<&2, ResponseItem>
) -> FlowStep:
  match remaining:
    case Nil{}: flow_response_findings(
      List.reverse(&2, ResponseItem, contents),
      invocation,
      next,
      finish,
      []
    )
    case +advice <> +rest: flow_issue(
      invocation,
      next,
      PContentRead{finish, advice, rest, contents},
      CResponseContent{advice}
    )

def flow_update_deliveries(
  +remaining: List<&2, Nat>,
  +invocation: Nat,
  +next: Nat,
  +finish: Finish,
  +index: Nat
) -> FlowStep:
  match remaining finish:
    case Nil{} Finish{_, +advice, _}: flow_response_contents(advice, invocation, next, finish, [])
    case +advice <> +rest _: flow_issue(
      invocation,
      next,
      PDeliveryRead{finish, advice, rest, index},
      CDeliveryFindings{advice}
    )

def flow_report_limited(
  +remaining: List<&2, Nat>,
  +invocation: Nat,
  +next: Nat,
  +finish: Finish
) -> FlowStep:
  match remaining finish:
    case Nil{} Finish{_, +advice, _}: flow_update_deliveries(advice, invocation, next, finish, 0n)
    case +offer <> +rest _: flow_issue(
      invocation,
      next,
      PLimitedReported{finish, rest},
      CHandoffLimited{offer}
    )

def flow_member(+values: List<&2, Nat>, +value: Nat) -> Bool:
  match values:
    case Nil{}: False{}
    case +head <> +tail: Bool.or(Nat.is_eq(head, value), flow_member(tail, value))

def flow_filter_item(+keep: Bool, +item: Nat, +result: Filtered) -> Filtered:
  match keep result:
    case True{} Filtered{+index, +findings}: Filtered{index, item <> findings}
    case False{} +result: result

def flow_filter(+findings: List<&2, Nat>, +accepted: List<&2, Nat>, +index: Nat) -> Filtered:
  match findings:
    case Nil{}: Filtered{index, []}
    case +finding <> +rest: flow_filter_item(
      flow_member(accepted, index),
      finding,
      flow_filter(rest, accepted, Nat.add(index, 1n))
    )

def flow_filtered(
  +invocation: Nat,
  +next: Nat,
  +finish: Finish,
  +advice: Nat,
  +remaining: List<&2, Nat>,
  +result: Filtered
) -> FlowStep:
  match finish result:
    case Finish{+token, _, _} Filtered{+index, +findings}:
      flow_issue(
        invocation,
        next,
        PDeliveryUpdated{finish, advice, remaining, index},
        CPrimitive{Update{advice, token, findings}}
      )

def collect_initial(+invocation: Nat, +composed: Bool, +turn_end: Bool) -> FlowStep:
  flow_issue(invocation, 1n, PFrame{composed, turn_end}, CCaptureFrame{})

def candidate_advice(candidate: Candidate) -> Nat:
  match candidate:
    case Candidate{_, +advice, _, _, _}: advice

def scan_stream(scan: CandidateScan) -> Nat:
  match scan:
    case CandidateScan{+stream, _}: stream

def scan_token(scan: HandoffScan) -> Nat:
  match scan:
    case HandoffScan{+token, _, _}: token

def finish_accepted(finish: Finish) -> List<&2, Nat>:
  match finish:
    case Finish{_, _, +accepted}: accepted

def flow_selection_resume(invocation: Nat, next: Nat, +step: Step, response: Response) -> FlowStep:
  match step:
    case Await{_, Request{+actual, +id, _}}: flow_select(
      invocation,
      next,
      resume(step, Reply{actual, id, response})
    )
    case _: FlowRejected{}

def flow_inspect(
  +invocation: Nat,
  +next: Nat,
  +scan: HandoffScan,
  +advice: Nat,
  +info: Nat,
  +has_delivery: Bool
) -> FlowStep:
  flow_issue(invocation, next, PExpiryRead{scan, advice, info, has_delivery}, CCheckExpiry{advice})

def flow_phase_response(
  +invocation: Nat,
  +next: Nat,
  +phase: FlowPhase,
  +response: FlowResponse
) -> FlowStep:
  match phase response:
    case PFrame{True{}, +turn_end} RAck{}: flow_issue(
      invocation,
      next,
      PDeciding{turn_end},
      CReadDeciding{}
    )
    case PFrame{False{}, _} RAck{}: flow_issue(invocation, next, PStopSet{}, CSetStop{False{}})
    case PDeciding{False{}} RTruth{True{}}: FlowEmpty{}
    case PDeciding{True{}} RTruth{+value}: flow_issue(invocation, next, PStopSet{}, CSetStop{value})
    case PDeciding{False{}} RTruth{False{}}: flow_issue(
      invocation,
      next,
      PStopSet{},
      CSetStop{False{}}
    )
    case PStopSet{} RAck{}: flow_issue(invocation, next, PExpired{}, CExpirePending{})
    case PExpired{} RAck{}: flow_issue(invocation, next, PPruned{}, CPruneNotices{})
    case PPruned{} RAck{}: flow_issue(invocation, next, PCredentialCaptured{}, CCaptureCredential{})
    case PCredentialCaptured{} RAck{}: flow_issue(
      invocation,
      next,
      PCredentialsOpen{},
      COpenAdvice{True{}}
    )
    case PCredentialsOpen{} RHandle{+stream}: flow_issue(
      invocation,
      next,
      PCredentialsPull{stream},
      CPullAdvice{stream}
    )
    case PCredentialsPull{+stream} RAdvice{+advice}: flow_issue(
      invocation,
      next,
      PCredentialChecked{stream, advice},
      CCheckCredential{advice}
    )
    case PCredentialChecked{+stream, _} RTruth{True{}}: flow_issue(
      invocation,
      next,
      PCredentialsPull{stream},
      CPullAdvice{stream}
    )
    case PCredentialChecked{+stream, +advice} RTruth{False{}}: flow_issue(
      invocation,
      next,
      PCredentialRemoved{stream},
      CRemoveCredential{advice}
    )
    case PCredentialRemoved{+stream} RAck{}: flow_issue(
      invocation,
      next,
      PCredentialsPull{stream},
      CPullAdvice{stream}
    )
    case PCredentialsPull{+stream} RExhausted{}: flow_close(
      invocation,
      next,
      stream,
      PLeasesOpen{},
      COpenSnapshots{}
    )
    case PLeasesOpen{} RHandle{+stream}: flow_issue(
      invocation,
      next,
      PLeasesPull{stream},
      CPullSnapshot{stream}
    )
    case PLeasesPull{+stream} RSnapshot{+advice, _, True{}}: flow_issue(
      invocation,
      next,
      PLeaseChecked{stream},
      CCheckLease{advice}
    )
    case PLeasesPull{+stream} RSnapshot{_, _, False{}}: flow_issue(
      invocation,
      next,
      PLeasesPull{stream},
      CPullSnapshot{stream}
    )
    case PLeaseChecked{+stream} RAck{}: flow_issue(
      invocation,
      next,
      PLeasesPull{stream},
      CPullSnapshot{stream}
    )
    case PLeasesPull{+stream} RExhausted{}: flow_close(
      invocation,
      next,
      stream,
      PCandidatesOpen{},
      COpenSnapshots{}
    )
    case PCandidatesOpen{} RHandle{+stream}: flow_issue(
      invocation,
      next,
      PCandidatesPull{CandidateScan{stream, []}},
      CPullSnapshot{stream}
    )
    case PCandidatesPull{+scan} RSnapshot{+advice, +content, _}: flow_issue(
      invocation,
      next,
      PCandidateRead{scan, advice, content},
      CCandidateFacts{advice, content}
    )
    case PCandidatesPull{CandidateScan{+stream, +available}} RExhausted{}: flow_issue(
      invocation,
      next,
      PCandidatesClosed{available},
      CPrimitive{CloseStream{stream}}
    )
    case PCandidatesClosed{+available} RPrimitive{Ack{}}: flow_set_eligibility(
      List.reverse(&2, Nat, available),
      invocation,
      next,
      List.reverse(&2, Nat, available)
    )
    case PCandidateRead{+scan, +advice, +content} RCandidate{True{}, True{}, +authority}: flow_issue(
      invocation,
      next,
      PCandidateFindingsOpen{Candidate{scan, advice, True{}, True{}, authority}},
      CPrimitive{OpenFindings{advice, content}}
    )
    case PCandidateRead{+scan, +advice, _} RCandidate{+same_scope, +unleased, +authority}: flow_candidate_check(
      invocation,
      next,
      Candidate{scan, advice, same_scope, unleased, authority},
      False{}
    )
    case PCandidateFindingsOpen{+candidate} RPrimitive{Handle{+stream}}: flow_issue(
      invocation,
      next,
      PCandidateFinding{candidate, stream},
      CPrimitive{PullFinding{stream}}
    )
    case PCandidateFinding{+candidate, +stream} RPrimitive{Handle{+finding}}: flow_issue(
      invocation,
      next,
      PCandidateSuppression{candidate, stream, finding},
      CPrimitive{Suppressed{candidate_advice(candidate), stream, finding}}
    )
    case PCandidateFinding{Candidate{+scan, +advice, +same_scope, +unleased, +authority}, +stream} RPrimitive{
      Exhausted{}
    }: flow_close(
      invocation,
      next,
      stream,
      PCandidateChecked{scan, advice},
      CCandidateCheck{same_scope, unleased, False{}, authority}
    )
    case PCandidateSuppression{
      Candidate{+scan, +advice, +same_scope, +unleased, +authority},
      +stream,
      _
    } RPrimitive{Truth{False{}}}: flow_close(
      invocation,
      next,
      stream,
      PCandidateChecked{scan, advice},
      CCandidateCheck{same_scope, unleased, True{}, authority}
    )
    case PCandidateSuppression{+candidate, +stream, +finding} RPrimitive{Truth{True{}}}: flow_issue(
      invocation,
      next,
      PCandidateObserved{candidate, stream},
      CPrimitive{ObserveSuppressed{candidate_advice(candidate), finding}}
    )
    case PCandidateObserved{+candidate, +stream} RPrimitive{Ack{}}: flow_issue(
      invocation,
      next,
      PCandidateFinding{candidate, stream},
      CPrimitive{PullFinding{stream}}
    )
    case PCandidateChecked{CandidateScan{+stream, +available}, +advice} RTruth{True{}}: flow_issue(
      invocation,
      next,
      PCandidatesPull{CandidateScan{stream, advice <> available}},
      CPullSnapshot{stream}
    )
    case PCandidateChecked{+scan, _} RTruth{False{}}: flow_issue(
      invocation,
      next,
      PCandidatesPull{scan},
      CPullSnapshot{scan_stream(scan)}
    )
    case PEligibilitySet{+remaining, +available} RAck{}: flow_set_eligibility(
      remaining,
      invocation,
      next,
      available
    )
    case PEligibilityRead{+advice, +remaining, +eligible} RTruth{True{}}: flow_read_eligibility(
      remaining,
      invocation,
      next,
      advice <> eligible
    )
    case PEligibilityRead{_, +remaining, +eligible} RTruth{False{}}: flow_read_eligibility(
      remaining,
      invocation,
      next,
      eligible
    )
    case PInsertCompared{+item, +remaining, +left, +prefix, +suffix} RTruth{False{}}: flow_sort(
      remaining,
      invocation,
      next,
      List.concat(&2, Nat, [List.reverse(&2, Nat, left <> prefix), item <> suffix])
    )
    case PInsertCompared{+item, +remaining, +left, Nil{}, +suffix} RTruth{True{}}: flow_sort(
      remaining,
      invocation,
      next,
      item <> left <> suffix
    )
    case PInsertCompared{+item, +remaining, +left, +prefix, +suffix} RTruth{True{}}: flow_compare(
      invocation,
      next,
      item,
      remaining,
      prefix,
      left <> suffix
    )
    case PSelection{+step} RPrimitive{+response}: flow_selection_resume(
      invocation,
      next,
      step,
      response
    )
    case PFinalClock{+token, +advice} RAck{}: flow_next_handoff(
      invocation,
      next,
      HandoffScan{token, advice, []}
    )
    case POwnersOpen{+scan, +advice} RHandle{+stream}: flow_issue(
      invocation,
      next,
      POwnersPull{scan, advice, stream},
      CPullOwner{stream, advice}
    )
    case POwnersPull{+scan, +advice, +stream} ROwner{_, False{}}: flow_issue(
      invocation,
      next,
      POwnersPull{scan, advice, stream},
      CPullOwner{stream, advice}
    )
    case POwnersPull{+scan, +advice, +stream} ROwner{+retained, True{}}: flow_close(
      invocation,
      next,
      stream,
      PInfoRead{scan, advice},
      CHandoffInfo{advice, Some{retained}, scan_token(scan)}
    )
    case POwnersPull{+scan, +advice, +stream} RExhausted{}: flow_close(
      invocation,
      next,
      stream,
      PInfoRead{scan, advice},
      CHandoffInfo{advice, None{}, scan_token(scan)}
    )
    case PInfoRead{+scan, +advice} RInfo{+info, True{}, True{}, +has_delivery}: flow_issue(
      invocation,
      next,
      PCredentialMetadataRead{scan, advice, info, has_delivery},
      CCredentialMetadata{advice}
    )
    case PInfoRead{+scan, +advice} RInfo{+info, _, _, +has_delivery}: flow_issue(
      invocation,
      next,
      PFinalRouted{scan, advice, has_delivery},
      CFinalRoute{info, True{}, False{}, False{}}
    )
    case PCredentialMetadataRead{+scan, +advice, +info, +has_delivery} RCredentialMetadata{
      True{},
      _
    }: flow_inspect(invocation, next, scan, advice, info, has_delivery)
    case PCredentialMetadataRead{+scan, +advice, +info, +has_delivery} RCredentialMetadata{
      False{},
      +environment_only
    }: flow_issue(
      invocation,
      next,
      PCredentialStateRead{scan, advice, info, has_delivery, environment_only},
      CReadCredential{}
    )
    case PCredentialStateRead{+scan, +advice, +info, +has_delivery, True{}} RCredentialState{
      True{},
      True{},
      _
    }: flow_inspect(invocation, next, scan, advice, info, has_delivery)
    case PCredentialStateRead{+scan, +advice, +info, +has_delivery, False{}} RCredentialState{
      True{},
      True{},
      False{}
    }: flow_inspect(invocation, next, scan, advice, info, has_delivery)
    case PCredentialStateRead{+scan, +advice, +info, +has_delivery, _} RCredentialState{_, _, _}: flow_issue(
      invocation,
      next,
      PFinalRouted{scan, advice, has_delivery},
      CFinalRoute{info, False{}, False{}, False{}}
    )
    case PExpiryRead{+scan, +advice, +info, +has_delivery} RTruth{+expired}: flow_issue(
      invocation,
      next,
      PWorkRead{scan, advice, info, has_delivery, expired},
      CPrimitive{CheckWork{advice}}
    )
    case PWorkRead{+scan, +advice, +info, +has_delivery, +expired} RPrimitive{Truth{+current}}: flow_issue(
      invocation,
      next,
      PFinalRouted{scan, advice, has_delivery},
      CFinalRoute{info, True{}, expired, current}
    )
    case PFinalRouted{+scan, +advice, _} RRoute{Retire{}}: flow_issue(
      invocation,
      next,
      PFinalDisposed{scan},
      CPrimitive{Remove{advice, scan_token(scan)}}
    )
    case PFinalRouted{+scan, +advice, _} RRoute{ReleaseCandidate{}}: flow_issue(
      invocation,
      next,
      PFinalDisposed{scan},
      CPrimitive{Release{advice}}
    )
    case PFinalRouted{+scan, +advice, True{}} RRoute{Retain{}}: flow_issue(
      invocation,
      next,
      PRenewed{scan, advice},
      CRenew{advice, scan_token(scan)}
    )
    case PFinalRouted{+scan, _, _} RRoute{_}: flow_next_handoff(invocation, next, scan)
    case PFinalDisposed{+scan} RPrimitive{Ack{}}: flow_next_handoff(invocation, next, scan)
    case PRenewed{HandoffScan{+token, +remaining, +retained}, +advice} RAck{}: flow_next_handoff(
      invocation,
      next,
      HandoffScan{token, remaining, advice <> retained}
    )
    case POffersRead{+token, +advice, +remaining, +offers} RItems{+items}: flow_offers(
      remaining,
      invocation,
      next,
      token,
      advice,
      List.concat(&2, Nat, [offers, items])
    )
    case PHandoffFitted{+token, +advice, _} RFitting{+selected, +limited}: flow_report_limited(
      limited,
      invocation,
      next,
      Finish{token, advice, selected}
    )
    case PLimitedReported{+finish, +remaining} RAck{}: flow_report_limited(
      remaining,
      invocation,
      next,
      finish
    )
    case PDeliveryRead{+finish, +advice, +remaining, +index} RFindings{True{}, +findings}: flow_filtered(
      invocation,
      next,
      finish,
      advice,
      remaining,
      flow_filter(findings, finish_accepted(finish), index)
    )
    case PDeliveryRead{+finish, _, +remaining, +index} RFindings{False{}, _}: flow_update_deliveries(
      remaining,
      invocation,
      next,
      finish,
      index
    )
    case PDeliveryUpdated{+finish, +advice, +remaining, +index} RPrimitive{Ack{}}: flow_issue(
      invocation,
      next,
      PDeliveryRechecked{finish, advice, remaining, index},
      CDeliveryFindings{advice}
    )
    case PDeliveryRechecked{+finish, +advice, +remaining, +index} RFindings{True{}, Nil{}}: flow_issue(
      invocation,
      next,
      PDeliveryReleased{finish, remaining, index},
      CPrimitive{Release{advice}}
    )
    case PDeliveryRechecked{+finish, _, +remaining, +index} RFindings{_, _}: flow_update_deliveries(
      remaining,
      invocation,
      next,
      finish,
      index
    )
    case PDeliveryReleased{+finish, +remaining, +index} RPrimitive{Ack{}}: flow_update_deliveries(
      remaining,
      invocation,
      next,
      finish,
      index
    )
    case PContentRead{+finish, +advice, +remaining, +contents} RHandle{+content}: flow_response_contents(
      remaining,
      invocation,
      next,
      finish,
      ResponseItem{advice, content} <> contents
    )
    case PResponseRead{+finish, +remaining, +findings} RItems{+items}: flow_response_findings(
      remaining,
      invocation,
      next,
      finish,
      List.concat(&2, Nat, [findings, items])
    )
    case PClosed{+phase, +command} RPrimitive{Ack{}}: flow_issue(invocation, next, phase, command)
    case _ _: FlowRejected{}

def flow_correlated(
  +matches: Bool,
  +invocation: Nat,
  +next: Nat,
  +phase: FlowPhase,
  +response: FlowResponse
) -> FlowStep:
  match matches:
    case True{}: flow_phase_response(invocation, Nat.add(next, 1n), phase, response)
    case False{}: FlowRejected{}

def collect_resume(+step: FlowStep, +reply: FlowReply) -> FlowStep:
  match step reply:
    case FlowAwait{FlowState{+invocation, +next, +phase}, _} FlowReply{+actual, +id, +response}:
      flow_correlated(
        Bool.and(Nat.is_eq(invocation, actual), Nat.is_eq(next, id)),
        invocation,
        next,
        phase,
        response
      )
    case _ _: FlowRejected{}

def collect_atomic(+step: FlowStep) -> Bool:
  match step:
    case FlowAwait{FlowState{_, _, PSelection{+inner}}, _}: atomic(inner)
    case _: False{}
