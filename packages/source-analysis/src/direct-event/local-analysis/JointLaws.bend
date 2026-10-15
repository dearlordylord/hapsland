import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Joint.bend as J
import ./Specification.bend as S

# The actual retained root-entry cursor establishes the shared semantic and
# semantic-fuel invariant. No Spec success or caller budget is assumed.
law initial_cursor:
  for +root: M.Declaration
  for +invocation: C.Global
  J.cursor(root, invocation, C.global_request(invocation), J.initial_cursor(root, invocation),
    [J.initial_ghost(root, C.global_catalog(invocation))])

# Connect the proof constructor to actual root entry, before native Acks.
law initial_step:
  for +root: M.Declaration
  for +invocation: C.Global
  {
    C.start_root(M.traversal_inventory(root, C.global_catalog(invocation)), invocation, root)
    == C.cursor_ops(
      J.initial_cursor(root, invocation),
      C.node_operations(C.global_purpose(invocation), S.declaration_slot(root))
    )
    : C.Step
  }

def main() -> Unit:
  Unit{}
