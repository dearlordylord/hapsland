import Base

# Conditional facts; native parser, names, cardinality and effects remain host obligations.
type TypeKind is Data:
  Interface{}
  TypeAlias{}
  Ignore{}

type RootResult is Data:
  Complete{}
  DeclarationLimit{}
  Unsupported{}

def function_admission(
  identifier: Bool,
  body: Bool,
  functionConflict: Bool,
  importConflict: Bool,
  otherConflict: Bool
) -> Bool:
  match identifier body functionConflict importConflict otherConflict:
    case True{} True{} False{} False{} False{}: True{}
    case _ _ _ _ _: False{}

def arrow_admission(functionConflict: Bool, importConflict: Bool, otherConflict: Bool) -> Bool:
  match functionConflict importConflict otherConflict:
    case False{} False{} False{}: True{}
    case _ _ _: False{}

def type_admission(identifier: Bool, typeConflict: Bool, importConflict: Bool) -> Bool:
  match identifier typeConflict importConflict:
    case True{} False{} False{}: True{}
    case _ _ _: False{}

def type_kind(interfaceSyntax: Bool, aliasSyntax: Bool) -> TypeKind:
  match interfaceSyntax aliasSyntax:
    case True{} _: Interface{}
    case False{} True{}: TypeAlias{}
    case _ _: Ignore{}

def root_result(collectionSucceeded: Bool, limitExceeded: Bool) -> RootResult:
  match collectionSucceeded limitExceeded:
    case True{} _: Complete{}
    case False{} True{}: DeclarationLimit{}
    case False{} False{}: Unsupported{}
