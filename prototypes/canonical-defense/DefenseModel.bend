import Base
import ./DefenseMotionTypes.bend as V
import ./DefenseAuto.bend as A
import ./DefenseConsumer.bend as Consumer
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch

type Tower is Data:
  Tower{x: U32, y: U32, kind: U32, level: U32}
# Host controls stay boxed, including the shared scheduler, to preserve the native ABI.
# Bounded presentation cues only: never work, targets, or scheduler inputs.
type Cue is Data:
  Cue{kind: U32, operation: Nat, family: Nat, x: U32, y: U32, ttl: U32}
def cue_kind(cue: Cue) -> U32:
  match cue:
    case Cue{value,_,_,_,_,_}: value
def cue_operation(cue: Cue) -> Nat:
  match cue:
    case Cue{_,value,_,_,_,_}: value
def cue_family(cue: Cue) -> Nat:
  match cue:
    case Cue{_,_,value,_,_,_}: value
def cue_x(cue: Cue) -> U32:
  match cue:
    case Cue{_,_,_,value,_,_}: value
def cue_y(cue: Cue) -> U32:
  match cue:
    case Cue{_,_,_,_,value,_}: value
def cue_ttl(cue: Cue) -> U32:
  match cue:
    case Cue{_,_,_,_,_,value}: value
type Settings is Data:
  Settings{jev_delay: Nat,output_delay: Nat,burst: U32}
def settings_from_environment(env: T.Environment) -> Settings:
  match env:
    case T.Environment{jev,_,_,_,_,_,output,_,_,_,_,_,_,_}: Settings{jev,output,1}
def config_settings(config: T.Config) -> Settings:
  match config:
    case T.Config{_,_,env,_}: settings_from_environment(env)
type Control is Data:
  Control{schedule: List<&2,A.State>, pace: U32, cues: List<&2,Cue>, actors: List<&2,V.Actor>, settings: List<&2,Settings>}
def initial_control() -> Control: Control{[A.initial()],30000,[],[],[config_settings(Consumer.config())]}
def control_value(items: List<&2,Control>) -> Control:
  match items:
    case value <> _: value
    case Nil{}: initial_control()
def auto_value(items: List<&2,A.State>) -> A.State:
  match items:
    case value <> _: value
    case Nil{}: A.initial()
def control_schedule(control: Control) -> A.State:
  match control:
    case Control{items,_,_,_,_}: auto_value(items)
def control_with_schedule(control: Control,schedule: A.State) -> Control:
  match control:
    case Control{_,pace,cues,actors,settings}: Control{[schedule],pace,cues,actors,settings}
def control_pace(control: Control) -> U32:
  match control:
    case Control{_,pace,_,_,_}: pace
def control_with_pace(control: Control,pace: U32) -> Control:
  match control:
    case Control{schedule,_,cues,actors,settings}: Control{schedule,pace,cues,actors,settings}

# Box the independent NativeRun state; geometry/combat never rewrite it.
type World is Data:
  World{engine: List<&2,T.State>, clock: U32, paused: Bool, layout: U32, choice: U32,
    gold: U32, hp: U32, towers: List<&2, Tower>,
    active: Bool, offered: U32, rejected: U32, clear: U32, delivered: U32,
    auto: List<&2, Control>, mouseX: U32, mouseY: U32, selected: U32, damageWork: U32, damageFlash: U32}
def number(n: Nat) -> U32:
  U32.from_nat(Nat.min(n, 4294967295n))
def sub(+a: U32, +b: U32) -> U32:
  Bool.pick(U32, (a >= b : U32), (a - b : U32), 0)

def engine_box(world: World) -> List<&2,T.State>:
  match world:
    case World{items,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_}: items
def engine(world: World) -> T.State: Consumer.boxed(engine_box(world))
def canonical(value: T.Observation) -> C.State:
  match value:
    case T.Observation{_,_,core,_,_,_,_}: core
def core_box(items: List<&2,T.State>) -> C.State: canonical(Run.observe(Consumer.boxed(items)))
def core(world: World) -> C.State: core_box(engine_box(world))

def time(world: World) -> U32:
  match world:
    case World{_, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def paused(world: World) -> Bool:
  match world:
    case World{_, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def layout(world: World) -> U32:
  match world:
    case World{_, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def choice(world: World) -> U32:
  match world:
    case World{_, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def gold(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def hp(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _}: v

def towers(world: World) -> List<&2, Tower>:
  match world:
    case World{_, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _}: v

def active(world: World) -> Bool:
  match world:
    case World{_, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _}: v

def offered(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _}: v

def rejected(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _}: v

def clear(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _}: v

def delivered(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _}: v

def schedule_value(items: List<&2, Control>) -> A.State:
  control_schedule(control_value(items))
def control(world: World) -> Control:
  match world:
    case World{_,_,_,_,_,_,_,_,_,_,_,_,_,items,_,_,_,_,_}: control_value(items)
def with_control(world: World,value: Control) -> World:
  match world:
    case World{core,t,p,l,c,g,h,ts,a,o,r,cl,d,_,x,y,selected,damage,flash}:
      World{core,t,p,l,c,g,h,ts,a,o,r,cl,d,[value],x,y,selected,damage,flash}
def auto(world: World) -> Bool:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _}: A.enabled(schedule_value(v))

def mouse_x(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _}: v

def mouse_y(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _}: v

def selected(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _}: v

def tx(tower: Tower) -> U32:
  match tower:
    case Tower{v, _, _, _}: v

def ty(tower: Tower) -> U32:
  match tower:
    case Tower{_, v, _, _}: v

def tkind(tower: Tower) -> U32:
  match tower:
    case Tower{_, _, v, _}: v

def level(tower: Tower) -> U32:
  match tower:
    case Tower{_, _, _, v}: v

# Fixed approach spacing and started-service time are game animation metadata.
def work(core: C.State) -> List<&2, C.Work>:
  match core:
    case C.State{_, _, items, _, _, _, _, _, _}: items
def rounds(core: C.State) -> List<&2, C.Round>:
  match core:
    case C.State{_, items, _, _, _, _, _, _, _}: items
def dispatch(core: C.State) -> Dispatch.State:
  match core:
    case C.State{_, _, _, _, _, _, items, _, _}: items
def with_engine(world: World, next: T.State) -> World:
  match world:
    case World{_,t,p,l,c,g,h,ts,a,o,r,cl,d,auto,x,y,selected,damage,flash}:
      World{[next],t,p,l,c,g,h,ts,a,o,r,cl,d,auto,x,y,selected,damage,flash}
def phase(kind: C.WorkKind) -> U32:
  match kind:
    case C.AwaitingSourceRead{}: 0
    case C.SourceReading{}: 1
    case C.Preparing{}: 2
    case C.Reviewing{}: 3
    case C.AtJev{}: 4
    case C.PendingFinding{_}: 5

def with_towers(world: World, towers: List<&2, Tower>) -> World:
  match world:
    case World{core, t, p, l, c, g, h, _, a, o, r, cl, d, auto, x, y, selected, damage, flash}:
      World{core, t, p, l, c, g, h, towers, a, o, r, cl, d, auto, x, y, selected, damage, flash}

def damage_work(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _}: v

def damage_flash(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v}: v

# Campaign facts are host metadata; round() reads the actual canonical identity.
def schedule(world: World) -> A.State:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _}: schedule_value(v)
def with_schedule(+world: World, schedule: A.State) -> World:
  match world:
    case World{core, t, p, l, c, g, h, ts, a, o, r, cl, d, _, x, y, selected, damage, flash}:
      World{core, t, p, l, c, g, h, ts, a, o, r, cl, d, [control_with_schedule(control(world),schedule)], x, y, selected, damage, flash}
def current_round(items: List<&2, C.Round>) -> Nat:
  match items:
    case C.Round{1n, 1n, id, _, _, _, _, _} <> _: id
    case _ <> rest: current_round(rest)
    case Nil{}: 0n
def round(world: World) -> Nat: current_round(rounds(core(world)))
def arrival_interval(world: World) -> U32:
  U32.max(20,control_pace(control(world)))

def control_cues(control: Control) -> List<&2,Cue>:
  match control:
    case Control{_,_,cues,_,_}: cues
def control_with_cues(control: Control,cues: List<&2,Cue>) -> Control:
  match control:
    case Control{schedule,pace,_,actors,settings}: Control{schedule,pace,cues,actors,settings}
def cues(world: World) -> List<&2,Cue>: control_cues(control(world))
def with_cues(+world: World,cues: List<&2,Cue>) -> World:
  with_control(world,control_with_cues(control(world),cues))

def control_actors(control: Control) -> List<&2,V.Actor>:
  match control:
    case Control{_,_,_,actors,_}: actors
def control_with_actors(control: Control,actors: List<&2,V.Actor>) -> Control:
  match control:
    case Control{schedule,pace,cues,_,settings}: Control{schedule,pace,cues,actors,settings}
def actors(world: World) -> List<&2,V.Actor>: control_actors(control(world))
def with_actors(+world: World,actors: List<&2,V.Actor>) -> World:
  with_control(world,control_with_actors(control(world),actors))

def settings_value(items: List<&2,Settings>) -> Settings:
  match items:
    case value <> _: value
    case _: config_settings(Consumer.config())
def settings_control(control: Control) -> Settings:
  match control:
    case Control{_,_,_,_,settings}: settings_value(settings)
def settings(world: World) -> Settings: settings_control(control(world))
def with_settings(control: Control,settings: Settings) -> Control:
  match control:
    case Control{schedule,pace,cues,actors,_}: Control{schedule,pace,cues,actors,[settings]}
def base_jev(settings: Settings) -> Nat:
  match settings:
    case Settings{jev,_,_}: jev
def base_output(settings: Settings) -> Nat:
  match settings:
    case Settings{_,output,_}: output
def burst_size(settings: Settings) -> U32:
  match settings:
    case Settings{_,_,size}: size
def with_burst(settings: Settings,size: U32) -> Settings:
  match settings:
    case Settings{jev,output,_}: Settings{jev,output,size}
