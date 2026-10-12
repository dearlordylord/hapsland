import Base

# Mechanical ECMAScript property observations only; Package owns the grammar.
type Character is Data:
  Character{text: String, +letter: Bool, +number: Bool, +uppercase: Bool}
type Spelling is Data:
  Spelling{text: String, +characters: List<&2, Character>}

def same_text_acc(left: String, right: String, equal: Bool) -> Bool:
  match left right equal:
    case _ _ False{}: False{}
    case SNil{} SNil{} True{}: True{}
    case SCon{left_char, left_tail} SCon{right_char, right_tail} True{}:
      same_text_acc(left_tail, right_tail, Char.is_eq(left_char, right_char))
    case _ _ _: False{}

def same_text(left: String, right: String) -> Bool:
  same_text_acc(left, right, True{})

def characters( +items: List<&2, Spelling>, +wanted: String) -> List<&2, Character>:
  match items:
    case []: []
    case Spelling{+text, +chars} <> tail:
      Bool.pick(List<&2, Character>, same_text(text, wanted), chars, characters(tail, wanted))

def scan( +items: List<&2, Character>, +need_start: Bool, +dots: Nat, +valid: Bool) -> Bool:
  match items:
    case []: Bool.and(valid, Bool.and(Bool.not(need_start), Nat.is_eq(dots, 1n)))
    case Character{+text, +letter, +number, _} <> tail:
      +dot = String.eq(text, ".")
      scan(tail, dot, Nat.add(dots, Bool.pick(Nat, dot, 1n, 0n)),
        Bool.and(valid, Bool.pick(Bool, dot, Bool.not(need_start),
          Bool.or(String.eq(text, "_"), Bool.or(letter, Bool.and(Bool.not(need_start), number))))))

def qualified(+items: List<&2, Spelling>, +name: String) -> Bool:
  scan(characters(items, name), True{}, 0n, True{})

def has(items: List<&2, Spelling>, +wanted: String) -> Bool:
  match items:
    case []: False{}
    case Spelling{text, _} <> tail: Bool.or(same_text(text, wanted), has(tail, wanted))
