# Read-only views of the exact product reducer snapshot.
import Base
import ./DefenseModel.bend as M
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/agent-flow-bend/CollectionState.bend as Collection
import ../../packages/agent-flow-bend/DeliveryState.bend as Delivery

type Token is Data:
  Token{id: U32, parent: U32, partition: U32, phase: U32, bytes: U32}

def ledger(core: C.State) -> Ledger.Ledger:
  match core:
    case C.State{v, _, _, _, _, _, _, _, _}: v

def collection(core: C.State) -> Collection.State:
  match core:
    case C.State{_, _, _, _, _, _, _, v, _}: v

def charge_bytes(+id: Nat, charges: List<&2, Ledger.Charge>) -> Nat:
  match charges:
    case Nil{}: 0n
    case Ledger.Charge{candidate, _, bytes, _} <> rest:
      Bool.pick(Nat, Nat.is_eq(id, candidate), bytes, charge_bytes(id, rest))

def charges(ledger: Ledger.Ledger) -> List<&2, Ledger.Charge>:
  match ledger:
    case Ledger.Ledger{_, _, v}: v

def project(items: List<&2, C.Work>, +ledger: Ledger.Ledger) -> List<&2, Token>:
  match items:
    case Nil{}: Nil{}
    case C.Work{part, _, _, id, charge, kind, parent} <> rest:
      Token{M.number(id), M.number(parent), M.number(part), M.phase(kind),
        M.number(charge_bytes(charge, charges(ledger)))} <> project(rest, ledger)

def tokens(+world: M.World) -> List<&2, Token>:
  project(M.work(M.core(world)), ledger(M.core(world)))

def id(token: Token) -> U32:
  match token:
    case Token{v, _, _, _, _}: v
def parent(token: Token) -> U32:
  match token:
    case Token{_, v, _, _, _}: v
def partition(token: Token) -> U32:
  match token:
    case Token{_, _, v, _, _}: v
def phase(token: Token) -> U32:
  match token:
    case Token{_, _, _, v, _}: v
def bytes(token: Token) -> U32:
  match token:
    case Token{_, _, _, _, v}: v

def count_tokens(items: List<&2, Token>, +phase: U32) -> U32:
  match items:
    case Nil{}: 0
    case Token{_, _, _, p, _} <> rest:
      (Bool.to_u32(U32.is_eq(p, phase)) + count_tokens(rest, phase) : U32)
def count(world: M.World, phase: U32) -> U32:
  count_tokens(tokens(world), phase)

def queued_core(core: C.State) -> U32:
  match core:
    case C.State{_, _, _, _, _, _, Dispatch.State{items, _, _, _, _}, _, _}:
      M.number(List.length(&2, Dispatch.Entry, items))
def queued(world: M.World) -> U32: queued_core(M.core(world))
def running_core(core: C.State) -> U32:
  match core:
    case C.State{_, _, _, _, _, _, Dispatch.State{_, items, _, _, _}, _, _}:
      M.number(List.length(&2, Dispatch.Entry, items))
def running(world: M.World) -> U32: running_core(M.core(world))
def requests_core(core: C.State) -> U32:
  match core:
    case C.State{_, _, _, _, _, _, Dispatch.State{_, _, _, _, items}, _, _}:
      M.number(List.length(&2, Dispatch.Request, items))
def requests(world: M.World) -> U32: requests_core(M.core(world))
def ready_core(core: C.State) -> U32:
  match core:
    case C.State{_, _, _, _, _, _, _, Collection.State{items, _, _, _, _, _, _}, _}:
      M.number(List.length(&2, Nat, items))
def ready(world: M.World) -> U32: ready_core(M.core(world))
def leases_core(core: C.State) -> U32:
  match core:
    case C.State{_, _, _, _, _, _, _, Collection.State{_, items, _, _, _, _, _}, _}:
      M.number(List.length(&2, Collection.Lease, items))
def leases(world: M.World) -> U32: leases_core(M.core(world))
def round_count(items: List<&2, C.Round>, +mode: U32) -> U32:
  match items:
    case Nil{}: 0
    case C.Round{_, _, _, wait, decide, write, uncertain, _} <> rest:
      (Bool.to_u32(Bool.pick(Bool, U32.is_eq(mode, 0), wait,
        Bool.pick(Bool, U32.is_eq(mode, 1), decide, uncertain))) + round_count(rest, mode) : U32)
def waiting(world: M.World) -> U32:
  round_count(M.rounds(M.core(world)), 0)
def deciding(world: M.World) -> U32:
  round_count(M.rounds(M.core(world)), 1)
def uncertain(world: M.World) -> U32:
  round_count(M.rounds(M.core(world)), 2)
def write_count(items: List<&2, C.Round>) -> U32:
  match items:
    case Nil{}: 0
    case C.Round{_, _, _, _, _, Some{_}, _, _} <> rest: (1 + write_count(rest) : U32)
    case _ <> rest: write_count(rest)
def active_slots(items: List<&2, Delivery.Slot>) -> U32:
  match items:
    case Nil{}: 0
    case Delivery.Slot{_, _, _, _, _, Delivery.Reserved{}} <> rest: (1 + active_slots(rest) : U32)
    case Delivery.Slot{_, _, _, _, _, Delivery.Authorized{}} <> rest: (1 + active_slots(rest) : U32)
    case _ <> rest: active_slots(rest)
def writes_core(core: C.State) -> U32:
  match core:
    case C.State{_, _, _, _, _, _, _, Collection.State{_, _, _, Delivery.State{slots, _, _}, _, _, _}, _}: active_slots(slots)
def writes(world: M.World) -> U32: writes_core(M.core(world))
def usage(world: M.World) -> Ledger.Usage:
  Ledger.total(charges(ledger(M.core(world))))
def usage_items(items: Ledger.Usage) -> U32:
  match items:
    case Ledger.Usage{v, _}: M.number(v)
def usage_bytes(items: Ledger.Usage) -> U32:
  match items:
    case Ledger.Usage{_, v}: M.number(v)
def ledger_items(world: M.World) -> U32:
  usage_items(usage(world))
def ledger_bytes(world: M.World) -> U32:
  usage_bytes(usage(world))

def ledger_byte_limit_core(core: C.State) -> U32:
  match core:
    case C.State{Ledger.Ledger{Ledger.Limits{_, v, _, _}, _, _}, _, _, _, _, _, _, _, _}: M.number(v)
def ledger_byte_limit(world: M.World) -> U32: ledger_byte_limit_core(M.core(world))
def ledger_item_limit_core(core: C.State) -> U32:
  match core:
    case C.State{Ledger.Ledger{Ledger.Limits{v, _, _, _}, _, _}, _, _, _, _, _, _, _, _}: M.number(v)
def ledger_item_limit(world: M.World) -> U32: ledger_item_limit_core(M.core(world))
def backend_started_items(items: List<&2, Dispatch.Request>) -> U32:
  match items:
    case Nil{}: 0
    case Dispatch.Request{_, _, _, _, _, started, _} <> rest:
      (Bool.to_u32(started) + backend_started_items(rest) : U32)
def backend_started_core(core: C.State) -> U32:
  match core:
    case C.State{_, _, _, _, _, _, Dispatch.State{_, _, _, _, items}, _, _}: backend_started_items(items)
def backend_started(world: M.World) -> U32: backend_started_core(M.core(world))
def parent_count_tokens(items: List<&2, Token>, +owner: U32) -> U32:
  match items:
    case Nil{}: 0
    case Token{_, parent, _, _, _} <> rest:
      (Bool.to_u32(U32.is_eq(parent, owner)) + parent_count_tokens(rest, owner) : U32)
def parent_children(world: M.World, parent: U32) -> U32:
  parent_count_tokens(tokens(world), parent)
def parent_pending_tokens(items: List<&2, Token>, +owner: U32) -> U32:
  match items:
    case Nil{}: 0
    case Token{_, parent, _, p, _} <> rest:
      (Bool.to_u32(Bool.and(U32.is_eq(parent, owner), U32.is_eq(p, 5))) + parent_pending_tokens(rest, owner) : U32)
def parent_pending(world: M.World, parent: U32) -> U32:
  parent_pending_tokens(tokens(world), parent)

def family(+token: Token) -> U32:
  Bool.pick(U32, U32.is_eq(parent(token), 0), id(token), parent(token))

def pool_limit() -> U32:
  M.number(Dispatch.max_requests())
def preparation_pool_limit() -> U32:
  M.number(Dispatch.max_running())
def prep_running_entries(items: List<&2, Dispatch.Entry>) -> U32:
  M.number(Dispatch.preparation_count(items))
def prep_running_core(core: C.State) -> U32:
  match core:
    case C.State{_, _, _, _, _, _, Dispatch.State{_, entries, _, _, _}, _, _}: prep_running_entries(entries)
def prep_running(world: M.World) -> U32: prep_running_core(M.core(world))

# Actual per-round counters in the product's delivery state, before retirement.
def finish_counters_core(core: C.State) -> List<&2, Delivery.Counter>:
  match core:
    case C.State{_, _, _, _, _, _, _, Collection.State{_, _, _, Delivery.State{_, counters, _}, _, _, _}, _}: counters
def finish_counters(world: M.World) -> List<&2, Delivery.Counter>: finish_counters_core(M.core(world))
def finish_used(+world: M.World) -> U32:
  M.number(Delivery.count(1n, M.round(world), finish_counters(world)))
def counters_within_budget(items: List<&2, Delivery.Counter>) -> Bool:
  match items:
    case Nil{}: True{}
    case Delivery.Counter{_, _, used} <> rest:
      Nat.is_le(used,4n) && counters_within_budget(rest)
def finish_within_budget(world: M.World) -> Bool:
  counters_within_budget(finish_counters(world))
