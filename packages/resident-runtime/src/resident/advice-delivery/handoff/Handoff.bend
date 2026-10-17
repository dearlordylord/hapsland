import Base

# Final authorization and fitting retain one ordered cursor. Native handles name
# actual advice, immutable contents, findings, notices and response values.
type FRequestKind is Data:
  FOtherRequest{}
  FEditCollect{}
  FSharedCollect{composed: Bool, claude: Bool, turn_end: Bool, finish: Bool, report: Bool}
type FResponseKind is Data:
  FAdviceResponse{}
  FEmptyResponse{}
  FPendingResponse{}
  FOtherResponse{}
type FAuthority is Data:
  FNoAuthority{}
  FAdvisoryAuthority{}
  FBlockingAuthority{}
type FInput is Data:
  FInput{request: FRequestKind, response: FResponseKind, authority: FAuthority}
type FDisposition is Data:
  FRetain{}
  FRetire{}
  FRelease{}
  FIgnore{}
type FSurface is Data:
  FCodexSurface{}
  FStopSurface{}
  FAdvisorySurface{}
  FBlockingSurface{}
type FCommand is Data:
  FClock{}
  FExpire{}
  FPrune{}
  FWorkState{}
  FCollectorGate{}
  FEditStatus{}
  FAdvice{copy: Bool}
  FDelivery{advice: Nat}
  FCredentialFacts{advice: Nat}
  FCredentialAuthority{advice: Nat}
  FObserveCredential{generation: Bool, authorized: Bool}
  FCredentialGate{collect: Bool, invalid: Bool}
  FReleaseComposed{}
  FSourceCurrent{advice: Nat}
  FRoundActive{advice: Nat}
  FExpired{advice: Nat}
  FWorkCurrent{advice: Nat}
  FRoute{expired: Bool, current: Bool, has_findings: Bool}
  FReleaseAdvice{advice: Nat}
  FRemoveAdvice{advice: Nat}
  FRenewAdvice{advice: Nat}
  FReleaseDelivery{}
  FAllowsBlocking{advice: Nat}
  FPendingFindings{advice: Nat}
  FOffers{advice: Nat}
  FFit{offers: List<&2, Nat>, surface: FSurface}
  FUpdate{advice: Nat, findings: List<&2, Nat>}
  FContent{advice: Nat}
  FContentFindings{advice: Nat, content: Nat}
  FNotices{}
  FOutputFit{findings: List<&2, Nat>, notices: List<&2, Nat>}
  FRenewNotice{notice: Nat}
  FFinalAuthority{blocking: Bool}
  FEmptyResponseValue{}
  FBuildResponse{blocking: Bool, findings: List<&2, Nat>, notices: List<&2, Nat>}
  FObserveMessage{
    response: Nat,
    findings: List<&2, Nat>,
    contents: List<&2, Nat>,
    advice: List<&2, Nat>
  }
type FResponse is Data:
  FAck{}
  FTruth{value: Bool}
  FHandle{handle: Nat}
  FHandles{handles: List<&2, Nat>}
  FOptionalResponse{response: Maybe<&2, Nat>}
  FDeliveryFacts{present: Bool, owned: Bool, findings: List<&2, Nat>, round: Bool, work: Bool}
  FSource{present: Bool, current: Bool}
  FRouted{route: FDisposition}
  FCount{count: Nat}
type FFrame is Data:
  FFrame{input: FInput, advice: List<&2, Nat>, blocking: Bool}
type FCaptured is Data:
  FCaptured{advice: Nat, content: Nat}
type FOutput is Data:
  FOutput{frame: FFrame, contents: List<&2, Nat>, findings: List<&2, Nat>, notices: List<&2, Nat>}
type FFitNext is Data:
  FRecheckMode{}
  FReadOutput{}
type FFiltered is Data:
  FFiltered{index: Nat, findings: List<&2, Nat>}
type FTerminal is Data:
  FOriginal{}
  FEmpty{}
  FLost{}
  FCredentialUnavailable{}
  FResponseHandle{response: Nat}
type FPhase is Data:
  FClockRead{input: FInput}
  FExpiredPending{input: FInput}
  FPruned{input: FInput}
  FNonAdviceGate{}
  FNonAdviceResponse{}
  FCredentialAdvice{input: FInput}
  FCredentialDelivery{input: FInput, advice: Nat, remaining: List<&2, Nat>}
  FCredentialRead{input: FInput, advice: Nat, remaining: List<&2, Nat>}
  FCredentialAuthorityRead{input: FInput, remaining: List<&2, Nat>}
  FCredentialObserved{input: FInput, remaining: List<&2, Nat>}
  FCredentialChecked{input: FInput}
  FCredentialReleased{input: FInput}
  FCandidatesRead{input: FInput}
  FCandidateDelivery{input: FInput, advice: Nat, remaining: List<&2, Nat>, kept: List<&2, Nat>}
  FCandidateSource{input: FInput, advice: Nat, remaining: List<&2, Nat>, kept: List<&2, Nat>}
  FCandidateRound{
    input: FInput,
    advice: Nat,
    remaining: List<&2, Nat>,
    kept: List<&2, Nat>,
    source: Bool
  }
  FCandidateExpiry{
    input: FInput,
    advice: Nat,
    remaining: List<&2, Nat>,
    kept: List<&2, Nat>,
    source: Bool
  }
  FCandidateWork{
    input: FInput,
    advice: Nat,
    remaining: List<&2, Nat>,
    kept: List<&2, Nat>,
    source: Bool,
    expired: Bool
  }
  FCandidateFindings{
    input: FInput,
    advice: Nat,
    remaining: List<&2, Nat>,
    kept: List<&2, Nat>,
    expired: Bool,
    current: Bool
  }
  FCandidateRoute{input: FInput, advice: Nat, remaining: List<&2, Nat>, kept: List<&2, Nat>}
  FCandidateDisposed{input: FInput, remaining: List<&2, Nat>, kept: List<&2, Nat>}
  FCandidateRenewed{input: FInput, advice: Nat, remaining: List<&2, Nat>, kept: List<&2, Nat>}
  FLostReleased{}
  FModeAllowed{
    input: FInput,
    advice: List<&2, Nat>,
    current: Nat,
    remaining: List<&2, Nat>,
    previous: Maybe<&2, Bool>
  }
  FModeDelivery{
    input: FInput,
    advice: List<&2, Nat>,
    remaining: List<&2, Nat>,
    previous: Maybe<&2, Bool>
  }
  FPruneDelivery{frame: FFrame, advice: Nat, remaining: List<&2, Nat>, after: FFitNext}
  FPrunePending{
    frame: FFrame,
    advice: Nat,
    findings: Nat,
    remaining: List<&2, Nat>,
    after: FFitNext
  }
  FPruneReleased{frame: FFrame, remaining: List<&2, Nat>, after: FFitNext}
  FOffersRead{frame: FFrame, remaining: List<&2, Nat>, offers: List<&2, Nat>, after: FFitNext}
  FFitted{frame: FFrame, after: FFitNext}
  FUpdateDelivery{
    frame: FFrame,
    advice: Nat,
    remaining: List<&2, Nat>,
    accepted: List<&2, Nat>,
    index: Nat,
    after: FFitNext
  }
  FUpdated{
    frame: FFrame,
    advice: Nat,
    remaining: List<&2, Nat>,
    accepted: List<&2, Nat>,
    index: Nat,
    empty: Bool,
    after: FFitNext
  }
  FUpdateReleased{
    frame: FFrame,
    remaining: List<&2, Nat>,
    accepted: List<&2, Nat>,
    index: Nat,
    after: FFitNext
  }
  FContentRead{frame: FFrame, advice: Nat, remaining: List<&2, Nat>, contents: List<&2, FCaptured>}
  FFindingsRead{
    frame: FFrame,
    remaining: List<&2, FCaptured>,
    contents: List<&2, Nat>,
    findings: List<&2, Nat>
  }
  FNoticesRead{frame: FFrame, contents: List<&2, Nat>, findings: List<&2, Nat>}
  FOutputChecked{output: FOutput}
  FOutputReleased{}
  FNoticeRenewed{output: FOutput, remaining: List<&2, Nat>}
  FAuthorityGate{output: FOutput}
  FAuthorityReleased{response: Nat}
  FAuthorityChecked{output: FOutput}
  FAuthorityFallbackReleased{}
  FResponseBuilt{output: FOutput}
  FResponseObserved{response: Nat}
type FState is Data:
  FState{invocation: Nat, next: Nat, phase: FPhase}
type FRequest is Data:
  FRequest{invocation: Nat, id: Nat, command: FCommand}
type FReply is Data:
  FReply{invocation: Nat, id: Nat, response: FResponse}
type FStep is Data:
  FAwait{state: FState, request: FRequest}
  FDone{result: FTerminal}
  FRejected{}

def f_collect(+request: FRequestKind) -> Bool:
  match request:
    case FOtherRequest{}: False{}
    case _: True{}

def f_edit(+request: FRequestKind) -> Bool:
  match request:
    case FEditCollect{}: True{}
    case _: False{}

def f_composed(+request: FRequestKind) -> Bool:
  match request:
    case FEditCollect{}: True{}
    case FSharedCollect{+composed, _, _, _, _}: composed
    case _: False{}

def f_stop(+request: FRequestKind) -> Bool:
  match request:
    case FSharedCollect{+composed, +claude, +turn_end, _, _}: Bool.and(
      composed,
      Bool.and(claude, turn_end)
    )
    case _: False{}

def f_shared_work(+request: FRequestKind) -> Bool:
  match request:
    case FSharedCollect{_, _, _, +finish, +report}: Bool.and(Bool.not(finish), report)
    case _: False{}

def f_pending(+response: FResponseKind) -> Bool:
  match response:
    case FEmptyResponse{}: True{}
    case FPendingResponse{}: True{}
    case _: False{}

def f_authority(+authority: FAuthority) -> Bool:
  match authority:
    case FNoAuthority{}: False{}
    case _: True{}

def f_block(+authority: FAuthority) -> Bool:
  match authority:
    case FBlockingAuthority{}: True{}
    case _: False{}

def f_request(+input: FInput) -> FRequestKind:
  match input:
    case FInput{+request, _, _}: request

def f_has_authority(+input: FInput) -> Bool:
  match input:
    case FInput{_, _, +authority}: f_authority(authority)

def f_can_block(+input: FInput) -> Bool:
  match input:
    case FInput{_, _, +authority}: f_block(authority)

def f_frame_input(+frame: FFrame) -> FInput:
  match frame:
    case FFrame{+input, _, _}: input

def f_frame_advice(+frame: FFrame) -> List<&2, Nat>:
  match frame:
    case FFrame{_, +advice, _}: advice

def f_frame_blocking(+frame: FFrame) -> Bool:
  match frame:
    case FFrame{_, _, +blocking}: blocking

def f_surface_blocking(+blocking: Bool) -> FSurface:
  match blocking:
    case True{}: FBlockingSurface{}
    case False{}: FAdvisorySurface{}

def f_surface_shared(+stop: Bool) -> FSurface:
  match stop:
    case True{}: FStopSurface{}
    case False{}: FCodexSurface{}

def f_surface_authority(+present: Bool, +input: FInput, +blocking: Bool) -> FSurface:
  match present:
    case True{}: f_surface_blocking(blocking)
    case False{}: f_surface_shared(f_stop(f_request(input)))

def f_surface(+frame: FFrame) -> FSurface:
  match frame:
    case FFrame{+input, _, +blocking}: f_surface_authority(f_has_authority(input), input, blocking)

def f_frame_input_output(+output: FOutput) -> FInput:
  match output:
    case FOutput{+frame, _, _, _}: f_frame_input(frame)

def f_request_output(+output: FOutput) -> FRequestKind:
  f_request(f_frame_input_output(output))

def f_frame_blocking_output(+output: FOutput) -> Bool:
  match output:
    case FOutput{+frame, _, _, _}: f_frame_blocking(frame)

def f_pending_input(+input: FInput) -> Bool:
  match input:
    case FInput{_, +response, _}: f_pending(response)

def f_issue(+invocation: Nat, +next: Nat, +phase: FPhase, +command: FCommand) -> FStep:
  FAwait{FState{invocation, next, phase}, FRequest{invocation, next, command}}

def f_extend_rev(+items: List<&2, Nat>, +reversed: List<&2, Nat>) -> List<&2, Nat>:
  List.append(&2, Nat, List.reverse(&2, Nat, items), reversed)

def f_filter_item(+keep: Bool, +item: Nat, +filtered: FFiltered) -> FFiltered:
  match keep filtered:
    case True{} FFiltered{+index, +findings}: FFiltered{index, item <> findings}
    case False{} +result: result

def f_filter(+items: List<&2, Nat>, +accepted: List<&2, Nat>, +index: Nat) -> FFiltered:
  match items:
    case Nil{}: FFiltered{index, []}
    case +item <> +rest:
      f_filter_item(List.contains(~Nat, ~Nat.is_eq, accepted, index), item,
        f_filter(rest, accepted, Nat.add(index, 1n)))

def f_observe(+invocation: Nat, +next: Nat, +response: Nat, +output: FOutput) -> FStep:
  match output:
    case FOutput{FFrame{_, +advice, _}, +contents, +findings, _}:
      f_issue(
        invocation,
        next,
        FResponseObserved{response},
        FObserveMessage{response, findings, contents, advice}
      )

def f_build_empty(+edit: Bool, +invocation: Nat, +next: Nat, +output: FOutput) -> FStep:
  match edit:
    case True{}: f_issue(invocation, next, FResponseBuilt{output}, FEditStatus{})
    case False{}: f_issue(invocation, next, FResponseBuilt{output}, FEmptyResponseValue{})

def f_build_items(
  +invocation: Nat,
  +next: Nat,
  +output: FOutput,
  +findings: List<&2, Nat>,
  +notices: List<&2, Nat>
) -> FStep:
  match findings notices:
    case Nil{} Nil{}: f_build_empty(f_edit(f_request_output(output)), invocation, next, output)
    case _ _: f_issue(
      invocation,
      next,
      FResponseBuilt{output},
      FBuildResponse{f_frame_blocking_output(output), findings, notices}
    )

def f_build(+invocation: Nat, +next: Nat, +output: FOutput) -> FStep:
  match output:
    case FOutput{_, _, +findings, +notices}: f_build_items(
      invocation,
      next,
      output,
      findings,
      notices
    )

def f_final_gate(+invocation: Nat, +next: Nat, +output: FOutput) -> FStep:
  match output:
    case FOutput{FFrame{+input, _, +blocking}, _, _, _}:
      f_issue(invocation, next, FAuthorityChecked{output}, FFinalAuthority{blocking})

def f_authority_edit(+edit: Bool, +invocation: Nat, +next: Nat, +output: FOutput) -> FStep:
  match edit:
    case True{}: f_final_gate(invocation, next, output)
    case False{}: f_build(invocation, next, output)

def f_authorize(+has_authority: Bool, +invocation: Nat, +next: Nat, +output: FOutput) -> FStep:
  match has_authority:
    case True{}: f_issue(invocation, next, FAuthorityGate{output}, FCollectorGate{})
    case False{}: f_build(invocation, next, output)

def f_renew_notices(
  +invocation: Nat,
  +next: Nat,
  +output: FOutput,
  +remaining: List<&2, Nat>
) -> FStep:
  match remaining:
    case Nil{}:
      f_authorize(
        Bool.and(
          f_has_authority(f_frame_input_output(output)),
          f_collect(f_request_output(output))
        ),
        invocation,
        next,
        output
      )
    case +notice <> +rest: f_issue(
      invocation,
      next,
      FNoticeRenewed{output, rest},
      FRenewNotice{notice}
    )

def f_output_fit(+stop: Bool, +invocation: Nat, +next: Nat, +output: FOutput) -> FStep:
  match stop output:
    case True{} FOutput{+frame, +contents, +findings, +notices}:
      f_issue(
        invocation,
        next,
        FOutputChecked{FOutput{frame, contents, findings, notices}},
        FOutputFit{findings, notices}
      )
    case False{} FOutput{+frame, +contents, +findings, +notices}:
      f_renew_notices(invocation, next, FOutput{frame, contents, findings, notices}, notices)

def f_findings(
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +remaining: List<&2, FCaptured>,
  +contents: List<&2, Nat>,
  +findings: List<&2, Nat>
) -> FStep:
  match remaining:
    case Nil{}: f_issue(
      invocation,
      next,
      FNoticesRead{frame, List.reverse(&2, Nat, contents), List.reverse(&2, Nat, findings)},
      FNotices{}
    )
    case FCaptured{+advice, +content} <> +rest:
      f_issue(
        invocation,
        next,
        FFindingsRead{frame, rest, content <> contents, findings},
        FContentFindings{advice, content}
      )

def f_contents(
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +remaining: List<&2, Nat>,
  +contents: List<&2, FCaptured>
) -> FStep:
  match remaining:
    case Nil{}: f_findings(invocation, next, frame, List.reverse(&2, FCaptured, contents), [], [])
    case +advice <> +rest: f_issue(
      invocation,
      next,
      FContentRead{frame, advice, rest, contents},
      FContent{advice}
    )

def f_begin_output(+invocation: Nat, +next: Nat, +frame: FFrame) -> FStep:
  f_contents(invocation, next, frame, f_frame_advice(frame), [])

def f_recheck_list(
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +remaining: List<&2, Nat>
) -> FStep:
  match remaining:
    case Nil{}: f_begin_output(invocation, next, frame)
    case +current <> +rest:
      f_issue(
        invocation,
        next,
        FModeAllowed{
          f_frame_input(frame),
          f_frame_advice(frame),
          current,
          rest,
          Some{f_frame_blocking(frame)}
        },
        FAllowsBlocking{current}
      )

def f_recheck(+allowed: Bool, +invocation: Nat, +next: Nat, +frame: FFrame) -> FStep:
  match allowed:
    case True{}: f_recheck_list(invocation, next, frame, f_frame_advice(frame))
    case False{}: f_begin_output(invocation, next, frame)

def f_after_fit(+invocation: Nat, +next: Nat, +frame: FFrame, +after: FFitNext) -> FStep:
  match after:
    case FRecheckMode{}: f_recheck(f_can_block(f_frame_input(frame)), invocation, next, frame)
    case FReadOutput{}: f_begin_output(invocation, next, frame)

def f_updates(
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +remaining: List<&2, Nat>,
  +accepted: List<&2, Nat>,
  +index: Nat,
  +after: FFitNext
) -> FStep:
  match remaining:
    case Nil{}: f_after_fit(invocation, next, frame, after)
    case +advice <> +rest:
      f_issue(
        invocation,
        next,
        FUpdateDelivery{frame, advice, rest, accepted, index, after},
        FDelivery{advice}
      )

def f_offers(
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +remaining: List<&2, Nat>,
  +offers: List<&2, Nat>,
  +after: FFitNext
) -> FStep:
  match remaining:
    case Nil{}: f_issue(
      invocation,
      next,
      FFitted{frame, after},
      FFit{List.reverse(&2, Nat, offers), f_surface(frame)}
    )
    case +advice <> +rest: f_issue(
      invocation,
      next,
      FOffersRead{frame, rest, offers, after},
      FOffers{advice}
    )

def f_prune(
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +remaining: List<&2, Nat>,
  +after: FFitNext
) -> FStep:
  match remaining:
    case Nil{}: f_offers(invocation, next, frame, f_frame_advice(frame), [], after)
    case +advice <> +rest: f_issue(
      invocation,
      next,
      FPruneDelivery{frame, advice, rest, after},
      FDelivery{advice}
    )

def f_fit_composed(
  +composed: Bool,
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +after: FFitNext
) -> FStep:
  match composed:
    case True{}: f_prune(invocation, next, frame, f_frame_advice(frame), after)
    case False{}: f_offers(invocation, next, frame, f_frame_advice(frame), [], after)

def f_fit_collect(
  +collect: Bool,
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +after: FFitNext
) -> FStep:
  match collect:
    case True{}: f_fit_composed(
      f_composed(f_request(f_frame_input(frame))),
      invocation,
      next,
      frame,
      after
    )
    case False{}: f_after_fit(invocation, next, frame, after)

def f_fit(+invocation: Nat, +next: Nat, +frame: FFrame, +after: FFitNext) -> FStep:
  f_fit_collect(f_collect(f_request(f_frame_input(frame))), invocation, next, frame, after)

def f_mode_changed(+changed: Bool, +invocation: Nat, +next: Nat, +frame: FFrame) -> FStep:
  match changed:
    case True{}: f_fit(invocation, next, frame, FReadOutput{})
    case False{}: f_begin_output(invocation, next, frame)

def f_mode_selected(
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +advice: List<&2, Nat>,
  +blocking: Bool,
  +previous: Maybe<&2, Bool>
) -> FStep:
  match previous:
    case None{}: f_fit(invocation, next, FFrame{input, advice, blocking}, FRecheckMode{})
    case Some{+old}: f_mode_changed(
      Bool.xor(old, blocking),
      invocation,
      next,
      FFrame{input, advice, blocking}
    )

def f_modes(
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +advice: List<&2, Nat>,
  +remaining: List<&2, Nat>,
  +previous: Maybe<&2, Bool>
) -> FStep:
  match remaining:
    case Nil{}: f_mode_selected(invocation, next, input, advice, False{}, previous)
    case +current <> +rest:
      f_issue(
        invocation,
        next,
        FModeAllowed{input, advice, current, rest, previous},
        FAllowsBlocking{current}
      )

def f_mode_begin(
  +allowed: Bool,
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +advice: List<&2, Nat>,
  +previous: Maybe<&2, Bool>
) -> FStep:
  match allowed:
    case True{}: f_modes(invocation, next, input, advice, advice, previous)
    case False{}: f_mode_selected(invocation, next, input, advice, False{}, previous)

def f_candidates_done(
  +lost: Bool,
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +advice: List<&2, Nat>
) -> FStep:
  match lost:
    case True{}: f_issue(invocation, next, FLostReleased{}, FReleaseDelivery{})
    case False{}: f_mode_begin(f_can_block(input), invocation, next, input, advice, None{})

def f_candidates(
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +remaining: List<&2, Nat>,
  +kept: List<&2, Nat>
) -> FStep:
  match remaining:
    case Nil{}: f_candidates_done(
      Bool.and(f_edit(f_request(input)), Bool.not(f_has_authority(input))),
      invocation,
      next,
      input,
      List.reverse(&2, Nat, kept)
    )
    case +advice <> +rest: f_issue(
      invocation,
      next,
      FCandidateDelivery{input, advice, rest, kept},
      FDelivery{advice}
    )

def f_credentials(
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +remaining: List<&2, Nat>,
  +invalid: Bool
) -> FStep:
  match remaining invalid:
    case Nil{} +invalid: f_issue(
      invocation,
      next,
      FCredentialChecked{input},
      FCredentialGate{f_collect(f_request(input)), invalid}
    )
    case _ True{}: f_issue(
      invocation,
      next,
      FCredentialChecked{input},
      FCredentialGate{f_collect(f_request(input)), True{}}
    )
    case +advice <> +rest False{}: f_issue(
      invocation,
      next,
      FCredentialDelivery{input, advice, rest},
      FDelivery{advice}
    )

def f_nonadvice_authority(+present: Bool, +invocation: Nat, +next: Nat) -> FStep:
  match present:
    case False{}: FDone{FLost{}}
    case True{}: f_issue(invocation, next, FNonAdviceGate{}, FCollectorGate{})

def f_credentials_begin(+collect: Bool, +invocation: Nat, +next: Nat, +input: FInput) -> FStep:
  match collect:
    case True{}: f_issue(invocation, next, FCredentialAdvice{input}, FAdvice{False{}})
    case False{}: f_issue(
      invocation,
      next,
      FCredentialChecked{input},
      FCredentialGate{False{}, False{}}
    )

def f_pruned(+invocation: Nat, +next: Nat, +input: FInput, +response: FResponseKind) -> FStep:
  match response:
    case FAdviceResponse{}: f_credentials_begin(
      f_collect(f_request(input)),
      invocation,
      next,
      input
    )
    case _: f_nonadvice_authority(f_has_authority(input), invocation, next)

def f_nonadvice_edit(+edit: Bool, +invocation: Nat, +next: Nat, +input: FInput) -> FStep:
  match edit:
    case True{}: f_issue(invocation, next, FClockRead{input}, FClock{})
    case False{}: FDone{FOriginal{}}

def f_nonadvice_work(+work: Bool, +invocation: Nat, +next: Nat, +input: FInput) -> FStep:
  match work:
    case True{}: f_issue(invocation, next, FNonAdviceResponse{}, FWorkState{})
    case False{}: f_nonadvice_edit(
      Bool.and(f_pending_input(input), f_edit(f_request(input))),
      invocation,
      next,
      input
    )

def f_initial_response(
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +response: FResponseKind
) -> FStep:
  match response:
    case FAdviceResponse{}: f_issue(invocation, next, FClockRead{input}, FClock{})
    case +response:
      f_nonadvice_work(
        Bool.and(f_pending(response), f_shared_work(f_request(input))),
        invocation,
        next,
        input
      )

def finalize_initial(+invocation: Nat, +input: FInput) -> FStep:
  match input:
    case FInput{_, +response, _}: f_initial_response(invocation, 1n, input, response)

def f_candidate_work(
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +advice: Nat,
  +remaining: List<&2, Nat>,
  +kept: List<&2, Nat>,
  +source: Bool,
  +expired: Bool
) -> FStep:
  f_issue(
    invocation,
    next,
    FCandidateWork{input, advice, remaining, kept, source, expired},
    FWorkCurrent{advice}
  )

def f_delivery_owned(
  +owned: Bool,
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +advice: Nat,
  +remaining: List<&2, Nat>,
  +kept: List<&2, Nat>
) -> FStep:
  match owned:
    case True{}: f_issue(
      invocation,
      next,
      FCandidateSource{input, advice, remaining, kept},
      FSourceCurrent{advice}
    )
    case False{}: f_candidates(invocation, next, input, remaining, kept)

def f_credential_owned(
  +owned: Bool,
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +advice: Nat,
  +remaining: List<&2, Nat>
) -> FStep:
  match owned:
    case True{}: f_issue(
      invocation,
      next,
      FCredentialRead{input, advice, remaining},
      FCredentialFacts{advice}
    )
    case False{}: f_credentials(invocation, next, input, remaining, False{})

def f_prune_needed(
  +needed: Bool,
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +advice: Nat,
  +remaining: List<&2, Nat>,
  +after: FFitNext
) -> FStep:
  match needed:
    case True{}: f_issue(
      invocation,
      next,
      FPruneReleased{frame, remaining, after},
      FReleaseAdvice{advice}
    )
    case False{}: f_prune(invocation, next, frame, remaining, after)

def f_prune_joined(
  +joined: Bool,
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +advice: Nat,
  +findings: Nat,
  +remaining: List<&2, Nat>,
  +after: FFitNext
) -> FStep:
  match joined:
    case True{}: f_issue(
      invocation,
      next,
      FPrunePending{frame, advice, findings, remaining, after},
      FPendingFindings{advice}
    )
    case False{}: f_prune_needed(True{}, invocation, next, frame, advice, remaining, after)

def f_prune_present(
  +present: Bool,
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +advice: Nat,
  +findings: Nat,
  +joined: Bool,
  +remaining: List<&2, Nat>,
  +after: FFitNext
) -> FStep:
  match present:
    case True{}: f_prune_joined(joined, invocation, next, frame, advice, findings, remaining, after)
    case False{}: f_prune(invocation, next, frame, remaining, after)

def f_update_filtered(
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +advice: Nat,
  +remaining: List<&2, Nat>,
  +accepted: List<&2, Nat>,
  +after: FFitNext,
  +filtered: FFiltered
) -> FStep:
  match filtered:
    case FFiltered{+index, +findings}:
      f_issue(
        invocation,
        next,
        FUpdated{
          frame,
          advice,
          remaining,
          accepted,
          index,
          List.is_empty(&2, Nat, findings),
          after
        },
        FUpdate{advice, findings}
      )

def f_update_present(
  +present: Bool,
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +advice: Nat,
  +remaining: List<&2, Nat>,
  +accepted: List<&2, Nat>,
  +index: Nat,
  +after: FFitNext,
  +findings: List<&2, Nat>
) -> FStep:
  match present:
    case True{}: f_update_filtered(
      invocation,
      next,
      frame,
      advice,
      remaining,
      accepted,
      after,
      f_filter(findings, accepted, index)
    )
    case False{}: f_updates(invocation, next, frame, remaining, accepted, index, after)

def f_updated_empty(
  +empty: Bool,
  +invocation: Nat,
  +next: Nat,
  +frame: FFrame,
  +advice: Nat,
  +remaining: List<&2, Nat>,
  +accepted: List<&2, Nat>,
  +index: Nat,
  +after: FFitNext
) -> FStep:
  match empty:
    case True{}: f_issue(
      invocation,
      next,
      FUpdateReleased{frame, remaining, accepted, index, after},
      FReleaseAdvice{advice}
    )
    case False{}: f_updates(invocation, next, frame, remaining, accepted, index, after)

def f_mode_owned(
  +found: Bool,
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +advice: List<&2, Nat>,
  +remaining: List<&2, Nat>,
  +previous: Maybe<&2, Bool>
) -> FStep:
  match found:
    case True{}: f_mode_selected(invocation, next, input, advice, True{}, previous)
    case False{}: f_modes(invocation, next, input, advice, remaining, previous)

def f_mode_allowed(
  +allowed: Bool,
  +invocation: Nat,
  +next: Nat,
  +input: FInput,
  +advice: List<&2, Nat>,
  +current: Nat,
  +remaining: List<&2, Nat>,
  +previous: Maybe<&2, Bool>
) -> FStep:
  match allowed:
    case True{}: f_issue(
      invocation,
      next,
      FModeDelivery{input, advice, remaining, previous},
      FDelivery{current}
    )
    case False{}: f_modes(invocation, next, input, advice, remaining, previous)

def f_credential_unavailable(+input: FInput) -> FStep:
  match input:
    case FInput{FEditCollect{}, _, _}: FDone{FCredentialUnavailable{}}
    case _: FDone{FEmpty{}}

def f_phase(+invocation: Nat, +next: Nat, +phase: FPhase, +response: FResponse) -> FStep:
  match phase response:
    case FClockRead{+input} FAck{}: f_issue(invocation, next, FExpiredPending{input}, FExpire{})
    case FExpiredPending{+input} FAck{}: f_issue(invocation, next, FPruned{input}, FPrune{})
    case FPruned{FInput{+request, +kind, +authority}} FAck{}:
      f_pruned(invocation, next, FInput{request, kind, authority}, kind)
    case FNonAdviceGate{} FOptionalResponse{Some{+handle}}: FDone{FResponseHandle{handle}}
    case FNonAdviceGate{} FOptionalResponse{None{}}: f_issue(
      invocation,
      next,
      FNonAdviceResponse{},
      FEditStatus{}
    )
    case FNonAdviceResponse{} FHandle{+handle}: FDone{FResponseHandle{handle}}
    case FCredentialAdvice{+input} FHandles{+advice}: f_credentials(
      invocation,
      next,
      input,
      advice,
      False{}
    )
    case FCredentialDelivery{+input, +advice, +remaining} FDeliveryFacts{_, +owned, _, _, _}:
      f_credential_owned(owned, invocation, next, input, advice, remaining)
    case FCredentialRead{+input, _, +remaining} FTruth{False{}}:
      f_issue(
        invocation,
        next,
        FCredentialObserved{input, remaining},
        FObserveCredential{False{}, False{}}
      )
    case FCredentialRead{+input, +advice, +remaining} FTruth{True{}}:
      f_issue(
        invocation,
        next,
        FCredentialAuthorityRead{input, remaining},
        FCredentialAuthority{advice}
      )
    case FCredentialAuthorityRead{+input, +remaining} FTruth{+authorized}:
      f_issue(
        invocation,
        next,
        FCredentialObserved{input, remaining},
        FObserveCredential{True{}, authorized}
      )
    case FCredentialObserved{+input, +remaining} FTruth{+invalid}: f_credentials(
      invocation,
      next,
      input,
      remaining,
      invalid
    )
    case FCredentialChecked{+input} FTruth{True{}}:
      f_issue(invocation, next, FCandidatesRead{input}, FAdvice{True{}})
    case FCredentialChecked{+input} FTruth{False{}}:
      f_issue(invocation, next, FCredentialReleased{input}, FReleaseComposed{})
    case FCredentialReleased{+input} FAck{}: f_credential_unavailable(input)
    case FCandidatesRead{+input} FHandles{+advice}: f_candidates(
      invocation,
      next,
      input,
      advice,
      []
    )
    case FCandidateDelivery{+input, +advice, +remaining, +kept} FDeliveryFacts{_, +owned, _, _, _}:
      f_delivery_owned(owned, invocation, next, input, advice, remaining, kept)
    case FCandidateSource{+input, +advice, +remaining, +kept} FSource{False{}, _}:
      f_issue(invocation, next, FCandidateDisposed{input, remaining, kept}, FReleaseAdvice{advice})
    case FCandidateSource{+input, +advice, +remaining, +kept} FSource{True{}, +source}:
      f_issue(
        invocation,
        next,
        FCandidateRound{input, advice, remaining, kept, source},
        FRoundActive{advice}
      )
    case FCandidateRound{+input, +advice, +remaining, +kept, +source} FTruth{False{}}:
      f_candidate_work(invocation, next, input, advice, remaining, kept, source, True{})
    case FCandidateRound{+input, +advice, +remaining, +kept, +source} FTruth{True{}}:
      f_issue(
        invocation,
        next,
        FCandidateExpiry{input, advice, remaining, kept, source},
        FExpired{advice}
      )
    case FCandidateExpiry{+input, +advice, +remaining, +kept, +source} FTruth{+expired}:
      f_candidate_work(invocation, next, input, advice, remaining, kept, source, expired)
    case FCandidateWork{+input, +advice, +remaining, +kept, +source, +expired} FTruth{+current}:
      f_issue(
        invocation,
        next,
        FCandidateFindings{input, advice, remaining, kept, expired, Bool.and(current, source)},
        FDelivery{advice}
      )
    case FCandidateFindings{+input, +advice, +remaining, +kept, +expired, +current} FDeliveryFacts{
      _,
      _,
      +findings,
      _,
      _
    }:
      f_issue(
        invocation,
        next,
        FCandidateRoute{input, advice, remaining, kept},
        FRoute{expired, current, Bool.not(List.is_empty(&2, Nat, findings))}
      )
    case FCandidateRoute{+input, +advice, +remaining, +kept} FRouted{FRetain{}}:
      f_issue(
        invocation,
        next,
        FCandidateRenewed{input, advice, remaining, kept},
        FRenewAdvice{advice}
      )
    case FCandidateRoute{+input, +advice, +remaining, +kept} FRouted{FRetire{}}:
      f_issue(invocation, next, FCandidateDisposed{input, remaining, kept}, FRemoveAdvice{advice})
    case FCandidateRoute{+input, +advice, +remaining, +kept} FRouted{FRelease{}}:
      f_issue(invocation, next, FCandidateDisposed{input, remaining, kept}, FReleaseAdvice{advice})
    case FCandidateRoute{+input, _, +remaining, +kept} FRouted{FIgnore{}}: f_candidates(
      invocation,
      next,
      input,
      remaining,
      kept
    )
    case FCandidateDisposed{+input, +remaining, +kept} FAck{}: f_candidates(
      invocation,
      next,
      input,
      remaining,
      kept
    )
    case FCandidateRenewed{+input, +advice, +remaining, +kept} FAck{}: f_candidates(
      invocation,
      next,
      input,
      remaining,
      advice <> kept
    )
    case FLostReleased{} FAck{}: FDone{FLost{}}
    case FModeAllowed{+input, +advice, +current, +remaining, +previous} FTruth{+allowed}:
      f_mode_allowed(allowed, invocation, next, input, advice, current, remaining, previous)
    case FModeDelivery{+input, +advice, +remaining, +previous} FDeliveryFacts{
      _,
      +owned,
      +findings,
      _,
      _
    }:
      f_mode_owned(
        Bool.and(owned, Bool.not(List.is_empty(&2, Nat, findings))),
        invocation,
        next,
        input,
        advice,
        remaining,
        previous
      )
    case FPruneDelivery{+frame, +advice, +remaining, +after} FDeliveryFacts{
      +present,
      _,
      +findings,
      +round,
      +work
    }:
      f_prune_present(
        present,
        invocation,
        next,
        frame,
        advice,
        List.length(&2, Nat, findings),
        Bool.and(round, work),
        remaining,
        after
      )
    case FPrunePending{+frame, +advice, +findings, +remaining, +after} FCount{+pending}:
      f_prune_needed(
        Nat.is_gt(findings, pending),
        invocation,
        next,
        frame,
        advice,
        remaining,
        after
      )
    case FPruneReleased{+frame, +remaining, +after} FAck{}: f_prune(
      invocation,
      next,
      frame,
      remaining,
      after
    )
    case FOffersRead{+frame, +remaining, +offers, +after} FHandles{+items}:
      f_offers(invocation, next, frame, remaining, f_extend_rev(items, offers), after)
    case FFitted{+frame, +after} FHandles{+accepted}: f_updates(
      invocation,
      next,
      frame,
      f_frame_advice(frame),
      accepted,
      0n,
      after
    )
    case FUpdateDelivery{+frame, +advice, +remaining, +accepted, +index, +after} FDeliveryFacts{
      +present,
      _,
      +findings,
      _,
      _
    }:
      f_update_present(
        present,
        invocation,
        next,
        frame,
        advice,
        remaining,
        accepted,
        index,
        after,
        findings
      )
    case FUpdated{+frame, +advice, +remaining, +accepted, +index, +empty, +after} FAck{}:
      f_updated_empty(empty, invocation, next, frame, advice, remaining, accepted, index, after)
    case FUpdateReleased{+frame, +remaining, +accepted, +index, +after} FAck{}: f_updates(
      invocation,
      next,
      frame,
      remaining,
      accepted,
      index,
      after
    )
    case FContentRead{+frame, +advice, +remaining, +contents} FHandle{+content}:
      f_contents(invocation, next, frame, remaining, FCaptured{advice, content} <> contents)
    case FFindingsRead{+frame, +remaining, +contents, +findings} FHandles{+items}:
      f_findings(invocation, next, frame, remaining, contents, f_extend_rev(items, findings))
    case FNoticesRead{+frame, +contents, +findings} FHandles{+notices}:
      f_output_fit(
        f_stop(f_request(f_frame_input(frame))),
        invocation,
        next,
        FOutput{frame, contents, findings, notices}
      )
    case FOutputChecked{FOutput{+frame, +contents, +findings, +notices}} FTruth{True{}}:
      f_renew_notices(invocation, next, FOutput{frame, contents, findings, notices}, notices)
    case FOutputChecked{_} FTruth{False{}}: f_issue(
      invocation,
      next,
      FOutputReleased{},
      FReleaseDelivery{}
    )
    case FOutputReleased{} FAck{}: FDone{FEmpty{}}
    case FNoticeRenewed{+output, +remaining} FAck{}: f_renew_notices(
      invocation,
      next,
      output,
      remaining
    )
    case FAuthorityGate{+output} FOptionalResponse{Some{+handle}}:
      f_issue(invocation, next, FAuthorityReleased{handle}, FReleaseDelivery{})
    case FAuthorityGate{+output} FOptionalResponse{None{}}:
      f_authority_edit(f_edit(f_request_output(output)), invocation, next, output)
    case FAuthorityReleased{+handle} FAck{}: FDone{FResponseHandle{handle}}
    case FAuthorityChecked{+output} FTruth{True{}}: f_build(invocation, next, output)
    case FAuthorityChecked{_} FTruth{False{}}: f_issue(
      invocation,
      next,
      FAuthorityFallbackReleased{},
      FReleaseDelivery{}
    )
    case FAuthorityFallbackReleased{} FAck{}: f_issue(
      invocation,
      next,
      FNonAdviceResponse{},
      FEditStatus{}
    )
    case FResponseBuilt{+output} FHandle{+handle}: f_observe(invocation, next, handle, output)
    case FResponseObserved{+handle} FAck{}: FDone{FResponseHandle{handle}}
    case _ _: FRejected{}

def f_reply_valid(
  +valid: Bool,
  +invocation: Nat,
  +next: Nat,
  +phase: FPhase,
  +response: FResponse
) -> FStep:
  match valid:
    case True{}: f_phase(invocation, Nat.add(next, 1n), phase, response)
    case False{}: FRejected{}

def finalize_resume(+step: FStep, +reply: FReply) -> FStep:
  match step reply:
    case FAwait{FState{+invocation, +next, +phase}, FRequest{+owner, +id, _}} FReply{
      +other,
      +request,
      +response
    }:
      f_reply_valid(
        Bool.and(
          Nat.is_eq(invocation, other),
          Bool.and(
            Nat.is_eq(owner, other),
            Bool.and(Nat.is_eq(next, request), Nat.is_eq(id, request))
          )
        ),
        invocation,
        next,
        phase,
        response
      )
    case _ _: FRejected{}

# Reconcile the provisional finish reservation in the same handoff owner.
# Snapshot handles preserve physical round identity; Bend filters and binds them.
type RInput is Data:
  RInput{
    finish: Bool,
    provisional_findings: Bool,
    advice: Bool,
    findings: Nat,
    can_write: Bool,
    same_token: Bool
  }
type RSnapshot is Data:
  RSnapshot{
    handle: Nat,
    owned: Bool,
    same_round: Bool,
    work: Bool,
    delivery: Bool,
    count: Nat,
    operation: Nat
  }
type RPending is Data:
  RPending{operation: Nat, count: Nat}
type RReason is Data:
  RNoAdvice{}
  RDeadline{}
  RUnavailable{}
type RDecision is Data:
  RReserved{}
  RAllowed{reason: RReason}
  RRefused{}
type RCommand is Data:
  RRevoke{}
  RRound{}
  RSnapshots{}
  RPendingFindings{}
  RClock{}
  RDecide{selected: List<&2, Nat>, binding: Bool, can_write: Bool}
  RRelease{provisional: Bool}
  RAllow{reason: RReason}
type RResponse is Data:
  RAck{}
  RTruth{value: Bool}
  RSnapshotValues{values: List<&2, RSnapshot>}
  RPendingValues{values: List<&2, RPending>}
  RDecided{decision: RDecision}
type RSelection is Data:
  RSelection{selected: List<&2, Nat>, count: Nat, valid: Bool}
type RPhase is Data:
  RRevoked{input: RInput}
  RReleasedProvisional{}
  RRoundRead{input: RInput}
  RSnapshotsRead{input: RInput, round: Bool}
  RPendingRead{input: RInput, round: Bool, snapshots: List<&2, RSnapshot>}
  RClockRead{input: RInput, selection: RSelection}
  ROutputDecided{advice: Bool}
  RReleasedFinal{reason: RReason}
  RAllowedFinish{}
type RRequest is Data:
  RRequest{invocation: Nat, id: Nat, command: RCommand}
type RReply is Data:
  RReply{invocation: Nat, id: Nat, response: RResponse}
type RStep is Data:
  RAwait{invocation: Nat, id: Nat, phase: RPhase, request: RRequest}
  RFinal{}
  REmpty{}
  RRejected{}

def r_issue(+invocation: Nat, +id: Nat, +phase: RPhase, +command: RCommand) -> RStep:
  RAwait{invocation, id, phase, RRequest{invocation, id, command}}

def r_pending_value(+same: Bool, +count: Nat, +rest: Nat) -> Nat:
  match same:
    case True{}: count
    case False{}: rest

def r_pending(+pending: List<&2, RPending>, +operation: Nat) -> Nat:
  match pending:
    case Nil{}: 0n
    case RPending{+other, +count} <> +rest:
      r_pending_value(Nat.is_eq(operation, other), count, r_pending(rest, operation))

def r_selected_item(
  +owned: Bool,
  +handle: Nat,
  +count: Nat,
  +valid: Bool,
  +tail: RSelection
) -> RSelection:
  match owned tail:
    case False{} +result: result
    case True{} RSelection{+selected, +total, +remaining_valid}:
      RSelection{handle <> selected, Nat.add(count, total), Bool.and(valid, remaining_valid)}

def r_select(+snapshots: List<&2, RSnapshot>, +pending: List<&2, RPending>) -> RSelection:
  match snapshots:
    case Nil{}: RSelection{[], 0n, True{}}
    case RSnapshot{+handle, +owned, +same_round, +work, +delivery, +count, +operation} <> +rest:
      r_selected_item(
        owned,
        handle,
        count,
        Bool.and(
          same_round,
          Bool.and(work, Bool.and(delivery, Nat.is_le(count, r_pending(pending, operation))))
        ),
        r_select(rest, pending)
      )

def r_binding(+advice: Bool, +findings: Nat, +round: Bool, +count: Nat, +valid: Bool) -> Bool:
  Bool.or(
    Bool.not(advice),
    Bool.or(Nat.is_eq(findings, 0n), Bool.and(round, Bool.and(Nat.is_eq(findings, count), valid)))
  )

def r_read_snapshots(
  +advice: Bool,
  +invocation: Nat,
  +next: Nat,
  +input: RInput,
  +round: Bool
) -> RStep:
  match advice:
    case True{}: r_issue(invocation, next, RSnapshotsRead{input, round}, RSnapshots{})
    case False{}: r_issue(invocation, next, RPendingRead{input, round, []}, RPendingFindings{})

def r_clock(
  +invocation: Nat,
  +next: Nat,
  +input: RInput,
  +round: Bool,
  +selection: RSelection
) -> RStep:
  match input selection:
    case RInput{+finish, +provisional, +advice, +findings, +can_write, +same_token} RSelection{
      +selected,
      +count,
      +valid
    }:
      r_issue(invocation, next,
        RClockRead{RInput{finish, provisional, advice, findings, can_write, same_token},
          RSelection{selected, count, r_binding(advice, findings, round, count, valid)}}, RClock{})

def r_allow_after_release(+advice: Bool, +invocation: Nat, +next: Nat, +reason: RReason) -> RStep:
  match advice:
    case True{}: r_issue(invocation, next, RReleasedFinal{reason}, RRelease{False{}})
    case False{}: r_issue(invocation, next, RAllowedFinish{}, RAllow{reason})

def r_begin(+needed: Bool, +invocation: Nat, +input: RInput) -> RStep:
  match needed:
    case False{}: RFinal{}
    case True{}: r_issue(invocation, 1n, RRevoked{input}, RRevoke{})

def reconcile_initial(+invocation: Nat, +input: RInput) -> RStep:
  match input:
    case RInput{+finish, +provisional, +advice, +findings, +can_write, +same_token}:
      r_begin(
        Bool.and(finish, provisional),
        invocation,
        RInput{finish, provisional, advice, findings, can_write, same_token}
      )

def r_phase(+invocation: Nat, +next: Nat, +phase: RPhase, +response: RResponse) -> RStep:
  match phase response:
    case RRevoked{+input} RTruth{True{}}: r_issue(invocation, next, RRoundRead{input}, RRound{})
    case RRevoked{_} RTruth{False{}}: r_issue(
      invocation,
      next,
      RReleasedProvisional{},
      RRelease{True{}}
    )
    case RReleasedProvisional{} RAck{}: r_issue(
      invocation,
      next,
      RAllowedFinish{},
      RAllow{RUnavailable{}}
    )
    case RRoundRead{RInput{+finish, +provisional, +advice, +findings, +can_write, +same_token}} RTruth{
      +round
    }:
      r_read_snapshots(
        advice,
        invocation,
        next,
        RInput{finish, provisional, advice, findings, can_write, same_token},
        round
      )
    case RSnapshotsRead{+input, +round} RSnapshotValues{+snapshots}:
      r_issue(invocation, next, RPendingRead{input, round, snapshots}, RPendingFindings{})
    case RPendingRead{+input, +round, +snapshots} RPendingValues{+pending}:
      r_clock(invocation, next, input, round, r_select(snapshots, pending))
    case RClockRead{
      RInput{_, _, +advice, _, +can_write, +same_token},
      RSelection{+selected, _, +valid}
    } RAck{}:
      r_issue(
        invocation,
        next,
        ROutputDecided{advice},
        RDecide{selected, valid, Bool.and(can_write, Bool.and(advice, same_token))}
      )
    case ROutputDecided{_} RDecided{RReserved{}}: RFinal{}
    case ROutputDecided{+advice} RDecided{RAllowed{+reason}}: r_allow_after_release(
      advice,
      invocation,
      next,
      reason
    )
    case ROutputDecided{+advice} RDecided{RRefused{}}: r_allow_after_release(
      advice,
      invocation,
      next,
      RUnavailable{}
    )
    case RReleasedFinal{+reason} RAck{}: r_issue(invocation, next, RAllowedFinish{}, RAllow{reason})
    case RAllowedFinish{} RAck{}: REmpty{}
    case _ _: RRejected{}

def r_accept(
  +valid: Bool,
  +invocation: Nat,
  +next: Nat,
  +phase: RPhase,
  +response: RResponse
) -> RStep:
  match valid:
    case False{}: RRejected{}
    case True{}: r_phase(invocation, Nat.add(next, 1n), phase, response)

def reconcile_resume(+step: RStep, +reply: RReply) -> RStep:
  match step reply:
    case RAwait{+invocation, +id, +phase, RRequest{+owner, +request, _}} RReply{
      +other,
      +received,
      +response
    }:
      r_accept(
        Bool.and(
          Nat.is_eq(invocation, other),
          Bool.and(
            Nat.is_eq(owner, other),
            Bool.and(Nat.is_eq(id, received), Nat.is_eq(request, received))
          )
        ),
        invocation,
        id,
        phase,
        response
      )
    case _ _: RRejected{}
