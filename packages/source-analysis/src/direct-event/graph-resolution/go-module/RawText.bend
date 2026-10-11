import Base

# Raw ECMAScript code points, including lone surrogates; no tokens or policy.
type Character is Data:
  Character{code: Nat, +whitespace: Bool}
type Text is Data:
  Text{value: String, +characters: List<&2, Character>}

def chars( +value: Text) -> List<&2, Character>:
  match value:
    case Text{_, +items}: items

def value( +text: Text) -> String:
  match text:
    case Text{ +value, _}: value

def code( +value: Character) -> Nat:
  match value:
    case Character{ +code, _}: code

def space( +value: Character) -> Bool:
  match value:
    case Character{_, +space}: space

def utf16( +items: List<&2, Character>) -> Nat:
  match items:
    case []: 0n
    case Character{ +code, _} <> tail: Nat.add(Bool.pick(Nat, Nat.is_gt(code, 65535n), 2n, 1n), utf16(tail))

def bytes( +items: List<&2, Character>) -> Nat:
  match items:
    case []: 0n
    case Character{+code, _} <> tail:
      Nat.add(Bool.pick(Nat, Nat.is_le(code, 127n), 1n, Bool.pick(Nat, Nat.is_le(code, 2047n), 2n, Bool.pick(Nat, Nat.is_le(code, 65535n), 3n, 4n))), bytes(tail))

def ascii( +code: Nat) -> String:
  SCon{Chr{U32.from_nat(code)}, SNil{}}

def ascii_text( +items: List<&2, Character>) -> String:
  match items:
    case []: ""
    case Character{ +code, _} <> tail: String.append(ascii(code), ascii_text(tail))

def skip_space( +items: List<&2, Character>) -> List<&2, Character>:
  match items:
    case []: []
    case +head <> +tail: Bool.pick(List<&2, Character>, space(head), skip_space(tail), head <> tail)

def trim( +items: List<&2, Character>) -> List<&2, Character>:
  List.reverse(&2, Character, skip_space(List.reverse(&2, Character, skip_space(items))))

def drop( +items: List<&2, Character>, +count: Nat) -> List<&2, Character>:
  match items count:
    case +items 0n: items
    case [] _: []
    case _ <> tail 1n++rest: drop(tail, rest)

def prefix( +items: List<&2, Character>, +codes: List<&2, Nat>) -> Bool:
  match items codes:
    case _ Nil{}: True{}
    case Nil{} Con{_, _}: False{}
    case Con{Character{+a, _}, tail} Con{b, rest}: Bool.and(Nat.is_eq(a, b), prefix(tail, rest))

def head_code( +items: List<&2, Character>) -> Nat:
  match items:
    case []: 0n
    case Character{ +code, _} <> _: code

def head_space( +items: List<&2, Character>) -> Bool:
  match items:
    case []: False{}
    case head <> _: space(head)

def empty( +items: List<&2, Character>) -> Bool:
  match items:
    case []: True{}
    case _ <> _: False{}
