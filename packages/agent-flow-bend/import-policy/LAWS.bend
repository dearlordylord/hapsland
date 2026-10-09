import Base
import ./core.bend as Core

def ready_spec(modulePresent: Bool, clausePresent: Bool) -> Bool:
  match modulePresent:
    case False{}: False{}
    case True{}: clausePresent

def namespace_spec(localPresent: Bool, duplicate: Bool) -> Bool:
  match localPresent:
    case False{}: False{}
    case True{}: Bool.not(duplicate)

def named_local(localPresent: Bool, duplicate: Bool) -> Bool:
  match localPresent:
    case False{}: False{}
    case True{}: Bool.not(duplicate)

def specifier_spec(importedPresent: Bool, localPresent: Bool, duplicate: Bool) -> Bool:
  match importedPresent:
    case False{}: False{}
    case True{}: named_local(localPresent, duplicate)

def type_spec(statementTypeOnly: Bool, specifierTypeOnly: Bool) -> Bool:
  match statementTypeOnly:
    case True{}: True{}
    case False{}: specifierTypeOnly

# Both module and clause must exist before collecting bindings.
law import_ready_exact:
  for +modulePresent: Bool
  for +clausePresent: Bool
  {
    Core.import_ready(modulePresent, clausePresent)
    == ready_spec(modulePresent, clausePresent)
    : Bool
  }

# Missing or duplicate namespace names reject continuation.
law namespace_admission_exact:
  for +localPresent: Bool
  for +duplicate: Bool
  {
    Core.namespace_admission(localPresent, duplicate)
    == namespace_spec(localPresent, duplicate)
    : Bool
  }

# Both names must exist and the local binding must be unique.
law specifier_admission_exact:
  for +importedPresent: Bool
  for +localPresent: Bool
  for +duplicate: Bool
  {
    Core.specifier_admission(importedPresent, localPresent, duplicate)
    == specifier_spec(importedPresent, localPresent, duplicate)
    : Bool
  }

# Either type-only marker is sufficient; host evaluates the second marker lazily.
law type_only_exact:
  for +statementTypeOnly: Bool
  for +specifierTypeOnly: Bool
  {
    Core.type_only(statementTypeOnly, specifierTypeOnly)
    == type_spec(statementTypeOnly, specifierTypeOnly)
    : Bool
  }
