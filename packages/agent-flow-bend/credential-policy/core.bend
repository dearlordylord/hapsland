import Base

# Source-free planning: host retains paths, secret values and external effects.
type Source is Data:
  Environment{}
  ProjectLocal{}
  Project{}
  User{}
  Native{}

def files(allowed: Bool, local: Bool, project: Bool) -> List<Source>:
  Bool.pick(List<Source>, allowed,
    List.append(&1, Source, Bool.pick(List<Source>, local, [ProjectLocal{}], []),
      List.append(&1, Source, Bool.pick(List<Source>, project, [Project{}], []), [User{}])), [])

def lookup(explicit: Bool, captured: Bool, root: Bool,
    local: Bool, project: Bool) -> List<Source>:
  Environment{} <> List.append(&1, Source,
    files(Bool.and(Bool.not(captured), root), local, project),
    Bool.pick(List<Source>, explicit, [], [Native{}]))

def save_available(destination: Source, local: Bool) -> Bool:
  match destination:
    case User{}: True{}
    case Native{}: True{}
    case ProjectLocal{}: local
    case _: False{}
