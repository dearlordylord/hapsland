import Base
import ./CONTINUATION_LAWS.bend as Laws
import ./CONTINUATION_COMPLETION_PROOF.bend as Completion
import ./CONTINUATION_STEP_PROOF.bend as Step
import ./CONTINUATION_TERMINAL_PROOF.bend as Terminal
import ./CONTINUATION_RUN_PROOF.bend as Run
import ./CONTINUATION_INITIAL_PROOF.bend as Initial

def Laws.continuation_completes(machine, valid):
  Completion.continuation_completes(machine, valid)

def Laws.step_preserves_continuation(machine, valid):
  Step.step_preserves_continuation(machine, valid)

def Laws.terminal_observation_exact(machine, terminal):
  Terminal.terminal_observation_exact(machine, terminal)

def Laws.run_observation_exact(fuel, machine, valid, enough):
  Run.run_observation_exact(fuel, machine, valid, enough)

def Laws.initial_recursive_exact(facts, path, name, expected, visited, budget, depth, valid):
  Initial.initial_recursive_exact(facts, path, name, expected, visited, budget, depth, valid)

def main() -> Unit:
  Unit{}
