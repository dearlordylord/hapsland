import Base

# Host facts retain exact native AST identity, binding names and access order.
type ImportKind is Data:
  NamedEffect{}
  EffectNamespace{}
  OtherImport{}

type Method is Data:
  Fn{}
  FnUntraced{}
  OtherMethod{}

type BodyKind is Data:
  Arrow{}
  FunctionExpression{}
  GeneratorFunction{}
  OtherBody{}

type ValueKind is Data:
  DirectArrow{}
  WrapperCall{}
  OtherValue{}

type CallablePlan is Data:
  Self{}
  InlineArgument{}
  Reject{}

def runtime_import(kind: ImportKind, type_only: Bool) -> Bool:
  match kind type_only:
    case NamedEffect{} False{}: True{}
    case EffectNamespace{} False{}: True{}
    case _ _: False{}

def wrapper(
  type_arguments: Bool,
  member_identifier: Bool,
  binding_eligible: Bool,
  method: Method,
  invoked: Bool,
  one_string_label: Bool
) -> Bool:
  match type_arguments member_identifier binding_eligible method invoked one_string_label:
    case False{} True{} True{} Fn{} False{} _: True{}
    case False{} True{} True{} FnUntraced{} False{} _: True{}
    case False{} True{} True{} Fn{} True{} True{}: True{}
    case _ _ _ _ _ _: False{}

def inline_body(kind: BodyKind) -> Bool:
  match kind:
    case OtherBody{}: False{}
    case _: True{}

def callable_value(
  kind: ValueKind,
  type_arguments: Bool,
  wrapper_eligible: Bool,
  one_argument: Bool,
  body_eligible: Bool
) -> CallablePlan:
  match kind type_arguments wrapper_eligible one_argument body_eligible:
    case DirectArrow{} _ _ _ _: Self{}
    case WrapperCall{} False{} True{} True{} True{}: InlineArgument{}
    case _ _ _ _ _: Reject{}

def const_callable(
  lexical_const: Bool,
  one_declarator: Bool,
  identifier: Bool,
  callable: Bool
) -> Bool:
  match lexical_const one_declarator identifier callable:
    case True{} True{} True{} True{}: True{}
    case _ _ _ _: False{}
