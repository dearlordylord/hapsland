import Base
import ./LAWS.bend as Laws

def Laws.unsupported_assignment_exact(identifier, bound, pattern):
  match identifier bound pattern:
    case False{} False{} False{}: {==}
    case False{} False{} True{}: {==}
    case False{} True{} False{}: {==}
    case False{} True{} True{}: {==}
    case True{} False{} False{}: {==}
    case True{} False{} True{}: {==}
    case True{} True{} False{}: {==}
    case True{} True{} True{}: {==}

def Laws.binding_actions_exact(uncertain, mutation, unsupported, binding, identifier):
  match uncertain mutation unsupported binding identifier:
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

def Laws.initial_arguments_exact(lexical):
  match lexical:
    case False{}: {==}
    case True{}: {==}
