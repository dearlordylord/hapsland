import Base
import ./RANK_LAWS.bend as Laws
import ./INITIAL_RANK_PROOF.bend as Initial
import ./STEP_RANK_PROOF.bend as Step
import ./RUN_RANK_PROOF.bend as Run

# Canonical implementations of the unchanged three original String rank contracts.
def Laws.initial_rank_bound(facts, path, visited, budget, key, declaration, depth, valid, selected):
  Initial.initial_rank_bound(facts, path, visited, budget, key, declaration, depth, valid, selected)

def Laws.step_decreases_preserving_visited(machine, valid, active):
  Step.step_decreases_preserving_visited(machine, valid, active)

def Laws.run_completes_from_rank(fuel, machine, valid, enough):
  Run.run_completes_from_rank(fuel, machine, valid, enough)

def main() -> Unit:
  Unit{}
