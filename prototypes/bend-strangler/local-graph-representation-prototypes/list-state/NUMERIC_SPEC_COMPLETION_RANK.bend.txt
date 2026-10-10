import Base
import ./core.bend as Core

# Exact selected declaration payload projection used by whole root completion.
def children(declaration: Core.Declaration) -> List<&2, Core.Reference>:
  match declaration:
    case Core.Declaration{_, _, _, _, references}: references
