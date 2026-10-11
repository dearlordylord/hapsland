import Base
import ../Types.bend as T

# Executable boundary canary only; no Go policy or correspondence claim.
def naturals(values: List<&2, Nat>) -> Nat:
  match values:
    case Nil{}: 0n
    case Con{head, tail}: Nat.add(head, naturals(tail))

def fields(values: List<&2, T.SyntaxField>) -> Nat:
  match values:
    case Nil{}: 0n
    case Con{T.SyntaxField{_, child}, tail}: Nat.add(child, fields(tail))

def row(value: T.GoSyntaxNode) -> Nat:
  match value:
    case T.GoSyntaxNode{id, _, _, start, end, children, links}:
      Nat.add(id, Nat.add(start, Nat.add(end, Nat.add(naturals(children), fields(links)))))

def rows(values: List<&2, T.GoSyntaxNode>) -> Nat:
  match values:
    case Nil{}: 0n
    case Con{head, tail}: Nat.add(row(head), rows(tail))

def location(value: T.GoSourceLocation) -> Nat:
  match value:
    case T.GoSourceLocation{T.GoSourcePosition{a, b}, T.GoSourcePosition{c, d}}:
      Nat.add(a, Nat.add(b, Nat.add(c, d)))

def optional_location(value: Maybe<&2, T.GoSourceLocation>) -> Nat:
  match value:
    case None{}: 0n
    case Some{value}: location(value)

def locations(values: List<&2, Maybe<&2, T.GoSourceLocation>>) -> Nat:
  match values:
    case Nil{}: 0n
    case Con{head, tail}: Nat.add(optional_location(head), locations(tail))

def expression(value: Maybe<&2, Nat>) -> Nat:
  match value:
    case None{}: 0n
    case Some{value}: Nat.add(value, 1n)

def members(values: List<&2, T.GoConstantMember>) -> Nat:
  match values:
    case Nil{}: 0n
    case Con{T.GoConstantMember{_, _, value}, tail}: Nat.add(expression(value), members(tail))

def groups(values: List<&2, T.GoConstantFacts>) -> Nat:
  match values:
    case Nil{}: 0n
    case Con{T.GoConstantFacts{_, _, values}, tail}: Nat.add(members(values), groups(tail))

def numeric_total(value: T.GoFileSyntax) -> Nat:
  match value:
    case T.GoFileSyntax{_, _, _, positions, _, _, _, constants, _, _, _, _, syntax}:
      Nat.add(locations(positions), Nat.add(groups(constants), rows(syntax)))

def main() -> Unit:
  Unit{}
