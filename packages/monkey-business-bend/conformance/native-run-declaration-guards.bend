import Base
import ../NativeRun.bend as Run
import ../NativeRunTypes.bend as T
import ../Engine.bend as Engine
import ../Advicees.bend as Advicees
import ./native-run-scenario.bend as Original

# Raw caller metadata is independent of the workload RNG's U32 representation.
def no_session_config(config: T.Config) -> T.Config:
  match config:
    case T.Config{limits,_,environment,collectors}:
      T.Config{limits,[T.Advicee{1n,4294967313n,None{}}],environment,collectors}

def captured(scope: Maybe<&2,Advicees.Scope>) -> Bool:
  match scope:
    case Some{Advicees.Scope{identity,partition,seed}}:
      Nat.is_eq(identity,1n) && Nat.is_eq(partition,1n) && Nat.is_eq(seed,4294967313n)
    case None{}: False{}

def resident(state: T.State) -> Bool:
  match state:
    case T.State{core,items,_,_,seed,_,_,valid,_,_,_}:
      valid && Nat.is_eq(seed,4294967313n) &&
        Nat.is_eq(List.length(&2,T.Item,items),0n) &&
        captured(Engine.advicee_identity(Run.core_value(core),1n))

def checks() -> Bool:
  resident(Run.create(no_session_config(Original.original_config()),4294967313n))

def main() -> Bool:
  checks()
