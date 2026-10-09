import Base
import ./LAWS.bend as Laws

def Laws.function_admission_exact(
  identifier,
  body,
  functionConflict,
  importConflict,
  otherConflict
):
  match identifier body functionConflict importConflict otherConflict:
    case False{} False{} False{} False{} False{}: {==}
    case False{} False{} False{} False{} True{}: {==}
    case False{} False{} False{} True{} False{}: {==}
    case False{} False{} False{} True{} True{}: {==}
    case False{} False{} True{} False{} False{}: {==}
    case False{} False{} True{} False{} True{}: {==}
    case False{} False{} True{} True{} False{}: {==}
    case False{} False{} True{} True{} True{}: {==}
    case False{} True{} False{} False{} False{}: {==}
    case False{} True{} False{} False{} True{}: {==}
    case False{} True{} False{} True{} False{}: {==}
    case False{} True{} False{} True{} True{}: {==}
    case False{} True{} True{} False{} False{}: {==}
    case False{} True{} True{} False{} True{}: {==}
    case False{} True{} True{} True{} False{}: {==}
    case False{} True{} True{} True{} True{}: {==}
    case True{} False{} False{} False{} False{}: {==}
    case True{} False{} False{} False{} True{}: {==}
    case True{} False{} False{} True{} False{}: {==}
    case True{} False{} False{} True{} True{}: {==}
    case True{} False{} True{} False{} False{}: {==}
    case True{} False{} True{} False{} True{}: {==}
    case True{} False{} True{} True{} False{}: {==}
    case True{} False{} True{} True{} True{}: {==}
    case True{} True{} False{} False{} False{}: {==}
    case True{} True{} False{} False{} True{}: {==}
    case True{} True{} False{} True{} False{}: {==}
    case True{} True{} False{} True{} True{}: {==}
    case True{} True{} True{} False{} False{}: {==}
    case True{} True{} True{} False{} True{}: {==}
    case True{} True{} True{} True{} False{}: {==}
    case True{} True{} True{} True{} True{}: {==}

def Laws.arrow_admission_exact(functionConflict, importConflict, otherConflict):
  match functionConflict importConflict otherConflict:
    case False{} False{} False{}: {==}
    case False{} False{} True{}: {==}
    case False{} True{} False{}: {==}
    case False{} True{} True{}: {==}
    case True{} False{} False{}: {==}
    case True{} False{} True{}: {==}
    case True{} True{} False{}: {==}
    case True{} True{} True{}: {==}

def Laws.type_admission_exact(identifier, typeConflict, importConflict):
  match identifier typeConflict importConflict:
    case False{} False{} False{}: {==}
    case False{} False{} True{}: {==}
    case False{} True{} False{}: {==}
    case False{} True{} True{}: {==}
    case True{} False{} False{}: {==}
    case True{} False{} True{}: {==}
    case True{} True{} False{}: {==}
    case True{} True{} True{}: {==}

def Laws.type_kind_exact(interfaceSyntax, aliasSyntax):
  match interfaceSyntax aliasSyntax:
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}

def Laws.root_result_exact(collectionSucceeded, limitExceeded):
  match collectionSucceeded limitExceeded:
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}
