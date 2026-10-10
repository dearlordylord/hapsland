import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./NUMERIC_SPEC.bend as Spec
import ./RANK.bend as Rank

# Independent request measure for the entire recursive specification.
# A root already in visited still processes its references; count its reentry.
def visited(state: Spec.State) -> Own.Dictionary<Bool>:
  match state:
    case Spec.State{visited, _, _, _}: visited

def catalog(facts: Core.Facts) -> Own.Dictionary<Maybe<&2, Core.Declaration>>:
  match facts:
    case Core.Facts{_, declarations, _, _}: declarations

def unseen(facts: Core.Facts, seen: Own.Dictionary<Bool>) -> Nat:
  Rank.unseen_catalog(seen, catalog(facts))

def reentry_if(seen: Bool, references: List<&2, Core.Reference>) -> Nat:
  match seen:
    case True{}: List.length(&2, Core.Reference, references)
    case False{}: 0n

def reentry(seen: Own.Dictionary<Bool>, found: Maybe<&2, Core.Declaration>) -> Nat:
  match found:
    case None{}: 0n
    case Some{Core.Declaration{_, identity, _, _, references}}:
      reentry_if(Own.contains(Bool, seen, identity), references)

def root_rank(+facts: Core.Facts, name: Core.Label, expected: Core.ExpectedKind,
    +seen: Own.Dictionary<Bool>) -> Nat:
  (3n * (unseen(facts, seen) + reentry(seen, Spec.find_declaration(facts, name, expected))) + 3n : Nat)

def request_rank(request: Spec.Request) -> Nat:
  match request:
    case Spec.Request{facts, _, name, expected, _, state}:
      root_rank(facts, name, expected, visited(state))
    case Spec.ReferencesRequest{items, facts, _, _, _, _, state}:
      (3n * unseen(facts, visited(state)) + 3n * List.length(&2, Core.Reference, items) + 1n : Nat)

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

def successful_build(build: Spec.Build) -> Bool:
  match build:
    case Spec.InsufficientBound{_}: False{}
    case _: True{}

def successful_references(result: Spec.ReferencesResult) -> Bool:
  match result:
    case Spec.ReferencesFailure{_}: False{}
    case _: True{}

def successful(result: Spec.DispatchResult) -> Bool:
  match result:
    case Spec.BuildResult{build}: successful_build(build)
    case Spec.ListResult{references}: successful_references(references)
