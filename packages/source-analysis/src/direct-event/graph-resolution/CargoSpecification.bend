import Base
import ./Types.bend as T

# Independent Cargo target specification, derived from rust-module-context.ts.
# The TOML engine supplies syntax only. Pure path algebra is a mechanical
# parameter; no production Cargo/Core/Rust policy enters this import closure.
type Record is Data:
  Record{fields: List<&2, T.OrderedField<T.TomlValue>>}

type Binary is Data:
  Binary{path: String, name: String}

def object(value: T.TomlValue) -> Maybe<&2, Record>:
  match value:
    case T.TomlRecord{fields}: Some{Record{fields}}
    case T.TomlDate{_}: Some{Record{[]}}
    case _: None{}

def choose_field(found: Bool, value: T.TomlValue,
    rest: Maybe<&2, T.TomlValue>) -> Maybe<&2, T.TomlValue>:
  match found:
    case True{}: Some{value}
    case False{}: rest

def lookup(fields: List<&2, T.OrderedField<T.TomlValue>>, +key: String) -> Maybe<&2, T.TomlValue>:
  match fields:
    case []: None{}
    case T.OrderedField{name, value} <> tail:
      choose_field(String.eq(name, key), value, lookup(tail, key))

def get(record: Record, key: String) -> Maybe<&2, T.TomlValue>:
  match record:
    case Record{fields}: lookup(fields, key)

def absent(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case None{}: True{}
    case Some{_}: False{}

def record_field(value: Maybe<&2, T.TomlValue>) -> Maybe<&2, Record>:
  match value:
    case None{}: None{}
    case Some{value}: object(value)

def nonempty(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case Some{T.TomlString{value}}: Bool.not(String.is_empty(value))
    case _: False{}

def edition(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case Some{T.TomlString{"2018"}}: True{}
    case Some{T.TomlString{"2021"}}: True{}
    case Some{T.TomlString{"2024"}}: True{}
    case _: False{}

def optional_boolean(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case None{}: True{}
    case Some{T.TomlBool{_}}: True{}
    case _: False{}

def false_or_absent(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case None{}: True{}
    case Some{T.TomlBool{False{}}}: True{}
    case _: False{}

def enabled(value: Maybe<&2, T.TomlValue>) -> Bool:
  match value:
    case Some{T.TomlBool{False{}}}: False{}
    case _: True{}

def package_valid(+pkg: Record) -> Bool:
  Bool.and(nonempty(get(pkg, "name")),
    Bool.and(edition(get(pkg, "edition")),
      Bool.and(false_or_absent(get(pkg, "build")),
        Bool.and(optional_boolean(get(pkg, "autolib")), optional_boolean(get(pkg, "autobins"))))))

def within(~absolute: String -> Bool, +path: String, +separator: String) -> Bool:
  Bool.and(Bool.not(String.eq(path, "..")),
    Bool.and(Bool.not(String.starts_with(path, ".." ++ separator)), Bool.not(absolute(path))))

def excluded_directory(+selected: String, +directory: String, separator: String) -> Bool:
  Bool.or(String.eq(selected, directory), String.starts_with(selected, directory ++ separator))

def selection_valid(+manifest: Record, +selected: String, +separator: String) -> Bool:
  Bool.and(absent(get(manifest, "test")),
    Bool.and(absent(get(manifest, "example")),
      Bool.and(absent(get(manifest, "bench")),
        Bool.not(Bool.or(String.eq(selected, "build.rs"),
          Bool.or(excluded_directory(selected, "tests", separator),
            Bool.or(excluded_directory(selected, "examples", separator),
              excluded_directory(selected, "benches", separator))))))))

def target_text(~absolute: String -> Bool, value: Maybe<&2, T.TomlValue>) -> Maybe<&2, String>:
  match value:
    case Some{T.TomlString{+path}}:
      Bool.pick(Maybe<&2, String>,
        Bool.and(Bool.not(String.is_empty(path)), Bool.not(absolute(path))), Some{path}, None{})
    case _: None{}

def library_path(~absolute: String -> Bool, value: Maybe<&2, T.TomlValue>) -> Maybe<&2, String>:
  match value:
    case None{}: Some{"src/lib.rs"}
    case _: target_text(~absolute, value)

def singleton(value: Maybe<&2, String>) -> Maybe<&2, List<&2, String>>:
  match value:
    case None{}: None{}
    case Some{path}: Some{[path]}

def explicit_library(
  ~absolute: String -> Bool,
  record: Maybe<&2, Record>
) -> Maybe<&2, List<&2, String>>:
  match record:
    case None{}: None{}
    case Some{+lib}: Bool.pick(Maybe<&2, List<&2, String>>,
      absent(get(lib, "edition")), singleton(library_path(~absolute, get(lib, "path"))), None{})

def libraries(
  ~absolute: String -> Bool,
  value: Maybe<&2, T.TomlValue>,
  pkg: Record
) -> Maybe<&2, List<&2, String>>:
  match value:
    case None{}: Some{Bool.pick(List<&2, String>, enabled(get(pkg, "autolib")), ["src/lib.rs"], [])}
    case Some{value}: explicit_library(~absolute, object(value))

def member(items: List<&2, String>, +key: String) -> Bool:
  match items:
    case []: False{}
    case head <> tail: Bool.or(String.eq(head, key), member(tail, key))

def bin_name(value: Maybe<&2, T.TomlValue>, +names: List<&2, String>) -> Maybe<&2, String>:
  match value:
    case Some{T.TomlString{+name}}: Bool.pick(Maybe<&2, String>,
      Bool.and(Bool.not(String.is_empty(name)), Bool.not(member(names, name))), Some{name}, None{})
    case _: None{}

def binary_fields(
  ~absolute: String -> Bool,
  record: Maybe<&2, Record>,
  names: List<&2, String>
) -> Maybe<&2, Binary>:
  match record:
    case None{}: None{}
    case Some{+bin}:
      do Maybe<&2, Binary>:
        path : String <- target_text(~absolute, get(bin, "path"))
        name : String <- bin_name(get(bin, "name"), names)
        _ : Unit <- Bool.pick(Maybe<&2, Unit>, absent(get(bin, "edition")), Some{Unit{}}, None{})
        return Binary{path, name}

def prepend(path: String, rest: Maybe<&2, List<&2, String>>) -> Maybe<&2, List<&2, String>>:
  match rest:
    case None{}: None{}
    case Some{rest}: Some{path <> rest}

def continue_bin(pair: Maybe<&2, Binary>,
    rest: String -> Maybe<&2, List<&2, String>>) -> Maybe<&2, List<&2, String>>:
  match pair:
    case None{}: None{}
    case Some{Binary{path, name}}: prepend(path, rest(name))

def explicit_bins(
  ~absolute: String -> Bool,
  items: List<&2, T.TomlValue>,
  +names: List<&2, String>
) -> Maybe<&2, List<&2, String>>:
  match items:
    case []: Some{[]}
    case value <> tail:
      continue_bin(binary_fields(~absolute, object(value), names),
        name => explicit_bins(~absolute, tail, name <> names))

def binaries(
  ~absolute: String -> Bool,
  value: Maybe<&2, T.TomlValue>,
  limit: Nat
) -> Maybe<&2, List<&2, String>>:
  match value:
    case None{}: Some{[]}
    case Some{T.TomlArray{+items}}: Bool.pick(
      Maybe<&2, List<&2, String>>,
      Nat.is_le(List.length(&2, T.TomlValue, items), limit),
      explicit_bins(~absolute, items, []),
      None{}
    )
    case _: None{}

# Relative target selection keeps library, automatic and explicit ordering.
# Absolute joined paths, selected automatic-bin candidate, normalization,
# repository containment and .rs extension are evaluated by the Rust driver.
def package_targets(~absolute: String -> Bool, pkg: Maybe<&2, Record>, +manifest: Record,
    selected: String, separator: String, limit: Nat) -> Maybe<&2, T.CargoPlan>:
  match pkg:
    case None{}: None{}
    case Some{+pkg}:
      do Maybe<&2, T.CargoPlan>:
        _ : Unit <- Bool.pick(
          Maybe<&2, Unit>,
          Bool.and(package_valid(pkg), selection_valid(manifest, selected, separator)),
          Some{Unit{}},
          None{}
        )
        +lib : List<&2, String> <- libraries(~absolute, get(manifest, "lib"), pkg)
        bins : List<&2, String> <- binaries(~absolute, get(manifest, "bin"), limit)
        +automatic : Bool = Bool.and(enabled(get(pkg, "autobins")), absent(get(manifest, "bin")))
        return T.CargoPlan{
          List.append(
            &2,
            String,
            lib,
            List.append(
              &2,
              String,
              Bool.pick(List<&2, String>, automatic, ["src/main.rs"], []),
              bins
            )
          ),
          automatic,
          (List.length(&2, String, lib) + 1n : Nat)
        }

def targets(~absolute: String -> Bool, manifest: Maybe<&2, Record>, selected: String,
    separator: String, limit: Nat) -> Maybe<&2, T.CargoPlan>:
  match manifest:
    case None{}: None{}
    case Some{+manifest}: package_targets(
      ~absolute,
      record_field(get(manifest, "package")),
      manifest,
      selected,
      separator,
      limit
    )

def select(~absolute: String -> Bool, syntax: T.TomlValue, selected: String,
    separator: String, limit: Nat) -> Maybe<&2, T.CargoPlan>:
  targets(~absolute, object(syntax), selected, separator, limit)

def main() -> Unit:
  Unit{}

def first_component(text: String, +separator: String) -> String:
  match text:
    case SNil{}: ""
    case SCon{+head, +tail}: Bool.pick(
      String,
      String.starts_with(SCon{head, tail}, separator),
      "",
      SCon{head, first_component(tail, separator)}
    )

def automatic_candidate(~absolute: String -> Bool, ~join: List<&2, String> -> String,
    +base: String, +tail: String, +separator: String) -> List<&2, String>:
  +first = first_component(tail, separator)
  Bool.pick(
    List<&2, String>,
    Bool.and(within(~absolute, tail, separator), Bool.not(String.is_empty(tail))),
    [
      join(
        [
          base,
          "src/bin",
          Bool.pick(String, String.ends_with(first, ".rs"), first, join([first, "main.rs"]))
        ]
      )
    ],
    []
  )

def joined_targets(~join: List<&2, String> -> String, paths: List<&2, String>, +base: String,
    +index: Nat, +automatic_index: Nat, +extra: List<&2, String>) -> List<&2, String>:
  match paths:
    case []: []
    case path <> tail:
      join([base, path]) <> List.append(&2, String,
        Bool.pick(List<&2, String>, Nat.is_eq(index, automatic_index), extra, []),
        joined_targets(~join, tail, base, (index + 1n : Nat), automatic_index, extra))

def valid_roots(~absolute: String -> Bool, ~extension: String -> String,
    paths: List<&2, String>, +separator: String) -> Bool:
  match paths:
    case []: True{}
    case +path <> tail:
      Bool.and(
        within(~absolute, path, separator),
        Bool.and(
          String.eq(extension(path), ".rs"),
          valid_roots(~absolute, ~extension, tail, separator)
        )
      )

def accepted_roots(valid: Bool, roots: List<&2, String>) -> Maybe<&2, List<&2, String>>:
  match valid:
    case True{}: Some{roots}
    case False{}: None{}

def realize(
  ~absolute: String -> Bool,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  ~extension: String -> String,
  plan: Maybe<&2, T.CargoPlan>,
  +base: String,
  path: String,
  +separator: String
) -> Maybe<&2, List<&2, String>>:
  match plan:
    case None{}: None{}
    case Some{T.CargoPlan{raw, automatic, index}}:
      extra = Bool.pick(
        List<&2, String>,
        automatic,
        automatic_candidate(
          ~absolute,
          ~join,
          base,
          relative(join([base, "src/bin"]), path),
          separator
        ),
        []
      )
      +roots = joined_targets(~join, raw, base, 1n, index, extra)
      accepted_roots(valid_roots(~absolute, ~extension, roots, separator), roots)

# Complete cargoTargetRoots contract: raw roots in native order, before the
# driver's subsequent normalization/dedup/status scan. No filesystem policy
# is assumed in the path-algebra parameters.
def roots(~absolute: String -> Bool, ~dirname: String -> String,
    ~join: List<&2, String> -> String, ~relative: String -> String -> String,
    ~extension: String -> String, syntax: T.TomlValue, task_path: String,
    +selected_path: String, +separator: String, limit: Nat) -> Maybe<&2, List<&2, String>>:
  +base = dirname(task_path)
  realize(~absolute, ~join, ~relative, ~extension,
    select(~absolute, syntax, relative(base, selected_path), separator, limit),
    base, selected_path, separator)
