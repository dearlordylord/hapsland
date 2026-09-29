import Base
import ../ImportGraph.bend as ImportGraph
import ./LAWS.bend as Laws

def Laws.import_graph_fitting_tree_adds(t, n, cap, fits):
  %Equal.sym(Bool, Nat.is_gt((t + n : Nat), cap), False{}, fits) : {Bool.pick(Nat, _, t, (t + n : Nat)) == (t + n : Nat) : Nat}
  {==}

def Laws.import_graph_nonfitting_tree_preserves_total(t, n, cap, exceeds):
  %Equal.sym(Bool, Nat.is_gt((t + n : Nat), cap), True{}, exceeds) : {Bool.pick(Nat, _, t, (t + n : Nat)) == t : Nat}
  {==}

def Laws.import_graph_fitting_tree_stays_within_cap(t, n, cap, fits):
  %Equal.sym(Bool, Nat.is_gt((t + n : Nat), cap), False{}, fits) : {Nat.is_gt(Bool.pick(Nat, _, t, (t + n : Nat)), cap) == False{} : Bool}
  fits

def Laws.import_graph_skipped_tree_stays_within_cap(t, n, cap, valid, exceeds):
  %Equal.sym(Bool, Nat.is_gt((t + n : Nat), cap), True{}, exceeds) : {Nat.is_gt(Bool.pick(Nat, _, t, (t + n : Nat)), cap) == False{} : Bool}
  %Equal.sym(Bool, Nat.is_gt(t, cap), False{}, valid) : {_ == False{} : Bool}
  {==}

def false_true_absurd(e: {False{} == True{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Empty, Unit)
  Unit{}

def Laws.import_graph_le_refl(n):
  match n:
    case 0n:
      {==}
    case 1n+p:
      Laws.import_graph_le_refl(p)

def Laws.import_graph_not_gt_refl(n):
  match n:
    case 0n:
      {==}
    case 1n+p:
      Laws.import_graph_not_gt_refl(p)

def Laws.import_graph_le_succ(a, b, le):
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+bp:
      {==}
    case 1n+ap 0n:
      Empty.absurd({Nat.is_le(ap, 0n) == True{} : Bool}, false_true_absurd(le))
    case 1n+ap 1n+bp:
      Laws.import_graph_le_succ(ap, bp, le)

def Laws.import_graph_contribution_is_at_most_accepted_total(t, n):
  match t:
    case 0n:
      Laws.import_graph_le_refl(n)
    case 1n++p:
      Laws.import_graph_le_succ(n, (p + n : Nat),
        Laws.import_graph_contribution_is_at_most_accepted_total(p, n))

def Laws.import_graph_strict_total_requires_prior_bytes(t, n, strict):
  match t:
    case 0n:
      Empty.absurd({Nat.is_gt(0n, 0n) == True{} : Bool},
        false_true_absurd(Equal.trans(Bool, False{}, Nat.is_gt(n, n), True{},
          Equal.sym(Bool, Nat.is_gt(n, n), False{}, Laws.import_graph_not_gt_refl(n)), strict)))
    case 1n+p:
      {==}

def Laws.import_graph_skip_preserves_later_pending(pending, edges, depth):
  {==}

def Laws.import_graph_source_read_adds_even_when_tree_skips(t, n):
  {==}

def Laws.import_graph_source_read_within_configured_cap(t, n, cap, fits):
  fits

def Laws.import_graph_exact_full_file_reservation_fits(t, per_file):
  Laws.import_graph_not_gt_refl((t + per_file : Nat))

def Laws.import_graph_zero_event_fuel_is_terminal(graph, event):
  match graph:
    case ImportGraph.Graph{phase, pending, visited, files, read_bytes, tree_bytes,
        work, skipped_tree, skipped_excluded, limits}:
      match phase:
        case ImportGraph.Idle{}:
          {==}
        case ImportGraph.Ready{}:
          {==}
        case ImportGraph.Resolving{edge}:
          {==}
        case ImportGraph.Checking{edge, target}:
          {==}
        case ImportGraph.Capturing{edge, target}:
          {==}
        case ImportGraph.Complete{}:
          {==}
        case ImportGraph.Incomplete{reason}:
          {==}

def Laws.import_graph_wrap_projects_graph(result, remaining):
  match result:
    case ImportGraph.Step{graph, command}:
      {==}

def Laws.import_graph_responsive_termination(fuel, graph, events, fallback):
  match fuel:
    case 0n:
      Laws.import_graph_zero_event_fuel_is_terminal(graph,
        ImportGraph.event_value(events, fallback))
    case 1n++rest:
      %Laws.import_graph_wrap_projects_graph(
        ImportGraph.step(graph, ImportGraph.event_value(events, fallback)), rest) :
        {ImportGraph.bounded_terminal(ImportGraph.responsive_run(rest, _, ImportGraph.event_rest(events), fallback)) == True{} : Bool}
      Laws.import_graph_responsive_termination(rest,
        ImportGraph.step_graph(ImportGraph.step(graph, ImportGraph.event_value(events, fallback))),
        ImportGraph.event_rest(events), fallback)

def Laws.import_graph_initial_terminates_for_every_finite_profile(limits, events, fallback):
  Laws.import_graph_responsive_termination(ImportGraph.event_budget(limits),
    ImportGraph.initial(limits), events, fallback)
