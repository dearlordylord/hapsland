import Base
import ../Types.bend as T

# ECMAScript Unicode properties are observed mechanically by the pinned host.
# Dots, underscores, segment grammar and depth admission belong to this machine.
type ModuleName is Data:
  ModuleName{dots: Nat, segments: List<&2, String>}
type Scan is Data:
  Scan{valid: Bool, dots: Nat, segments: List<&2, String>, current: String, in_tail: Bool, need_start: Bool}

def dot_tail(need_start: Bool, valid: Bool, dots: Nat, segments: List<&2, String>, current: String) -> Scan:
  match need_start:
    case True{}: Scan{False{}, dots, segments, current, True{}, True{}}
    case False{}: Scan{valid, dots, List.append(&2, String, segments, current <> []), "", True{}, True{}}

def dot(state: Scan) -> Scan:
  match state:
    case Scan{valid, dots, segments, current, False{}, _}:
      Scan{valid, Nat.add(dots, 1n), segments, current, False{}, True{}}
    case Scan{valid, dots, segments, current, True{}, need_start}:
      dot_tail(need_start, valid, dots, segments, current)

def letter_property(need_start: Bool, +text: String, id_start: Bool, id_continue: Bool) -> Bool:
  match need_start:
    case True{}: Bool.or(id_start, String.eq(text, "_"))
    case False{}: id_continue

def letter(state: Scan, +text: String, id_start: Bool, id_continue: Bool) -> Scan:
  match state:
    case Scan{valid, dots, segments, current, _, need_start}:
      Scan{Bool.and(valid, letter_property(need_start, text, id_start, id_continue)),
        dots, segments, String.append(current, text), True{}, False{}}

def character(is_dot: Bool, state: Scan, text: String, id_start: Bool, id_continue: Bool) -> Scan:
  match is_dot:
    case True{}: dot(state)
    case False{}: letter(state, text, id_start, id_continue)

def step(state: Scan, value: T.IdentifierCharacter) -> Scan:
  match value:
    case T.IdentifierCharacter{+text, id_start, id_continue}:
      character(String.eq(text, "."), state, text, id_start, id_continue)

def scan(characters: List<&2, T.IdentifierCharacter>, state: Scan) -> Scan:
  match characters:
    case []: state
    case head <> tail: scan(tail, step(state, head))

def admitted(admit: Bool, name: ModuleName) -> Maybe<&2, ModuleName>:
  match admit:
    case True{}: Some{name}
    case False{}: None{}

def finish_tail(valid: Bool, +dots: Nat, +segments: List<&2, String>, current: String,
    need_start: Bool, depth: Nat) -> Maybe<&2, ModuleName>:
  +complete = List.append(&2, String, segments, current <> [])
  admitted(Bool.and(valid, Bool.and(Bool.not(need_start),
    Nat.is_le(Nat.add(dots, List.length(&2, String, complete)), Nat.add(depth, 1n)))),
    ModuleName{dots, complete})

def finish(state: Scan, depth: Nat) -> Maybe<&2, ModuleName>:
  match state:
    case Scan{valid, +dots, segments, _, False{}, _}:
      admitted(Bool.and(valid, Bool.and(Nat.is_gt(dots, 0n), Nat.is_le(dots, Nat.add(depth, 1n)))),
        ModuleName{dots, segments})
    case Scan{valid, dots, segments, current, True{}, need_start}:
      finish_tail(valid, dots, segments, current, need_start, depth)

def parse(characters: List<&2, T.IdentifierCharacter>, depth: Nat) -> Maybe<&2, ModuleName>:
  finish(scan(characters, Scan{True{}, 0n, [], "", False{}, True{}}), depth)

def main() -> Unit:
  Unit{}
