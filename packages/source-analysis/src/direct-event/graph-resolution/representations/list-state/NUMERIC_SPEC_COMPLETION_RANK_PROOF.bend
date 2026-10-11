import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./UNSEEN_PROOF.bend as Unseen
import ./CHILD_INVENTORY_PROOF.bend as Child
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_COMPLETION.bend as Complete
import ./NUMERIC_SPEC_COMPLETION_RANK.bend as Payload
import ./NUMERIC_SPEC_COMPLETION_RANK_LAWS.bend as Laws
import ./NUMERIC_SPEC_COMPLETION_BASE_LAWS.bend as BaseLaws
import ./NUMERIC_SPEC_COMPLETION_BASE_PROOF.bend as BaseProof
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

# Exact approved raw-domain measures for the full recursive completion induction.
def Laws.allowance_visited_exact(facts, before, after, same):
  %Equal.sym(Own.Dictionary<Bool>, Measure.visited(after), Measure.visited(before), same):
    {(3n * Measure.unseen(facts, _) + 3n : Nat) == Complete.allowance(facts, before) : Nat}
    {==}

def Laws.unseen_root_rank_exact(facts, name, expected, state, declaration, selected, absent):
  match declaration:
    case Core.Declaration{handle, +identity, function, bundled, +references}:
      +declaration = {Core.Declaration{handle, identity, function, bundled, references}: Core.Declaration}
      +visited = Measure.visited(state)
      +unseen = Measure.unseen(facts, visited)
      %Equal.sym(Maybe<&2, Core.Declaration>, Spec.find_declaration(facts, name, expected), Some{declaration}, selected):
        {(3n * (unseen + Measure.reentry(visited, _) : Nat) + 3n : Nat) == Complete.allowance(facts, state) : Nat}
        %Equal.sym(Bool, Own.contains(Bool, visited, identity), False{}, absent):
          {(3n * (unseen + Measure.reentry_if(_, references) : Nat) + 3n : Nat) == Complete.allowance(facts, state) : Nat}
          %NatFacts.add_zero_sym(unseen):
            {(3n * _ + 3n : Nat) == Complete.allowance(facts, state) : Nat}
            {==}

def Laws.selected_root_inventory_drop(seen, facts, name, expected, state, path, declaration, selected, tested):
  match seen facts state declaration:
    case True{} Core.Facts{aware, +catalog, imports, supporting} Spec.State{+visited, budget, address, pending} Core.Declaration{handle, +identity, function, bundled, +references}:
      +after = Rank.unseen_catalog(Own.set(Bool, visited, identity, True{}), catalog)
      +before = Rank.unseen_catalog(visited, catalog)
      +count = List.length(&2, Core.Reference, references)
      NatFacts.add_le_add_right(after, before, count, Unseen.unseen_insertion_nonincreasing(catalog, visited, identity))
    case False{} Core.Facts{+aware, +catalog, imports, supporting} Spec.State{+visited, budget, address, pending} Core.Declaration{+handle, +identity, +function, +bundled, +references}:
      +declaration = {Core.Declaration{handle, identity, function, bundled, references}: Core.Declaration}
      +before = Rank.unseen_catalog(visited, catalog)
      %NatFacts.add_zero_sym(before):
        {Nat.is_le((Rank.unseen_catalog(Own.set(Bool, visited, identity, True{}), catalog) + List.length(&2, Core.Reference, references) : Nat), _) == True{} : Bool}
        Child.selected_child_inventory_decrease(catalog, visited, Spec.key(aware, expected, name), declaration, selected, tested)

def Laws.root_score_decreases(after, count, before, reentry, drop):
  +left = (3n * after + 3n * count : Nat)
  +right = (3n * (before + reentry : Nat) : Nat)
  scaled = {%NatFacts.mul_add(3n, after, count):
    {Nat.is_le(_, right) == True{} : Bool}
    NatFacts.mul_le_mul_left((after + count : Nat), (before + reentry : Nat), 3n, drop)
    : {Nat.is_le(left, right) == True{} : Bool}}
  %NatFacts.add_assoc_sym(left, 1n, 1n):
    {Nat.is_le(_, (right + 3n : Nat)) == True{} : Bool}
    NatFacts.add_le_add(left, 2n, right, 3n, scaled, {==})

def Laws.root_children_rank_decreases(facts, name, expected, state, path, depth, declaration, selected):
  match declaration:
    case Core.Declaration{+handle, +identity, +function, +bundled, +references}:
      +selected = selected
      +declaration = {Core.Declaration{handle, identity, function, bundled, references}: Core.Declaration}
      +visited = Measure.visited(state)
      +before = Measure.unseen(facts, visited)
      +after = Measure.unseen(facts, Own.set(Bool, visited, identity, True{}))
      +seen = Own.contains(Bool, visited, identity)
      +count = List.length(&2, Core.Reference, references)
      +reentry = Measure.reentry_if(seen, references)
      %Equal.sym(Own.Dictionary<Bool>, Measure.visited(Spec.enter(state, path, identity)), Own.set(Bool, visited, identity, True{}), BaseLaws.enter_visited_exact(state, path, identity)):
        {Nat.is_le((3n * Measure.unseen(facts, _) + 3n * count + 1n + 1n : Nat), Measure.root_rank(facts, name, expected, visited)) == True{} : Bool}
        %Equal.sym(Maybe<&2, Core.Declaration>, Spec.find_declaration(facts, name, expected), Some{declaration}, selected):
          {Nat.is_le((3n * after + 3n * count + 1n + 1n : Nat), (3n * (before + Measure.reentry(visited, _) : Nat) + 3n : Nat)) == True{} : Bool}
          Laws.root_score_decreases(after, count, before, reentry, Laws.selected_root_inventory_drop(seen, facts, name, expected, state, path, declaration, selected, {==}))

def Laws.request_rank_positive(request):
  match request:
    case Spec.Request{+facts, _, +name, +expected, _, +state}:
      +amount = (3n * (Measure.unseen(facts, Measure.visited(state)) + Measure.reentry(Measure.visited(state), Spec.find_declaration(facts, name, expected)) : Nat) : Nat)
      NatFacts.le_trans(1n, 3n, (amount + 3n : Nat), {==}, NatFacts.le_add_left(3n, amount))
    case Spec.ReferencesRequest{+items, +facts, _, _, _, _, +state}:
      +amount = (3n * Measure.unseen(facts, Measure.visited(state)) + 3n * List.length(&2, Core.Reference, items) : Nat)
      NatFacts.le_add_left(1n, amount)

def Laws.reference_head_allowance(before, count, fuel, enough):
  +head = (3n * before + 3n : Nat)
  +parent = (3n * before + 3n * (1n + count : Nat) + 1n : Nat)
  coefficient = {%NatFacts.mul_one_sym(3n):
    {Nat.is_le(_, (3n * (1n + count : Nat) : Nat)) == True{} : Bool}
    NatFacts.mul_le_mul_left(1n, (1n + count : Nat), 3n, NatFacts.succ_le_succ(0n, count, NatFacts.zero_le(count)))
    : {Nat.is_le(3n, (3n * (1n + count : Nat) : Nat)) == True{} : Bool}}
  lower = {NatFacts.add_le_add_right(head, (3n * before + 3n * (1n + count : Nat) : Nat), 1n,
    NatFacts.add_le_add_left(3n, (3n * (1n + count : Nat) : Nat), (3n * before : Nat), coefficient)):
    {Nat.is_le((head + 1n : Nat), parent) == True{} : Bool}}
  successor = {%NatFacts.add_comm_sym(1n, head):
    {Nat.is_le(_, (1n + fuel : Nat)) == True{} : Bool}
    NatFacts.le_trans((head + 1n : Nat), parent, (1n + fuel : Nat), lower, enough)
    : {Nat.is_le((1n + head : Nat), (1n + fuel : Nat)) == True{} : Bool}}
  NatFacts.le_of_succ_le_succ(head, fuel, successor)

def Laws.reference_sibling_bound(after, before, count, fuel, drop, enough):
  +sibling = (3n * after + 3n * count + 1n : Nat)
  +parent = (3n * before + 3n * (1n + count : Nat) + 1n : Nat)
  coefficient = {%NatFacts.mul_succ_sym(3n, count):
    {Nat.is_le((3n * count + 2n : Nat), (_ + 1n : Nat)) == True{} : Bool}
    %NatFacts.add_assoc((3n * count : Nat), 3n, 1n):
      {Nat.is_le((3n * count + 2n : Nat), _) == True{} : Bool}
      NatFacts.add_le_add_left(2n, 4n, (3n * count : Nat), {==})
    : {Nat.is_le((3n * count + 2n : Nat), (3n * (1n + count : Nat) + 1n : Nat)) == True{} : Bool}}
  lower = {%NatFacts.add_assoc_sym((3n * after + 3n * count : Nat), 1n, 1n):
    {Nat.is_le(_, parent) == True{} : Bool}
    %NatFacts.add_assoc((3n * after : Nat), (3n * count : Nat), 2n):
      {Nat.is_le(_, parent) == True{} : Bool}
      %NatFacts.add_assoc((3n * before : Nat), (3n * (1n + count : Nat) : Nat), 1n):
        {Nat.is_le((3n * after + (3n * count + 2n : Nat) : Nat), _) == True{} : Bool}
        NatFacts.add_le_add((3n * after : Nat), (3n * count + 2n : Nat), (3n * before : Nat), (3n * (1n + count : Nat) + 1n : Nat), NatFacts.mul_le_mul_left(after, before, 3n, drop), coefficient)
    : {Nat.is_le((sibling + 1n : Nat), parent) == True{} : Bool}}
  successor = {%NatFacts.add_comm_sym(1n, sibling):
    {Nat.is_le(_, (1n + fuel : Nat)) == True{} : Bool}
    NatFacts.le_trans((sibling + 1n : Nat), parent, (1n + fuel : Nat), lower, enough)
    : {Nat.is_le((1n + sibling : Nat), (1n + fuel : Nat)) == True{} : Bool}}
  NatFacts.le_of_succ_le_succ(sibling, fuel, successor)
