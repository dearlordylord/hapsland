import Base
import ./Types.bend as T
import ./Root.bend as Root
import ./traversal/core.bend as Local
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

# Accessors for the already-selected whole resolver state. No foreign imports.

def frame_branch(value: T.ResolverFrame) -> T.Branch:
  match value:
    case T.ResolverFrame{branch, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: branch

def with_frame_branch(value: T.ResolverFrame, replacement: T.Branch) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      _,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        replacement,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_limits(value: T.ResolverFrame) -> Graph.Limits:
  match value:
    case T.ResolverFrame{_, limits, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: limits

def with_frame_limits(value: T.ResolverFrame, replacement: Graph.Limits) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      _,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        replacement,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_graph(value: T.ResolverFrame) -> Graph.Graph:
  match value:
    case T.ResolverFrame{_, _, graph, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: graph

def with_frame_graph(value: T.ResolverFrame, replacement: Graph.Graph) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      _,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        replacement,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_command(value: T.ResolverFrame) -> Graph.Command:
  match value:
    case T.ResolverFrame{_, _, _, command, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: command

def with_frame_command(value: T.ResolverFrame, replacement: Graph.Command) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      _,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        replacement,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_dependencies(value: T.ResolverFrame) -> List<&2, String>:
  match value:
    case T.ResolverFrame{_, _, _, _, dependencies, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: dependencies

def with_frame_dependencies(
  value: T.ResolverFrame,
  replacement: List<&2, String>
) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      _,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        replacement,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_root(value: T.ResolverFrame) -> Nat:
  match value:
    case T.ResolverFrame{_, _, _, _, _, root, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: root

def with_frame_root(value: T.ResolverFrame, replacement: Nat) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      _,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        replacement,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_nodes(value: T.ResolverFrame) -> List<&2, Local.PlannedNode>:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, nodes, _, _, _, _, _, _, _, _, _, _, _, _, _}: nodes

def with_frame_nodes(
  value: T.ResolverFrame,
  replacement: List<&2, Local.PlannedNode>
) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      _,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        replacement,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_references(value: T.ResolverFrame) -> List<&2, Local.ReferenceSlot>:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, references, _, _, _, _, _, _, _, _, _, _, _, _}: references

def with_frame_references(
  value: T.ResolverFrame,
  replacement: List<&2, Local.ReferenceSlot>
) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      _,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        replacement,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_visited(value: T.ResolverFrame) -> Map<&2, Bool>:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, visited, _, _, _, _, _, _, _, _, _, _, _}: visited

def with_frame_visited(value: T.ResolverFrame, replacement: Map<&2, Bool>) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      _,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        replacement,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_budget(value: T.ResolverFrame) -> Local.Budget:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, budget, _, _, _, _, _, _, _, _, _, _}: budget

def with_frame_budget(value: T.ResolverFrame, replacement: Local.Budget) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      _,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        replacement,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_next_node(value: T.ResolverFrame) -> Nat:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, next_node, _, _, _, _, _, _, _, _, _}: next_node

def with_frame_next_node(value: T.ResolverFrame, replacement: Nat) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      _,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        replacement,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_next_edge(value: T.ResolverFrame) -> Nat:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, next_edge, _, _, _, _, _, _, _, _}: next_edge

def with_frame_next_edge(value: T.ResolverFrame, replacement: Nat) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      _,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        replacement,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_next_target(value: T.ResolverFrame) -> Nat:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, _, next_target, _, _, _, _, _, _, _}: next_target

def with_frame_next_target(value: T.ResolverFrame, replacement: Nat) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      _,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        replacement,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_next_artifact(value: T.ResolverFrame) -> Nat:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, _, _, next_artifact, _, _, _, _, _, _}: next_artifact

def with_frame_next_artifact(value: T.ResolverFrame, replacement: Nat) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      _,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        replacement,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_pending(value: T.ResolverFrame) -> Map<&2, Maybe<&2, Local.Pending>>:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, _, _, _, pending, _, _, _, _, _}: pending

def with_frame_pending(
  value: T.ResolverFrame,
  replacement: Map<&2, Maybe<&2, Local.Pending>>
) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      _,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        replacement,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_target_paths(value: T.ResolverFrame) -> Map<&2, Maybe<&2, T.Target>>:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, target_paths, _, _, _, _}: target_paths

def with_frame_target_paths(
  value: T.ResolverFrame,
  replacement: Map<&2, Maybe<&2, T.Target>>
) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      _,
      target_ids,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        replacement,
        target_ids,
        target_artifacts,
        captured,
        artifacts
      }

def frame_target_ids(value: T.ResolverFrame) -> Map<&2, Maybe<&2, Nat>>:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, target_ids, _, _, _}: target_ids

def with_frame_target_ids(
  value: T.ResolverFrame,
  replacement: Map<&2, Maybe<&2, Nat>>
) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      _,
      target_artifacts,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        replacement,
        target_artifacts,
        captured,
        artifacts
      }

def frame_target_artifacts(value: T.ResolverFrame) -> Map<&2, Maybe<&2, String>>:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, target_artifacts, _, _}: target_artifacts

def with_frame_target_artifacts(
  value: T.ResolverFrame,
  replacement: Map<&2, Maybe<&2, String>>
) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      _,
      captured,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        replacement,
        captured,
        artifacts
      }

def frame_captured(value: T.ResolverFrame) -> Map<&2, Maybe<&2, T.CapturedFacts>>:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, captured, _}: captured

def with_frame_captured(
  value: T.ResolverFrame,
  replacement: Map<&2, Maybe<&2, T.CapturedFacts>>
) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      _,
      artifacts
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        replacement,
        artifacts
      }

def frame_artifacts(value: T.ResolverFrame) -> List<&2, T.ArtifactEntry>:
  match value:
    case T.ResolverFrame{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, artifacts}: artifacts

def with_frame_artifacts(
  value: T.ResolverFrame,
  replacement: List<&2, T.ArtifactEntry>
) -> T.ResolverFrame:
  match value:
    case T.ResolverFrame{
      branch,
      limits,
      graph,
      command,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      target_paths,
      target_ids,
      target_artifacts,
      captured,
      _
    }:
      T.ResolverFrame{
        branch,
        limits,
        graph,
        command,
        dependencies,
        root,
        nodes,
        references,
        visited,
        budget,
        next_node,
        next_edge,
        next_target,
        next_artifact,
        pending,
        target_paths,
        target_ids,
        target_artifacts,
        captured,
        replacement
      }

def state_input(value: T.ResolverState) -> T.ResolverInput:
  match value:
    case T.ResolverState{input, _, _, _, _, _, _, _, _, _, _, _, _}: input

def with_state_input(value: T.ResolverState, replacement: T.ResolverInput) -> T.ResolverState:
  match value:
    case T.ResolverState{
      _,
      stage,
      clock,
      next_request,
      iteration_fuel,
      language,
      separator,
      frontend,
      frame,
      rust,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        replacement,
        stage,
        clock,
        next_request,
        iteration_fuel,
        language,
        separator,
        frontend,
        frame,
        rust,
        scratch,
        prepared,
        rust_work
      }

def state_stage(value: T.ResolverState) -> T.ResolverStage:
  match value:
    case T.ResolverState{_, stage, _, _, _, _, _, _, _, _, _, _, _}: stage

def with_state_stage(value: T.ResolverState, replacement: T.ResolverStage) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      _,
      clock,
      next_request,
      iteration_fuel,
      language,
      separator,
      frontend,
      frame,
      rust,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        replacement,
        clock,
        next_request,
        iteration_fuel,
        language,
        separator,
        frontend,
        frame,
        rust,
        scratch,
        prepared,
        rust_work
      }

def state_clock(value: T.ResolverState) -> Maybe<&2, T.ClockToken>:
  match value:
    case T.ResolverState{_, _, clock, _, _, _, _, _, _, _, _, _, _}: clock

def with_state_clock(
  value: T.ResolverState,
  replacement: Maybe<&2, T.ClockToken>
) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      _,
      next_request,
      iteration_fuel,
      language,
      separator,
      frontend,
      frame,
      rust,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        replacement,
        next_request,
        iteration_fuel,
        language,
        separator,
        frontend,
        frame,
        rust,
        scratch,
        prepared,
        rust_work
      }

def state_next_request(value: T.ResolverState) -> Nat:
  match value:
    case T.ResolverState{_, _, _, next_request, _, _, _, _, _, _, _, _, _}: next_request

def with_state_next_request(value: T.ResolverState, replacement: Nat) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      _,
      iteration_fuel,
      language,
      separator,
      frontend,
      frame,
      rust,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        replacement,
        iteration_fuel,
        language,
        separator,
        frontend,
        frame,
        rust,
        scratch,
        prepared,
        rust_work
      }

def state_iteration_fuel(value: T.ResolverState) -> Nat:
  match value:
    case T.ResolverState{_, _, _, _, iteration_fuel, _, _, _, _, _, _, _, _}: iteration_fuel

def with_state_iteration_fuel(value: T.ResolverState, replacement: Nat) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      next_request,
      _,
      language,
      separator,
      frontend,
      frame,
      rust,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        next_request,
        replacement,
        language,
        separator,
        frontend,
        frame,
        rust,
        scratch,
        prepared,
        rust_work
      }

def state_language(value: T.ResolverState) -> Maybe<&2, T.Language>:
  match value:
    case T.ResolverState{_, _, _, _, _, language, _, _, _, _, _, _, _}: language

def with_state_language(
  value: T.ResolverState,
  replacement: Maybe<&2, T.Language>
) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      next_request,
      iteration_fuel,
      _,
      separator,
      frontend,
      frame,
      rust,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        next_request,
        iteration_fuel,
        replacement,
        separator,
        frontend,
        frame,
        rust,
        scratch,
        prepared,
        rust_work
      }

def state_separator(value: T.ResolverState) -> String:
  match value:
    case T.ResolverState{_, _, _, _, _, _, separator, _, _, _, _, _, _}: separator

def with_state_separator(value: T.ResolverState, replacement: String) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      next_request,
      iteration_fuel,
      language,
      _,
      frontend,
      frame,
      rust,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        next_request,
        iteration_fuel,
        language,
        replacement,
        frontend,
        frame,
        rust,
        scratch,
        prepared,
        rust_work
      }

def state_frontend(value: T.ResolverState) -> T.RustContext:
  match value:
    case T.ResolverState{_, _, _, _, _, _, _, frontend, _, _, _, _, _}: frontend

def with_state_frontend(value: T.ResolverState, replacement: T.RustContext) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      next_request,
      iteration_fuel,
      language,
      separator,
      _,
      frame,
      rust,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        next_request,
        iteration_fuel,
        language,
        separator,
        replacement,
        frame,
        rust,
        scratch,
        prepared,
        rust_work
      }

def state_frame(value: T.ResolverState) -> Maybe<&2, T.ResolverFrame>:
  match value:
    case T.ResolverState{_, _, _, _, _, _, _, _, frame, _, _, _, _}: frame

def with_state_frame(
  value: T.ResolverState,
  replacement: Maybe<&2, T.ResolverFrame>
) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      next_request,
      iteration_fuel,
      language,
      separator,
      frontend,
      _,
      rust,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        next_request,
        iteration_fuel,
        language,
        separator,
        frontend,
        replacement,
        rust,
        scratch,
        prepared,
        rust_work
      }

def state_rust(value: T.ResolverState) -> Maybe<&2, T.RustPreparation>:
  match value:
    case T.ResolverState{_, _, _, _, _, _, _, _, _, rust, _, _, _}: rust

def with_state_rust(
  value: T.ResolverState,
  replacement: Maybe<&2, T.RustPreparation>
) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      next_request,
      iteration_fuel,
      language,
      separator,
      frontend,
      frame,
      _,
      scratch,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        next_request,
        iteration_fuel,
        language,
        separator,
        frontend,
        frame,
        replacement,
        scratch,
        prepared,
        rust_work
      }

def state_scratch(value: T.ResolverState) -> T.ResolverScratch:
  match value:
    case T.ResolverState{_, _, _, _, _, _, _, _, _, _, scratch, _, _}: scratch

def with_state_scratch(value: T.ResolverState, replacement: T.ResolverScratch) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      next_request,
      iteration_fuel,
      language,
      separator,
      frontend,
      frame,
      rust,
      _,
      prepared,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        next_request,
        iteration_fuel,
        language,
        separator,
        frontend,
        frame,
        rust,
        replacement,
        prepared,
        rust_work
      }

def state_prepared(value: T.ResolverState) -> T.PreparedLanguage:
  match value:
    case T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, prepared, _}: prepared

def with_state_prepared(value: T.ResolverState, replacement: T.PreparedLanguage) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      next_request,
      iteration_fuel,
      language,
      separator,
      frontend,
      frame,
      rust,
      scratch,
      _,
      rust_work
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        next_request,
        iteration_fuel,
        language,
        separator,
        frontend,
        frame,
        rust,
        scratch,
        replacement,
        rust_work
      }

def state_rust_work(value: T.ResolverState) -> T.RustWork:
  match value:
    case T.ResolverState{_, _, _, _, _, _, _, _, _, _, _, _, rust_work}: rust_work

def with_state_rust_work(value: T.ResolverState, replacement: T.RustWork) -> T.ResolverState:
  match value:
    case T.ResolverState{
      input,
      stage,
      clock,
      next_request,
      iteration_fuel,
      language,
      separator,
      frontend,
      frame,
      rust,
      scratch,
      prepared,
      _
    }:
      T.ResolverState{
        input,
        stage,
        clock,
        next_request,
        iteration_fuel,
        language,
        separator,
        frontend,
        frame,
        rust,
        scratch,
        prepared,
        replacement
      }

def input_invocation(value: T.ResolverInput) -> Nat:
  match value:
    case T.ResolverInput{invocation, _, _, _, _, _, _, _, _}: invocation

def input_root_path(value: T.ResolverInput) -> String:
  match value:
    case T.ResolverInput{_, root_path, _, _, _, _, _, _, _}: root_path

def input_root_capture(value: T.ResolverInput) -> T.CaptureToken:
  match value:
    case T.ResolverInput{_, _, root_capture, _, _, _, _, _, _}: root_capture

def input_root_bytes(value: T.ResolverInput) -> Nat:
  match value:
    case T.ResolverInput{_, _, _, root_bytes, _, _, _, _, _}: root_bytes

def input_root_name(value: T.ResolverInput) -> String:
  match value:
    case T.ResolverInput{_, _, _, _, root_name, _, _, _, _}: root_name

def input_root_source(value: T.ResolverInput) -> String:
  match value:
    case T.ResolverInput{_, _, _, _, _, root_source, _, _, _}: root_source

def input_branch(value: T.ResolverInput) -> T.Branch:
  match value:
    case T.ResolverInput{_, _, _, _, _, _, branch, _, _}: branch

def input_caller_cache(value: T.ResolverInput) -> Maybe<&2, T.CacheToken>:
  match value:
    case T.ResolverInput{_, _, _, _, _, _, _, caller_cache, _}: caller_cache

def input_limits(value: T.ResolverInput) -> Graph.Limits:
  match value:
    case T.ResolverInput{_, _, _, _, _, _, _, _, limits}: limits

def scratch_paths(value: T.ResolverScratch) -> List<&2, String>:
  match value:
    case T.ResolverScratch{paths, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: paths

def with_scratch_paths(
  value: T.ResolverScratch,
  replacement: List<&2, String>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      _,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        replacement,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_found_paths(value: T.ResolverScratch) -> List<&2, String>:
  match value:
    case T.ResolverScratch{_, found_paths, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: found_paths

def with_scratch_found_paths(
  value: T.ResolverScratch,
  replacement: List<&2, String>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      _,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        replacement,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_active_target(value: T.ResolverScratch) -> Maybe<&2, Nat>:
  match value:
    case T.ResolverScratch{_, _, active_target, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: active_target

def with_scratch_active_target(
  value: T.ResolverScratch,
  replacement: Maybe<&2, Nat>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      _,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        replacement,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_selection(value: T.ResolverScratch) -> Maybe<&2, T.SelectionToken>:
  match value:
    case T.ResolverScratch{_, _, _, selection, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: selection

def with_scratch_selection(
  value: T.ResolverScratch,
  replacement: Maybe<&2, T.SelectionToken>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      _,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        replacement,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_capture(value: T.ResolverScratch) -> Maybe<&2, T.CaptureToken>:
  match value:
    case T.ResolverScratch{_, _, _, _, capture, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: capture

def with_scratch_capture(
  value: T.ResolverScratch,
  replacement: Maybe<&2, T.CaptureToken>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      _,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        replacement,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_source_bytes(value: T.ResolverScratch) -> Nat:
  match value:
    case T.ResolverScratch{_, _, _, _, _, source_bytes, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: source_bytes

def with_scratch_source_bytes(value: T.ResolverScratch, replacement: Nat) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      _,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        replacement,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_source_facts(value: T.ResolverScratch) -> Maybe<&2, T.SourceFacts>:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, source_facts, _, _, _, _, _, _, _, _, _, _, _, _, _}: source_facts

def with_scratch_source_facts(
  value: T.ResolverScratch,
  replacement: Maybe<&2, T.SourceFacts>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      _,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        replacement,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_tentative(value: T.ResolverScratch) -> Maybe<&2, T.TentativeChild>:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, tentative, _, _, _, _, _, _, _, _, _, _, _, _}: tentative

def with_scratch_tentative(
  value: T.ResolverScratch,
  replacement: Maybe<&2, T.TentativeChild>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      _,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        replacement,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_directory(value: T.ResolverScratch) -> String:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, _, directory, _, _, _, _, _, _, _, _, _, _, _}: directory

def with_scratch_directory(value: T.ResolverScratch, replacement: String) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      _,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        replacement,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_resolved_path(value: T.ResolverScratch) -> String:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, _, _, resolved_path, _, _, _, _, _, _, _, _, _, _}: resolved_path

def with_scratch_resolved_path(value: T.ResolverScratch, replacement: String) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      _,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        replacement,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_capture_path(value: T.ResolverScratch) -> String:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, _, _, _, capture_path, _, _, _, _, _, _, _, _, _}: capture_path

def with_scratch_capture_path(value: T.ResolverScratch, replacement: String) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      _,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        replacement,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_ancestor_depth(value: T.ResolverScratch) -> Nat:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, _, _, _, _, ancestor_depth, _, _, _, _, _, _, _, _}: ancestor_depth

def with_scratch_ancestor_depth(value: T.ResolverScratch, replacement: Nat) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      _,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        replacement,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_working_route(value: T.ResolverScratch) -> Maybe<&2, T.RustRoute>:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, _, _, _, _, _, working_route, _, _, _, _, _, _, _}: working_route

def with_scratch_working_route(
  value: T.ResolverScratch,
  replacement: Maybe<&2, T.RustRoute>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      _,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        replacement,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_preparation_cache(value: T.ResolverScratch) -> Maybe<&2, T.CacheToken>:
  match value:
    case T.ResolverScratch{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      preparation_cache,
      _,
      _,
      _,
      _,
      _,
      _
    }: preparation_cache

def with_scratch_preparation_cache(
  value: T.ResolverScratch,
  replacement: Maybe<&2, T.CacheToken>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      _,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        replacement,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_cargo_syntax(value: T.ResolverScratch) -> Maybe<&2, T.TomlValue>:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, _, _, _, _, _, _, _, cargo_syntax, _, _, _, _, _}: cargo_syntax

def with_scratch_cargo_syntax(
  value: T.ResolverScratch,
  replacement: Maybe<&2, T.TomlValue>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      _,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        replacement,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_module_names(value: T.ResolverScratch) -> List<&2, String>:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, module_names, _, _, _, _}: module_names

def with_scratch_module_names(
  value: T.ResolverScratch,
  replacement: List<&2, String>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      _,
      diagnostic,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        replacement,
        diagnostic,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_diagnostic(value: T.ResolverScratch) -> Maybe<&2, T.CaptureDiagnostic>:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, diagnostic, _, _, _}: diagnostic

def with_scratch_diagnostic(
  value: T.ResolverScratch,
  replacement: Maybe<&2, T.CaptureDiagnostic>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      _,
      measured_product,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        replacement,
        measured_product,
        pending_edge,
        bundled_previous
      }

def scratch_measured_product(value: T.ResolverScratch) -> Maybe<&2, T.ProductValue>:
  match value:
    case T.ResolverScratch{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      measured_product,
      _,
      _
    }: measured_product

def with_scratch_measured_product(
  value: T.ResolverScratch,
  replacement: Maybe<&2, T.ProductValue>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      _,
      pending_edge,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        replacement,
        pending_edge,
        bundled_previous
      }

def scratch_pending_edge(value: T.ResolverScratch) -> Maybe<&2, Local.Pending>:
  match value:
    case T.ResolverScratch{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, pending_edge, _}: pending_edge

def with_scratch_pending_edge(
  value: T.ResolverScratch,
  replacement: Maybe<&2, Local.Pending>
) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      _,
      bundled_previous
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        replacement,
        bundled_previous
      }

def scratch_bundled_previous(value: T.ResolverScratch) -> Nat:
  match value:
    case T.ResolverScratch{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      bundled_previous
    }: bundled_previous

def with_scratch_bundled_previous(value: T.ResolverScratch, replacement: Nat) -> T.ResolverScratch:
  match value:
    case T.ResolverScratch{
      paths,
      found_paths,
      active_target,
      selection,
      capture,
      source_bytes,
      source_facts,
      tentative,
      directory,
      resolved_path,
      capture_path,
      ancestor_depth,
      working_route,
      preparation_cache,
      cargo_syntax,
      module_names,
      diagnostic,
      measured_product,
      pending_edge,
      _
    }:
      T.ResolverScratch{
        paths,
        found_paths,
        active_target,
        selection,
        capture,
        source_bytes,
        source_facts,
        tentative,
        directory,
        resolved_path,
        capture_path,
        ancestor_depth,
        working_route,
        preparation_cache,
        cargo_syntax,
        module_names,
        diagnostic,
        measured_product,
        pending_edge,
        replacement
      }

def rust_graph(value: T.RustPreparation) -> Graph.Graph:
  match value:
    case T.RustPreparation{graph, _, _, _, _, _, _, _, _, _}: graph

def with_rust_graph(value: T.RustPreparation, replacement: Graph.Graph) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      _,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      invalid,
      dependencies,
      roles
    }:
      T.RustPreparation{
        replacement,
        command,
        tasks,
        targets,
        next_edge,
        next_target,
        active,
        invalid,
        dependencies,
        roles
      }

def rust_command(value: T.RustPreparation) -> Graph.Command:
  match value:
    case T.RustPreparation{_, command, _, _, _, _, _, _, _, _}: command

def with_rust_command(value: T.RustPreparation, replacement: Graph.Command) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      graph,
      _,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      invalid,
      dependencies,
      roles
    }:
      T.RustPreparation{
        graph,
        replacement,
        tasks,
        targets,
        next_edge,
        next_target,
        active,
        invalid,
        dependencies,
        roles
      }

def rust_tasks(value: T.RustPreparation) -> Map<&2, Maybe<&2, T.RustTask>>:
  match value:
    case T.RustPreparation{_, _, tasks, _, _, _, _, _, _, _}: tasks

def with_rust_tasks(
  value: T.RustPreparation,
  replacement: Map<&2, Maybe<&2, T.RustTask>>
) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      graph,
      command,
      _,
      targets,
      next_edge,
      next_target,
      active,
      invalid,
      dependencies,
      roles
    }:
      T.RustPreparation{
        graph,
        command,
        replacement,
        targets,
        next_edge,
        next_target,
        active,
        invalid,
        dependencies,
        roles
      }

def rust_targets(value: T.RustPreparation) -> Map<&2, Maybe<&2, Nat>>:
  match value:
    case T.RustPreparation{_, _, _, targets, _, _, _, _, _, _}: targets

def with_rust_targets(
  value: T.RustPreparation,
  replacement: Map<&2, Maybe<&2, Nat>>
) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      graph,
      command,
      tasks,
      _,
      next_edge,
      next_target,
      active,
      invalid,
      dependencies,
      roles
    }:
      T.RustPreparation{
        graph,
        command,
        tasks,
        replacement,
        next_edge,
        next_target,
        active,
        invalid,
        dependencies,
        roles
      }

def rust_next_edge(value: T.RustPreparation) -> Nat:
  match value:
    case T.RustPreparation{_, _, _, _, next_edge, _, _, _, _, _}: next_edge

def with_rust_next_edge(value: T.RustPreparation, replacement: Nat) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      graph,
      command,
      tasks,
      targets,
      _,
      next_target,
      active,
      invalid,
      dependencies,
      roles
    }:
      T.RustPreparation{
        graph,
        command,
        tasks,
        targets,
        replacement,
        next_target,
        active,
        invalid,
        dependencies,
        roles
      }

def rust_next_target(value: T.RustPreparation) -> Nat:
  match value:
    case T.RustPreparation{_, _, _, _, _, next_target, _, _, _, _}: next_target

def with_rust_next_target(value: T.RustPreparation, replacement: Nat) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      _,
      active,
      invalid,
      dependencies,
      roles
    }:
      T.RustPreparation{
        graph,
        command,
        tasks,
        targets,
        next_edge,
        replacement,
        active,
        invalid,
        dependencies,
        roles
      }

def rust_active(value: T.RustPreparation) -> Maybe<&2, T.RustTask>:
  match value:
    case T.RustPreparation{_, _, _, _, _, _, active, _, _, _}: active

def with_rust_active(
  value: T.RustPreparation,
  replacement: Maybe<&2, T.RustTask>
) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      _,
      invalid,
      dependencies,
      roles
    }:
      T.RustPreparation{
        graph,
        command,
        tasks,
        targets,
        next_edge,
        next_target,
        replacement,
        invalid,
        dependencies,
        roles
      }

def rust_invalid(value: T.RustPreparation) -> Bool:
  match value:
    case T.RustPreparation{_, _, _, _, _, _, _, invalid, _, _}: invalid

def with_rust_invalid(value: T.RustPreparation, replacement: Bool) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      _,
      dependencies,
      roles
    }:
      T.RustPreparation{
        graph,
        command,
        tasks,
        targets,
        next_edge,
        next_target,
        active,
        replacement,
        dependencies,
        roles
      }

def rust_dependencies(value: T.RustPreparation) -> List<&2, String>:
  match value:
    case T.RustPreparation{_, _, _, _, _, _, _, _, dependencies, _}: dependencies

def with_rust_dependencies(
  value: T.RustPreparation,
  replacement: List<&2, String>
) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      invalid,
      _,
      roles
    }:
      T.RustPreparation{
        graph,
        command,
        tasks,
        targets,
        next_edge,
        next_target,
        active,
        invalid,
        replacement,
        roles
      }

def rust_roles(value: T.RustPreparation) -> List<&2, T.RustContext>:
  match value:
    case T.RustPreparation{_, _, _, _, _, _, _, _, _, roles}: roles

def with_rust_roles(
  value: T.RustPreparation,
  replacement: List<&2, T.RustContext>
) -> T.RustPreparation:
  match value:
    case T.RustPreparation{
      graph,
      command,
      tasks,
      targets,
      next_edge,
      next_target,
      active,
      invalid,
      dependencies,
      _
    }:
      T.RustPreparation{
        graph,
        command,
        tasks,
        targets,
        next_edge,
        next_target,
        active,
        invalid,
        dependencies,
        replacement
      }

def work_needs_binding(value: T.RustWork) -> Bool:
  match value:
    case T.RustWork{needs_binding, _, _, _, _, _, _, _, _, _, _, _}: needs_binding

def with_work_needs_binding(value: T.RustWork, replacement: Bool) -> T.RustWork:
  match value:
    case T.RustWork{
      _,
      fuel,
      cargo_plan,
      tasks_out,
      remaining_paths,
      candidates_rev,
      relative_selected,
      remaining_map,
      rebased_rev,
      map_base,
      role_root,
      follow_return
    }:
      T.RustWork{
        replacement,
        fuel,
        cargo_plan,
        tasks_out,
        remaining_paths,
        candidates_rev,
        relative_selected,
        remaining_map,
        rebased_rev,
        map_base,
        role_root,
        follow_return
      }

def work_fuel(value: T.RustWork) -> Nat:
  match value:
    case T.RustWork{_, fuel, _, _, _, _, _, _, _, _, _, _}: fuel

def with_work_fuel(value: T.RustWork, replacement: Nat) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      _,
      cargo_plan,
      tasks_out,
      remaining_paths,
      candidates_rev,
      relative_selected,
      remaining_map,
      rebased_rev,
      map_base,
      role_root,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        replacement,
        cargo_plan,
        tasks_out,
        remaining_paths,
        candidates_rev,
        relative_selected,
        remaining_map,
        rebased_rev,
        map_base,
        role_root,
        follow_return
      }

def work_cargo_plan(value: T.RustWork) -> Maybe<&2, T.CargoPlan>:
  match value:
    case T.RustWork{_, _, cargo_plan, _, _, _, _, _, _, _, _, _}: cargo_plan

def with_work_cargo_plan(value: T.RustWork, replacement: Maybe<&2, T.CargoPlan>) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      _,
      tasks_out,
      remaining_paths,
      candidates_rev,
      relative_selected,
      remaining_map,
      rebased_rev,
      map_base,
      role_root,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        fuel,
        replacement,
        tasks_out,
        remaining_paths,
        candidates_rev,
        relative_selected,
        remaining_map,
        rebased_rev,
        map_base,
        role_root,
        follow_return
      }

def work_tasks_out(value: T.RustWork) -> List<&2, T.RustTask>:
  match value:
    case T.RustWork{_, _, _, tasks_out, _, _, _, _, _, _, _, _}: tasks_out

def with_work_tasks_out(value: T.RustWork, replacement: List<&2, T.RustTask>) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      cargo_plan,
      _,
      remaining_paths,
      candidates_rev,
      relative_selected,
      remaining_map,
      rebased_rev,
      map_base,
      role_root,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        fuel,
        cargo_plan,
        replacement,
        remaining_paths,
        candidates_rev,
        relative_selected,
        remaining_map,
        rebased_rev,
        map_base,
        role_root,
        follow_return
      }

def work_remaining_paths(value: T.RustWork) -> List<&2, String>:
  match value:
    case T.RustWork{_, _, _, _, remaining_paths, _, _, _, _, _, _, _}: remaining_paths

def with_work_remaining_paths(value: T.RustWork, replacement: List<&2, String>) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      cargo_plan,
      tasks_out,
      _,
      candidates_rev,
      relative_selected,
      remaining_map,
      rebased_rev,
      map_base,
      role_root,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        fuel,
        cargo_plan,
        tasks_out,
        replacement,
        candidates_rev,
        relative_selected,
        remaining_map,
        rebased_rev,
        map_base,
        role_root,
        follow_return
      }

def work_candidates_rev(value: T.RustWork) -> List<&2, String>:
  match value:
    case T.RustWork{_, _, _, _, _, candidates_rev, _, _, _, _, _, _}: candidates_rev

def with_work_candidates_rev(value: T.RustWork, replacement: List<&2, String>) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      cargo_plan,
      tasks_out,
      remaining_paths,
      _,
      relative_selected,
      remaining_map,
      rebased_rev,
      map_base,
      role_root,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        fuel,
        cargo_plan,
        tasks_out,
        remaining_paths,
        replacement,
        relative_selected,
        remaining_map,
        rebased_rev,
        map_base,
        role_root,
        follow_return
      }

def work_relative_selected(value: T.RustWork) -> String:
  match value:
    case T.RustWork{_, _, _, _, _, _, relative_selected, _, _, _, _, _}: relative_selected

def with_work_relative_selected(value: T.RustWork, replacement: String) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      cargo_plan,
      tasks_out,
      remaining_paths,
      candidates_rev,
      _,
      remaining_map,
      rebased_rev,
      map_base,
      role_root,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        fuel,
        cargo_plan,
        tasks_out,
        remaining_paths,
        candidates_rev,
        replacement,
        remaining_map,
        rebased_rev,
        map_base,
        role_root,
        follow_return
      }

def work_remaining_map(value: T.RustWork) -> List<&2, T.OrderedField<String>>:
  match value:
    case T.RustWork{_, _, _, _, _, _, _, remaining_map, _, _, _, _}: remaining_map

def with_work_remaining_map(
  value: T.RustWork,
  replacement: List<&2, T.OrderedField<String>>
) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      cargo_plan,
      tasks_out,
      remaining_paths,
      candidates_rev,
      relative_selected,
      _,
      rebased_rev,
      map_base,
      role_root,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        fuel,
        cargo_plan,
        tasks_out,
        remaining_paths,
        candidates_rev,
        relative_selected,
        replacement,
        rebased_rev,
        map_base,
        role_root,
        follow_return
      }

def work_rebased_rev(value: T.RustWork) -> List<&2, T.OrderedField<String>>:
  match value:
    case T.RustWork{_, _, _, _, _, _, _, _, rebased_rev, _, _, _}: rebased_rev

def with_work_rebased_rev(
  value: T.RustWork,
  replacement: List<&2, T.OrderedField<String>>
) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      cargo_plan,
      tasks_out,
      remaining_paths,
      candidates_rev,
      relative_selected,
      remaining_map,
      _,
      map_base,
      role_root,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        fuel,
        cargo_plan,
        tasks_out,
        remaining_paths,
        candidates_rev,
        relative_selected,
        remaining_map,
        replacement,
        map_base,
        role_root,
        follow_return
      }

def work_map_base(value: T.RustWork) -> String:
  match value:
    case T.RustWork{_, _, _, _, _, _, _, _, _, map_base, _, _}: map_base

def with_work_map_base(value: T.RustWork, replacement: String) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      cargo_plan,
      tasks_out,
      remaining_paths,
      candidates_rev,
      relative_selected,
      remaining_map,
      rebased_rev,
      _,
      role_root,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        fuel,
        cargo_plan,
        tasks_out,
        remaining_paths,
        candidates_rev,
        relative_selected,
        remaining_map,
        rebased_rev,
        replacement,
        role_root,
        follow_return
      }

def work_role_root(value: T.RustWork) -> Bool:
  match value:
    case T.RustWork{_, _, _, _, _, _, _, _, _, _, role_root, _}: role_root

def with_work_role_root(value: T.RustWork, replacement: Bool) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      cargo_plan,
      tasks_out,
      remaining_paths,
      candidates_rev,
      relative_selected,
      remaining_map,
      rebased_rev,
      map_base,
      _,
      follow_return
    }:
      T.RustWork{
        needs_binding,
        fuel,
        cargo_plan,
        tasks_out,
        remaining_paths,
        candidates_rev,
        relative_selected,
        remaining_map,
        rebased_rev,
        map_base,
        replacement,
        follow_return
      }

def work_follow_return(value: T.RustWork) -> T.RustFollowReturn:
  match value:
    case T.RustWork{_, _, _, _, _, _, _, _, _, _, _, follow_return}: follow_return

def with_work_follow_return(value: T.RustWork, replacement: T.RustFollowReturn) -> T.RustWork:
  match value:
    case T.RustWork{
      needs_binding,
      fuel,
      cargo_plan,
      tasks_out,
      remaining_paths,
      candidates_rev,
      relative_selected,
      remaining_map,
      rebased_rev,
      map_base,
      role_root,
      _
    }:
      T.RustWork{
        needs_binding,
        fuel,
        cargo_plan,
        tasks_out,
        remaining_paths,
        candidates_rev,
        relative_selected,
        remaining_map,
        rebased_rev,
        map_base,
        role_root,
        replacement
      }

def route_path(value: T.RustRoute) -> String:
  match value:
    case T.RustRoute{path, _, _, _}: path

def with_route_path(value: T.RustRoute, replacement: String) -> T.RustRoute:
  match value:
    case T.RustRoute{_, crate_path, modules, depth}:
      T.RustRoute{replacement, crate_path, modules, depth}

def route_crate_path(value: T.RustRoute) -> String:
  match value:
    case T.RustRoute{_, crate_path, _, _}: crate_path

def with_route_crate_path(value: T.RustRoute, replacement: String) -> T.RustRoute:
  match value:
    case T.RustRoute{path, _, modules, depth}:
      T.RustRoute{path, replacement, modules, depth}

def route_modules(value: T.RustRoute) -> Maybe<&2, List<&2, T.OrderedField<String>>>:
  match value:
    case T.RustRoute{_, _, modules, _}: modules

def with_route_modules(
  value: T.RustRoute,
  replacement: Maybe<&2, List<&2, T.OrderedField<String>>>
) -> T.RustRoute:
  match value:
    case T.RustRoute{path, crate_path, _, depth}:
      T.RustRoute{path, crate_path, replacement, depth}

def route_depth(value: T.RustRoute) -> Nat:
  match value:
    case T.RustRoute{_, _, _, depth}: depth

def with_route_depth(value: T.RustRoute, replacement: Nat) -> T.RustRoute:
  match value:
    case T.RustRoute{path, crate_path, modules, _}:
      T.RustRoute{path, crate_path, modules, replacement}

def advance(+frame: T.ResolverFrame, event: Graph.GraphEvent) -> T.ResolverFrame:
  Root.frame_transition(frame, Graph.step(frame_graph(frame), event))

def request(
  +state: T.ResolverState,
  stage: T.ResolverStage,
  operation: T.Operation
) -> T.ResolverStep:
  +id = state_next_request(state)
  owner = input_invocation(state_input(state))
  T.AwaitService{
    with_state_next_request(with_state_stage(state, stage), (id + 1n : Nat)),
    T.Request{owner, id, operation}
  }

def main() -> Unit:
  Unit{}
