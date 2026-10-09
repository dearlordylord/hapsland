import Base
import ./Types.bend as T
import ./Core.bend as Materialize

type BinaryResult is Data:
  BinaryResult{path: String, names: Map<&2, Bool>}

# Cargo policy is pure. Path absoluteness, joins, relative spelling and file
# status are subsequently requested by Bend, never selected in the TOML binding.
def fields(value: Maybe<&2, T.TomlValue>) -> Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>:
  match value:
    case Some{T.TomlRecord{items}}: Some{items}
    case _: None{}

def field(items: List<&2, T.OrderedField<T.TomlValue>>, +key: String) -> Maybe<&2, T.TomlValue>:
  match items:
    case []: None{}
    case T.OrderedField{name, +value} <> tail:
      yes : Unit -> Maybe<&2, T.TomlValue> = _ => Some{value}
      no : Unit -> Maybe<&2, T.TomlValue> = _ => field(tail, key)
      Materialize.decide(Maybe<&2, T.TomlValue>, String.eq(name, key), yes, no)

def has(items: List<&2, T.OrderedField<T.TomlValue>>, key: String) -> Bool:
  Maybe.is_some(&2, T.TomlValue, field(items, key))

def nonempty_text(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case Some{T.TomlString{value}}: Bool.not(String.is_empty(value))
    case _: False{}

def text(value: Maybe<&2, T.TomlValue>, fallback: String) -> String:
  match value:
    case Some{T.TomlString{value}}: value
    case _: fallback

def edition(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case Some{T.TomlString{"2018"}}: True{}
    case Some{T.TomlString{"2021"}}: True{}
    case Some{T.TomlString{"2024"}}: True{}
    case _: False{}

def optional_bool(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case None{}: True{}
    case Some{T.TomlBool{_}}: True{}
    case _: False{}

def disabled(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case Some{T.TomlBool{False{}}}: True{}
    case _: False{}

def build_allowed(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case None{}: True{}
    case Some{T.TomlBool{False{}}}: True{}
    case _: False{}

def package_supported(+pkg: List<&2, T.OrderedField<T.TomlValue>>) -> Bool:
  Bool.and(
    nonempty_text(field(pkg, "name")),
    Bool.and(
      edition(field(pkg, "edition")),
      Bool.and(
        build_allowed(field(pkg, "build")),
        Bool.and(optional_bool(field(pkg, "autolib")), optional_bool(field(pkg, "autobins")))
      )
    )
  )

def excluded_selection(+selected: String, +separator: String) -> Bool:
  Bool.or(
    String.eq(selected, "build.rs"),
    Bool.or(
      Bool.or(
        String.eq(selected, "tests"),
        String.starts_with(selected, String.append("tests", separator))
      ),
      Bool.or(
        Bool.or(
          String.eq(selected, "examples"),
          String.starts_with(selected, String.append("examples", separator))
        ),
        Bool.or(
          String.eq(selected, "benches"),
          String.starts_with(selected, String.append("benches", separator))
        )
      )
    )
  )

def manifest_supported(
  +manifest: List<&2, T.OrderedField<T.TomlValue>>,
  selected: String,
  separator: String
) -> Bool:
  Bool.and(
    Bool.not(excluded_selection(selected, separator)),
    Bool.and(
      Bool.not(has(manifest, "test")),
      Bool.and(Bool.not(has(manifest, "example")), Bool.not(has(manifest, "bench")))
    )
  )

def optional_path(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case None{}: True{}
    case _: nonempty_text(value)

def library_fields(value: Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>,
    +pkg: List<&2, T.OrderedField<T.TomlValue>>) -> Maybe<&2, List<&2, String>>:
  match value:
    case None{}: Bool.pick(
      Maybe<&2, List<&2, String>>,
      disabled(field(pkg, "autolib")),
      Some{[]},
      Some{["src/lib.rs"]}
    )
    case Some{+lib}: Bool.pick(Maybe<&2, List<&2, String>>,
      Bool.and(Bool.not(has(lib, "edition")), optional_path(field(lib, "path"))),
      Some{[text(field(lib, "path"), "src/lib.rs")]}, None{})

def library(
  value: Maybe<&2, T.TomlValue>,
  pkg: List<&2, T.OrderedField<T.TomlValue>>
) -> Maybe<&2, List<&2, String>>:
  match value:
    case None{}: library_fields(None{}, pkg)
    case Some{T.TomlRecord{items}}: library_fields(Some{items}, pkg)
    case Some{T.TomlDate{_}}: library_fields(Some{[]}, pkg)
    case _: None{}

def map_result(result: Map<&2, Bool> & Bool) -> Bool:
  match result:
    case Tuple{_, flag}: flag

def map_flag(map: Map<&2, Bool>, key: String) -> Bool:
  map_result(Map.get(Bool, False{}, map, key))

def named_bin(value: T.TomlValue, +names: Map<&2, Bool>) -> Maybe<&2, BinaryResult>:
  match value:
    case T.TomlRecord{+items}:
      +name = text(field(items, "name"), "")
      yes : Unit -> Maybe<&2, BinaryResult> = _ => Some{
        BinaryResult{text(field(items, "path"), ""), Map.set(&2, Bool, names, name, True{})}}
      no : Unit -> Maybe<&2, BinaryResult> = _ => None{}
      Materialize.decide(Maybe<&2, BinaryResult>,
        Bool.and(nonempty_text(field(items, "path")), Bool.and(nonempty_text(field(items, "name")),
          Bool.and(Bool.not(has(items, "edition")), Bool.not(map_flag(names, name))))), yes, no)
    case _: None{}

def bin_result(result: BinaryResult,
    rest: Map<&2, Bool> -> Maybe<&2, List<&2, String>>) -> Maybe<&2, List<&2, String>>:
  match result:
    case BinaryResult{path, names}:
      append : List<&2, String> -> Maybe<&2, List<&2, String>> = paths => Some{path <> paths}
      Materialize.bind(List<&2, String>, List<&2, String>, rest(names), append)

def bin_paths(items: List<&2, T.TomlValue>, names: Map<&2, Bool>) -> Maybe<&2, List<&2, String>>:
  match items:
    case []: Some{[]}
    case head <> tail:
      rest : Map<&2, Bool> -> Maybe<&2, List<&2, String>> = names => bin_paths(tail, names)
      next : BinaryResult -> Maybe<&2, List<&2, String>> = result => bin_result(result, rest)
      Materialize.bind(BinaryResult, List<&2, String>, named_bin(head, names), next)

def binaries(value: Maybe<&2, T.TomlValue>, limit: Nat) -> Maybe<&2, List<&2, String>>:
  match value:
    case None{}: Some{[]}
    case Some{T.TomlArray{+items}}:
      yes : Unit -> Maybe<&2, List<&2, String>> = _ => bin_paths(items, MTip{})
      no : Unit -> Maybe<&2, List<&2, String>> = _ => None{}
      Materialize.decide(
        Maybe<&2, List<&2, String>>,
        Nat.is_le(List.length(&2, T.TomlValue, items), limit),
        yes,
        no
      )
    case _: None{}

def combined(library: Maybe<&2, List<&2, String>>, binaries: Maybe<&2, List<&2, String>>,
    +automatic: Bool) -> Maybe<&2, T.CargoPlan>:
  match library binaries:
    case Some{+libraries} Some{binaries}: Some{
      T.CargoPlan{
        List.append(
          &2,
          String,
          libraries,
          List.append(
            &2,
            String,
            Bool.pick(List<&2, String>, automatic, ["src/main.rs"], []),
            binaries
          )
        ),
        automatic,
        (List.length(&2, String, libraries) + 1n : Nat)
      }
    }
    case _ _: None{}

def selected_pkg(pkg: Maybe<&2, List<&2, T.OrderedField<T.TomlValue>>>,
    +manifest: List<&2, T.OrderedField<T.TomlValue>>, selected: String, separator: String,
    limit: Nat) -> Maybe<&2, T.CargoPlan>:
  match pkg:
    case None{}: None{}
    case Some{+pkg}:
      yes : Unit -> Maybe<&2, T.CargoPlan> = _ => combined(
        library(field(manifest, "lib"), pkg),
        binaries(field(manifest, "bin"), limit),
        Bool.and(Bool.not(disabled(field(pkg, "autobins"))), Bool.not(has(manifest, "bin")))
      )
      no : Unit -> Maybe<&2, T.CargoPlan> = _ => None{}
      Materialize.decide(
        Maybe<&2, T.CargoPlan>,
        Bool.and(package_supported(pkg), manifest_supported(manifest, selected, separator)),
        yes,
        no
      )

def select(
  manifest: T.TomlValue,
  selected: String,
  separator: String,
  limit: Nat
) -> Maybe<&2, T.CargoPlan>:
  match manifest:
    case T.TomlRecord{+items}: selected_pkg(
      fields(field(items, "package")),
      items,
      selected,
      separator,
      limit
    )
    case _: None{}

def word_char(+char: Char) -> Bool:
  Bool.or(Char.is_alpha(char), Bool.or(Char.is_digit(char), Char.is_eq(char, '_')))

def initial_word(text: String) -> Bool:
  match text:
    case SNil{}: False{}
    case SCon{head, _}: word_char(head)

def binding_word(+text: String, previous_word: Bool) -> Bool:
  Bool.and(
    Bool.not(previous_word),
    Bool.and(
      Bool.or(String.starts_with(text, "use"), String.starts_with(text, "mod")),
      Bool.not(initial_word(String.drop(text, 3n)))
    )
  )

def binding_scan(text: String, previous_word: Bool) -> Bool:
  match text:
    case SNil{}: False{}
    case SCon{+head, +tail}: Bool.or(
      binding_word(SCon{head, tail}, previous_word),
      binding_scan(tail, word_char(head))
    )

def needs_binding(+source: String) -> Bool:
  Bool.or(String.contains(source, "::"), binding_scan(source, False{}))

def main() -> Unit:
  Unit{}
