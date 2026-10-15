import Base
import ./Model.bend as M
import ./Core.bend as C

# Actual child entry spends the explicit declaration tick and retains every
# parked parent and the current request. Reference charging happens earlier.
law child_entry_step:
  for +rest: Nat
  for +global: C.Global
  for +root: Nat
  for +name: String
  for +expanded: List<&2, String>
  for +referenced: List<&2, String>
  for +failure: Maybe<&2, M.Failure>
  for old_remaining: Nat
  for +parents: List<&2, C.Frame>
  for +slot: Nat
  for +identity: String
  for target_name: String
  for +references: List<&2, M.Reference>
  for +symbol: String
  for +operations: List<&2, M.Op>
  {
    C.enter_child(
      1n+rest,
      C.Cursor{global, root, name, expanded, referenced, failure, old_remaining, parents},
      M.Declaration{slot, identity, target_name, references},
      symbol,
      operations
    )
    == C.cursor_ops(C.Cursor{global, root, name, identity <> expanded, referenced, failure, rest,
      C.Frame{slot, references, [], Some{symbol}} <> parents},
      C.child_operations(C.global_purpose(global), operations, slot))
    : C.Step
  }

def main() -> Unit:
  Unit{}
