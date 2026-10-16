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
