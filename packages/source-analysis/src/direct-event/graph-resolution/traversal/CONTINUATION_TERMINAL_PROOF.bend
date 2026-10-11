import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts

law terminal_observation_exact:
  for +machine: Core.Machine
  for terminal: {CoreTraversal.done(machine) == True{} : Bool}
  {
    Relation.observe_core(Core.CompletePlan{CoreTraversal.finish(machine)})
    == Continuation.observe(machine) : Relation.Observation
  }

def terminal_observation_exact(machine, terminal):
  match machine:
    case Core.Machine{facts, path, [], visited, budget, address, nodes, slots, pending}: {==}
    case Core.Machine{
      +facts,
      +path,
      +frame <> +rest,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      Empty.absurd(
        {
          Relation.observe_core(
            Core.CompletePlan{
              CoreTraversal.finish(
                Core.Machine{
                  facts,
                  path,
                  frame <> rest,
                  visited,
                  budget,
                  address,
                  nodes,
                  slots,
                  pending
                }
              )
            }
          )
          == Continuation.observe(
            Core.Machine{
              facts,
              path,
              frame <> rest,
              visited,
              budget,
              address,
              nodes,
              slots,
              pending
            }
          )
          : Relation.Observation
        },
        BoolFacts.internal_false_ne_true(terminal)
      )
