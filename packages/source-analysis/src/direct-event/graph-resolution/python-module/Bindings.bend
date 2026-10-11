import Base
import ../Types.bend as T
import ./Syntax.bend as X

def decide(-A: Data, condition: Bool, yes: Unit -> A, no: Unit -> A) -> A:
  match condition:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

type TargetWork is Data:
  TargetWork{pending: List<&2, Nat>, found: List<&2, String>}
type ScopeWork is Data:
  ScopeWork{pending: List<&2, Nat>, facts: List<&2, Binding>}
type Binding is Data:
  Binding{name: String, identity: Maybe<&2, String>}

def names_to_facts(names: List<&2, String>) -> List<&2, Binding>:
  match names:
    case []: []
    case name <> tail: Binding{name, None{}} <> names_to_facts(tail)

def prefix(+text: String) -> String:
  match text:
    case SNil{}: ""
    case SCon{head, tail}: decide(String, String.eq(SCon{head, SNil{}}, "."), _ => "", _ => SCon{head, prefix(tail)})

def target_step( +kind: String, +node: T.PythonSyntaxNode) -> List<&2, Nat>:
  decide(List<&2, Nat>, String.eq(kind, "attribute"), _ => (X.node_id_first(node)), _ => (decide(List<&2, Nat>, String.eq(kind, "subscript"), _ => (X.node_id_first(node)), _ => (X.node_children(node)

))))

def target_identifier(identifier: Bool, +node: T.PythonSyntaxNode, todo: List<&2, Nat>, found: List<&2, String>) -> TargetWork:
  match identifier:
    case True{}: TargetWork{todo, X.node_text(node) <> found}
    case False{}: TargetWork{List.append(&2, Nat, target_step(X.node_kind(node), node), todo), found}

def target_item(node: Maybe<&2, T.PythonSyntaxNode>, todo: List<&2, Nat>, found: List<&2, String>) -> TargetWork:
  match node:
    case None{}: TargetWork{todo, found}
    case Some{+node}: target_identifier(String.eq(X.node_kind(node), "identifier"), node, todo, found)

def target_todo(value: TargetWork) -> List<&2, Nat>:
  match value:
    case TargetWork{todo, _}: todo

def target_found(value: TargetWork) -> List<&2, String>:
  match value:
    case TargetWork{_, found}: found

def target_continue(value: TargetWork, proceed: List<&2, Nat> -> List<&2, String> -> List<&2, String>) -> List<&2, String>:
  match value:
    case TargetWork{todo, found}: proceed(todo, found)

def target_walk(fuel: Nat, todo: List<&2, Nat>, +syntax: T.PythonSyntax, found: List<&2, String>) -> List<&2, String>:
  match fuel todo:
    case _ Nil{}: List.reverse(&2, String, found)
    case 0n _: []
    case 1n++rest Con{id, tail}:
      target_continue(target_item(X.lookup(syntax, id), tail, found),
        pending => names => target_walk(rest, pending, syntax, names))

def target_names(+syntax: T.PythonSyntax, node: Maybe<&2, T.PythonSyntaxNode>) -> List<&2, String>:
  match node:
    case None{}: []
    case Some{node}: target_walk(X.fuel(syntax), X.node_id(node) <> [], syntax, [])

def maybe_fact(name: Maybe<&2, String>) -> List<&2, Binding>:
  match name:
    case None{}: []
    case Some{name}: Binding{name, None{}} <> []

def generic_kind( +kind: String, +node: T.PythonSyntaxNode, +syntax: T.PythonSyntax) -> Maybe<&2, String>:
  decide(Maybe<&2, String>, String.eq(kind, "generic_type"), _ => (X.text(X.first(X.node_children(node), syntax))), _ => (Some{X.node_text(node)}))

def generic_name(node: Maybe<&2, T.PythonSyntaxNode>, syntax: T.PythonSyntax) -> Maybe<&2, String>:
  match node:
    case None{}: None{}
    case Some{+node}: generic_kind(X.node_kind(node), node, syntax)

def unwrap_kind( +kind: String, +node: T.PythonSyntaxNode, +syntax: T.PythonSyntax) -> Maybe<&2, T.PythonSyntaxNode>:
  decide(Maybe<&2, T.PythonSyntaxNode>, String.eq(kind, "type"), _ => (X.first(X.node_children(node), syntax)), _ => (Some{node}))

def unwrap_type(node: Maybe<&2, T.PythonSyntaxNode>, syntax: T.PythonSyntax) -> Maybe<&2, T.PythonSyntaxNode>:
  match node:
    case None{}: None{}
    case Some{+node}: unwrap_kind(X.node_kind(node), node, syntax)

def definition_kind( +kind: String, +node: T.PythonSyntaxNode, +syntax: T.PythonSyntax) -> Maybe<&2, String>:
  decide(Maybe<&2, String>, String.eq(kind, "type_alias_statement"), _ => (generic_name(unwrap_type(X.field(syntax, node, "left"), syntax), syntax)), _ => (X.text(X.field(syntax, node, "name"))))

def definition_name(+node: T.PythonSyntaxNode, syntax: T.PythonSyntax) -> Maybe<&2, String>:
  definition_kind(X.node_kind(node), node, syntax)

def identity(module: Maybe<&2, String>, target: String) -> String:
  match module:
    case None{}: target
    case Some{text}: String.append(text, String.append(".", target))

def import_fact(target: Maybe<&2, String>, name: Maybe<&2, String>, module: Maybe<&2, String>, static: Bool) -> List<&2, Binding>:
  match target name:
    case Some{+target} Some{+name}:
      decide(List<&2, Binding>, Bool.or(String.eq(target, ""), String.eq(name, "")), _ => [], _ => Binding{name, decide(Maybe<&2, String>, static, _ => Some{identity(module, target)}, _ => None{})} <> [])
    case _ _: []

def imported_kind( +kind: String, +part: T.PythonSyntaxNode, +syntax: T.PythonSyntax, +module: Maybe<&2, String>, +static: Bool) -> List<&2, Binding>:
  decide(List<&2, Binding>, String.eq(kind, "wildcard_import"), _ => ([]), _ => (decide(List<&2, Binding>, String.eq(kind, "aliased_import"), _ => (import_fact(X.text(X.field(syntax, part, "name")), X.text(X.field(syntax, part, "alias")), module, static)), _ => (import_fact(Some{X.node_text(part)}, Some{prefix(X.node_text(part))}, module, static)))))

def imported(+part: T.PythonSyntaxNode, syntax: T.PythonSyntax, module: Maybe<&2, String>, static: Bool) -> List<&2, Binding>:
  imported_kind(X.node_kind(part), part, syntax, module, static)

def module_part(module: Maybe<&2, String>, +part: T.PythonSyntaxNode) -> Bool:
  match module:
    case None{}: False{}
    case Some{text}: String.eq(text, X.node_text(part))

def imported_node(node: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax, +module: Maybe<&2, String>, static: Bool) -> List<&2, Binding>:
  match node:
    case None{}: []
    case Some{+node}: decide(List<&2, Binding>, module_part(module, node), _ => [], _ => imported(node, syntax, module, static))

def import_parts(ids: List<&2, Nat>, +syntax: T.PythonSyntax, +module: Maybe<&2, String>, +static: Bool) -> List<&2, Binding>:
  match ids:
    case []: []
    case id <> tail: List.append(&2, Binding, imported_node(X.lookup(syntax, id), syntax, module, static), import_parts(tail, syntax, module, static))

def pattern_alias(alias: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax, +node: T.PythonSyntaxNode) -> Maybe<&2, T.PythonSyntaxNode>:
  match alias:
    case Some{value}: Some{value}
    case None{}: decide(Maybe<&2, T.PythonSyntaxNode>, String.eq(X.kind(X.parent(syntax, node)), "case_pattern"), _ => X.field_node(X.last(X.node_children(node)), syntax), _ => None{})

def capture_children(ids: List<&2, Nat>, syntax: T.PythonSyntax) -> List<&2, Binding>:
  match ids:
    case id <> []: maybe_fact(X.text(X.lookup(syntax, id)))
    case _: []

def capture_kind( +kind: String, +node: T.PythonSyntaxNode, +syntax: T.PythonSyntax) -> List<&2, Binding>:
  decide(List<&2, Binding>, String.eq(kind, "dotted_name"), _ => (capture_children(X.node_children(node), syntax)), _ => ([]))

def capture_pattern(node: Maybe<&2, T.PythonSyntaxNode>, syntax: T.PythonSyntax) -> List<&2, Binding>:
  match node:
    case None{}: []
    case Some{+node}: capture_kind(X.node_kind(node), node, syntax)

def case_names(ids: List<&2, Nat>, +syntax: T.PythonSyntax) -> List<&2, Binding>:
  match ids:
    case id <> []: capture_pattern(X.lookup(syntax, id), syntax)
    case _: []

def binding_for( +kind: String, +node: T.PythonSyntaxNode, +syntax: T.PythonSyntax, +static: Bool) -> List<&2, Binding>:
  decide(List<&2, Binding>, String.eq(kind, "import_statement"), _ => (import_parts(X.node_children(node), syntax, X.text(X.field(syntax, node, "module_name")),
      Bool.or(static, String.eq(X.kind(X.parent(syntax, node)), "module")))), _ => (decide(List<&2, Binding>, String.eq(kind, "import_from_statement"), _ => (import_parts(X.node_children(node), syntax, X.text(X.field(syntax, node, "module_name")),
      Bool.or(static, String.eq(X.kind(X.parent(syntax, node)), "module")))), _ => (decide(List<&2, Binding>, String.eq(kind, "class_definition"), _ => (maybe_fact(definition_name(node, syntax))), _ => (decide(List<&2, Binding>, String.eq(kind, "function_definition"), _ => (maybe_fact(definition_name(node, syntax))), _ => (decide(List<&2, Binding>, String.eq(kind, "type_alias_statement"), _ => (maybe_fact(definition_name(node, syntax))), _ => (decide(List<&2, Binding>, String.eq(kind, "for_statement"), _ => (names_to_facts(target_names(syntax, X.field(syntax, node, "left")))), _ => (decide(List<&2, Binding>, String.eq(kind, "as_pattern"), _ => (names_to_facts(target_names(syntax, pattern_alias(X.field(syntax, node, "alias"), syntax, node)))), _ => (decide(List<&2, Binding>, String.eq(kind, "splat_pattern"), _ => (names_to_facts(target_walk(X.fuel(syntax), X.node_children(node), syntax, []))), _ => (decide(List<&2, Binding>, String.eq(kind, "case_pattern"), _ => (case_names(X.node_children(node), syntax)), _ => (decide(List<&2, Binding>, String.eq(kind, "assignment"), _ => (names_to_facts(target_names(syntax, X.field(syntax, node, "left")))), _ => (decide(List<&2, Binding>, String.eq(kind, "augmented_assignment"), _ => (names_to_facts(target_names(syntax, X.field(syntax, node, "left")))), _ => (decide(List<&2, Binding>, String.eq(kind, "named_expression"), _ => (names_to_facts(target_names(syntax, X.field(syntax, node, "name")))), _ => (decide(List<&2, Binding>, String.eq(kind, "delete_statement"), _ => (names_to_facts(target_walk(X.fuel(syntax), X.node_children(node), syntax, []))), _ => ([]))))))))))))))))))))))))))

def without_blocks(ids: List<&2, Nat>, +syntax: T.PythonSyntax) -> List<&2, Nat>:
  match ids:
    case []: []
    case +id <> +tail: decide(List<&2, Nat>, String.eq(X.kind(X.lookup(syntax, id)), "block"), _ => without_blocks(tail, syntax), _ => id <> without_blocks(tail, syntax))

def scoped_children( +kind: String, +node: T.PythonSyntaxNode, +syntax: T.PythonSyntax) -> List<&2, Nat>:
  decide(List<&2, Nat>, String.eq(kind, "lambda"), _ => (X.children(X.field(syntax, node, "parameters"))), _ => (decide(List<&2, Nat>, String.eq(kind, "class_definition"), _ => (without_blocks(X.node_children(node), syntax)), _ => (decide(List<&2, Nat>, String.eq(kind, "function_definition"), _ => (without_blocks(X.node_children(node), syntax)), _ => (X.node_children(node)))))))

def scoped_fact( +kind: String, +node: T.PythonSyntaxNode, +syntax: T.PythonSyntax, +static: Bool) -> List<&2, Binding>:
  decide(List<&2, Binding>, String.eq(kind, "lambda"), _ => ([]), _ => (binding_for(kind, node, syntax, static)))

def scope_item(node: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax, static: Bool) -> ScopeWork:
  match node:
    case None{}: ScopeWork{[], []}
    case Some{+node}: ScopeWork{scoped_children(X.node_kind(node), node, syntax), scoped_fact(X.node_kind(node), node, syntax, static)}

def scope_todo(value: ScopeWork) -> List<&2, Nat>:
  match value:
    case ScopeWork{todo, _}: todo

def scope_facts(value: ScopeWork) -> List<&2, Binding>:
  match value:
    case ScopeWork{_, facts}: facts

def scope_continue(value: ScopeWork, proceed: List<&2, Nat> -> List<&2, Binding> -> List<&2, Binding>) -> List<&2, Binding>:
  match value:
    case ScopeWork{todo, facts}: proceed(todo, facts)

def scope_walk(fuel: Nat, todo: List<&2, Nat>, +syntax: T.PythonSyntax, +static: Bool, facts: List<&2, Binding>) -> List<&2, Binding>:
  match fuel todo:
    case _ Nil{}: facts
    case 0n _: []
    case 1n++rest Con{id, tail}:
      scope_continue(scope_item(X.lookup(syntax, id), syntax, static),
        pending => added => scope_walk(rest, List.append(&2, Nat, pending, tail), syntax, static,
          List.append(&2, Binding, facts, added)))

def scope_bindings(+syntax: T.PythonSyntax, id: Nat, static: Bool) -> List<&2, Binding>:
  scope_walk(X.fuel(syntax), id <> [], syntax, static, [])

def name(fact: Binding) -> String:
  match fact:
    case Binding{name, _}: name

def count(facts: List<&2, Binding>, +key: String) -> Nat:
  match facts:
    case []: 0n
    case Binding{name, _} <> tail: Nat.add(decide(Nat, String.eq(name, key), _ => 1n, _ => 0n), count(tail, key))

def unique(facts: List<&2, Binding>, +all: List<&2, Binding>) -> List<&2, Binding>:
  match facts:
    case []: []
    case +fact <> +tail: decide(List<&2, Binding>, Nat.is_eq(count(all, name(fact)), 1n), _ => fact <> unique(tail, all), _ => unique(tail, all))

def imported_facts(facts: List<&2, Binding>) -> List<&2, Binding>:
  match facts:
    case []: []
    case Binding{_, None{}} <> tail: imported_facts(tail)
    case Binding{name, Some{identity}} <> tail: Binding{name, Some{identity}} <> imported_facts(tail)

def identities(+facts: List<&2, Binding>) -> List<&2, Binding>:
  imported_facts(unique(facts, facts))

def imported_identity(facts: List<&2, Binding>, +key: String) -> Maybe<&2, String>:
  match facts:
    case []: None{}
    case Binding{name, identity} <> tail: decide(Maybe<&2, String>, String.eq(name, key), _ => identity, _ => imported_identity(tail, key))

def main() -> Unit:
  Unit{}
