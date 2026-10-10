import Base
import ./RANK_LAWS.bend as RankLaws
import ./UNSEEN_PROOF.bend as Unseen
import ./ROOT_INVENTORY_PROOF.bend as Root
import ./CHILD_INVENTORY_PROOF.bend as Child
import ./INITIAL_RANK_PROOF.bend as Initial
import ./STEP_RANK_PROOF.bend as Step
import ./RUN_RANK_PROOF.bend as Run
import ./PLAN_RANK_PROOF.bend as Plan

# Canonical gate implements all seven exact full-machine termination laws.

def RankLaws.unseen_insertion_nonincreasing(catalog, visited, identity):
  Unseen.unseen_insertion_nonincreasing(catalog, visited, identity)

def RankLaws.selected_root_inventory_bound(catalog, visited, key, declaration, selected):
  Root.selected_root_inventory_bound(catalog, visited, key, declaration, selected)

def RankLaws.selected_child_inventory_decrease(
  catalog,
  visited,
  key,
  declaration,
  selected,
  absent
):
  Child.selected_child_inventory_decrease(catalog, visited, key, declaration, selected, absent)

def RankLaws.initial_rank_bound(facts, path, visited, budget, key, declaration, depth, selected):
  Initial.initial_rank_bound(facts, path, visited, budget, key, declaration, depth, selected)

def RankLaws.step_decreases_rank(machine, active):
  Step.step_decreases_rank(machine, active)

def RankLaws.run_completes_from_rank(fuel, machine, enough):
  Run.run_completes_from_rank(fuel, machine, enough)

def RankLaws.plan_completes(facts, path, name, expected, visited, budget, depth):
  Plan.plan_completes(facts, path, name, expected, visited, budget, depth)
