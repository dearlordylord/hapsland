import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.lookup_empty(key, fallback):
  {==}

def Laws.lookup_match(rest, key, name, value, fallback, equal):
  %Equal.sym(Bool, String.eq(key, name), True{}, equal) : {
    Core.lookup(rest, key, Bool.pick(String, _, value, fallback))
    == Core.lookup(rest, key, value)
    : String
  }
  {==}

def Laws.lookup_skip(rest, key, name, value, fallback, different):
  %Equal.sym(Bool, String.eq(key, name), False{}, different) : {
    Core.lookup(rest, key, Bool.pick(String, _, value, fallback))
    == Core.lookup(rest, key, fallback)
    : String
  }
  {==}

def Laws.encode_exact(model, state, questions):
  {==}

def Laws.project_exact(fields):
  {==}
