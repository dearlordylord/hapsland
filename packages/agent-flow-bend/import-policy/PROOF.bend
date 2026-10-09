import Base
import ./LAWS.bend as Laws

def Laws.import_ready_exact(modulePresent, clausePresent):
  match modulePresent clausePresent:
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}

def Laws.namespace_admission_exact(localPresent, duplicate):
  match localPresent duplicate:
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}

def Laws.specifier_admission_exact(importedPresent, localPresent, duplicate):
  match importedPresent localPresent duplicate:
    case False{} False{} False{}: {==}
    case False{} False{} True{}: {==}
    case False{} True{} False{}: {==}
    case False{} True{} True{}: {==}
    case True{} False{} False{}: {==}
    case True{} False{} True{}: {==}
    case True{} True{} False{}: {==}
    case True{} True{} True{}: {==}

def Laws.type_only_exact(statementTypeOnly, specifierTypeOnly):
  match statementTypeOnly specifierTypeOnly:
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}
