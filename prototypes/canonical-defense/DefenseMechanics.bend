# Game-owned interventions use public NativeRun controls; profiles affect future issuance only.
import Base
import ./DefenseModel.bend as M
import ./DefenseMap.bend as Map
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def cost(kind: U32) -> U32:
  match kind:
    case 0: 60
    case 1: 55
    case _: 45
def name(kind: U32) -> String:
  match kind:
    case 0: "JEV SERVICE"
    case 1: "DELIVERY RELAY"
    case _: "ACCESS REPAIR"
def detail(kind: U32) -> String:
  match kind:
    case 0: "FUTURE REQUEST DELAY / SAME OUTCOMES"
    case 1: "FUTURE DELIVERY DELAY / SAME LEASE"
    case _: "RESTORE SOURCE AND CREDENTIAL ACCESS"
def range(kind: U32,+level: U32) -> U32: (100 + level * 12 : U32)
def site(kind: U32) -> U32:
  match kind:
    case 0: 4
    case 1: 5
    case _: 1
def tower_range(+tower: M.Tower) -> U32: (M.radius(tower) + M.level(tower) * 12 : U32)
def connected(+world: M.World,+tower: M.Tower) -> Bool:
  +p: Map.Point = Map.Point{M.tx(tower),M.ty(tower)}
  Map.in_range(p,Map.center(M.layout(world),site(M.tkind(tower)),0),tower_range(tower))
def levels(items: List<&2,M.Tower>,+world: M.World,+kind: U32) -> U32:
  match items:
    case Nil{}: 0
    case +tower <> rest:
      (Bool.pick(U32,U32.is_eq(M.tkind(tower),kind) && connected(world,tower),(M.level(tower) * M.power(tower) : U32),0) + levels(rest,world,kind) : U32)
def strength(+world: M.World,kind: U32) -> U32: levels(M.towers(world),world,kind)
def delay(base: Nat,power: U32) -> Nat: (base / (1n + U32.to_nat(power) : Nat) : Nat)
def current_environment(state: T.State) -> T.Environment:
  match state:
    case T.State{_,_,_,_,_,env,_,_,_,_,_}: env
def current_delay(env: T.Environment,kind: U32) -> Nat:
  match env:
    case T.Environment{jev,_,_,_,_,_,output,_,_,_,_,_,_,_}: Bool.pick(Nat,U32.is_eq(kind,0),jev,output)
def applied(result: T.Controlled) -> T.State:
  match result:
    case T.Controlled{state,_}: state
def jev(state: T.State,delay: Nat) -> T.State:
  applied(Run.control(state,T.JevDelay{delay}))
def output(state: T.State,env: List<&2,T.Environment>,delay: Nat) -> T.State:
  match env:
    case T.Environment{_,_,_,_,_,_,_,lease,_,_,_,_,_,T.OutputProfile{outcome,_}} <> _:
      applied(Run.control(state,T.OutputProfileControl{outcome,delay,lease}))
    case Nil{}: state
def access(+state: T.State,env: List<&2,T.Environment>,+enabled: Bool) -> T.State:
  match env:
    case T.Environment{_,_,_,_,_,_,_,_,current,+ready,generation,+readable,_,_} <> _:
      Bool.pick(T.State,enabled && (Bool.not(ready) || Bool.not(readable)),
        applied(Run.control(state,T.EnvironmentControl{current,True{},generation,True{}})),state)
    case Nil{}: state
def profiles(+world: M.World) -> M.World:
  +env: List<&2,T.Environment> = [current_environment(M.engine(world))]
  +settings = M.settings(world)
  +first = jev(M.engine(world),delay(M.base_jev(settings),strength(world,0)))
  +second = output(first,env,delay(M.base_output(settings),strength(world,1)))
  M.with_engine(world,second)
def purchased_connected(items: List<&2,M.Tower>,world: M.World) -> Bool:
  match items:
    case tower <> _: connected(world,tower)
    case _: False{}
def purchased(+world: M.World,kind: U32) -> M.World:
  +next = profiles(world)
  M.with_engine(next,access(M.engine(next),[current_environment(M.engine(next))],U32.is_eq(kind,2) && purchased_connected(M.towers(next),next)))
def max_level(kind: U32) -> U32:
  Bool.pick(U32,U32.is_eq(kind,2),1,3)

def missing_access(env: T.Environment) -> U32:
  match env:
    case T.Environment{_,_,_,_,_,_,_,_,_,ready,_,readable,_,_}:
      (Bool.to_u32(Bool.not(ready)) + Bool.to_u32(Bool.not(readable)) : U32)
