import Base
import ./Types.bend as T
import ./python-module/ArtifactProtocol.bend as P
import ./composition/PythonArtifact.bend as Core

# Emission entry; Python artifact policy remains in its composition owner.
def begin(command: P.PythonCommand) -> Core.Step:
  Core.begin(command)

def resume(step: Core.Step, reply: T.Reply) -> Core.Step:
  Core.resume(step, reply)

def view(step: Core.Step) -> P.PythonView:
  Core.view(step)

def main() -> Unit:
  Unit{}
