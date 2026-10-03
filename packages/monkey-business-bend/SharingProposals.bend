# Unapproved finite primitive declarations under #176. No falsification or
# checked proof yet; no whole-resident or general progress claim is made.
import Base
import ./SharingScenario.bend as S
import ./FreshnessScenario.bend as F

# Exact characterization for every pair of scoped prepared identities. An
# equal input in another advicee partition cannot accidentally become a join.
law exact_scoped_key:
  for +partition: Nat
  for +prepared: Nat
  for +owner: Nat
  for +other_prepared: Nat
  {S.same_key(S.Key{partition,prepared},S.Key{owner,other_prepared}) == (Nat.is_eq(partition,owner) && Nat.is_eq(prepared,other_prepared)) : Bool}

# A refused departure feedback preserves every captured original callback,
# remaining member and advice identity, for every finite evaluation list.
law refused_departure_preserves_evaluation:
  for +evaluations: List<&2,S.Evaluation>
  for +next: Nat
  for evaluation_id: Nat
  for member: S.Member
  {S.leave_feedback(S.State{evaluations,next},evaluation_id,member,False{}) == S.State{evaluations,next} : S.State}

# Exact characterization of all original callback identities. This fences
# reparented callbacks; it does not by itself grant result/output authority.
law exact_original_callback:
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +operation: Nat
  for +request: Nat
  for +owner: Nat
  for +generation: Nat
  for +other_round: Nat
  for +other_operation: Nat
  for +other_request: Nat
  {S.physical_same(S.Physical{partition,lifetime,round,operation,request},S.Physical{owner,generation,other_round,other_operation,other_request}) == (Nat.is_eq(partition,owner) && Nat.is_eq(lifetime,generation) && Nat.is_eq(round,other_round) && Nat.is_eq(operation,other_operation) && Nat.is_eq(request,other_request)) : Bool}
