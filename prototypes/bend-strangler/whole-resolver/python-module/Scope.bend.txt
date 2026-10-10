import Base
import ../Types.bend as T
import ./Syntax.bend as X
import ./Bindings.bend as B

type Scope is Data:
  Scope{facts: List<&2, B.Binding>, bindings: List<&2, B.Binding>, static_blocks: List<&2, Nat>}

def suffix(+text: String) -> String:
  match text:
    case SNil{}: ""
    case SCon{+head, +tail}: B.decide(String, String.eq(SCon{head, SNil{}}, "."),
      _ => SCon{head, tail}, _ => suffix(tail))

def identified(value: Maybe<&2, String>, text: String) -> Maybe<&2, String>:
  match value:
    case None{}: None{}
    case Some{identity}: Some{String.append(identity, suffix(text))}

def identity_for(+text: String, bindings: List<&2, B.Binding>) -> Maybe<&2, String>:
  identified(B.imported_identity(bindings, B.prefix(text)), text)

def typing_marker(identity: Maybe<&2, String>) -> Bool:
  match identity:
    case None{}: False{}
    case Some{+text}: Bool.or(String.eq(text, "typing.TYPE_CHECKING"), String.eq(text, "typing_extensions.TYPE_CHECKING"))

def import_statement(+kind: String) -> Bool:
  Bool.or(String.eq(kind, "import_statement"), Bool.or(String.eq(kind, "import_from_statement"),
    Bool.or(String.eq(kind, "comment"), String.eq(kind, "pass_statement"))))

def consequence_allowed(ids: List<&2, Nat>, +syntax: T.PythonSyntax) -> Bool:
  match ids:
    case []: True{}
    case id <> tail: Bool.and(import_statement(X.kind(X.lookup(syntax, id))), consequence_allowed(tail, syntax))

def block_count(ids: List<&2, Nat>, +syntax: T.PythonSyntax) -> Nat:
  match ids:
    case []: 0n
    case id <> tail: Nat.add(Bool.pick(Nat, String.eq(X.kind(X.lookup(syntax, id)), "block"), 1n, 0n), block_count(tail, syntax))

def child_allowed(node: Maybe<&2, T.PythonSyntaxNode>, +start: Nat) -> Bool:
  match node:
    case None{}: False{}
    case Some{+node}: Bool.or(Nat.is_eq(X.node_start(node), start), String.eq(X.node_kind(node), "block"))

def children_allowed(ids: List<&2, Nat>, +syntax: T.PythonSyntax, +start: Nat) -> Bool:
  match ids:
    case []: True{}
    case id <> tail: Bool.and(child_allowed(X.lookup(syntax, id), start), children_allowed(tail, syntax, start))

def static_fields(condition: Maybe<&2, T.PythonSyntaxNode>, consequence: Maybe<&2, T.PythonSyntaxNode>,
    +node: T.PythonSyntaxNode, +syntax: T.PythonSyntax, bindings: List<&2, B.Binding>) -> Bool:
  match condition consequence:
    case Some{+condition} Some{consequence}:
      Bool.and(typing_marker(identity_for(X.node_text(condition), bindings)),
        Bool.and(children_allowed(X.node_children(node), syntax, X.node_start(condition)),
          Bool.and(Nat.is_eq(block_count(X.node_children(node), syntax), 1n),
            consequence_allowed(X.node_children(consequence), syntax))))
    case _ _: False{}

def static_node(node: Maybe<&2, T.PythonSyntaxNode>, +syntax: T.PythonSyntax, bindings: List<&2, B.Binding>) -> Bool:
  match node:
    case None{}: False{}
    case Some{+node}: B.decide(Bool, String.eq(X.node_kind(node), "if_statement"),
      _ => static_fields(X.field(syntax, node, "condition"), X.field(syntax, node, "consequence"), node, syntax, bindings),
      _ => False{})

def static_block(+syntax: T.PythonSyntax, id: Nat, bindings: List<&2, B.Binding>) -> Bool:
  static_node(X.lookup(syntax, id), syntax, bindings)

def non_conditionals(ids: List<&2, Nat>, +syntax: T.PythonSyntax) -> List<&2, B.Binding>:
  match ids:
    case []: []
    case +id <> +tail: B.decide(List<&2, B.Binding>, String.eq(X.kind(X.lookup(syntax, id)), "if_statement"),
      _ => non_conditionals(tail, syntax),
      _ => List.append(&2, B.Binding, B.scope_bindings(syntax, id, False{}), non_conditionals(tail, syntax)))

def node_start(node: Maybe<&2, T.PythonSyntaxNode>) -> Nat:
  match node:
    case None{}: 0n
    case Some{node}: X.node_start(node)

def static_blocks(ids: List<&2, Nat>, +syntax: T.PythonSyntax, +bindings: List<&2, B.Binding>) -> List<&2, Nat>:
  match ids:
    case []: []
    case +id <> +tail: B.decide(List<&2, Nat>, static_block(syntax, id, bindings),
      _ => node_start(X.lookup(syntax, id)) <> static_blocks(tail, syntax, bindings),
      _ => static_blocks(tail, syntax, bindings))

def all_facts(ids: List<&2, Nat>, +syntax: T.PythonSyntax, +statics: List<&2, Nat>) -> List<&2, B.Binding>:
  match ids:
    case []: []
    case +id <> tail: List.append(&2, B.Binding,
      B.scope_bindings(syntax, id, X.has_id(statics, node_start(X.lookup(syntax, id)))), all_facts(tail, syntax, statics))

def scoped(+facts: List<&2, B.Binding>, statics: List<&2, Nat>) -> Scope:
  Scope{facts, B.identities(facts), statics}

def with_statics(+syntax: T.PythonSyntax, +ids: List<&2, Nat>, +statics: List<&2, Nat>) -> Scope:
  scoped(all_facts(ids, syntax, statics), statics)

def scope_children(+syntax: T.PythonSyntax, +ids: List<&2, Nat>) -> Scope:
  with_statics(syntax, ids, static_blocks(ids, syntax, B.identities(non_conditionals(ids, syntax))))

def module_scope(+syntax: T.PythonSyntax) -> Scope:
  scope_children(syntax, X.children(X.lookup(syntax, X.root(syntax))))

def main() -> Unit:
  Unit{}
