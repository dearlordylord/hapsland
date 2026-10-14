import Base
import ./Types.bend as T
import ./go-module/ArtifactProtocol.bend as G
import ./composition/GoArtifact.bend as Core

# Emission entry; Go artifact policy remains in its composition owner.
def begin(command: G.GoCommand) -> Core.Step:
  Core.begin(command)

def advance(step: Core.Step) -> Core.Step:
  Core.advance(step)

def resume(step: Core.Step, reply: T.Reply) -> Core.Step:
  Core.resume(step, reply)

def view(step: Core.Step) -> G.GoView:
  Core.view(step)

def main() -> Unit:
  Unit{}
