# Approved preview boundary laws.
import Base
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ./PreviewEligibilityLAWS.bend as Laws

def Laws.eligible_callback_step(target, at, action, completion, order, tail, world, tower): {==}
def Laws.include_eligible_target(target, tail): {==}
def Laws.exclude_ineligible_target(target, tail): {==}
def Laws.no_originals_no_targets(world, tower): {==}
def Laws.held_not_previewed(fact, order, tail, world, tower):
  match fact:
    case CB.Fact{target, at, action, completion}: {==}
def Laws.dropped_not_previewed(fact, order, tail, world, tower):
  match fact:
    case CB.Fact{target, at, action, completion}: {==}
