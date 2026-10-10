import Base
import ../Types.bend as T

# Accessors over the raw native syntax projection, with no authority decisions.

def node_id(node: T.PythonSyntaxNode) -> Nat:
  match node:
    case T.PythonSyntaxNode{id, _, _, _, _, _, _}: id

def node_kind(node: T.PythonSyntaxNode) -> String:
  match node:
    case T.PythonSyntaxNode{_, kind, _, _, _, _, _}: kind

def node_text(node: T.PythonSyntaxNode) -> String:
  match node:
    case T.PythonSyntaxNode{_, _, text, _, _, _, _}: text

def node_start(node: T.PythonSyntaxNode) -> Nat:
  match node:
    case T.PythonSyntaxNode{_, _, _, start, _, _, _}: start

def node_end(node: T.PythonSyntaxNode) -> Nat:
  match node:
    case T.PythonSyntaxNode{_, _, _, _, end, _, _}: end

def node_children(node: T.PythonSyntaxNode) -> List<&2, Nat>:
  match node:
    case T.PythonSyntaxNode{_, _, _, _, _, children, _}: children

def node_fields(node: T.PythonSyntaxNode) -> List<&2, T.SyntaxField>:
  match node:
    case T.PythonSyntaxNode{_, _, _, _, _, _, fields}: fields

def find(nodes: List<&2, T.PythonSyntaxNode>, +id: Nat) -> Maybe<&2, T.PythonSyntaxNode>:
  match nodes:
    case []: None{}
    case +node <> tail: Bool.pick(Maybe<&2, T.PythonSyntaxNode>, Nat.is_eq(node_id(node), id), Some{node}, find(tail, id))

def rows(syntax: T.PythonSyntax) -> List<&2, T.PythonSyntaxNode>:
  match syntax:
    case T.PythonSyntax{_, _, nodes}: nodes

def root(syntax: T.PythonSyntax) -> Nat:
  match syntax:
    case T.PythonSyntax{_, root, _}: root

def has_error(syntax: T.PythonSyntax) -> Bool:
  match syntax:
    case T.PythonSyntax{error, _, _}: error

def lookup(+syntax: T.PythonSyntax, id: Nat) -> Maybe<&2, T.PythonSyntaxNode>:
  find(rows(syntax), id)

def field_id(fields: List<&2, T.SyntaxField>, +key: String) -> Maybe<&2, Nat>:
  match fields:
    case []: None{}
    case T.SyntaxField{name, child} <> tail:
      Bool.pick(Maybe<&2, Nat>, String.eq(name, key), Some{child}, field_id(tail, key))

def field_node(id: Maybe<&2, Nat>, syntax: T.PythonSyntax) -> Maybe<&2, T.PythonSyntaxNode>:
  match id:
    case None{}: None{}
    case Some{id}: lookup(syntax, id)

def field(+syntax: T.PythonSyntax, node: T.PythonSyntaxNode, key: String) -> Maybe<&2, T.PythonSyntaxNode>:
  field_node(field_id(node_fields(node), key), syntax)

def text(node: Maybe<&2, T.PythonSyntaxNode>) -> Maybe<&2, String>:
  match node:
    case None{}: None{}
    case Some{node}: Some{node_text(node)}

def kind(node: Maybe<&2, T.PythonSyntaxNode>) -> String:
  match node:
    case None{}: ""
    case Some{node}: node_kind(node)

def children(node: Maybe<&2, T.PythonSyntaxNode>) -> List<&2, Nat>:
  match node:
    case None{}: []
    case Some{node}: node_children(node)

def first(ids: List<&2, Nat>, syntax: T.PythonSyntax) -> Maybe<&2, T.PythonSyntaxNode>:
  match ids:
    case []: None{}
    case id <> _: lookup(syntax, id)

def node_id_first(node: T.PythonSyntaxNode) -> List<&2, Nat>:
  match node:
    case T.PythonSyntaxNode{_, _, _, _, _, [], _}: []
    case T.PythonSyntaxNode{_, _, _, _, _, id <> _, _}: id <> []

def first_child(+syntax: T.PythonSyntax, node: T.PythonSyntaxNode) -> Maybe<&2, T.PythonSyntaxNode>:
  first(node_children(node), syntax)

def last(ids: List<&2, Nat>) -> Maybe<&2, Nat>:
  match ids:
    case []: None{}
    case id <> []: Some{id}
    case _ <> tail: last(tail)

def has_id(ids: List<&2, Nat>, +id: Nat) -> Bool:
  match ids:
    case []: False{}
    case head <> tail: Bool.or(Nat.is_eq(head, id), has_id(tail, id))

def parent_in(nodes: List<&2, T.PythonSyntaxNode>, +id: Nat) -> Maybe<&2, T.PythonSyntaxNode>:
  match nodes:
    case []: None{}
    case +node <> tail: Bool.pick(Maybe<&2, T.PythonSyntaxNode>, has_id(node_children(node), id),
      Some{node}, parent_in(tail, id))

def parent(+syntax: T.PythonSyntax, node: T.PythonSyntaxNode) -> Maybe<&2, T.PythonSyntaxNode>:
  parent_in(rows(syntax), node_id(node))

def fuel(+syntax: T.PythonSyntax) -> Nat:
  List.length(&2, T.PythonSyntaxNode, rows(syntax))

def main() -> Unit:
  Unit{}
