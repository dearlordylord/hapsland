import Base
import ../../../../runtime-environment/src/runtime/backend/Backend.bend as Backend

type Layer is Data:
  Layer{name: String, backend: Maybe<&2, Backend.Selection>}

def supplied_or_default(value: Maybe<&2, Backend.Selection>) -> Backend.Selection:
  match value:
    case Some{selection}: selection
    case None{}: Backend.default_selection()

def effective(layers: List<&2, Layer>) -> Backend.Selection:
  match layers:
    case []: Backend.default_selection()
    case Layer{name, backend} <> tail:
      Bool.pick(
        Backend.Selection,
        String.eq(name, "user"),
        supplied_or_default(backend),
        effective(tail)
      )
