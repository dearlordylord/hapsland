import Base
import ./RawText.bend as Raw
import ./BuildContext.bend as Build

# Complete static go.mod grammar. Only raw scalar/whitespace observations enter.
type Module is Data:
  Module{line: List<&2, Raw.Character>, declarations: Nat, name: Maybe<&2, String>, valid: Bool}

def no_terminators(+items: List<&2, Raw.Character>) -> Bool:
  match items:
    case []: True{}
    case head <> tail:
      +code = Raw.code(head)
      Bool.and(
        Bool.not(
          Bool.or(
            Nat.is_eq(code, 10n),
            Bool.or(Nat.is_eq(code, 13n), Bool.or(Nat.is_eq(code, 8232n), Nat.is_eq(code, 8233n)))
          )
        ),
        no_terminators(tail)
      )

def strip_comment(+items: List<&2, Raw.Character>) -> List<&2, Raw.Character>:
  match items:
    case []: []
    case +head <> +tail:
      Bool.pick(
        List<&2, Raw.Character>,
        Bool.and(Raw.prefix(items, [47n, 47n]), no_terminators(tail)),
        [],
        head <> strip_comment(tail)
      )

def boundary(+items: List<&2, Raw.Character>) -> Bool:
  Bool.or(Raw.empty(items), Bool.not(Build.word(Raw.head_code(items))))

def keyword(+items: List<&2, Raw.Character>, +prefix: List<&2, Nat>) -> Bool:
  Bool.and(Raw.prefix(items, prefix), boundary(Raw.drop(items, List.length(&2, Nat, prefix))))

def module_char(+code: Nat) -> Bool:
  Bool.or(
    Build.word(code),
    Bool.or(
      Nat.is_eq(code, 126n),
      Bool.or(
        Nat.is_eq(code, 46n),
        Bool.or(Nat.is_eq(code, 43n), Bool.or(Nat.is_eq(code, 47n), Nat.is_eq(code, 45n)))
      )
    )
  )

def allowed_name(items: List<&2, Raw.Character>) -> Bool:
  match items:
    case []: True{}
    case head <> tail: Bool.and(module_char(Raw.code(head)), allowed_name(tail))

def segments(items: List<&2, String>) -> Bool:
  match items:
    case []: True{}
    case +head <> tail: Bool.and(
      Bool.not(Bool.or(String.eq(head, ""), Bool.or(String.eq(head, "."), String.eq(head, "..")))),
      segments(tail)
    )

def parsed_name(+valid: Bool, +value: String) -> Maybe<&2, String>:
  Bool.pick(
    Maybe<&2, String>,
    Bool.and(valid, segments(String.split(value, '/'))),
    Some{value},
    None{}
  )

def name_tail(+items: List<&2, Raw.Character>) -> Maybe<&2, String>:
  parsed_name(Bool.and(Bool.not(Raw.empty(items)), allowed_name(items)), Raw.ascii_text(items))

def name_spacing_checked(space: Bool, +items: List<&2, Raw.Character>) -> Maybe<&2, String>:
  match space:
    case False{}: None{}
    case True{}: name_tail(Raw.skip_space(items))

def name_spacing(+items: List<&2, Raw.Character>) -> Maybe<&2, String>:
  name_spacing_checked(Raw.head_space(items), items)

def line_parts(
  +line: List<&2, Raw.Character>,
  +count: Nat,
  +name: Maybe<&2, String>,
  +valid: Bool
) -> Module:
  +forbidden = Bool.or(
    keyword(line, [114n, 101n, 112n, 108n, 97n, 99n, 101n]),
    Bool.or(
      keyword(line, [117n, 115n, 101n]),
      keyword(line, [119n, 111n, 114n, 107n, 115n, 112n, 97n, 99n, 101n])
    )
  )
  +declaration = keyword(line, [109n, 111n, 100n, 117n, 108n, 101n])
  Module{
    [],
    Nat.add(count, Bool.pick(Nat, declaration, 1n, 0n)),
    Bool.pick(Maybe<&2, String>, declaration, name_spacing(Raw.drop(line, 6n)), name),
    Bool.and(valid, Bool.not(forbidden))
  }

def finish_line(state: Module) -> Module:
  match state:
    case Module{line, count, name, valid}: line_parts(
      Raw.trim(strip_comment(List.reverse(&2, Raw.Character, line))),
      count,
      name,
      valid
    )

def character(newline: Bool, head: Raw.Character, state: Module) -> Module:
  match newline state:
    case True{} +state: finish_line(state)
    case False{} Module{line, count, name, valid}: Module{head <> line, count, name, valid}

def scan(items: List<&2, Raw.Character>, state: Module) -> Module:
  match items:
    case []: finish_line(state)
    case +head <> tail: scan(tail, character(Nat.is_eq(Raw.code(head), 10n), head, state))

def module_result(block_comment: Bool, state: Module) -> Maybe<&2, String>:
  match block_comment state:
    case False{} Module{_, 1n, name, True{}}: name
    case _ _: None{}

def module_name(+source: Raw.Text) -> Maybe<&2, String>:
  module_result(
    String.contains(Raw.value(source), "/*"),
    scan(Raw.chars(source), Module{[], 0n, None{}, True{}})
  )

def main() -> Unit:
  Unit{}
