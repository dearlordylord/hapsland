import Base

# Native parser, regex evaluation, name identity and Map effects remain host obligations.
def import_ready(modulePresent: Bool, clausePresent: Bool) -> Bool:
  match modulePresent clausePresent:
    case True{} True{}: True{}
    case _ _: False{}

def namespace_admission(localPresent: Bool, duplicate: Bool) -> Bool:
  match localPresent duplicate:
    case True{} False{}: True{}
    case _ _: False{}

def specifier_admission(importedPresent: Bool, localPresent: Bool, duplicate: Bool) -> Bool:
  match importedPresent localPresent duplicate:
    case True{} True{} False{}: True{}
    case _ _ _: False{}

def type_only(statementTypeOnly: Bool, specifierTypeOnly: Bool) -> Bool:
  match statementTypeOnly specifierTypeOnly:
    case False{} False{}: False{}
    case _ _: True{}
