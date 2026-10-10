import Base
import ./RANK_SELECTION_LAWS.bend as Selection
import ./ROOT_STEP_PROOF.bend as Root
import ./CHILD_STEP_PROOF.bend as Child

# Canonical approved selection statements, without changes to premises.
def Selection.none_not_selected(declaration, selected):
  Root.none_not_selected(declaration, selected)

def Selection.selected_root_step(
  found,
  head,
  rest,
  key,
  visited,
  declaration,
  name,
  count,
  selected,
  suffix
):
  Root.selected_root_step(
    found,
    head,
    rest,
    key,
    visited,
    declaration,
    name,
    count,
    selected,
    suffix
  )

def Selection.selected_child_step(
  found,
  head,
  rest,
  key,
  visited,
  declaration,
  name,
  count,
  selected,
  absent,
  suffix
):
  Child.selected_child_step(
    found,
    head,
    rest,
    key,
    visited,
    declaration,
    name,
    count,
    selected,
    absent,
    suffix
  )
