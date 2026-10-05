import Base
import ./FreshnessScenario.bend as Freshness
import ../agent-flow-bend/Canonical.bend as Canonical

# Unchecked candidate proposals under #176, not accepted laws or a proof of the
# complete callback/final-handoff driver. Native/runtime checks remain pending.

# For every original registry and unit identity, an absent parent cannot attach
# a current generation or change another operation's captured source facts.
law missing_parent_preserves_registry:
  for state: Freshness.State
  for child: Freshness.Scope
  {Freshness.inherit(state, child, None{}) == state : Freshness.State}

# For every original registry/scope/source and unrelated Canonical command,
# the particular refusal command contains no accepted revision generation.
law refusal_cannot_capture_generation:
  for state: Freshness.State
  for scope: Freshness.Scope
  for source: Freshness.Source
  {Freshness.registered(state, scope, source, Canonical.FinishRefused{}) == state : Freshness.State}
