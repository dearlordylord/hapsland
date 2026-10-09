import Base
import ./LAWS.bend as Laws

def Laws.call_reference_exact(call, callee, identifier, uncertain, local):
  match call callee identifier uncertain local:
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

def Laws.ignored_value_exact(self, parent, declaration, first):
  match self parent declaration first:
    case False{} False{} False{} False{}: {==}
    case False{} False{} False{} True{}: {==}
    case False{} False{} True{} False{}: {==}
    case False{} False{} True{} True{}: {==}
    case False{} True{} False{} False{}: {==}
    case False{} True{} False{} True{}: {==}
    case False{} True{} True{} False{}: {==}
    case False{} True{} True{} True{}: {==}
    case True{} False{} False{} False{}: {==}
    case True{} False{} False{} True{}: {==}
    case True{} False{} True{} False{}: {==}
    case True{} False{} True{} True{}: {==}
    case True{} True{} False{} False{}: {==}
    case True{} True{} False{} True{}: {==}
    case True{} True{} True{} False{}: {==}
    case True{} True{} True{} True{}: {==}

def Laws.value_reference_exact(local, known, uncertain):
  match local known uncertain:
    case False{} False{} False{}: {==}
    case False{} False{} True{}: {==}
    case False{} True{} False{}: {==}
    case False{} True{} True{}: {==}
    case True{} False{} False{}: {==}
    case True{} False{} True{}: {==}
    case True{} True{} False{}: {==}
    case True{} True{} True{}: {==}

def Laws.declared_type_exact(intrinsic, imported):
  match intrinsic imported:
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}

def Laws.readonly_intrinsic_exact(name, bound, generic, first, one):
  match name bound generic first one:
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

def Laws.type_reference_exact(unsupported, identifier, own, context, parameter, readonly, declared):
  match unsupported identifier own context parameter readonly declared:
    case False{} False{} False{} False{} False{} False{} False{}: {==}
    case False{} False{} False{} False{} False{} False{} True{}: {==}
    case False{} False{} False{} False{} False{} True{} False{}: {==}
    case False{} False{} False{} False{} False{} True{} True{}: {==}
    case False{} False{} False{} False{} True{} False{} False{}: {==}
    case False{} False{} False{} False{} True{} False{} True{}: {==}
    case False{} False{} False{} False{} True{} True{} False{}: {==}
    case False{} False{} False{} False{} True{} True{} True{}: {==}
    case False{} False{} False{} True{} False{} False{} False{}: {==}
    case False{} False{} False{} True{} False{} False{} True{}: {==}
    case False{} False{} False{} True{} False{} True{} False{}: {==}
    case False{} False{} False{} True{} False{} True{} True{}: {==}
    case False{} False{} False{} True{} True{} False{} False{}: {==}
    case False{} False{} False{} True{} True{} False{} True{}: {==}
    case False{} False{} False{} True{} True{} True{} False{}: {==}
    case False{} False{} False{} True{} True{} True{} True{}: {==}
    case False{} False{} True{} False{} False{} False{} False{}: {==}
    case False{} False{} True{} False{} False{} False{} True{}: {==}
    case False{} False{} True{} False{} False{} True{} False{}: {==}
    case False{} False{} True{} False{} False{} True{} True{}: {==}
    case False{} False{} True{} False{} True{} False{} False{}: {==}
    case False{} False{} True{} False{} True{} False{} True{}: {==}
    case False{} False{} True{} False{} True{} True{} False{}: {==}
    case False{} False{} True{} False{} True{} True{} True{}: {==}
    case False{} False{} True{} True{} False{} False{} False{}: {==}
    case False{} False{} True{} True{} False{} False{} True{}: {==}
    case False{} False{} True{} True{} False{} True{} False{}: {==}
    case False{} False{} True{} True{} False{} True{} True{}: {==}
    case False{} False{} True{} True{} True{} False{} False{}: {==}
    case False{} False{} True{} True{} True{} False{} True{}: {==}
    case False{} False{} True{} True{} True{} True{} False{}: {==}
    case False{} False{} True{} True{} True{} True{} True{}: {==}
    case False{} True{} False{} False{} False{} False{} False{}: {==}
    case False{} True{} False{} False{} False{} False{} True{}: {==}
    case False{} True{} False{} False{} False{} True{} False{}: {==}
    case False{} True{} False{} False{} False{} True{} True{}: {==}
    case False{} True{} False{} False{} True{} False{} False{}: {==}
    case False{} True{} False{} False{} True{} False{} True{}: {==}
    case False{} True{} False{} False{} True{} True{} False{}: {==}
    case False{} True{} False{} False{} True{} True{} True{}: {==}
    case False{} True{} False{} True{} False{} False{} False{}: {==}
    case False{} True{} False{} True{} False{} False{} True{}: {==}
    case False{} True{} False{} True{} False{} True{} False{}: {==}
    case False{} True{} False{} True{} False{} True{} True{}: {==}
    case False{} True{} False{} True{} True{} False{} False{}: {==}
    case False{} True{} False{} True{} True{} False{} True{}: {==}
    case False{} True{} False{} True{} True{} True{} False{}: {==}
    case False{} True{} False{} True{} True{} True{} True{}: {==}
    case False{} True{} True{} False{} False{} False{} False{}: {==}
    case False{} True{} True{} False{} False{} False{} True{}: {==}
    case False{} True{} True{} False{} False{} True{} False{}: {==}
    case False{} True{} True{} False{} False{} True{} True{}: {==}
    case False{} True{} True{} False{} True{} False{} False{}: {==}
    case False{} True{} True{} False{} True{} False{} True{}: {==}
    case False{} True{} True{} False{} True{} True{} False{}: {==}
    case False{} True{} True{} False{} True{} True{} True{}: {==}
    case False{} True{} True{} True{} False{} False{} False{}: {==}
    case False{} True{} True{} True{} False{} False{} True{}: {==}
    case False{} True{} True{} True{} False{} True{} False{}: {==}
    case False{} True{} True{} True{} False{} True{} True{}: {==}
    case False{} True{} True{} True{} True{} False{} False{}: {==}
    case False{} True{} True{} True{} True{} False{} True{}: {==}
    case False{} True{} True{} True{} True{} True{} False{}: {==}
    case False{} True{} True{} True{} True{} True{} True{}: {==}
    case True{} False{} False{} False{} False{} False{} False{}: {==}
    case True{} False{} False{} False{} False{} False{} True{}: {==}
    case True{} False{} False{} False{} False{} True{} False{}: {==}
    case True{} False{} False{} False{} False{} True{} True{}: {==}
    case True{} False{} False{} False{} True{} False{} False{}: {==}
    case True{} False{} False{} False{} True{} False{} True{}: {==}
    case True{} False{} False{} False{} True{} True{} False{}: {==}
    case True{} False{} False{} False{} True{} True{} True{}: {==}
    case True{} False{} False{} True{} False{} False{} False{}: {==}
    case True{} False{} False{} True{} False{} False{} True{}: {==}
    case True{} False{} False{} True{} False{} True{} False{}: {==}
    case True{} False{} False{} True{} False{} True{} True{}: {==}
    case True{} False{} False{} True{} True{} False{} False{}: {==}
    case True{} False{} False{} True{} True{} False{} True{}: {==}
    case True{} False{} False{} True{} True{} True{} False{}: {==}
    case True{} False{} False{} True{} True{} True{} True{}: {==}
    case True{} False{} True{} False{} False{} False{} False{}: {==}
    case True{} False{} True{} False{} False{} False{} True{}: {==}
    case True{} False{} True{} False{} False{} True{} False{}: {==}
    case True{} False{} True{} False{} False{} True{} True{}: {==}
    case True{} False{} True{} False{} True{} False{} False{}: {==}
    case True{} False{} True{} False{} True{} False{} True{}: {==}
    case True{} False{} True{} False{} True{} True{} False{}: {==}
    case True{} False{} True{} False{} True{} True{} True{}: {==}
    case True{} False{} True{} True{} False{} False{} False{}: {==}
    case True{} False{} True{} True{} False{} False{} True{}: {==}
    case True{} False{} True{} True{} False{} True{} False{}: {==}
    case True{} False{} True{} True{} False{} True{} True{}: {==}
    case True{} False{} True{} True{} True{} False{} False{}: {==}
    case True{} False{} True{} True{} True{} False{} True{}: {==}
    case True{} False{} True{} True{} True{} True{} False{}: {==}
    case True{} False{} True{} True{} True{} True{} True{}: {==}
    case True{} True{} False{} False{} False{} False{} False{}: {==}
    case True{} True{} False{} False{} False{} False{} True{}: {==}
    case True{} True{} False{} False{} False{} True{} False{}: {==}
    case True{} True{} False{} False{} False{} True{} True{}: {==}
    case True{} True{} False{} False{} True{} False{} False{}: {==}
    case True{} True{} False{} False{} True{} False{} True{}: {==}
    case True{} True{} False{} False{} True{} True{} False{}: {==}
    case True{} True{} False{} False{} True{} True{} True{}: {==}
    case True{} True{} False{} True{} False{} False{} False{}: {==}
    case True{} True{} False{} True{} False{} False{} True{}: {==}
    case True{} True{} False{} True{} False{} True{} False{}: {==}
    case True{} True{} False{} True{} False{} True{} True{}: {==}
    case True{} True{} False{} True{} True{} False{} False{}: {==}
    case True{} True{} False{} True{} True{} False{} True{}: {==}
    case True{} True{} False{} True{} True{} True{} False{}: {==}
    case True{} True{} False{} True{} True{} True{} True{}: {==}
    case True{} True{} True{} False{} False{} False{} False{}: {==}
    case True{} True{} True{} False{} False{} False{} True{}: {==}
    case True{} True{} True{} False{} False{} True{} False{}: {==}
    case True{} True{} True{} False{} False{} True{} True{}: {==}
    case True{} True{} True{} False{} True{} False{} False{}: {==}
    case True{} True{} True{} False{} True{} False{} True{}: {==}
    case True{} True{} True{} False{} True{} True{} False{}: {==}
    case True{} True{} True{} False{} True{} True{} True{}: {==}
    case True{} True{} True{} True{} False{} False{} False{}: {==}
    case True{} True{} True{} True{} False{} False{} True{}: {==}
    case True{} True{} True{} True{} False{} True{} False{}: {==}
    case True{} True{} True{} True{} False{} True{} True{}: {==}
    case True{} True{} True{} True{} True{} False{} False{}: {==}
    case True{} True{} True{} True{} True{} False{} True{}: {==}
    case True{} True{} True{} True{} True{} True{} False{}: {==}
    case True{} True{} True{} True{} True{} True{} True{}: {==}
