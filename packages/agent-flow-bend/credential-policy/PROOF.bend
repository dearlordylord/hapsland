import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

# Exact characterization unfolds the independent list specification.
def Laws.lookup_exact(explicit, captured, root, local, project):
  {==}

# Every source constructor is pinned independently, including read-only sources.
def Laws.save_exact(destination, local):
  match destination:
    case Core.User{}: {==}
    case Core.Native{}: {==}
    case Core.ProjectLocal{}: {==}
    case Core.Environment{}: {==}
    case Core.Project{}: {==}
