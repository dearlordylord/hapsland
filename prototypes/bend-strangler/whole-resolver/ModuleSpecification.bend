import Base
import ./Types.bend as T
import ./CargoSpecification.bend as Paths

# Independent semantic module continuation. Path functions are the shared
# total mechanical algebra; status/capture/engine choices remain in the driver.
type FollowPlan is Data:
  UnsupportedRoute{}
  MissingChild{}
  RootRole{role: T.RustContext}
  FindChild{choices: List<&2, String>, crate_path: String,
    modules: List<&2, T.OrderedField<String>>, depth: Nat}
type Chosen is Data:
  AmbiguousChild{}
  ReinspectRoot{route: T.RustRoute}
  PendingChild{task: T.RustTask}

def name_present(items: List<&2, String>, +name: String) -> Bool:
  match items:
    case []: False{}
    case head <> tail: Bool.or(String.eq(head, name), name_present(tail, name))

def map_present(items: List<&2, T.OrderedField<String>>, +name: String) -> Bool:
  match items:
    case []: False{}
    case T.OrderedField{key, _} <> tail: Bool.or(String.eq(key, name), map_present(tail, name))

def add_module(present: Bool, items: List<&2, T.OrderedField<String>>,
    name: String, path: String) -> List<&2, T.OrderedField<String>>:
  match present:
    case True{}: items
    case False{}: List.append(&2, T.OrderedField<String>, items, [T.OrderedField{name, path}])

def module_map(~join: List<&2, String> -> String, names: List<&2, String>,
    +base: String, +items: List<&2, T.OrderedField<String>>) -> List<&2, T.OrderedField<String>>:
  match names:
    case []: items
    case +name <> tail: module_map(~join, tail, base,
      add_module(map_present(items, name), items, name, join([base, name])))

def crate_map(~dirname: String -> String, ~join: List<&2, String> -> String,
    existing: Maybe<&2, List<&2, T.OrderedField<String>>>, crate_path: String,
    names: List<&2, String>) -> List<&2, T.OrderedField<String>>:
  match existing:
    case Some{items}: items
    case None{}: module_map(~join, names, dirname(crate_path), [])

def nonempty_relative(+path: String) -> String:
  Bool.pick(String, String.is_empty(path), ".", path)

def rebase(~relative: String -> String -> String, items: List<&2, T.OrderedField<String>>,
    +base: String) -> List<&2, T.OrderedField<String>>:
  match items:
    case []: []
    case T.OrderedField{key, path} <> tail:
      T.OrderedField{key, nonempty_relative(relative(base, path))} <> rebase(~relative, tail, base)

def role(~dirname: String -> String, ~relative: String -> String -> String,
    +path: String, crate_path: String, modules: List<&2, T.OrderedField<String>>) -> T.RustContext:
  +root = String.eq(path, crate_path)
  T.RustContext{Bool.pick(Maybe<&2, Bool>, root, Some{True{}}, None{}),
    Bool.pick(Maybe<&2, Bool>, root, None{}, Some{True{}}),
    Some{rebase(~relative, modules, dirname(path))}}

def module_directory(~dirname: String -> String, ~basename: String -> Maybe<&2, String> -> String,
    ~join: List<&2, String> -> String, +path: String, crate_path: String) -> String:
  Bool.pick(
    String,
    Bool.or(String.eq(path, crate_path), String.eq(basename(path, None{}), "mod.rs")),
    dirname(path),
    join([dirname(path), basename(path, Some{".rs"})])
  )

def child_name(~absolute: String -> Bool, +tail: String, +separator: String) -> Maybe<&2, String>:
  +first = Paths.first_component(tail, separator)
  Bool.pick(Maybe<&2, String>, Paths.within(~absolute, tail, separator),
    Some{Bool.pick(String, String.ends_with(first, ".rs"),
      String.take(first, (String.length(first) - 3n : Nat)), first)}, None{})

def child_plan(
  ~join: List<&2, String> -> String,
  name: Maybe<&2, String>,
  names: List<&2, String>,
  +base: String,
  crate_path: String,
  modules: List<&2, T.OrderedField<String>>,
  depth: Nat
) -> FollowPlan:
  match name:
    case None{}: MissingChild{}
    case Some{+name}: Bool.pick(
      FollowPlan,
      name_present(names, name),
      FindChild{
        [join([base, name ++ ".rs"]), join([base, name, "mod.rs"])],
        crate_path,
        modules,
        (depth + 1n : Nat)
      },
      MissingChild{}
    )

def inspected_route(
  ~absolute: String -> Bool,
  ~dirname: String -> String,
  ~basename: String -> Maybe<&2, String> -> String,
  ~join: List<&2, String> -> String,
  ~relative: String -> String -> String,
  route: T.RustRoute,
  +selected: String,
  names: List<&2, String>,
  +modules: List<&2, T.OrderedField<String>>,
  separator: String
) -> FollowPlan:
  match route:
    case T.RustRoute{+path, +crate_path, _, depth}:
      +base = module_directory(~dirname, ~basename, ~join, path, crate_path)
      Bool.pick(
        FollowPlan,
        String.eq(path, selected),
        RootRole{role(~dirname, ~relative, selected, crate_path, modules)},
        child_plan(
          ~join,
          child_name(~absolute, relative(base, selected), separator),
          names,
          base,
          crate_path,
          modules,
          depth
        )
      )

def inspected(~absolute: String -> Bool, ~dirname: String -> String,
    ~basename: String -> Maybe<&2, String> -> String, ~join: List<&2, String> -> String,
    ~relative: String -> String -> String, +route: T.RustRoute, selected: String,
    outcome: T.RustModulesOutcome, separator: String) -> FollowPlan:
  match route outcome:
    case _ T.RustModulesUnsupported{}: UnsupportedRoute{}
    case T.RustRoute{_, crate_path, existing, _} T.RustModulesInspected{+names}:
      inspected_route(~absolute, ~dirname, ~basename, ~join, ~relative, route, selected,
        names, crate_map(~dirname, ~join, existing, crate_path, names), separator)

def route_path(route: T.RustRoute) -> String:
  match route:
    case T.RustRoute{path, _, _, _}: path

def chosen_root(root: Bool, +route: T.RustRoute) -> Chosen:
  match root:
    case True{}: ReinspectRoot{route}
    case False{}: PendingChild{T.RustTask{route_path(route), Some{route}}}

def choose(choices: List<&2, String>, selected: String, crate_path: String,
    modules: List<&2, T.OrderedField<String>>, depth: Nat) -> Chosen:
  match choices:
    case +path <> []: chosen_root(
      String.eq(path, selected),
      T.RustRoute{path, crate_path, Some{modules}, depth}
    )
    case _: AmbiguousChild{}

def within_depth(route: T.RustRoute, cap: Nat) -> Bool:
  match route:
    case T.RustRoute{_, _, _, depth}: Nat.is_le(depth, cap)

def main() -> Unit:
  Unit{}
