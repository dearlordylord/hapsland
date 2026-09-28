import Base

# Global and per-partition logical reservations. The adapter maps exact
# partition strings bijectively to Nat IDs and holds object capabilities.
type Limits is Data:
  Limits{global_items: Nat, global_bytes: Nat, partition_items: Nat, partition_bytes: Nat}

type Purpose is Data:
  ObservationDispatch{}
  Preparation{}
  ReviewUnit{}
  StoredResult{}
  OperationalNotice{}
  AdviceRecheck{}

# Logical review-data reservation, not measured process memory or Jev capacity.
type Charge is Data:
  Charge{id: Nat, partition: Nat, bytes: Nat, purpose: Purpose}

type Ledger is Data:
  Ledger{limits: Limits, next_id: Nat, charges: List<&2, Charge>}

type Usage is Data:
  Usage{items: Nat, bytes: Nat}

type LedgerResult is Data:
  Granted{state: Ledger, id: Nat}
  Rejected{state: Ledger}

type FitDecision is Data:
  Fits{}
  GlobalItemLimit{}
  GlobalByteLimit{}
  PartitionItemLimit{}
  PartitionByteLimit{}

type InventoryEntry is Data:
  InventoryEntry{purpose: Purpose, limits: Limits}

def limits_for(purpose: Purpose, limits: Limits) -> Limits:
  match purpose:
    case ObservationDispatch{}:
      limits
    case Preparation{}:
      limits
    case ReviewUnit{}:
      limits
    case StoredResult{}:
      limits
    case OperationalNotice{}:
      limits
    case AdviceRecheck{}:
      limits

def inventory(+limits: Limits) -> List<&2, InventoryEntry>:
  InventoryEntry{ObservationDispatch{}, limits_for(ObservationDispatch{}, limits)} <>
    InventoryEntry{Preparation{}, limits_for(Preparation{}, limits)} <>
    InventoryEntry{ReviewUnit{}, limits_for(ReviewUnit{}, limits)} <>
    InventoryEntry{StoredResult{}, limits_for(StoredResult{}, limits)} <>
    InventoryEntry{OperationalNotice{}, limits_for(OperationalNotice{}, limits)} <>
    InventoryEntry{AdviceRecheck{}, limits_for(AdviceRecheck{}, limits)} <> Nil{}

def initial(limits: Limits) -> Ledger:
  Ledger{limits, 1n, Nil{}}

def total.add(usage: Usage, bytes: Nat) -> Usage:
  match usage:
    case Usage{items, current_bytes}:
      Usage{(items + 1n : Nat), (current_bytes + bytes : Nat)}

def total(charges: List<&2, Charge>) -> Usage:
  match charges:
    case Nil{}:
      Usage{0n, 0n}
    case Charge{_, _, bytes, _} <> rest:
      total.add(total(rest), bytes)

def partition_usage.add(usage: Usage, bytes: Nat, same: Bool) -> Usage:
  match usage:
    case Usage{items, current_bytes}:
      match same:
        case True{}:
          Usage{(items + 1n : Nat), (current_bytes + bytes : Nat)}
        case False{}:
          Usage{items, current_bytes}

def partition_usage(charges: List<&2, Charge>, +partition: Nat) -> Usage:
  match charges:
    case Nil{}:
      Usage{0n, 0n}
    case Charge{_, owner, bytes, _} <> rest:
      partition_usage.add(partition_usage(rest, partition), bytes, Nat.is_eq(owner, partition))

def fit_decision(limits: Limits, global: Usage, local: Usage, +bytes: Nat) -> FitDecision:
  match limits:
    case Limits{global_items, global_bytes, partition_items, partition_bytes}:
      match global:
        case Usage{used_items, used_bytes}:
          match local:
            case Usage{local_items, local_bytes}:
              Bool.pick(FitDecision, Nat.is_gt((used_items + 1n : Nat), global_items),
                GlobalItemLimit{},
                Bool.pick(FitDecision, Nat.is_gt((used_bytes + bytes : Nat), global_bytes),
                  GlobalByteLimit{},
                  Bool.pick(FitDecision, Nat.is_gt((local_items + 1n : Nat), partition_items),
                    PartitionItemLimit{},
                    Bool.pick(FitDecision, Nat.is_gt((local_bytes + bytes : Nat), partition_bytes),
                      PartitionByteLimit{}, Fits{}))))

def decision_fits(decision: FitDecision) -> Bool:
  match decision:
    case Fits{}:
      True{}
    case _:
      False{}

def fits(limits: Limits, global: Usage, local: Usage, bytes: Nat) -> Bool:
  decision_fits(fit_decision(limits, global, local, bytes))

def admission(state: Ledger, +partition: Nat, +bytes: Nat) -> FitDecision:
  match state:
    case Ledger{limits, _, +charges}:
      fit_decision(limits, total(charges), partition_usage(charges, partition), bytes)

def reserve.check(limits: Limits, +next_id: Nat, charges: List<&2, Charge>,
    partition: Nat, bytes: Nat, purpose: Purpose, allowed: Bool) -> LedgerResult:
  match allowed:
    case True{}:
      Granted{Ledger{limits, (next_id + 1n : Nat),
        List.append(&2, Charge, charges, Charge{next_id, partition, bytes, purpose} <> Nil{})}, next_id}
    case False{}:
      Rejected{Ledger{limits, next_id, charges}}

def reserve_for(state: Ledger, +partition: Nat, +bytes: Nat, +purpose: Purpose) -> LedgerResult:
  match state:
    case Ledger{+limits, next_id, +charges}:
      reserve.check(limits, next_id, charges, partition, bytes, purpose,
        fits(limits_for(purpose, limits), total(charges), partition_usage(charges, partition), bytes))

def reserve(state: Ledger, partition: Nat, bytes: Nat) -> LedgerResult:
  reserve_for(state, partition, bytes, ReviewUnit{})

def find.pick(charge: Charge, fallback: Maybe<&2, Charge>, hit: Bool) -> Maybe<&2, Charge>:
  match hit:
    case True{}:
      Some{charge}
    case False{}:
      fallback

def find(+id: Nat, charges: List<&2, Charge>) -> Maybe<&2, Charge>:
  match charges:
    case Nil{}:
      None{}
    case +charge <> rest:
      match charge:
        case Charge{current, _, _, _}:
          find.pick(charge, find(id, rest), Nat.is_eq(current, id))

def remove.pick(charge: Charge, tail: List<&2, Charge>, hit: Bool) -> List<&2, Charge>:
  match hit:
    case True{}:
      tail
    case False{}:
      charge <> tail

def remove(+id: Nat, charges: List<&2, Charge>) -> List<&2, Charge>:
  match charges:
    case Nil{}:
      Nil{}
    case +charge <> rest:
      match charge:
        case Charge{current, _, _, _}:
          remove.pick(charge, remove(id, rest), Nat.is_eq(current, id))

def release.found(state: Ledger, +id: Nat, found: Maybe<&2, Charge>) -> LedgerResult:
  match state:
    case Ledger{limits, next_id, charges}:
      match found:
        case Some{_}:
          Granted{Ledger{limits, next_id, remove(id, charges)}, id}
        case None{}:
          Rejected{Ledger{limits, next_id, charges}}

def release(+state: Ledger, +id: Nat) -> LedgerResult:
  match state:
    case Ledger{_, _, charges}:
      release.found(state, id, find(id, charges))

def replace.pick(charge: Charge, replacement: Charge, tail: List<&2, Charge>, hit: Bool) -> List<&2, Charge>:
  match hit:
    case True{}:
      replacement <> tail
    case False{}:
      charge <> tail

def replace(+id: Nat, +bytes: Nat, charges: List<&2, Charge>) -> List<&2, Charge>:
  match charges:
    case Nil{}:
      Nil{}
    case +charge <> rest:
      match charge:
        case Charge{current, partition, old_bytes, purpose}:
          replace.pick(charge, Charge{current, partition, bytes, purpose},
            replace(id, bytes, rest), Nat.is_eq(current, id))

def replace_for(+id: Nat, +bytes: Nat, +purpose: Purpose,
    charges: List<&2, Charge>) -> List<&2, Charge>:
  match charges:
    case Nil{}:
      Nil{}
    case +charge <> rest:
      match charge:
        case Charge{current, partition, _, _}:
          replace.pick(charge, Charge{current, partition, bytes, purpose},
            replace_for(id, bytes, purpose, rest), Nat.is_eq(current, id))

def resize.check(limits: Limits, next_id: Nat, charges: List<&2, Charge>,
    +id: Nat, partition: Nat, bytes: Nat, allowed: Bool) -> LedgerResult:
  match allowed:
    case True{}:
      Granted{Ledger{limits, next_id, replace(id, bytes, charges)}, id}
    case False{}:
      Rejected{Ledger{limits, next_id, charges}}

def resize_for.check(limits: Limits, next_id: Nat, charges: List<&2, Charge>,
    +id: Nat, partition: Nat, bytes: Nat, purpose: Purpose, allowed: Bool) -> LedgerResult:
  match allowed:
    case True{}:
      Granted{Ledger{limits, next_id, replace_for(id, bytes, purpose, charges)}, id}
    case False{}:
      Rejected{Ledger{limits, next_id, charges}}

def resize_for.found(state: Ledger, +id: Nat, +bytes: Nat, +purpose: Purpose,
    found: Maybe<&2, Charge>) -> LedgerResult:
  match state:
    case Ledger{+limits, next_id, +charges}:
      match found:
        case None{}:
          Rejected{Ledger{limits, next_id, charges}}
        case Some{Charge{_, +partition, _, _}}:
          +others = remove(id, charges)
          resize_for.check(limits, next_id, charges, id, partition, bytes, purpose,
            fits(limits_for(purpose, limits), total(others), partition_usage(others, partition), bytes))

def resize_for(+state: Ledger, +id: Nat, bytes: Nat, purpose: Purpose) -> LedgerResult:
  match state:
    case Ledger{_, _, charges}:
      resize_for.found(state, id, bytes, purpose, find(id, charges))

def resize.found(state: Ledger, +id: Nat, +bytes: Nat, found: Maybe<&2, Charge>) -> LedgerResult:
  match state:
    case Ledger{+limits, next_id, +charges}:
      match found:
        case None{}:
          Rejected{Ledger{limits, next_id, charges}}
        case Some{Charge{_, +partition, _, _}}:
          +others = remove(id, charges)
          resize.check(limits, next_id, charges, id, partition, bytes,
            fits(limits, total(others), partition_usage(others, partition), bytes))

def resize(+state: Ledger, +id: Nat, bytes: Nat) -> LedgerResult:
  match state:
    case Ledger{_, _, charges}:
      resize.found(state, id, bytes, find(id, charges))

def clear(state: Ledger) -> Ledger:
  match state:
    case Ledger{limits, next_id, _}:
      Ledger{limits, next_id, Nil{}}

def main() -> LedgerResult:
  reserve(initial(Limits{4n, 100n, 2n, 60n}), 1n, 20n)
