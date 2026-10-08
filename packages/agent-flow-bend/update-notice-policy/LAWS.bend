import Base
import ./core.bend as Core

# Proposed laws for Astra review; no proofs written before approval.
# Hello and absent contracts preserve compatibility; an explicit foreign contract is refused.
def incompatible_spec(operation: Core.Operation, present: Bool, current: Bool) -> Bool:
  match operation present current:
    case Core.Hello{} _ _: False{}
    case _ False{} _: False{}
    case _ True{} True{}: False{}
    case _ True{} False{}: True{}

# Explicit notice flags override defaults, including explicit false.
def automatic_spec(operation: Core.Operation, pi: Bool, ordinary: Bool) -> Bool:
  match operation pi ordinary:
    case Core.Admit{} _ _: True{}
    case Core.AdmitAndCollect{} _ _: True{}
    case Core.EditPolicy{} _ _: True{}
    case Core.PromptMarker{} _ _: True{}
    case Core.RegisterEdit{} True{} _: False{}
    case Core.RegisterEdit{} False{} _: True{}
    case Core.Collect{} _ True{}: True{}
    case Core.Collect{} _ False{}: False{}
    case _ _ _: False{}

def opportunity_spec(
  override: Core.Override,
  operation: Core.Operation,
  pi: Bool,
  ordinary: Bool
) -> Bool:
  match override:
    case Core.Explicit{value}: value
    case Core.Automatic{}: automatic_spec(operation, pi, ordinary)

# After native expiration pruning, neither a live recipient budget nor full capacity grants a notice.
def grant_spec(already: Bool, full: Bool) -> Bool:
  match already full:
    case True{} _: False{}
    case False{} True{}: False{}
    case False{} False{}: True{}

law incompatible_exact:
  for +operation: Core.Operation
  for +present: Bool
  for +current: Bool
  {
    Core.incompatible(operation, present, current)
    == incompatible_spec(operation, present, current)
    : Bool
  }

law opportunity_exact:
  for +override: Core.Override
  for +operation: Core.Operation
  for +pi: Bool
  for +ordinary: Bool
  {
    Core.opportunity(override, operation, pi, ordinary)
    == opportunity_spec(override, operation, pi, ordinary)
    : Bool
  }

law grant_exact:
  for +already: Bool
  for +full: Bool
  { Core.grant(already, full) == grant_spec(already, full) : Bool }
