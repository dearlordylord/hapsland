import Base
import ./Types.bend as T
import ./go-module/ArtifactProtocol.bend as G
import ./composition/GoArtifact.bend as Core
import ./go-module/Package.bend as Package
import ./go-module/Input.bend as Unicode

# Emission entry; Go artifact policy remains in its composition owner.
def begin(command: G.GoCommand) -> Core.Step:
  Core.begin(command)

def advance(step: Core.Step) -> Core.Step:
  Core.advance(step)

def resume(step: Core.Step, reply: T.Reply) -> Core.Step:
  Core.resume(step, reply)

def view(step: Core.Step) -> G.GoView:
  Core.view(step)

# Single-file Source admission reuses the same package policy as Graph.
# The host supplies parser/Unicode facts; no new lifecycle or effect boundary.
def package_facts(
  files: List<&2, T.GoFileSyntax>,
  work: Nat,
  spellings: List<&2, Unicode.Spelling>
) -> Package.PackageResult:
  Package.run(files, work, spellings)

def main() -> Unit:
  Unit{}
