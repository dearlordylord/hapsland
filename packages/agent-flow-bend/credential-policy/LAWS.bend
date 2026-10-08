import Base
import ./core.bend as Core

# Approved by delegated Astra review on 2026-10-08 under user authorization.
# Approval covers source-free planning only; host paths, IO and consent remain separate.
# Environment is always first; exact tail pins order, inclusion and exclusion.
law lookup_exact:
  for +explicit: Bool
  for +captured: Bool
  for +root: Bool
  for +local: Bool
  for +project: Bool
  {Core.lookup(explicit, captured, root, local, project) ==
    Core.Environment{} <> List.append(&1, Core.Source,
      Bool.pick(List<Core.Source>, Bool.and(Bool.not(captured), root),
        List.append(&1, Core.Source,
          Bool.pick(List<Core.Source>, local, [Core.ProjectLocal{}], []),
          List.append(&1, Core.Source,
            Bool.pick(List<Core.Source>, project, [Core.Project{}], []), [Core.User{}])), []),
      Bool.pick(List<Core.Source>, explicit, [], [Core.Native{}])) : List<Core.Source>}

# User and native targets exist in the host context; local saving requires a path.
# Environment and project are read-only sources.
def save_spec(destination: Core.Source, local: Bool) -> Bool:
  match destination:
    case Core.User{}: True{}
    case Core.Native{}: True{}
    case Core.ProjectLocal{}: local
    case Core.Environment{}: False{}
    case Core.Project{}: False{}

law save_exact:
  for +destination: Core.Source
  for +local: Bool
  {Core.save_available(destination, local) == save_spec(destination, local) : Bool}
