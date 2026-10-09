import Base
import ./core.bend as Core

# Conditional exact laws; Astra approval and native obligations are recorded in reference-draft.json.
def call_target(identifier: Bool, uncertain: Bool, local: Bool) -> Core.ReferencePlan:
  match identifier uncertain local:
    case False{} _ _: Core.Unsupported{}
    case _ True{} _: Core.Unsupported{}
    case _ _ True{}: Core.Unsupported{}
    case _ _ _: Core.NamedFunction{}

def call_spec(
  call: Bool,
  callee: Bool,
  identifier: Bool,
  uncertain: Bool,
  local: Bool
) -> Core.ReferencePlan:
  match call callee:
    case True{} True{}: call_target(identifier, uncertain, local)
    case _ _: Core.Ignore{}

def ignore_spec(self: Bool, parent: Bool, declaration: Bool, first: Bool) -> Bool:
  match self parent declaration first:
    case False{} True{} False{} _: False{}
    case False{} True{} _ False{}: False{}
    case _ _ _ _: True{}

def value_target(known: Bool, uncertain: Bool) -> Core.ReferencePlan:
  match known uncertain:
    case False{} _: Core.Unsupported{}
    case _ True{}: Core.Unsupported{}
    case _ _: Core.NamedFunction{}

def value_spec(local: Bool, known: Bool, uncertain: Bool) -> Core.ReferencePlan:
  match local:
    case True{}: Core.Ignore{}
    case False{}: value_target(known, uncertain)

def declared_spec(intrinsic: Bool, imported: Bool) -> Bool:
  match intrinsic imported:
    case _ True{}: True{}
    case False{} False{}: True{}
    case True{} False{}: False{}

def readonly_spec(name: Bool, bound: Bool, generic: Bool, first: Bool, one: Bool) -> Bool:
  match name bound generic first one:
    case False{} _ _ _ _: False{}
    case _ True{} _ _ _: False{}
    case _ _ False{} _ _: False{}
    case _ _ _ False{} _: False{}
    case _ _ _ _ False{}: False{}
    case _ _ _ _ _: True{}

def eligible_type(
  identifier: Bool,
  own: Bool,
  context: Bool,
  parameter: Bool,
  readonly: Bool,
  declared: Bool
) -> Core.ReferencePlan:
  match identifier own context parameter readonly declared:
    case False{} _ _ _ _ _: Core.Ignore{}
    case _ True{} _ _ _ _: Core.Ignore{}
    case _ _ False{} _ _ _: Core.Ignore{}
    case _ _ _ True{} _ _: Core.Ignore{}
    case _ _ _ _ True{} _: Core.Ignore{}
    case _ _ _ _ _ False{}: Core.Ignore{}
    case _ _ _ _ _ _: Core.NamedType{}

def type_spec(
  unsupported: Bool,
  identifier: Bool,
  own: Bool,
  context: Bool,
  parameter: Bool,
  readonly: Bool,
  declared: Bool
) -> Core.ReferencePlan:
  match unsupported:
    case True{}: Core.Unsupported{}
    case False{}: eligible_type(identifier, own, context, parameter, readonly, declared)

law call_reference_exact:
  for +call: Bool
  for +callee: Bool
  for +identifier: Bool
  for +uncertain: Bool
  for +local: Bool
  {
    Core.call_reference(call, callee, identifier, uncertain, local)
    == call_spec(call, callee, identifier, uncertain, local)
    : Core.ReferencePlan
  }

law ignored_value_exact:
  for +self: Bool
  for +parent: Bool
  for +declaration: Bool
  for +first: Bool
  {
    Core.ignored_value(self, parent, declaration, first)
    == ignore_spec(self, parent, declaration, first)
    : Bool
  }

law value_reference_exact:
  for +local: Bool
  for +known: Bool
  for +uncertain: Bool
  {
    Core.value_reference(local, known, uncertain)
    == value_spec(local, known, uncertain)
    : Core.ReferencePlan
  }

law declared_type_exact:
  for +intrinsic: Bool
  for +imported: Bool
  { Core.declared_type(intrinsic, imported) == declared_spec(intrinsic, imported) : Bool }

law readonly_intrinsic_exact:
  for +name: Bool
  for +bound: Bool
  for +generic: Bool
  for +first: Bool
  for +one: Bool
  {
    Core.readonly_intrinsic(name, bound, generic, first, one)
    == readonly_spec(name, bound, generic, first, one)
    : Bool
  }

law type_reference_exact:
  for +unsupported: Bool
  for +identifier: Bool
  for +own: Bool
  for +context: Bool
  for +parameter: Bool
  for +readonly: Bool
  for +declared: Bool
  {
    Core.type_reference(unsupported, identifier, own, context, parameter, readonly, declared)
    == type_spec(unsupported, identifier, own, context, parameter, readonly, declared)
    : Core.ReferencePlan
  }
