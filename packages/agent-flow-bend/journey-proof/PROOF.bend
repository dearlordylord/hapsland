import Base
import ../Delivery.bend as Delivery
import ../DeliveryState.bend as DeliveryState
import ../SubmissionState.bend as SubmissionState
import ../RevisionState.bend as RevisionState
import ../ReuseState.bend as ReuseState
import ../NoticeState.bend as NoticeState
import ../EditHistory.bend as EditHistory
import ./fixtures.bend as Fixtures
import ../Admission.bend as Admission
import ../Handoff.bend as Handoff
import ./LAWS.bend as Laws
import ./core.bend as Core
import ../Canonical.bend as Canonical
import ../Collection.bend as Collection
import ../CollectionState.bend as CollectionState
import ../Dispatch.bend as Dispatch
import ../Ledger.bend as Ledger
import ../Reuse.bend as Reuse
import ../Work.bend as WorkPolicy
import ../progress-proof/PROOF.bend as Shared

# ---- shared ----
def prepend_work(item: Canonical.ReviewWorkRecord, items: List<&2, Canonical.ReviewWorkRecord>) -> List<&2, Canonical.ReviewWorkRecord>:
  item <> items

def prepend_reply(item: Core.Reply, items: List<&2, Core.Reply>) -> List<&2, Core.Reply>:
  item <> items

def prepend_charge(item: Ledger.ReviewCapacityReservationRecord, items: List<&2, Ledger.ReviewCapacityReservationRecord>) -> List<&2, Ledger.ReviewCapacityReservationRecord>:
  item <> items

def reply_with(id: Nat, disposition: Reuse.JoinedDisposition) -> Core.Reply:
  Core.Reply{id, disposition}

def put_other(
  item: Canonical.ReviewWorkRecord,
  same: Bool,
  items: List<&2, Canonical.ReviewWorkRecord>
) -> List<&2, Canonical.ReviewWorkRecord>:
  Core.other_finding_put(item, items, same)


def release_from(rest: List<&2, Ledger.ReviewCapacityReservationRecord>, state: Ledger.Ledger) -> Maybe<&2, Ledger.Ledger>:
  Core.release_charges(rest, state)

def and_false(+b: Bool) -> {False{} == Bool.and(b, False{}) : Bool}:
  match b:
    case False{}: {==}
    case True{}: {==}

def cutoff_plain(
  item: Canonical.ReviewWorkRecord,
  +filtered: List<&2, Canonical.ReviewWorkRecord>,
  +rest: List<&2, Canonical.ReviewWorkRecord>,
  remove: Bool,
  kept: {Core.findings(item <> filtered) == Core.findings(filtered) : List<&2, Canonical.ReviewWorkRecord>},
  original: {Core.findings(item <> rest) == Core.findings(rest) : List<&2, Canonical.ReviewWorkRecord>},
  ih: {Core.findings(filtered) == Core.findings(rest) : List<&2, Canonical.ReviewWorkRecord>}
) -> {
      Core.findings(Canonical.retain_work_pick(item, filtered, remove))
      == Core.findings(item <> rest)
      : List<&2, Canonical.ReviewWorkRecord>
    }:
  match remove:
    case False{}: Equal.trans(
      List<&2, Canonical.ReviewWorkRecord>,
      Core.findings(item <> filtered),
      Core.findings(filtered),
      Core.findings(item <> rest),
      kept,
      Equal.trans(
        List<&2, Canonical.ReviewWorkRecord>,
        Core.findings(filtered),
        Core.findings(rest),
        Core.findings(item <> rest),
        ih,
        Equal.sym(
          List<&2, Canonical.ReviewWorkRecord>,
          Core.findings(item <> rest),
          Core.findings(rest),
          original
        )
      )
    )
    case True{}: Equal.trans(
      List<&2, Canonical.ReviewWorkRecord>,
      Core.findings(filtered),
      Core.findings(rest),
      Core.findings(item <> rest),
      ih,
      Equal.sym(
        List<&2, Canonical.ReviewWorkRecord>,
        Core.findings(item <> rest),
        Core.findings(rest),
        original
      )
    )

# ---- cutoff_preserves_every_finding ----
def Laws.cutoff_preserves_every_finding(items, partition, lifetime, round):
  match items:
    case Nil{}: {==}
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.PendingFinding{count}, parent} <> rest:
      %and_false(Canonical.same_ids(partition, lifetime, round, p, l, r)) : {
        Core.findings(
          Canonical.retain_work_pick(
            Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.PendingFinding{count}, parent},
            Canonical.retain_after_stop(rest, partition, lifetime, round),
            _
          )
        )
        == Core.findings(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.PendingFinding{count}, parent} <> rest
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      Equal.cong(
        List<&2, Canonical.ReviewWorkRecord>,
        List<&2, Canonical.ReviewWorkRecord>,
        prepend_work(Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.PendingFinding{count}, parent}),
        Core.findings(Canonical.retain_after_stop(rest, partition, lifetime, round)),
        Core.findings(rest),
        Laws.cutoff_preserves_every_finding(rest, partition, lifetime, round)
      )
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.AwaitingSourceRead{}, parent} <> rest:
      cutoff_plain(
        Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.AwaitingSourceRead{}, parent},
        Canonical.retain_after_stop(rest, partition, lifetime, round),
        rest,
        Bool.and(Canonical.same_ids(partition, lifetime, round, p, l, r), True{}),
        {==},
        {==},
        Laws.cutoff_preserves_every_finding(rest, partition, lifetime, round)
      )
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.SourceReading{}, parent} <> rest:
      cutoff_plain(
        Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.SourceReading{}, parent},
        Canonical.retain_after_stop(rest, partition, lifetime, round),
        rest,
        Bool.and(Canonical.same_ids(partition, lifetime, round, p, l, r), True{}),
        {==},
        {==},
        Laws.cutoff_preserves_every_finding(rest, partition, lifetime, round)
      )
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.Preparing{}, parent} <> rest:
      cutoff_plain(
        Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.Preparing{}, parent},
        Canonical.retain_after_stop(rest, partition, lifetime, round),
        rest,
        Bool.and(Canonical.same_ids(partition, lifetime, round, p, l, r), True{}),
        {==},
        {==},
        Laws.cutoff_preserves_every_finding(rest, partition, lifetime, round)
      )
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.Reviewing{}, parent} <> rest:
      cutoff_plain(
        Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.Reviewing{}, parent},
        Canonical.retain_after_stop(rest, partition, lifetime, round),
        rest,
        Bool.and(Canonical.same_ids(partition, lifetime, round, p, l, r), True{}),
        {==},
        {==},
        Laws.cutoff_preserves_every_finding(rest, partition, lifetime, round)
      )
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.ReviewServiceRequestOutstanding{}, parent} <> rest:
      cutoff_plain(
        Canonical.ReviewWorkRecord{p, l, r, op, charge, Canonical.ReviewServiceRequestOutstanding{}, parent},
        Canonical.retain_after_stop(rest, partition, lifetime, round),
        rest,
        Bool.and(Canonical.same_ids(partition, lifetime, round, p, l, r), True{}),
        {==},
        {==},
        Laws.cutoff_preserves_every_finding(rest, partition, lifetime, round)
      )

# ---- removal_preserves_other_findings ----
def remove_other_choice(
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +op: Nat,
  +charge: Nat,
  +kind: Canonical.ReviewWorkPhase,
  +parent: Nat,
  +operation: Nat,
  +filtered: List<&2, Canonical.ReviewWorkRecord>,
  +rest: List<&2, Canonical.ReviewWorkRecord>,
  +hit: Bool,
  +agrees: {hit == Nat.is_eq(op, operation) : Bool},
  ih: {
    Core.other_findings(operation, filtered)
    == Core.other_findings(operation, rest)
    : List<&2, Canonical.ReviewWorkRecord>
  }
) -> {
      Core.other_findings(
        operation,
        Canonical.remove_work_pick(
          Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
          filtered,
          Nat.is_eq(op, operation)
        )
      )
      == Core.other_findings(
        operation,
        Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent} <> rest
      )
      : List<&2, Canonical.ReviewWorkRecord>
    }:
  match kind hit:
    case Canonical.PendingFinding{count} True{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(
          operation,
          Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent} <> rest
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %agrees : {
        Core.other_findings(operation, filtered)
        == Core.other_finding_put(
          Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
          Core.other_findings(operation, rest),
          _
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.PendingFinding{count} False{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(
          operation,
          Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent} <> rest
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %agrees : {
        Core.other_finding_put(
          Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
          Core.other_findings(operation, filtered),
          _
        )
        == Core.other_finding_put(
          Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
          Core.other_findings(operation, rest),
          _
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      Equal.cong(
        List<&2, Canonical.ReviewWorkRecord>,
        List<&2, Canonical.ReviewWorkRecord>,
        prepend_work(Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent}),
        Core.other_findings(operation, filtered),
        Core.other_findings(operation, rest),
        ih
      )
    case Canonical.AwaitingSourceRead{} True{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.AwaitingSourceRead{} False{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.SourceReading{} True{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.SourceReading{} False{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.Preparing{} True{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.Preparing{} False{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.Reviewing{} True{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.Reviewing{} False{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.ReviewServiceRequestOutstanding{} True{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case Canonical.ReviewServiceRequestOutstanding{} False{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.remove_work_pick(
            Canonical.ReviewWorkRecord{partition, lifetime, round, op, charge, kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih

def Laws.removal_preserves_other_findings(items, operation):
  match items:
    case Nil{}: {==}
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest:
      remove_other_choice(
        p,
        l,
        r,
        op,
        charge,
        kind,
        parent,
        operation,
        Canonical.remove_work(operation, rest),
        rest,
        Nat.is_eq(op, operation),
        {==},
        Laws.removal_preserves_other_findings(rest, operation)
      )

# ---- stage_change_preserves_other_findings ----
def same_operation_head(
  +p: Nat,
  +l: Nat,
  +r: Nat,
  +op: Nat,
  +charge: Nat,
  +kind: Canonical.ReviewWorkPhase,
  +parent: Nat,
  +operation: Nat,
  +rest: List<&2, Canonical.ReviewWorkRecord>,
  agrees: {True{} == Nat.is_eq(op, operation) : Bool}
) -> {
      Core.other_findings(operation, rest)
      == Core.other_findings(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
      : List<&2, Canonical.ReviewWorkRecord>
    }:
  match kind:
    case Canonical.PendingFinding{_}:
      %agrees : {
        Core.other_findings(operation, rest)
        == Core.other_finding_put(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
          Core.other_findings(operation, rest),
          _
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      {==}
    case Canonical.AwaitingSourceRead{}: {==}
    case Canonical.SourceReading{}: {==}
    case Canonical.Preparing{}: {==}
    case Canonical.Reviewing{}: {==}
    case Canonical.ReviewServiceRequestOutstanding{}: {==}

def prepend_projection(
  +item: Canonical.ReviewWorkRecord,
  +operation: Nat,
  +filtered: List<&2, Canonical.ReviewWorkRecord>,
  +rest: List<&2, Canonical.ReviewWorkRecord>,
  ih: {
    Core.other_findings(operation, filtered)
    == Core.other_findings(operation, rest)
    : List<&2, Canonical.ReviewWorkRecord>
  }
) -> {
      Core.other_findings(operation, item <> filtered)
      == Core.other_findings(operation, item <> rest)
      : List<&2, Canonical.ReviewWorkRecord>
    }:
  match item:
    case Canonical.ReviewWorkRecord{_, _, _, op, _, Canonical.PendingFinding{_}, _}:
      Equal.cong(
        List<&2, Canonical.ReviewWorkRecord>,
        List<&2, Canonical.ReviewWorkRecord>,
        put_other(item, Nat.is_eq(op, operation)),
        Core.other_findings(operation, filtered),
        Core.other_findings(operation, rest),
        ih
      )
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.AwaitingSourceRead{}, _}: ih
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.SourceReading{}, _}: ih
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.Preparing{}, _}: ih
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.Reviewing{}, _}: ih
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.ReviewServiceRequestOutstanding{}, _}: ih

def change_other_choice(
  +p: Nat,
  +l: Nat,
  +r: Nat,
  +op: Nat,
  +charge: Nat,
  +kind: Canonical.ReviewWorkPhase,
  +parent: Nat,
  +operation: Nat,
  +next_kind: Canonical.ReviewWorkPhase,
  +filtered: List<&2, Canonical.ReviewWorkRecord>,
  +rest: List<&2, Canonical.ReviewWorkRecord>,
  +hit: Bool,
  +agrees: {hit == Nat.is_eq(op, operation) : Bool},
  ih: {
    Core.other_findings(operation, filtered)
    == Core.other_findings(operation, rest)
    : List<&2, Canonical.ReviewWorkRecord>
  }
) -> {
      Core.other_findings(
        operation,
        Canonical.replace_work_kind_pick(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
          Canonical.ReviewWorkRecord{p, l, r, op, charge, next_kind, parent},
          filtered,
          Nat.is_eq(op, operation)
        )
      )
      == Core.other_findings(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
      : List<&2, Canonical.ReviewWorkRecord>
    }:
  match hit:
    case True{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.replace_work_kind_pick(
            Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
            Canonical.ReviewWorkRecord{p, l, r, op, charge, next_kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %same_operation_head(p, l, r, op, charge, next_kind, parent, operation, filtered, agrees) : {
        _
        == Core.other_findings(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %same_operation_head(p, l, r, op, charge, kind, parent, operation, rest, agrees) : {
        Core.other_findings(operation, filtered)
        == _
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case False{}:
      %agrees : {
        Core.other_findings(
          operation,
          Canonical.replace_work_kind_pick(
            Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
            Canonical.ReviewWorkRecord{p, l, r, op, charge, next_kind, parent},
            filtered,
            _
          )
        )
        == Core.other_findings(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      prepend_projection(
        Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
        operation,
        filtered,
        rest,
        ih
      )

def Laws.stage_change_preserves_other_findings(items, operation, kind):
  match items:
    case Nil{}: {==}
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, old_kind, parent} <> rest:
      change_other_choice(
        p,
        l,
        r,
        op,
        charge,
        old_kind,
        parent,
        operation,
        kind,
        Canonical.replace_work_kind(operation, kind, rest),
        rest,
        Nat.is_eq(op, operation),
        {==},
        Laws.stage_change_preserves_other_findings(rest, operation, kind)
      )

# ---- findings_do_not_block_collection ----
def Laws.findings_do_not_block_collection(items, partition, lifetime, round, observation):
  match items:
    case Nil{}: {==}
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.PendingFinding{_}, _} <> rest:
      Laws.findings_do_not_block_collection(rest, partition, lifetime, round, observation)
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.AwaitingSourceRead{}, _} <> rest:
      Laws.findings_do_not_block_collection(rest, partition, lifetime, round, observation)
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.SourceReading{}, _} <> rest:
      Laws.findings_do_not_block_collection(rest, partition, lifetime, round, observation)
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.Preparing{}, _} <> rest:
      Laws.findings_do_not_block_collection(rest, partition, lifetime, round, observation)
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.Reviewing{}, _} <> rest:
      Laws.findings_do_not_block_collection(rest, partition, lifetime, round, observation)
    case Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.ReviewServiceRequestOutstanding{}, _} <> rest:
      Laws.findings_do_not_block_collection(rest, partition, lifetime, round, observation)


# ---- completed_edit_becomes_collectible ----
def or_true(+b: Bool) -> {True{} == Bool.or(b, True{}) : Bool}:
  match b:
    case False{}: {==}
    case True{}: {==}

def ready_positive(
  +state: Canonical.State,
  +collection: CollectionState.State,
  +advice: Nat
) -> {
  Core.collection_eligible(
    Canonical.collection_decision(
      state,
      CollectionState.mark_ready(collection, (1n + advice : Nat), True{}),
      Canonical.EventEstablished{Canonical.CollectionEligible{}},
      Canonical.PolicyDecided{Canonical.CollectionWaiting{}}
    )
  )
  == True{}
  : Bool
}:
  match collection:
    case CollectionState.State{_, _, _, _, _, _, _}: {==}

def Laws.completed_edit_becomes_collectible(
  state,
  advice,
  partition,
  lifetime,
  round,
  observation,
  owned,
  completed
):
  match state:
    case Canonical.State{_, rounds, items, _, _, _, _, collection, _}:
      %owned : {
        Core.collection_eligible(
          Canonical.collection_decision(
            state,
            CollectionState.mark_ready(
              collection,
              (1n + advice : Nat),
              Bool.and(
                _,
                Collection.eligible(
                  Canonical.deciding_round(
                    Canonical.find_round(partition, rounds),
                    partition,
                    lifetime,
                    round
                  ),
                  Bool.not(
                    Bool.or(
                      False{},
                      Canonical.unfinished_for_observation(
                        items,
                        partition,
                        lifetime,
                        round,
                        observation
                      )
                    )
                  )
                )
              )
            ),
            Canonical.EventEstablished{Canonical.CollectionEligible{}},
            Canonical.PolicyDecided{Canonical.CollectionWaiting{}}
          )
        )
        == True{}
        : Bool
      }
      %completed : {
        Core.collection_eligible(
          Canonical.collection_decision(
            state,
            CollectionState.mark_ready(
              collection,
              (1n + advice : Nat),
              Collection.eligible(
                Canonical.deciding_round(
                  Canonical.find_round(partition, rounds),
                  partition,
                  lifetime,
                  round
                ),
                Bool.not(_)
              )
            ),
            Canonical.EventEstablished{Canonical.CollectionEligible{}},
            Canonical.PolicyDecided{Canonical.CollectionWaiting{}}
          )
        )
        == True{}
        : Bool
      }
      %or_true(
        Canonical.deciding_round(
          Canonical.find_round(partition, rounds),
          partition,
          lifetime,
          round
        )
      ) : {
        Core.collection_eligible(
          Canonical.collection_decision(
            state,
            CollectionState.mark_ready(collection, (1n + advice : Nat), _),
            Canonical.EventEstablished{Canonical.CollectionEligible{}},
            Canonical.PolicyDecided{Canonical.CollectionWaiting{}}
          )
        )
        == True{}
        : Bool
      }
      ready_positive(state, collection, advice)

# ---- terminal_owner_resolves_every_member ----
def member_reply(
  +outcome: Canonical.Outcome,
  +revision: Bool,
  +advice: Bool
) -> {
  Reuse.joined_disposition(Core.terminal_state(outcome), False{}, revision, advice)
  == Core.expected_disposition(outcome, revision, advice)
  : Reuse.JoinedDisposition
}:
  match outcome revision advice:
    case Canonical.Finding{} False{} False{}: {==}
    case Canonical.Finding{} False{} True{}: {==}
    case Canonical.Finding{} True{} False{}: {==}
    case Canonical.Finding{} True{} True{}: {==}
    case Canonical.Clear{} False{} False{}: {==}
    case Canonical.Clear{} False{} True{}: {==}
    case Canonical.Clear{} True{} False{}: {==}
    case Canonical.Clear{} True{} True{}: {==}
    case Canonical.Unavailable{} False{} False{}: {==}
    case Canonical.Unavailable{} False{} True{}: {==}
    case Canonical.Unavailable{} True{} False{}: {==}
    case Canonical.Unavailable{} True{} True{}: {==}
    case Canonical.Interrupted{} False{} False{}: {==}
    case Canonical.Interrupted{} False{} True{}: {==}
    case Canonical.Interrupted{} True{} False{}: {==}
    case Canonical.Interrupted{} True{} True{}: {==}
    case Canonical.Discarded{} False{} False{}: {==}
    case Canonical.Discarded{} False{} True{}: {==}
    case Canonical.Discarded{} True{} False{}: {==}
    case Canonical.Discarded{} True{} True{}: {==}

def reply_agrees(
  +member: Core.Member,
  +outcome: Canonical.Outcome
) -> {Core.reply(member, outcome) == Core.expected_reply(member, outcome) : Core.Reply}:
  match member:
    case Core.Member{id, revision, advice}:
      Equal.cong(
        Reuse.JoinedDisposition,
        Core.Reply,
        reply_with(id),
        Reuse.joined_disposition(Core.terminal_state(outcome), False{}, revision, advice),
        Core.expected_disposition(outcome, revision, advice),
        member_reply(outcome, revision, advice)
      )

def Laws.terminal_owner_resolves_every_member(members, outcome):
  match members:
    case Nil{}: {==}
    case member <> rest:
      %Equal.sym(
        Core.Reply,
        Core.reply(member, outcome),
        Core.expected_reply(member, outcome),
        reply_agrees(member, outcome)
      ) : {
        _ <> Core.replies(rest, outcome)
        == Core.expected_reply(member, outcome) <> Core.expected_replies(rest, outcome)
        : List<&2, Core.Reply>
      }
      Equal.cong(
        List<&2, Core.Reply>,
        List<&2, Core.Reply>,
        prepend_reply(Core.expected_reply(member, outcome)),
        Core.replies(rest, outcome),
        Core.expected_replies(rest, outcome),
        Laws.terminal_owner_resolves_every_member(rest, outcome)
      )

# ---- terminal_members_never_remain_pending ----
def expected_reply_done(
  +id: Nat,
  +outcome: Canonical.Outcome,
  +revision: Bool,
  +advice: Bool
) -> {
  True{}
  == Core.resolved_reply(Core.Reply{id, Core.expected_disposition(outcome, revision, advice)})
  : Bool
}:
  match outcome revision advice:
    case Canonical.Finding{} False{} False{}: {==}
    case Canonical.Finding{} False{} True{}: {==}
    case Canonical.Finding{} True{} False{}: {==}
    case Canonical.Finding{} True{} True{}: {==}
    case Canonical.Clear{} False{} False{}: {==}
    case Canonical.Clear{} False{} True{}: {==}
    case Canonical.Clear{} True{} False{}: {==}
    case Canonical.Clear{} True{} True{}: {==}
    case Canonical.Unavailable{} False{} False{}: {==}
    case Canonical.Unavailable{} False{} True{}: {==}
    case Canonical.Unavailable{} True{} False{}: {==}
    case Canonical.Unavailable{} True{} True{}: {==}
    case Canonical.Interrupted{} False{} False{}: {==}
    case Canonical.Interrupted{} False{} True{}: {==}
    case Canonical.Interrupted{} True{} False{}: {==}
    case Canonical.Interrupted{} True{} True{}: {==}
    case Canonical.Discarded{} False{} False{}: {==}
    case Canonical.Discarded{} False{} True{}: {==}
    case Canonical.Discarded{} True{} False{}: {==}
    case Canonical.Discarded{} True{} True{}: {==}

def reply_done(
  +member: Core.Member,
  +outcome: Canonical.Outcome
) -> {True{} == Core.resolved_reply(Core.reply(member, outcome)) : Bool}:
  match member:
    case Core.Member{id, revision, advice}:
      %Equal.sym(
        Reuse.JoinedDisposition,
        Reuse.joined_disposition(Core.terminal_state(outcome), False{}, revision, advice),
        Core.expected_disposition(outcome, revision, advice),
        member_reply(outcome, revision, advice)
      ) : {True{} == Core.resolved_reply(Core.Reply{id, _}) : Bool}
      expected_reply_done(id, outcome, revision, advice)

def Laws.terminal_members_never_remain_pending(members, outcome):
  match members:
    case Nil{}: {==}
    case member <> rest:
      %reply_done(member, outcome) : {
        Bool.and(_, Core.all_resolved(Core.replies(rest, outcome)))
        == True{}
        : Bool
      }
      Laws.terminal_members_never_remain_pending(rest, outcome)

# ---- earliest_runnable_cannot_be_overtaken ----
def waiting_prefix_step(
  +head: Dispatch.ScheduledReviewWork,
  +rest: List<&2, Dispatch.ScheduledReviewWork>,
  +entry: Dispatch.ScheduledReviewWork,
  +later: List<&2, Dispatch.ScheduledReviewWork>,
  +running: List<&2, Dispatch.ScheduledReviewWork>,
  +sequence: Nat,
  +closed: Bool,
  +requests: List<&2, Dispatch.ReviewServiceRequestRecord>,
  waiting: {False{} == Dispatch.can_start(head, running) : Bool} & Core.Waiting(rest, running),
  next: Core.Waiting(
    rest,
    running
  ) -> {
    Dispatch.pump_queued(
      List.append(&2, Dispatch.ScheduledReviewWork, rest, entry <> later),
      running,
      sequence,
      closed,
      requests
    )
    == Dispatch.Advanced{
      Dispatch.State{
        List.append(&2, Dispatch.ScheduledReviewWork, rest, later),
        List.append(&2, Dispatch.ScheduledReviewWork, running, entry <> Nil{}),
        sequence,
        closed,
        requests
      },
      Dispatch.start_command(entry) <> Nil{}
    }
    : Dispatch.DispatchResult
  }
) -> {
      Dispatch.pump_queued(
        head <> List.append(&2, Dispatch.ScheduledReviewWork, rest, entry <> later),
        running,
        sequence,
        closed,
        requests
      )
      == Dispatch.Advanced{
        Dispatch.State{
          head <> List.append(&2, Dispatch.ScheduledReviewWork, rest, later),
          List.append(&2, Dispatch.ScheduledReviewWork, running, entry <> Nil{}),
          sequence,
          closed,
          requests
        },
        Dispatch.start_command(entry) <> Nil{}
      }
      : Dispatch.DispatchResult
    }:
  match waiting:
    case (blocked, tail):
      %blocked : {
        Bool.pick(
          Dispatch.DispatchResult,
          _,
          Dispatch.Advanced{
            Dispatch.State{
              List.append(&2, Dispatch.ScheduledReviewWork, rest, entry <> later),
              List.append(&2, Dispatch.ScheduledReviewWork, running, head <> Nil{}),
              sequence,
              closed,
              requests
            },
            Dispatch.start_command(head) <> Nil{}
          },
          Dispatch.prepend_waiting(
            head,
            Dispatch.pump_queued(
              List.append(&2, Dispatch.ScheduledReviewWork, rest, entry <> later),
              running,
              sequence,
              closed,
              requests
            )
          )
        )
        == Dispatch.Advanced{
          Dispatch.State{
            head <> List.append(&2, Dispatch.ScheduledReviewWork, rest, later),
            List.append(&2, Dispatch.ScheduledReviewWork, running, entry <> Nil{}),
            sequence,
            closed,
            requests
          },
          Dispatch.start_command(entry) <> Nil{}
        }
        : Dispatch.DispatchResult
      }
      %Equal.sym(
        Dispatch.DispatchResult,
        Dispatch.pump_queued(
          List.append(&2, Dispatch.ScheduledReviewWork, rest, entry <> later),
          running,
          sequence,
          closed,
          requests
        ),
        Dispatch.Advanced{
          Dispatch.State{
            List.append(&2, Dispatch.ScheduledReviewWork, rest, later),
            List.append(&2, Dispatch.ScheduledReviewWork, running, entry <> Nil{}),
            sequence,
            closed,
            requests
          },
          Dispatch.start_command(entry) <> Nil{}
        },
        next(tail)
      ) : {
        Dispatch.prepend_waiting(head, _)
        == Dispatch.Advanced{
          Dispatch.State{
            head <> List.append(&2, Dispatch.ScheduledReviewWork, rest, later),
            List.append(&2, Dispatch.ScheduledReviewWork, running, entry <> Nil{}),
            sequence,
            closed,
            requests
          },
          Dispatch.start_command(entry) <> Nil{}
        }
        : Dispatch.DispatchResult
      }
      {==}

def Laws.earliest_runnable_cannot_be_overtaken(
  prefix,
  entry,
  later,
  running,
  sequence,
  closed,
  requests,
  waiting,
  enabled
):
  match prefix:
    case Nil{}:
      %enabled : {
        Bool.pick(
          Dispatch.DispatchResult,
          _,
          Dispatch.Advanced{
            Dispatch.State{
              later,
              List.append(&2, Dispatch.ScheduledReviewWork, running, entry <> Nil{}),
              sequence,
              closed,
              requests
            },
            Dispatch.start_command(entry) <> Nil{}
          },
          Dispatch.prepend_waiting(
            entry,
            Dispatch.pump_queued(later, running, sequence, closed, requests)
          )
        )
        == Dispatch.Advanced{
          Dispatch.State{
            later,
            List.append(&2, Dispatch.ScheduledReviewWork, running, entry <> Nil{}),
            sequence,
            closed,
            requests
          },
          Dispatch.start_command(entry) <> Nil{}
        }
        : Dispatch.DispatchResult
      }
      {==}
    case head <> rest:
      waiting_prefix_step(
        head,
        rest,
        entry,
        later,
        running,
        sequence,
        closed,
        requests,
        waiting,
        tail => Laws.earliest_runnable_cannot_be_overtaken(
          rest,
          entry,
          later,
          running,
          sequence,
          closed,
          requests,
          tail,
          enabled
        )
      )

# ---- transient_resources_drain_without_reset ----
def absent_step(
  +head: Ledger.ReviewCapacityReservationRecord,
  +id: Nat,
  +current: Nat,
  +rest: List<&2, Ledger.ReviewCapacityReservationRecord>,
  absent: {False{} == Nat.is_eq(current, id) : Bool} & Core.Absent(id, rest),
  next: Core.Absent(id, rest) -> {rest == Ledger.remove(id, rest) : List<&2, Ledger.ReviewCapacityReservationRecord>}
) -> {
      head <> rest
      == Ledger.remove.pick(head, Ledger.remove(id, rest), Nat.is_eq(current, id))
      : List<&2, Ledger.ReviewCapacityReservationRecord>
    }:
  match absent:
    case (different, tail):
      %different : {
        head <> rest
        == Ledger.remove.pick(head, Ledger.remove(id, rest), _)
        : List<&2, Ledger.ReviewCapacityReservationRecord>
      }
      Equal.cong(
        List<&2, Ledger.ReviewCapacityReservationRecord>,
        List<&2, Ledger.ReviewCapacityReservationRecord>,
        prepend_charge(head),
        rest,
        Ledger.remove(id, rest),
        next(tail)
      )

def remove_absent(
  +id: Nat,
  +charges: List<&2, Ledger.ReviewCapacityReservationRecord>,
  absent: Core.Absent(id, charges)
) -> {charges == Ledger.remove(id, charges) : List<&2, Ledger.ReviewCapacityReservationRecord>}:
  match charges:
    case Nil{}: {==}
    case Ledger.ReviewCapacityReservationRecord{current, p, bytes, purpose} <> rest:
      absent_step(
        Ledger.ReviewCapacityReservationRecord{current, p, bytes, purpose},
        id,
        current,
        rest,
        absent,
        remove_absent(id, rest)
      )

def release_head(
  +limits: Ledger.Limits,
  +next_id: Nat,
  +id: Nat,
  +p: Nat,
  +bytes: Nat,
  +purpose: Ledger.Purpose,
  +rest: List<&2, Ledger.ReviewCapacityReservationRecord>,
  absent: Core.Absent(id, rest)
) -> {
  Ledger.Granted{Ledger.Ledger{limits, next_id, rest}, id}
  == Ledger.release(
    Ledger.Ledger{limits, next_id, Ledger.ReviewCapacityReservationRecord{id, p, bytes, purpose} <> rest},
    id
  )
  : Ledger.LedgerResult
}:
  %Shared.nat_eq_self(id) : {
    Ledger.Granted{Ledger.Ledger{limits, next_id, rest}, id}
    == Ledger.release.found(
      Ledger.Ledger{limits, next_id, Ledger.ReviewCapacityReservationRecord{id, p, bytes, purpose} <> rest},
      id,
      Ledger.find.pick(Ledger.ReviewCapacityReservationRecord{id, p, bytes, purpose}, Ledger.find(id, rest), _)
    )
    : Ledger.LedgerResult
  }
  %Shared.nat_eq_self(id) : {
    Ledger.Granted{Ledger.Ledger{limits, next_id, rest}, id}
    == Ledger.Granted{
      Ledger.Ledger{
        limits,
        next_id,
        Ledger.remove.pick(Ledger.ReviewCapacityReservationRecord{id, p, bytes, purpose}, Ledger.remove(id, rest), _)
      },
      id
    }
    : Ledger.LedgerResult
  }
  %remove_absent(id, rest, absent) : {
    Ledger.Granted{Ledger.Ledger{limits, next_id, rest}, id}
    == Ledger.Granted{Ledger.Ledger{limits, next_id, _}, id}
    : Ledger.LedgerResult
  }
  {==}

def drain_step(
  +id: Nat,
  +p: Nat,
  +bytes: Nat,
  +purpose: Ledger.Purpose,
  +rest: List<&2, Ledger.ReviewCapacityReservationRecord>,
  +retained: List<&2, Ledger.ReviewCapacityReservationRecord>,
  +limits: Ledger.Limits,
  +next_id: Nat,
  unique: Core.Absent(
    id,
    List.append(&2, Ledger.ReviewCapacityReservationRecord, rest, retained)
  ) & Core.Transient(rest, retained),
  next: Core.Transient(
    rest,
    retained
  ) -> {
    Core.release_charges(
      rest,
      Ledger.Ledger{limits, next_id, List.append(&2, Ledger.ReviewCapacityReservationRecord, rest, retained)}
    )
    == Some{Ledger.Ledger{limits, next_id, retained}}
    : Maybe<&2, Ledger.Ledger>
  }
) -> {
      Core.release_charges(
        Ledger.ReviewCapacityReservationRecord{id, p, bytes, purpose} <> rest,
        Ledger.Ledger{
          limits,
          next_id,
          Ledger.ReviewCapacityReservationRecord{id, p, bytes, purpose} <> List.append(&2, Ledger.ReviewCapacityReservationRecord, rest, retained)
        }
      )
      == Some{Ledger.Ledger{limits, next_id, retained}}
      : Maybe<&2, Ledger.Ledger>
    }:
  match unique:
    case (absent, tail):
      %release_head(
        limits,
        next_id,
        id,
        p,
        bytes,
        purpose,
        List.append(&2, Ledger.ReviewCapacityReservationRecord, rest, retained),
        absent
      ) : {
        Core.release_next(_, release_from(rest))
        == Some{Ledger.Ledger{limits, next_id, retained}}
        : Maybe<&2, Ledger.Ledger>
      }
      next(tail)

def Laws.transient_resources_drain_without_reset(charges, retained, limits, next_id, unique):
  match charges:
    case Nil{}: {==}
    case Ledger.ReviewCapacityReservationRecord{id, p, bytes, purpose} <> rest:
      drain_step(
        id,
        p,
        bytes,
        purpose,
        rest,
        retained,
        limits,
        next_id,
        unique,
        Laws.transient_resources_drain_without_reset(rest, retained, limits, next_id)
      )

# ---- admitted_edit_reaches_resolution_and_submission ----
def journey_permit(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits
) -> {
  Some{Fixtures.permitted(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.IssuePermit{
      (1n + partition : Nat),
      1n,
      1n,
      1n,
      10n,
      1n,
      0n,
      Admission.ProspectiveFacts{True{}, 5n, 1n, 1n, 1n, 1n}
    },
    Canonical.step(
      Fixtures.initial(partition, size, fingerprint, limits),
      Canonical.IssuePermit{
        (1n + partition : Nat),
        1n,
        1n,
        1n,
        10n,
        1n,
        0n,
        Admission.ProspectiveFacts{True{}, 5n, 1n, 1n, 1n, 1n}
      }
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.permitted(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.IssuePermit{
        (1n + partition : Nat),
        1n,
        1n,
        1n,
        10n,
        1n,
        0n,
        Admission.ProspectiveFacts{True{}, 5n, 1n, 1n, 1n, 1n}
      },
      Canonical.check_step(
        Canonical.State{
          Ledger.Ledger{limits, 1n, []},
          [],
          [],
          1n,
          1n,
          [],
          Dispatch.State{[], [], 0n, False{}, []},
          CollectionState.State{
            [],
            [],
            [],
            DeliveryState.State{[], [], SubmissionState.State{[], []}},
            RevisionState.State{[], 1n},
            ReuseState.State{[], []},
            NoticeState.State{[]}
          },
          EditHistory.State{[]}
        },
        Canonical.issue_result(
          Canonical.State{
            Ledger.Ledger{limits, 1n, []},
            [],
            [],
            1n,
            1n,
            [],
            Dispatch.State{[], [], 0n, False{}, []},
            CollectionState.State{
              [],
              [],
              [],
              DeliveryState.State{[], [], SubmissionState.State{[], []}},
              RevisionState.State{[], 1n},
              ReuseState.State{[], []},
              NoticeState.State{[]}
            },
            EditHistory.State{[]}
          },
          1n+partition,
          Admission.step.partition(
            Admission.AdmissionState{1n+partition, 1n, 0n, False{}, 0n, 1n, []},
            1n+partition,
            1n,
            Admission.Issue{1n, 1n, 10n, 1n},
            _,
            True{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_consume(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.accepted(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ConsumePermit{(1n + partition : Nat), 1n, 1n, 1n, 1n},
    Canonical.step(
      Fixtures.permitted(partition, size, fingerprint, limits),
      Canonical.ConsumePermit{(1n + partition : Nat), 1n, 1n, 1n, 1n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.accepted(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ConsumePermit{(1n + partition : Nat), 1n, 1n, 1n, 1n},
      Canonical.check_step(
        Fixtures.permitted(partition, size, fingerprint, limits),
        Canonical.consume_result(
          Fixtures.permitted(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          Admission.step(
            Canonical.current_admission_found(
              1n+partition,
              1n,
              Bool.pick(
                Maybe<&2, Admission.AdmissionState>,
                _,
                Some{
                  Admission.AdmissionState{
                    1n+partition,
                    1n,
                    0n,
                    False{},
                    0n,
                    2n,
                    [Admission.Permit{1n, 1n, 1n, 1n, 10n}]
                  }
                },
                None{}
              )
            ),
            1n+partition,
            1n,
            Admission.Consume{1n, 1n, 1n}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.accepted(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ConsumePermit{(1n + partition : Nat), 1n, 1n, 1n, 1n},
      Canonical.check_step(
        Fixtures.permitted(partition, size, fingerprint, limits),
        Canonical.consume_result(
          Fixtures.permitted(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          Admission.step.partition(
            Admission.AdmissionState{
              1n+partition,
              1n,
              0n,
              False{},
              0n,
              2n,
              [Admission.Permit{1n, 1n, 1n, 1n, 10n}]
            },
            1n+partition,
            1n,
            Admission.Consume{1n, 1n, 1n},
            _,
            True{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.accepted(partition, size, fingerprint, limits)}
    == Some{
      Canonical.State{
        Ledger.Ledger{limits, 1n, []},
        [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
        [],
        2n,
        1n,
        Admission.AdmissionState{
          1n+partition,
          1n,
          1n,
          True{},
          0n,
          2n,
          []
        } <> Canonical.retain_admission(
          Admission.AdmissionState{
            1n+partition,
            1n,
            0n,
            False{},
            0n,
            2n,
            [Admission.Permit{1n, 1n, 1n, 1n, 10n}]
          },
          [],
          _
        ),
        Dispatch.State{[], [], 0n, False{}, []},
        CollectionState.State{
          [],
          [],
          [],
          DeliveryState.State{[], [], SubmissionState.State{[], []}},
          RevisionState.State{[], 1n},
          ReuseState.State{[], []},
          NoticeState.State{[]}
        },
        EditHistory.State{[]}
      }
    }
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_admit(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.admitted(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.AdmitObservation{(1n + partition : Nat), 1n, 1n},
    Canonical.step(
      Fixtures.accepted(partition, size, fingerprint, limits),
      Canonical.AdmitObservation{(1n + partition : Nat), 1n, 1n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.admitted(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.AdmitObservation{(1n + partition : Nat), 1n, 1n},
      Canonical.check_step(
        Fixtures.accepted(partition, size, fingerprint, limits),
        Canonical.admit_observation_found(
          Fixtures.accepted(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          Bool.pick(
            Maybe<&2, Canonical.Round>,
            _,
            Some{Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.admitted(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.AdmitObservation{(1n + partition : Nat), 1n, 1n},
      Canonical.check_step(
        Fixtures.accepted(partition, size, fingerprint, limits),
        Bool.pick(
          Canonical.Step,
          Bool.and(Bool.and(_, True{}), True{}),
          Canonical.Advanced{
            Fixtures.admitted(partition, size, fingerprint, limits),
            [Canonical.EventEstablished{Canonical.ObservationAdmitted{1n}}]
          },
          Canonical.Rejected{
            Fixtures.accepted(partition, size, fingerprint, limits),
            Canonical.StaleRound{}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_queue_source(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.queued_source(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.QueueDispatch{(1n + partition : Nat), 1n, 1n, 1n},
    Canonical.step(
      Fixtures.admitted(partition, size, fingerprint, limits),
      Canonical.QueueDispatch{(1n + partition : Nat), 1n, 1n, 1n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.queued_source(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.QueueDispatch{(1n + partition : Nat), 1n, 1n, 1n},
      Canonical.check_step(
        Fixtures.admitted(partition, size, fingerprint, limits),
        Bool.pick(
          Canonical.Step,
          Canonical.work_dispatchable(
            Bool.pick(
              Maybe<&2, Canonical.ReviewWorkRecord>,
              Bool.and(Bool.and(_, True{}), True{}),
              Some{
                Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 1n, 0n, Canonical.AwaitingSourceRead{}, 0n}
              },
              None{}
            )
          ),
          Canonical.dispatch_result(
            Fixtures.admitted(partition, size, fingerprint, limits),
            Bool.pick(
              Dispatch.DispatchResult,
              Bool.or(
                Dispatch.can_start(
                  Dispatch.ScheduledReviewWork{
                    1n+partition,
                    1n,
                    1n,
                    1n,
                    0n,
                    False{},
                    Canonical.dispatch_preparation(
                      Bool.pick(
                        Maybe<&2, Canonical.ReviewWorkRecord>,
                        Bool.and(Bool.and(_, True{}), True{}),
                        Some{
                          Canonical.ReviewWorkRecord{
                            1n+partition,
                            1n,
                            1n,
                            1n,
                            0n,
                            Canonical.AwaitingSourceRead{},
                            0n
                          }
                        },
                        None{}
                      )
                    )
                  },
                  []
                ),
                False{}
              ),
              Dispatch.pump_next_result(
                Dispatch.State{
                  [
                    Dispatch.ScheduledReviewWork{
                      1n+partition,
                      1n,
                      1n,
                      1n,
                      0n,
                      False{},
                      Canonical.dispatch_preparation(
                        Bool.pick(
                          Maybe<&2, Canonical.ReviewWorkRecord>,
                          Bool.and(Bool.and(_, True{}), True{}),
                          Some{
                            Canonical.ReviewWorkRecord{
                              1n+partition,
                              1n,
                              1n,
                              1n,
                              0n,
                              Canonical.AwaitingSourceRead{},
                              0n
                            }
                          },
                          None{}
                        )
                      )
                    }
                  ],
                  [],
                  1n,
                  False{},
                  []
                },
                [],
                Bool.pick(
                  Dispatch.DispatchResult,
                  Dispatch.can_start(
                    Dispatch.ScheduledReviewWork{
                      1n+partition,
                      1n,
                      1n,
                      1n,
                      0n,
                      False{},
                      Canonical.dispatch_preparation(
                        Bool.pick(
                          Maybe<&2, Canonical.ReviewWorkRecord>,
                          Bool.and(Bool.and(_, True{}), True{}),
                          Some{
                            Canonical.ReviewWorkRecord{
                              1n+partition,
                              1n,
                              1n,
                              1n,
                              0n,
                              Canonical.AwaitingSourceRead{},
                              0n
                            }
                          },
                          None{}
                        )
                      )
                    },
                    []
                  ),
                  Dispatch.Advanced{
                    Dispatch.State{
                      [],
                      [
                        Dispatch.ScheduledReviewWork{
                          1n+partition,
                          1n,
                          1n,
                          1n,
                          0n,
                          False{},
                          Canonical.dispatch_preparation(
                            Bool.pick(
                              Maybe<&2, Canonical.ReviewWorkRecord>,
                              Bool.and(Bool.and(_, True{}), True{}),
                              Some{
                                Canonical.ReviewWorkRecord{
                                  1n+partition,
                                  1n,
                                  1n,
                                  1n,
                                  0n,
                                  Canonical.AwaitingSourceRead{},
                                  0n
                                }
                              },
                              None{}
                            )
                          )
                        }
                      ],
                      1n,
                      False{},
                      []
                    },
                    [Dispatch.Started{1n, 0n}]
                  },
                  Dispatch.Advanced{
                    Dispatch.State{
                      [
                        Dispatch.ScheduledReviewWork{
                          1n+partition,
                          1n,
                          1n,
                          1n,
                          0n,
                          False{},
                          Canonical.dispatch_preparation(
                            Bool.pick(
                              Maybe<&2, Canonical.ReviewWorkRecord>,
                              Bool.and(Bool.and(_, True{}), True{}),
                              Some{
                                Canonical.ReviewWorkRecord{
                                  1n+partition,
                                  1n,
                                  1n,
                                  1n,
                                  0n,
                                  Canonical.AwaitingSourceRead{},
                                  0n
                                }
                              },
                              None{}
                            )
                          )
                        }
                      ],
                      [],
                      1n,
                      False{},
                      []
                    },
                    []
                  }
                )
              ),
              Dispatch.Advanced{
                Dispatch.State{
                  [
                    Dispatch.ScheduledReviewWork{
                      1n+partition,
                      1n,
                      1n,
                      1n,
                      0n,
                      False{},
                      Canonical.dispatch_preparation(
                        Bool.pick(
                          Maybe<&2, Canonical.ReviewWorkRecord>,
                          Bool.and(Bool.and(_, True{}), True{}),
                          Some{
                            Canonical.ReviewWorkRecord{
                              1n+partition,
                              1n,
                              1n,
                              1n,
                              0n,
                              Canonical.AwaitingSourceRead{},
                              0n
                            }
                          },
                          None{}
                        )
                      )
                    }
                  ],
                  [],
                  1n,
                  False{},
                  []
                },
                []
              }
            )
          ),
          Canonical.Rejected{
            Fixtures.admitted(partition, size, fingerprint, limits),
            Canonical.StaleOperation{}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_start_source(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.reading(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.StartObservation{(1n + partition : Nat), 1n, 1n, 1n},
    Canonical.step(
      Fixtures.queued_source(partition, size, fingerprint, limits),
      Canonical.StartObservation{(1n + partition : Nat), 1n, 1n, 1n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.reading(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.StartObservation{(1n + partition : Nat), 1n, 1n, 1n},
      Canonical.check_step(
        Fixtures.queued_source(partition, size, fingerprint, limits),
        Canonical.observation_started_found(
          Fixtures.queued_source(partition, size, fingerprint, limits),
          1n,
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 1n, 0n, Canonical.AwaitingSourceRead{}, 0n}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_begin(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.preparing(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.BeginObservedPreparation{(1n + partition : Nat), 1n, 1n, 1n, (1n + size : Nat)},
    Canonical.step(
      Fixtures.reading(partition, size, fingerprint, limits),
      Canonical.BeginObservedPreparation{(1n + partition : Nat), 1n, 1n, 1n, (1n + size : Nat)}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.preparing(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.BeginObservedPreparation{(1n + partition : Nat), 1n, 1n, 1n, (1n + size : Nat)},
      Canonical.check_step(
        Fixtures.reading(partition, size, fingerprint, limits),
        Canonical.begin_observed_found(
          Fixtures.reading(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          1n,
          1n+size,
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 1n, 0n, Canonical.SourceReading{}, 0n}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.preparing(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.BeginObservedPreparation{(1n + partition : Nat), 1n, 1n, 1n, (1n + size : Nat)},
      Canonical.check_step(
        Fixtures.reading(partition, size, fingerprint, limits),
        Canonical.begin_found(
          Fixtures.reading(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          1n+size,
          1n,
          Bool.pick(
            Maybe<&2, Canonical.Round>,
            _,
            Some{Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.preparing(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.BeginObservedPreparation{(1n + partition : Nat), 1n, 1n, 1n, (1n + size : Nat)},
      Canonical.check_step(
        Fixtures.reading(partition, size, fingerprint, limits),
        Bool.pick(
          Canonical.Step,
          Bool.and(Bool.and(_, True{}), True{}),
          Canonical.begin_result(
            Fixtures.reading(partition, size, fingerprint, limits),
            1n+partition,
            1n,
            1n,
            1n,
            Ledger.reserve.check(
              limits,
              1n,
              [],
              1n+partition,
              1n+size,
              Ledger.Preparation{},
              Ledger.decision_fits(
                Ledger.fit_decision(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, 1n+size)
              )
            )
          ),
          Canonical.Rejected{
            Fixtures.reading(partition, size, fingerprint, limits),
            Canonical.StaleRound{}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %room : {
    Some{Fixtures.preparing(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.BeginObservedPreparation{(1n + partition : Nat), 1n, 1n, 1n, (1n + size : Nat)},
      Canonical.check_step(
        Fixtures.reading(partition, size, fingerprint, limits),
        Canonical.begin_result(
          Fixtures.reading(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          1n,
          Ledger.reserve.check(limits, 1n, [], 1n+partition, 1n+size, Ledger.Preparation{}, _)
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_prepare(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.prepared(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.PreparationCompleted{(1n + partition : Nat), 1n, 1n, 2n, (1n + size : Nat) <> Nil{}},
    Canonical.step(
      Fixtures.preparing(partition, size, fingerprint, limits),
      Canonical.PreparationCompleted{(1n + partition : Nat), 1n, 1n, 2n, (1n + size : Nat) <> Nil{}}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.prepared(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.PreparationCompleted{
        (1n + partition : Nat),
        1n,
        1n,
        2n,
        (1n + size : Nat) <> Nil{}
      },
      Canonical.check_step(
        Fixtures.preparing(partition, size, fingerprint, limits),
        Canonical.prepared_found(
          Fixtures.preparing(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          2n,
          [1n+size],
          Bool.pick(
            Maybe<&2, Canonical.Round>,
            _,
            Some{Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}},
            None{}
          ),
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), False{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 1n, 0n, Canonical.SourceReading{}, 0n}},
            Bool.pick(
              Maybe<&2, Canonical.ReviewWorkRecord>,
              Bool.and(Bool.and(_, True{}), True{}),
              Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 2n, 1n, Canonical.Preparing{}, 1n}},
              None{}
            )
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.prepared(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.PreparationCompleted{
        (1n + partition : Nat),
        1n,
        1n,
        2n,
        (1n + size : Nat) <> Nil{}
      },
      Canonical.check_step(
        Fixtures.preparing(partition, size, fingerprint, limits),
        Bool.pick(
          Canonical.Step,
          Bool.and(_, True{}),
          Canonical.prepared_batch(
            Fixtures.preparing(partition, size, fingerprint, limits),
            2n,
            1n,
            1n+partition,
            Ledger.Ledger{limits, 2n, []},
            Canonical.admit_one(
              Ledger.reserve.check(
                limits,
                2n,
                [],
                1n+partition,
                1n+size,
                Ledger.ReviewUnit{},
                Ledger.decision_fits(
                  Ledger.fit_decision(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, 1n+size)
                )
              ),
              1n+partition,
              1n,
              1n,
              3n,
              1n,
              1n+size,
              1n,
              [],
              []
            )
          ),
          Canonical.Rejected{
            Fixtures.preparing(partition, size, fingerprint, limits),
            Canonical.StaleRound{}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %room : {
    Some{Fixtures.prepared(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.PreparationCompleted{
        (1n + partition : Nat),
        1n,
        1n,
        2n,
        (1n + size : Nat) <> Nil{}
      },
      Canonical.check_step(
        Fixtures.preparing(partition, size, fingerprint, limits),
        Canonical.prepared_batch(
          Fixtures.preparing(partition, size, fingerprint, limits),
          2n,
          1n,
          1n+partition,
          Ledger.Ledger{limits, 2n, []},
          Canonical.admit_one(
            Ledger.reserve.check(limits, 2n, [], 1n+partition, 1n+size, Ledger.ReviewUnit{}, _),
            1n+partition,
            1n,
            1n,
            3n,
            1n,
            1n+size,
            1n,
            [],
            []
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_complete_source(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.source_done(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.CompleteObservation{(1n + partition : Nat), 1n, 1n, 1n},
    Canonical.step(
      Fixtures.prepared(partition, size, fingerprint, limits),
      Canonical.CompleteObservation{(1n + partition : Nat), 1n, 1n, 1n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.source_done(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.CompleteObservation{(1n + partition : Nat), 1n, 1n, 1n},
      Canonical.check_step(
        Fixtures.prepared(partition, size, fingerprint, limits),
        Canonical.observation_completed_found(
          Fixtures.prepared(partition, size, fingerprint, limits),
          1n,
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 1n, 0n, Canonical.SourceReading{}, 0n}},
            Bool.pick(
              Maybe<&2, Canonical.ReviewWorkRecord>,
              Bool.and(Bool.and(_, True{}), False{}),
              Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n}},
              None{}
            )
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_settle_source(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.source_settled(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 1n},
    Canonical.step(
      Fixtures.source_done(partition, size, fingerprint, limits),
      Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 1n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.source_settled(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 1n},
      Canonical.check_step(
        Fixtures.source_done(partition, size, fingerprint, limits),
        Canonical.dispatch_result(
          Fixtures.source_done(partition, size, fingerprint, limits),
          Bool.pick(
            Dispatch.DispatchResult,
            Bool.or(Bool.and(_, True{}), False{}),
            Dispatch.Advanced{
              Dispatch.State{
                [],
                Bool.pick(
                  List<&2, Dispatch.ScheduledReviewWork>,
                  Bool.and(_, True{}),
                  [],
                  [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 1n, 0n, False{}, True{}}]
                ),
                1n,
                False{},
                []
              },
              []
            },
            Dispatch.Denied{
              Dispatch.State{
                [],
                [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 1n, 0n, False{}, True{}}],
                1n,
                False{},
                []
              }
            }
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_queue_review(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.queued_review(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.QueueDispatch{(1n + partition : Nat), 1n, 1n, 3n},
    Canonical.step(
      Fixtures.source_settled(partition, size, fingerprint, limits),
      Canonical.QueueDispatch{(1n + partition : Nat), 1n, 1n, 3n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.queued_review(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.QueueDispatch{(1n + partition : Nat), 1n, 1n, 3n},
      Canonical.check_step(
        Fixtures.source_settled(partition, size, fingerprint, limits),
        Bool.pick(
          Canonical.Step,
          Canonical.work_dispatchable(
            Bool.pick(
              Maybe<&2, Canonical.ReviewWorkRecord>,
              Bool.and(Bool.and(_, True{}), True{}),
              Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n}},
              None{}
            )
          ),
          Canonical.dispatch_result(
            Fixtures.source_settled(partition, size, fingerprint, limits),
            Bool.pick(
              Dispatch.DispatchResult,
              Bool.or(
                Dispatch.can_start(
                  Dispatch.ScheduledReviewWork{
                    1n+partition,
                    1n,
                    1n,
                    3n,
                    1n,
                    False{},
                    Canonical.dispatch_preparation(
                      Bool.pick(
                        Maybe<&2, Canonical.ReviewWorkRecord>,
                        Bool.and(Bool.and(_, True{}), True{}),
                        Some{
                          Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n}
                        },
                        None{}
                      )
                    )
                  },
                  []
                ),
                False{}
              ),
              Dispatch.pump_next_result(
                Dispatch.State{
                  [
                    Dispatch.ScheduledReviewWork{
                      1n+partition,
                      1n,
                      1n,
                      3n,
                      1n,
                      False{},
                      Canonical.dispatch_preparation(
                        Bool.pick(
                          Maybe<&2, Canonical.ReviewWorkRecord>,
                          Bool.and(Bool.and(_, True{}), True{}),
                          Some{
                            Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n}
                          },
                          None{}
                        )
                      )
                    }
                  ],
                  [],
                  2n,
                  False{},
                  []
                },
                [],
                Bool.pick(
                  Dispatch.DispatchResult,
                  Dispatch.can_start(
                    Dispatch.ScheduledReviewWork{
                      1n+partition,
                      1n,
                      1n,
                      3n,
                      1n,
                      False{},
                      Canonical.dispatch_preparation(
                        Bool.pick(
                          Maybe<&2, Canonical.ReviewWorkRecord>,
                          Bool.and(Bool.and(_, True{}), True{}),
                          Some{
                            Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n}
                          },
                          None{}
                        )
                      )
                    },
                    []
                  ),
                  Dispatch.Advanced{
                    Dispatch.State{
                      [],
                      [
                        Dispatch.ScheduledReviewWork{
                          1n+partition,
                          1n,
                          1n,
                          3n,
                          1n,
                          False{},
                          Canonical.dispatch_preparation(
                            Bool.pick(
                              Maybe<&2, Canonical.ReviewWorkRecord>,
                              Bool.and(Bool.and(_, True{}), True{}),
                              Some{
                                Canonical.ReviewWorkRecord{
                                  1n+partition,
                                  1n,
                                  1n,
                                  3n,
                                  2n,
                                  Canonical.Reviewing{},
                                  1n
                                }
                              },
                              None{}
                            )
                          )
                        }
                      ],
                      2n,
                      False{},
                      []
                    },
                    [Dispatch.Started{3n, 1n}]
                  },
                  Dispatch.Advanced{
                    Dispatch.State{
                      [
                        Dispatch.ScheduledReviewWork{
                          1n+partition,
                          1n,
                          1n,
                          3n,
                          1n,
                          False{},
                          Canonical.dispatch_preparation(
                            Bool.pick(
                              Maybe<&2, Canonical.ReviewWorkRecord>,
                              Bool.and(Bool.and(_, True{}), True{}),
                              Some{
                                Canonical.ReviewWorkRecord{
                                  1n+partition,
                                  1n,
                                  1n,
                                  3n,
                                  2n,
                                  Canonical.Reviewing{},
                                  1n
                                }
                              },
                              None{}
                            )
                          )
                        }
                      ],
                      [],
                      2n,
                      False{},
                      []
                    },
                    []
                  }
                )
              ),
              Dispatch.Advanced{
                Dispatch.State{
                  [
                    Dispatch.ScheduledReviewWork{
                      1n+partition,
                      1n,
                      1n,
                      3n,
                      1n,
                      False{},
                      Canonical.dispatch_preparation(
                        Bool.pick(
                          Maybe<&2, Canonical.ReviewWorkRecord>,
                          Bool.and(Bool.and(_, True{}), True{}),
                          Some{
                            Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n}
                          },
                          None{}
                        )
                      )
                    }
                  ],
                  [],
                  2n,
                  False{},
                  []
                },
                []
              }
            )
          ),
          Canonical.Rejected{
            Fixtures.source_settled(partition, size, fingerprint, limits),
            Canonical.StaleOperation{}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_request_ready(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.request_ready(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ReviewServiceRequestReady{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      True{},
      True{},
      True{},
      True{},
      True{},
      True{}
    },
    Canonical.step(
      Fixtures.queued_review(partition, size, fingerprint, limits),
      Canonical.ReviewServiceRequestReady{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        True{},
        True{},
        True{},
        True{},
        True{},
        True{}
      }
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.request_ready(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestReady{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        True{},
        True{},
        True{},
        True{},
        True{},
        True{}
      },
      Canonical.check_step(
        Fixtures.queued_review(partition, size, fingerprint, limits),
        Canonical.request_ready_found(
          Fixtures.queued_review(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          True{},
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 1n}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_request_started(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.request_started(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ReviewServiceRequestStarted{(1n + partition : Nat), 1n, 1n, 3n, 4n},
    Canonical.step(
      Fixtures.request_ready(partition, size, fingerprint, limits),
      Canonical.ReviewServiceRequestStarted{(1n + partition : Nat), 1n, 1n, 3n, 4n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.request_started(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestStarted{(1n + partition : Nat), 1n, 1n, 3n, 4n},
      Canonical.check_step(
        Fixtures.request_ready(partition, size, fingerprint, limits),
        Canonical.request_update_result(
          Fixtures.request_ready(partition, size, fingerprint, limits),
          Dispatch.request_update_found(
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, False{}, False{}}]
            },
            1n+partition,
            1n,
            1n,
            3n,
            4n,
            True{},
            False{},
            False{},
            Bool.pick(
              Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
              Bool.and(_, True{}),
              Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, False{}, False{}}},
              None{}
            )
          ),
          Canonical.EventEstablished{Canonical.ReviewServiceRequestStartRecorded{}}
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.request_started(partition, size, fingerprint, limits)}
    == Some{
      Canonical.State{
        Ledger.Ledger{limits, 3n, [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]},
        [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
        [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
        2n,
        5n,
        [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
        Dispatch.State{
          [],
          [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
          2n,
          False{},
          Bool.pick(
            List<&2, Dispatch.ReviewServiceRequestRecord>,
            Bool.and(_, True{}),
            [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}],
            [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, False{}, False{}}]
          )
        },
        CollectionState.State{
          [],
          [],
          [],
          DeliveryState.State{[], [], SubmissionState.State{[], []}},
          RevisionState.State{[], 1n},
          ReuseState.State{[], []},
          NoticeState.State{[]}
        },
        EditHistory.State{[]}
      }
    }
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_request_interrupted(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.request_interrupted(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ReviewServiceRequestInterrupted{(1n + partition : Nat), 1n, 1n, 3n, 4n},
    Canonical.step(
      Fixtures.request_started(partition, size, fingerprint, limits),
      Canonical.ReviewServiceRequestInterrupted{(1n + partition : Nat), 1n, 1n, 3n, 4n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.request_interrupted(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestInterrupted{(1n + partition : Nat), 1n, 1n, 3n, 4n},
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_update_result(
          Fixtures.request_started(partition, size, fingerprint, limits),
          Dispatch.request_update_found(
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
            },
            1n+partition,
            1n,
            1n,
            3n,
            4n,
            False{},
            True{},
            False{},
            Bool.pick(
              Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
              Bool.and(_, True{}),
              Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}},
              None{}
            )
          ),
          Canonical.EventEstablished{Canonical.ReviewServiceRequestInterruptionRecorded{}}
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.request_interrupted(partition, size, fingerprint, limits)}
    == Some{
      Canonical.State{
        Ledger.Ledger{limits, 3n, [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]},
        [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
        [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
        2n,
        5n,
        [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
        Dispatch.State{
          [],
          [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
          2n,
          False{},
          Bool.pick(
            List<&2, Dispatch.ReviewServiceRequestRecord>,
            Bool.and(_, True{}),
            [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, True{}}],
            [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
          )
        },
        CollectionState.State{
          [],
          [],
          [],
          DeliveryState.State{[], [], SubmissionState.State{[], []}},
          RevisionState.State{[], 1n},
          ReuseState.State{[], []},
          NoticeState.State{[]}
        },
        EditHistory.State{[]}
      }
    }
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_result_NeverSent(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ReviewServiceRequestSettled{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      4n,
      Canonical.NeverSent{},
      True{}
    },
    Canonical.step(
      Fixtures.request_ready(partition, size, fingerprint, limits),
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.NeverSent{},
        True{}
      }
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.NeverSent{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_ready(partition, size, fingerprint, limits),
        Canonical.request_settled_found(
          Fixtures.request_ready(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          4n,
          Canonical.NeverSent{},
          True{},
          Bool.pick(
            Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
            Bool.and(_, True{}),
            Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, False{}, False{}}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.NeverSent{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_ready(partition, size, fingerprint, limits),
        Canonical.request_settled_released(
          Fixtures.request_ready(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.NeverSent{},
          True{},
          Dispatch.request_update_found(
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, False{}, False{}}]
            },
            1n+partition,
            1n,
            1n,
            3n,
            4n,
            False{},
            False{},
            True{},
            Bool.pick(
              Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
              Bool.and(_, True{}),
              Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, False{}, False{}}},
              None{}
            )
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.NeverSent{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_ready(partition, size, fingerprint, limits),
        Canonical.request_settled_work(
          Canonical.State{
            Ledger.Ledger{
              limits,
              3n,
              [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
            },
            [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
            [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
            2n,
            5n,
            [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              Bool.pick(
                List<&2, Dispatch.ReviewServiceRequestRecord>,
                Bool.and(_, True{}),
                [],
                [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, False{}, False{}}]
              )
            },
            CollectionState.State{
              [],
              [],
              [],
              DeliveryState.State{[], [], SubmissionState.State{[], []}},
              RevisionState.State{[], 1n},
              ReuseState.State{[], []},
              NoticeState.State{[]}
            },
            EditHistory.State{[]}
          },
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.NeverSent{},
          True{},
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.NeverSent{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_ready(partition, size, fingerprint, limits),
        Canonical.append_review_disposition(
          Canonical.reviewed_found(
            Canonical.State{
              Ledger.Ledger{
                limits,
                3n,
                [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
              },
              [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
              [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
              2n,
              5n,
              [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
              Dispatch.State{
                [],
                [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
                2n,
                False{},
                []
              },
              CollectionState.State{
                [],
                [],
                [],
                DeliveryState.State{[], [], SubmissionState.State{[], []}},
                RevisionState.State{[], 1n},
                ReuseState.State{[], []},
                NoticeState.State{[]}
              },
              EditHistory.State{[]}
            },
            3n,
            Canonical.Unavailable{},
            Bool.pick(
              Maybe<&2, Canonical.ReviewWorkRecord>,
              Bool.and(Bool.and(_, True{}), True{}),
              Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
              None{}
            )
          ),
          Canonical.EventEstablished{Canonical.ReviewServiceRequestOutcomeRecorded{Canonical.NeverSent{}}}
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_result_RequestFinding(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.finding(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ReviewServiceRequestSettled{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      4n,
      Canonical.RequestFinding{},
      True{}
    },
    Canonical.step(
      Fixtures.request_started(partition, size, fingerprint, limits),
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestFinding{},
        True{}
      }
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.finding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestFinding{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_found(
          Fixtures.request_started(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          4n,
          Canonical.RequestFinding{},
          True{},
          Bool.pick(
            Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
            Bool.and(_, True{}),
            Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.finding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestFinding{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_released(
          Fixtures.request_started(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestFinding{},
          True{},
          Dispatch.request_update_found(
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
            },
            1n+partition,
            1n,
            1n,
            3n,
            4n,
            False{},
            False{},
            True{},
            Bool.pick(
              Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
              Bool.and(_, True{}),
              Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}},
              None{}
            )
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.finding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestFinding{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_work(
          Canonical.State{
            Ledger.Ledger{
              limits,
              3n,
              [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
            },
            [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
            [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
            2n,
            5n,
            [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              Bool.pick(
                List<&2, Dispatch.ReviewServiceRequestRecord>,
                Bool.and(_, True{}),
                [],
                [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
              )
            },
            CollectionState.State{
              [],
              [],
              [],
              DeliveryState.State{[], [], SubmissionState.State{[], []}},
              RevisionState.State{[], 1n},
              ReuseState.State{[], []},
              NoticeState.State{[]}
            },
            EditHistory.State{[]}
          },
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestFinding{},
          True{},
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.finding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestFinding{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.append_review_disposition(
          Canonical.append_review_disposition(
            Canonical.reviewed_found(
              Canonical.State{
                Ledger.Ledger{
                  limits,
                  3n,
                  [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
                },
                [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
                [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
                2n,
                5n,
                [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
                Dispatch.State{
                  [],
                  [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
                  2n,
                  False{},
                  []
                },
                CollectionState.State{
                  [],
                  [],
                  [],
                  DeliveryState.State{[], [], SubmissionState.State{[], []}},
                  RevisionState.State{[], 1n},
                  ReuseState.State{[], []},
                  NoticeState.State{[]}
                },
                EditHistory.State{[]}
              },
              3n,
              Canonical.Finding{},
              Bool.pick(
                Maybe<&2, Canonical.ReviewWorkRecord>,
                Bool.and(Bool.and(_, True{}), True{}),
                Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
                None{}
              )
            ),
            Canonical.EventEstablished{Canonical.FindingRetained{}}
          ),
          Canonical.EventEstablished{
            Canonical.ReviewServiceRequestOutcomeRecorded{Canonical.RequestFinding{}}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %room : {
    Some{Fixtures.finding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestFinding{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.append_review_disposition(
          Canonical.append_review_disposition(
            Canonical.reviewed_retained_result(
              Canonical.State{
                Ledger.Ledger{
                  limits,
                  3n,
                  [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
                },
                [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
                [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
                2n,
                5n,
                [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
                Dispatch.State{
                  [],
                  [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
                  2n,
                  False{},
                  []
                },
                CollectionState.State{
                  [],
                  [],
                  [],
                  DeliveryState.State{[], [], SubmissionState.State{[], []}},
                  RevisionState.State{[], 1n},
                  ReuseState.State{[], []},
                  NoticeState.State{[]}
                },
                EditHistory.State{[]}
              },
              3n,
              Ledger.resize_for.check(
                limits,
                3n,
                [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}],
                2n,
                1n+partition,
                1n+size,
                Ledger.StoredResult{},
                _
              )
            ),
            Canonical.EventEstablished{Canonical.FindingRetained{}}
          ),
          Canonical.EventEstablished{
            Canonical.ReviewServiceRequestOutcomeRecorded{Canonical.RequestFinding{}}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_result_RequestClear(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ReviewServiceRequestSettled{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      4n,
      Canonical.RequestClear{},
      True{}
    },
    Canonical.step(
      Fixtures.request_started(partition, size, fingerprint, limits),
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestClear{},
        True{}
      }
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestClear{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_found(
          Fixtures.request_started(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          4n,
          Canonical.RequestClear{},
          True{},
          Bool.pick(
            Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
            Bool.and(_, True{}),
            Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestClear{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_released(
          Fixtures.request_started(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestClear{},
          True{},
          Dispatch.request_update_found(
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
            },
            1n+partition,
            1n,
            1n,
            3n,
            4n,
            False{},
            False{},
            True{},
            Bool.pick(
              Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
              Bool.and(_, True{}),
              Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}},
              None{}
            )
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestClear{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_work(
          Canonical.State{
            Ledger.Ledger{
              limits,
              3n,
              [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
            },
            [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
            [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
            2n,
            5n,
            [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              Bool.pick(
                List<&2, Dispatch.ReviewServiceRequestRecord>,
                Bool.and(_, True{}),
                [],
                [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
              )
            },
            CollectionState.State{
              [],
              [],
              [],
              DeliveryState.State{[], [], SubmissionState.State{[], []}},
              RevisionState.State{[], 1n},
              ReuseState.State{[], []},
              NoticeState.State{[]}
            },
            EditHistory.State{[]}
          },
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestClear{},
          True{},
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestClear{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.append_review_disposition(
          Canonical.append_review_disposition(
            Canonical.reviewed_found(
              Canonical.State{
                Ledger.Ledger{
                  limits,
                  3n,
                  [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
                },
                [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
                [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
                2n,
                5n,
                [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
                Dispatch.State{
                  [],
                  [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
                  2n,
                  False{},
                  []
                },
                CollectionState.State{
                  [],
                  [],
                  [],
                  DeliveryState.State{[], [], SubmissionState.State{[], []}},
                  RevisionState.State{[], 1n},
                  ReuseState.State{[], []},
                  NoticeState.State{[]}
                },
                EditHistory.State{[]}
              },
              3n,
              Canonical.Clear{},
              Bool.pick(
                Maybe<&2, Canonical.ReviewWorkRecord>,
                Bool.and(Bool.and(_, True{}), True{}),
                Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
                None{}
              )
            ),
            Canonical.EventEstablished{Canonical.ClearSettled{}}
          ),
          Canonical.EventEstablished{Canonical.ReviewServiceRequestOutcomeRecorded{Canonical.RequestClear{}}}
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_result_RequestBackendFailure(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ReviewServiceRequestSettled{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      4n,
      Canonical.RequestBackendFailure{},
      True{}
    },
    Canonical.step(
      Fixtures.request_started(partition, size, fingerprint, limits),
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestBackendFailure{},
        True{}
      }
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestBackendFailure{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_found(
          Fixtures.request_started(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          4n,
          Canonical.RequestBackendFailure{},
          True{},
          Bool.pick(
            Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
            Bool.and(_, True{}),
            Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestBackendFailure{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_released(
          Fixtures.request_started(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestBackendFailure{},
          True{},
          Dispatch.request_update_found(
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
            },
            1n+partition,
            1n,
            1n,
            3n,
            4n,
            False{},
            False{},
            True{},
            Bool.pick(
              Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
              Bool.and(_, True{}),
              Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}},
              None{}
            )
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestBackendFailure{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_work(
          Canonical.State{
            Ledger.Ledger{
              limits,
              3n,
              [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
            },
            [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
            [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
            2n,
            5n,
            [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              Bool.pick(
                List<&2, Dispatch.ReviewServiceRequestRecord>,
                Bool.and(_, True{}),
                [],
                [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
              )
            },
            CollectionState.State{
              [],
              [],
              [],
              DeliveryState.State{[], [], SubmissionState.State{[], []}},
              RevisionState.State{[], 1n},
              ReuseState.State{[], []},
              NoticeState.State{[]}
            },
            EditHistory.State{[]}
          },
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestBackendFailure{},
          True{},
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestBackendFailure{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.append_review_disposition(
          Canonical.reviewed_found(
            Canonical.State{
              Ledger.Ledger{
                limits,
                3n,
                [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
              },
              [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
              [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
              2n,
              5n,
              [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
              Dispatch.State{
                [],
                [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
                2n,
                False{},
                []
              },
              CollectionState.State{
                [],
                [],
                [],
                DeliveryState.State{[], [], SubmissionState.State{[], []}},
                RevisionState.State{[], 1n},
                ReuseState.State{[], []},
                NoticeState.State{[]}
              },
              EditHistory.State{[]}
            },
            3n,
            Canonical.Unavailable{},
            Bool.pick(
              Maybe<&2, Canonical.ReviewWorkRecord>,
              Bool.and(Bool.and(_, True{}), True{}),
              Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
              None{}
            )
          ),
          Canonical.EventEstablished{
            Canonical.ReviewServiceRequestOutcomeRecorded{Canonical.RequestBackendFailure{}}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_result_RequestTimeout(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ReviewServiceRequestSettled{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      4n,
      Canonical.RequestTimeout{},
      True{}
    },
    Canonical.step(
      Fixtures.request_started(partition, size, fingerprint, limits),
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestTimeout{},
        True{}
      }
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestTimeout{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_found(
          Fixtures.request_started(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          4n,
          Canonical.RequestTimeout{},
          True{},
          Bool.pick(
            Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
            Bool.and(_, True{}),
            Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestTimeout{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_released(
          Fixtures.request_started(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestTimeout{},
          True{},
          Dispatch.request_update_found(
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
            },
            1n+partition,
            1n,
            1n,
            3n,
            4n,
            False{},
            False{},
            True{},
            Bool.pick(
              Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
              Bool.and(_, True{}),
              Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}},
              None{}
            )
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestTimeout{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.request_settled_work(
          Canonical.State{
            Ledger.Ledger{
              limits,
              3n,
              [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
            },
            [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
            [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
            2n,
            5n,
            [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              Bool.pick(
                List<&2, Dispatch.ReviewServiceRequestRecord>,
                Bool.and(_, True{}),
                [],
                [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, False{}}]
              )
            },
            CollectionState.State{
              [],
              [],
              [],
              DeliveryState.State{[], [], SubmissionState.State{[], []}},
              RevisionState.State{[], 1n},
              ReuseState.State{[], []},
              NoticeState.State{[]}
            },
            EditHistory.State{[]}
          },
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestTimeout{},
          True{},
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestTimeout{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_started(partition, size, fingerprint, limits),
        Canonical.append_review_disposition(
          Canonical.reviewed_found(
            Canonical.State{
              Ledger.Ledger{
                limits,
                3n,
                [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
              },
              [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
              [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
              2n,
              5n,
              [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
              Dispatch.State{
                [],
                [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
                2n,
                False{},
                []
              },
              CollectionState.State{
                [],
                [],
                [],
                DeliveryState.State{[], [], SubmissionState.State{[], []}},
                RevisionState.State{[], 1n},
                ReuseState.State{[], []},
                NoticeState.State{[]}
              },
              EditHistory.State{[]}
            },
            3n,
            Canonical.Unavailable{},
            Bool.pick(
              Maybe<&2, Canonical.ReviewWorkRecord>,
              Bool.and(Bool.and(_, True{}), True{}),
              Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
              None{}
            )
          ),
          Canonical.EventEstablished{
            Canonical.ReviewServiceRequestOutcomeRecorded{Canonical.RequestTimeout{}}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_result_RequestInterrupted(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.ReviewServiceRequestSettled{
      (1n + partition : Nat),
      1n,
      1n,
      3n,
      4n,
      Canonical.RequestInterrupted{},
      True{}
    },
    Canonical.step(
      Fixtures.request_interrupted(partition, size, fingerprint, limits),
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestInterrupted{},
        True{}
      }
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestInterrupted{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_interrupted(partition, size, fingerprint, limits),
        Canonical.request_settled_found(
          Fixtures.request_interrupted(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          4n,
          Canonical.RequestInterrupted{},
          True{},
          Bool.pick(
            Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
            Bool.and(_, True{}),
            Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, True{}}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestInterrupted{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_interrupted(partition, size, fingerprint, limits),
        Canonical.request_settled_released(
          Fixtures.request_interrupted(partition, size, fingerprint, limits),
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestInterrupted{},
          True{},
          Dispatch.request_update_found(
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, True{}}]
            },
            1n+partition,
            1n,
            1n,
            3n,
            4n,
            False{},
            False{},
            True{},
            Bool.pick(
              Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
              Bool.and(_, True{}),
              Some{Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, True{}}},
              None{}
            )
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestInterrupted{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_interrupted(partition, size, fingerprint, limits),
        Canonical.request_settled_work(
          Canonical.State{
            Ledger.Ledger{
              limits,
              3n,
              [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
            },
            [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
            [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
            2n,
            5n,
            [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
            Dispatch.State{
              [],
              [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
              2n,
              False{},
              Bool.pick(
                List<&2, Dispatch.ReviewServiceRequestRecord>,
                Bool.and(_, True{}),
                [],
                [Dispatch.ReviewServiceRequestRecord{1n+partition, 1n, 1n, 3n, 4n, True{}, True{}}]
              )
            },
            CollectionState.State{
              [],
              [],
              [],
              DeliveryState.State{[], [], SubmissionState.State{[], []}},
              RevisionState.State{[], 1n},
              ReuseState.State{[], []},
              NoticeState.State{[]}
            },
            EditHistory.State{[]}
          },
          1n+partition,
          1n,
          1n,
          3n,
          Canonical.RequestInterrupted{},
          True{},
          Bool.pick(
            Maybe<&2, Canonical.ReviewWorkRecord>,
            Bool.and(Bool.and(_, True{}), True{}),
            Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
            None{}
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.ReviewServiceRequestSettled{
        (1n + partition : Nat),
        1n,
        1n,
        3n,
        4n,
        Canonical.RequestInterrupted{},
        True{}
      },
      Canonical.check_step(
        Fixtures.request_interrupted(partition, size, fingerprint, limits),
        Canonical.append_review_disposition(
          Canonical.reviewed_found(
            Canonical.State{
              Ledger.Ledger{
                limits,
                3n,
                [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.ReviewUnit{}}]
              },
              [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
              [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}],
              2n,
              5n,
              [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
              Dispatch.State{
                [],
                [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
                2n,
                False{},
                []
              },
              CollectionState.State{
                [],
                [],
                [],
                DeliveryState.State{[], [], SubmissionState.State{[], []}},
                RevisionState.State{[], 1n},
                ReuseState.State{[], []},
                NoticeState.State{[]}
              },
              EditHistory.State{[]}
            },
            3n,
            Canonical.Interrupted{},
            Bool.pick(
              Maybe<&2, Canonical.ReviewWorkRecord>,
              Bool.and(Bool.and(_, True{}), True{}),
              Some{Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.ReviewServiceRequestOutstanding{}, 1n}},
              None{}
            )
          ),
          Canonical.EventEstablished{
            Canonical.ReviewServiceRequestOutcomeRecorded{Canonical.RequestInterrupted{}}
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_settle_finding(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.resolved_finding(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n},
    Canonical.step(
      Fixtures.finding(partition, size, fingerprint, limits),
      Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.resolved_finding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n},
      Canonical.check_step(
        Fixtures.finding(partition, size, fingerprint, limits),
        Canonical.dispatch_result(
          Fixtures.finding(partition, size, fingerprint, limits),
          Bool.pick(
            Dispatch.DispatchResult,
            Bool.or(Bool.and(_, True{}), False{}),
            Dispatch.Advanced{
              Dispatch.State{
                [],
                Bool.pick(
                  List<&2, Dispatch.ScheduledReviewWork>,
                  Bool.and(_, True{}),
                  [],
                  [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}]
                ),
                2n,
                False{},
                []
              },
              []
            },
            Dispatch.Denied{
              Dispatch.State{
                [],
                [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
                2n,
                False{},
                []
              }
            }
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_settle_nonfinding(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n},
    Canonical.step(
      Fixtures.nonfinding(partition, size, fingerprint, limits),
      Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n},
      Canonical.check_step(
        Fixtures.nonfinding(partition, size, fingerprint, limits),
        Canonical.dispatch_result(
          Fixtures.nonfinding(partition, size, fingerprint, limits),
          Bool.pick(
            Dispatch.DispatchResult,
            Bool.or(Bool.and(_, True{}), False{}),
            Dispatch.Advanced{
              Dispatch.State{
                [],
                Bool.pick(
                  List<&2, Dispatch.ScheduledReviewWork>,
                  Bool.and(_, True{}),
                  [],
                  [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}]
                ),
                2n,
                False{},
                []
              },
              []
            },
            Dispatch.Denied{
              Dispatch.State{
                [],
                [Dispatch.ScheduledReviewWork{1n+partition, 1n, 1n, 3n, 1n, False{}, False{}}],
                2n,
                False{},
                []
              }
            }
          )
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_ready(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.collectible(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.CollectionReady{3n, (1n + partition : Nat), 1n, 1n, 1n, False{}},
    Canonical.step(
      Fixtures.resolved_finding(partition, size, fingerprint, limits),
      Canonical.CollectionReady{3n, (1n + partition : Nat), 1n, 1n, 1n, False{}}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.collectible(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.CollectionReady{3n, (1n + partition : Nat), 1n, 1n, 1n, False{}},
      Canonical.check_step(
        Fixtures.resolved_finding(partition, size, fingerprint, limits),
        Canonical.collection_decision(
          Fixtures.resolved_finding(partition, size, fingerprint, limits),
          Bool.pick(
            CollectionState.Decision,
            Bool.or(
              Bool.and(
                Bool.or(Bool.and(_, True{}), False{}),
                Bool.or(
                  Canonical.deciding_round(
                    Bool.pick(
                      Maybe<&2, Canonical.Round>,
                      _,
                      Some{
                        Canonical.Round{
                          1n+partition,
                          1n,
                          1n,
                          False{},
                          False{},
                          None{},
                          False{},
                          None{}
                        }
                      },
                      None{}
                    ),
                    1n+partition,
                    1n,
                    1n
                  ),
                  True{}
                )
              ),
              False{}
            ),
            CollectionState.Accepted{
              CollectionState.State{
                [3n],
                [],
                [],
                DeliveryState.State{[], [], SubmissionState.State{[], []}},
                RevisionState.State{[], 1n},
                ReuseState.State{[], []},
                NoticeState.State{[]}
              }
            },
            CollectionState.Refused{
              CollectionState.State{
                [],
                [],
                [],
                DeliveryState.State{[], [], SubmissionState.State{[], []}},
                RevisionState.State{[], 1n},
                ReuseState.State{[], []},
                NoticeState.State{[]}
              }
            }
          ),
          Canonical.EventEstablished{Canonical.CollectionEligible{}},
          Canonical.PolicyDecided{Canonical.CollectionWaiting{}}
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_lease(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.leased(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.CollectionReserveLease{3n, 1n},
    Canonical.step(
      Fixtures.collectible(partition, size, fingerprint, limits),
      Canonical.CollectionReserveLease{3n, 1n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  {==}

def journey_offer(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.offered(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.SubmissionBegin{
      3n,
      (1n + partition : Nat),
      1n,
      1n,
      Handoff.Edit{},
      False{},
      (1n + fingerprint : Nat) <> Nil{},
      3n <> Nil{}
    },
    Canonical.step(
      Fixtures.leased(partition, size, fingerprint, limits),
      Canonical.SubmissionBegin{
        3n,
        (1n + partition : Nat),
        1n,
        1n,
        Handoff.Edit{},
        False{},
        (1n + fingerprint : Nat) <> Nil{},
        3n <> Nil{}
      }
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.offered(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.SubmissionBegin{
        3n,
        (1n + partition : Nat),
        1n,
        1n,
        Handoff.Edit{},
        False{},
        (1n + fingerprint : Nat) <> Nil{},
        3n <> Nil{}
      },
      Canonical.check_step(
        Canonical.State{
          Ledger.Ledger{
            limits,
            3n,
            [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.StoredResult{}}]
          },
          [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
          [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.PendingFinding{1n}, 1n}],
          2n,
          5n,
          [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
          Dispatch.State{[], [], 2n, False{}, []},
          CollectionState.State{
            [3n],
            [CollectionState.Lease{3n, 1n}],
            [],
            DeliveryState.State{[], [], SubmissionState.State{[], []}},
            RevisionState.State{[], 1n},
            ReuseState.State{[], []},
            NoticeState.State{[]}
          },
          EditHistory.State{[]}
        },
        Bool.pick(
          Canonical.Step,
          Bool.and(
            Canonical.submission_round_found(
              1n+partition,
              1n,
              Bool.pick(
                Maybe<&2, Canonical.Round>,
                _,
                Some{
                  Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}
                },
                None{}
              )
            ),
            True{}
          ),
          Canonical.Advanced{
            Fixtures.offered(partition, size, fingerprint, limits),
            [Canonical.EventEstablished{Canonical.SubmissionBegun{}}]
          },
          Canonical.Advanced{
            Canonical.State{
              Ledger.Ledger{
                limits,
                3n,
                [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.StoredResult{}}]
              },
              [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
              [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.PendingFinding{1n}, 1n}],
              2n,
              5n,
              [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
              Dispatch.State{[], [], 2n, False{}, []},
              CollectionState.State{
                [3n],
                [CollectionState.Lease{3n, 1n}],
                [],
                DeliveryState.State{[], [], SubmissionState.State{[], []}},
                RevisionState.State{[], 1n},
                ReuseState.State{[], []},
                NoticeState.State{[]}
              },
              EditHistory.State{[]}
            },
            [Canonical.PolicyDecided{Canonical.SubmissionRefused{}}]
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(partition) : {
    Some{Fixtures.offered(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.SubmissionBegin{
        3n,
        (1n + partition : Nat),
        1n,
        1n,
        Handoff.Edit{},
        False{},
        (1n + fingerprint : Nat) <> Nil{},
        3n <> Nil{}
      },
      Canonical.check_step(
        Canonical.State{
          Ledger.Ledger{
            limits,
            3n,
            [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.StoredResult{}}]
          },
          [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
          [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.PendingFinding{1n}, 1n}],
          2n,
          5n,
          [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
          Dispatch.State{[], [], 2n, False{}, []},
          CollectionState.State{
            [3n],
            [CollectionState.Lease{3n, 1n}],
            [],
            DeliveryState.State{[], [], SubmissionState.State{[], []}},
            RevisionState.State{[], 1n},
            ReuseState.State{[], []},
            NoticeState.State{[]}
          },
          EditHistory.State{[]}
        },
        Bool.pick(
          Canonical.Step,
          Bool.and(Bool.and(_, True{}), True{}),
          Canonical.Advanced{
            Fixtures.offered(partition, size, fingerprint, limits),
            [Canonical.EventEstablished{Canonical.SubmissionBegun{}}]
          },
          Canonical.Advanced{
            Canonical.State{
              Ledger.Ledger{
                limits,
                3n,
                [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.StoredResult{}}]
              },
              [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
              [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.PendingFinding{1n}, 1n}],
              2n,
              5n,
              [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
              Dispatch.State{[], [], 2n, False{}, []},
              CollectionState.State{
                [3n],
                [CollectionState.Lease{3n, 1n}],
                [],
                DeliveryState.State{[], [], SubmissionState.State{[], []}},
                RevisionState.State{[], 1n},
                ReuseState.State{[], []},
                NoticeState.State{[]}
              },
              EditHistory.State{[]}
            },
            [Canonical.PolicyDecided{Canonical.SubmissionRefused{}}]
          }
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_authorize(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.authorized(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.SubmissionAuthorize{3n, 1n},
    Canonical.step(
      Fixtures.offered(partition, size, fingerprint, limits),
      Canonical.SubmissionAuthorize{3n, 1n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(fingerprint) : {
    Some{Fixtures.authorized(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.SubmissionAuthorize{3n, 1n},
      Canonical.check_step(
        Fixtures.offered(partition, size, fingerprint, limits),
        Canonical.collection_decision(
          Fixtures.offered(partition, size, fingerprint, limits),
          CollectionState.delivery_result(
            CollectionState.State{
              [3n],
              [CollectionState.Lease{3n, 1n}],
              [],
              DeliveryState.State{
                [],
                [],
                SubmissionState.State{
                  [
                    SubmissionState.LeaseRecord{
                      3n,
                      1n+fingerprint,
                      Handoff.Lease{
                        1n+fingerprint,
                        1n,
                        False{},
                        False{},
                        Handoff.Reserved{1n, Handoff.Edit{}}
                      },
                      None{}
                    }
                  ],
                  [
                    SubmissionState.Batch{
                      3n,
                      1n+partition,
                      1n,
                      1n,
                      Handoff.Edit{},
                      Delivery.Reserved{},
                      [1n+fingerprint],
                      [3n]
                    }
                  ]
                }
              },
              RevisionState.State{[], 1n},
              ReuseState.State{[], []},
              NoticeState.State{[]}
            },
            DeliveryState.submission_result(
              DeliveryState.State{
                [],
                [],
                SubmissionState.State{
                  [
                    SubmissionState.LeaseRecord{
                      3n,
                      1n+fingerprint,
                      Handoff.Lease{
                        1n+fingerprint,
                        1n,
                        False{},
                        False{},
                        Handoff.Reserved{1n, Handoff.Edit{}}
                      },
                      None{}
                    }
                  ],
                  [
                    SubmissionState.Batch{
                      3n,
                      1n+partition,
                      1n,
                      1n,
                      Handoff.Edit{},
                      Delivery.Reserved{},
                      [1n+fingerprint],
                      [3n]
                    }
                  ]
                }
              },
              SubmissionState.transition_result(
                SubmissionState.State{
                  [
                    SubmissionState.LeaseRecord{
                      3n,
                      1n+fingerprint,
                      Handoff.Lease{
                        1n+fingerprint,
                        1n,
                        False{},
                        False{},
                        Handoff.Reserved{1n, Handoff.Edit{}}
                      },
                      None{}
                    }
                  ],
                  [
                    SubmissionState.Batch{
                      3n,
                      1n+partition,
                      1n,
                      1n,
                      Handoff.Edit{},
                      Delivery.Reserved{},
                      [1n+fingerprint],
                      [3n]
                    }
                  ]
                },
                SubmissionState.Batch{
                  3n,
                  1n+partition,
                  1n,
                  1n,
                  Handoff.Edit{},
                  Delivery.Reserved{},
                  [1n+fingerprint],
                  [3n]
                },
                Delivery.Authorized{},
                SubmissionState.update_one_found(
                  SubmissionState.State{
                    [
                      SubmissionState.LeaseRecord{
                        3n,
                        1n+fingerprint,
                        Handoff.Lease{
                          1n+fingerprint,
                          1n,
                          False{},
                          False{},
                          Handoff.Reserved{1n, Handoff.Edit{}}
                        },
                        None{}
                      }
                    ],
                    [
                      SubmissionState.Batch{
                        3n,
                        1n+partition,
                        1n,
                        1n,
                        Handoff.Edit{},
                        Delivery.Reserved{},
                        [1n+fingerprint],
                        [3n]
                      }
                    ]
                  },
                  3n,
                  1n+fingerprint,
                  1n,
                  1n,
                  Delivery.Authorized{},
                  Bool.pick(
                    Maybe<&2, SubmissionState.LeaseRecord>,
                    _,
                    Some{
                      SubmissionState.LeaseRecord{
                        3n,
                        1n+fingerprint,
                        Handoff.Lease{
                          1n+fingerprint,
                          1n,
                          False{},
                          False{},
                          Handoff.Reserved{1n, Handoff.Edit{}}
                        },
                        None{}
                      }
                    },
                    None{}
                  )
                )
              )
            )
          ),
          Canonical.EventEstablished{Canonical.SubmissionAuthorized{}},
          Canonical.PolicyDecided{Canonical.SubmissionRefused{}}
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(fingerprint) : {
    Some{Fixtures.authorized(partition, size, fingerprint, limits)}
    == Some{
      Canonical.State{
        Ledger.Ledger{
          limits,
          3n,
          [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.StoredResult{}}]
        },
        [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
        [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.PendingFinding{1n}, 1n}],
        2n,
        5n,
        [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
        Dispatch.State{[], [], 2n, False{}, []},
        CollectionState.State{
          [3n],
          [CollectionState.Lease{3n, 1n}],
          [],
          DeliveryState.State{
            [],
            [],
            SubmissionState.State{
              SubmissionState.LeaseRecord{
                3n,
                1n+fingerprint,
                Handoff.Lease{
                  1n+fingerprint,
                  1n,
                  False{},
                  False{},
                  Handoff.Authorized{1n, Handoff.Edit{}}
                },
                None{}
              } <> SubmissionState.keep_record(
                SubmissionState.LeaseRecord{
                  3n,
                  1n+fingerprint,
                  Handoff.Lease{
                    1n+fingerprint,
                    1n,
                    False{},
                    False{},
                    Handoff.Reserved{1n, Handoff.Edit{}}
                  },
                  None{}
                },
                [],
                _
              ),
              [
                SubmissionState.Batch{
                  3n,
                  1n+partition,
                  1n,
                  1n,
                  Handoff.Edit{},
                  Delivery.Authorized{},
                  [1n+fingerprint],
                  [3n]
                }
              ]
            }
          },
          RevisionState.State{[], 1n},
          ReuseState.State{[], []},
          NoticeState.State{[]}
        },
        EditHistory.State{[]}
      }
    }
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_submit(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.submitted(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.SubmissionTerminal{3n, 1n, True{}},
    Canonical.step(
      Fixtures.authorized(partition, size, fingerprint, limits),
      Canonical.SubmissionTerminal{3n, 1n, True{}}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  %Shared.nat_eq_self(fingerprint) : {
    Some{Fixtures.submitted(partition, size, fingerprint, limits)}
    == Core.event_state(
      Canonical.SubmissionTerminal{3n, 1n, True{}},
      Canonical.check_step(
        Fixtures.authorized(partition, size, fingerprint, limits),
        Canonical.collection_decision(
          Fixtures.authorized(partition, size, fingerprint, limits),
          CollectionState.delivery_result(
            CollectionState.State{
              [3n],
              [CollectionState.Lease{3n, 1n}],
              [],
              DeliveryState.State{
                [],
                [],
                SubmissionState.State{
                  [
                    SubmissionState.LeaseRecord{
                      3n,
                      1n+fingerprint,
                      Handoff.Lease{
                        1n+fingerprint,
                        1n,
                        False{},
                        False{},
                        Handoff.Authorized{1n, Handoff.Edit{}}
                      },
                      None{}
                    }
                  ],
                  [
                    SubmissionState.Batch{
                      3n,
                      1n+partition,
                      1n,
                      1n,
                      Handoff.Edit{},
                      Delivery.Authorized{},
                      [1n+fingerprint],
                      [3n]
                    }
                  ]
                }
              },
              RevisionState.State{[], 1n},
              ReuseState.State{[], []},
              NoticeState.State{[]}
            },
            DeliveryState.submission_result(
              DeliveryState.State{
                [],
                [],
                SubmissionState.State{
                  [
                    SubmissionState.LeaseRecord{
                      3n,
                      1n+fingerprint,
                      Handoff.Lease{
                        1n+fingerprint,
                        1n,
                        False{},
                        False{},
                        Handoff.Authorized{1n, Handoff.Edit{}}
                      },
                      None{}
                    }
                  ],
                  [
                    SubmissionState.Batch{
                      3n,
                      1n+partition,
                      1n,
                      1n,
                      Handoff.Edit{},
                      Delivery.Authorized{},
                      [1n+fingerprint],
                      [3n]
                    }
                  ]
                }
              },
              SubmissionState.transition_result(
                SubmissionState.State{
                  [
                    SubmissionState.LeaseRecord{
                      3n,
                      1n+fingerprint,
                      Handoff.Lease{
                        1n+fingerprint,
                        1n,
                        False{},
                        False{},
                        Handoff.Authorized{1n, Handoff.Edit{}}
                      },
                      None{}
                    }
                  ],
                  [
                    SubmissionState.Batch{
                      3n,
                      1n+partition,
                      1n,
                      1n,
                      Handoff.Edit{},
                      Delivery.Authorized{},
                      [1n+fingerprint],
                      [3n]
                    }
                  ]
                },
                SubmissionState.Batch{
                  3n,
                  1n+partition,
                  1n,
                  1n,
                  Handoff.Edit{},
                  Delivery.Authorized{},
                  [1n+fingerprint],
                  [3n]
                },
                Delivery.Submitted{},
                SubmissionState.update_one_found(
                  SubmissionState.State{
                    [
                      SubmissionState.LeaseRecord{
                        3n,
                        1n+fingerprint,
                        Handoff.Lease{
                          1n+fingerprint,
                          1n,
                          False{},
                          False{},
                          Handoff.Authorized{1n, Handoff.Edit{}}
                        },
                        None{}
                      }
                    ],
                    [
                      SubmissionState.Batch{
                        3n,
                        1n+partition,
                        1n,
                        1n,
                        Handoff.Edit{},
                        Delivery.Authorized{},
                        [1n+fingerprint],
                        [3n]
                      }
                    ]
                  },
                  3n,
                  1n+fingerprint,
                  1n,
                  1n,
                  Delivery.Submitted{},
                  Bool.pick(
                    Maybe<&2, SubmissionState.LeaseRecord>,
                    _,
                    Some{
                      SubmissionState.LeaseRecord{
                        3n,
                        1n+fingerprint,
                        Handoff.Lease{
                          1n+fingerprint,
                          1n,
                          False{},
                          False{},
                          Handoff.Authorized{1n, Handoff.Edit{}}
                        },
                        None{}
                      }
                    },
                    None{}
                  )
                )
              )
            )
          ),
          Canonical.EventEstablished{Canonical.SubmissionRecorded{}},
          Canonical.PolicyDecided{Canonical.SubmissionRefused{}}
        )
      )
    )
    : Maybe<&2, Canonical.State>
  }
  %Shared.nat_eq_self(fingerprint) : {
    Some{Fixtures.submitted(partition, size, fingerprint, limits)}
    == Some{
      Canonical.State{
        Ledger.Ledger{
          limits,
          3n,
          [Ledger.ReviewCapacityReservationRecord{2n, 1n+partition, 1n+size, Ledger.StoredResult{}}]
        },
        [Canonical.Round{1n+partition, 1n, 1n, False{}, False{}, None{}, False{}, None{}}],
        [Canonical.ReviewWorkRecord{1n+partition, 1n, 1n, 3n, 2n, Canonical.PendingFinding{1n}, 1n}],
        2n,
        5n,
        [Admission.AdmissionState{1n+partition, 1n, 1n, True{}, 0n, 2n, []}],
        Dispatch.State{[], [], 2n, False{}, []},
        CollectionState.State{
          [3n],
          [CollectionState.Lease{3n, 1n}],
          [],
          DeliveryState.State{
            [],
            [],
            SubmissionState.State{
              SubmissionState.LeaseRecord{
                3n,
                1n+fingerprint,
                Handoff.Lease{
                  1n+fingerprint,
                  1n,
                  False{},
                  False{},
                  Handoff.Submitted{Handoff.Edit{}}
                },
                None{}
              } <> SubmissionState.keep_record(
                SubmissionState.LeaseRecord{
                  3n,
                  1n+fingerprint,
                  Handoff.Lease{
                    1n+fingerprint,
                    1n,
                    False{},
                    False{},
                    Handoff.Authorized{1n, Handoff.Edit{}}
                  },
                  None{}
                },
                [],
                _
              ),
              [
                SubmissionState.Batch{
                  3n,
                  1n+partition,
                  1n,
                  1n,
                  Handoff.Edit{},
                  Delivery.Submitted{},
                  [1n+fingerprint],
                  [3n]
                }
              ]
            }
          },
          RevisionState.State{[], 1n},
          ReuseState.State{[], []},
          NoticeState.State{[]}
        },
        EditHistory.State{[]}
      }
    }
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_release(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
  == Core.event_state(
    Canonical.CollectionReleaseLease{3n, 1n},
    Canonical.step(
      Fixtures.submitted(partition, size, fingerprint, limits),
      Canonical.CollectionReleaseLease{3n, 1n}
    )
  )
  : Maybe<&2, Canonical.State>
}:
  {==}

def journey_prefix(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +outcome: Canonical.ReviewServiceRequestOutcome,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Core.run_events(
    Core.journey_events(partition, size, fingerprint, outcome),
    Canonical.initial(limits)
  )
  == Core.run_events(
    Core.result_events(partition, fingerprint, outcome),
    Fixtures.request_ready(partition, size, fingerprint, limits)
  )
  : Maybe<&2, Canonical.State>
}:
  %journey_permit(partition, size, fingerprint, limits) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.ConsumePermit{
          (1n + partition : Nat),
          1n,
          1n,
          1n,
          1n
        } <> Canonical.AdmitObservation{
          (1n + partition : Nat),
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.StartObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.BeginObservedPreparation{
          (1n + partition : Nat),
          1n,
          1n,
          1n,
          (1n + size : Nat)
        } <> Canonical.PreparationCompleted{
          (1n + partition : Nat),
          1n,
          1n,
          2n,
          (1n + size : Nat) <> Nil{}
        } <> Canonical.CompleteObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.DispatchSettled{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          3n
        } <> Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_consume(partition, size, fingerprint, limits, room) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.AdmitObservation{
          (1n + partition : Nat),
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.StartObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.BeginObservedPreparation{
          (1n + partition : Nat),
          1n,
          1n,
          1n,
          (1n + size : Nat)
        } <> Canonical.PreparationCompleted{
          (1n + partition : Nat),
          1n,
          1n,
          2n,
          (1n + size : Nat) <> Nil{}
        } <> Canonical.CompleteObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.DispatchSettled{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          3n
        } <> Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_admit(partition, size, fingerprint, limits, room) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.StartObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.BeginObservedPreparation{
          (1n + partition : Nat),
          1n,
          1n,
          1n,
          (1n + size : Nat)
        } <> Canonical.PreparationCompleted{
          (1n + partition : Nat),
          1n,
          1n,
          2n,
          (1n + size : Nat) <> Nil{}
        } <> Canonical.CompleteObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.DispatchSettled{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          3n
        } <> Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_queue_source(partition, size, fingerprint, limits, room) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.StartObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.BeginObservedPreparation{
          (1n + partition : Nat),
          1n,
          1n,
          1n,
          (1n + size : Nat)
        } <> Canonical.PreparationCompleted{
          (1n + partition : Nat),
          1n,
          1n,
          2n,
          (1n + size : Nat) <> Nil{}
        } <> Canonical.CompleteObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.DispatchSettled{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          3n
        } <> Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_start_source(partition, size, fingerprint, limits, room) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.BeginObservedPreparation{
          (1n + partition : Nat),
          1n,
          1n,
          1n,
          (1n + size : Nat)
        } <> Canonical.PreparationCompleted{
          (1n + partition : Nat),
          1n,
          1n,
          2n,
          (1n + size : Nat) <> Nil{}
        } <> Canonical.CompleteObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.DispatchSettled{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          3n
        } <> Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_begin(partition, size, fingerprint, limits, room) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.PreparationCompleted{
          (1n + partition : Nat),
          1n,
          1n,
          2n,
          (1n + size : Nat) <> Nil{}
        } <> Canonical.CompleteObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.DispatchSettled{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          3n
        } <> Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_prepare(partition, size, fingerprint, limits, room) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.CompleteObservation{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.DispatchSettled{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          3n
        } <> Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_complete_source(partition, size, fingerprint, limits, room) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.DispatchSettled{
          (1n + partition : Nat),
          1n,
          1n,
          1n
        } <> Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          3n
        } <> Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_settle_source(partition, size, fingerprint, limits, room) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.QueueDispatch{
          (1n + partition : Nat),
          1n,
          1n,
          3n
        } <> Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_queue_review(partition, size, fingerprint, limits, room) : {
    Core.advance(
      _,
      Core.run_events(
        Canonical.ReviewServiceRequestReady{
          (1n + partition : Nat),
          1n,
          1n,
          3n,
          True{},
          True{},
          True{},
          True{},
          True{},
          True{}
        } <> Core.result_events(partition, fingerprint, outcome)
      )
    )
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  %journey_request_ready(partition, size, fingerprint, limits, room) : {
    Core.advance(_, Core.run_events(Core.result_events(partition, fingerprint, outcome)))
    == Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    )
    : Maybe<&2, Canonical.State>
  }
  {==}

def journey_suffix(
  +partition: Nat,
  +size: Nat,
  +fingerprint: Nat,
  +limits: Ledger.Limits,
  +outcome: Canonical.ReviewServiceRequestOutcome,
  +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
) -> {
  Core.run_events(
    Core.result_events(partition, fingerprint, outcome),
    Fixtures.request_ready(partition, size, fingerprint, limits)
  )
  == Some{Core.expected_journey(partition, size, fingerprint, limits, outcome)}
  : Maybe<&2, Canonical.State>
}:
  match outcome:
    case Canonical.NeverSent{}:
      %journey_result_NeverSent(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{})
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_settle_nonfinding(partition, size, fingerprint, limits, room) : {
        Core.advance(_, Core.run_events(Nil{}))
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      {==}
    case Canonical.RequestFinding{}:
      %journey_request_started(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.ReviewServiceRequestSettled{
              (1n + partition : Nat),
              1n,
              1n,
              3n,
              4n,
              Canonical.RequestFinding{},
              True{}
            } <> Canonical.DispatchSettled{
              (1n + partition : Nat),
              1n,
              1n,
              3n
            } <> Canonical.CollectionReady{
              3n,
              (1n + partition : Nat),
              1n,
              1n,
              1n,
              False{}
            } <> Canonical.CollectionReserveLease{
              3n,
              1n
            } <> Canonical.SubmissionBegin{
              3n,
              (1n + partition : Nat),
              1n,
              1n,
              Handoff.Edit{},
              False{},
              (1n + fingerprint : Nat) <> Nil{},
              3n <> Nil{}
            } <> Canonical.SubmissionAuthorize{
              3n,
              1n
            } <> Canonical.SubmissionTerminal{
              3n,
              1n,
              True{}
            } <> Canonical.CollectionReleaseLease{3n, 1n} <> Nil{}
          )
        )
        == Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_result_RequestFinding(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.DispatchSettled{
              (1n + partition : Nat),
              1n,
              1n,
              3n
            } <> Canonical.CollectionReady{
              3n,
              (1n + partition : Nat),
              1n,
              1n,
              1n,
              False{}
            } <> Canonical.CollectionReserveLease{
              3n,
              1n
            } <> Canonical.SubmissionBegin{
              3n,
              (1n + partition : Nat),
              1n,
              1n,
              Handoff.Edit{},
              False{},
              (1n + fingerprint : Nat) <> Nil{},
              3n <> Nil{}
            } <> Canonical.SubmissionAuthorize{
              3n,
              1n
            } <> Canonical.SubmissionTerminal{
              3n,
              1n,
              True{}
            } <> Canonical.CollectionReleaseLease{3n, 1n} <> Nil{}
          )
        )
        == Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_settle_finding(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.CollectionReady{
              3n,
              (1n + partition : Nat),
              1n,
              1n,
              1n,
              False{}
            } <> Canonical.CollectionReserveLease{
              3n,
              1n
            } <> Canonical.SubmissionBegin{
              3n,
              (1n + partition : Nat),
              1n,
              1n,
              Handoff.Edit{},
              False{},
              (1n + fingerprint : Nat) <> Nil{},
              3n <> Nil{}
            } <> Canonical.SubmissionAuthorize{
              3n,
              1n
            } <> Canonical.SubmissionTerminal{
              3n,
              1n,
              True{}
            } <> Canonical.CollectionReleaseLease{3n, 1n} <> Nil{}
          )
        )
        == Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_ready(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.CollectionReserveLease{
              3n,
              1n
            } <> Canonical.SubmissionBegin{
              3n,
              (1n + partition : Nat),
              1n,
              1n,
              Handoff.Edit{},
              False{},
              (1n + fingerprint : Nat) <> Nil{},
              3n <> Nil{}
            } <> Canonical.SubmissionAuthorize{
              3n,
              1n
            } <> Canonical.SubmissionTerminal{
              3n,
              1n,
              True{}
            } <> Canonical.CollectionReleaseLease{3n, 1n} <> Nil{}
          )
        )
        == Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_lease(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.SubmissionBegin{
              3n,
              (1n + partition : Nat),
              1n,
              1n,
              Handoff.Edit{},
              False{},
              (1n + fingerprint : Nat) <> Nil{},
              3n <> Nil{}
            } <> Canonical.SubmissionAuthorize{
              3n,
              1n
            } <> Canonical.SubmissionTerminal{
              3n,
              1n,
              True{}
            } <> Canonical.CollectionReleaseLease{3n, 1n} <> Nil{}
          )
        )
        == Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_offer(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.SubmissionAuthorize{
              3n,
              1n
            } <> Canonical.SubmissionTerminal{
              3n,
              1n,
              True{}
            } <> Canonical.CollectionReleaseLease{3n, 1n} <> Nil{}
          )
        )
        == Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_authorize(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.SubmissionTerminal{
              3n,
              1n,
              True{}
            } <> Canonical.CollectionReleaseLease{3n, 1n} <> Nil{}
          )
        )
        == Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_submit(partition, size, fingerprint, limits, room) : {
        Core.advance(_, Core.run_events(Canonical.CollectionReleaseLease{3n, 1n} <> Nil{}))
        == Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_release(partition, size, fingerprint, limits, room) : {
        Core.advance(_, Core.run_events(Nil{}))
        == Some{Fixtures.final_finding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      {==}
    case Canonical.RequestClear{}:
      %journey_request_started(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.ReviewServiceRequestSettled{
              (1n + partition : Nat),
              1n,
              1n,
              3n,
              4n,
              Canonical.RequestClear{},
              True{}
            } <> Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{}
          )
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_result_RequestClear(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{})
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_settle_nonfinding(partition, size, fingerprint, limits, room) : {
        Core.advance(_, Core.run_events(Nil{}))
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      {==}
    case Canonical.RequestBackendFailure{}:
      %journey_request_started(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.ReviewServiceRequestSettled{
              (1n + partition : Nat),
              1n,
              1n,
              3n,
              4n,
              Canonical.RequestBackendFailure{},
              True{}
            } <> Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{}
          )
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_result_RequestBackendFailure(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{})
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_settle_nonfinding(partition, size, fingerprint, limits, room) : {
        Core.advance(_, Core.run_events(Nil{}))
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      {==}
    case Canonical.RequestTimeout{}:
      %journey_request_started(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.ReviewServiceRequestSettled{
              (1n + partition : Nat),
              1n,
              1n,
              3n,
              4n,
              Canonical.RequestTimeout{},
              True{}
            } <> Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{}
          )
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_result_RequestTimeout(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{})
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_settle_nonfinding(partition, size, fingerprint, limits, room) : {
        Core.advance(_, Core.run_events(Nil{}))
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      {==}
    case Canonical.RequestInterrupted{}:
      %journey_request_started(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.ReviewServiceRequestInterrupted{
              (1n + partition : Nat),
              1n,
              1n,
              3n,
              4n
            } <> Canonical.ReviewServiceRequestSettled{
              (1n + partition : Nat),
              1n,
              1n,
              3n,
              4n,
              Canonical.RequestInterrupted{},
              True{}
            } <> Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{}
          )
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_request_interrupted(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(
            Canonical.ReviewServiceRequestSettled{
              (1n + partition : Nat),
              1n,
              1n,
              3n,
              4n,
              Canonical.RequestInterrupted{},
              True{}
            } <> Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{}
          )
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_result_RequestInterrupted(partition, size, fingerprint, limits, room) : {
        Core.advance(
          _,
          Core.run_events(Canonical.DispatchSettled{(1n + partition : Nat), 1n, 1n, 3n} <> Nil{})
        )
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      %journey_settle_nonfinding(partition, size, fingerprint, limits, room) : {
        Core.advance(_, Core.run_events(Nil{}))
        == Some{Fixtures.resolved_nonfinding(partition, size, fingerprint, limits)}
        : Maybe<&2, Canonical.State>
      }
      {==}

def Laws.admitted_edit_reaches_resolution_and_submission(
  partition,
  size,
  fingerprint,
  limits,
  outcome,
  room
):
  Equal.trans(
    Maybe<&2, Canonical.State>,
    Core.run_events(
      Core.journey_events(partition, size, fingerprint, outcome),
      Canonical.initial(limits)
    ),
    Core.run_events(
      Core.result_events(partition, fingerprint, outcome),
      Fixtures.request_ready(partition, size, fingerprint, limits)
    ),
    Some{Core.expected_journey(partition, size, fingerprint, limits, outcome)},
    journey_prefix(partition, size, fingerprint, limits, outcome, room),
    journey_suffix(partition, size, fingerprint, limits, outcome, room)
  )

# ---- another_edit_does_not_block_collection ----
def outside_dependency(
  +items: List<&2, Canonical.ReviewWorkRecord>,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +observation: Nat,
  +owner: Nat,
  +generation: Nat,
  +current: Nat,
  +operation: Nat,
  +parent: Nat,
  different_operation: {False{} == Nat.is_eq(operation, observation) : Bool},
  different_parent: {False{} == Nat.is_eq(parent, observation) : Bool}
) -> {
      Bool.or(
        Bool.and(
          Nat.is_eq(owner, partition),
          Bool.and(
            Nat.is_eq(generation, lifetime),
            Bool.and(
              Nat.is_eq(current, round),
              Bool.or(Nat.is_eq(operation, observation), Nat.is_eq(parent, observation))
            )
          )
        ),
        Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
      )
      == Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
      : Bool
    }:
  %different_operation : {
    Bool.or(
      Bool.and(
        Nat.is_eq(owner, partition),
        Bool.and(
          Nat.is_eq(generation, lifetime),
          Bool.and(Nat.is_eq(current, round), Bool.or(_, Nat.is_eq(parent, observation)))
        )
      ),
      Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    )
    == Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    : Bool
  }
  %different_parent : {
    Bool.or(
      Bool.and(
        Nat.is_eq(owner, partition),
        Bool.and(Nat.is_eq(generation, lifetime), Bool.and(Nat.is_eq(current, round), _))
      ),
      Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    )
    == Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    : Bool
  }
  %and_false(Nat.is_eq(current, round)) : {
    Bool.or(
      Bool.and(Nat.is_eq(owner, partition), Bool.and(Nat.is_eq(generation, lifetime), _)),
      Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    )
    == Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    : Bool
  }
  %and_false(Nat.is_eq(generation, lifetime)) : {
    Bool.or(
      Bool.and(Nat.is_eq(owner, partition), _),
      Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    )
    == Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    : Bool
  }
  %and_false(Nat.is_eq(owner, partition)) : {
    Bool.or(_, Canonical.unfinished_for_observation(items, partition, lifetime, round, observation))
    == Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    : Bool
  }
  {==}

def Laws.another_edit_does_not_block_collection(
  items,
  partition,
  lifetime,
  round,
  observation,
  owner,
  generation,
  current,
  operation,
  charge,
  kind,
  parent,
  different_operation,
  different_parent
):
  match kind:
    case Canonical.PendingFinding{_}: {==}
    case Canonical.AwaitingSourceRead{}:
      outside_dependency(
        items,
        partition,
        lifetime,
        round,
        observation,
        owner,
        generation,
        current,
        operation,
        parent,
        different_operation,
        different_parent
      )
    case Canonical.SourceReading{}:
      outside_dependency(
        items,
        partition,
        lifetime,
        round,
        observation,
        owner,
        generation,
        current,
        operation,
        parent,
        different_operation,
        different_parent
      )
    case Canonical.Preparing{}:
      outside_dependency(
        items,
        partition,
        lifetime,
        round,
        observation,
        owner,
        generation,
        current,
        operation,
        parent,
        different_operation,
        different_parent
      )
    case Canonical.Reviewing{}:
      outside_dependency(
        items,
        partition,
        lifetime,
        round,
        observation,
        owner,
        generation,
        current,
        operation,
        parent,
        different_operation,
        different_parent
      )
    case Canonical.ReviewServiceRequestOutstanding{}:
      outside_dependency(
        items,
        partition,
        lifetime,
        round,
        observation,
        owner,
        generation,
        current,
        operation,
        parent,
        different_operation,
        different_parent
      )

# ---- newer_advice_cannot_sort_before_older ----
def Laws.newer_advice_cannot_sort_before_older(sequence, gap):
  match sequence:
    case 0n: {==}
    case 1n+rest: Laws.newer_advice_cannot_sort_before_older(rest, gap)

# ---- released_resources_allow_fresh_capacity ----
def purpose_limits(
  +purpose: Ledger.Purpose,
  +limits: Ledger.Limits
) -> {limits == Ledger.limits_for(purpose, limits) : Ledger.Limits}:
  match purpose:
    case Ledger.ObservationDispatch{}: {==}
    case Ledger.Preparation{}: {==}
    case Ledger.ReviewUnit{}: {==}
    case Ledger.StoredResult{}: {==}
    case Ledger.OperationalNotice{}: {==}
    case Ledger.AdviceRecheck{}: {==}

def Laws.released_resources_allow_fresh_capacity(
  charges,
  retained,
  limits,
  next_id,
  partition,
  bytes,
  purpose,
  unique,
  available
):
  %Equal.sym(
    Maybe<&2, Ledger.Ledger>,
    Core.release_charges(
      charges,
      Ledger.Ledger{limits, next_id, List.append(&2, Ledger.ReviewCapacityReservationRecord, charges, retained)}
    ),
    Some{Ledger.Ledger{limits, next_id, retained}},
    Laws.transient_resources_drain_without_reset(charges, retained, limits, next_id, unique)
  ) : {
    Core.capacity_after_release(_, partition, bytes, purpose)
    == Some{
      Ledger.Granted{
        Ledger.Ledger{
          limits,
          (next_id + 1n : Nat),
          List.append(
            &2,
            Ledger.ReviewCapacityReservationRecord,
            retained,
            Ledger.ReviewCapacityReservationRecord{next_id, partition, bytes, purpose} <> Nil{}
          )
        },
        next_id
      }
    }
    : Maybe<&2, Ledger.LedgerResult>
  }
  %purpose_limits(purpose, limits) : {
    Some{
      Ledger.reserve.check(
        limits,
        next_id,
        retained,
        partition,
        bytes,
        purpose,
        Ledger.fits(_, Ledger.total(retained), Ledger.partition_usage(retained, partition), bytes)
      )
    }
    == Some{
      Ledger.Granted{
        Ledger.Ledger{
          limits,
          (next_id + 1n : Nat),
          List.append(
            &2,
            Ledger.ReviewCapacityReservationRecord,
            retained,
            Ledger.ReviewCapacityReservationRecord{next_id, partition, bytes, purpose} <> Nil{}
          )
        },
        next_id
      }
    }
    : Maybe<&2, Ledger.LedgerResult>
  }
  %available : {
    Some{Ledger.reserve.check(limits, next_id, retained, partition, bytes, purpose, _)}
    == Some{
      Ledger.Granted{
        Ledger.Ledger{
          limits,
          (next_id + 1n : Nat),
          List.append(
            &2,
            Ledger.ReviewCapacityReservationRecord,
            retained,
            Ledger.ReviewCapacityReservationRecord{next_id, partition, bytes, purpose} <> Nil{}
          )
        },
        next_id
      }
    }
    : Maybe<&2, Ledger.LedgerResult>
  }
  {==}

# ---- physical_settlement_preserves_other_requests ----
def request_prepend_equal(
  +head: Dispatch.ReviewServiceRequestRecord,
  +left: List<&2, Dispatch.ReviewServiceRequestRecord>,
  +right: List<&2, Dispatch.ReviewServiceRequestRecord>,
  equal: {left == right : List<&2, Dispatch.ReviewServiceRequestRecord>}
) -> {head <> left == head <> right : List<&2, Dispatch.ReviewServiceRequestRecord>}:
  Equal.cong(List<&2, Dispatch.ReviewServiceRequestRecord>, List<&2, Dispatch.ReviewServiceRequestRecord>,
    items => head <> items, left, right, equal)

def request_prefix_cons(
  +head: Dispatch.ReviewServiceRequestRecord,
  +rest: List<&2, Dispatch.ReviewServiceRequestRecord>,
  +suffix: List<&2, Dispatch.ReviewServiceRequestRecord>,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +request: Nat,
  +started: Bool,
  +interrupted: Bool,
  head_clear: {
    False{}
    == Dispatch.request_matches(head, partition, lifetime, round, operation, request)
    : Bool
  },
  tail_facts: ({
    Some{Dispatch.ReviewServiceRequestRecord{partition, lifetime, round, operation, request, started, interrupted}}
    == Dispatch.request_phase(
      List.append(
        &2,
        Dispatch.ReviewServiceRequestRecord,
        rest,
        Dispatch.ReviewServiceRequestRecord{
          partition,
          lifetime,
          round,
          operation,
          request,
          started,
          interrupted
        } <> suffix
      ),
      partition,
      lifetime,
      round,
      operation,
      request
    )
    : Maybe<&2, Dispatch.ReviewServiceRequestRecord>
  } & {
    List.append(&2, Dispatch.ReviewServiceRequestRecord, rest, suffix)
    == Dispatch.request_remove(
      List.append(
        &2,
        Dispatch.ReviewServiceRequestRecord,
        rest,
        Dispatch.ReviewServiceRequestRecord{
          partition,
          lifetime,
          round,
          operation,
          request,
          started,
          interrupted
        } <> suffix
      ),
      partition,
      lifetime,
      round,
      operation,
      request
    )
    : List<&2, Dispatch.ReviewServiceRequestRecord>
  })
) -> ({
          Some{
            Dispatch.ReviewServiceRequestRecord{partition, lifetime, round, operation, request, started, interrupted}
          }
          == Dispatch.request_phase(
            List.append(
              &2,
              Dispatch.ReviewServiceRequestRecord,
              head <> rest,
              Dispatch.ReviewServiceRequestRecord{
                partition,
                lifetime,
                round,
                operation,
                request,
                started,
                interrupted
              } <> suffix
            ),
            partition,
            lifetime,
            round,
            operation,
            request
          )
          : Maybe<&2, Dispatch.ReviewServiceRequestRecord>
        } &
    {
      List.append(&2, Dispatch.ReviewServiceRequestRecord, head <> rest, suffix)
      == Dispatch.request_remove(
        List.append(
          &2,
          Dispatch.ReviewServiceRequestRecord,
          head <> rest,
          Dispatch.ReviewServiceRequestRecord{
            partition,
            lifetime,
            round,
            operation,
            request,
            started,
            interrupted
          } <> suffix
        ),
        partition,
        lifetime,
        round,
        operation,
        request
      )
      : List<&2, Dispatch.ReviewServiceRequestRecord>
    }):
  match tail_facts:
    case (phase, removed):
      %head_clear :
        {
          Some{
            Dispatch.ReviewServiceRequestRecord{partition, lifetime, round, operation, request, started, interrupted}
          }
          == Bool.pick(
            Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
            _,
            Some{head},
            Dispatch.request_phase(
              List.append(
                &2,
                Dispatch.ReviewServiceRequestRecord,
                rest,
                Dispatch.ReviewServiceRequestRecord{
                  partition,
                  lifetime,
                  round,
                  operation,
                  request,
                  started,
                  interrupted
                } <> suffix
              ),
              partition,
              lifetime,
              round,
              operation,
              request
            )
          )
          : Maybe<&2, Dispatch.ReviewServiceRequestRecord>
        } &
        {
          head <> List.append(&2, Dispatch.ReviewServiceRequestRecord, rest, suffix)
          == Bool.pick(
            List<&2, Dispatch.ReviewServiceRequestRecord>,
            _,
            List.append(
              &2,
              Dispatch.ReviewServiceRequestRecord,
              rest,
              Dispatch.ReviewServiceRequestRecord{
                partition,
                lifetime,
                round,
                operation,
                request,
                started,
                interrupted
              } <> suffix
            ),
            head <> Dispatch.request_remove(
              List.append(
                &2,
                Dispatch.ReviewServiceRequestRecord,
                rest,
                Dispatch.ReviewServiceRequestRecord{
                  partition,
                  lifetime,
                  round,
                  operation,
                  request,
                  started,
                  interrupted
                } <> suffix
              ),
              partition,
              lifetime,
              round,
              operation,
              request
            )
          )
          : List<&2, Dispatch.ReviewServiceRequestRecord>
        }
      (
        phase,
        request_prepend_equal(
          head,
          List.append(&2, Dispatch.ReviewServiceRequestRecord, rest, suffix),
          Dispatch.request_remove(
            List.append(
              &2,
              Dispatch.ReviewServiceRequestRecord,
              rest,
              Dispatch.ReviewServiceRequestRecord{
                partition,
                lifetime,
                round,
                operation,
                request,
                started,
                interrupted
              } <> suffix
            ),
            partition,
            lifetime,
            round,
            operation,
            request
          ),
          removed
        )
      )

def request_prefix_facts(
  +prefix: List<&2, Dispatch.ReviewServiceRequestRecord>,
  +suffix: List<&2, Dispatch.ReviewServiceRequestRecord>,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +request: Nat,
  +started: Bool,
  +interrupted: Bool,
  unmatched: Core.UnmatchedRequests(prefix, partition, lifetime, round, operation, request)
) -> ({
      Some{Dispatch.ReviewServiceRequestRecord{partition, lifetime, round, operation, request, started, interrupted}}
      == Dispatch.request_phase(
        List.append(
          &2,
          Dispatch.ReviewServiceRequestRecord,
          prefix,
          Dispatch.ReviewServiceRequestRecord{
            partition,
            lifetime,
            round,
            operation,
            request,
            started,
            interrupted
          } <> suffix
        ),
        partition,
        lifetime,
        round,
        operation,
        request
      )
      : Maybe<&2, Dispatch.ReviewServiceRequestRecord>
    } &
    {
      List.append(&2, Dispatch.ReviewServiceRequestRecord, prefix, suffix)
      == Dispatch.request_remove(
        List.append(
          &2,
          Dispatch.ReviewServiceRequestRecord,
          prefix,
          Dispatch.ReviewServiceRequestRecord{
            partition,
            lifetime,
            round,
            operation,
            request,
            started,
            interrupted
          } <> suffix
        ),
        partition,
        lifetime,
        round,
        operation,
        request
      )
      : List<&2, Dispatch.ReviewServiceRequestRecord>
    }):
  match prefix:
    case Nil{}:
      (
        Shared.request_head_phase(
          suffix,
          partition,
          lifetime,
          round,
          operation,
          request,
          started,
          interrupted
        ),
        Shared.request_head_remove(
          suffix,
          partition,
          lifetime,
          round,
          operation,
          request,
          started,
          interrupted
        )
      )
    case +head <> rest:
      match unmatched:
        case (head_clear, tail_clear):
          request_prefix_cons(head, rest, suffix, partition, lifetime, round, operation, request,
            started, interrupted, head_clear,
            request_prefix_facts(rest, suffix, partition, lifetime, round, operation, request,
              started, interrupted, tail_clear))


def settlement_with_prefix_facts(
  +queued: List<&2, Dispatch.ScheduledReviewWork>,
  +running: List<&2, Dispatch.ScheduledReviewWork>,
  +sequence: Nat,
  +closed: Bool,
  +prefix: List<&2, Dispatch.ReviewServiceRequestRecord>,
  +suffix: List<&2, Dispatch.ReviewServiceRequestRecord>,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +request: Nat,
  +started: Bool,
  +interrupted: Bool,
  facts: {
    Some{Dispatch.ReviewServiceRequestRecord{partition, lifetime, round, operation, request, started, interrupted}}
    == Dispatch.request_phase(
      List.append(
        &2,
        Dispatch.ReviewServiceRequestRecord,
        prefix,
        Dispatch.ReviewServiceRequestRecord{
          partition,
          lifetime,
          round,
          operation,
          request,
          started,
          interrupted
        } <> suffix
      ),
      partition,
      lifetime,
      round,
      operation,
      request
    )
    : Maybe<&2, Dispatch.ReviewServiceRequestRecord>
  } & {
    List.append(&2, Dispatch.ReviewServiceRequestRecord, prefix, suffix)
    == Dispatch.request_remove(
      List.append(
        &2,
        Dispatch.ReviewServiceRequestRecord,
        prefix,
        Dispatch.ReviewServiceRequestRecord{
          partition,
          lifetime,
          round,
          operation,
          request,
          started,
          interrupted
        } <> suffix
      ),
      partition,
      lifetime,
      round,
      operation,
      request
    )
    : List<&2, Dispatch.ReviewServiceRequestRecord>
  }
) -> {
          Dispatch.request_update(
            Dispatch.State{
              queued,
              running,
              sequence,
              closed,
              List.append(
                &2,
                Dispatch.ReviewServiceRequestRecord,
                prefix,
                Dispatch.ReviewServiceRequestRecord{
                  partition,
                  lifetime,
                  round,
                  operation,
                  request,
                  started,
                  interrupted
                } <> suffix
              )
            },
            partition,
            lifetime,
            round,
            operation,
            request,
            False{},
            False{},
            True{}
          )
          == Dispatch.ReviewServiceRequestAccepted{
            Dispatch.State{
              queued,
              running,
              sequence,
              closed,
              List.append(&2, Dispatch.ReviewServiceRequestRecord, prefix, suffix)
            }
          }
          : Dispatch.ReviewServiceRequestResult
        }:
  match facts:
    case (phase, removed):
      %phase : {
        Dispatch.request_update_found(
          Dispatch.State{
            queued,
            running,
            sequence,
            closed,
            List.append(
              &2,
              Dispatch.ReviewServiceRequestRecord,
              prefix,
              Dispatch.ReviewServiceRequestRecord{
                partition,
                lifetime,
                round,
                operation,
                request,
                started,
                interrupted
              } <> suffix
            )
          },
          partition,
          lifetime,
          round,
          operation,
          request,
          False{},
          False{},
          True{},
          _
        )
        == Dispatch.ReviewServiceRequestAccepted{
          Dispatch.State{
            queued,
            running,
            sequence,
            closed,
            List.append(&2, Dispatch.ReviewServiceRequestRecord, prefix, suffix)
          }
        }
        : Dispatch.ReviewServiceRequestResult
      }
      %removed : {
        Dispatch.ReviewServiceRequestAccepted{Dispatch.State{queued, running, sequence, closed, _}}
        == Dispatch.ReviewServiceRequestAccepted{Dispatch.State{queued, running, sequence, closed,
          List.append(&2, Dispatch.ReviewServiceRequestRecord, prefix, suffix)}} : Dispatch.ReviewServiceRequestResult}
      {==}


def Laws.physical_settlement_preserves_other_requests(
  queued,
  running,
  sequence,
  closed,
  prefix,
  suffix,
  partition,
  lifetime,
  round,
  operation,
  request,
  started,
  interrupted,
  unmatched
):
  settlement_with_prefix_facts(queued, running, sequence, closed, prefix, suffix,
    partition, lifetime, round, operation, request, started, interrupted,
    request_prefix_facts(prefix, suffix, partition, lifetime, round, operation, request,
      started, interrupted, unmatched))

# ---- interruption_keeps_physical_permit ----
def Laws.interruption_keeps_physical_permit(queued, running, sequence,
    closed, requests, partition, lifetime, round, operation, request):
  %Shared.request_head_phase(requests, partition, lifetime, round, operation,
    request, True{}, False{}) : {
      Dispatch.request_update_found(
        Dispatch.State{
          queued,
          running,
          sequence,
          closed,
          Dispatch.ReviewServiceRequestRecord{
            partition,
            lifetime,
            round,
            operation,
            request,
            True{},
            False{}
          } <> requests
        },
        partition,
        lifetime,
        round,
        operation,
        request,
        False{},
        True{},
        False{},
        _
      )
      == Dispatch.ReviewServiceRequestAccepted{
        Dispatch.State{
          queued,
          running,
          sequence,
          closed,
          Dispatch.ReviewServiceRequestRecord{
            partition,
            lifetime,
            round,
            operation,
            request,
            True{},
            True{}
          } <> requests
        }
      }
      : Dispatch.ReviewServiceRequestResult
    }
  %Shared.request_matches_self(partition, lifetime, round, operation, request,
    True{}, False{}) : {
      Dispatch.ReviewServiceRequestAccepted{
        Dispatch.State{
          queued,
          running,
          sequence,
          closed,
          Bool.pick(
            List<&2, Dispatch.ReviewServiceRequestRecord>,
            _,
            Dispatch.ReviewServiceRequestRecord{
              partition,
              lifetime,
              round,
              operation,
              request,
              True{},
              True{}
            } <> requests,
            Dispatch.ReviewServiceRequestRecord{
              partition,
              lifetime,
              round,
              operation,
              request,
              True{},
              False{}
            } <> Dispatch.request_interrupted(
              requests,
              partition,
              lifetime,
              round,
              operation,
              request
            )
          )
        }
      }
      == Dispatch.ReviewServiceRequestAccepted{
        Dispatch.State{
          queued,
          running,
          sequence,
          closed,
          Dispatch.ReviewServiceRequestRecord{
            partition,
            lifetime,
            round,
            operation,
            request,
            True{},
            True{}
          } <> requests
        }
      }
      : Dispatch.ReviewServiceRequestResult
    }
  {==}

# ---- absent_request_terminal_preserves_entire_state ----
def Laws.absent_request_terminal_preserves_entire_state(ledger, rounds, work,
    next_round, next_operation, admissions, queued, running, sequence, closed,
    requests, collection, history, partition, lifetime, round, operation,
    request, outcome, current_work, absent):
  %Equal.sym(Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
    Dispatch.request_phase(requests, partition, lifetime, round, operation, request),
    None{}, absent) : {
    Canonical.request_settled_found(Canonical.State{ledger, rounds, work, next_round,
      next_operation, admissions, Dispatch.State{queued, running, sequence, closed, requests},
      collection, history}, partition, lifetime, round, operation, request,
      outcome, current_work, _)
    == Canonical.Rejected{Canonical.State{ledger, rounds, work, next_round,
      next_operation, admissions, Dispatch.State{queued, running, sequence, closed, requests},
      collection, history}, Canonical.StaleOperation{}} : Canonical.Step}
  {==}

# ---- dispatch_cancellation_keeps_physical_requests ----
def discard_requests_kept(+queued: List<&2, Dispatch.ScheduledReviewWork>,
    +running: List<&2, Dispatch.ScheduledReviewWork>, +sequence: Nat, +closed: Bool,
    +requests: List<&2, Dispatch.ReviewServiceRequestRecord>,
    waiting: Dispatch.Filtered, executing: Dispatch.Filtered) -> {
    Core.dispatched_requests(Dispatch.discarded_result(
      Dispatch.State{queued, running, sequence, closed, requests}, waiting, executing))
    == requests : List<&2, Dispatch.ReviewServiceRequestRecord>}:
  match waiting executing:
    case Dispatch.Filtered{_, _} Dispatch.Filtered{_, _}: {==}

def Laws.dispatch_cancellation_keeps_physical_requests(queued, running, sequence,
    closed, requests, operations):
  discard_requests_kept(queued, running, sequence, closed, requests,
    Dispatch.filter_queued(queued, operations), Dispatch.filter_running(running, operations))

# ---- removal_preserves_all_other_work ----
def conservation_remove_choice(
  +p: Nat,
  +l: Nat,
  +r: Nat,
  +op: Nat,
  +charge: Nat,
  +kind: Canonical.ReviewWorkPhase,
  +parent: Nat,
  +operation: Nat,
  +filtered: List<&2, Canonical.ReviewWorkRecord>,
  +rest: List<&2, Canonical.ReviewWorkRecord>,
  +hit: Bool,
  +agrees: {hit == Nat.is_eq(op, operation) : Bool},
  ih: {
    Core.other_work(operation, filtered)
    == Core.other_work(operation, rest)
    : List<&2, Canonical.ReviewWorkRecord>
  }
) -> {
  Core.other_work(
    operation,
    Canonical.remove_work_pick(
      Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
      filtered,
      Nat.is_eq(op, operation)
    )
  )
  == Core.other_work(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match hit:
    case True{}:
      %agrees : {
        Core.other_work(
          operation,
          Canonical.remove_work_pick(Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent}, filtered, _)
        )
        == Core.other_work(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %agrees : {
        Core.other_work(operation, filtered)
        == Core.keep_other(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
          Core.other_work(operation, rest),
          _
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case False{}:
      %agrees : {
        Core.other_work(
          operation,
          Canonical.remove_work_pick(Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent}, filtered, _)
        )
        == Core.other_work(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %agrees : {
        Core.keep_other(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
          Core.other_work(operation, filtered),
          _
        )
        == Core.other_work(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %agrees : {
        Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> Core.other_work(operation, filtered)
        == Core.keep_other(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
          Core.other_work(operation, rest),
          _
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      Equal.cong(
        List<&2, Canonical.ReviewWorkRecord>,
        List<&2, Canonical.ReviewWorkRecord>,
        prepend_work(Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent}),
        Core.other_work(operation, filtered),
        Core.other_work(operation, rest),
        ih
      )
def Laws.removal_preserves_all_other_work(items, operation):
  match items:
    case Nil{}: {==}
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, old_kind, parent} <> rest:
      conservation_remove_choice(
        p,
        l,
        r,
        op,
        charge,
        old_kind,
        parent,
        operation,
        Canonical.remove_work(operation, rest),
        rest,
        Nat.is_eq(op, operation),
        {==},
        Laws.removal_preserves_all_other_work(rest, operation)
      )

# ---- stage_change_preserves_all_other_work ----
def conservation_change_choice(
  +p: Nat,
  +l: Nat,
  +r: Nat,
  +op: Nat,
  +charge: Nat,
  +kind: Canonical.ReviewWorkPhase,
  +parent: Nat,
  +operation: Nat,
  +next_kind: Canonical.ReviewWorkPhase,
  +filtered: List<&2, Canonical.ReviewWorkRecord>,
  +rest: List<&2, Canonical.ReviewWorkRecord>,
  +hit: Bool,
  +agrees: {hit == Nat.is_eq(op, operation) : Bool},
  ih: {
    Core.other_work(operation, filtered)
    == Core.other_work(operation, rest)
    : List<&2, Canonical.ReviewWorkRecord>
  }
) -> {
  Core.other_work(
    operation,
    Canonical.replace_work_kind_pick(
      Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
      Canonical.ReviewWorkRecord{p, l, r, op, charge, next_kind, parent},
      filtered,
      Nat.is_eq(op, operation)
    )
  )
  == Core.other_work(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match hit:
    case True{}:
      %agrees : {
        Core.other_work(
          operation,
          Canonical.replace_work_kind_pick(
            Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
            Canonical.ReviewWorkRecord{p, l, r, op, charge, next_kind, parent},
            filtered,
            _
          )
        )
        == Core.other_work(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %agrees : {
        Core.keep_other(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, next_kind, parent},
          Core.other_work(operation, filtered),
          _
        )
        == Core.other_work(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %agrees : {
        Core.other_work(operation, filtered)
        == Core.keep_other(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
          Core.other_work(operation, rest),
          _
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      ih
    case False{}:
      %agrees : {
        Core.other_work(
          operation,
          Canonical.replace_work_kind_pick(
            Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
            Canonical.ReviewWorkRecord{p, l, r, op, charge, next_kind, parent},
            filtered,
            _
          )
        )
        == Core.other_work(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %agrees : {
        Core.keep_other(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
          Core.other_work(operation, filtered),
          _
        )
        == Core.other_work(operation, Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> rest)
        : List<&2, Canonical.ReviewWorkRecord>
      }
      %agrees : {
        Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent} <> Core.other_work(operation, filtered)
        == Core.keep_other(
          Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent},
          Core.other_work(operation, rest),
          _
        )
        : List<&2, Canonical.ReviewWorkRecord>
      }
      Equal.cong(
        List<&2, Canonical.ReviewWorkRecord>,
        List<&2, Canonical.ReviewWorkRecord>,
        prepend_work(Canonical.ReviewWorkRecord{p, l, r, op, charge, kind, parent}),
        Core.other_work(operation, filtered),
        Core.other_work(operation, rest),
        ih
      )
def Laws.stage_change_preserves_all_other_work(items, operation, kind):
  match items:
    case Nil{}: {==}
    case Canonical.ReviewWorkRecord{p, l, r, op, charge, old_kind, parent} <> rest:
      conservation_change_choice(
        p,
        l,
        r,
        op,
        charge,
        old_kind,
        parent,
        operation,
        kind,
        Canonical.replace_work_kind(operation, kind, rest),
        rest,
        Nat.is_eq(op, operation),
        {==},
        Laws.stage_change_preserves_all_other_work(rest, operation, kind)
      )

# ---- accepted_observation_is_recorded_without_losing_work ----
def conservation_round_matches(+partition: Nat, +lifetime: Nat, +round: Nat,
  +waiting: Bool, +write: Maybe<&2, Nat>, +uncertain: Bool, +quiet_since: Maybe<&2, Nat>) -> {
    True{}
    == Canonical.same_round(
      partition,
      lifetime,
      round,
      Canonical.Round{partition, lifetime, round, waiting, False{}, write, uncertain, quiet_since}
    )
    : Bool
  }:
  %Shared.nat_eq_self(partition) : {
    True{}
    == Bool.and(_, Bool.and(Nat.is_eq(lifetime, lifetime), Nat.is_eq(round, round)))
    : Bool
  }
  %Shared.nat_eq_self(lifetime) : {True{} == Bool.and(_, Nat.is_eq(round, round)) : Bool}
  Shared.nat_eq_self(round)

def Laws.accepted_observation_is_recorded_without_losing_work(state, partition, lifetime, round,
  waiting, write, uncertain, quiet_since, current):
  match state:
    case Canonical.State{
      ledger,
      rounds,
      work,
      next_round,
      next_operation,
      admissions,
      dispatch,
      collection,
      history
    }:
      %current : {
        Canonical.admit_observation_found(state, partition, lifetime, round, _)
        == Core.expected_observation(state, partition, lifetime, round) : Canonical.Step
      }
      %conservation_round_matches(
        partition,
        lifetime,
        round,
        waiting,
        write,
        uncertain,
        quiet_since
      ) : {
        Bool.pick(Canonical.Step, Bool.and(_, Bool.not(False{})),
          Core.expected_observation(state, partition, lifetime, round),
          Canonical.Rejected{state, Canonical.StaleRound{}})
        == Core.expected_observation(state, partition, lifetime, round) : Canonical.Step
      }
      {==}

# ---- old_revision_release_preserves_new_registry ----
def Laws.old_revision_release_preserves_new_registry(entries, next_generation,
    subject, input, retained_generation, old_generation, members, found, different):
  %Equal.sym(Maybe<&2, RevisionState.Entry>,
      RevisionState.find(subject, entries),
      Some{RevisionState.Entry{subject, input, retained_generation, members}}, found) : {
    RevisionState.release_found(RevisionState.State{entries, next_generation},
      subject, old_generation, _) == RevisionState.State{entries, next_generation}
    : RevisionState.State}
  %Equal.sym(Bool, Nat.is_eq(retained_generation, old_generation), False{}, different) : {
    Bool.pick(RevisionState.State, _,
      Bool.pick(RevisionState.State, Nat.is_lt(1n, members),
        RevisionState.State{RevisionState.Entry{subject, input, retained_generation,
          (members - 1n : Nat)} <> RevisionState.without(subject, entries), next_generation},
        RevisionState.State{RevisionState.without(subject, entries), next_generation}),
      RevisionState.State{entries, next_generation})
    == RevisionState.State{entries, next_generation} : RevisionState.State}
  {==}

# ---- old_generation_cannot_become_current_again ----
def Laws.old_generation_cannot_become_current_again(entries, next_generation,
    input, retained_input, subject, retained_generation, old_generation, members, found, different):
  %Equal.sym(Maybe<&2, RevisionState.Entry>,
      RevisionState.find(subject, entries),
      Some{RevisionState.Entry{subject, retained_input, retained_generation, members}}, found) : {
    RevisionState.current_found(input, old_generation, _) == False{} : Bool}
  %Equal.sym(Bool, Nat.is_eq(old_generation, retained_generation), False{}, different) : {
    Bool.and(Nat.is_eq(input, retained_input), _) == False{} : Bool}
  Equal.sym(Bool, False{}, Bool.and(Nat.is_eq(input, retained_input), False{}),
    and_false(Nat.is_eq(input, retained_input)))

# ---- review_observation_preserves_other_findings ----
def stale_preserve_released(
  +state: Canonical.State,
  +operation: Nat,
  +outcome: Canonical.Outcome,
  +charge: Nat,
  +result: Ledger.LedgerResult
) -> {
  Core.other_findings(
    operation,
    Core.work(
      Core.step_state(Canonical.reviewed_released(state, operation, outcome, charge, result))
    )
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match state result:
    case Canonical.State{_, _, work, _, _, _, _, _, _} Ledger.Granted{_, _}:
      Laws.removal_preserves_other_findings(work, operation)
    case _ Ledger.Rejected{_}: {==}

def stale_preserve_retained_result(
  +state: Canonical.State,
  +operation: Nat,
  +result: Ledger.LedgerResult
) -> {
  Core.other_findings(
    operation,
    Core.work(Core.step_state(Canonical.reviewed_retained_result(state, operation, result)))
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match state result:
    case Canonical.State{_, _, work, _, _, _, _, _, _} Ledger.Granted{_, _}:
      Laws.stage_change_preserves_other_findings(work, operation, Canonical.PendingFinding{1n})
    case _ Ledger.Rejected{_}: {==}

def stale_preserve_retained_charge(
  +state: Canonical.State,
  +operation: Nat,
  +charge: Nat,
  +found: Maybe<&2, Ledger.ReviewCapacityReservationRecord>
) -> {
  Core.other_findings(
    operation,
    Core.work(Core.step_state(Canonical.reviewed_retained_charge(state, operation, charge, found)))
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match state found:
    case Canonical.State{+ledger, _, _, _, _, _, _, _, _} Some{Ledger.ReviewCapacityReservationRecord{_, _, +bytes, _}}:
      stale_preserve_retained_result(
        state,
        operation,
        Ledger.resize_for(ledger, charge, bytes, Ledger.StoredResult{})
      )
    case _ None{}: {==}

def stale_preserve_retained_find(
  +state: Canonical.State,
  +operation: Nat,
  +charge: Nat,
  +ledger: Ledger.Ledger
) -> {
  Core.other_findings(
    operation,
    Core.work(Core.step_state(Canonical.reviewed_retained_find(state, operation, charge, ledger)))
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match ledger:
    case Ledger.Ledger{_, _, charges}:
      stale_preserve_retained_charge(state, operation, charge, Ledger.find(charge, charges))

def stale_preserve_pick(
  +state: Canonical.State,
  +operation: Nat,
  +left: Canonical.Step,
  +right: Canonical.Step,
  +choice: Bool,
  a: {
    Core.other_findings(operation, Core.work(Core.step_state(left)))
    == Core.other_findings(operation, Core.work(state))
    : List<&2, Canonical.ReviewWorkRecord>
  },
  b: {
    Core.other_findings(operation, Core.work(Core.step_state(right)))
    == Core.other_findings(operation, Core.work(state))
    : List<&2, Canonical.ReviewWorkRecord>
  }
) -> {
  Core.other_findings(
    operation,
    Core.work(Core.step_state(Bool.pick(Canonical.Step, choice, left, right)))
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match choice:
    case True{}: a
    case False{}: b

def stale_preserve_decide(
  +state: Canonical.State,
  +operation: Nat,
  +charge: Nat,
  +parent: Nat,
  +outcome: Canonical.Outcome
) -> {
  Core.other_findings(
    operation,
    Core.work(Core.step_state(Canonical.reviewed_decide(state, operation, charge, parent, outcome)))
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match state outcome:
    case Canonical.State{+ledger, _, _, _, _, _, _, _, _} Canonical.Finding{}:
      stale_preserve_pick(
        state,
        operation,
        Canonical.reviewed_retained_find(state, operation, charge, ledger),
        Canonical.reviewed_released(
          state,
          operation,
          Canonical.Finding{},
          charge,
          Ledger.release(ledger, charge)
        ),
        Nat.is_gt(parent, 0n),
        stale_preserve_retained_find(state, operation, charge, ledger),
        stale_preserve_released(
          state,
          operation,
          Canonical.Finding{},
          charge,
          Ledger.release(ledger, charge)
        )
      )
    case Canonical.State{+ledger, _, _, _, _, _, _, _, _} Canonical.Clear{}:
      stale_preserve_released(
        state,
        operation,
        Canonical.Clear{},
        charge,
        Ledger.release(ledger, charge)
      )
    case Canonical.State{+ledger, _, _, _, _, _, _, _, _} Canonical.Unavailable{}:
      stale_preserve_released(
        state,
        operation,
        Canonical.Unavailable{},
        charge,
        Ledger.release(ledger, charge)
      )
    case Canonical.State{+ledger, _, _, _, _, _, _, _, _} Canonical.Interrupted{}:
      stale_preserve_released(
        state,
        operation,
        Canonical.Interrupted{},
        charge,
        Ledger.release(ledger, charge)
      )
    case Canonical.State{+ledger, _, _, _, _, _, _, _, _} Canonical.Discarded{}:
      stale_preserve_released(
        state,
        operation,
        Canonical.Discarded{},
        charge,
        Ledger.release(ledger, charge)
      )

def stale_preserve_found(
  +state: Canonical.State,
  +operation: Nat,
  +outcome: Canonical.Outcome,
  +found: Maybe<&2, Canonical.ReviewWorkRecord>
) -> {
  Core.other_findings(
    operation,
    Core.work(Core.step_state(Canonical.reviewed_found(state, operation, outcome, found)))
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match found:
    case Some{Canonical.ReviewWorkRecord{_, _, _, _, charge, Canonical.Reviewing{}, parent}}:
      stale_preserve_decide(state, operation, charge, parent, outcome)
    case Some{Canonical.ReviewWorkRecord{_, _, _, _, charge, Canonical.ReviewServiceRequestOutstanding{}, parent}}:
      stale_preserve_decide(state, operation, charge, parent, outcome)
    case None{}: {==}
    case Some{Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.AwaitingSourceRead{}, _}}: {==}
    case Some{Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.SourceReading{}, _}}: {==}
    case Some{Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.Preparing{}, _}}: {==}
    case Some{Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.PendingFinding{_}, _}}: {==}

def stale_preserve_reviewed(
  +state: Canonical.State,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +outcome: Canonical.Outcome
) -> {
  Core.other_findings(
    operation,
    Core.work(
      Core.step_state(Canonical.reviewed(state, partition, lifetime, round, operation, outcome))
    )
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match state:
    case Canonical.State{_, _, work, _, _, _, _, _, _}:
      stale_preserve_found(
        state,
        operation,
        outcome,
        Canonical.find_work(partition, lifetime, round, operation, work)
      )

def stale_preserve_stale_found(
  +state: Canonical.State,
  +operation: Nat,
  +found: Maybe<&2, Canonical.ReviewWorkRecord>
) -> {
  Core.other_findings(
    operation,
    Core.work(Core.step_state(Canonical.reviewed_stale_found(state, operation, found)))
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match state found:
    case Canonical.State{+ledger, _, _, _, _, _, _, _, _} Some{
      Canonical.ReviewWorkRecord{_, _, _, _, +charge, Canonical.Reviewing{}, _}
    }:
      stale_preserve_released(
        state,
        operation,
        Canonical.Finding{},
        charge,
        Ledger.release(ledger, charge)
      )
    case Canonical.State{+ledger, _, _, _, _, _, _, _, _} Some{
      Canonical.ReviewWorkRecord{_, _, _, _, +charge, Canonical.ReviewServiceRequestOutstanding{}, _}
    }:
      stale_preserve_released(
        state,
        operation,
        Canonical.Finding{},
        charge,
        Ledger.release(ledger, charge)
      )
    case _ None{}: {==}
    case _ Some{Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.AwaitingSourceRead{}, _}}: {==}
    case _ Some{Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.SourceReading{}, _}}: {==}
    case _ Some{Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.Preparing{}, _}}: {==}
    case _ Some{Canonical.ReviewWorkRecord{_, _, _, _, _, Canonical.PendingFinding{_}, _}}: {==}

def stale_preserve_stale(
  +state: Canonical.State,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat
) -> {
  Core.other_findings(
    operation,
    Core.work(
      Core.step_state(Canonical.reviewed_stale(state, partition, lifetime, round, operation))
    )
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match state:
    case Canonical.State{_, _, work, _, _, _, _, _, _}:
      stale_preserve_stale_found(
        state,
        operation,
        Canonical.find_work(partition, lifetime, round, operation, work)
      )

def stale_preserve_append(
  +state: Canonical.State,
  +operation: Nat,
  +step: Canonical.Step,
  +command: Canonical.Output,
  held: {
    Core.other_findings(operation, Core.work(Core.step_state(step)))
    == Core.other_findings(operation, Core.work(state))
    : List<&2, Canonical.ReviewWorkRecord>
  }
) -> {
  Core.other_findings(
    operation,
    Core.work(Core.step_state(Canonical.append_review_disposition(step, command)))
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match step:
    case Canonical.Advanced{_, _}: held
    case Canonical.Rejected{_, _}: held

def stale_preserve_choice(
  +state: Canonical.State,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +operation: Nat,
  +outcome: Canonical.Outcome,
  +choice: WorkPolicy.EvaluatedDisposition
) -> {
  Core.other_findings(
    operation,
    Core.work(
      Core.step_state(
        Canonical.review_observed_choice(
          state,
          partition,
          lifetime,
          round,
          operation,
          outcome,
          choice
        )
      )
    )
  )
  == Core.other_findings(operation, Core.work(state))
  : List<&2, Canonical.ReviewWorkRecord>
}:
  match choice:
    case WorkPolicy.FindingRetained{}:
      stale_preserve_append(
        state,
        operation,
        Canonical.reviewed(state, partition, lifetime, round, operation, outcome),
        Canonical.EventEstablished{Canonical.FindingRetained{}},
        stale_preserve_reviewed(state, partition, lifetime, round, operation, outcome)
      )
    case WorkPolicy.StaleFindingRetired{}:
      stale_preserve_append(
        state,
        operation,
        Canonical.reviewed_stale(state, partition, lifetime, round, operation),
        Canonical.EventEstablished{Canonical.StaleFindingRetired{}},
        stale_preserve_stale(state, partition, lifetime, round, operation)
      )
    case WorkPolicy.ClearSettled{}:
      stale_preserve_append(
        state,
        operation,
        Canonical.reviewed(state, partition, lifetime, round, operation, outcome),
        Canonical.EventEstablished{Canonical.ClearSettled{}},
        stale_preserve_reviewed(state, partition, lifetime, round, operation, outcome)
      )
    case WorkPolicy.StaleClearSettled{}:
      stale_preserve_append(
        state,
        operation,
        Canonical.reviewed(state, partition, lifetime, round, operation, outcome),
        Canonical.EventEstablished{Canonical.StaleClearSettled{}},
        stale_preserve_reviewed(state, partition, lifetime, round, operation, outcome)
      )

def Laws.review_observation_preserves_other_findings(
  state,
  partition,
  lifetime,
  round,
  operation,
  outcome,
  current_work
):
  stale_preserve_choice(state, partition, lifetime, round, operation, outcome,
    WorkPolicy.evaluated_disposition(Canonical.is_finding(outcome), current_work))
