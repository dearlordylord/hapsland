import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseConsumer.bend as Consumer
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Numeric.bend as Numeric

# Game-owned original inputs. Controls execute the actual Host, and every tick
# retains its entire private engine state and every actual returned frame.
type Input is Data:
  GameKey{code: U32}
  Ticks{count: Nat}
  JevProfile{delay: Nat, weights: List<&2,Numeric.Words>}
type TickSnapshot is Data:
  TickSnapshot{before: List<&2,T.State>, after: List<&2,T.State>, frames: List<&2,T.Frame>, physical: List<&2,T.PhysicalDelivery>}
type Checkpoint is Data:
  Checkpoint{input: Input, before: List<&2,M.World>, after: List<&2,M.World>, ticks: List<&2,TickSnapshot>}
type Trace is Data:
  Trace{world: List<&2,M.World>, checkpoints: List<&2,Checkpoint>}
type Envelope is Data:
  Envelope{config: T.Config, creation_seed: Nat, campaign_seed: Nat,
    original: List<&2,Input>, trace: Trace}
type TickTrace is Data:
  TickTrace{world: List<&2,M.World>, ticks: List<&2,TickSnapshot>}

def tick_next(before: List<&2,T.State>, observed: H.TickObserved,
    ticks: List<&2,TickSnapshot>, rest: List<&2,M.World> -> List<&2,TickSnapshot> -> TickTrace) -> TickTrace:
  match observed:
    case H.TickObserved{+world,frames,physical}:
      rest([world],TickSnapshot{before,M.engine_box(world),frames,physical} <> ticks)

def tick_box(+worlds: List<&2,M.World>, ticks: List<&2,TickSnapshot>,
    rest: List<&2,M.World> -> List<&2,TickSnapshot> -> TickTrace) -> TickTrace:
  match worlds:
    case +world <> Nil{}: tick_next(M.engine_box(world),H.tick_observed(world),ticks,rest)
    case _: TickTrace{worlds,List.reverse(&2,TickSnapshot,ticks)}

def tick_loop(fuel: Nat, worlds: List<&2,M.World>, ticks: List<&2,TickSnapshot>) -> TickTrace:
  match fuel:
    case 0n: TickTrace{worlds,List.reverse(&2,TickSnapshot,ticks)}
    case 1n+k: tick_box(worlds,ticks,next => history => tick_loop(k,next,history))

def control_world(world: M.World, input: Input) -> TickTrace:
  match input:
    case GameKey{code}: TickTrace{[H.key(world,code)],Nil{}}
    case Ticks{count}: tick_loop(count,[world],Nil{})
    case JevProfile{delay,weights}: TickTrace{[H.action(world,T.JevProfile{delay,weights})],Nil{}}

def checkpoint_done(+before: List<&2,M.World>, input: Input,
    result: TickTrace, checkpoints: List<&2,Checkpoint>) -> Trace:
  match result:
    case TickTrace{+world,ticks}:
      Trace{world,List.append(&2,Checkpoint,checkpoints,[Checkpoint{input,before,world,ticks}])}

def input_worlds(+worlds: List<&2,M.World>, +input: Input,
    checkpoints: List<&2,Checkpoint>) -> Trace:
  match worlds:
    case +world <> Nil{}: checkpoint_done([world],input,control_world(world,input),checkpoints)
    case _: Trace{worlds,checkpoints}

def input_applied(trace: Trace, input: Input) -> Trace:
  match trace:
    case Trace{worlds,checkpoints}: input_worlds(worlds,input,checkpoints)

def inputs_applied(inputs: List<&2,Input>, trace: Trace) -> Trace:
  match inputs:
    case Nil{}: trace
    case head <> tail: inputs_applied(tail,input_applied(trace,head))

def faster_keys(fuel: Nat) -> List<&2,Input>:
  match fuel:
    case 0n: Nil{}
    case 1n+k: GameKey{91} <> faster_keys(k)

def burst_keys(fuel: Nat) -> List<&2,Input>:
  match fuel:
    case 0n: Nil{}
    case 1n+k: GameKey{110} <> burst_keys(k)

def original(+campaign: Nat) -> List<&2,Input>:
  List.append(&2,Input,burst_keys(Nat.add(1n,Nat.mod(campaign,4n))),
    List.append(&2,Input,[Ticks{100n},GameKey{97},Ticks{Nat.add(10n,Nat.mod(campaign,5n))},GameKey{97}],
      List.append(&2,Input,faster_keys(12n),
        [Ticks{10n},JevProfile{3200n,[Numeric.Words{0n,0n},Numeric.Words{1071644672n,0n},
          Numeric.Words{1072693248n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n}]},
         Ticks{480n},GameKey{32},Ticks{4n},GameKey{32},Ticks{200n}])))

def scenario(+campaign: Nat) -> Envelope:
  +inputs = original(campaign)
  Envelope{Consumer.config(),Consumer.seed(),campaign,inputs,
    inputs_applied(inputs,Trace{[H.initial()],Nil{}})}

def all() -> List<&2,Envelope>:
  [scenario(0n),scenario(3n),scenario(17n),scenario(41n)]
