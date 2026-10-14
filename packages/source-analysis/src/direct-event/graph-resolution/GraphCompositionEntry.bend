import Base
import ./Types.bend as T
import ./Loop.bend as Loop
import ./python-module/ArtifactProtocol.bend as P
import ./go-module/ArtifactProtocol.bend as G
import ./composition/ArtifactProtocol.bend as A
import ./composition/ArtifactComposition.bend as Core

# Emission entry; composition transitions and handles retain one implementation.
def initial(input: T.ResolverInput) -> Core.Step:
  Core.initial(input)

def resume(step: Core.Step, event: T.ResolverEvent) -> Core.Step:
  Core.resume(step, event)

def receive_parent(
  step: Core.Step,
  handle: A.StateHandle,
  continuation: Loop.Continuation
) -> Core.Step:
  Core.receive_parent(step, handle, continuation)

def receive_python(step: Core.Step, handle: A.StateHandle, view: P.PythonView) -> Core.Step:
  Core.receive_python(step, handle, view)

def receive_go(step: Core.Step, handle: A.StateHandle, view: G.GoView) -> Core.Step:
  Core.receive_go(step, handle, view)

def view(step: Core.Step) -> T.ResolverStep:
  Core.view(step)

def awaiting_request(step: Core.Step) -> Maybe<&2, T.Request>:
  Core.awaiting_request(step)

def main() -> Unit:
  Unit{}
