# Read-only architecture explanations derived from the real reducer and host policy.
import Base
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseEffects.bend as E
import ./DefenseOutput.bend as O
import ./DefenseHost.bend as H
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/CollectionState.bend as Collection
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ../../packages/agent-flow-bend/Ledger.bend as Ledger

def same_bool(a: Bool,+b: Bool) -> Bool:
  Bool.pick(Bool,a,b,Bool.not(b))
def leases(state: Collection.State) -> List<&2,Collection.Lease>:
  match state:
    case Collection.State{_,items,_,_,_,_,_}: items
def unleased(ids: List<&2,Nat>,+world: M.World) -> List<&2,Nat>:
  match ids:
    case Nil{}: []
    case +id <> rest:
      +tail = unleased(rest,world)
      Bool.pick(List<&2,Nat>,Collection.lease_exists(id,leases(P.collection(M.core(world)))),tail,id <> tail)
def candidates(+world: M.World) -> List<&2,Nat>:
  unleased(O.ready_ids(M.core(world)),world)
def ids_short(ids: List<&2,Nat>,fuel: Nat) -> String:
  match ids fuel:
    case Nil{} _: "-"
    case _ 0n: "..."
    case id <> Nil{} _: Nat.show(id)
    case id <> rest 1n+n: Nat.show(id) ++ "," ++ ids_short(rest,n)
def candidate_bytes(+world: M.World) -> U32:
  M.number(O.selected_bytes(candidates(world),M.core(world)))
def candidate_count(world: M.World) -> U32:
  M.number(List.length(&2,Nat,candidates(world)))
def candidate_work(world: M.World) -> U32: 0
def batch_reason(+world: M.World) -> String:
  Bool.pick(String,(P.writes(world) > 0 : U32),"OUTPUT ATTEMPT OWNED",Bool.pick(String,(P.ready(world) > 0 : U32),"COLLECTION READY","WAITING FOR SHARED ENGINE"))
def family_ids(items: List<&2,P.Token>,+seen: List<&2,Nat>) -> List<&2,Nat>:
  match items:
    case Nil{}: List.reverse(&2,Nat,seen)
    case +token <> rest:
      +id = U32.to_nat(P.family(token))
      family_ids(rest,Bool.pick(List<&2,Nat>,Collection.contains(id,seen),seen,id <> seen))
def count_family(items: List<&2,P.Token>,+family: Nat,+mode: U32) -> U32:
  match items:
    case Nil{}: 0
    case +token <> rest:
      +phase = P.phase(token)
      +match_phase = Bool.pick(Bool,U32.is_eq(mode,0),(phase < 5 : U32),U32.is_eq(phase,5))
      (Bool.to_u32(Nat.is_eq(U32.to_nat(P.family(token)),family) && match_phase) + count_family(rest,family,mode) : U32)
def family_members(items: List<&2,P.Token>,+family: Nat,+mode: U32) -> List<&2,Nat>:
  match items:
    case Nil{}: []
    case +token <> rest:
      +tail = family_members(rest,family,mode)
      +match_phase = Bool.pick(Bool,U32.is_eq(mode,0),(P.phase(token) < 5 : U32),U32.is_eq(P.phase(token),5))
      Bool.pick(List<&2,Nat>,Nat.is_eq(U32.to_nat(P.family(token)),family) && match_phase,U32.to_nat(P.id(token)) <> tail,tail)
def family_bytes(items: List<&2,C.Work>,+world: M.World,+family: Nat,+seen: List<&2,Nat>) -> Nat:
  match items:
    case Nil{}: 0n
    case +work <> rest:
      match work:
        case C.Work{_,_,_,_,+charge,_,_}:
          +take = Nat.is_eq(E.family(work),family) && Bool.not(Collection.contains(charge,seen))
          (Bool.pick(Nat,take,E.bytes(world,work),0n) + family_bytes(rest,world,family,
            Bool.pick(List<&2,Nat>,take,charge <> seen,seen)) : Nat)
def matching_count(ids: List<&2,Nat>,+members: List<&2,Nat>) -> U32:
  match ids:
    case Nil{}: 0
    case id <> rest: (Bool.to_u32(Collection.contains(id,members)) + matching_count(rest,members) : U32)
def family_ready(+world: M.World,family: Nat) -> U32:
  matching_count(family_members(P.tokens(world),family,1),O.ready_ids(M.core(world)))
def family_committed(+world: M.World,family: Nat) -> U32:
  matching_count(family_members(P.tokens(world),family,1),O.selection_members(world))
def family_blocked(+world: M.World,+family: Nat) -> Bool:
  (count_family(P.tokens(world),family,0) > 0 : U32) && (count_family(P.tokens(world),family,1) > 0 : U32)
def blocked_first(ids: List<&2,Nat>,+world: M.World,+blocked: Bool) -> List<&2,Nat>:
  match ids:
    case Nil{}: []
    case +id <> rest:
      +tail = blocked_first(rest,world,blocked)
      Bool.pick(List<&2,Nat>,same_bool(family_blocked(world,id),blocked),id <> tail,tail)
def target_family_found(found: Maybe<&2,C.Work>) -> Nat:
  match found:
    case None{}: 0n
    case Some{work}: E.family(work)
def target_family(world: M.World,target: Nat) -> Nat:
  target_family_found(E.find_work(target,M.work(M.core(world))))
def without(ids: List<&2,Nat>,+id: Nat) -> List<&2,Nat>:
  match ids:
    case Nil{}: []
    case +item <> rest:
      +tail = without(rest,id)
      Bool.pick(List<&2,Nat>,Nat.is_eq(item,id),tail,item <> tail)
def families_focused(+world: M.World,target: Nat) -> List<&2,Nat>:
  +family = target_family(world,target)
  +ids = family_ids(P.tokens(world),[])
  +prioritized = List.append(&2,Nat,blocked_first(ids,world,True{}),blocked_first(ids,world,False{}))
  Bool.pick(List<&2,Nat>,Nat.is_eq(family,0n),prioritized,family <> without(prioritized,family))
def target_tokens(items: List<&2,P.Token>,+target: Nat,+matching: Bool) -> List<&2,P.Token>:
  match items:
    case Nil{}: []
    case +token <> rest:
      +tail = target_tokens(rest,target,matching)
      Bool.pick(List<&2,P.Token>,same_bool(Nat.is_eq(U32.to_nat(P.id(token)),target),matching),token <> tail,tail)
def tokens_focused(+items: List<&2,P.Token>,+target: Nat) -> List<&2,P.Token>:
  List.append(&2,P.Token,target_tokens(items,target,True{}),target_tokens(items,target,False{}))
def focus_found(world: M.World,fallback: Nat,found: Maybe<&2,M.Tower>) -> Nat:
  match found:
    case None{}: fallback
    case Some{tower}: E.target(world,tower)
def focus(+world: M.World,fallback: Nat) -> Nat:
  focus_found(world,fallback,H.selected_tower(M.towers(world),M.selected(world)))
def final_blocker_found(+world: M.World,target: Nat,power: U32,found: Maybe<&2,C.Work>) -> Bool:
  match found:
    case None{}: False{}
    case Some{+work}:
      U32.is_eq(E.kind(work),4) && E.pending_sibling(E.family(work),M.work(M.core(world))) &&
        U32.is_eq(count_family(P.tokens(world),E.family(work),0),1) && (E.remaining(world,work) <= power : U32)
def final_blocker(+world: M.World,+target: Nat,power: U32) -> Bool:
  final_blocker_found(world,target,power,E.find_work(target,M.work(M.core(world))))
def preparation_used(world: M.World) -> U32:
  M.number(Dispatch.preparation_count(E.running(M.dispatch(M.core(world)))))
def partition_limits_value(ledger: Ledger.Ledger) -> Ledger.Limits:
  match ledger:
    case Ledger.Ledger{limits,_,_}: limits
def partition_limits(world: M.World) -> Ledger.Limits: partition_limits_value(P.ledger(M.core(world)))
def partition_item_limit_value(limits: Ledger.Limits) -> U32:
  match limits:
    case Ledger.Limits{_,_,items,_}: M.number(items)
def partition_byte_limit_value(limits: Ledger.Limits) -> U32:
  match limits:
    case Ledger.Limits{_,_,_,bytes}: M.number(bytes)
def partition_items(world: M.World) -> U32:
  P.usage_items(Ledger.partition_usage(P.charges(P.ledger(M.core(world))),1n))
def partition_bytes(world: M.World) -> U32:
  P.usage_bytes(Ledger.partition_usage(P.charges(P.ledger(M.core(world))),1n))
def focus_kind_found(fallback: U32,found: Maybe<&2,M.Tower>) -> U32:
  match found:
    case None{}: fallback
    case Some{tower}: M.tkind(tower)
def focus_kind(+world: M.World,fallback: U32) -> U32:
  focus_kind_found(fallback,H.selected_tower(M.towers(world),M.selected(world)))
def preparation_limit() -> U32: M.number(Dispatch.max_running())
def request_limit() -> U32: M.number(Dispatch.max_requests())

# Road work owns bytes before a Jev request exists; waiting is a separate state.
def review_count(items: List<&2,C.Work>,+world: M.World,+side: U32,+waiting: Bool) -> U32:
  match items:
    case Nil{}: 0
    case +work <> rest:
      +branch = Bool.not(U32.is_eq(M.layout(world),1)) || U32.is_eq(E.lane(world,work),side)
      (Bool.to_u32(branch && Bool.pick(Bool,waiting,U32.is_eq(E.kind(work),4) && Bool.not(E.started(E.id(work),E.requests(M.dispatch(M.core(world))))),U32.is_eq(E.kind(work),3))) + review_count(rest,world,side,waiting) : U32)
