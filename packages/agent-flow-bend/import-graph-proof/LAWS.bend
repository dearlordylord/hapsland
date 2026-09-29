import Base
import ../ImportGraph.bend as ImportGraph

law import_graph_fitting_tree_adds:
  for t: Nat
  for n: Nat
  for cap: Nat
  for fits: {Nat.is_gt((t + n : Nat), cap) == False{} : Bool}
  {ImportGraph.tree_after(t, n, cap) == (t + n : Nat) : Nat}

law import_graph_nonfitting_tree_preserves_total:
  for t: Nat
  for n: Nat
  for cap: Nat
  for exceeds: {Nat.is_gt((t + n : Nat), cap) == True{} : Bool}
  {ImportGraph.tree_after(t, n, cap) == t : Nat}

law import_graph_fitting_tree_stays_within_cap:
  for t: Nat
  for n: Nat
  for cap: Nat
  for +fits: {Nat.is_gt((t + n : Nat), cap) == False{} : Bool}
  {Nat.is_gt(ImportGraph.tree_after(t, n, cap), cap) == False{} : Bool}

law import_graph_skipped_tree_stays_within_cap:
  for t: Nat
  for n: Nat
  for cap: Nat
  for valid: {Nat.is_gt(t, cap) == False{} : Bool}
  for exceeds: {Nat.is_gt((t + n : Nat), cap) == True{} : Bool}
  {Nat.is_gt(ImportGraph.tree_after(t, n, cap), cap) == False{} : Bool}

law import_graph_contribution_is_at_most_accepted_total:
  for t: Nat
  for +n: Nat
  {Nat.is_le(n, (t + n : Nat)) == True{} : Bool}

law import_graph_le_refl:
  for n: Nat
  {Nat.is_le(n, n) == True{} : Bool}

law import_graph_not_gt_refl:
  for n: Nat
  {Nat.is_gt(n, n) == False{} : Bool}

law import_graph_le_succ:
  for a: Nat
  for b: Nat
  for le: {Nat.is_le(a, b) == True{} : Bool}
  {Nat.is_le(a, (1n + b : Nat)) == True{} : Bool}

law import_graph_strict_total_requires_prior_bytes:
  for t: Nat
  for n: Nat
  for strict: {Nat.is_gt((t + n : Nat), n) == True{} : Bool}
  {Nat.is_gt(t, 0n) == True{} : Bool}

law import_graph_skip_preserves_later_pending:
  for pending: List<&2, ImportGraph.Edge>
  for edges: List<&2, Nat>
  for depth: Nat
  {ImportGraph.pending_after(pending, edges, depth, True{}) == pending : List<&2, ImportGraph.Edge>}

law import_graph_source_read_adds_even_when_tree_skips:
  for t: Nat
  for n: Nat
  {ImportGraph.read_after(t, n) == (t + n : Nat) : Nat}

law import_graph_source_read_within_configured_cap:
  for t: Nat
  for n: Nat
  for cap: Nat
  for fits: {Nat.is_gt((t + n : Nat), cap) == False{} : Bool}
  {Nat.is_gt(ImportGraph.read_after(t, n), cap) == False{} : Bool}

law import_graph_exact_full_file_reservation_fits:
  for t: Nat
  for per_file: Nat
  {Nat.is_gt((t + per_file : Nat), (t + per_file : Nat)) == False{} : Bool}

law import_graph_zero_event_fuel_is_terminal:
  for graph: ImportGraph.Graph
  for event: ImportGraph.GraphEvent
  {ImportGraph.bounded_terminal(ImportGraph.bounded_state(
    ImportGraph.bounded_step(ImportGraph.Bounded{graph, 0n}, event))) == True{} : Bool}

law import_graph_wrap_projects_graph:
  for +result: ImportGraph.Step
  for remaining: Nat
  {ImportGraph.Bounded{ImportGraph.step_graph(result), remaining} ==
    ImportGraph.bounded_state(ImportGraph.wrap(result, remaining)) : ImportGraph.Bounded}

# One root event, at most four events per work step, and one final queue check.
# The event list plus fallback supplies one event each time the graph advances.
# Every external command must receive its matching fact or DeadlineReached;
# a command that never returns is outside this conditional liveness theorem.
law import_graph_responsive_termination:
  for fuel: Nat
  for +graph: ImportGraph.Graph
  for +events: List<&2, ImportGraph.GraphEvent>
  for +fallback: ImportGraph.GraphEvent
  {ImportGraph.bounded_terminal(ImportGraph.responsive_run(fuel,
    ImportGraph.Bounded{graph, fuel}, events, fallback)) == True{} : Bool}

law import_graph_initial_terminates_for_every_finite_profile:
  for +limits: ImportGraph.Limits
  for +events: List<&2, ImportGraph.GraphEvent>
  for +fallback: ImportGraph.GraphEvent
  {ImportGraph.bounded_terminal(ImportGraph.responsive_run(
    ImportGraph.event_budget(limits), ImportGraph.bounded_initial(limits),
    events, fallback)) == True{} : Bool}
