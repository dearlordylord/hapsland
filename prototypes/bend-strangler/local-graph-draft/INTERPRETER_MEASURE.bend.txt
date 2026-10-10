import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RANK.bend as Rank

# Proof-only measure. A selected root is charged after its actual identity insertion,
# so a root already in visited is covered without a separate reentry assumption.
def visited(state: Spec.State) -> Map<&2, Bool>:
  match state:
    case Spec.State{visited, _, _, _}: visited

def request_state(request: Spec.Request) -> Spec.State:
  match request:
    case Spec.Request{_, _, _, _, _, state}: state
    case Spec.ReferencesRequest{_, _, _, _, _, _, state}: state

def build_state(build: Spec.Build) -> Spec.State:
  match build:
    case Spec.Missing{state}: state
    case Spec.Built{state, _}: state
    case Spec.InsufficientBound{state}: state

def references_state(result: Spec.ReferencesResult) -> Spec.State:
  match result:
    case Spec.ReferencesResult{state, _}: state
    case Spec.ReferencesFailure{state}: state

def result_state(result: Spec.DispatchResult) -> Spec.State:
  match result:
    case Spec.BuildResult{build}: build_state(build)
    case Spec.ListResult{references}: references_state(references)

def root_load(+catalog: Map<&2, Maybe<&2, Core.Declaration>>, visited: Map<&2, Bool>,
    found: Maybe<&2, Core.Declaration>) -> Nat:
  match found:
    case None{}: 0n
    case Some{Core.Declaration{_, identity, _, _, references}}:
      (Rank.unseen_catalog(Map.set(&2, Bool, visited, identity, True{}), catalog)
        + List.length(&2, Core.Reference, references) : Nat)

def root_rank(+facts: Core.Facts, name: String, expected: Core.ExpectedKind,
    visited: Map<&2, Bool>) -> Nat:
  (3n * root_load(Rank.declaration_catalog(facts), visited,
    Spec.find_declaration(facts, name, expected)) + 3n : Nat)

def request_rank(request: Spec.Request) -> Nat:
  match request:
    case Spec.Request{facts, _, name, expected, _, state}:
      root_rank(facts, name, expected, visited(state))
    case Spec.ReferencesRequest{items, facts, _, _, _, _, state}:
      (3n * Rank.unseen_catalog(visited(state), Rank.declaration_catalog(facts))
        + 3n * List.length(&2, Core.Reference, items) + 1n : Nat)

def flat_success(flat: Spec.Flat) -> Bool:
  match flat:
    case Spec.Flat{_, _}: True{}
    case Spec.FlatFailure{}: False{}

# Success requires the right result variant and successful flatten at the SAME
# fuel used by the interpreter. Missing roots are complete observations.
def projected_success(fuel: Nat, request: Spec.Request, result: Spec.DispatchResult) -> Bool:
  match request result:
    case Spec.Request{_, _, _, _, _, _} Spec.BuildResult{Spec.Missing{_}}: True{}
    case Spec.Request{_, _, _, _, _, _} Spec.BuildResult{Spec.Built{_, tree}}:
      flat_success(Spec.flatten(fuel, Spec.FlattenTree{tree}))
    case Spec.ReferencesRequest{_, _, _, owner, index, _, _} Spec.ListResult{
      Spec.ReferencesResult{_, references}
    }:
      flat_success(Spec.flatten(fuel, Spec.FlattenReferences{owner, index, references}))
    case _ _: False{}
