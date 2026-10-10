import Base
import ./HELPER_LAWS.bend as Laws
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec

def Laws.map_value_projection_agrees(V, pair):
  match pair:
    case Tuple{map, found}: {==}

def Laws.declaration_key_agrees(aware, expected, name):
  match aware expected:
    case False{} _: {==}
    case True{} Core.TypeKind{}: {==}
    case True{} Core.FunctionKind{}: {==}
    case True{} Core.AnyKind{}: {==}

def Laws.declaration_lookup_agrees(facts, name, expected):
  match facts:
    case Core.Facts{+aware, +declarations, imports, supporting}:
      %Laws.declaration_key_agrees(aware, expected, name):
        {
          Core.map_result(
            Maybe<&2, Core.Declaration>,
            Map.get(
              Maybe<&2, Core.Declaration>,
              None{},
              declarations,
              CoreTraversal.lookup_key(aware, expected, name)
            )
          )
          == Spec.value(
            Maybe<&2, Core.Declaration>,
            Map.get(Maybe<&2, Core.Declaration>, None{}, declarations, _)
          )
          : Maybe<&2, Core.Declaration>
        }
      Laws.map_value_projection_agrees(
        Maybe<&2, Core.Declaration>,
        Map.get(
          Maybe<&2, Core.Declaration>,
          None{},
          declarations,
          CoreTraversal.lookup_key(aware, expected, name)
        )
      )

def Laws.import_lookup_agrees(facts, name):
  match facts:
    case Core.Facts{aware, declarations, imports, supporting}:
      Laws.map_value_projection_agrees(Maybe<&2, Core.ImportBinding>,
        Map.get(Maybe<&2, Core.ImportBinding>, None{}, imports, name))

def Laws.supporting_lookup_agrees(facts, identity):
  match facts:
    case Core.Facts{aware, declarations, imports, supporting}:
      Laws.map_value_projection_agrees(Maybe<&2, Core.Declaration>,
        Map.get(Maybe<&2, Core.Declaration>, None{}, supporting, identity))

def Laws.depth_observation_agrees(budget, depth):
  match budget:
    case Core.Budget{limits, targets, maximum, work, graph_work, old_depth}: {==}

def Laws.work_charge_agrees(budget):
  match budget:
    case Core.Budget{limits, targets, maximum, work, graph_work, depth}: {==}

def Laws.path_targets_agree(budget, path):
  match budget:
    case Core.Budget{limits, targets, maximum, work, graph_work, depth}:
      Laws.map_value_projection_agrees(Map<&2, Bool>,
        Map.get(Map<&2, Bool>, MTip{}, targets, path))

def Laws.empty_path_observation_agrees(budget, path):
  match budget:
    case Core.Budget{limits, +targets, maximum, work, graph_work, depth}:
      %Laws.map_value_projection_agrees(
        Map<&2, Bool>,
        Map.get(Map<&2, Bool>, MTip{}, targets, path)
      ):
        {
          Core.Budget{
            limits,
            Map.set(
              &2,
              Map<&2, Bool>,
              targets,
              path,
              Core.map_result(Map<&2, Bool>, Map.get(Map<&2, Bool>, MTip{}, targets, path))
            ),
            maximum,
            work,
            graph_work,
            depth
          }
          == Core.Budget{
            limits,
            Map.set(&2, Map<&2, Bool>, targets, path, _),
            maximum,
            work,
            graph_work,
            depth
          }
          : Core.Budget
        }
      {==}

def Laws.target_charge_agrees(budget, path, identity):
  match budget:
    case Core.Budget{+limits, +targets, +maximum, +work, +graph_work, +depth}:
      %Laws.path_targets_agree(
        Core.Budget{limits, targets, maximum, work, graph_work, depth},
        path
      ):
        {
          CoreTraversal.charge_target(
            Core.Budget{limits, targets, maximum, work, graph_work, depth},
            path,
            identity
          )
          == Spec.observe_set(
            Core.Budget{limits, targets, maximum, work, graph_work, depth},
            path,
            Map.set(&2, Bool, _, identity, True{})
          )
          : Core.Budget
        }
      {==}

def Laws.kind_admission_agrees(expected, function):
  match expected function:
    case Core.AnyKind{} _: {==}
    case Core.TypeKind{} False{}: {==}
    case Core.TypeKind{} True{}: {==}
    case Core.FunctionKind{} False{}: {==}
    case Core.FunctionKind{} True{}: {==}
