# Headless game actions reuse the interactive Host. No business reducer lives here.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseConsumer.bend as Consumer
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

type Action is Data:
  Build{x: U32, y: U32, kind: U32}
  Upgrade{index: U32}
type ActionResult is Data:
  Applied{}
  IllegalPlacement{}
  UnknownTower{}
  Unaffordable{}
  MaxLevel{}
  Dead{}
type Receipt is Data:
  Receipt{world: M.World, result: ActionResult, charged: U32}
type GameObservation is Data:
  GameObservation{health: U32, remainingBudget: U32, tick: U32, towerCount: Nat}
def observe(+world: M.World) -> GameObservation:
  GameObservation{M.hp(world),M.gold(world),M.time(world),List.length(&2,M.Tower,M.towers(world))}

def with_budget(world: M.World, budget: U32) -> M.World:
  match world:
    case M.World{core,t,p,l,c,_,h,ts,ms,a,o,r,cl,d,auto,x,y,selected,work,flash}:
      M.World{core,t,p,l,c,budget,h,ts,ms,a,o,r,cl,d,auto,x,y,selected,work,flash}
def initial(state: T.State, budget: U32, layout: U32) -> M.World:
  H.reset_found(M.with_engine(with_budget(H.initial(),budget),state),layout)
def default_config() -> T.Config: Consumer.config()
def create_world(config: T.Config, seed: Nat, budget: U32, layout: U32) -> M.World:
  H.start(initial(Run.create(config,seed),budget,layout))
def engine_observation(world: M.World) -> T.Observation:
  Run.observe(M.engine(world))
def accepted(+before: M.World, +after: M.World) -> Receipt:
  Receipt{after,Applied{},M.sub(M.gold(before),M.gold(after))}
def build_checked(dead: Bool, unknown: Bool, illegal: Bool, poor: Bool, +world: M.World, x: U32, y: U32, kind: U32) -> Receipt:
  match dead unknown illegal poor:
    case True{} _ _ _: Receipt{world,Dead{},0}
    case _ True{} _ _: Receipt{world,UnknownTower{},0}
    case _ _ True{} _: Receipt{world,IllegalPlacement{},0}
    case _ _ _ True{}: Receipt{world,Unaffordable{},0}
    case _ _ _ _: accepted(world,H.build(world,x,y,kind))
def build(+world: M.World, +x: U32, +y: U32, +kind: U32) -> Receipt:
  build_checked(U32.is_eq(M.hp(world),0),(kind >= 7 : U32),Bool.not(H.placement_valid(world,x,y)),
    (M.gold(world) < H.tower_cost(kind) : U32),world,x,y,kind)
def upgrade_checked(full: Bool, poor: Bool, +world: M.World, index: U32) -> Receipt:
  match full poor:
    case True{} _: Receipt{world,MaxLevel{},0}
    case _ True{}: Receipt{world,Unaffordable{},0}
    case _ _: accepted(world,H.upgrade(H.select(world,index)))
def upgrade_found(+world: M.World, index: U32, found: Maybe<&2,M.Tower>) -> Receipt:
  match found:
    case None{}: Receipt{world,UnknownTower{},0}
    case Some{+tower}: upgrade_checked((M.level(tower) >= 3 : U32),
      (M.gold(world) < H.upgrade_cost(M.level(tower)) : U32),world,index)
def apply(+world: M.World, action: Action) -> Receipt:
  match action:
    case Build{x,y,kind}: build(world,x,y,kind)
    case Upgrade{+index}: upgrade_found(world,index,H.selected_tower(M.towers(world),index))
# Fixed experiment investment: preserve Host targeting, firing, damage and frames,
# but discard its delivered-output gold reward rather than inventing an economy.
def tick_result(budget: U32, observed: H.TickObserved) -> H.TickObserved:
  match observed:
    case H.TickObserved{world,frames,physical}: H.TickObserved{with_budget(world,budget),frames,physical}
def tick(+world: M.World) -> H.TickObserved:
  tick_result(M.gold(world),H.tick_observed(world))
def tick_allowed(allowed: Bool,world: M.World) -> H.TickObserved:
  match allowed:
    case True{}: tick(world)
    case False{}: H.TickObserved{world,Nil{},Nil{}}
def tick_bounded(world: M.World, remainingEvents: Nat) -> H.TickObserved:
  tick_allowed(Bool.not(Nat.is_eq(remainingEvents,0n)),world)
