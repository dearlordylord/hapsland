# Synthetic batching policy; every reservation, authorization and retirement uses Canonical.step.
import Base
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseEffects.bend as E
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/CollectionState.bend as Collection
import ../../packages/agent-flow-bend/Handoff.bend as Handoff

def apply(result: C.Step) -> C.State:
  match result:
    case C.Advanced{state, _}: state
    case C.Rejected{state, _}: state

def event(state: C.State, fact: C.CanonicalEvent) -> C.State:
  apply(C.step(state, fact))

def command(commands: List<&2,C.Command>, +kind: U32) -> Bool:
  match commands:
    case Nil{}: False{}
    case C.CollectionFits{} <> rest: U32.is_eq(kind,0) || command(rest,kind)
    case C.FinishReserved{} <> rest: U32.is_eq(kind,1) || command(rest,kind)
    case C.FinishAuthorized{} <> rest: U32.is_eq(kind,2) || command(rest,kind)
    case C.FinishRecorded{C.Acknowledged{}} <> rest: U32.is_eq(kind,3) || command(rest,kind)
    case _ <> rest: command(rest,kind)

def accepted(result: C.Step, kind: U32) -> Bool:
  match result:
    case C.Advanced{_,commands}: command(commands,kind)
    case _: False{}

def output_age(output: M.Output) -> U32:
  match output:
    case M.Output{age,_,_,_,_,_}: age
def attempt(output: M.Output) -> Nat:
  match output:
    case M.Output{_,attempt,_,_,_,_}: attempt
def token(output: M.Output) -> Nat:
  match output:
    case M.Output{_,_,token,_,_,_}: token
def members(output: M.Output) -> List<&2,Nat>:
  match output:
    case M.Output{_,_,_,ids,_,_}: ids
def flush_age(output: M.Output) -> U32:
  match output:
    case M.Output{_,_,_,_,age,_}: age
def span(output: M.Output) -> U32:
  match output:
    case M.Output{_,_,_,_,_,duration}: duration

def batch_target(world: M.World) -> U32:
  E.batch_target(world)

# This is simulated serialization work per item, never a ledger byte reduction.
def item_work(+world: M.World) -> U32:
  +levels = E.levels(M.towers(world),world,5,5)
  Bool.pick(U32,U32.is_eq(levels,0),8,U32.max(2,M.sub(5,levels)))

def selection_members(world: M.World) -> List<&2,Nat>:
  members(M.output(world))
def remaining(+world: M.World) -> U32:
  M.sub(span(M.output(world)),output_age(M.output(world)))
def flush_remaining(world: M.World) -> U32:
  M.sub(40,flush_age(M.output(world)))

def ready_ids(core: C.State) -> List<&2,Nat>:
  match core:
    case C.State{_,_,_,_,_,_,_,Collection.State{ids,_,_,_,_,_,_,_},_}: ids

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

def choose(ids: List<&2,Nat>, +core: C.State, +left: U32, +count: Nat, +bytes: Nat) -> List<&2,Nat>:
  match ids:
    case Nil{}: []
    case +id <> rest:
      +size = bytes_for(id,M.work(core),core)
      +fits = accepted(C.step(core,C.CollectionFitCheck{(count + 1n : Nat),(bytes + size : Nat)}),0)
      +take = (left > 0 : U32) && fits
      List.append(&2,Nat,Bool.pick(List<&2,Nat>,take,[id],[]),
        choose(rest,core,Bool.pick(U32,take,M.sub(left,1),left),
          Bool.pick(Nat,take,(count + 1n : Nat),count),Bool.pick(Nat,take,(bytes + size : Nat),bytes)))

def advice_round(+id: Nat, items: List<&2, C.Work>) -> Nat:
  match items:
    case Nil{}: 0n
    case C.Work{_, _, round, candidate, _, _, _} <> rest:
      Bool.pick(Nat, Nat.is_eq(id, candidate), round, advice_round(id, rest))
def selected_round(+core: C.State, ids: List<&2, Nat>) -> Nat:
  match ids:
    case id <> _: advice_round(id, M.work(core))
    case Nil{}: 0n
def output_round(+core: C.State, output: M.Output) -> Nat:
  selected_round(core,members(output))

def reserve_submissions(ids: List<&2,Nat>, +core: C.State, +owner: Nat) -> C.State:
  match ids:
    case Nil{}: core
    case +id <> rest:
      reserve_submissions(rest,event(event(core,C.CollectionReserveLease{id,owner}),
        C.SubmissionBegin{id,1n,advice_round(id,M.work(core)),owner,Handoff.Stop{},False{},[id],[id]}),owner)

# FinishAuthorize atomically authorizes every staged Stop submission in the core.
def authorize(+core: C.State, +output: M.Output) -> C.State:
  apply(C.step(core,C.FinishAuthorize{1n,output_round(core,output),attempt(output),token(output),members(output)}))

def retire_context(+core: C.State, +id: Nat, items: List<&2,C.Work>) -> C.State:
  match items:
    case Nil{}: core
    case C.Work{part,life,round,candidate,_,_,_} <> rest:
      Bool.pick(C.State,Nat.is_eq(candidate,id),
        event(event(core,C.RetireReview{part,life,round,id}),C.CollectionRetireAdvice{id}),retire_context(core,id,rest))

# Called only after FinishRecorded{Acknowledged}; that command acknowledges the
# entire exact selected Stop bundle atomically. Per-advice terminal replay is forbidden.
def retire_acknowledged(ids: List<&2,Nat>, +core: C.State) -> C.State:
  match ids:
    case Nil{}: core
    case +id <> rest:
      retire_acknowledged(rest,retire_context(core,id,M.work(core)))

def terminal_result(result: C.Step, +output: M.Output, +round: Nat) -> C.State:
  match result:
    case C.Advanced{+core,commands}:
      Bool.pick(C.State,command(commands,3),
        event(retire_acknowledged(members(output),core),
          C.FinishEnd{1n,round,attempt(output),token(output)}),core)
    case C.Rejected{core,_}: core

def terminal(+core: C.State, +output: M.Output) -> C.State:
  terminal_result(C.step(core,C.FinishTerminal{1n,output_round(core,output),attempt(output),token(output),members(output),C.Acknowledged{}}),output,output_round(core,output))

def output_done(ids: List<&2,Nat>, +core: C.State) -> Bool:
  match ids:
    case Nil{}: True{}
    case id <> rest:
      Bool.not(Collection.contains(id,pending_ids(M.work(core)))) && output_done(rest,core)

def update(world: M.World, core: C.State, output: M.Output, increment: U32) -> M.World:
  match world:
    case M.World{_,t,p,l,c,g,h,ts,ms,a,o,r,cl,d,_,auto,x,y,selected,damage,flash}:
      M.World{core,t,p,l,c,g,h,ts,ms,a,o,r,cl,(d + increment : U32),output,auto,x,y,selected,damage,flash}

def advance(+world: M.World, output: M.Output) -> M.World:
  match output:
    case M.Output{+age,+attempt,+owner,+ids,_,+span}:
      +next_age = (age + 1 : U32)
      +out : M.Output = M.Output{next_age,attempt,owner,ids,0,span}
      +core = Bool.pick(C.State,U32.is_eq(next_age,8),authorize(M.core(world),out),M.core(world))
      +before = M.number(List.length(&2,Nat,pending_ids(M.work(core))))
      +core = Bool.pick(C.State,(next_age >= span : U32),terminal(core,out),core)
      +after = M.number(List.length(&2,Nat,pending_ids(M.work(core))))
      +done = (next_age >= span : U32) && output_done(ids,core)
      update(world,core,Bool.pick(M.Output,done,M.Output{0,attempt,owner,[],0,0},out),M.sub(before,after))

def commit_result(+world: M.World, result: C.Step, +out: M.Output) -> M.World:
  match result:
    case C.Advanced{+core,commands}:
      Bool.pick(M.World,command(commands,1),
        update(world,reserve_submissions(members(out),core,token(out)),out,0),M.with_core(world,core))
    case C.Rejected{core,_}: M.with_core(world,core)

def begin(+world: M.World, +ids: List<&2,Nat>) -> M.World:
  +attempt = (attempt(M.output(world)) + 1n : Nat)
  +owner = (1000n + attempt : Nat)
  +duration = (40 + item_work(world) * M.number(List.length(&2,Nat,ids)) : U32)
  commit_result(world,C.step(M.core(world),C.FinishReserve{1n,1n,M.round(world),attempt,owner,ids,False{},False{},True{},True{},False{}}),
    M.Output{0,attempt,owner,ids,0,duration})

def all_ready(ids: List<&2,Nat>, +ready: List<&2,Nat>) -> Bool:
  match ids:
    case Nil{}: True{}
    case id <> rest: Collection.contains(id,ready) && all_ready(rest,ready)

def waiting(+world: M.World) -> M.World:
  +ids = pending_ids(M.work(M.core(world)))
  +ready = ready_ids(M.core(world))
  +allowed = (M.offered(world) >= M.wave_demand() : U32) && settled(M.work(M.core(world))) &&
    (P.deciding(world) > 0 : U32) && all_ready(ids,ready)
  +flush = Bool.pick(U32,allowed && (P.ready(world) > 0 : U32),(flush_age(M.output(world)) + 1 : U32),0)
  +selected = choose(ready,M.core(world),batch_target(world),0n,0n)
  +start = allowed && (M.number(List.length(&2,Nat,selected)) > 0 : U32) &&
    ((M.number(List.length(&2,Nat,selected)) >= batch_target(world) : U32) || (flush >= 40 : U32))
  +out : M.Output = M.Output{0,attempt(M.output(world)),token(M.output(world)),[],flush,0}
  +next = update(world,M.core(world),out,0)
  Bool.pick(M.World,start,begin(next,selected),next)

def tick_active(world: M.World, output: M.Output, active: Bool) -> M.World:
  match active:
    case True{}: advance(world,output)
    case False{}: waiting(world)

def tick(+world: M.World) -> M.World:
  tick_active(world,M.output(world),Nat.is_gt(List.length(&2,Nat,selection_members(world)),0n))
