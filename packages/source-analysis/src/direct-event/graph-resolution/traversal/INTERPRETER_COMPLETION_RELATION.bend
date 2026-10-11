import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RANK.bend as Rank
import ./INTERPRETER_MEASURE.bend as Measure
import ./patricia-proof/PATRICIA_RELATION.bend as Patricia

# Internal success predicates retain the exact actual recursive results. They
# are only abbreviations used to prove the already approved coupled theorem.
def build_complete(fuel: Nat, result: Spec.Build) -> Bool:
  match result:
    case Spec.Missing{_}: True{}
    case Spec.Built{_, tree}: Measure.flat_success(Spec.flatten(fuel, Spec.FlattenTree{tree}))
    case Spec.InsufficientBound{_}: False{}

def references_complete(fuel: Nat, owner: Nat, index: Nat,
    result: Spec.ReferencesResult) -> Bool:
  match result:
    case Spec.ReferencesResult{_, references}:
      Measure.flat_success(Spec.flatten(fuel, Spec.FlattenReferences{owner, index, references}))
    case Spec.ReferencesFailure{_}: False{}

def reference_complete(fuel: Nat, owner: Nat, index: Nat,
    result: Spec.ReferenceResult) -> Bool:
  match result:
    case Spec.ReferenceResult{_, reference}:
      Measure.flat_success(Spec.flat_head(reference, owner, index, Spec.flatten(fuel)))
    case Spec.ReferenceFailure{_}: False{}

def leaf(result: Spec.ReferenceResult) -> Bool:
  match result:
    case Spec.ReferenceResult{_, Spec.TreeReference{_, Spec.Included{_}}}: True{}
    case Spec.ReferenceResult{_, Spec.TreeReference{_, Spec.Omitted{_, _}}}: True{}
    case _: False{}

def allowance(facts: Core.Facts, state: Spec.State) -> Nat:
  (3n * Rank.unseen_catalog(Measure.visited(state), Rank.declaration_catalog(facts)) + 3n : Nat)

def contract(+fuel: Nat) -> Type:
  @+request: Spec.Request ->
  {Patricia.canonical(Bool, Measure.visited(Measure.request_state(request))) == True{} : Bool} ->
  {Nat.is_le(Measure.request_rank(request), fuel) == True{} : Bool} ->
  {Measure.projected_success(fuel, request, Spec.interpret(fuel, request)) == True{} : Bool}

# Exact internal rank-transport type. The final driver supplies the already
# checked concrete selected-root bound; this is not a final-law premise.
def selected_rank_type() -> Type:
  @+facts: Core.Facts -> @+name: String -> @+expected: Core.ExpectedKind ->
  @+visited: Map<&2, Bool> -> @+declaration: Core.Declaration ->
  {Patricia.canonical(Bool, visited) == True{} : Bool} ->
  {Spec.find_declaration(facts, name, expected) == Some{declaration} : Maybe<&2, Core.Declaration>} ->
  {CoreTraversal.has_identity(visited, CoreTraversal.declaration_identity(declaration)) == False{} : Bool} ->
  {
    Nat.is_le(
      Measure.root_rank(facts, name, expected, visited),
      (3n * Rank.unseen_catalog(visited, Rank.declaration_catalog(facts)) + 3n : Nat)
    )
    == True{}
    : Bool
  }

# One actual callback owner shared by inventory and completion transports.
def build_child(fuel: Nat, request: Spec.Request) -> Spec.Build:
  Spec.as_build(Spec.interpret(fuel, request))
