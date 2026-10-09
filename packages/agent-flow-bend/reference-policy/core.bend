import Base

# Conditional native facts; parsing, identity, field-read order and materialization remain host obligations.
type ReferencePlan is Data:
  Ignore{}
  NamedFunction{}
  NamedType{}
  Unsupported{}

def call_reference(
  call: Bool,
  callee: Bool,
  identifier: Bool,
  uncertain: Bool,
  local: Bool
) -> ReferencePlan:
  match call callee identifier uncertain local:
    case False{} _ _ _ _: Ignore{}
    case _ False{} _ _ _: Ignore{}
    case True{} True{} True{} False{} False{}: NamedFunction{}
    case _ _ _ _ _: Unsupported{}

def ignored_value(self: Bool, parent: Bool, declaration: Bool, first: Bool) -> Bool:
  match self parent declaration first:
    case True{} _ _ _: True{}
    case _ False{} _ _: True{}
    case _ _ True{} True{}: True{}
    case _ _ _ _: False{}

def value_reference(local: Bool, known: Bool, uncertain: Bool) -> ReferencePlan:
  match local known uncertain:
    case True{} _ _: Ignore{}
    case False{} True{} False{}: NamedFunction{}
    case _ _ _: Unsupported{}

def declared_type(intrinsic: Bool, imported: Bool) -> Bool:
  match intrinsic imported:
    case True{} False{}: False{}
    case _ _: True{}

def readonly_intrinsic(name: Bool, bound: Bool, generic: Bool, first: Bool, one: Bool) -> Bool:
  match name bound generic first one:
    case True{} False{} True{} True{} True{}: True{}
    case _ _ _ _ _: False{}

def type_reference(
  unsupported: Bool,
  identifier: Bool,
  own: Bool,
  context: Bool,
  parameter: Bool,
  readonly: Bool,
  declared: Bool
) -> ReferencePlan:
  match unsupported identifier own context parameter readonly declared:
    case True{} _ _ _ _ _ _: Unsupported{}
    case False{} True{} False{} True{} False{} False{} True{}: NamedType{}
    case _ _ _ _ _ _ _: Ignore{}
