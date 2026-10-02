# Stop facts and native completion acknowledgements go through the imported reducer.
# Host clocks model observed deadline/settlement facts, never an alternate Stop policy.
import Base
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseEffects.bend as E
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as D
import ../../packages/agent-flow-bend/CollectionState.bend as Collection

def apply(result: C.Step) -> C.State:
  match result:
    case C.Advanced{state,_}: state
    case C.Rejected{state,_}: state
def event(state: C.State,fact: C.CanonicalEvent) -> C.State:
  apply(C.step(state,fact))
def cancellations(commands: List<&2,C.Command>) -> List<&2,Nat>:
  match commands:
    case Nil{}: []
    case C.CancelWork{id} <> rest: id <> cancellations(rest)
    case _ <> rest: cancellations(rest)
def has_wait(commands: List<&2,C.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case C.WaitForWork{} <> _: True{}
    case C.WaitForOutput{} <> _: True{}
    case _ <> rest: has_wait(rest)
def deadline(+world: M.World) -> Bool:
  (M.stop_at(world) > 0 : U32) && (M.time(world) >= M.stop_at(world) + M.stop_budget(world) : U32)
def interrupt(items: List<&2,D.Request>,+state: C.State,+cuts: List<&2,Nat>) -> C.State:
  match items:
    case Nil{}: state
    case D.Request{part,life,round,+id,request,_,_} <> rest:
      interrupt(rest,Bool.pick(C.State,Collection.contains(id,cuts),
        event(state,C.JevRequestInterrupted{part,life,round,id,request}),state),cuts)
def mark_cancelled(+state: C.State,+cuts: List<&2,Nat>) -> C.State:
  interrupt(E.requests(M.dispatch(state)),event(state,C.DiscardDispatch{cuts}),cuts)
def observed(+world: M.World,result: C.Step) -> M.World:
  match result:
    case C.Rejected{_,_}: world
    case C.Advanced{+core,+commands}:
      +cuts = cancellations(commands)
      +waiting = has_wait(commands)
      +next = M.with_core(world,mark_cancelled(core,cuts))
      M.with_control(next,M.control_stop(M.control(world),U32.max(1,M.stop_at(world)),
        Bool.pick(U32,waiting,1,Bool.pick(U32,List.is_empty(&2,Nat,cuts),2,3)),cuts,
        Bool.pick(U32,List.is_empty(&2,Nat,cuts),0,10)))
def poll_started(+world: M.World,ready: Bool) -> M.World:
  match ready:
    case False{}: world
    case True{}:
      +begun = M.with_control(world,M.control_stop(M.control(world),
        U32.max(1,Bool.pick(U32,U32.is_eq(M.stop_at(world),0),M.time(world),M.stop_at(world))),1,[],0))
      observed(begun,C.step(M.core(begun),C.StopGroupPolled{1n,1n,M.round(begun),
        [C.StopScope{1n,M.round(begun)}],deadline(begun),False{},0n}))
def poll(+world: M.World) -> M.World:
  poll_started(world,M.active(world) && (M.offered(world) >= M.wave_demand() : U32) &&
    (M.stop_state(world) < 2 : U32) && U32.is_eq(P.deciding(world),0))
def settle_requests(items: List<&2,D.Request>,+state: C.State,+cuts: List<&2,Nat>) -> C.State:
  match items:
    case Nil{}: state
    case D.Request{part,life,round,+id,request,_,_} <> rest:
      settle_requests(rest,Bool.pick(C.State,Collection.contains(id,cuts),
        event(state,C.JevRequestSettled{part,life,round,id,request,C.RequestInterrupted{},False{}}),state),cuts)
def settle_running(items: List<&2,D.Entry>,+state: C.State,+cuts: List<&2,Nat>) -> C.State:
  match items:
    case Nil{}: state
    case D.Entry{part,life,round,+id,_,_,_} <> rest:
      settle_running(rest,Bool.pick(C.State,Collection.contains(id,cuts),
        event(state,C.DispatchSettled{part,life,round,id}),state),cuts)
def settle(+world: M.World) -> M.World:
  +core = settle_requests(E.requests(M.dispatch(M.core(world))),M.core(world),M.cancelled(world))
  +core = settle_running(E.running(M.dispatch(core)),core,M.cancelled(world))
  M.with_control(M.with_core(world,core),M.control_stop(M.control(world),M.stop_at(world),M.stop_state(world),M.cancelled(world),0))
def cleanup_left(+world: M.World,left: U32) -> M.World:
  match left:
    case 0: world
    case 1: settle(world)
    case _: M.with_control(world,M.control_stop(M.control(world),M.stop_at(world),M.stop_state(world),M.cancelled(world),M.sub(left,1)))
def tick(+world: M.World) -> M.World:
  poll(cleanup_left(world,M.cleanup_left(world)))
def remaining(+world: M.World) -> U32:
  Bool.pick(U32,U32.is_eq(M.stop_at(world),0),M.stop_budget(world),
    M.sub((M.stop_at(world) + M.stop_budget(world) : U32),M.time(world)))
def phase_name_value(status: U32) -> String:
  match status:
    case 0: "ADMISSION OPEN"
    case 1: "STOP / WAITING FOR WORK"
    case 2: "STOP READY / OUTPUT DRAIN"
    case 3: "INCOMPLETE AT DEADLINE / RETAINED FINDINGS SURVIVE"
    case _: "INCOMPLETE / FINISH BUDGET EXHAUSTED"

def phase_name(world: M.World) -> String: phase_name_value(M.stop_state(world))
