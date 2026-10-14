import Base
import ./Types.bend as T
import ./Loop.bend as Loop
import ./composition/ArtifactProtocol.bend as A
import ./composition/GenericArtifact.bend as Core

# Emission entry: shared Graph types retain their resolver-root ABI names.
def initial(input: T.ResolverInput) -> Loop.Continuation:
  Core.initial(input)

def resume(step: Loop.Continuation, event: T.ResolverEvent) -> Loop.Continuation:
  Core.resume(step, event)

def execute(command: A.ParentAction) -> Loop.Continuation:
  Core.execute(command)

def main() -> Unit:
  Unit{}
