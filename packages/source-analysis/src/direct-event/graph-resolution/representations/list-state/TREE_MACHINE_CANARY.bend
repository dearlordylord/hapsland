import Base
import ./BOUNDARY_ENCODING.bend as Encoding
import ./TREE_MACHINE_RELATION.bend as Relation
import ./TREE_MACHINE_CONTINUATION.bend as Continuation
import ./NUMERIC_SPEC_RANK.bend as Measure
import ../../traversal/RELATION.bend as StringRelation

# Complete finite observation surface; no proof-owner import.
def encoded_core(input: Encoding.Encoding) -> Relation.Observation:
  match input:
    case Encoding.MissingRegistry{}: Relation.Failed{}
    case Encoding.Encoded{_, facts, path, name, expected, visited, budget, depth}:
      Relation.core_observation(facts, path, name, expected, visited, budget, depth)

def encoded_recursive(input: Encoding.Encoding) -> Relation.Observation:
  match input:
    case Encoding.MissingRegistry{}: Relation.Failed{}
    case Encoding.Encoded{_, facts, path, name, expected, visited, budget, depth}:
      Relation.recursive_observation(facts, path, name, expected, visited, budget, depth)

def string_recursive(input: Encoding.Input) -> StringRelation.Observation:
  match input:
    case Encoding.Input{facts, state, path, name, expected, depth}:
      StringRelation.recursive_observation(facts, state, path, name, expected, depth)
