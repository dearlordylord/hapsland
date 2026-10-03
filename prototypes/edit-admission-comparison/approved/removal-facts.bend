import Base
import ../core.bend as C
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./lookup-facts.bend as H

def remove_lookup_none.branch(+id: Nat, +tool: Nat, +round: Nat, +start: Nat, +deadline: Nat,
    +rest: List<&2, P.Permit>, +token: Nat, hit: Bool,
    +current_hit: {Nat.is_eq(id, token) == hit : Bool},
    ih: {P.find_permit(token, P.remove_permit(token, rest)) == None{} : Maybe<&2, P.Permit>}) ->
    {P.find_permit(token, P.remove_permit(token, P.Permit{id, tool, round, start, deadline} <> rest)) == None{} : Maybe<&2, P.Permit>}:
  match hit:
    case True{}:
      %Equal.sym(Bool, Nat.is_eq(id, token), True{}, current_hit) :
        {P.find_permit(token, P.remove_permit.pick(P.Permit{id, tool, round, start, deadline}, P.remove_permit(token, rest), _)) == None{} : Maybe<&2, P.Permit>}
      ih
    case False{}:
      %Equal.sym(Bool, Nat.is_eq(id, token), False{}, current_hit) :
        {P.find_permit(token, P.remove_permit.pick(P.Permit{id, tool, round, start, deadline}, P.remove_permit(token, rest), _)) == None{} : Maybe<&2, P.Permit>}
      %Equal.sym(Bool, Nat.is_eq(id, token), False{}, current_hit) :
        {P.find_permit.pick(P.Permit{id, tool, round, start, deadline}, P.find_permit(token, P.remove_permit(token, rest)), _) == None{} : Maybe<&2, P.Permit>}
      ih

def remove_lookup_none(+token: Nat, +permits: List<&2, P.Permit>) ->
    {P.find_permit(token, P.remove_permit(token, permits)) == None{} : Maybe<&2, P.Permit>}:
  match permits:
    case Nil{}: {==}
    case P.Permit{+id, tool, round, start, deadline} <> +rest:
      remove_lookup_none.branch(id, tool, round, start, deadline, rest, token, Nat.is_eq(id, token), {==}, remove_lookup_none(token, rest))

def retained_lookup(+id: Nat, tool: Nat, round: Nat, start: Nat, deadline: Nat,
    +rest: List<&2, P.Permit>, +query: Nat, +hit: Bool, h: {Nat.is_eq(id, query) == hit : Bool}) ->
    {P.find_permit(query, P.Permit{id, tool, round, start, deadline} <> rest) ==
      P.find_permit.pick(P.Permit{id, tool, round, start, deadline}, P.find_permit(query, rest), hit) : Maybe<&2, P.Permit>}:
  Equal.cong(Bool, Maybe<&2, P.Permit>, x => P.find_permit.pick(P.Permit{id, tool, round, start, deadline}, P.find_permit(query, rest), x),
    Nat.is_eq(id, query), hit, h)

def remove_preserves_absent.branch(+id: Nat, +tool: Nat, +round: Nat, +start: Nat, +deadline: Nat,
    +rest: List<&2, P.Permit>, +query: Nat, +removed: Nat, +qhit: Bool, rhit: Bool,
    eq: {Nat.is_eq(id, query) == qhit : Bool},
    absent: {P.find_permit.pick(P.Permit{id, tool, round, start, deadline}, P.find_permit(query, rest), qhit) == None{} : Maybe<&2, P.Permit>},
    ih: {P.find_permit(query, rest) == None{} : Maybe<&2, P.Permit>} ->
      {P.find_permit(query, P.remove_permit(removed, rest)) == None{} : Maybe<&2, P.Permit>}) ->
    {P.find_permit(query, P.remove_permit.pick(P.Permit{id, tool, round, start, deadline}, P.remove_permit(removed, rest), rhit)) == None{} : Maybe<&2, P.Permit>}:
  match qhit rhit:
    case True{} True{}:
      Empty.absurd({P.find_permit(query, P.remove_permit(removed, rest)) == None{} : Maybe<&2, P.Permit>},
        H.none_some_empty(P.Permit{id, tool, round, start, deadline}, Equal.sym(Maybe<&2, P.Permit>, Some{P.Permit{id, tool, round, start, deadline}}, None{}, absent)))
    case True{} False{}:
      Empty.absurd({P.find_permit(query, P.Permit{id, tool, round, start, deadline} <> P.remove_permit(removed, rest)) == None{} : Maybe<&2, P.Permit>},
        H.none_some_empty(P.Permit{id, tool, round, start, deadline}, Equal.sym(Maybe<&2, P.Permit>, Some{P.Permit{id, tool, round, start, deadline}}, None{}, absent)))
    case False{} True{}: ih(absent)
    case False{} False{}:
      Equal.trans(Maybe<&2, P.Permit>, P.find_permit(query, P.Permit{id, tool, round, start, deadline} <> P.remove_permit(removed, rest)),
        P.find_permit(query, P.remove_permit(removed, rest)), None{},
        retained_lookup(id, tool, round, start, deadline, P.remove_permit(removed, rest), query, False{}, eq), ih(absent))

def remove_preserves_absent.step(+id: Nat, +tool: Nat, +round: Nat, +start: Nat, +deadline: Nat,
    +rest: List<&2, P.Permit>, +query: Nat, +removed: Nat,
    absent: {P.find_permit(query, P.Permit{id, tool, round, start, deadline} <> rest) == None{} : Maybe<&2, P.Permit>},
    ih: {P.find_permit(query, rest) == None{} : Maybe<&2, P.Permit>} ->
      {P.find_permit(query, P.remove_permit(removed, rest)) == None{} : Maybe<&2, P.Permit>}) ->
    {P.find_permit(query, P.remove_permit(removed, P.Permit{id, tool, round, start, deadline} <> rest)) == None{} : Maybe<&2, P.Permit>}:
  remove_preserves_absent.branch(id, tool, round, start, deadline, rest, query, removed, Nat.is_eq(id, query), Nat.is_eq(id, removed), {==}, absent, ih)

def remove_preserves_absent(+query: Nat, +removed: Nat, +permits: List<&2, P.Permit>,
    absent: {P.find_permit(query, permits) == None{} : Maybe<&2, P.Permit>}) ->
    {P.find_permit(query, P.remove_permit(removed, permits)) == None{} : Maybe<&2, P.Permit>}:
  match permits:
    case Nil{}: {==}
    case P.Permit{+id, tool, round, start, deadline} <> +rest:
      remove_preserves_absent.step(id, tool, round, start, deadline, rest, query, removed, absent,
        h => remove_preserves_absent(query, removed, rest, h))

def lookup(+state: C.State, token: Nat) -> Maybe<&2, P.Permit>:
  P.find_permit(token, C.get_pending(C.get_permit(state)))

def expire_due_preserves_absent(+query: Nat, +removed: Nat, tool: Nat, +state: C.State,
    absent: {lookup(state, query) == None{} : Maybe<&2, P.Permit>}) ->
    {lookup(C.expire_one(state, removed, tool, True{}), query) == None{} : Maybe<&2, P.Permit>}:
  match state:
    case C.State{P.AdmissionState{_, _, _, _, _, _, +permits}, _, _, _, _, _}:
      remove_preserves_absent(query, removed, permits, absent)

def expire_one_preserves_absent(+query: Nat, +removed: Nat, +tool: Nat, +state: C.State, due: Bool,
    absent: {lookup(state, query) == None{} : Maybe<&2, P.Permit>}) ->
    {lookup(C.expire_one(state, removed, tool, due), query) == None{} : Maybe<&2, P.Permit>}:
  match due:
    case False{}: absent
    case True{}: expire_due_preserves_absent(query, removed, tool, state, absent)

def expire_all_preserves_absent(+query: Nat, +permits: List<&2, P.Permit>, +state: C.State, +now: Nat,
    absent: {lookup(state, query) == None{} : Maybe<&2, P.Permit>}) ->
    {lookup(C.expire_all(permits, state, now), query) == None{} : Maybe<&2, P.Permit>}:
  match permits:
    case Nil{}: absent
    case P.Permit{+removed, +tool, _, _, +deadline} <> +rest:
      expire_all_preserves_absent(query, rest, C.expire_one(state, removed, tool, Nat.is_ge(now, deadline)), now,
        expire_one_preserves_absent(query, removed, tool, state, Nat.is_ge(now, deadline), absent))

def expire_now_preserves_absent(+query: Nat, +state: C.State, +now: Nat,
    absent: {lookup(state, query) == None{} : Maybe<&2, P.Permit>}) ->
    {lookup(C.expire_now(state, now), query) == None{} : Maybe<&2, P.Permit>}:
  expire_all_preserves_absent(query, C.get_pending(C.get_permit(state)), state, now, absent)
