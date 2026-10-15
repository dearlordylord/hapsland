import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Joint.bend as J
import ./Root.bend as Root

# Proof-only relation over existing Core states. The ghost fold contains
# only already accumulated expressions, never a catalog traversal.
def spine_postfix(ghosts: List<&2, J.Ghost>) -> List<&2, M.Op>:
  match ghosts:
    case []: []
    case J.Ghost{_, _, subtotal} <> rest:
      List.append(&2, M.Op, spine_postfix(rest), S.postfix(subtotal))

def cursor_postfix(purpose: C.Purpose, ghosts: List<&2, J.Ghost>) -> List<&2, M.Op>:
  match purpose:
    case C.Preflight{}: spine_postfix(ghosts)
    case _: []

def request(+invocation: C.Global, reversed: List<&2, M.Op>) -> Nat:
  Nat.add(C.global_request(invocation), List.length(&2, M.Op, reversed))

def expectation(root: M.Declaration, invocation: C.Global) -> Maybe<&2, Root.Expectation>:
  match invocation:
    case C.Global{catalog, purpose, pending, prefix, initial_request}:
      Root.expected(root, catalog, purpose, pending, prefix, initial_request)

# While an Engine queue is pending its stored continuation still has the
# request from queue creation. ready() replaces that request after the final
# Ack; the semantic cursor relation records the stored request exactly.
def cursor_global(cursor: C.Cursor) -> C.Global:
  match cursor:
    case C.Cursor{global, _, _, _, _, _, _, _}: global

def deferred(next: C.Deferred, +root: M.Declaration, +invocation: C.Global,
  ghosts: List<&2, J.Ghost>, +planned: List<&2, M.Op>) -> Type:
  match next ghosts:
    case C.CursorNext{+cursor} ghosts:
      J.cursor(root, invocation, C.global_request(cursor_global(cursor)), cursor, ghosts)
      & {planned == cursor_postfix(C.global_purpose(invocation), ghosts) : List<&2, M.Op>}
    case C.RootNext{global} Nil{}:
      Root.correspondence(
        Root.RootDone{
          C.global_count(
            global,
            Nat.add(C.global_request(invocation), List.length(&2, M.Op, planned))
          ),
          List.reverse(&2, M.Op, planned)
        },
        expectation(root, invocation)
      )
    case C.RootNext{_} _ <> _: Empty

# Invalid/Exhausted and catalog-wide terminal states cannot inhabit a
# successful root transition. NextRoot is the suspended outer continuation.
def valid(+root: M.Declaration, +invocation: C.Global, +reversed: List<&2, M.Op>,
  step: C.Step, +ghosts: List<&2, J.Ghost>) -> Type:
  match step ghosts:
    case C.Continue{cursor} ghosts:
      J.cursor(root, invocation, request(invocation, reversed), cursor, ghosts)
      & {
        List.reverse(&2, M.Op, reversed)
        == cursor_postfix(C.global_purpose(invocation), ghosts)
        : List<&2, M.Op>
      }
    case C.Engine{operation, queued_request, remaining, next} ghosts:
      {queued_request == request(invocation, reversed) : Nat}
      & deferred(next, root, invocation, ghosts,
        List.append(&2, M.Op, List.reverse(&2, M.Op, reversed), operation <> remaining))
    case C.NextRoot{global} Nil{}:
      Root.correspondence(Root.RootDone{global, reversed}, expectation(root, invocation))
    case _ _: Empty

# The same one-step dispatch used by Root.run: matching Ack records exactly
# one operation; Continue performs one Core advance; NextRoot stops this root.
def advance(step: C.Step) -> C.Step:
  match step:
    case C.Engine{+operation, +queued_request, remaining, next}:
      C.resume(C.Engine{operation, queued_request, remaining, next}, C.Ack{queued_request})
    case C.Continue{cursor}: C.advance(C.Continue{cursor})
    case other: other

def record(step: C.Step, reversed: List<&2, M.Op>) -> List<&2, M.Op>:
  match step:
    case C.Engine{operation, _, _, _}: operation <> reversed
    case _: reversed

def main() -> Unit:
  Unit{}
