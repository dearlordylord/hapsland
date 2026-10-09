import Base
import ./core.bend as Core

# Draft exact laws for Astra review; no proof has been authored.
# Only the two supported runtime import shapes authorize an Effect wrapper.
def import_spec(kind: Core.ImportKind, type_only: Bool) -> Bool:
  match kind type_only:
    case _ True{}: False{}
    case Core.OtherImport{} False{}: False{}
    case _ False{}: True{}

# Invoked wrappers require fn with one string label; bare fn/fnUntraced are supported.
def method_spec(method: Core.Method, invoked: Bool, label: Bool) -> Bool:
  match method invoked label:
    case Core.OtherMethod{} _ _: False{}
    case Core.FnUntraced{} True{} _: False{}
    case Core.Fn{} True{} False{}: False{}
    case _ _ _: True{}

def wrapper_spec(
  types: Bool,
  member: Bool,
  binding: Bool,
  method: Core.Method,
  invoked: Bool,
  label: Bool
) -> Bool:
  match types member binding:
    case False{} True{} True{}: method_spec(method, invoked, label)
    case _ _ _: False{}

# Function expressions and generators qualify only as inline wrapper bodies.
def body_spec(kind: Core.BodyKind) -> Bool:
  match kind:
    case Core.Arrow{}: True{}
    case Core.FunctionExpression{}: True{}
    case Core.GeneratorFunction{}: True{}
    case Core.OtherBody{}: False{}

# Direct arrows select themselves, including generic arrows; wrapper calls select their one inline argument.
def call_spec(types: Bool, wrapper: Bool, one: Bool, body: Bool) -> Core.CallablePlan:
  match types wrapper one body:
    case False{} True{} True{} True{}: Core.InlineArgument{}
    case _ _ _ _: Core.Reject{}

def value_spec(
  kind: Core.ValueKind,
  types: Bool,
  wrapper: Bool,
  one: Bool,
  body: Bool
) -> Core.CallablePlan:
  match kind:
    case Core.DirectArrow{}: Core.Self{}
    case Core.WrapperCall{}: call_spec(types, wrapper, one, body)
    case Core.OtherValue{}: Core.Reject{}

# Only one identifier declarator under the native lexical-const test is eligible.
def declaration_spec(lexical: Bool, one: Bool, identifier: Bool, callable: Bool) -> Bool:
  match lexical one identifier callable:
    case False{} _ _ _: False{}
    case _ False{} _ _: False{}
    case _ _ False{} _: False{}
    case _ _ _ False{}: False{}
    case _ _ _ _: True{}

law runtime_import_exact:
  for +kind: Core.ImportKind
  for +type_only: Bool
  { Core.runtime_import(kind, type_only) == import_spec(kind, type_only) : Bool }

law wrapper_exact:
  for +types: Bool
  for +member: Bool
  for +binding: Bool
  for +method: Core.Method
  for +invoked: Bool
  for +label: Bool
  {
    Core.wrapper(types, member, binding, method, invoked, label)
    == wrapper_spec(types, member, binding, method, invoked, label)
    : Bool
  }

law inline_body_exact:
  for +kind: Core.BodyKind
  { Core.inline_body(kind) == body_spec(kind) : Bool }

law callable_value_exact:
  for +kind: Core.ValueKind
  for +types: Bool
  for +wrapper: Bool
  for +one: Bool
  for +body: Bool
  {
    Core.callable_value(kind, types, wrapper, one, body)
    == value_spec(kind, types, wrapper, one, body)
    : Core.CallablePlan
  }

law const_callable_exact:
  for +lexical: Bool
  for +one: Bool
  for +identifier: Bool
  for +callable: Bool
  {
    Core.const_callable(lexical, one, identifier, callable)
    == declaration_spec(lexical, one, identifier, callable)
    : Bool
  }
