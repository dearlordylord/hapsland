import Base
import ../Handoff.bend as H
import ./DeliveryTrace.bend as Trace

# Draft independent whole finalization specification. No law/proof claim.
# H provides nominal public data only. F authorization/fitting/output, R finish
# reconciliation and D composition are specified here, without production calls.
# Native facts, formatting, physical identity and cleanup remain port obligations.

def correlated(
  +inv: Nat,
  +id: Nat,
  +owner: Nat,
  +request: Nat,
  +actual: Nat,
  +received: Nat
) -> Bool:
  Bool.and(Nat.is_eq(inv, actual), Bool.and(Nat.is_eq(owner, actual),
    Bool.and(Nat.is_eq(id, received), Nat.is_eq(request, received))))

def collect(+input: H.FInput) -> Bool:
  match input:
    case H.FInput{H.FOtherRequest{}, _, _}: False{}
    case _: True{}

def edit(+input: H.FInput) -> Bool:
  match input:
    case H.FInput{H.FEditCollect{}, _, _}: True{}
    case _: False{}

def composed(+input: H.FInput) -> Bool:
  match input:
    case H.FInput{H.FEditCollect{}, _, _}: True{}
    case H.FInput{H.FSharedCollect{+value, _, _, _, _}, _, _}: value
    case _: False{}

def stop_surface(+input: H.FInput) -> Bool:
  match input:
    case H.FInput{H.FSharedCollect{True{}, True{}, True{}, _, _}, _, _}: True{}
    case _: False{}

def authority(+input: H.FInput) -> Bool:
  match input:
    case H.FInput{_, _, H.FNoAuthority{}}: False{}
    case _: True{}

def can_block(+input: H.FInput) -> Bool:
  match input:
    case H.FInput{_, _, H.FBlockingAuthority{}}: True{}
    case _: False{}

def frame_input(+frame: H.FFrame) -> H.FInput:
  match frame:
    case H.FFrame{+input, _, _}: input

def frame_advice(+frame: H.FFrame) -> List<&2, Nat>:
  match frame:
    case H.FFrame{_, +advice, _}: advice

def surface(+frame: H.FFrame) -> H.FSurface:
  match frame:
    case H.FFrame{H.FInput{_, _, H.FNoAuthority{}}, _, _}:
      Bool.pick(H.FSurface, stop_surface(frame_input(frame)), H.FStopSurface{}, H.FCodexSurface{})
    case H.FFrame{_, _, True{}}: H.FBlockingSurface{}
    case _: H.FAdvisorySurface{}

def f_request(+inv: Nat, +id: Nat, +phase: H.FPhase, +command: H.FCommand) -> H.FStep:
  H.FAwait{H.FState{inv, id, phase}, H.FRequest{inv, id, command}}

def build_output(+inv: Nat, +id: Nat, +output: H.FOutput) -> H.FStep:
  match output:
    case H.FOutput{H.FFrame{+input, _, _}, _, Nil{}, Nil{}}:
      f_request(inv, id, H.FResponseBuilt{output},
        Bool.pick(H.FCommand, edit(input), H.FEditStatus{}, H.FEmptyResponseValue{}))
    case H.FOutput{H.FFrame{_, _, +blocking}, _, +findings, +notices}:
      f_request(inv, id, H.FResponseBuilt{output}, H.FBuildResponse{blocking, findings, notices})

def notices_next(+inv: Nat, +id: Nat, +output: H.FOutput, +remaining: List<&2, Nat>) -> H.FStep:
  match output remaining:
    case _ +notice <> +tail:
      f_request(inv, id, H.FNoticeRenewed{output, tail}, H.FRenewNotice{notice})
    case H.FOutput{H.FFrame{+input, _, _}, _, _, _} Nil{}:
      Bool.pick(
        H.FStep,
        Bool.and(authority(input), collect(input)),
        f_request(inv, id, H.FAuthorityGate{output}, H.FCollectorGate{}),
        build_output(inv, id, output)
      )

def findings_next(+inv: Nat, +id: Nat, +frame: H.FFrame, +remaining: List<&2, H.FCaptured>,
    +contents: List<&2, Nat>, +findings: List<&2, Nat>) -> H.FStep:
  match remaining:
    case Nil{}:
      f_request(
        inv,
        id,
        H.FNoticesRead{frame, List.reverse(&2, Nat, contents), List.reverse(&2, Nat, findings)},
        H.FNotices{}
      )
    case H.FCaptured{+advice, +content} <> +tail:
      f_request(
        inv,
        id,
        H.FFindingsRead{frame, tail, content <> contents, findings},
        H.FContentFindings{advice, content}
      )

def contents_next(+inv: Nat, +id: Nat, +frame: H.FFrame, +remaining: List<&2, Nat>,
    +reversed: List<&2, H.FCaptured>) -> H.FStep:
  match remaining:
    case Nil{}: findings_next(inv, id, frame, List.reverse(&2, H.FCaptured, reversed), [], [])
    case +advice <> +tail:
      f_request(inv, id, H.FContentRead{frame, advice, tail, reversed}, H.FContent{advice})

def output_start(+inv: Nat, +id: Nat, +frame: H.FFrame) -> H.FStep:
  contents_next(inv, id, frame, frame_advice(frame), [])

def recheck_start(+inv: Nat, +id: Nat, +frame: H.FFrame) -> H.FStep:
  match frame:
    case H.FFrame{+input, +current <> +tail, +blocking}:
      Bool.pick(
        H.FStep,
        can_block(input),
        f_request(
          inv,
          id,
          H.FModeAllowed{input, current <> tail, current, tail, Some{blocking}},
          H.FAllowsBlocking{current}
        ),
        output_start(inv, id, frame)
      )
    case _: output_start(inv, id, frame)

def after_fit(+inv: Nat, +id: Nat, +frame: H.FFrame, +after: H.FFitNext) -> H.FStep:
  match after:
    case H.FReadOutput{}: output_start(inv, id, frame)
    case H.FRecheckMode{}: recheck_start(inv, id, frame)

def updates_next(+inv: Nat, +id: Nat, +frame: H.FFrame, +remaining: List<&2, Nat>,
    +accepted: List<&2, Nat>, +index: Nat, +after: H.FFitNext) -> H.FStep:
  match remaining:
    case Nil{}: after_fit(inv, id, frame, after)
    case +advice <> +tail:
      f_request(
        inv,
        id,
        H.FUpdateDelivery{frame, advice, tail, accepted, index, after},
        H.FDelivery{advice}
      )

def offers_next(+inv: Nat, +id: Nat, +frame: H.FFrame, +remaining: List<&2, Nat>,
    +reversed: List<&2, Nat>, +after: H.FFitNext) -> H.FStep:
  match remaining:
    case Nil{}: f_request(
      inv,
      id,
      H.FFitted{frame, after},
      H.FFit{List.reverse(&2, Nat, reversed), surface(frame)}
    )
    case +advice <> +tail:
      f_request(inv, id, H.FOffersRead{frame, tail, reversed, after}, H.FOffers{advice})

def prune_next(
  +inv: Nat,
  +id: Nat,
  +frame: H.FFrame,
  +remaining: List<&2, Nat>,
  +after: H.FFitNext
) -> H.FStep:
  match remaining:
    case Nil{}: offers_next(inv, id, frame, frame_advice(frame), [], after)
    case +advice <> +tail:
      f_request(inv, id, H.FPruneDelivery{frame, advice, tail, after}, H.FDelivery{advice})

def fit_start(+inv: Nat, +id: Nat, +frame: H.FFrame, +after: H.FFitNext) -> H.FStep:
  match frame:
    case H.FFrame{H.FInput{H.FOtherRequest{}, _, _}, _, _}: after_fit(inv, id, frame, after)
    case _:
      Bool.pick(H.FStep, composed(frame_input(frame)),
        prune_next(inv, id, frame, frame_advice(frame), after),
        offers_next(inv, id, frame, frame_advice(frame), [], after))

def mode_chosen(+inv: Nat, +id: Nat, +input: H.FInput, +advice: List<&2, Nat>,
    +blocking: Bool, +previous: Maybe<&2, Bool>) -> H.FStep:
  match previous:
    case None{}: fit_start(inv, id, H.FFrame{input, advice, blocking}, H.FRecheckMode{})
    case Some{+old}:
      Bool.pick(H.FStep, Bool.xor(old, blocking),
        fit_start(inv, id, H.FFrame{input, advice, blocking}, H.FReadOutput{}),
        output_start(inv, id, H.FFrame{input, advice, blocking}))

def mode_next(+inv: Nat, +id: Nat, +input: H.FInput, +advice: List<&2, Nat>,
    +remaining: List<&2, Nat>, +previous: Maybe<&2, Bool>) -> H.FStep:
  match remaining:
    case Nil{}: mode_chosen(inv, id, input, advice, False{}, previous)
    case +current <> +tail:
      f_request(
        inv,
        id,
        H.FModeAllowed{input, advice, current, tail, previous},
        H.FAllowsBlocking{current}
      )

def mode_start(+inv: Nat, +id: Nat, +input: H.FInput, +advice: List<&2, Nat>) -> H.FStep:
  match input:
    case H.FInput{_, _, H.FBlockingAuthority{}}: mode_next(inv, id, input, advice, advice, None{})
    case _: mode_chosen(inv, id, input, advice, False{}, None{})

def candidates_next(
  +inv: Nat,
  +id: Nat,
  +input: H.FInput,
  +remaining: List<&2, Nat>,
  +kept: List<&2, Nat>
) -> H.FStep:
  match input remaining:
    case H.FInput{H.FEditCollect{}, _, H.FNoAuthority{}} Nil{}:
      f_request(inv, id, H.FLostReleased{}, H.FReleaseDelivery{})
    case _ Nil{}: mode_start(inv, id, input, List.reverse(&2, Nat, kept))
    case _ +advice <> +tail:
      f_request(inv, id, H.FCandidateDelivery{input, advice, tail, kept}, H.FDelivery{advice})

def credentials_next(
  +inv: Nat,
  +id: Nat,
  +input: H.FInput,
  +remaining: List<&2, Nat>,
  +invalid: Bool
) -> H.FStep:
  match remaining invalid:
    case +advice <> +tail False{}:
      f_request(inv, id, H.FCredentialDelivery{input, advice, tail}, H.FDelivery{advice})
    case _ _: f_request(
      inv,
      id,
      H.FCredentialChecked{input},
      H.FCredentialGate{collect(input), invalid}
    )

def pruned(+inv: Nat, +id: Nat, +input: H.FInput) -> H.FStep:
  match input:
    case H.FInput{H.FOtherRequest{}, H.FAdviceResponse{}, _}:
      f_request(inv, id, H.FCredentialChecked{input}, H.FCredentialGate{False{}, False{}})
    case H.FInput{_, H.FAdviceResponse{}, _}:
      f_request(inv, id, H.FCredentialAdvice{input}, H.FAdvice{False{}})
    case H.FInput{_, _, H.FNoAuthority{}}: H.FDone{H.FLost{}}
    case _: f_request(inv, id, H.FNonAdviceGate{}, H.FCollectorGate{})

def initial_pending(+inv: Nat, +input: H.FInput) -> H.FStep:
  match input:
    case H.FInput{H.FSharedCollect{_, _, _, False{}, True{}}, _, _}:
      f_request(inv, 1n, H.FNonAdviceResponse{}, H.FWorkState{})
    case H.FInput{H.FEditCollect{}, _, _}: f_request(inv, 1n, H.FClockRead{input}, H.FClock{})
    case _: H.FDone{H.FOriginal{}}

def finalize_spec_initial(+inv: Nat, +input: H.FInput) -> H.FStep:
  match input:
    case H.FInput{_, H.FAdviceResponse{}, _}: f_request(inv, 1n, H.FClockRead{input}, H.FClock{})
    case H.FInput{_, H.FEmptyResponse{}, _}: initial_pending(inv, input)
    case H.FInput{_, H.FPendingResponse{}, _}: initial_pending(inv, input)
    case _: H.FDone{H.FOriginal{}}

# Fitting indices are global across present deliveries, not reset per advice.
def filter_keep(+keep: Bool, +value: Nat, +tail: H.FFiltered) -> H.FFiltered:
  match keep tail:
    case True{} H.FFiltered{+end, +values}: H.FFiltered{end, value <> values}
    case False{} +result: result

def filter_findings(+values: List<&2, Nat>, +indices: List<&2, Nat>, +index: Nat) -> H.FFiltered:
  match values:
    case Nil{}: H.FFiltered{index, []}
    case +value <> +tail:
      filter_keep(List.contains(~Nat, ~Nat.is_eq, indices, index), value,
        filter_findings(tail, indices, Nat.add(index, 1n)))

def update_filtered(
  +inv: Nat,
  +id: Nat,
  +frame: H.FFrame,
  +advice: Nat,
  +remaining: List<&2, Nat>,
  +accepted: List<&2, Nat>,
  +after: H.FFitNext,
  +filtered: H.FFiltered
) -> H.FStep:
  match filtered:
    case H.FFiltered{+index, +findings}:
      f_request(
        inv,
        id,
        H.FUpdated{
          frame,
          advice,
          remaining,
          accepted,
          index,
          List.is_empty(&2, Nat, findings),
          after
        },
        H.FUpdate{advice, findings}
      )

def prune_needed(+needed: Bool, +inv: Nat, +id: Nat, +frame: H.FFrame, +advice: Nat,
    +remaining: List<&2, Nat>, +after: H.FFitNext) -> H.FStep:
  match needed:
    case True{}: f_request(
      inv,
      id,
      H.FPruneReleased{frame, remaining, after},
      H.FReleaseAdvice{advice}
    )
    case False{}: prune_next(inv, id, frame, remaining, after)

def prune_present(+inv: Nat, +id: Nat, +frame: H.FFrame, +advice: Nat,
    +remaining: List<&2, Nat>, +after: H.FFitNext, +facts: H.FResponse) -> H.FStep:
  match facts:
    case H.FDeliveryFacts{False{}, _, _, _, _}: prune_next(inv, id, frame, remaining, after)
    case H.FDeliveryFacts{True{}, _, +findings, True{}, True{}}:
      f_request(
        inv,
        id,
        H.FPrunePending{frame, advice, List.length(&2, Nat, findings), remaining, after},
        H.FPendingFindings{advice}
      )
    case H.FDeliveryFacts{True{}, _, _, _, _}: prune_needed(
      True{},
      inv,
      id,
      frame,
      advice,
      remaining,
      after
    )
    case _: H.FRejected{}

def f_response(+inv: Nat, +id: Nat, +phase: H.FPhase, +response: H.FResponse) -> H.FStep:
  match phase response:
    case H.FClockRead{+input} H.FAck{}: f_request(inv, id, H.FExpiredPending{input}, H.FExpire{})
    case H.FExpiredPending{+input} H.FAck{}: f_request(inv, id, H.FPruned{input}, H.FPrune{})
    case H.FPruned{+input} H.FAck{}: pruned(inv, id, input)
    case H.FNonAdviceGate{} H.FOptionalResponse{Some{+value}}: H.FDone{H.FResponseHandle{value}}
    case H.FNonAdviceGate{} H.FOptionalResponse{None{}}: f_request(
      inv,
      id,
      H.FNonAdviceResponse{},
      H.FEditStatus{}
    )
    case H.FNonAdviceResponse{} H.FHandle{+value}: H.FDone{H.FResponseHandle{value}}
    case H.FCredentialAdvice{+input} H.FHandles{+items}: credentials_next(
      inv,
      id,
      input,
      items,
      False{}
    )
    case H.FCredentialDelivery{+input, +advice, +remaining} H.FDeliveryFacts{_, True{}, _, _, _}:
      f_request(inv, id, H.FCredentialRead{input, advice, remaining}, H.FCredentialFacts{advice})
    case H.FCredentialDelivery{+input, _, +remaining} H.FDeliveryFacts{_, False{}, _, _, _}:
      credentials_next(inv, id, input, remaining, False{})
    case H.FCredentialRead{+input, _, +remaining} H.FTruth{False{}}:
      f_request(
        inv,
        id,
        H.FCredentialObserved{input, remaining},
        H.FObserveCredential{False{}, False{}}
      )
    case H.FCredentialRead{+input, +advice, +remaining} H.FTruth{True{}}:
      f_request(
        inv,
        id,
        H.FCredentialAuthorityRead{input, remaining},
        H.FCredentialAuthority{advice}
      )
    case H.FCredentialAuthorityRead{+input, +remaining} H.FTruth{+authorized}:
      f_request(
        inv,
        id,
        H.FCredentialObserved{input, remaining},
        H.FObserveCredential{True{}, authorized}
      )
    case H.FCredentialObserved{+input, +remaining} H.FTruth{+invalid}:
      credentials_next(inv, id, input, remaining, invalid)
    case H.FCredentialChecked{+input} H.FTruth{True{}}:
      f_request(inv, id, H.FCandidatesRead{input}, H.FAdvice{True{}})
    case H.FCredentialChecked{+input} H.FTruth{False{}}:
      f_request(inv, id, H.FCredentialReleased{input}, H.FReleaseComposed{})
    case H.FCredentialReleased{H.FInput{H.FEditCollect{}, _, _}} H.FAck{}: H.FDone{
      H.FCredentialUnavailable{}
    }
    case H.FCredentialReleased{_} H.FAck{}: H.FDone{H.FEmpty{}}
    case H.FCandidatesRead{+input} H.FHandles{+items}: candidates_next(inv, id, input, items, [])
    case H.FCandidateDelivery{+input, +advice, +remaining, +kept} H.FDeliveryFacts{
      _,
      True{},
      _,
      _,
      _
    }:
      f_request(
        inv,
        id,
        H.FCandidateSource{input, advice, remaining, kept},
        H.FSourceCurrent{advice}
      )
    case H.FCandidateDelivery{+input, _, +remaining, +kept} H.FDeliveryFacts{_, False{}, _, _, _}:
      candidates_next(inv, id, input, remaining, kept)
    case H.FCandidateSource{+input, +advice, +remaining, +kept} H.FSource{False{}, _}:
      f_request(inv, id, H.FCandidateDisposed{input, remaining, kept}, H.FReleaseAdvice{advice})
    case H.FCandidateSource{+input, +advice, +remaining, +kept} H.FSource{True{}, +source}:
      f_request(
        inv,
        id,
        H.FCandidateRound{input, advice, remaining, kept, source},
        H.FRoundActive{advice}
      )
    case H.FCandidateRound{+input, +advice, +remaining, +kept, +source} H.FTruth{True{}}:
      f_request(
        inv,
        id,
        H.FCandidateExpiry{input, advice, remaining, kept, source},
        H.FExpired{advice}
      )
    case H.FCandidateRound{+input, +advice, +remaining, +kept, +source} H.FTruth{False{}}:
      f_request(
        inv,
        id,
        H.FCandidateWork{input, advice, remaining, kept, source, True{}},
        H.FWorkCurrent{advice}
      )
    case H.FCandidateExpiry{+input, +advice, +remaining, +kept, +source} H.FTruth{+expired}:
      f_request(
        inv,
        id,
        H.FCandidateWork{input, advice, remaining, kept, source, expired},
        H.FWorkCurrent{advice}
      )
    case H.FCandidateWork{+input, +advice, +remaining, +kept, +source, +expired} H.FTruth{+current}:
      f_request(
        inv,
        id,
        H.FCandidateFindings{input, advice, remaining, kept, expired, Bool.and(current, source)},
        H.FDelivery{advice}
      )
    case H.FCandidateFindings{+input, +advice, +remaining, +kept, +expired, +current} H.FDeliveryFacts{
      _,
      _,
      +findings,
      _,
      _
    }:
      f_request(inv, id, H.FCandidateRoute{input, advice, remaining, kept},
        H.FRoute{expired, current, Bool.not(List.is_empty(&2, Nat, findings))})
    case H.FCandidateRoute{+input, +advice, +remaining, +kept} H.FRouted{H.FRetain{}}:
      f_request(
        inv,
        id,
        H.FCandidateRenewed{input, advice, remaining, kept},
        H.FRenewAdvice{advice}
      )
    case H.FCandidateRoute{+input, +advice, +remaining, +kept} H.FRouted{H.FRetire{}}:
      f_request(inv, id, H.FCandidateDisposed{input, remaining, kept}, H.FRemoveAdvice{advice})
    case H.FCandidateRoute{+input, +advice, +remaining, +kept} H.FRouted{H.FRelease{}}:
      f_request(inv, id, H.FCandidateDisposed{input, remaining, kept}, H.FReleaseAdvice{advice})
    case H.FCandidateRoute{+input, _, +remaining, +kept} H.FRouted{H.FIgnore{}}:
      candidates_next(inv, id, input, remaining, kept)
    case H.FCandidateDisposed{+input, +remaining, +kept} H.FAck{}: candidates_next(
      inv,
      id,
      input,
      remaining,
      kept
    )
    case H.FCandidateRenewed{+input, +advice, +remaining, +kept} H.FAck{}:
      candidates_next(inv, id, input, remaining, advice <> kept)
    case H.FLostReleased{} H.FAck{}: H.FDone{H.FLost{}}
    case H.FModeAllowed{+input, +advice, +current, +remaining, +previous} H.FTruth{True{}}:
      f_request(inv, id, H.FModeDelivery{input, advice, remaining, previous}, H.FDelivery{current})
    case H.FModeAllowed{+input, +advice, _, +remaining, +previous} H.FTruth{False{}}:
      mode_next(inv, id, input, advice, remaining, previous)
    case H.FModeDelivery{+input, +advice, +remaining, +previous} H.FDeliveryFacts{
      _,
      +owned,
      +findings,
      _,
      _
    }:
      Bool.pick(
        H.FStep,
        Bool.and(owned, Bool.not(List.is_empty(&2, Nat, findings))),
        mode_chosen(inv, id, input, advice, True{}, previous),
        mode_next(inv, id, input, advice, remaining, previous)
      )
    case H.FPruneDelivery{+frame, +advice, +remaining, +after} H.FDeliveryFacts{
      +present,
      +owned,
      +findings,
      +round,
      +work
    }:
      prune_present(
        inv,
        id,
        frame,
        advice,
        remaining,
        after,
        H.FDeliveryFacts{present, owned, findings, round, work}
      )
    case H.FPrunePending{+frame, +advice, +findings, +remaining, +after} H.FCount{+pending}:
      prune_needed(Nat.is_gt(findings, pending), inv, id, frame, advice, remaining, after)
    case H.FPruneReleased{+frame, +remaining, +after} H.FAck{}: prune_next(
      inv,
      id,
      frame,
      remaining,
      after
    )
    case H.FOffersRead{+frame, +remaining, +offers, +after} H.FHandles{+items}:
      offers_next(
        inv,
        id,
        frame,
        remaining,
        List.append(&2, Nat, List.reverse(&2, Nat, items), offers),
        after
      )
    case H.FFitted{+frame, +after} H.FHandles{+accepted}:
      updates_next(inv, id, frame, frame_advice(frame), accepted, 0n, after)
    case H.FUpdateDelivery{+frame, +advice, +remaining, +accepted, +index, +after} H.FDeliveryFacts{
      True{},
      _,
      +findings,
      _,
      _
    }:
      update_filtered(
        inv,
        id,
        frame,
        advice,
        remaining,
        accepted,
        after,
        filter_findings(findings, accepted, index)
      )
    case H.FUpdateDelivery{+frame, _, +remaining, +accepted, +index, +after} H.FDeliveryFacts{
      False{},
      _,
      _,
      _,
      _
    }:
      updates_next(inv, id, frame, remaining, accepted, index, after)
    case H.FUpdated{+frame, +advice, +remaining, +accepted, +index, True{}, +after} H.FAck{}:
      f_request(
        inv,
        id,
        H.FUpdateReleased{frame, remaining, accepted, index, after},
        H.FReleaseAdvice{advice}
      )
    case H.FUpdated{+frame, _, +remaining, +accepted, +index, False{}, +after} H.FAck{}:
      updates_next(inv, id, frame, remaining, accepted, index, after)
    case H.FUpdateReleased{+frame, +remaining, +accepted, +index, +after} H.FAck{}:
      updates_next(inv, id, frame, remaining, accepted, index, after)
    case H.FContentRead{+frame, +advice, +remaining, +contents} H.FHandle{+content}:
      contents_next(inv, id, frame, remaining, H.FCaptured{advice, content} <> contents)
    case H.FFindingsRead{+frame, +remaining, +contents, +findings} H.FHandles{+items}:
      findings_next(
        inv,
        id,
        frame,
        remaining,
        contents,
        List.append(&2, Nat, List.reverse(&2, Nat, items), findings)
      )
    case H.FNoticesRead{+frame, +contents, +findings} H.FHandles{+notices}:
      Bool.pick(
        H.FStep,
        stop_surface(frame_input(frame)),
        f_request(
          inv,
          id,
          H.FOutputChecked{H.FOutput{frame, contents, findings, notices}},
          H.FOutputFit{findings, notices}
        ),
        notices_next(inv, id, H.FOutput{frame, contents, findings, notices}, notices)
      )
    case H.FOutputChecked{H.FOutput{+frame, +contents, +findings, +notices}} H.FTruth{True{}}:
      notices_next(inv, id, H.FOutput{frame, contents, findings, notices}, notices)
    case H.FOutputChecked{_} H.FTruth{False{}}: f_request(
      inv,
      id,
      H.FOutputReleased{},
      H.FReleaseDelivery{}
    )
    case H.FOutputReleased{} H.FAck{}: H.FDone{H.FEmpty{}}
    case H.FNoticeRenewed{+output, +remaining} H.FAck{}: notices_next(inv, id, output, remaining)
    case H.FAuthorityGate{_} H.FOptionalResponse{Some{+value}}:
      f_request(inv, id, H.FAuthorityReleased{value}, H.FReleaseDelivery{})
    case H.FAuthorityGate{
      H.FOutput{H.FFrame{+input, +advice, +blocking}, +contents, +findings, +notices}
    } H.FOptionalResponse{None{}}:
      Bool.pick(
        H.FStep,
        edit(input),
        f_request(
          inv,
          id,
          H.FAuthorityChecked{
            H.FOutput{H.FFrame{input, advice, blocking}, contents, findings, notices}
          },
          H.FFinalAuthority{blocking}
        ),
        build_output(
          inv,
          id,
          H.FOutput{H.FFrame{input, advice, blocking}, contents, findings, notices}
        )
      )
    case H.FAuthorityReleased{+value} H.FAck{}: H.FDone{H.FResponseHandle{value}}
    case H.FAuthorityChecked{+output} H.FTruth{True{}}: build_output(inv, id, output)
    case H.FAuthorityChecked{_} H.FTruth{False{}}:
      f_request(inv, id, H.FAuthorityFallbackReleased{}, H.FReleaseDelivery{})
    case H.FAuthorityFallbackReleased{} H.FAck{}: f_request(
      inv,
      id,
      H.FNonAdviceResponse{},
      H.FEditStatus{}
    )
    case H.FResponseBuilt{H.FOutput{H.FFrame{_, +advice, _}, +contents, +findings, _}} H.FHandle{
      +value
    }:
      f_request(
        inv,
        id,
        H.FResponseObserved{value},
        H.FObserveMessage{value, findings, contents, advice}
      )
    case H.FResponseObserved{+value} H.FAck{}: H.FDone{H.FResponseHandle{value}}
    case _ _: H.FRejected{}

def f_accept(
  +valid: Bool,
  +inv: Nat,
  +id: Nat,
  +phase: H.FPhase,
  +response: H.FResponse
) -> H.FStep:
  match valid:
    case False{}: H.FRejected{}
    case True{}: f_response(inv, Nat.add(id, 1n), phase, response)

def finalize_spec_resume(+step: H.FStep, +reply: H.FReply) -> H.FStep:
  match step reply:
    case H.FAwait{H.FState{+inv, +id, +phase}, H.FRequest{+owner, +request, _}} H.FReply{
      +actual,
      +received,
      +response
    }:
      f_accept(correlated(inv, id, owner, request, actual, received), inv, id, phase, response)
    case _ _: H.FRejected{}

# Finish binding uses the first pending operation match, even if its count is zero.
def pending_first(+items: List<&2, H.RPending>, +operation: Nat) -> Nat:
  match items:
    case Nil{}: 0n
    case H.RPending{+actual, +count} <> +tail:
      Bool.pick(Nat, Nat.is_eq(actual, operation), count, pending_first(tail, operation))

def selected_snapshot(
  +owned: Bool,
  +handle: Nat,
  +count: Nat,
  +valid: Bool,
  +tail: H.RSelection
) -> H.RSelection:
  match owned tail:
    case False{} +rest: rest
    case True{} H.RSelection{+selected, +total, +rest_valid}:
      H.RSelection{handle <> selected, Nat.add(count, total), Bool.and(valid, rest_valid)}

def reconcile_spec_selection(
  +items: List<&2, H.RSnapshot>,
  +pending: List<&2, H.RPending>
) -> H.RSelection:
  match items:
    case Nil{}: H.RSelection{[], 0n, True{}}
    case H.RSnapshot{+handle, +owned, +round, +work, +delivery, +count, +operation} <> +tail:
      selected_snapshot(
        owned,
        handle,
        count,
        Bool.and(
          round,
          Bool.and(work, Bool.and(delivery, Nat.is_le(count, pending_first(pending, operation))))
        ),
        reconcile_spec_selection(tail, pending)
      )

def reconcile_spec_binding(
  +advice: Bool,
  +findings: Nat,
  +round: Bool,
  +count: Nat,
  +valid: Bool
) -> Bool:
  match advice findings:
    case False{} _: True{}
    case True{} 0n: True{}
    case True{} _:
      Bool.and(round, Bool.and(Nat.is_eq(findings, count), valid))

def r_request(+inv: Nat, +id: Nat, +phase: H.RPhase, +command: H.RCommand) -> H.RStep:
  H.RAwait{inv, id, phase, H.RRequest{inv, id, command}}

def reconcile_spec_initial(+inv: Nat, +input: H.RInput) -> H.RStep:
  match input:
    case H.RInput{True{}, True{}, _, _, _, _}: r_request(inv, 1n, H.RRevoked{input}, H.RRevoke{})
    case _: H.RFinal{}

def reserve_finish_spec_initial(+inv: Nat, +input: H.RInput) -> H.RStep:
  match input:
    case H.RInput{False{}, _, _, _, _, _}: H.RFinal{}
    case _: r_request(inv, 1n, H.RRoundRead{H.RFlow{H.RReservation{}, input}}, H.RRound{})

def r_clock(+inv: Nat, +id: Nat, +flow: H.RFlow, +round: Bool, +selection: H.RSelection) -> H.RStep:
  match flow selection:
    case H.RFlow{_, H.RInput{_, _, +advice, +findings, _, _}} H.RSelection{
      +selected,
      +count,
      +valid
    }:
      r_request(
        inv,
        id,
        H.RClockRead{
          flow,
          H.RSelection{
            selected,
            count,
            reconcile_spec_binding(advice, findings, round, count, valid)
          }
        },
        H.RClock{}
      )

def r_decide(+inv: Nat, +id: Nat, +flow: H.RFlow, +selection: H.RSelection) -> H.RStep:
  match flow selection:
    case H.RFlow{H.RReservation{}, H.RInput{_, _, +advice, _, _, _}} H.RSelection{
      +selected,
      _,
      +binding
    }:
      r_request(
        inv,
        id,
        H.ROutputDecided{H.RReservation{}, advice},
        H.RDecide{selected, binding, True{}, True{}}
      )
    case H.RFlow{H.RReconcile{}, H.RInput{_, _, +advice, _, +writable, +same}} H.RSelection{
      +selected,
      _,
      +binding
    }:
      r_request(inv, id, H.ROutputDecided{H.RReconcile{}, advice},
        H.RDecide{selected, binding, Bool.and(writable, Bool.and(advice, same)), False{}})

def r_allow(+inv: Nat, +id: Nat, +advice: Bool, +reason: H.RReason, +result: H.RNext) -> H.RStep:
  match advice:
    case True{}: r_request(inv, id, H.RReleasedFinal{reason, result}, H.RRelease{False{}})
    case False{}: r_request(inv, id, H.RAllowedFinish{result}, H.RAllow{reason})

def r_output(+inv: Nat, +id: Nat, +mode: H.RMode, +advice: Bool, +decision: H.RDecision) -> H.RStep:
  match mode advice decision:
    case _ _ H.RReserved{}: H.RFinal{}
    case H.RReservation{} _ H.RNotices{}: H.RFinal{}
    case H.RReservation{} True{} H.RFailed{}: r_request(
      inv,
      id,
      H.RFailedReleased{},
      H.RRelease{False{}}
    )
    case H.RReservation{} False{} H.RFailed{}: H.REmpty{}
    case H.RReservation{} False{} H.RAllowed{+reason}: r_allow(
      inv,
      id,
      False{},
      reason,
      H.RReturnFinal{}
    )
    case _ +advice H.RAllowed{+reason}: r_allow(inv, id, advice, reason, H.RReturnEmpty{})
    case H.RReconcile{} +advice _: r_allow(inv, id, advice, H.RUnavailable{}, H.RReturnEmpty{})

def r_response(+inv: Nat, +id: Nat, +phase: H.RPhase, +response: H.RResponse) -> H.RStep:
  match phase response:
    case H.RRevoked{+input} H.RTruth{True{}}:
      r_request(inv, id, H.RRoundRead{H.RFlow{H.RReconcile{}, input}}, H.RRound{})
    case H.RRevoked{_} H.RTruth{False{}}:
      r_request(inv, id, H.RReleasedProvisional{}, H.RRelease{True{}})
    case H.RReleasedProvisional{} H.RAck{}:
      r_request(inv, id, H.RAllowedFinish{H.RReturnEmpty{}}, H.RAllow{H.RUnavailable{}})
    case H.RRoundRead{
      H.RFlow{+mode, H.RInput{+finish, +provisional, True{}, +findings, +writable, +same}}
    } H.RTruth{+round}:
      r_request(
        inv,
        id,
        H.RSnapshotsRead{
          H.RFlow{mode, H.RInput{finish, provisional, True{}, findings, writable, same}},
          round
        },
        H.RSnapshots{}
      )
    case H.RRoundRead{
      H.RFlow{+mode, H.RInput{+finish, +provisional, False{}, +findings, +writable, +same}}
    } H.RTruth{+round}:
      r_request(
        inv,
        id,
        H.RPendingRead{
          H.RFlow{mode, H.RInput{finish, provisional, False{}, findings, writable, same}},
          round,
          []
        },
        H.RPendingFindings{}
      )
    case H.RSnapshotsRead{+flow, +round} H.RSnapshotValues{+values}:
      r_request(inv, id, H.RPendingRead{flow, round, values}, H.RPendingFindings{})
    case H.RPendingRead{+flow, +round, +snapshots} H.RPendingValues{+pending}:
      r_clock(inv, id, flow, round, reconcile_spec_selection(snapshots, pending))
    case H.RClockRead{+flow, +selection} H.RAck{}: r_decide(inv, id, flow, selection)
    case H.ROutputDecided{+mode, +advice} H.RDecided{+decision}: r_output(
      inv,
      id,
      mode,
      advice,
      decision
    )
    case H.RReleasedFinal{+reason, +result} H.RAck{}:
      r_request(inv, id, H.RAllowedFinish{result}, H.RAllow{reason})
    case H.RFailedReleased{} H.RAck{}: H.REmpty{}
    case H.RAllowedFinish{H.RReturnFinal{}} H.RAck{}: H.RFinal{}
    case H.RAllowedFinish{H.RReturnEmpty{}} H.RAck{}: H.REmpty{}
    case _ _: H.RRejected{}

def r_accept(
  +valid: Bool,
  +inv: Nat,
  +id: Nat,
  +phase: H.RPhase,
  +response: H.RResponse
) -> H.RStep:
  match valid:
    case False{}: H.RRejected{}
    case True{}: r_response(inv, Nat.add(id, 1n), phase, response)

def reconcile_spec_resume(+step: H.RStep, +reply: H.RReply) -> H.RStep:
  match step reply:
    case H.RAwait{+inv, +id, +phase, H.RRequest{+owner, +request, _}} H.RReply{
      +actual,
      +received,
      +response
    }:
      r_accept(correlated(inv, id, owner, request, actual, received), inv, id, phase, response)
    case _ _: H.RRejected{}

# D exposes every F/R command. Local decoding ends immediately; transport always
# observes canWrite once before deciding whether reconciliation itself is needed.
def d_request(+inv: Nat, +id: Nat, +phase: H.DPhase, +command: H.DCommand) -> H.DStep:
  H.DAwait{inv, id, phase, H.DRequest{inv, id, command}}

def d_final(+inv: Nat, +id: Nat, +transport: Bool, +step: H.FStep) -> H.DStep:
  match step:
    case H.FAwait{_, H.FRequest{_, _, +command}}:
      d_request(inv, id, H.DFinalizing{transport, step}, H.DFinalize{command})
    case H.FDone{+result}: d_request(inv, id, H.DDecoding{transport}, H.DDecode{result})
    case H.FRejected{}: H.DRejected{}

def d_reconcile(+inv: Nat, +id: Nat, +step: H.RStep) -> H.DStep:
  match step:
    case H.RAwait{_, _, _, H.RRequest{_, _, +command}}:
      d_request(inv, id, H.DReconciling{step}, H.DReconcile{command})
    case H.RFinal{}: H.DDone{False{}}
    case H.REmpty{}: H.DDone{True{}}
    case H.RRejected{}: H.DRejected{}

def delivery_finalize_spec_initial(+inv: Nat, +transport: Bool, +input: H.FInput) -> H.DStep:
  d_final(inv, 1n, transport, finalize_spec_initial(inv, input))

def d_response(+inv: Nat, +id: Nat, +phase: H.DPhase, +response: H.DResponse) -> H.DStep:
  match phase response:
    case H.DFinalizing{+transport, H.FAwait{+state, H.FRequest{+owner, +request_id, +command}}} H.DFinalized{
      +value
    }:
      d_final(
        inv,
        id,
        transport,
        finalize_spec_resume(
          H.FAwait{state, H.FRequest{owner, request_id, command}},
          H.FReply{owner, request_id, value}
        )
      )
    case H.DDecoding{False{}} H.DDecoded{}: H.DDone{False{}}
    case H.DDecoding{True{}} H.DDecoded{}: d_request(inv, id, H.DWritability{}, H.DCanWrite{})
    case H.DWritability{} H.DFinishInput{+input}: d_reconcile(
      inv,
      id,
      reconcile_spec_initial(inv, input)
    )
    case H.DReconciling{H.RAwait{+owner, +request_id, +phase, +request}} H.DReconciled{+value}:
      d_reconcile(inv, id, reconcile_spec_resume(
        H.RAwait{owner, request_id, phase, request}, H.RReply{owner, request_id, value}))
    case _ _: H.DRejected{}

def d_accept(
  +valid: Bool,
  +inv: Nat,
  +id: Nat,
  +phase: H.DPhase,
  +response: H.DResponse
) -> H.DStep:
  match valid:
    case False{}: H.DRejected{}
    case True{}: d_response(inv, Nat.add(id, 1n), phase, response)

def delivery_finalize_spec_resume(+step: H.DStep, +reply: H.DReply) -> H.DStep:
  match step reply:
    case H.DAwait{+inv, +id, +phase, H.DRequest{+owner, +request, _}} H.DReply{
      +actual,
      +received,
      +response
    }:
      d_accept(correlated(inv, id, owner, request, actual, received), inv, id, phase, response)
    case _ _: H.DRejected{}

def trace_finalize_prepend(
  +request: H.DRequest,
  +trace: Trace.FinalizeTrace
) -> Trace.FinalizeTrace:
  match trace:
    case Trace.FinalizeTrace{+requests, +remaining, +final}:
      Trace.FinalizeTrace{request <> requests, remaining, final}

def run_finalize(+replies: List<&2, H.DReply>, +step: H.DStep) -> Trace.FinalizeTrace:
  match replies step:
    case Nil{} _: Trace.FinalizeTrace{[], [], step}
    case +reply <> +rest H.DAwait{_, _, _, +request}:
      trace_finalize_prepend(
        request,
        run_finalize(rest, delivery_finalize_spec_resume(step, reply))
      )
    case _ _: Trace.FinalizeTrace{[], replies, step}

def trace_reconcile_prepend(
  +request: H.RRequest,
  +trace: Trace.ReconcileTrace
) -> Trace.ReconcileTrace:
  match trace:
    case Trace.ReconcileTrace{+requests, +remaining, +final}:
      Trace.ReconcileTrace{request <> requests, remaining, final}

def run_reconcile(+replies: List<&2, H.RReply>, +step: H.RStep) -> Trace.ReconcileTrace:
  match replies step:
    case Nil{} _: Trace.ReconcileTrace{[], [], step}
    case +reply <> +rest H.RAwait{_, _, _, +request}:
      trace_reconcile_prepend(request, run_reconcile(rest, reconcile_spec_resume(step, reply)))
    case _ _: Trace.ReconcileTrace{[], replies, step}

def main() -> Unit:
  Unit{}
