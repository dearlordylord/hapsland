import Base
import ./RuntimeModel.bend as R

# Proof-only lifecycle predicates over the existing State. No production
# representation changes or provider ownership assumptions are introduced.
def valid_phase(registry: R.Registry, execution: R.Execution,
    provider: Maybe<&2, R.RuntimeProvider>) -> Bool:
  match registry execution provider:
    case R.RuntimeOpen{} R.RuntimeReady{_} None{}: True{}
    case R.RuntimeOpen{} R.RuntimeWaiting{_} Some{_}: True{}
    case R.RuntimeClosed{} R.RuntimeReturned{_, _} None{}: True{}
    case R.RuntimeClosed{} R.RuntimeCancelled{_} _: True{}
    case _ _ _: False{}

def valid(-World: Data, state: R.State<World>) -> Bool:
  match state:
    case R.State{_, registry, execution, provider, _, _, _}:
      valid_phase(registry, execution, provider)

def frozen_phase(registry: R.Registry, execution: R.Execution,
    provider: Maybe<&2, R.RuntimeProvider>) -> Bool:
  match registry execution provider:
    case R.RuntimeClosed{} R.RuntimeReturned{_, _} None{}: True{}
    case R.RuntimeClosed{} R.RuntimeCancelled{_} _: True{}
    case _ _ _: False{}

def frozen(-World: Data, state: R.State<World>) -> Bool:
  match state:
    case R.State{_, registry, execution, provider, _, _, _}:
      frozen_phase(registry, execution, provider)

def invocation(-World: Data, state: R.State<World>) -> Nat:
  match state:
    case R.State{invocation, _, _, _, _, _, _}: invocation

def main() -> Unit:
  Unit{}
