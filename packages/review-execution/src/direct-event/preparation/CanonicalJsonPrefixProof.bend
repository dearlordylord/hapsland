import Base
import ./CanonicalJsonPrefixLaws.bend as Laws
import ./CanonicalJson.bend as Json

def Laws.prefix_exact(prefix, suffix, parts):
  match prefix:
    case []: {==}
    case head <> tail: Laws.prefix_exact(tail, suffix, head <> parts)

def Laws.empty_stop(parts):
  {==}

def Laws.visit_stop(value, tail, parts):
  {==}

def Laws.advance_literal(value, tail, parts):
  {==}

def main() -> Unit:
  Unit{}
