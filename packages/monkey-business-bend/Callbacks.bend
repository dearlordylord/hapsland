import Base
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Dispatch.bend as Dispatch
import ../agent-flow-bend/CollectionState.bend as CollectionState
import ../agent-flow-bend/DeliveryState.bend as DeliveryState
import ../agent-flow-bend/SubmissionState.bend as SubmissionState

type Owner is Data:
  Owner{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}

type Effect is Data:
  JevStarted{request: Nat}
  JevInterrupted{request: Nat}
  JevSettled{request: Nat}
  PreparationCompleted{}
  OutputTerminal{advice: Nat, token: Nat}

type Target is Data:
  Target{owner: Owner, effect: Effect, original_order: Nat}

type Fact is Data:
  Fact{target: Target, at: Nat, action: Driver.Action}

type Status is Data:
  Queued{}
  Held{}
  Dropped{}

type Original is Data:
  Original{fact: Fact, status: Status, scheduled_order: Nat}

type State is Data:
  State{originals: List<&2, Original>}

type Control is Data:
  Hold{}
  Release{}
  Drop{}
  Duplicate{}
  Reorder{}

type Applicability is Data:
  Applied{}
  Missing{}
  NotQueued{}
  NotHeld{}

type Scheduled is Data:
  Scheduled{at: Nat, order: Nat, action: Driver.Action}

type Changed is Data:
  Changed{state: State, result: Applicability, cancel: List<&2, Nat>, schedule: List<&2, Scheduled>}

def owner_equal(a: Owner, b: Owner) -> Bool:
  match a b:
    case Owner{p, l, r, o} Owner{bp, bl, br, bo}:
      Nat.is_eq(p, bp) && Nat.is_eq(l, bl) && Nat.is_eq(r, br) && Nat.is_eq(o, bo)

def effect_equal(a: Effect, b: Effect) -> Bool:
  match a b:
    case JevStarted{r} JevStarted{other}: Nat.is_eq(r, other)
    case JevInterrupted{r} JevInterrupted{other}: Nat.is_eq(r, other)
    case JevSettled{r} JevSettled{other}: Nat.is_eq(r, other)
    case PreparationCompleted{} PreparationCompleted{}: True{}
    case OutputTerminal{a, t} OutputTerminal{b, u}: Nat.is_eq(a, b) && Nat.is_eq(t, u)
    case _ _: False{}

def target_equal(a: Target, b: Target) -> Bool:
  match a b:
    case Target{owner, effect, order} Target{other, other_effect, other_order}:
      owner_equal(owner, other) && effect_equal(effect, other_effect) && Nat.is_eq(order, other_order)

def target_of(original: Original) -> Target:
  match original:
    case Original{Fact{target, _, _}, _, _}: target

def fact_target(owner: Owner, order: Nat, event: Canonical.CanonicalEvent) -> Maybe<&2, Target>:
  match event:
    case Canonical.JevRequestStarted{+p, +l, +r, +o, request}:
      Bool.pick(Maybe<&2, Target>, owner_equal(owner, Owner{p, l, r, o}), Some{Target{Owner{p, l, r, o}, JevStarted{request}, order}}, None{})
    case Canonical.JevRequestInterrupted{+p, +l, +r, +o, request}:
      Bool.pick(Maybe<&2, Target>, owner_equal(owner, Owner{p, l, r, o}), Some{Target{Owner{p, l, r, o}, JevInterrupted{request}, order}}, None{})
    case Canonical.JevRequestSettled{+p, +l, +r, +o, request, _, _}:
      Bool.pick(Maybe<&2, Target>, owner_equal(owner, Owner{p, l, r, o}), Some{Target{Owner{p, l, r, o}, JevSettled{request}, order}}, None{})
    case Canonical.PreparationCompleted{+p, +l, +r, +o, _}:
      Bool.pick(Maybe<&2, Target>, owner_equal(owner, Owner{p, l, r, o}), Some{Target{Owner{p, l, r, o}, PreparationCompleted{}, order}}, None{})
    case Canonical.SubmissionTerminal{advice, token, _}:
      Some{Target{owner, OutputTerminal{advice, token}, order}}
    case _: None{}

def order_of(target: Target) -> Nat:
  match target:
    case Target{_, _, order}: order

def captured(target: Maybe<&2, Target>, originals: List<&2, Original>, at: Nat, action: Driver.Action) -> State:
  match target:
    case None{}: State{originals}
    case Some{+target}: State{Original{Fact{target, at, action}, Queued{}, order_of(target)} <> originals}

# Called once at actual issuance, with the original owner and scheduler order.
# This is provenance capture, never permission to invent a callback.
def event_of(action: Driver.Action) -> Canonical.CanonicalEvent:
  match action:
    case Driver.Action{event, _, _, _, _}: event

def issue(state: State, owner: Owner, order: Nat, at: Nat, +action: Driver.Action) -> State:
  match state:
    case State{originals}:
      captured(fact_target(owner, order, event_of(action)), originals, at, action)

def initial() -> State:
  State{Nil{}}

def update_one(original: Original, control: Control, at: Nat, +fresh_order: Nat) -> Changed:
  match original control:
    case Original{+fact, Queued{}, order} Hold{}:
      Changed{State{[Original{fact, Held{}, order}]}, Applied{}, [order], Nil{}}
    case Original{Fact{target, original_at, +action}, Held{}, _} Release{}:
      Changed{State{[Original{Fact{target, original_at, action}, Queued{}, fresh_order}]}, Applied{}, Nil{}, [Scheduled{at, fresh_order, action}]}
    case Original{fact, Queued{}, +order} Drop{}:
      Changed{State{[Original{fact, Dropped{}, order}]}, Applied{}, [order], Nil{}}
    case Original{Fact{target, original_at, +action}, status, order} Duplicate{}:
      Changed{State{[Original{Fact{target, original_at, action}, status, order}]}, Applied{}, Nil{}, [Scheduled{at, fresh_order, action}]}
    case Original{Fact{target, original_at, +action}, Queued{}, order} Reorder{}:
      Changed{State{[Original{Fact{target, original_at, action}, Queued{}, fresh_order}]}, Applied{}, [order], [Scheduled{at, fresh_order, action}]}
    case +original Release{}: Changed{State{[original]}, NotHeld{}, Nil{}, Nil{}}
    case +original _: Changed{State{[original]}, NotQueued{}, Nil{}, Nil{}}

def prepend(head: Original, changed: Changed) -> Changed:
  match changed:
    case Changed{State{tail}, result, cancel, schedule}:
      Changed{State{head <> tail}, result, cancel, schedule}

def append_tail(changed: Changed, tail: List<&2, Original>) -> Changed:
  match changed:
    case Changed{State{head}, result, cancel, schedule}:
      Changed{State{List.append(&2, Original, head, tail)}, result, cancel, schedule}

def selected(found: Bool, +head: Original, +tail: List<&2, Original>, control: Control, at: Nat, order: Nat, rest: Changed) -> Changed:
  match found:
    case True{}: append_tail(update_one(head, control, at, order), tail)
    case False{}: prepend(head, rest)

def apply_list(originals: List<&2, Original>, +target: Target, +control: Control, +at: Nat, +order: Nat) -> Changed:
  match originals:
    case Nil{}: Changed{State{Nil{}}, Missing{}, Nil{}, Nil{}}
    case +head <> +tail:
      selected(target_equal(target_of(head), target), head, tail, control, at, order, apply_list(tail, target, control, at, order))

def apply(state: State, target: Target, control: Control, at: Nat, order: Nat) -> Changed:
  match state:
    case State{originals}: apply_list(originals, target, control, at, order)

# Delivered provenance moves into the already-retained immutable observation.
# The caller carries this exact captured receipt, not a newly assembled event.
def delivery_keep(delivered: Bool, original: Original, tail: List<&2, Original>) -> List<&2, Original>:
  match delivered:
    case True{}: tail
    case False{}: original <> tail

def delivery_order(original: Original) -> Nat:
  match original:
    case Original{_, _, order}: order

def delivered_list(originals: List<&2, Original>, +order: Nat) -> List<&2, Original>:
  match originals:
    case Nil{}: Nil{}
    case +head <> tail:
      delivery_keep(Nat.is_eq(delivery_order(head), order), head, delivered_list(tail, order))

def delivered(state: State, order: Nat) -> State:
  match state:
    case State{originals}: State{delivered_list(originals, order)}

def receipt_schedule(matches: Bool, state: State, fact: Fact, at: Nat, order: Nat) -> Changed:
  match matches fact:
    case True{} Fact{_, _, action}:
      Changed{state, Applied{}, Nil{}, [Scheduled{at, order, action}]}
    case False{} _:
      Changed{state, Missing{}, Nil{}, Nil{}}

def receipt_duplicate(state: State, target: Target, receipt: Fact, at: Nat, order: Nat) -> Changed:
  match receipt:
    case Fact{+recorded, original_at, action}:
      receipt_schedule(target_equal(target, recorded), state, Fact{recorded, original_at, action}, at, order)

def receipt_control(state: State, target: Target, control: Control, receipt: Maybe<&2, Fact>, at: Nat, order: Nat) -> Changed:
  match control receipt:
    case Duplicate{} Some{fact}: receipt_duplicate(state, target, fact, at, order)
    case _ _: Changed{state, Missing{}, Nil{}, Nil{}}

def receipt_if_missing(changed: Changed, target: Target, control: Control, receipt: Maybe<&2, Fact>, at: Nat, order: Nat) -> Changed:
  match changed:
    case Changed{state, Missing{}, _, _}: receipt_control(state, target, control, receipt, at, order)
    case _: changed

# Receipt must come from the private captured fact carried by retained history.
# Host syntax decoding alone cannot establish that provenance.
def apply_receipt(+state: State, +target: Target, +control: Control, receipt: Maybe<&2, Fact>, +at: Nat, +order: Nat) -> Changed:
  receipt_if_missing(apply(state, target, control, at, order), target, control, receipt, at, order)

# Ownership queries reuse production identities; they decide receipt retention,
# never eligibility, capacity release, callback outcome or lifecycle acceptance.
def work_owned(found: Maybe<&2, Canonical.Work>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def request_owned(found: Maybe<&2, Dispatch.Request>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def output_batch_owned(batch: Maybe<&2, SubmissionState.Batch>, owner: Owner) -> Bool:
  match batch owner:
    case Some{SubmissionState.Batch{_, group, round, _, _, _, _, _}} Owner{p, _, r, _}:
      Nat.is_eq(group, p) && Nat.is_eq(round, r)
    case None{} _: False{}

def output_batches(collection: CollectionState.State) -> List<&2, SubmissionState.Batch>:
  match collection:
    case CollectionState.State{_, _, _, DeliveryState.State{_, _, SubmissionState.State{_, batches}}, _, _, _}: batches

def output_owned(+collection: CollectionState.State, +owner: Owner, +advice: Nat, +token: Nat) -> Bool:
  CollectionState.owns_lease(collection, advice, token) || output_batch_owned(SubmissionState.find_batch(advice, token, output_batches(collection)), owner)

def physical_owned(effect: Effect, owner: Owner, dispatch: Dispatch.State, collection: CollectionState.State) -> Bool:
  match effect owner dispatch:
    case JevStarted{request} Owner{p, l, r, o} Dispatch.State{_, _, _, _, requests}:
      request_owned(Dispatch.request_phase(requests, p, l, r, o, request))
    case JevInterrupted{request} Owner{p, l, r, o} Dispatch.State{_, _, _, _, requests}:
      request_owned(Dispatch.request_phase(requests, p, l, r, o, request))
    case JevSettled{request} Owner{p, l, r, o} Dispatch.State{_, _, _, _, requests}:
      request_owned(Dispatch.request_phase(requests, p, l, r, o, request))
    case PreparationCompleted{} Owner{+p, +l, +r, +o} Dispatch.State{queued, running, _, _, _}:
      Dispatch.contains(queued, p, l, r, o) || Dispatch.contains(running, p, l, r, o)
    case OutputTerminal{advice, token} owner _: output_owned(collection, owner, advice, token)

def authoritative_owner(canonical: Canonical.State, target: Target) -> Bool:
  match canonical target:
    case Canonical.State{_, _, work, _, _, _, dispatch, collection, _} Target{Owner{+p, +l, +r, +o}, effect, _}:
      work_owned(Canonical.find_work(p, l, r, o, work)) || physical_owned(effect, Owner{p, l, r, o}, dispatch, collection)

def retained_original(original: Original, +canonical: Canonical.State, rest: List<&2, Original>) -> List<&2, Original>:
  match original:
    case Original{Fact{+target, at, action}, Dropped{}, order}:
      delivery_keep(Bool.not(authoritative_owner(canonical, target)), Original{Fact{target, at, action}, Dropped{}, order}, rest)
    case _: original <> rest

def retained_list(originals: List<&2, Original>, +canonical: Canonical.State) -> List<&2, Original>:
  match originals:
    case Nil{}: Nil{}
    case head <> tail: retained_original(head, canonical, retained_list(tail, canonical))

# Ended authoritative work cannot accumulate dropped provenance. Physical
# queued/held callbacks survive independently of current scope or history.
def retain(state: State, canonical: Canonical.State) -> State:
  match state:
    case State{originals}: State{retained_list(originals, canonical)}

# Candidate law proposals for owner review. These quantify over all captured
# facts; they do not assert host provenance for an arbitrary constructed fact.
# Holding cancels only its current scheduled delivery and publishes no callback.
law hold_publishes_no_callback:
  for +target: Target
  for +original_at: Nat
  for +action: Driver.Action
  for +order: Nat
  for at: Nat
  for fresh: Nat
  {update_one(Original{Fact{target, original_at, action}, Queued{}, order}, Hold{}, at, fresh) ==
    Changed{State{[Original{Fact{target, original_at, action}, Held{}, order}]}, Applied{}, [order], Nil{}} : Changed}

def hold_publishes_no_callback(target, original_at, action, order, at, fresh):
  {==}

# Repetition retains the original event and identity, not a fresh owner's tuple.
law duplicate_keeps_original_fact:
  for +target: Target
  for +original_at: Nat
  for +action: Driver.Action
  for +status: Status
  for +order: Nat
  for at: Nat
  for fresh: Nat
  {update_one(Original{Fact{target, original_at, action}, status, order}, Duplicate{}, at, fresh) ==
    Changed{State{[Original{Fact{target, original_at, action}, status, order}]}, Applied{}, Nil{}, [Scheduled{at, fresh, action}]} : Changed}

def duplicate_keeps_original_fact(target, original_at, action, status, order, at, fresh):
  match status:
    case Queued{}: {==}
    case Held{}: {==}
    case Dropped{}: {==}

# Dropping a callback does not pretend that Canonical settled physical work.
law drop_only_cancels_delivery:
  for +target: Target
  for +original_at: Nat
  for +action: Driver.Action
  for +order: Nat
  for at: Nat
  for fresh: Nat
  {update_one(Original{Fact{target, original_at, action}, Queued{}, order}, Drop{}, at, fresh) ==
    Changed{State{[Original{Fact{target, original_at, action}, Dropped{}, order}]}, Applied{}, [order], Nil{}} : Changed}

def drop_only_cancels_delivery(target, original_at, action, order, at, fresh):
  {==}

# A targeted environment intervention replaces actual queued deliveries. Copies
# share an original receipt but do not share its current scheduling membership.
# Only the original's actual queued order can change its status, once per fact.
def replaced_order(orders: List<&2,Nat>, +order: Nat) -> Bool:
  match orders:
    case Nil{}: False{}
    case head <> tail: Nat.is_eq(head,order) || replaced_order(tail,order)

def replaced_queued(hit: Bool, fact: Fact, order: Nat) -> Original:
  match hit:
    case True{}: Original{fact,Dropped{},order}
    case False{}: Original{fact,Queued{},order}

def replaced_original(original: Original, orders: List<&2,Nat>) -> Original:
  match original:
    case Original{fact,Queued{},+order}: replaced_queued(replaced_order(orders,order),fact,order)
    case _: original

def replaced_list(originals: List<&2,Original>, +orders: List<&2,Nat>) -> List<&2,Original>:
  match originals:
    case Nil{}: Nil{}
    case head <> tail: replaced_original(head,orders) <> replaced_list(tail,orders)

def replaced(state: State, orders: List<&2,Nat>) -> State:
  match state:
    case State{originals}: State{replaced_list(originals,orders)}
