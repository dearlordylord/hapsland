# Read-only canonical work and dispatch facts; presentation lives in DefenseMotion.
import Base
import ./DefenseModel.bend as M
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ./DefenseProjection.bend as P

def family(work: C.ReviewWorkRecord) -> Nat:
  match work:
    case C.ReviewWorkRecord{_, _, _, id, _, _, +parent}:
      Bool.pick(Nat, Nat.is_eq(parent, 0n), id, parent)
def id(work: C.ReviewWorkRecord) -> Nat:
  match work:
    case C.ReviewWorkRecord{_, _, _, id, _, _, _}: id
def kind(work: C.ReviewWorkRecord) -> U32:
  match work:
    case C.ReviewWorkRecord{_, _, _, _, _, kind, _}: M.phase(kind)
def running(state: Dispatch.State) -> List<&2, Dispatch.ScheduledReviewWork>:
  match state:
    case Dispatch.State{_, items, _, _, _}: items
def requests(state: Dispatch.State) -> List<&2, Dispatch.ReviewServiceRequestRecord>:
  match state:
    case Dispatch.State{_, _, _, _, items}: items
def started(+id: Nat, items: List<&2, Dispatch.ReviewServiceRequestRecord>) -> Bool:
  match items:
    case Nil{}: False{}
    case Dispatch.ReviewServiceRequestRecord{_, _, _, op, _, start, _} <> rest:
      Bool.or(Bool.and(Nat.is_eq(id, op), start), started(id, rest))
def bytes(+world: M.World, work: C.ReviewWorkRecord) -> Nat:
  match work:
    case C.ReviewWorkRecord{_, _, _, _, charge, _, _}: P.charge_bytes(
      charge,
      P.charges(P.ledger(M.core(world)))
    )
def lane(+world: M.World, work: C.ReviewWorkRecord) -> U32:
  Bool.pick(U32, Nat.is_eq(bytes(world, work), 20n), 1, 0)
def find_work(
  +operation: Nat,
  items: List<&2, C.ReviewWorkRecord>
) -> Maybe<&2, C.ReviewWorkRecord>:
  match items:
    case Nil{}: None{}
    case +work <> rest:
      Bool.pick(
        Maybe<&2, C.ReviewWorkRecord>,
        Nat.is_eq(operation, id(work)),
        Some{work},
        find_work(operation, rest)
      )

def id_found(+operation: Nat, items: List<&2, C.ReviewWorkRecord>) -> Nat:
  match items:
    case Nil{}: 0n
    case C.ReviewWorkRecord{_, _, _, +id, _, _, _} <> rest: Bool.pick(
      Nat,
      Nat.is_eq(operation, id),
      id,
      id_found(operation, rest)
    )
