import Base
import ../../packages/agent-flow-bend/Admission.bend as P

type Model is Data:
  Current{}

type TraceEvent is Data:
  Pre{partition: Nat, lifetime: Nat, tool: Nat, start: Nat, deadline: Nat, now: Nat}
  Post{partition: Nat, lifetime: Nat, tool: Nat, now: Nat}
  Release{tool: Nat}
  RoundClose{at: Nat}
  Restart{lifetime: Nat, at: Nat}
  Continue{}
  NativeStart{tool: Nat, at: Nat}
  NativeComplete{tool: Nat, at: Nat}

type State is Data:
  State{permit: P.AdmissionState, done: List<&2, Nat>, accepted: Nat,
    round: Nat, active: Bool, continuation_spent: Nat}

def initial() -> State:
  State{P.initial(1n, 1n), Nil{}, 0n, 0n, False{}, 0n}

def seen(+tool: Nat, ids: List<&2, Nat>) -> Bool:
  match ids:
    case Nil{}: False{}
    case id <> tail: Bool.or(Nat.is_eq(tool, id), seen(tool, tail))

def token_pick(hit: Bool, token: Nat, rest: Nat) -> Nat:
  match hit:
    case True{}: token
    case False{}: rest

def tool_token(+tool: Nat, permits: List<&2, P.Permit>) -> Nat:
  match permits:
    case Nil{}: 0n
    case P.Permit{token, native, _, _, _} <> rest:
      token_pick(Nat.is_eq(tool, native), token, tool_token(tool, rest))

def token(state: P.AdmissionState, tool: Nat) -> Nat:
  match state:
    case P.AdmissionState{_, _, _, _, _, _, permits}: tool_token(tool, permits)

def owner(state: P.AdmissionState) -> Nat:
  match state:
    case P.AdmissionState{partition, _, _, _, _, _, _}: partition

def lifetime(state: P.AdmissionState) -> Nat:
  match state:
    case P.AdmissionState{_, live, _, _, _, _, _}: live

def fence(state: P.AdmissionState) -> Nat:
  match state:
    case P.AdmissionState{_, _, _, _, at, _, _}: at

def result_state(result: P.AdmissionResult) -> P.AdmissionState:
  match result:
    case P.Accepted{state, _, _}: state
    case P.Rejected{state, _}: state

def result_ok(result: P.AdmissionResult) -> Bool:
  match result:
    case P.Accepted{_, _, _}: True{}
    case P.Rejected{_, _}: False{}

def count(state: State) -> Nat:
  match state:
    case State{_, _, n, _, _, _}: n

def spent(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, n}: n

def round(state: State) -> Nat:
  match state:
    case State{_, _, _, n, _, _}: n

def active(state: State) -> Bool:
  match state:
    case State{_, _, _, _, a, _}: a

def replace_permit(state: State, permit: P.AdmissionState) -> State:
  match state:
    case State{_, done, n, r, a, budget}: State{permit, done, n, r, a, budget}

def retain(limit: Nat, ids: List<&2, Nat>) -> List<&2, Nat>:
  match limit ids:
    case 0n _: Nil{}
    case _ Nil{}: Nil{}
    case 1n+k id <> rest: id <> retain(k, rest)

def accepted(state: State, tool: Nat) -> State:
  match state:
    case State{permit, done, n, r, a, budget}:
      State{permit, retain(1000n, tool <> done), (n + 1n : Nat), P.candidate_round(r, a), True{}, budget}

def current_consume(state: State, tool: Nat, result: P.AdmissionResult) -> State:
  match result:
    case P.Rejected{permit, _}: replace_permit(state, permit)
    case P.Accepted{permit, _, _}: accepted(replace_permit(state, permit), tool)

def get_permit(state: State) -> P.AdmissionState:
  match state:
    case State{permit, _, _, _, _, _}: permit

def completed(state: State) -> List<&2, Nat>:
  match state:
    case State{_, done, _, _, _, _}: done

def remember(state: State, tool: Nat) -> State:
  match state:
    case State{permit, done, n, r, a, budget}:
      State{permit, retain(1000n, tool <> done), n, r, a, budget}

def expiry_state(result: P.ExpiryResult) -> P.AdmissionState:
  match result:
    case P.KeepPermit{state}: state
    case P.RemovePermit{state}: state

def expire_one(+state: State, token: Nat, tool: Nat, due: Bool) -> State:
  match due:
    case False{}: state
    case True{}: remember(replace_permit(state, expiry_state(P.expire(get_permit(state), token, True{}))), tool)

def expire_all(permits: List<&2, P.Permit>, state: State, +now: Nat) -> State:
  match permits:
    case Nil{}: state
    case P.Permit{token, tool, _, _, deadline} <> rest:
      expire_all(rest, expire_one(state, token, tool, Nat.is_ge(now, deadline)), now)

def get_pending(state: P.AdmissionState) -> List<&2, P.Permit>:
  match state:
    case P.AdmissionState{_, _, _, _, _, _, permits}: permits

def expire_now(+state: State, now: Nat) -> State:
  expire_all(get_pending(get_permit(state)), state, now)

def current_post(+state: State, partition: Nat, live: Nat, +tool: Nat, now: Nat, duplicate: Bool) -> State:
  match duplicate:
    case True{}: state
    case False{}:
      current_consume(state, tool, P.step(get_permit(state), partition, live,
        P.Consume{token(get_permit(state), tool), tool, now}))


def post(model: Model, +state: State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat) -> State:
  match model:
    case Current{}:
      +expired = expire_now(state, now)
      current_post(expired, partition, live, tool, now, seen(tool, completed(expired)))

def issue_guard(state: State, partition: Nat, live: Nat, tool: Nat, start: Nat, deadline: Nat, now: Nat, allowed: Bool) -> State:
  match allowed:
    case False{}: state
    case True{}:
      +s = state
      replace_permit(s, result_state(P.step(get_permit(s), partition, live, P.Issue{tool, start, deadline, now})))

def pending(state: State) -> Nat:
  P.pending_count(get_permit(state))

def pre(model: Model, +state: State, partition: Nat, live: Nat, +tool: Nat, +start: Nat, deadline: Nat, +now: Nat) -> State:
  match model:
    case Current{}:
      +expired = expire_now(state, now)
      issue_guard(expired, partition, live, tool, start, deadline, now,
        Bool.and(Bool.not(seen(tool, completed(expired))),
          Bool.and(Nat.is_lt(pending(expired), 2n), Nat.is_lt(now, (start + 5n : Nat)))))

def remember_permits(permits: List<&2, P.Permit>, state: State) -> State:
  match permits:
    case Nil{}: state
    case P.Permit{_, tool, _, _, _} <> rest: remember_permits(rest, remember(state, tool))

def close_result(+state: State, result: P.AdmissionResult) -> State:
  match result:
    case P.Rejected{_, _}: state
    case P.Accepted{permit, _, _}:
      +s = remember_permits(get_pending(get_permit(state)), state)
      State{permit, completed(s), count(s), round(s), False{}, spent(s)}

def close(+state: State, at: Nat) -> State:
  close_result(state, P.step(get_permit(state), owner(get_permit(state)), lifetime(get_permit(state)), P.CloseRound{at}))

def stop(model: Model, state: State, at: Nat) -> State:
  match model:
    case Current{}: close(state, at)

def restart_result(state: State, result: P.AdmissionResult) -> State:
  match result:
    case P.Rejected{_, _}: state
    case P.Accepted{permit, _, _}:
      +s = state
      State{permit, Nil{}, count(s), 0n, False{}, spent(s)}

def restart(+state: State, live: Nat, at: Nat) -> State:
  restart_result(state, P.step(get_permit(state), owner(get_permit(state)), lifetime(get_permit(state)), P.Restart{live, at}))

def continue(state: State) -> State:
  match state:
    case State{permit, done, n, r, a, budget}:
      State{permit, done, n, r, a, (budget + 1n : Nat)}

def step(model: Model, +state: State, event: TraceEvent) -> State:
  match event:
    case Pre{partition, live, tool, start, deadline, now}: pre(model, state, partition, live, tool, start, deadline, now)
    case Post{partition, live, tool, now}: post(model, state, partition, live, tool, now)
    case Release{tool}: replace_permit(state, result_state(P.release(get_permit(state), token(get_permit(state), tool))))
    case RoundClose{at}: stop(model, state, at)
    case Restart{live, at}: restart(state, live, at)
    case Continue{}: continue(state)
    case NativeStart{_, _}: state
    case NativeComplete{_, _}: state

def run(events: List<&2, TraceEvent>, +model: Model, state: State) -> State:
  match events:
    case Nil{}: state
    case event <> rest: run(rest, model, step(model, state, event))

def main() -> State:
  run([Pre{1n,1n,9n,1n,10n,1n}, NativeStart{9n,2n}, NativeComplete{9n,3n}, Post{1n,1n,9n,4n}], Current{}, initial())
