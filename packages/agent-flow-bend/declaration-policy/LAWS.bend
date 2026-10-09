import Base
import ./core.bend as Core

def function_conflicts(functionConflict: Bool, importConflict: Bool, otherConflict: Bool) -> Bool:
  match functionConflict importConflict otherConflict:
    case True{} _ _: False{}
    case _ True{} _: False{}
    case _ _ True{}: False{}
    case _ _ _: True{}

def function_spec(
  identifier: Bool,
  body: Bool,
  functionConflict: Bool,
  importConflict: Bool,
  otherConflict: Bool
) -> Bool:
  match identifier body:
    case False{} _: False{}
    case _ False{}: False{}
    case _ _: function_conflicts(functionConflict, importConflict, otherConflict)

def arrow_spec(functionConflict: Bool, importConflict: Bool, otherConflict: Bool) -> Bool:
  match functionConflict importConflict otherConflict:
    case True{} _ _: False{}
    case _ True{} _: False{}
    case _ _ True{}: False{}
    case _ _ _: True{}

def type_spec(identifier: Bool, typeConflict: Bool, importConflict: Bool) -> Bool:
  match identifier typeConflict importConflict:
    case False{} _ _: False{}
    case _ True{} _: False{}
    case _ _ True{}: False{}
    case _ _ _: True{}

def alias_kind(aliasSyntax: Bool) -> Core.TypeKind:
  match aliasSyntax:
    case True{}: Core.TypeAlias{}
    case False{}: Core.Ignore{}

def kind_spec(interfaceSyntax: Bool, aliasSyntax: Bool) -> Core.TypeKind:
  match interfaceSyntax:
    case True{}: Core.Interface{}
    case False{}: alias_kind(aliasSyntax)

def failure_result(limitExceeded: Bool) -> Core.RootResult:
  match limitExceeded:
    case True{}: Core.DeclarationLimit{}
    case False{}: Core.Unsupported{}

def result_spec(collectionSucceeded: Bool, limitExceeded: Bool) -> Core.RootResult:
  match collectionSucceeded:
    case True{}: Core.Complete{}
    case False{}: failure_result(limitExceeded)

# Admission permits continuation, including the existing separate overload exclusion branch.
law function_admission_exact:
  for +identifier: Bool
  for +body: Bool
  for +functionConflict: Bool
  for +importConflict: Bool
  for +otherConflict: Bool
  {
    Core.function_admission(identifier, body, functionConflict, importConflict, otherConflict)
    == function_spec(identifier, body, functionConflict, importConflict, otherConflict)
    : Bool
  }

# Arrow names are captured once; any named conflict rejects continuation.
law arrow_admission_exact:
  for +functionConflict: Bool
  for +importConflict: Bool
  for +otherConflict: Bool
  {
    Core.arrow_admission(functionConflict, importConflict, otherConflict)
    == arrow_spec(functionConflict, importConflict, otherConflict)
    : Bool
  }

# An absent identifier or a conflicting type/import rejects continuation.
law type_admission_exact:
  for +identifier: Bool
  for +typeConflict: Bool
  for +importConflict: Bool
  {
    Core.type_admission(identifier, typeConflict, importConflict)
    == type_spec(identifier, typeConflict, importConflict)
    : Bool
  }

# Interface takes precedence; neither kind means no type collector.
law type_kind_exact:
  for +interfaceSyntax: Bool
  for +aliasSyntax: Bool
  {
    Core.type_kind(interfaceSyntax, aliasSyntax)
    == kind_spec(interfaceSyntax, aliasSyntax)
    : Core.TypeKind
  }

# A completed collection is Complete; only failed collection examines the native limit fact.
law root_result_exact:
  for +collectionSucceeded: Bool
  for +limitExceeded: Bool
  {
    Core.root_result(collectionSucceeded, limitExceeded)
    == result_spec(collectionSucceeded, limitExceeded)
    : Core.RootResult
  }
