import Base
import ../Handoff.bend as H
import ./DeliveryTrace.bend as Trace

# Draft independent Prepare behavioral specification; no laws or proofs are claimed.
# H supplies nominal command/state types only. This module never invokes H policy.
# PVerifiedAll is an observation boundary: its nested native callbacks and K trace
# require their own comparison against the callback/commit entries below.

def contains_number(+values: List<&2, Nat>, +wanted: Nat) -> Bool:
  match values:
    case Nil{}: False{}
    case +head <> +tail:
      Bool.or(Nat.is_eq(head, wanted), contains_number(tail, wanted))

def include_handle(+include: Bool, +value: Nat, +tail: List<&2, Nat>) -> List<&2, Nat>:
  match include:
    case True{}: value <> tail
    case False{}: tail

def handle(+item: H.PItem) -> Nat:
  match item:
    case H.PItem{+value, _, _, _, _}: value

def partition(+item: H.PItem) -> Nat:
  match item:
    case H.PItem{_, _, _, +value, _}: value

# Membership is identity-based, including duplicate identities in other partitions.
def identity_partition(+items: List<&2, H.PItem>, +identity: Nat, +owner: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case H.PItem{_, +actual, _, +group, _} <> +tail:
      Bool.or(Bool.and(Nat.is_eq(actual, identity), Nat.is_eq(group, owner)),
        identity_partition(tail, identity, owner))

def partition_members(
  +items: List<&2, H.PItem>,
  +all: List<&2, H.PItem>,
  +owner: Nat
) -> List<&2, Nat>:
  match items:
    case Nil{}: []
    case H.PItem{+slot, +identity, _, _, _} <> +tail:
      include_handle(
        identity_partition(all, identity, owner),
        slot,
        partition_members(tail, all, owner)
      )

def owned_identity(+items: List<&2, H.PItem>, +identity: Nat, +owners: List<&2, Nat>) -> Bool:
  match items:
    case Nil{}: False{}
    case H.PItem{_, +actual, _, +group, _} <> +tail:
      Bool.or(Bool.and(Nat.is_eq(actual, identity), contains_number(owners, group)),
        owned_identity(tail, identity, owners))

def admitted_members(
  +items: List<&2, H.PItem>,
  +all: List<&2, H.PItem>,
  +owners: List<&2, Nat>
) -> List<&2, Nat>:
  match items:
    case Nil{}: []
    case H.PItem{+slot, +identity, _, _, _} <> +tail:
      include_handle(
        owned_identity(all, identity, owners),
        slot,
        admitted_members(tail, all, owners)
      )

def unavailable_members(+items: List<&2, H.PItem>, +unavailable: List<&2, Nat>) -> List<&2, Nat>:
  match items:
    case Nil{}: []
    case H.PItem{+slot, _, _, +group, _} <> +tail:
      include_handle(
        contains_number(unavailable, group),
        slot,
        unavailable_members(tail, unavailable)
      )

def prepare_spec_unavailable(+frame: H.PFrame, +group: Nat) -> H.PFrame:
  match frame:
    case H.PFrame{+items, +owners, +unavailable}: H.PFrame{items, owners, group <> unavailable}

def reserve_result(+frame: H.PFrame, +group: Nat, +accepted: Bool) -> H.PFrame:
  match frame accepted:
    case H.PFrame{+items, +owners, +unavailable} True{}: H.PFrame{
      items,
      group <> owners,
      unavailable
    }
    case +value False{}: prepare_spec_unavailable(value, group)

def request(+invocation: Nat, +id: Nat, +phase: H.PPhase, +command: H.PCommand) -> H.PStep:
  H.PAwait{invocation, id, phase, H.PRequest{invocation, id, command}}

# Skip only a seen prefix; preserve the untouched suffix for the next reply.
def unseen(
  +items: List<&2, H.PItem>,
  +owners: List<&2, Nat>,
  +unavailable: List<&2, Nat>
) -> List<&2, H.PItem>:
  match items:
    case Nil{}: []
    case +head <> +tail:
      Bool.pick(
        List<&2, H.PItem>,
        Bool.or(
          contains_number(owners, partition(head)),
          contains_number(unavailable, partition(head))
        ),
        unseen(tail, owners, unavailable),
        head <> tail
      )

def reserve_next(
  +remaining: List<&2, H.PItem>,
  +frame: H.PFrame,
  +invocation: Nat,
  +id: Nat
) -> H.PStep:
  match remaining frame:
    case Nil{} H.PFrame{+items, +owners, +unavailable}:
      request(invocation, id, H.PAllVerified{},
        H.PVerifyAll{H.PFrame{items, owners, unavailable}, admitted_members(items, items, owners)})
    case +head <> +tail H.PFrame{+items, +owners, +unavailable}:
      request(
        invocation,
        id,
        H.PPartitionReserved{H.PFrame{items, owners, unavailable}, tail, partition(head)},
        H.PReservePartition{handle(head), partition_members(items, items, partition(head))}
      )

def reservations(
  +remaining: List<&2, H.PItem>,
  +frame: H.PFrame,
  +invocation: Nat,
  +id: Nat
) -> H.PStep:
  match frame:
    case H.PFrame{+items, +owners, +unavailable}:
      reserve_next(
        unseen(remaining, owners, unavailable),
        H.PFrame{items, owners, unavailable},
        invocation,
        id
      )

def begin_reservations(+items: List<&2, H.PItem>, +invocation: Nat, +id: Nat) -> H.PStep:
  reservations(items, H.PFrame{items, [], []}, invocation, id)

def workspace_next(
  +remaining: List<&2, H.PItem>,
  +reversed: List<&2, H.PItem>,
  +invocation: Nat,
  +id: Nat
) -> H.PStep:
  match remaining:
    case Nil{}: begin_reservations(List.reverse(&2, H.PItem, reversed), invocation, id)
    case +head <> +tail:
      request(
        invocation,
        id,
        H.PWorkspaceStarted{head, tail, reversed},
        H.PStartWorkspace{handle(head)}
      )

def facts_next(
  +remaining: List<&2, Nat>,
  +reversed: List<&2, H.PItem>,
  +invocation: Nat,
  +id: Nat
) -> H.PStep:
  match remaining:
    case Nil{}: workspace_next(List.reverse(&2, H.PItem, reversed), [], invocation, id)
    case +head <> +tail: request(invocation, id, H.PFactsRead{tail, reversed}, H.PFacts{head})

def keep_item(+keep: Bool, +item: H.PItem, +rest: List<&2, H.PItem>) -> List<&2, H.PItem>:
  match keep:
    case True{}: item <> rest
    case False{}: rest

def begin(+invocation: Nat, +advice: Bool, +id: Nat) -> H.PStep:
  match advice:
    case False{}: H.PDone{}
    case True{}: request(invocation, id, H.PAdviceRead{}, H.PAdvice{})

def prepare_spec_initial(+invocation: Nat, +advice: Bool) -> H.PStep:
  begin(invocation, advice, 1n)

def prepare_spec_transport_initial(+invocation: Nat, +advice: Bool) -> H.PStep:
  request(invocation, 1n, H.PResponseGated{advice}, H.PResponseGate{})

def prepare_response(
  +invocation: Nat,
  +next: Nat,
  +phase: H.PPhase,
  +response: H.PResponse
) -> H.PStep:
  match phase response:
    case H.PResponseGated{+advice} H.PAck{}:
      request(invocation, next, H.PResponseBarriered{advice}, H.PResponseBarrier{})
    case H.PResponseBarriered{+advice} H.PAck{}: begin(invocation, advice, next)
    case H.PAdviceRead{} H.PHandles{+items}: facts_next(items, [], invocation, next)
    case H.PFactsRead{+remaining, +selected} H.PAdviceFacts{+item, +owned}:
      facts_next(remaining, keep_item(owned, item, selected), invocation, next)
    case H.PWorkspaceStarted{_, +remaining, +eligible} H.PWorkspace{None{}}:
      workspace_next(remaining, eligible, invocation, next)
    case H.PWorkspaceStarted{+item, +remaining, +eligible} H.PWorkspace{Some{+workspace}}:
      request(invocation, next, H.PWorkspaceChecked{item, remaining, eligible},
        H.PCheckWorkspace{handle(item), workspace})
    case H.PWorkspaceChecked{+item, +remaining, +eligible} H.PTruth{+available}:
      workspace_next(remaining, keep_item(available, item, eligible), invocation, next)
    case H.PPartitionReserved{+frame, +remaining, +group} H.PTruth{+accepted}:
      reservations(remaining, reserve_result(frame, group, accepted), invocation, next)
    case H.PAllVerified{} H.PVerifiedAll{H.PFrame{+items, _, +unavailable}}:
      request(
        invocation,
        next,
        H.PUnavailableDeleted{},
        H.PDeleteUnavailable{unavailable_members(items, unavailable)}
      )
    case H.PUnavailableDeleted{} H.PAck{}: H.PDone{}
    case _ _: H.PRejected{}

def prepare_correlated(
  +valid: Bool,
  +invocation: Nat,
  +id: Nat,
  +phase: H.PPhase,
  +response: H.PResponse
) -> H.PStep:
  match valid:
    case False{}: H.PRejected{}
    case True{}: prepare_response(invocation, Nat.add(id, 1n), phase, response)

def prepare_spec_resume(+step: H.PStep, +reply: H.PReply) -> H.PStep:
  match step reply:
    case H.PAwait{+invocation, +id, +phase, H.PRequest{+owner, +request_id, _}} H.PReply{
      +actual,
      +received,
      +response
    }:
      prepare_correlated(
        Bool.and(
          Nat.is_eq(invocation, actual),
          Bool.and(
            Nat.is_eq(owner, actual),
            Bool.and(Nat.is_eq(id, received), Nat.is_eq(request_id, received))
          )
        ),
        invocation,
        id,
        phase,
        response
      )
    case _ _: H.PRejected{}

# Stop at the first identity/root, then check ownership. Never search past an
# unowned first match to an owned later duplicate.
def first_choice(+same: Bool, +item: H.PItem, +later: Maybe<&2, H.PItem>) -> Maybe<&2, H.PItem>:
  match same:
    case True{}: Some{item}
    case False{}: later

def first_member(+items: List<&2, H.PItem>, +identity: Nat) -> Maybe<&2, H.PItem>:
  match items:
    case Nil{}: None{}
    case H.PItem{+slot, +actual, +root, +group, +work} <> +tail:
      first_choice(
        Nat.is_eq(actual, identity),
        H.PItem{slot, actual, root, group, work},
        first_member(tail, identity)
      )

def first_source(+items: List<&2, H.PItem>, +root: Nat) -> Maybe<&2, H.PItem>:
  match items:
    case Nil{}: None{}
    case H.PItem{+slot, +identity, +actual, +group, +work} <> +tail:
      first_choice(
        Nat.is_eq(actual, root),
        H.PItem{slot, identity, actual, group, work},
        first_source(tail, root)
      )

def owned_choice(+owned: Bool, +item: H.PItem) -> Maybe<&2, H.PItem>:
  match owned:
    case True{}: Some{item}
    case False{}: None{}

def owned(+found: Maybe<&2, H.PItem>, +owners: List<&2, Nat>) -> Maybe<&2, H.PItem>:
  match found:
    case None{}: None{}
    case Some{+item}: owned_choice(contains_number(owners, partition(item)), item)

def prepare_spec_member(+frame: H.PFrame, +identity: Nat) -> Maybe<&2, H.PItem>:
  match frame:
    case H.PFrame{+items, +owners, _}: owned(first_member(items, identity), owners)

def prepare_spec_source(+frame: H.PFrame, +root: Nat) -> Maybe<&2, H.PItem>:
  match frame:
    case H.PFrame{+items, +owners, _}: owned(first_source(items, root), owners)

def prepare_spec_validation(+unavailable: Bool, +validation: H.PValidation) -> H.PValidationRoute:
  match unavailable validation:
    case True{} _: H.PNoResult{}
    case False{} H.PUnavailableValidation{}: H.PNoResult{}
    case False{} H.PStaleValidation{}: H.PStaleResult{}
    case False{} H.PCurrentValidation{}: H.PCommitResult{}

def prepare_spec_capacity(+previous: Bool, +resized: Bool) -> Bool:
  match previous resized:
    case False{} True{}: False{}
    case _ _: True{}

def prepare_spec_reservation(+resized: Bool, +frame: H.PFrame, +group: Nat) -> H.PReservation:
  match resized:
    case True{}: H.PCaptureAdmitted{frame}
    case False{}: H.PCaptureRefused{prepare_spec_unavailable(frame, group)}

# Nested commit has its own command tape; PVerifiedAll cannot encode these IOs.
def commit_request(+invocation: Nat, +id: Nat, +phase: H.KPhase, +command: H.KCommand) -> H.KStep:
  H.KAwait{invocation, id, phase, H.KRequest{invocation, id, command}}

def prepare_spec_commit_initial(+invocation: Nat, +work: Bool) -> H.KStep:
  match work:
    case True{}: commit_request(invocation, 1n, H.KWorkRevised{}, H.KReviseWork{})
    case False{}: commit_request(invocation, 1n, H.KAdviceRevised{}, H.KReviseAdvice{})

def matching_keys(
  +delivery: List<&2, String>,
  +retained: List<&2, String>,
  +offset: Nat
) -> List<&2, Nat>:
  match delivery:
    case Nil{}: []
    case +key <> +tail:
      include_handle(List.contains(~String, ~String.eq, retained, key), offset,
        matching_keys(tail, retained, Nat.add(offset, 1n)))

def commit_response(
  +invocation: Nat,
  +next: Nat,
  +phase: H.KPhase,
  +response: H.KResponse
) -> H.KStep:
  match phase response:
    case H.KWorkRevised{} H.KTruth{False{}}: H.KDone{False{}}
    case H.KWorkRevised{} H.KTruth{True{}}:
      commit_request(invocation, next, H.KAdviceRevised{}, H.KReviseAdvice{})
    case H.KAdviceRevised{} H.KAck{}: commit_request(
      invocation,
      next,
      H.KKeysRead{},
      H.KFindingKeys{}
    )
    case H.KKeysRead{} H.KKeys{+retained, +delivery}:
      commit_request(
        invocation,
        next,
        H.KDeliveryUpdated{},
        H.KUpdateDelivery{matching_keys(delivery, retained, 0n)}
      )
    case H.KDeliveryUpdated{} H.KAck{}: commit_request(
      invocation,
      next,
      H.KObserved{},
      H.KObserve{}
    )
    case H.KObserved{} H.KAck{}: H.KDone{True{}}
    case _ _: H.KRejected{}

def commit_correlated(
  +valid: Bool,
  +invocation: Nat,
  +id: Nat,
  +phase: H.KPhase,
  +response: H.KResponse
) -> H.KStep:
  match valid:
    case False{}: H.KRejected{}
    case True{}: commit_response(invocation, Nat.add(id, 1n), phase, response)

def prepare_spec_commit_resume(+step: H.KStep, +reply: H.KReply) -> H.KStep:
  match step reply:
    case H.KAwait{+invocation, +id, +phase, H.KRequest{+owner, +request_id, _}} H.KReply{
      +actual,
      +received,
      +response
    }:
      commit_correlated(
        Bool.and(
          Nat.is_eq(invocation, actual),
          Bool.and(
            Nat.is_eq(owner, actual),
            Bool.and(Nat.is_eq(id, received), Nat.is_eq(request_id, received))
          )
        ),
        invocation,
        id,
        phase,
        response
      )
    case _ _: H.KRejected{}

def trace_prepare_prepend(+request: H.PRequest, +trace: Trace.PrepareTrace) -> Trace.PrepareTrace:
  match trace:
    case Trace.PrepareTrace{+requests, +remaining, +final}:
      Trace.PrepareTrace{request <> requests, remaining, final}

def run_prepare(+replies: List<&2, H.PReply>, +step: H.PStep) -> Trace.PrepareTrace:
  match replies step:
    case Nil{} _: Trace.PrepareTrace{[], [], step}
    case +reply <> +rest H.PAwait{_, _, _, +request}:
      trace_prepare_prepend(request, run_prepare(rest, prepare_spec_resume(step, reply)))
    case _ _: Trace.PrepareTrace{[], replies, step}

def trace_commit_prepend(+request: H.KRequest, +trace: Trace.CommitTrace) -> Trace.CommitTrace:
  match trace:
    case Trace.CommitTrace{+requests, +remaining, +final}:
      Trace.CommitTrace{request <> requests, remaining, final}

def run_commit(+replies: List<&2, H.KReply>, +step: H.KStep) -> Trace.CommitTrace:
  match replies step:
    case Nil{} _: Trace.CommitTrace{[], [], step}
    case +reply <> +rest H.KAwait{_, _, _, +request}:
      trace_commit_prepend(request, run_commit(rest, prepare_spec_commit_resume(step, reply)))
    case _ _: Trace.CommitTrace{[], replies, step}

def main() -> Unit:
  Unit{}
