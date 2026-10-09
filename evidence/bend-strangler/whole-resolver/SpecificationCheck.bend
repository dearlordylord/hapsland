import Base
import ../../../packages/agent-flow-bend/ImportGraph.bend as G
import ./SPEC.bend as Spec

# Comparison entry only. Production calls live here, never in the independent
# specification. Shared public datatypes keep both foreign marshalers identical.
def native_initial(limits: G.Limits) -> G.Graph:
  G.initial(limits)

def reference_initial(limits: G.Limits) -> G.Graph:
  Spec.initial_graph(limits)

def native_event(state: G.Graph, event: G.GraphEvent) -> G.Step:
  G.step(state, event)

def reference_event(state: G.Graph, event: G.GraphEvent) -> G.Step:
  Spec.graph_event(state, event)

def main() -> Unit:
  Unit{}
