# Small retained-state witnesses for falsification; these do not narrow universal laws.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseConsumer.bend as Consumer
import ../../packages/monkey-business-bend/Engine.bend as Engine
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/agent-flow-bend/Ledger.bend as Ledger

def environment(config: T.Config) -> T.Environment:
  match config:
    case T.Config{_,_,value,_}: value
def state() -> T.State:
  T.State{[Engine.initial(Ledger.Limits{2n,100n,2n,100n})],[],9n,7n,0n,environment(Consumer.config()),[],True{},[]}
def world() -> M.World:
  M.World{[state()],4,False{},0,0,160,100,[],[],True{},0,0,0,0,[M.initial_control()],0,0,0,0,0}
law retained_damage: {M.engine(H.damage(world())) == state() : T.State}
law retained_pointer: {M.engine(H.move(world(),100,200)) == state() : T.State}
def retained_damage(): {==}
def retained_pointer(): {==}
