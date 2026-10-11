import Base
import ../Types.bend as T
import ../../../../../source-artifacts/src/direct-event/value/Value.bend as V
import ./PreparationModel.bend as M
import ./RawText.bend as Raw
import ./Package.bend as P
import ./BuildContext.bend as Build

def append_string(items: List<&2, String>, value: String) -> List<&2, String>:
  List.append(&2, String, items, [value])

def has(+items: List<&2, String>, +value: String) -> Bool:
  match items:
    case []: False{}
    case head <> tail: Bool.or(String.eq(head, value), has(tail, value))

def add(+items: List<&2, String>, +value: String) -> List<&2, String>:
  Bool.pick(List<&2, String>, has(items, value), items, append_string(items, value))

def insert(+items: List<&2, String>, +value: String) -> List<&2, String>:
  match items:
    case []: [value]
    case +head <> tail:
      Bool.pick(List<&2, String>, Raw.string_le(value, head), value <> head <> tail, head <> insert(tail, value))

def sorted(items: List<&2, String>) -> List<&2, String>:
  match items:
    case []: []
    case head <> tail: insert(sorted(tail), head)

def captured(+items: List<&2, M.Captured>, +path: String) -> Maybe<&2, M.Captured>:
  match items:
    case []: None{}
    case +head <> tail:
      match head:
        case M.Captured{key, _, _}: Bool.pick(Maybe<&2, M.Captured>, String.eq(key, path), Some{head}, captured(tail, path))

def capture_present(value: Maybe<&2, M.Captured>) -> Bool:
  match value:
    case Some{_}: True{}
    case None{}: False{}

def uncaptured(items: List<&2, String>, +captures: List<&2, M.Captured>) -> Nat:
  match items:
    case []: 0n
    case path <> tail: Nat.add(Bool.pick(Nat, capture_present(captured(captures, path)), 0n, 1n), uncaptured(tail, captures))

def package_entry(+items: List<&2, M.PackageEntry>, +directory: String) -> Maybe<&2, M.PackageEntry>:
  match items:
    case []: None{}
    case +head <> tail:
      match head:
        case M.PackageEntry{key, _}: Bool.pick(Maybe<&2, M.PackageEntry>, String.eq(key, directory), Some{head}, package_entry(tail, directory))

def loaded(entry: Maybe<&2, M.PackageEntry>) -> Maybe<&2, M.LoadedPackage>:
  match entry:
    case None{}: None{}
    case Some{M.PackageEntry{_, value}}: value

def set_package(+items: List<&2, M.PackageEntry>, +directory: String, +loaded: Maybe<&2, M.LoadedPackage>) -> List<&2, M.PackageEntry>:
  match items:
    case []: [M.PackageEntry{directory, loaded}]
    case +head <> tail:
      match head:
        case M.PackageEntry{key, _}:
          Bool.pick(List<&2, M.PackageEntry>, String.eq(key, directory), M.PackageEntry{directory, loaded} <> tail, head <> set_package(tail, directory, loaded))

def identity(+runtime: M.Runtime, value: V.ProductValue) -> M.Runtime:
  M.with_identities(runtime, List.append(&2, V.ProductValue, M.identities(runtime), [value]))

def identity_text(runtime: M.Runtime, path: String, value: String) -> M.Runtime:
  identity(runtime, V.ProductArray{[V.ProductText{path}, V.ProductText{value}]})

def texts(items: List<&2, String>) -> List<&2, V.ProductValue>:
  match items:
    case []: []
    case head <> tail: V.ProductText{head} <> texts(tail)

def identity_inventory(runtime: M.Runtime, path: String, entries: List<&2, String>) -> M.Runtime:
  identity(runtime, V.ProductArray{[V.ProductText{path}, V.ProductArray{texts(entries)}]})

def snapshot_product(snapshot: Build.Snapshot) -> V.ProductValue:
  match snapshot:
    case Build.Snapshot{goos, goarch, tags}: V.ProductObject{[
      V.OrderedField{"goos", V.ProductText{goos}}, V.OrderedField{"goarch", V.ProductText{goarch}},
      V.OrderedField{"tags", V.ProductArray{texts(tags)}}]}

def can_charge(+runtime: M.Runtime) -> Bool:
  Nat.is_lt(Nat.add(M.work(runtime), 1n), M.work_limit(M.input(runtime)))

def charge(+runtime: M.Runtime) -> M.Runtime:
  M.with_work(runtime, Nat.add(M.work(runtime), 1n))

def reserve_allowed(+runtime: M.Runtime) -> Bool:
  Bool.and(Nat.is_lt(M.files_spent(runtime), M.files_limit(M.input(runtime))),
    Nat.is_le(Nat.add(M.read_bytes(runtime), M.source_limit(M.input(runtime))), M.read_limit(M.input(runtime))))

def adopt(+runtime: M.Runtime, +path: String, capture: T.CaptureToken, +bytes: Nat) -> M.Runtime:
  M.with_captures(M.with_dependencies(M.with_files_spent(M.with_read_bytes(runtime,
    Nat.add(M.read_bytes(runtime), bytes)), Nat.add(M.files_spent(runtime), 1n)), add(M.dependencies(runtime), path)),
    List.append(&2, M.Captured, M.captures(runtime), [M.Captured{path, capture, bytes}]))

def accepted_bytes(+runtime: M.Runtime, bytes: Nat) -> Bool:
  Bool.and(Nat.is_le(bytes, M.source_limit(M.input(runtime))), Nat.is_le(M.read_bytes(runtime), M.read_limit(M.input(runtime))))

def file_name(file: T.GoFileSyntax) -> String:
  match file:
    case T.GoFileSyntax{_, name, _, _, _, _, _, _, _, _, _, _, _}: name

def file_cgo(file: T.GoFileSyntax) -> Bool:
  match file:
    case T.GoFileSyntax{_, _, _, _, _, _, _, _, _, _, _, cgo, _}: cgo

def same_package(items: List<&2, T.GoFileSyntax>, +name: String) -> Bool:
  match items:
    case []: True{}
    case head <> tail: Bool.and(String.eq(file_name(head), name), same_package(tail, name))

def names(items: List<&2, T.GoFileSyntax>) -> Maybe<&2, String>:
  match items:
    case []: None{}
    case +head <> +tail: Bool.pick(Maybe<&2, String>, same_package(tail, file_name(head)), Some{file_name(head)}, None{})

def main() -> Unit:
  Unit{}

def aliases_text(items: List<&2, T.GoAlias>) -> List<&2, String>:
  match items:
    case []: []
    case T.GoAlias{_, text} <> tail: text <> aliases_text(tail)

def members_text(items: List<&2, T.GoConstantMember>) -> List<&2, String>:
  match items:
    case []: []
    case T.GoConstantMember{_, None{}, _} <> tail: members_text(tail)
    case T.GoConstantMember{_, Some{text}, _} <> tail: text <> members_text(tail)

def groups_text(items: List<&2, T.GoConstantFacts>) -> List<&2, String>:
  match items:
    case []: []
    case T.GoConstantFacts{_, _, members} <> tail: List.append(&2, String, members_text(members), groups_text(tail))

def rows_text(items: List<&2, T.GoSyntaxNode>) -> List<&2, String>:
  match items:
    case []: []
    case T.GoSyntaxNode{_, _, text, _, _, _, _} <> tail: text <> rows_text(tail)

def file_texts(items: List<&2, T.GoFileSyntax>) -> List<&2, String>:
  match items:
    case []: []
    case T.GoFileSyntax{_, _, _, _, _, _, aliases, groups, _, _, _, _, rows} <> tail:
      List.append(&2, String, aliases_text(aliases), List.append(&2, String, groups_text(groups), List.append(&2, String, rows_text(rows), file_texts(tail))))

def file_imports(file: T.GoFileSyntax) -> List<&2, T.GoImport>:
  match file:
    case T.GoFileSyntax{_, _, _, _, _, imports, _, _, _, _, _, _, _}: imports

def generated_line(+line: String) -> Bool:
  Bool.and(Nat.is_ge(String.length(line), 30n), Bool.and(String.starts_with(line, "// Code generated "), String.ends_with(line, " DO NOT EDIT.")))

def generated_scan(items: List<&2, Raw.Character>, +line: String) -> Bool:
  match items:
    case []: generated_line(line)
    case head <> tail:
      +code = Raw.code(head)
      +newline = Bool.or(Nat.is_eq(code, 10n), Bool.or(Nat.is_eq(code, 13n), Bool.or(Nat.is_eq(code, 8232n), Nat.is_eq(code, 8233n))))
      Bool.or(Bool.and(newline, generated_line(line)), generated_scan(tail, Bool.pick(String, newline, "", String.append(line, Raw.ascii(code)))))

def generated(source: Raw.Text) -> Bool:
  generated_scan(Raw.chars(source), "")

def optional_text(value: Maybe<&2, String>, fallback: String) -> String:
  match value:
    case None{}: fallback
    case Some{text}: text

def present_string(value: Maybe<&2, String>) -> Bool:
  match value:
    case None{}: False{}
    case Some{_}: True{}

def import_parts(items: List<&2, String>) -> Bool:
  match items:
    case []: True{}
    case +head <> tail:
      Bool.and(Bool.not(Bool.or(String.eq(head, ""), Bool.or(String.eq(head, "."), Bool.or(String.eq(head, ".."), Bool.or(String.eq(head, "vendor"), String.contains(head, "\\")))))), import_parts(tail))

def import_tail(+module: String, +path: String) -> Maybe<&2, String>:
  +tail = String.drop(path, Nat.add(String.length(module), 1n))
  Bool.pick(Maybe<&2, String>, String.eq(path, module), Some{""},
    Bool.pick(Maybe<&2, String>, Bool.and(String.starts_with(path, String.append(module, "/")), import_parts(String.split(tail, '/'))), Some{tail}, None{}))

def within_tail(+tail: String) -> Bool:
  Bool.not(Bool.or(String.eq(tail, ".."), String.starts_with(tail, "../")))

def package_known(entry: Maybe<&2, M.PackageEntry>) -> Bool:
  match entry:
    case None{}: False{}
    case Some{_}: True{}

def internal_bases(items: List<&2, String>, +prefix: String) -> List<&2, String>:
  match items:
    case []: []
    case +head <> tail:
      +base = Bool.pick(String, String.eq(prefix, ""), ".", prefix)
      +next = Bool.pick(String, String.eq(prefix, ""), head, String.append(prefix, String.append("/", head)))
      Bool.pick(List<&2, String>, String.eq(head, "internal"), base <> internal_bases(tail, next), internal_bases(tail, next))
