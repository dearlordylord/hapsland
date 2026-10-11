import Base
import ./Types.bend as T
import ./Core.bend as Materialize
import ./traversal/core.bend as Local
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

type RootOutcome is Data:
  RootUnavailable{}
  RootPrepared{frame: T.ResolverFrame}
  RootTraversalFailure{machine: Local.Machine}
  RootMalformedSyntax{}

def unit(frame: T.ResolverFrame) -> Maybe<&2, T.ProductValue>:
  match frame:
    case T.ResolverFrame{
      _,
      _,
      _,
      _,
      dependencies,
      root,
      nodes,
      references,
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
      artifacts
    }:
      Materialize.review_unit(root, nodes, references, artifacts, dependencies)

# IDs handed to Root are exactly those registered in the pending map, in order.
def frame_transition(frame: T.ResolverFrame, transition: Graph.Step) -> T.ResolverFrame:
  match frame:
    case T.ResolverFrame{
      branch,
      limits,
      _,
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
      paths,
      ids,
      targets,
      captured,
      artifacts
    }:
      match transition:
        case Graph.Step{graph, command}:
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
            paths,
            ids,
            targets,
            captured,
            artifacts
          }

def main() -> Unit:
  Unit{}
