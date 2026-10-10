import Base
import ../Types.bend as T
import ./Syntax.bend as X
import ./Bindings.bend as B
import ./Scope.bend as S

type Frame is Data:
  Frame{id: Nat, bindings: List<&2, B.Binding>, shadowed: List<&2, String>}
type UnknownStep is Data:
  Refused{}
  Continue{frames: List<&2, Frame>}

def text(value: Maybe<&2, String>) -> String:
  match value:
    case None{}: ""
    case Some{text}: text

def names(facts: List<&2, B.Binding>) -> List<&2, String>:
  match facts:
    case []: []
    case B.Binding{name, _} <> tail: name <> names(tail)

def contains(values: List<&2, String>, +key: String) -> Bool:
  match values:
    case []: False{}
    case value <> tail: Bool.or(String.eq(value, key), contains(tail, key))

def scope_bindings(scope: S.Scope) -> List<&2, B.Binding>:
  match scope:
    case S.Scope{_, bindings, _}: bindings

def scope_facts(scope: S.Scope) -> List<&2, B.Binding>:
  match scope:
    case S.Scope{facts, _, _}: facts

def scope_statics(scope: S.Scope) -> List<&2, Nat>:
  match scope:
    case S.Scope{_, _, statics}: statics

def declarative_call(+name: String) -> Bool:
  contains("dataclasses.dataclass" <> "dataclasses.field" <> "pydantic.Field" <> "pydantic.ConfigDict" <>
    "pydantic.field_validator" <> "pydantic.model_validator" <> "pydantic.validator" <> "pydantic.root_validator" <>
    "typing.NewType" <> "typing_extensions.NewType" <> [], name)

def decorator_marker(decorator: Bool, +node: T.PythonSyntaxNode, syntax: T.PythonSyntax) -> Maybe<&2, T.PythonSyntaxNode>:
  match decorator:
    case False{}: Some{node}
    case True{}: X.first_child(syntax, node)

def call_name(marker: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax) -> String:
  match marker:
    case None{}: ""
    case Some{+node}: B.decide(String, String.eq(X.node_kind(node), "call"),
      _ => text(X.text(X.field(syntax, node, "function"))), _ => X.node_text(node))

def unknown_name(+name: String, decorator: Bool, bindings: List<&2, B.Binding>, shadowed: List<&2, String>) -> Bool:
  Bool.not(Bool.or(Bool.and(decorator, Bool.and(Bool.not(contains(shadowed, name)),
    contains("classmethod" <> "staticmethod" <> "property" <> [], name))),
    declarative_call(text(S.identity_for(name, bindings)))))

def metaclass_node(node: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax) -> Bool:
  match node:
    case None{}: False{}
    case Some{+node}: Bool.and(String.eq(X.node_kind(node), "keyword_argument"),
      String.eq(text(X.text(X.field(syntax, node, "name"))), "metaclass"))

def metaclass(ids: List<&2, Nat>, +syntax: T.PythonSyntax) -> Bool:
  match ids:
    case []: False{}
    case id <> tail: Bool.or(metaclass_node(X.lookup(syntax, id), syntax), metaclass(tail, syntax))

def node_unknown(+node: T.PythonSyntaxNode, +syntax: T.PythonSyntax,
    bindings: List<&2, B.Binding>, shadowed: List<&2, String>) -> Bool:
  B.decide(Bool, Bool.and(String.eq(X.node_kind(node), "class_definition"),
    metaclass(X.children(X.field(syntax, node, "superclasses")), syntax)), _ => True{},
    _ => B.decide(Bool, Bool.or(String.eq(X.node_kind(node), "call"), String.eq(X.node_kind(node), "decorator")),
      _ => unknown_name(call_name(decorator_marker(String.eq(X.node_kind(node), "decorator"), node, syntax), syntax),
        String.eq(X.node_kind(node), "decorator"), bindings, shadowed), _ => False{}))

def class_facts(ids: List<&2, Nat>, +syntax: T.PythonSyntax) -> List<&2, B.Binding>:
  match ids:
    case []: []
    case id <> tail: List.append(&2, B.Binding, B.scope_bindings(syntax, id, False{}), class_facts(tail, syntax))

def unshadowed(bindings: List<&2, B.Binding>, +locals: List<&2, String>) -> List<&2, B.Binding>:
  match bindings:
    case []: []
    case +binding <> +tail: B.decide(List<&2, B.Binding>, contains(locals, B.name(binding)),
      _ => unshadowed(tail, locals), _ => binding <> unshadowed(tail, locals))

def class_frame(+id: Nat, +bindings: List<&2, B.Binding>, shadowed: List<&2, String>, +locals: List<&2, String>) -> Frame:
  Frame{id, unshadowed(bindings, locals), List.append(&2, String, shadowed, locals)}

def same_node(node: Maybe<&2, T.PythonSyntaxNode>, id: Nat) -> Bool:
  match node:
    case None{}: False{}
    case Some{node}: Nat.is_eq(X.node_id(node), id)

def excluded_child(+parent: T.PythonSyntaxNode, +child: T.PythonSyntaxNode, syntax: T.PythonSyntax) -> Bool:
  Bool.or(Bool.and(String.eq(X.node_kind(parent), "function_definition"), String.eq(X.node_kind(child), "block")),
    Bool.and(String.eq(X.node_kind(parent), "lambda"), same_node(X.field(syntax, parent, "body"), X.node_id(child))))

def child_frame(node: Maybe<&2, T.PythonSyntaxNode>, +parent: T.PythonSyntaxNode, +syntax: T.PythonSyntax,
    +bindings: List<&2, B.Binding>, +shadowed: List<&2, String>) -> List<&2, Frame>:
  match node:
    case None{}: []
    case Some{+node}: B.decide(List<&2, Frame>, excluded_child(parent, node, syntax), _ => [],
      _ => B.decide(List<&2, Frame>, Bool.and(String.eq(X.node_kind(parent), "class_definition"), String.eq(X.node_kind(node), "block")),
        _ => class_frame(X.node_id(node), bindings, shadowed, names(class_facts(X.node_children(node), syntax))) <> [],
        _ => Frame{X.node_id(node), bindings, shadowed} <> []))

def child_frames(ids: List<&2, Nat>, +parent: T.PythonSyntaxNode, +syntax: T.PythonSyntax,
    +bindings: List<&2, B.Binding>, +shadowed: List<&2, String>) -> List<&2, Frame>:
  match ids:
    case []: []
    case id <> tail: List.append(&2, Frame, child_frame(X.lookup(syntax, id), parent, syntax, bindings, shadowed),
      child_frames(tail, parent, syntax, bindings, shadowed))

def unknown_node(node: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax,
    +bindings: List<&2, B.Binding>, +shadowed: List<&2, String>) -> UnknownStep:
  match node:
    case None{}: Refused{}
    case Some{+node}: B.decide(UnknownStep, node_unknown(node, syntax, bindings, shadowed),
      _ => Refused{}, _ => Continue{child_frames(X.node_children(node), node, syntax, bindings, shadowed)})

def unknown_item(frame: Frame, +syntax: T.PythonSyntax) -> UnknownStep:
  match frame:
    case Frame{id, +bindings, +shadowed}: unknown_node(X.lookup(syntax, id), syntax, bindings, shadowed)

def unknown_continue(step: UnknownStep, proceed: List<&2, Frame> -> Bool) -> Bool:
  match step:
    case Refused{}: True{}
    case Continue{frames}: proceed(frames)

def unknown_walk(fuel: Nat, todo: List<&2, Frame>, +syntax: T.PythonSyntax) -> Bool:
  match fuel todo:
    case _ Nil{}: False{}
    case 0n _: True{}
    case 1n++rest Con{frame, tail}: unknown_continue(unknown_item(frame, syntax),
      frames => unknown_walk(rest, List.append(&2, Frame, frames, tail), syntax))

def unknown_evaluated(+syntax: T.PythonSyntax, +scope: S.Scope) -> Bool:
  unknown_walk(X.fuel(syntax), Frame{X.root(syntax), scope_bindings(scope), names(scope_facts(scope))} <> [], syntax)

def evaluated_excluded(child: Maybe<&2, T.PythonSyntaxNode>, parent: T.PythonSyntaxNode, syntax: T.PythonSyntax) -> Bool:
  match child:
    case None{}: True{}
    case Some{child}: excluded_child(parent, child, syntax)

def evaluated_children(ids: List<&2, Nat>, +parent: T.PythonSyntaxNode, +syntax: T.PythonSyntax) -> List<&2, Nat>:
  match ids:
    case []: []
    case +id <> +tail: B.decide(List<&2, Nat>, evaluated_excluded(X.lookup(syntax, id), parent, syntax),
      _ => evaluated_children(tail, parent, syntax), _ => id <> evaluated_children(tail, parent, syntax))

def evaluated_item(node: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax) -> List<&2, Nat>:
  match node:
    case None{}: []
    case Some{+node}: evaluated_children(X.node_children(node), node, syntax)

def evaluated_walk(fuel: Nat, todo: List<&2, Nat>, +syntax: T.PythonSyntax, found: List<&2, Nat>) -> List<&2, Nat>:
  match fuel todo:
    case _ Nil{}: List.reverse(&2, Nat, found)
    case 0n _: []
    case 1n++rest Con{+id, tail}: evaluated_walk(rest,
      List.append(&2, Nat, evaluated_item(X.lookup(syntax, id), syntax), tail), syntax, id <> found)

def evaluated_nodes(+syntax: T.PythonSyntax, id: Nat) -> List<&2, Nat>:
  evaluated_walk(X.fuel(syntax), id <> [], syntax, [])

def namespace_head(+text: String) -> String:
  match text:
    case SNil{}: ""
    case SCon{+head, tail}: B.decide(String,
      Bool.or(String.eq(SCon{head, SNil{}}, "."), String.eq(SCon{head, SNil{}}, "[")),
      _ => "", _ => SCon{head, namespace_head(tail)})

def imported_name(facts: List<&2, B.Binding>, +key: String) -> Bool:
  match facts:
    case []: False{}
    case B.Binding{_, None{}} <> tail: imported_name(tail, key)
    case B.Binding{name, Some{_}} <> tail: Bool.or(String.eq(name, key), imported_name(tail, key))

def namespace_leaf(imported: Bool, proceed: List<&2, Nat> -> Bool) -> Bool:
  match imported:
    case True{}: True{}
    case False{}: proceed([])

def namespace_target_kind(leaf: Bool, +node: T.PythonSyntaxNode,
    facts: List<&2, B.Binding>, proceed: List<&2, Nat> -> Bool) -> Bool:
  match leaf:
    case True{}: namespace_leaf(imported_name(facts, namespace_head(X.node_text(node))), proceed)
    case False{}: proceed(X.node_children(node))

def namespace_target_item(node: Maybe<&2, T.PythonSyntaxNode>, syntax: T.PythonSyntax,
    facts: List<&2, B.Binding>, proceed: List<&2, Nat> -> Bool) -> Bool:
  match node:
    case None{}: True{}
    case Some{+node}: namespace_target_kind(
      Bool.or(String.eq(X.node_kind(node), "attribute"), String.eq(X.node_kind(node), "subscript")),
      node, facts, proceed)

def namespace_target_walk(fuel: Nat, todo: List<&2, Nat>, +syntax: T.PythonSyntax, +facts: List<&2, B.Binding>) -> Bool:
  match fuel todo:
    case _ Nil{}: False{}
    case 0n _: True{}
    case 1n++rest Con{id, tail}: namespace_target_item(X.lookup(syntax, id), syntax, facts,
      children => namespace_target_walk(rest, List.append(&2, Nat, children, tail), syntax, facts))

def assignment_kind(+kind: String) -> Bool:
  contains("assignment" <> "augmented_assignment" <> "named_expression" <> [], kind)

def target_id(node: Maybe<&2, T.PythonSyntaxNode>) -> List<&2, Nat>:
  match node:
    case None{}: []
    case Some{node}: X.node_id(node) <> []

def namespace_targets(+node: T.PythonSyntaxNode, +syntax: T.PythonSyntax) -> List<&2, Nat>:
  B.decide(List<&2, Nat>, String.eq(X.node_kind(node), "delete_statement"),
    _ => X.node_children(node), _ => target_id(X.field(syntax, node, "left")))

def sys_boundary(+name: String, +key: String) -> Bool:
  Bool.or(String.eq(name, key), Bool.or(String.starts_with(name, String.append(key, ".")),
    String.starts_with(name, String.append(key, "["))))

def bare_boundary(+name: String, +key: String) -> Bool:
  Bool.or(String.eq(name, key), String.starts_with(name, String.append(key, "(")))

def builtin_prefix(keys: List<&2, String>, +name: String) -> Bool:
  match keys:
    case []: False{}
    case key <> tail: Bool.or(String.starts_with(name, String.append("builtins.", key)), builtin_prefix(tail, name))

def bare_calls(keys: List<&2, String>, +name: String) -> Bool:
  match keys:
    case []: False{}
    case key <> tail: Bool.or(bare_boundary(name, key), bare_calls(tail, name))

def dynamic_call(+name: String) -> Bool:
  Bool.or(sys_boundary(name, "sys.path"), Bool.or(sys_boundary(name, "sys.meta_path"),
    Bool.or(sys_boundary(name, "sys.path_hooks"), Bool.or(sys_boundary(name, "sys.modules"),
      Bool.or(String.starts_with(name, "importlib."), Bool.or(
        builtin_prefix("__import__" <> "exec" <> "eval" <> "setattr" <> "delattr" <> [], name),
        bare_calls("__import__" <> "exec" <> "eval" <> "globals" <> "locals" <> "setattr" <> "delattr" <> [], name)))))))

def identity_or_name(identity: Maybe<&2, String>, name: String) -> String:
  match identity:
    case None{}: name
    case Some{text}: text

def evaluated_namespace(+node: T.PythonSyntaxNode, +syntax: T.PythonSyntax,
    facts: List<&2, B.Binding>, +bindings: List<&2, B.Binding>) -> Bool:
  B.decide(Bool, Bool.or(assignment_kind(X.node_kind(node)), String.eq(X.node_kind(node), "delete_statement")),
    _ => namespace_target_walk(X.fuel(syntax), namespace_targets(node, syntax), syntax, facts),
    _ => B.decide(Bool, String.eq(X.node_kind(node), "call"),
      _ => dynamic_call(identity_or_name(S.identity_for(call_name(Some{node}, syntax), bindings), call_name(Some{node}, syntax))),
      _ => False{}))

def namespace_node(node: Maybe<&2, T.PythonSyntaxNode>, syntax: T.PythonSyntax,
    facts: List<&2, B.Binding>, bindings: List<&2, B.Binding>) -> Bool:
  match node:
    case None{}: True{}
    case Some{node}: evaluated_namespace(node, syntax, facts, bindings)

def evaluated_namespace_nodes(ids: List<&2, Nat>, +syntax: T.PythonSyntax,
    +facts: List<&2, B.Binding>, +bindings: List<&2, B.Binding>) -> Bool:
  match ids:
    case []: False{}
    case id <> tail: Bool.or(namespace_node(X.lookup(syntax, id), syntax, facts, bindings),
      evaluated_namespace_nodes(tail, syntax, facts, bindings))

def unavailable_namespace(+syntax: T.PythonSyntax, +scope: S.Scope) -> Bool:
  B.decide(Bool, unknown_evaluated(syntax, scope), _ => True{},
    _ => evaluated_namespace_nodes(evaluated_nodes(syntax, X.root(syntax)), syntax, scope_facts(scope), scope_bindings(scope)))

type Import is Data:
  Import{key: String, path: String, name: String, module: Bool, prefix: String}

def wildcard(nodes: List<&2, T.PythonSyntaxNode>) -> Bool:
  match nodes:
    case []: False{}
    case node <> tail: Bool.or(String.eq(X.node_kind(node), "wildcard_import"), wildcard(tail))

def unavailable_fact(facts: List<&2, B.Binding>) -> Bool:
  match facts:
    case []: False{}
    case B.Binding{+name, _} <> tail: Bool.or(Bool.or(String.eq(name, "__path__"), String.eq(name, "__getattr__")), unavailable_fact(tail))

def imports_available(+syntax: T.PythonSyntax, +scope: S.Scope) -> Bool:
  Bool.not(Bool.or(X.has_error(syntax), Bool.or(wildcard(X.rows(syntax)),
    Bool.or(unavailable_fact(scope_facts(scope)), unavailable_namespace(syntax, scope)))))

def static_consequence(node: Maybe<&2, T.PythonSyntaxNode>, syntax: T.PythonSyntax) -> List<&2, Nat>:
  match node:
    case None{}: []
    case Some{node}: X.children(X.field(syntax, node, "consequence"))

def statements(ids: List<&2, Nat>, +syntax: T.PythonSyntax, +statics: List<&2, Nat>) -> List<&2, Nat>:
  match ids:
    case []: []
    case +id <> +tail: B.decide(List<&2, Nat>, X.has_id(statics, S.node_start(X.lookup(syntax, id))),
      _ => List.append(&2, Nat, static_consequence(X.lookup(syntax, id), syntax), statements(tail, syntax, statics)),
      _ => id <> statements(tail, syntax, statics))

def selected_statements(+syntax: T.PythonSyntax, scope: S.Scope) -> List<&2, Nat>:
  statements(X.children(X.lookup(syntax, X.root(syntax))), syntax, scope_statics(scope))

def standard(name: String) -> Bool:
  contains("dataclasses" <> "typing" <> "typing_extensions" <> "pydantic" <> "__future__" <> [], B.prefix(name))

def import_fields(module: Maybe<&2, String>, +target: String, +name: String, alias: Maybe<&2, String>) -> Import:
  match module alias:
    case None{} None{}: Import{name, target, "", True{}, target}
    case None{} Some{_}: Import{name, target, "", True{}, name}
    case Some{module} _: Import{name, module, target, False{}, name}

def alias_or_prefix(alias: Maybe<&2, String>, target: String) -> String:
  match alias:
    case None{}: B.prefix(target)
    case Some{name}: name

def module_or_target(module: Maybe<&2, String>, target: String) -> String:
  match module:
    case None{}: target
    case Some{module}: module

def import_key(entry: Import) -> String:
  match entry:
    case Import{key, _, _, _, _}: key

def put_import(entries: List<&2, Import>, +entry: Import) -> List<&2, Import>:
  match entries:
    case []: entry <> []
    case +head <> +tail: B.decide(List<&2, Import>, String.eq(import_key(head), import_key(entry)),
      _ => entry <> tail, _ => head <> put_import(tail, entry))

def import_target(target: Maybe<&2, String>, +alias: Maybe<&2, String>, +module: Maybe<&2, String>,
    bindings: List<&2, B.Binding>, +entries: List<&2, Import>) -> List<&2, Import>:
  match target:
    case None{}: entries
    case Some{+target}: B.decide(List<&2, Import>, Bool.or(String.eq(target, ""),
      Bool.or(String.eq(alias_or_prefix(alias, target), ""), Bool.or(
        Bool.not(imported_name(bindings, alias_or_prefix(alias, target))), standard(module_or_target(module, target))))),
      _ => entries, _ => put_import(entries, import_fields(module, target, alias_or_prefix(alias, target), alias)))

def import_part(+node: T.PythonSyntaxNode, +syntax: T.PythonSyntax, +module: Maybe<&2, String>,
    +bindings: List<&2, B.Binding>, +entries: List<&2, Import>) -> List<&2, Import>:
  B.decide(List<&2, Import>, Bool.or(B.module_part(module, node), String.eq(X.node_kind(node), "wildcard_import")),
    _ => entries, _ => B.decide(List<&2, Import>, String.eq(X.node_kind(node), "aliased_import"),
      _ => import_target(X.text(X.field(syntax, node, "name")), X.text(X.field(syntax, node, "alias")), module, bindings, entries),
      _ => import_target(Some{X.node_text(node)}, None{}, module, bindings, entries)))

def import_part_node(node: Maybe<&2, T.PythonSyntaxNode>, syntax: T.PythonSyntax, module: Maybe<&2, String>,
    bindings: List<&2, B.Binding>, entries: List<&2, Import>) -> List<&2, Import>:
  match node:
    case None{}: entries
    case Some{node}: import_part(node, syntax, module, bindings, entries)

def import_parts(ids: List<&2, Nat>, +syntax: T.PythonSyntax, +module: Maybe<&2, String>,
    +bindings: List<&2, B.Binding>, entries: List<&2, Import>) -> List<&2, Import>:
  match ids:
    case []: entries
    case id <> tail: import_parts(tail, syntax, module, bindings, import_part_node(X.lookup(syntax, id), syntax, module, bindings, entries))

def imports_statement(node: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax,
    bindings: List<&2, B.Binding>, +entries: List<&2, Import>) -> List<&2, Import>:
  match node:
    case None{}: entries
    case Some{+node}: B.decide(List<&2, Import>, Bool.or(String.eq(X.node_kind(node), "import_statement"), String.eq(X.node_kind(node), "import_from_statement")),
      _ => import_parts(X.node_children(node), syntax, X.text(X.field(syntax, node, "module_name")), bindings, entries), _ => entries)

def imports_statements(ids: List<&2, Nat>, +syntax: T.PythonSyntax, +bindings: List<&2, B.Binding>,
    entries: List<&2, Import>) -> List<&2, Import>:
  match ids:
    case []: entries
    case id <> tail: imports_statements(tail, syntax, bindings, imports_statement(X.lookup(syntax, id), syntax, bindings, entries))

def imports_scoped(+syntax: T.PythonSyntax, +scope: S.Scope) -> Maybe<&2, List<&2, Import>>:
  B.decide(Maybe<&2, List<&2, Import>>, imports_available(syntax, scope),
    _ => Some{imports_statements(selected_statements(syntax, scope), syntax, scope_bindings(scope), [])}, _ => None{})

def python_imports(+syntax: T.PythonSyntax) -> Maybe<&2, List<&2, Import>>:
  imports_scoped(syntax, S.module_scope(syntax))

def package_evaluated(+node: T.PythonSyntaxNode, +syntax: T.PythonSyntax, bindings: List<&2, B.Binding>) -> Bool:
  Bool.and(Bool.not(Bool.and(assignment_kind(X.node_kind(node)),
    Bool.not(String.eq(X.kind(X.field(syntax, node, "left")), "identifier")))),
    Bool.or(Bool.not(String.eq(X.node_kind(node), "call")), declarative_call(text(S.identity_for(call_name(Some{node}, syntax), bindings)))))

def package_evaluated_node(node: Maybe<&2, T.PythonSyntaxNode>, syntax: T.PythonSyntax,
    bindings: List<&2, B.Binding>) -> Bool:
  match node:
    case None{}: False{}
    case Some{node}: package_evaluated(node, syntax, bindings)

def package_evaluations(ids: List<&2, Nat>, +syntax: T.PythonSyntax, +bindings: List<&2, B.Binding>) -> Bool:
  match ids:
    case []: True{}
    case id <> tail: Bool.and(package_evaluated_node(X.lookup(syntax, id), syntax, bindings), package_evaluations(tail, syntax, bindings))

def package_statement(node: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax,
    bindings: List<&2, B.Binding>) -> Bool:
  match node:
    case None{}: False{}
    case Some{+node}: Bool.and(Bool.not(contains("if_statement" <> "for_statement" <> "while_statement" <>
      "try_statement" <> "with_statement" <> "delete_statement" <> [], X.node_kind(node))),
      package_evaluations(evaluated_nodes(syntax, X.node_id(node)), syntax, bindings))

def package_statements(ids: List<&2, Nat>, +syntax: T.PythonSyntax, +bindings: List<&2, B.Binding>) -> Bool:
  match ids:
    case []: True{}
    case id <> tail: Bool.and(package_statement(X.lookup(syntax, id), syntax, bindings), package_statements(tail, syntax, bindings))

def package_scoped(+syntax: T.PythonSyntax, +scope: S.Scope) -> Bool:
  Bool.and(imports_available(syntax, scope), package_statements(selected_statements(syntax, scope), syntax, scope_bindings(scope)))

def static_package_authority(+syntax: T.PythonSyntax) -> Bool:
  package_scoped(syntax, S.module_scope(syntax))

def has_package_binding(+syntax: T.PythonSyntax, name: String) -> Bool:
  contains(names(scope_facts(S.module_scope(syntax))), name)

def main() -> Unit:
  Unit{}
