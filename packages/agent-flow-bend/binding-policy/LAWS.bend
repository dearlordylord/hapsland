import Base
import ./core.bend as Core

# Proposed exact conditional laws; no native scope or AST correctness claim.
def assignment_spec(identifier: Bool, bound: Bool, pattern: Bool) -> Bool:
  match identifier bound:
    case True{} True{}: True{}
    case _ _: pattern

def binding_tail(binding: Bool, identifier: Bool) -> Core.BindingPlan:
  match binding identifier:
    case False{} _: Core.NoAction{}
    case True{} True{}: Core.Bind{}
    case True{} False{}: Core.Mark{}

def mutation_tail(binding: Bool, identifier: Bool) -> Core.BindingPlan:
  match binding identifier:
    case False{} _: Core.Mark{}
    case True{} True{}: Core.MarkBind{}
    case True{} False{}: Core.MarkMark{}

def ordinary_spec(
  mutation: Bool,
  unsupported: Bool,
  binding: Bool,
  identifier: Bool
) -> Core.BindingPlan:
  match mutation unsupported:
    case True{} True{}: mutation_tail(binding, identifier)
    case _ _: binding_tail(binding, identifier)

def actions_spec(
  uncertain: Bool,
  mutation: Bool,
  unsupported: Bool,
  binding: Bool,
  identifier: Bool
) -> Core.BindingPlan:
  match uncertain:
    case True{}: Core.Mark{}
    case False{}: ordinary_spec(mutation, unsupported, binding, identifier)

def arguments_spec(lexical: Bool) -> Bool:
  Bool.not(lexical)

# Mutating a known callable or an uncertain pattern requires uncertain evidence.
law unsupported_assignment_exact:
  for +identifier: Bool
  for +bound: Bool
  for +pattern: Bool
  {
    Core.unsupported_assignment(identifier, bound, pattern)
    == assignment_spec(identifier, bound, pattern)
    : Bool
  }

# Preserve early return and ordered actions, including repeated marks.
law binding_actions_exact:
  for +uncertain: Bool
  for +mutation: Bool
  for +unsupported: Bool
  for +binding: Bool
  for +identifier: Bool
  {
    Core.binding_actions(uncertain, mutation, unsupported, binding, identifier)
    == actions_spec(uncertain, mutation, unsupported, binding, identifier)
    : Core.BindingPlan
  }

# This is initial membership only; later bindings may add arguments.
law initial_arguments_exact:
  for +lexical: Bool
  { Core.initial_arguments(lexical) == arguments_spec(lexical) : Bool }
