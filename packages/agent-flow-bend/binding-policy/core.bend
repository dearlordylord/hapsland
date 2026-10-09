import Base

# A plan denotes an ordered action sequence; the host executes each stage lazily.
type BindingPlan is Data:
  NoAction{}
  Mark{}
  Bind{}
  MarkMark{}
  MarkBind{}

def unsupported_assignment(identifier: Bool, bound: Bool, pattern: Bool) -> Bool:
  match identifier bound pattern:
    case _ _ True{}: True{}
    case True{} True{} _: True{}
    case _ _ _: False{}

def binding_actions(
  uncertain: Bool,
  mutation: Bool,
  unsupported: Bool,
  binding: Bool,
  identifier: Bool
) -> BindingPlan:
  match uncertain mutation unsupported binding identifier:
    case True{} _ _ _ _: Mark{}
    case False{} True{} True{} True{} True{}: MarkBind{}
    case False{} True{} True{} True{} False{}: MarkMark{}
    case False{} True{} True{} False{} _: Mark{}
    case False{} _ _ True{} True{}: Bind{}
    case False{} _ _ True{} False{}: Mark{}
    case _ _ _ _ _: NoAction{}

def initial_arguments(lexical: Bool) -> Bool:
  match lexical:
    case True{}: False{}
    case False{}: True{}
