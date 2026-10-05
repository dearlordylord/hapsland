# Read-only presentation of collection/output facts; NativeRun owns delivery.
import Base
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseEffects.bend as E
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/CollectionState.bend as Collection

def lease_ids(items: List<&2,Collection.Lease>) -> List<&2,Nat>:
  match items:
    case Nil{}: []
    case Collection.Lease{advice,_} <> rest: advice <> lease_ids(rest)
def core_leases(core: C.State) -> List<&2,Collection.Lease>:
  match core:
    case C.State{_,_,_,_,_,_,_,Collection.State{_,leases,_,_,_,_,_},_}: leases
def selection_members(world: M.World) -> List<&2,Nat>:
  lease_ids(core_leases(M.core(world)))
def ready_ids(core: C.State) -> List<&2,Nat>:
  match core:
    case C.State{_,_,_,_,_,_,_,Collection.State{ids,_,_,_,_,_,_},_}: ids

def pending_ids(items: List<&2,C.Work>) -> List<&2,Nat>:
  match items:
    case Nil{}: []
    case C.Work{_,_,_,id,_,C.PendingFinding{_},_} <> rest: id <> pending_ids(rest)
    case _ <> rest: pending_ids(rest)

def settled(items: List<&2,C.Work>) -> Bool:
  match items:
    case Nil{}: True{}
    case C.Work{_,_,_,_,_,C.PendingFinding{_},_} <> rest: settled(rest)
    case _: False{}

def bytes_for(+id: Nat, items: List<&2,C.Work>, +core: C.State) -> Nat:
  match items:
    case Nil{}: 0n
    case C.Work{_,_,_,candidate,charge,_,_} <> rest:
      Bool.pick(Nat,Nat.is_eq(id,candidate),P.charge_bytes(charge,P.charges(P.ledger(core))),bytes_for(id,rest,core))

def selected_bytes(ids: List<&2,Nat>, +core: C.State) -> Nat:
  match ids:
    case Nil{}: 0n
    case id <> rest: (bytes_for(id,M.work(core),core) + selected_bytes(rest,core) : Nat)
def selection_bytes(+world: M.World) -> U32:
  M.number(selected_bytes(selection_members(world),M.core(world)))

def all_ready(ids: List<&2,Nat>, +ready: List<&2,Nat>) -> Bool:
  match ids:
    case Nil{}: True{}
    case id <> rest: Collection.contains(id,ready) && all_ready(rest,ready)
