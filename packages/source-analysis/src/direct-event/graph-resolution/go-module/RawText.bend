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

def ascii( +code: Nat) -> String:
  SCon{Chr{U32.from_nat(code)}, SNil{}}

def ascii_text_acc(items: List<&2, Character>, prefix: String) -> String:
  match items:
    case []: prefix
    case Character{code, _} <> tail: ascii_text_acc(tail, String.append(prefix, ascii(code)))

def ascii_text(items: List<&2, Character>) -> String:
  ascii_text_acc(items, "")

def skip_space(items: List<&2, Character>) -> List<&2, Character>:
  match items:
    case []: []
    case +head <> +tail:
      match head:
        case Character{_, True{}}: skip_space(tail)
        case _: head <> tail

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

def utf16_unit(+code: U32, tail: List<&2, U32>, supplementary: Bool) -> List<&2, U32>:
  match supplementary:
    case False{}: code <> tail
    case True{}:
      (55296 + ((code - 65536 : U32) / 1024 : U32) : U32) <>
        (56320 + ((code - 65536 : U32) % 1024 : U32) : U32) <> tail

def string_units(value: String) -> List<&2, U32>:
  match value:
    case SNil{}: []
    case SCon{character, tail}:
      +code = Char.to_u32(character)
      utf16_unit(code, string_units(tail), U32.is_gt(code, 65535))

def units_le(left: List<&2, U32>, right: List<&2, U32>) -> Bool:
  match left right:
    case Nil{} _: True{}
    case Con{_, _} Nil{}: False{}
    case Con{+a, tail_a} Con{+b, tail_b}:
      Bool.or(U32.is_lt(a, b), Bool.and(U32.is_eq(a, b), units_le(tail_a, tail_b)))

def string_le(left: String, right: String) -> Bool:
  units_le(string_units(left), string_units(right))
