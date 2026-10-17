import Base
import ../Collection.bend as C

# Draft behavioral reference for the complete collection stage; no proof claim.
# Ordering is specified from the former TS collection passes, eligibility and
# handoff workflows (before 16965d0b / 03d81ca1). C contributes data types only.
# Native advice/stream handles, Canonical decisions and Fit results are observations.
# Fitting/formatting internals and physical cleanup are separate port obligations.

def emit(+inv: Nat, +id: Nat, +phase: C.Phase, +command: C.Command) -> C.Step:
  C.Await{C.State{inv, id, phase}, C.Request{inv, id, command}}

def selection_spec_initial(+inv: Nat, +candidates: List<&2, Nat>) -> C.Step:
  emit(inv, 1n, C.Token{candidates}, C.AllocateToken{})

def token(+selection: C.Selection) -> Nat:
  match selection:
    case C.Selection{+value, _}: value

def barrier(+inv: Nat, +id: Nat, +selection: C.Selection, +advice: Nat) -> C.Step:
  match selection:
    case C.Selection{_, C.Pass{+final, _, _, _}}:
      emit(inv, id, C.BarrierPassed{selection, advice}, C.Barrier{advice, final})

def final_start(+inv: Nat, +id: Nat, +lease: Nat, +candidates: List<&2, Nat>) -> C.Step:
  match candidates:
    case Nil{}: C.Empty{}
    case +first <> +rest:
      barrier(inv, id, C.Selection{lease, C.Pass{True{}, rest, [], []}}, first)

# First pass refreshes and reserves; second pass uses selected pointers directly.
def pass_next(+inv: Nat, +id: Nat, +selection: C.Selection) -> C.Step:
  match selection:
    case C.Selection{+lease, C.Pass{False{}, +candidate <> +rest, +selected, +retained}}:
      emit(
        inv,
        id,
        C.FreshOpening{C.Selection{lease, C.Pass{False{}, rest, selected, retained}}, candidate},
        C.OpenFresh{candidate}
      )
    case C.Selection{+lease, C.Pass{True{}, +candidate <> +rest, +selected, +retained}}:
      barrier(inv, id, C.Selection{lease, C.Pass{True{}, rest, selected, retained}}, candidate)
    case C.Selection{_, C.Pass{_, Nil{}, Nil{}, _}}: C.Empty{}
    case C.Selection{+lease, C.Pass{False{}, Nil{}, +selected, _}}:
      final_start(inv, id, lease, List.reverse(&2, Nat, selected))
    case C.Selection{+lease, C.Pass{True{}, Nil{}, +selected, _}}:
      C.Selected{lease, List.reverse(&2, Nat, selected)}

def close(
  +inv: Nat,
  +id: Nat,
  +selection: C.Selection,
  +stream: Nat,
  +after: C.AfterClose
) -> C.Step:
  emit(inv, id, C.Closing{selection, after}, C.CloseStream{stream})

def fresh_pull(
  +inv: Nat,
  +id: Nat,
  +selection: C.Selection,
  +stream: Nat,
  +candidate: Nat
) -> C.Step:
  emit(inv, id, C.FreshPulling{selection, stream, candidate}, C.PullFresh{stream, candidate})

def retained_pull(
  +inv: Nat,
  +id: Nat,
  +selection: C.Selection,
  +stream: Nat,
  +advice: Nat
) -> C.Step:
  emit(inv, id, C.RetainedPulling{selection, stream, advice}, C.PullRetained{stream, advice})

def finding_pull(+inv: Nat, +id: Nat, +selection: C.Selection, +advice: Nat,
    +stream: Nat, +findings: List<&2, Nat>) -> C.Step:
  emit(inv, id, C.FindingsPulling{selection, advice, stream, findings}, C.PullFinding{stream})

def fit_after_close(
  +inv: Nat,
  +id: Nat,
  +selection: C.Selection,
  +advice: Nat,
  +reversed: List<&2, Nat>
) -> C.Step:
  match selection:
    case C.Selection{_, C.Pass{_, _, _, +retained}}:
      emit(
        inv,
        id,
        C.Fitted{selection, advice},
        C.Fit{advice, retained, List.reverse(&2, Nat, reversed)}
      )

def after_close(+inv: Nat, +id: Nat, +selection: C.Selection, +after: C.AfterClose) -> C.Step:
  match after:
    case C.ReserveFresh{+advice}: emit(
      inv,
      id,
      C.Reserving{selection, advice},
      C.Reserve{advice, token(selection)}
    )
    case C.NextAdvice{}: pass_next(inv, id, selection)
    case C.ReadOwned{+advice}: emit(
      inv,
      id,
      C.DeliveryRead{selection, advice},
      C.ReadDelivery{advice, token(selection)}
    )
    case C.FitFindings{+advice, +findings}: fit_after_close(inv, id, selection, advice, findings)

def limited_next(+inv: Nat, +id: Nat, +selection: C.Selection, +advice: Nat,
    +findings: List<&2, Nat>, +remaining: Nat) -> C.Step:
  match remaining:
    case 0n: emit(
      inv,
      id,
      C.PostChecked{selection, advice, findings},
      C.PostCheck{Bool.not(List.is_empty(&2, Nat, findings))}
    )
    case 1n++rest: emit(
      inv,
      id,
      C.LimitedRecorded{selection, advice, findings, rest},
      C.RecordLimited{advice}
    )

def update(
  +inv: Nat,
  +id: Nat,
  +selection: C.Selection,
  +advice: Nat,
  +findings: List<&2, Nat>
) -> C.Step:
  emit(
    inv,
    id,
    C.Updated{selection, advice, findings},
    C.Update{advice, token(selection), findings}
  )

def retained(
  +inv: Nat,
  +id: Nat,
  +selection: C.Selection,
  +advice: Nat,
  +findings: List<&2, Nat>
) -> C.Step:
  match selection:
    case C.Selection{+lease, C.Pass{True{}, _, _, _}}:
      emit(inv, id, C.FinalDeliveryRead{selection, advice, findings}, C.ReadDelivery{advice, lease})
    case _: update(inv, id, selection, advice, findings)

def pass_recorded(
  +inv: Nat,
  +id: Nat,
  +selection: C.Selection,
  +advice: Nat,
  +findings: List<&2, Nat>
) -> C.Step:
  match selection:
    case C.Selection{+lease, C.Pass{+final, +remaining, +selected, +prior}}:
      pass_next(
        inv,
        id,
        C.Selection{
          lease,
          C.Pass{final, remaining, advice <> selected, List.append(&2, Nat, prior, findings)}
        }
      )

def selection_response(+inv: Nat, +id: Nat, +phase: C.Phase, +response: C.Response) -> C.Step:
  match phase response:
    case C.Token{+candidates} C.Handle{+lease}: pass_next(
      inv,
      id,
      C.Selection{lease, C.Pass{False{}, candidates, [], []}}
    )
    case C.FreshOpening{+selection, +candidate} C.Handle{+stream}: fresh_pull(
      inv,
      id,
      selection,
      stream,
      candidate
    )
    case C.FreshPulling{+selection, +stream, _} C.Fresh{+advice, True{}, True{}}:
      close(inv, id, selection, stream, C.ReserveFresh{advice})
    case C.FreshPulling{+selection, +stream, +candidate} C.Fresh{_, _, _}:
      fresh_pull(inv, id, selection, stream, candidate)
    case C.FreshPulling{+selection, +stream, _} C.Exhausted{}: close(
      inv,
      id,
      selection,
      stream,
      C.NextAdvice{}
    )
    case C.Closing{+selection, +after} C.Ack{}: after_close(inv, id, selection, after)
    case C.Reserving{+selection, +advice} C.Truth{True{}}: barrier(inv, id, selection, advice)
    case C.Reserving{+selection, _} C.Truth{False{}}: pass_next(inv, id, selection)
    case C.BarrierPassed{+selection, +advice} C.Ack{}:
      emit(inv, id, C.RetainedOpening{selection, advice}, C.OpenRetained{advice})
    case C.RetainedOpening{+selection, +advice} C.Handle{+stream}: retained_pull(
      inv,
      id,
      selection,
      stream,
      advice
    )
    case C.RetainedPulling{+selection, +stream, +advice} C.Owner{False{}, _}:
      retained_pull(inv, id, selection, stream, advice)
    case C.RetainedPulling{+selection, +stream, _} C.Owner{True{}, False{}}:
      close(inv, id, selection, stream, C.NextAdvice{})
    case C.RetainedPulling{+selection, +stream, +advice} C.Owner{True{}, True{}}:
      close(inv, id, selection, stream, C.ReadOwned{advice})
    case C.RetainedPulling{+selection, +stream, _} C.Exhausted{}: close(
      inv,
      id,
      selection,
      stream,
      C.NextAdvice{}
    )
    case C.DeliveryRead{+selection, +advice} C.Content{+content, True{}}:
      emit(inv, id, C.WorkChecked{selection, advice, content}, C.CheckWork{advice})
    case C.DeliveryRead{+selection, _} C.Content{_, False{}}: pass_next(inv, id, selection)
    case C.WorkChecked{+selection, +advice, +content} C.Truth{True{}}:
      emit(inv, id, C.FindingsOpening{selection, advice}, C.OpenFindings{advice, content})
    case C.WorkChecked{+selection, +advice, _} C.Truth{False{}}:
      emit(inv, id, C.StaleRemoved{selection}, C.RemoveStale{advice, token(selection)})
    case C.StaleRemoved{+selection} C.Ack{}: pass_next(inv, id, selection)
    case C.FindingsOpening{+selection, +advice} C.Handle{+stream}: finding_pull(
      inv,
      id,
      selection,
      advice,
      stream,
      []
    )
    case C.FindingsPulling{+selection, +advice, +stream, +findings} C.Exhausted{}:
      close(inv, id, selection, stream, C.FitFindings{advice, findings})
    case C.FindingsPulling{+selection, +advice, +stream, +findings} C.Handle{+finding}:
      emit(
        inv,
        id,
        C.SuppressionChecked{selection, advice, stream, finding, findings},
        C.Suppressed{advice, stream, finding}
      )
    case C.SuppressionChecked{+selection, +advice, +stream, +finding, +findings} C.Truth{True{}}:
      emit(
        inv,
        id,
        C.SuppressionObserved{selection, advice, stream, findings},
        C.ObserveSuppressed{advice, finding}
      )
    case C.SuppressionChecked{+selection, +advice, +stream, +finding, +findings} C.Truth{False{}}:
      finding_pull(inv, id, selection, advice, stream, finding <> findings)
    case C.SuppressionObserved{+selection, +advice, +stream, +findings} C.Ack{}:
      finding_pull(inv, id, selection, advice, stream, findings)
    case C.Fitted{+selection, +advice} C.Fitting{+findings, +remaining}:
      limited_next(inv, id, selection, advice, findings, remaining)
    case C.LimitedRecorded{+selection, +advice, +findings, +remaining} C.Ack{}:
      limited_next(inv, id, selection, advice, findings, remaining)
    case C.PostChecked{+selection, +advice, +findings} C.Route{C.Retain{}}: retained(
      inv,
      id,
      selection,
      advice,
      findings
    )
    case C.PostChecked{+selection, +advice, _} C.Route{C.Retire{}}:
      emit(inv, id, C.Disposed{selection}, C.Remove{advice, token(selection)})
    case C.PostChecked{+selection, +advice, _} C.Route{_}: emit(
      inv,
      id,
      C.Disposed{selection},
      C.Release{advice}
    )
    case C.Disposed{+selection} C.Ack{}: pass_next(inv, id, selection)
    case C.FinalDeliveryRead{+selection, +advice, +findings} C.Content{_, True{}}: update(
      inv,
      id,
      selection,
      advice,
      findings
    )
    case C.FinalDeliveryRead{+selection, _, _} C.Content{_, False{}}: pass_next(inv, id, selection)
    case C.Updated{+selection, +advice, +findings} C.Ack{}: pass_recorded(
      inv,
      id,
      selection,
      advice,
      findings
    )
    case _ _: C.Rejected{}

def selection_accept(
  +valid: Bool,
  +inv: Nat,
  +id: Nat,
  +phase: C.Phase,
  +response: C.Response
) -> C.Step:
  match valid:
    case False{}: C.Rejected{}
    case True{}: selection_response(inv, Nat.add(id, 1n), phase, response)

# Current scalar contract correlates the State header, not the duplicate Request.
def selection_spec_resume(+step: C.Step, +reply: C.Reply) -> C.Step:
  match step reply:
    case C.Await{C.State{+inv, +id, +phase}, _} C.Reply{+actual, +received, +response}:
      selection_accept(
        Bool.and(Nat.is_eq(inv, actual), Nat.is_eq(id, received)),
        inv,
        id,
        phase,
        response
      )
    case _ _: C.Rejected{}

def selection_spec_atomic(+step: C.Step) -> Bool:
  match step:
    case C.Await{C.State{_, _, C.Fitted{_, _}}, _}: True{}
    case C.Await{C.State{_, _, C.LimitedRecorded{_, _, _, _}}, _}: True{}
    case _: False{}

# Outer collection: capture/prelude, complete eligibility writes then reads,
# stable insertion, both validated passes, and final lease/output observations.
def flow_emit(+inv: Nat, +id: Nat, +phase: C.FlowPhase, +command: C.FlowCommand) -> C.FlowStep:
  C.FlowAwait{C.FlowState{inv, id, phase}, C.FlowRequest{inv, id, command}}

def collection_spec_initial(+inv: Nat, +composed: Bool, +turn_end: Bool) -> C.FlowStep:
  flow_emit(inv, 1n, C.PFrame{composed, turn_end}, C.CCaptureFrame{})

def flow_close(
  +inv: Nat,
  +id: Nat,
  +stream: Nat,
  +phase: C.FlowPhase,
  +command: C.FlowCommand
) -> C.FlowStep:
  flow_emit(inv, id, C.PClosed{phase, command}, C.CPrimitive{C.CloseStream{stream}})

def selecting(+inv: Nat, +id: Nat, +step: C.Step) -> C.FlowStep:
  match step:
    case C.Await{_, C.Request{_, _, +command}}: flow_emit(
      inv,
      id,
      C.PSelection{step},
      C.CPrimitive{command}
    )
    case C.Selected{+lease, +advice}: flow_emit(
      inv,
      id,
      C.PFinalClock{lease, advice},
      C.CHandoffClock{}
    )
    case C.Empty{}: C.FlowEmpty{}
    case C.Rejected{}: C.FlowRejected{}

def selection_reply(+inv: Nat, +id: Nat, +step: C.Step, +response: C.Response) -> C.FlowStep:
  match step:
    case C.Await{_, C.Request{+owner, +request, _}}:
      selecting(inv, id, selection_spec_resume(step, C.Reply{owner, request, response}))
    case _: C.FlowRejected{}

def insertion_compare(+inv: Nat, +id: Nat, +item: Nat, +remaining: List<&2, Nat>,
    +left_reversed: List<&2, Nat>, +right: List<&2, Nat>) -> C.FlowStep:
  match left_reversed:
    case Nil{}: C.FlowRejected{}
    case +left <> +rest:
      flow_emit(
        inv,
        id,
        C.PInsertCompared{item, remaining, left, rest, right},
        C.CCompare{left, item}
      )

def insertion_next(
  +remaining: List<&2, Nat>,
  +inv: Nat,
  +id: Nat,
  +ordered: List<&2, Nat>
) -> C.FlowStep:
  match remaining:
    case Nil{}: selecting(inv, id, selection_spec_initial(inv, ordered))
    case +item <> +rest: insertion_compare(inv, id, item, rest, List.reverse(&2, Nat, ordered), [])

def ordered_start(+inv: Nat, +id: Nat, +items: List<&2, Nat>) -> C.FlowStep:
  match items:
    case Nil{}: selecting(inv, id, selection_spec_initial(inv, []))
    case +first <> +rest: insertion_next(rest, inv, id, [first])

def eligibility_reads(
  +remaining: List<&2, Nat>,
  +inv: Nat,
  +id: Nat,
  +reversed: List<&2, Nat>
) -> C.FlowStep:
  match remaining:
    case Nil{}: ordered_start(inv, id, List.reverse(&2, Nat, reversed))
    case +advice <> +rest: flow_emit(
      inv,
      id,
      C.PEligibilityRead{advice, rest, reversed},
      C.CReadEligibility{advice}
    )

def eligibility_writes(
  +remaining: List<&2, Nat>,
  +inv: Nat,
  +id: Nat,
  +all: List<&2, Nat>
) -> C.FlowStep:
  match remaining:
    case Nil{}: eligibility_reads(all, inv, id, [])
    case +advice <> +rest: flow_emit(
      inv,
      id,
      C.PEligibilitySet{rest, all},
      C.CSetEligibility{advice}
    )

def candidate_check(
  +inv: Nat,
  +id: Nat,
  +candidate: C.Candidate,
  +unsuppressed: Bool
) -> C.FlowStep:
  match candidate:
    case C.Candidate{+scan, +advice, +same, +unleased, +authority}:
      flow_emit(
        inv,
        id,
        C.PCandidateChecked{scan, advice},
        C.CCandidateCheck{same, unleased, unsuppressed, authority}
      )

def candidate_advice(+candidate: C.Candidate) -> Nat:
  match candidate:
    case C.Candidate{_, +advice, _, _, _}: advice

def scan_stream(+scan: C.CandidateScan) -> Nat:
  match scan:
    case C.CandidateScan{+stream, _}: stream

def scan_token(+scan: C.HandoffScan) -> Nat:
  match scan:
    case C.HandoffScan{+lease, _, _}: lease

def offers_next(+remaining: List<&2, Nat>, +inv: Nat, +id: Nat, +lease: Nat,
    +advice: List<&2, Nat>, +offers: List<&2, Nat>) -> C.FlowStep:
  match remaining:
    case Nil{}: flow_emit(inv, id, C.PHandoffFitted{lease, advice, offers}, C.CFitHandoff{offers})
    case +item <> +rest: flow_emit(
      inv,
      id,
      C.POffersRead{lease, advice, rest, offers},
      C.CHandoffOffers{item}
    )

def handoff_next(+inv: Nat, +id: Nat, +scan: C.HandoffScan) -> C.FlowStep:
  match scan:
    case C.HandoffScan{+lease, +advice <> +rest, +retained}:
      flow_emit(
        inv,
        id,
        C.POwnersOpen{C.HandoffScan{lease, rest, retained}, advice},
        C.COpenAdvice{False{}}
      )
    case C.HandoffScan{+lease, Nil{}, +retained}:
      offers_next(
        List.reverse(&2, Nat, retained),
        inv,
        id,
        lease,
        List.reverse(&2, Nat, retained),
        []
      )

def response_findings(+remaining: List<&2, C.ResponseItem>, +inv: Nat, +id: Nat,
    +finish: C.Finish, +findings: List<&2, Nat>) -> C.FlowStep:
  match remaining finish:
    case Nil{} C.Finish{+lease, +advice, _}: C.FlowDone{lease, advice, findings}
    case C.ResponseItem{+advice, +content} <> +rest _:
      flow_emit(
        inv,
        id,
        C.PResponseRead{finish, rest, findings},
        C.CResponseFindings{advice, content}
      )

def response_contents(+remaining: List<&2, Nat>, +inv: Nat, +id: Nat,
    +finish: C.Finish, +reversed: List<&2, C.ResponseItem>) -> C.FlowStep:
  match remaining:
    case Nil{}: response_findings(List.reverse(&2, C.ResponseItem, reversed), inv, id, finish, [])
    case +advice <> +rest: flow_emit(
      inv,
      id,
      C.PContentRead{finish, advice, rest, reversed},
      C.CResponseContent{advice}
    )

def deliveries_next(
  +remaining: List<&2, Nat>,
  +inv: Nat,
  +id: Nat,
  +finish: C.Finish,
  +index: Nat
) -> C.FlowStep:
  match remaining finish:
    case Nil{} C.Finish{_, +advice, _}: response_contents(advice, inv, id, finish, [])
    case +advice <> +rest _: flow_emit(
      inv,
      id,
      C.PDeliveryRead{finish, advice, rest, index},
      C.CDeliveryFindings{advice}
    )

def limited_offers(+remaining: List<&2, Nat>, +inv: Nat, +id: Nat, +finish: C.Finish) -> C.FlowStep:
  match remaining finish:
    case Nil{} C.Finish{_, +advice, _}: deliveries_next(advice, inv, id, finish, 0n)
    case +offer <> +rest _: flow_emit(
      inv,
      id,
      C.PLimitedReported{finish, rest},
      C.CHandoffLimited{offer}
    )

def include_finding(+include: Bool, +finding: Nat, +rest: C.Filtered) -> C.Filtered:
  match include rest:
    case True{} C.Filtered{+index, +items}: C.Filtered{index, finding <> items}
    case False{} +value: value

def filtered_findings(
  +findings: List<&2, Nat>,
  +accepted: List<&2, Nat>,
  +index: Nat
) -> C.Filtered:
  match findings:
    case Nil{}: C.Filtered{index, []}
    case +finding <> +rest:
      include_finding(List.contains(~Nat, ~Nat.is_eq, accepted, index), finding,
        filtered_findings(rest, accepted, Nat.add(index, 1n)))

def delivery_update(+inv: Nat, +id: Nat, +finish: C.Finish, +advice: Nat,
    +remaining: List<&2, Nat>, +filtered: C.Filtered) -> C.FlowStep:
  match finish filtered:
    case C.Finish{+lease, _, _} C.Filtered{+index, +findings}:
      flow_emit(
        inv,
        id,
        C.PDeliveryUpdated{finish, advice, remaining, index},
        C.CPrimitive{C.Update{advice, lease, findings}}
      )

def accepted_indices(+finish: C.Finish) -> List<&2, Nat>:
  match finish:
    case C.Finish{_, _, +indices}: indices

def inspect(
  +inv: Nat,
  +id: Nat,
  +scan: C.HandoffScan,
  +advice: Nat,
  +info: Nat,
  +delivery: Bool
) -> C.FlowStep:
  flow_emit(inv, id, C.PExpiryRead{scan, advice, info, delivery}, C.CCheckExpiry{advice})

# Each equation records the next observable operation of residentCollect.
def flow_response(+inv: Nat, +id: Nat, +phase: C.FlowPhase, +reply: C.FlowResponse) -> C.FlowStep:
  match phase reply:
    case C.PFrame{True{}, +last} C.RAck{}: flow_emit(inv, id, C.PDeciding{last}, C.CReadDeciding{})
    case C.PFrame{False{}, _} C.RAck{}: flow_emit(inv, id, C.PStopSet{}, C.CSetStop{False{}})
    case C.PDeciding{False{}} C.RTruth{True{}}: C.FlowEmpty{}
    case C.PDeciding{True{}} C.RTruth{+value}: flow_emit(inv, id, C.PStopSet{}, C.CSetStop{value})
    case C.PDeciding{False{}} C.RTruth{False{}}: flow_emit(
      inv,
      id,
      C.PStopSet{},
      C.CSetStop{False{}}
    )
    case C.PStopSet{} C.RAck{}: flow_emit(inv, id, C.PExpired{}, C.CExpirePending{})
    case C.PExpired{} C.RAck{}: flow_emit(inv, id, C.PPruned{}, C.CPruneNotices{})
    case C.PPruned{} C.RAck{}: flow_emit(inv, id, C.PCredentialCaptured{}, C.CCaptureCredential{})
    case C.PCredentialCaptured{} C.RAck{}: flow_emit(
      inv,
      id,
      C.PCredentialsOpen{},
      C.COpenAdvice{True{}}
    )
    case C.PCredentialsOpen{} C.RHandle{+stream}: flow_emit(
      inv,
      id,
      C.PCredentialsPull{stream},
      C.CPullAdvice{stream}
    )
    case C.PCredentialsPull{+stream} C.RAdvice{+advice}: flow_emit(
      inv,
      id,
      C.PCredentialChecked{stream, advice},
      C.CCheckCredential{advice}
    )
    case C.PCredentialChecked{+stream, _} C.RTruth{True{}}: flow_emit(
      inv,
      id,
      C.PCredentialsPull{stream},
      C.CPullAdvice{stream}
    )
    case C.PCredentialChecked{+stream, +advice} C.RTruth{False{}}: flow_emit(
      inv,
      id,
      C.PCredentialRemoved{stream},
      C.CRemoveCredential{advice}
    )
    case C.PCredentialRemoved{+stream} C.RAck{}: flow_emit(
      inv,
      id,
      C.PCredentialsPull{stream},
      C.CPullAdvice{stream}
    )
    case C.PCredentialsPull{+stream} C.RExhausted{}: flow_close(
      inv,
      id,
      stream,
      C.PLeasesOpen{},
      C.COpenSnapshots{}
    )
    case C.PLeasesOpen{} C.RHandle{+stream}: flow_emit(
      inv,
      id,
      C.PLeasesPull{stream},
      C.CPullSnapshot{stream}
    )
    case C.PLeasesPull{+stream} C.RSnapshot{+advice, _, True{}}: flow_emit(
      inv,
      id,
      C.PLeaseChecked{stream},
      C.CCheckLease{advice}
    )
    case C.PLeasesPull{+stream} C.RSnapshot{_, _, False{}}: flow_emit(
      inv,
      id,
      C.PLeasesPull{stream},
      C.CPullSnapshot{stream}
    )
    case C.PLeaseChecked{+stream} C.RAck{}: flow_emit(
      inv,
      id,
      C.PLeasesPull{stream},
      C.CPullSnapshot{stream}
    )
    case C.PLeasesPull{+stream} C.RExhausted{}: flow_close(
      inv,
      id,
      stream,
      C.PCandidatesOpen{},
      C.COpenSnapshots{}
    )
    case C.PCandidatesOpen{} C.RHandle{+stream}: flow_emit(
      inv,
      id,
      C.PCandidatesPull{C.CandidateScan{stream, []}},
      C.CPullSnapshot{stream}
    )
    case C.PCandidatesPull{+scan} C.RSnapshot{+advice, +content, _}: flow_emit(
      inv,
      id,
      C.PCandidateRead{scan, advice, content},
      C.CCandidateFacts{advice, content}
    )
    case C.PCandidatesPull{C.CandidateScan{+stream, +available}} C.RExhausted{}: flow_emit(
      inv,
      id,
      C.PCandidatesClosed{available},
      C.CPrimitive{C.CloseStream{stream}}
    )
    case C.PCandidatesClosed{+available} C.RPrimitive{C.Ack{}}: eligibility_writes(
      List.reverse(&2, Nat, available),
      inv,
      id,
      List.reverse(&2, Nat, available)
    )
    case C.PCandidateRead{+scan, +advice, +content} C.RCandidate{True{}, True{}, +authority}: flow_emit(
      inv,
      id,
      C.PCandidateFindingsOpen{C.Candidate{scan, advice, True{}, True{}, authority}},
      C.CPrimitive{C.OpenFindings{advice, content}}
    )
    case C.PCandidateRead{+scan, +advice, _} C.RCandidate{+same, +unleased, +authority}: candidate_check(
      inv,
      id,
      C.Candidate{scan, advice, same, unleased, authority},
      False{}
    )
    case C.PCandidateFindingsOpen{+candidate} C.RPrimitive{C.Handle{+stream}}: flow_emit(
      inv,
      id,
      C.PCandidateFinding{candidate, stream},
      C.CPrimitive{C.PullFinding{stream}}
    )
    case C.PCandidateFinding{+candidate, +stream} C.RPrimitive{C.Handle{+finding}}: flow_emit(
      inv,
      id,
      C.PCandidateSuppression{candidate, stream, finding},
      C.CPrimitive{C.Suppressed{candidate_advice(candidate), stream, finding}}
    )
    case C.PCandidateFinding{C.Candidate{+scan, +advice, +same, +unleased, +authority}, +stream} C.RPrimitive{
      C.Exhausted{}
    }: flow_close(
      inv,
      id,
      stream,
      C.PCandidateChecked{scan, advice},
      C.CCandidateCheck{same, unleased, False{}, authority}
    )
    case C.PCandidateSuppression{
      C.Candidate{+scan, +advice, +same, +unleased, +authority},
      +stream,
      _
    } C.RPrimitive{C.Truth{False{}}}: flow_close(
      inv,
      id,
      stream,
      C.PCandidateChecked{scan, advice},
      C.CCandidateCheck{same, unleased, True{}, authority}
    )
    case C.PCandidateSuppression{+candidate, +stream, +finding} C.RPrimitive{C.Truth{True{}}}: flow_emit(
      inv,
      id,
      C.PCandidateObserved{candidate, stream},
      C.CPrimitive{C.ObserveSuppressed{candidate_advice(candidate), finding}}
    )
    case C.PCandidateObserved{+candidate, +stream} C.RPrimitive{C.Ack{}}: flow_emit(
      inv,
      id,
      C.PCandidateFinding{candidate, stream},
      C.CPrimitive{C.PullFinding{stream}}
    )
    case C.PCandidateChecked{C.CandidateScan{+stream, +available}, +advice} C.RTruth{True{}}: flow_emit(
      inv,
      id,
      C.PCandidatesPull{C.CandidateScan{stream, advice <> available}},
      C.CPullSnapshot{stream}
    )
    case C.PCandidateChecked{+scan, _} C.RTruth{False{}}: flow_emit(
      inv,
      id,
      C.PCandidatesPull{scan},
      C.CPullSnapshot{scan_stream(scan)}
    )
    case C.PEligibilitySet{+remaining, +available} C.RAck{}: eligibility_writes(
      remaining,
      inv,
      id,
      available
    )
    case C.PEligibilityRead{+advice, +remaining, +eligible} C.RTruth{True{}}: eligibility_reads(
      remaining,
      inv,
      id,
      advice <> eligible
    )
    case C.PEligibilityRead{_, +remaining, +eligible} C.RTruth{False{}}: eligibility_reads(
      remaining,
      inv,
      id,
      eligible
    )
    case C.PInsertCompared{+item, +remaining, +left, +prefix, +suffix} C.RTruth{False{}}: insertion_next(
      remaining,
      inv,
      id,
      List.append(&2, Nat, List.reverse(&2, Nat, left <> prefix), item <> suffix)
    )
    case C.PInsertCompared{+item, +remaining, +left, Nil{}, +suffix} C.RTruth{True{}}: insertion_next(
      remaining,
      inv,
      id,
      item <> left <> suffix
    )
    case C.PInsertCompared{+item, +remaining, +left, +prefix, +suffix} C.RTruth{True{}}: insertion_compare(
      inv,
      id,
      item,
      remaining,
      prefix,
      left <> suffix
    )
    case C.PSelection{+step} C.RPrimitive{+response}: selection_reply(inv, id, step, response)
    case C.PFinalClock{+lease, +advice} C.RAck{}: handoff_next(
      inv,
      id,
      C.HandoffScan{lease, advice, []}
    )
    case C.POwnersOpen{+scan, +advice} C.RHandle{+stream}: flow_emit(
      inv,
      id,
      C.POwnersPull{scan, advice, stream},
      C.CPullOwner{stream, advice}
    )
    case C.POwnersPull{+scan, +advice, +stream} C.ROwner{_, False{}}: flow_emit(
      inv,
      id,
      C.POwnersPull{scan, advice, stream},
      C.CPullOwner{stream, advice}
    )
    case C.POwnersPull{+scan, +advice, +stream} C.ROwner{+retained, True{}}: flow_close(
      inv,
      id,
      stream,
      C.PInfoRead{scan, advice},
      C.CHandoffInfo{advice, Some{retained}, scan_token(scan)}
    )
    case C.POwnersPull{+scan, +advice, +stream} C.RExhausted{}: flow_close(
      inv,
      id,
      stream,
      C.PInfoRead{scan, advice},
      C.CHandoffInfo{advice, None{}, scan_token(scan)}
    )
    case C.PInfoRead{+scan, +advice} C.RInfo{+info, True{}, True{}, +delivery}: flow_emit(
      inv,
      id,
      C.PCredentialMetadataRead{scan, advice, info, delivery},
      C.CCredentialMetadata{advice}
    )
    case C.PInfoRead{+scan, +advice} C.RInfo{+info, _, _, +delivery}: flow_emit(
      inv,
      id,
      C.PFinalRouted{scan, advice, delivery},
      C.CFinalRoute{info, True{}, False{}, False{}}
    )
    case C.PCredentialMetadataRead{+scan, +advice, +info, +delivery} C.RCredentialMetadata{
      True{},
      _
    }: inspect(inv, id, scan, advice, info, delivery)
    case C.PCredentialMetadataRead{+scan, +advice, +info, +delivery} C.RCredentialMetadata{
      False{},
      +environment
    }: flow_emit(
      inv,
      id,
      C.PCredentialStateRead{scan, advice, info, delivery, environment},
      C.CReadCredential{}
    )
    case C.PCredentialStateRead{+scan, +advice, +info, +delivery, True{}} C.RCredentialState{
      True{},
      True{},
      _
    }: inspect(inv, id, scan, advice, info, delivery)
    case C.PCredentialStateRead{+scan, +advice, +info, +delivery, False{}} C.RCredentialState{
      True{},
      True{},
      False{}
    }: inspect(inv, id, scan, advice, info, delivery)
    case C.PCredentialStateRead{+scan, +advice, +info, +delivery, _} C.RCredentialState{_, _, _}: flow_emit(
      inv,
      id,
      C.PFinalRouted{scan, advice, delivery},
      C.CFinalRoute{info, False{}, False{}, False{}}
    )
    case C.PExpiryRead{+scan, +advice, +info, +delivery} C.RTruth{+expired}: flow_emit(
      inv,
      id,
      C.PWorkRead{scan, advice, info, delivery, expired},
      C.CPrimitive{C.CheckWork{advice}}
    )
    case C.PWorkRead{+scan, +advice, +info, +delivery, +expired} C.RPrimitive{C.Truth{+current}}: flow_emit(
      inv,
      id,
      C.PFinalRouted{scan, advice, delivery},
      C.CFinalRoute{info, True{}, expired, current}
    )
    case C.PFinalRouted{+scan, +advice, _} C.RRoute{C.Retire{}}: flow_emit(
      inv,
      id,
      C.PFinalDisposed{scan},
      C.CPrimitive{C.Remove{advice, scan_token(scan)}}
    )
    case C.PFinalRouted{+scan, +advice, _} C.RRoute{C.ReleaseCandidate{}}: flow_emit(
      inv,
      id,
      C.PFinalDisposed{scan},
      C.CPrimitive{C.Release{advice}}
    )
    case C.PFinalRouted{+scan, +advice, True{}} C.RRoute{C.Retain{}}: flow_emit(
      inv,
      id,
      C.PRenewed{scan, advice},
      C.CRenew{advice, scan_token(scan)}
    )
    case C.PFinalRouted{+scan, _, _} C.RRoute{_}: handoff_next(inv, id, scan)
    case C.PFinalDisposed{+scan} C.RPrimitive{C.Ack{}}: handoff_next(inv, id, scan)
    case C.PRenewed{C.HandoffScan{+lease, +remaining, +retained}, +advice} C.RAck{}: handoff_next(
      inv,
      id,
      C.HandoffScan{lease, remaining, advice <> retained}
    )
    case C.POffersRead{+lease, +advice, +remaining, +offers} C.RItems{+items}: offers_next(
      remaining,
      inv,
      id,
      lease,
      advice,
      List.append(&2, Nat, offers, items)
    )
    case C.PHandoffFitted{+lease, +advice, _} C.RFitting{+selected, +limited}: limited_offers(
      limited,
      inv,
      id,
      C.Finish{lease, advice, selected}
    )
    case C.PLimitedReported{+finish, +remaining} C.RAck{}: limited_offers(
      remaining,
      inv,
      id,
      finish
    )
    case C.PDeliveryRead{+finish, +advice, +remaining, +index} C.RFindings{True{}, +findings}: delivery_update(
      inv,
      id,
      finish,
      advice,
      remaining,
      filtered_findings(findings, accepted_indices(finish), index)
    )
    case C.PDeliveryRead{+finish, _, +remaining, +index} C.RFindings{False{}, _}: deliveries_next(
      remaining,
      inv,
      id,
      finish,
      index
    )
    case C.PDeliveryUpdated{+finish, +advice, +remaining, +index} C.RPrimitive{C.Ack{}}: flow_emit(
      inv,
      id,
      C.PDeliveryRechecked{finish, advice, remaining, index},
      C.CDeliveryFindings{advice}
    )
    case C.PDeliveryRechecked{+finish, +advice, +remaining, +index} C.RFindings{True{}, Nil{}}: flow_emit(
      inv,
      id,
      C.PDeliveryReleased{finish, remaining, index},
      C.CPrimitive{C.Release{advice}}
    )
    case C.PDeliveryRechecked{+finish, _, +remaining, +index} C.RFindings{_, _}: deliveries_next(
      remaining,
      inv,
      id,
      finish,
      index
    )
    case C.PDeliveryReleased{+finish, +remaining, +index} C.RPrimitive{C.Ack{}}: deliveries_next(
      remaining,
      inv,
      id,
      finish,
      index
    )
    case C.PContentRead{+finish, +advice, +remaining, +contents} C.RHandle{+content}: response_contents(
      remaining,
      inv,
      id,
      finish,
      C.ResponseItem{advice, content} <> contents
    )
    case C.PResponseRead{+finish, +remaining, +findings} C.RItems{+items}: response_findings(
      remaining,
      inv,
      id,
      finish,
      List.append(&2, Nat, findings, items)
    )
    case C.PClosed{+following, +command} C.RPrimitive{C.Ack{}}: flow_emit(
      inv,
      id,
      following,
      command
    )
    case _ _: C.FlowRejected{}

def flow_accept(
  +valid: Bool,
  +inv: Nat,
  +id: Nat,
  +phase: C.FlowPhase,
  +response: C.FlowResponse
) -> C.FlowStep:
  match valid:
    case True{}: flow_response(inv, Nat.add(id, 1n), phase, response)
    case False{}: C.FlowRejected{}

def collection_spec_resume(+step: C.FlowStep, +reply: C.FlowReply) -> C.FlowStep:
  match step reply:
    case C.FlowAwait{C.FlowState{+inv, +id, +phase}, _} C.FlowReply{+actual, +request, +response}:
      flow_accept(
        Bool.and(Nat.is_eq(inv, actual), Nat.is_eq(id, request)),
        inv,
        id,
        phase,
        response
      )
    case _ _: C.FlowRejected{}

def collection_spec_atomic(+step: C.FlowStep) -> Bool:
  match step:
    case C.FlowAwait{C.FlowState{_, _, C.PSelection{+inner}}, _}: selection_spec_atomic(inner)
    case _: False{}
