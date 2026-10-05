# Read-only canonical work and dispatch facts; presentation lives in DefenseMotion.
import Base
import ./DefenseModel.bend as M
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ./DefenseProjection.bend as P

def family(work: C.Work) -> Nat:
  match work:
    case C.Work{_, _, _, id, _, _, +parent}:
      Bool.pick(Nat, Nat.is_eq(parent, 0n), id, parent)
def id(work: C.Work) -> Nat:
  match work:
    case C.Work{_, _, _, id, _, _, _}: id
def kind(work: C.Work) -> U32:
  match work:
    case C.Work{_, _, _, _, _, kind, _}: M.phase(kind)
def running(state: Dispatch.State) -> List<&2, Dispatch.Entry>:
  match state:
    case Dispatch.State{_, items, _, _, _}: items
def requests(state: Dispatch.State) -> List<&2, Dispatch.Request>:
  match state:
    case Dispatch.State{_, _, _, _, items}: items
def started(+id: Nat, items: List<&2, Dispatch.Request>) -> Bool:
  match items:
    case Nil{}: False{}
    case Dispatch.Request{_, _, _, op, _, start, _} <> rest:
      Bool.or(Bool.and(Nat.is_eq(id, op), start), started(id, rest))
def bytes(+world: M.World, work: C.Work) -> Nat:
  match work:
    case C.Work{_, _, _, _, charge, _, _}: P.charge_bytes(charge, P.charges(P.ledger(M.core(world))))
def lane(+world: M.World, work: C.Work) -> U32:
  Bool.pick(U32, Nat.is_eq(bytes(world, work), 20n), 1, 0)
def find_work(+operation: Nat, items: List<&2, C.Work>) -> Maybe<&2, C.Work>:
  match items:
    case Nil{}: None{}
    case +work <> rest:
      Bool.pick(Maybe<&2, C.Work>, Nat.is_eq(operation, id(work)), Some{work}, find_work(operation, rest))

def id_found(+operation: Nat, items: List<&2, C.Work>) -> Nat:
  match items:
    case Nil{}: 0n
    case C.Work{_, _, _, +id, _, _, _} <> rest: Bool.pick(Nat, Nat.is_eq(operation, id), id, id_found(operation, rest))
