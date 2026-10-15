import Base
import ./CanonicalJson.bend as Json
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value

# Independent sequence of original Literal transitions, using existing work/state.
def literal_work(prefix: List<&2, String>, suffix: List<&2, Json.Work>) -> List<&2, Json.Work>:
  match prefix:
    case []: suffix
    case head <> tail: Json.Literal{head} <> literal_work(tail, suffix)

def prefix_parts(prefix: List<&2, String>, parts: List<&2, String>) -> List<&2, String>:
  match prefix:
    case []: parts
    case head <> tail: prefix_parts(tail, head <> parts)

# Every finite Literal prefix has the same accumulated order as old single steps.
law prefix_exact:
  for +prefix: List<&2, String>
  for +suffix: List<&2, Json.Work>
  for +parts: List<&2, String>
  {
    Json.literal_prefix(literal_work(prefix, suffix), parts)
    == Json.literal_prefix(suffix, prefix_parts(prefix, parts))
    : Json.State
  }

# Exhaustion remains a state, without prematurely returning Complete.
law empty_stop:
  for +parts: List<&2, String>
  {Json.literal_prefix([], parts) == Json.State{[], parts} : Json.State}

# The first Visit and every following work item remain untouched.
law visit_stop:
  for +value: Value.ProductValue
  for +tail: List<&2, Json.Work>
  for +parts: List<&2, String>
  {
    Json.literal_prefix(Json.Visit{value} <> tail, parts)
    == Json.State{Json.Visit{value} <> tail, parts}
    : Json.State
  }

# Production advance batches only the Literal arm and still returns Continue.
law advance_literal:
  for +value: String
  for +tail: List<&2, Json.Work>
  for +parts: List<&2, String>
  {
    Json.advance(Json.State{Json.Literal{value} <> tail, parts})
    == Json.Continue{Json.literal_prefix(tail, value <> parts)}
    : Json.Step
  }

def main() -> Unit:
  Unit{}
