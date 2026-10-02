import Base
import ../core.bend as C
import ../spec.bend as S
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./math/PROOF.bend as N

# Every retained pending permit has a pre-start strictly after its resident fence.
def Fresh(+permits: List<&2, P.Permit>, +fence: Nat) -> Type:
  match permits:
    case Nil{}: Unit
    case P.Permit{_, _, _, start, _} <> rest:
      {Nat.is_gt(start, fence) == True{} : Bool} & Fresh(rest, fence)

def FreshState(+state: P.AdmissionState) -> Type:
  Fresh(S.permits(state), C.fence(state))

def initial_fresh(partition: Nat, lifetime: Nat) -> FreshState(P.initial(partition, lifetime)):
  Unit{}

def remove_pick_fresh.keep(+permit: P.Permit, tail: List<&2, P.Permit>, +fence: Nat,
    head: Fresh(permit <> Nil{}, fence), rest: Fresh(tail, fence)) -> Fresh(permit <> tail, fence):
  match permit:
    case P.Permit{_, _, _, start, _}:
      (h, _) = head
      (h, rest)

def remove_pick_fresh(+permit: P.Permit, +tail: List<&2, P.Permit>, +fence: Nat,
    hit: Bool, head: Fresh(permit <> Nil{}, fence), rest: Fresh(tail, fence)) ->
    Fresh(P.remove_permit.pick(permit, tail, hit), fence):
  match hit:
    case True{}: rest
    case False{}: remove_pick_fresh.keep(permit, tail, fence, head, rest)

def remove_fresh.parts(+permit: P.Permit, +rest: List<&2, P.Permit>, +fence: Nat,
    clean: Fresh(permit <> rest, fence)) -> Fresh(permit <> Nil{}, fence) & Fresh(rest, fence):
  match permit:
    case P.Permit{_, _, _, start, _}:
      (h, tail) = clean
      ((h, Unit{}), tail)

def remove_fresh.step(+token: Nat, +permit: P.Permit, +rest: List<&2, P.Permit>, +fence: Nat,
    clean: Fresh(permit <> rest, fence), ih: Fresh(rest, fence) -> Fresh(P.remove_permit(token, rest), fence)) ->
    Fresh(P.remove_permit(token, permit <> rest), fence):
  match permit:
    case P.Permit{+current, tool, round, start, deadline}:
      (h, tail) = clean
      remove_pick_fresh(P.Permit{current, tool, round, start, deadline}, P.remove_permit(token, rest), fence,
        Nat.is_eq(current, token), (h, Unit{}), ih(tail))

def remove_fresh(+token: Nat, +permits: List<&2, P.Permit>, +fence: Nat,
    clean: Fresh(permits, fence)) -> Fresh(P.remove_permit(token, permits), fence):
  match permits:
    case Nil{}: Unit{}
    case +permit <> +rest:
      remove_fresh.step(token, permit, rest, fence, clean, h => remove_fresh(token, rest, fence, h))

def expire_fresh.due(+state: P.AdmissionState, +token: Nat, clean: FreshState(state)) ->
    FreshState(C.expiry_state(P.expire(state, token, True{}))):
  match state:
    case P.AdmissionState{_, _, _, _, +fence, _, +permits}:
      remove_fresh(token, permits, fence, clean)

def expire_fresh(+state: P.AdmissionState, +token: Nat, due: Bool,
    clean: FreshState(state)) -> FreshState(C.expiry_state(P.expire(state, token, due))):
  match due:
    case False{}: clean
    case True{}: expire_fresh.due(state, token, clean)

def append_fresh(+permits: List<&2, P.Permit>, +suffix: List<&2, P.Permit>, +fence: Nat,
    clean: Fresh(permits, fence), extra: Fresh(suffix, fence)) -> Fresh(List.append(&2, P.Permit, permits, suffix), fence):
  match permits:
    case Nil{}: extra
    case P.Permit{token, tool, round, start, deadline} <> +rest:
      (h, tail) = clean
      (h, append_fresh(rest, suffix, fence, tail, extra))

def consume_round_fresh(+partition: Nat, +live: Nat, +round: Nat, +active: Bool, +fence: Nat, +next: Nat, +permits: List<&2, P.Permit>, +token: Nat, +permitted: Nat, correct: Bool, clean: Fresh(permits, fence)) ->
    FreshState(C.result_state(P.consume.round(P.AdmissionState{partition, live, round, active, fence, next, permits}, partition, live, round, active, fence, next, permits, token, permitted, correct))):
  match correct:
    case False{}: clean
    case True{}: remove_fresh(token, permits, fence, clean)

def consume_time_fresh(+partition: Nat, +live: Nat, +round: Nat, +active: Bool, +fence: Nat, +next: Nat, +permits: List<&2, P.Permit>, +token: Nat, +now: Nat, +permitted: Nat, valid: Bool, clean: Fresh(permits, fence)) ->
    FreshState(C.result_state(P.consume.time(P.AdmissionState{partition, live, round, active, fence, next, permits}, partition, live, round, active, fence, next, permits, token, now, permitted, valid))):
  match valid:
    case False{}: clean
    case True{}: consume_round_fresh(partition, live, round, active, fence, next, permits, token, permitted, Nat.is_eq(permitted, P.candidate_round(round, active)), clean)

def consume_tool_fresh(+partition: Nat, +live: Nat, +round: Nat, +active: Bool, +fence: Nat, +next: Nat, +permits: List<&2, P.Permit>, +token: Nat, +tool: Nat, +now: Nat, +permitted: Nat, +start: Nat, +deadline: Nat, correct: Bool, clean: Fresh(permits, fence)) ->
    FreshState(C.result_state(P.consume.tool(P.AdmissionState{partition, live, round, active, fence, next, permits}, partition, live, round, active, fence, next, permits, token, tool, now, permitted, start, deadline, correct))):
  match correct:
    case False{}: clean
    case True{}: consume_time_fresh(partition, live, round, active, fence, next, permits, token, now, permitted, Bool.and(Nat.is_gt(start, fence), Bool.and(Nat.is_le(start, now), Nat.is_le(now, deadline))), clean)

def consume_check_fresh(+state: P.AdmissionState, +token: Nat, +tool: Nat, +now: Nat,
    +permitted_tool: Nat, +permitted: Nat, +start: Nat, +deadline: Nat, clean: FreshState(state)) ->
    FreshState(C.result_state(P.consume.check(state, token, tool, now, permitted_tool, permitted, start, deadline))):
  match state:
    case P.AdmissionState{partition, live, round, active, fence, next, permits}:
      consume_tool_fresh(partition, live, round, active, fence, next, permits, token, tool, now,
        permitted, start, deadline, Nat.is_eq(tool, permitted_tool), clean)

def consume_found_fresh(+state: P.AdmissionState, +token: Nat, +tool: Nat, +now: Nat,
    +found: Maybe<&2, P.Permit>, clean: FreshState(state)) ->
    FreshState(C.result_state(P.consume.found(state, token, tool, now, found))):
  match found:
    case None{}: clean
    case Some{P.Permit{_, permitted_tool, permitted, start, deadline}}:
      consume_check_fresh(state, token, tool, now, permitted_tool, permitted, start, deadline, clean)

def consume_fresh(+state: P.AdmissionState, +token: Nat, +tool: Nat, +now: Nat, clean: FreshState(state)) ->
    FreshState(C.result_state(P.consume(state, token, tool, now))):
  match state:
    case P.AdmissionState{+partition, +live, +round, +active, +fence, +next, +permits}:
      consume_found_fresh(P.AdmissionState{partition, live, round, active, fence, next, permits}, token, tool, now,
        P.find_permit(token, permits), clean)

def release_found_fresh(+partition: Nat, +live: Nat, +round: Nat, +active: Bool, +fence: Nat, +next: Nat, +permits: List<&2, P.Permit>, +token: Nat, +found: Maybe<&2, P.Permit>, clean: Fresh(permits, fence)) ->
    FreshState(C.result_state(P.release.found(P.AdmissionState{partition, live, round, active, fence, next, permits}, token, found))):
  match found:
    case None{}: clean
    case Some{_}: remove_fresh(token, permits, fence, clean)

def release_fresh(+state: P.AdmissionState, +token: Nat, clean: FreshState(state)) ->
    FreshState(C.result_state(P.release(state, token))):
  match state:
    case P.AdmissionState{partition, live, round, active, fence, next, +permits}:
      release_found_fresh(partition, live, round, active, fence, next, permits, token, P.find_permit(token, permits), clean)

def issue_tool_fresh(+partition: Nat, +live: Nat, +round: Nat, +active: Bool, +fence: Nat, +next: Nat, +permits: List<&2, P.Permit>, +tool: Nat, +start: Nat, +deadline: Nat, duplicate: Bool,
    fresh: {Nat.is_gt(start, fence) == True{} : Bool}, clean: Fresh(permits, fence)) ->
    FreshState(C.result_state(P.issue.tool(P.AdmissionState{partition, live, round, active, fence, next, permits}, partition, live, round, active, fence, next, permits, tool, start, deadline, duplicate))):
  match duplicate:
    case True{}: clean
    case False{}:
      append_fresh(permits, P.Permit{next, tool, P.candidate_round(round, active), start, deadline} <> Nil{}, fence,
        clean, (fresh, Unit{}))

def issue_guard_fresh(+partition: Nat, +live: Nat, +round: Nat, +active: Bool, +fence: Nat, +next: Nat, +permits: List<&2, P.Permit>, +tool: Nat, +start: Nat, +deadline: Nat, +now: Nat, +valid: Bool,
    witness: {valid == True{} : Bool} -> {Nat.is_gt(start, fence) == True{} : Bool}, clean: Fresh(permits, fence)) ->
    FreshState(C.result_state(P.issue.guard(P.AdmissionState{partition, live, round, active, fence, next, permits}, partition, live, round, active, fence, next, permits, tool, start, deadline, now, valid))):
  match valid:
    case False{}: clean
    case True{}: issue_tool_fresh(partition, live, round, active, fence, next, permits, tool, start, deadline, P.has_tool(tool, permits), witness({==}), clean)

def issue_fresh(+state: P.AdmissionState, +tool: Nat, +start: Nat, +deadline: Nat, +now: Nat,
    clean: FreshState(state)) -> FreshState(C.result_state(P.issue(state, tool, start, deadline, now))):
  match state:
    case P.AdmissionState{partition, live, round, active, +fence, next, permits}:
      issue_guard_fresh(partition, live, round, active, fence, next, permits, tool, start, deadline, now,
        Bool.and(Nat.is_gt(start, fence), Bool.and(Nat.is_le(start, now), Nat.is_le(now, deadline))),
        h => N.and_true_left(Nat.is_gt(start, fence), Bool.and(Nat.is_le(start, now), Nat.is_le(now, deadline)), h), clean)

def close_time_fresh(+state: P.AdmissionState, +partition: Nat, +live: Nat, +round: Nat, +next: Nat, +at: Nat,
    valid: Bool, clean: FreshState(state)) ->
    FreshState(C.result_state(P.close_round.time(state, partition, live, round, next, at, valid))):
  match valid:
    case False{}: clean
    case True{}: Unit{}

def close_active_fresh(+state: P.AdmissionState, +partition: Nat, +live: Nat, +round: Nat, active: Bool,
    +fence: Nat, +next: Nat, +at: Nat, clean: FreshState(state)) ->
    FreshState(C.result_state(P.close_round.active(state, partition, live, round, active, fence, next, at))):
  match active:
    case False{}: clean
    case True{}: close_time_fresh(state, partition, live, round, next, at, Nat.is_ge(at, fence), clean)

def close_fresh(+state: P.AdmissionState, +at: Nat, clean: FreshState(state)) ->
    FreshState(C.result_state(P.close_round(state, at))):
  match state:
    case P.AdmissionState{+partition, +live, +round, +active, +fence, +next, permits}:
      close_active_fresh(P.AdmissionState{partition, live, round, active, fence, next, permits},
        partition, live, round, active, fence, next, at, clean)

def restart_valid_fresh(+state: P.AdmissionState, +partition: Nat, +live: Nat, +fence: Nat,
    +new_live: Nat, +at: Nat, valid: Bool, clean: FreshState(state)) ->
    FreshState(C.result_state(P.restart.fresh(state, partition, live, fence, new_live, at, valid))):
  match valid:
    case False{}: clean
    case True{}: Unit{}

def restart_fresh(+state: P.AdmissionState, +new_live: Nat, +at: Nat, clean: FreshState(state)) ->
    FreshState(C.result_state(P.restart(state, new_live, at))):
  match state:
    case P.AdmissionState{+partition, +live, round, active, +fence, next, permits}:
      restart_valid_fresh(P.AdmissionState{partition, live, round, active, fence, next, permits}, partition, live, fence,
        new_live, at, Bool.and(Nat.is_gt(new_live, live), Nat.is_ge(at, fence)), clean)

def apply_event_fresh(+state: P.AdmissionState, +event: P.AdmissionEvent, clean: FreshState(state)) ->
    FreshState(C.result_state(P.apply_event(state, event))):
  match event:
    case P.Issue{tool, start, deadline, now}: issue_fresh(state, tool, start, deadline, now, clean)
    case P.Consume{token, tool, now}: consume_fresh(state, token, tool, now, clean)
    case P.Release{token}: release_fresh(state, token, clean)
    case P.CloseRound{at}: close_fresh(state, at, clean)
    case P.Restart{live, at}: restart_fresh(state, live, at, clean)

def step_partition_fresh(+state: P.AdmissionState, +partition: Nat, +live: Nat, +event: P.AdmissionEvent,
    correct_partition: Bool, correct_lifetime: Bool, clean: FreshState(state)) ->
    FreshState(C.result_state(P.step.partition(state, partition, live, event, correct_partition, correct_lifetime))):
  match correct_partition correct_lifetime:
    case False{} _: clean
    case True{} False{}: clean
    case True{} True{}: apply_event_fresh(state, event, clean)

def step_fresh(+state: P.AdmissionState, +partition: Nat, +live: Nat, +event: P.AdmissionEvent,
    clean: FreshState(state)) -> FreshState(C.result_state(P.step(state, partition, live, event))):
  match state:
    case P.AdmissionState{+owner, +lifetime, round, active, fence, next, permits}:
      step_partition_fresh(P.AdmissionState{owner, lifetime, round, active, fence, next, permits}, partition, live, event,
        Nat.is_eq(owner, partition), Nat.is_eq(lifetime, live), clean)

def FreshCurrent(+state: C.State) -> Type:
  FreshState(C.get_permit(state))

def replace_fresh(+state: C.State, +permit: P.AdmissionState, clean: FreshState(permit)) ->
    FreshCurrent(C.replace_permit(state, permit)):
  match state:
    case C.State{_, _, _, _, _, _}: clean

def accepted_fresh(+state: C.State, +tool: Nat, clean: FreshCurrent(state)) -> FreshCurrent(C.accepted(state, tool)):
  match state:
    case C.State{_, _, _, _, _, _}: clean

def remember_fresh(+state: C.State, +tool: Nat, clean: FreshCurrent(state)) -> FreshCurrent(C.remember(state, tool)):
  match state:
    case C.State{_, _, _, _, _, _}: clean

def expire_one_fresh(+state: C.State, +token: Nat, +tool: Nat, due: Bool, clean: FreshCurrent(state)) ->
    FreshCurrent(C.expire_one(state, token, tool, due)):
  match due:
    case False{}: clean
    case True{}:
      remember_fresh(C.replace_permit(state, C.expiry_state(P.expire(C.get_permit(state), token, True{}))), tool,
        replace_fresh(state, C.expiry_state(P.expire(C.get_permit(state), token, True{})),
          expire_fresh(C.get_permit(state), token, True{}, clean)))

def expire_all_fresh(+permits: List<&2, P.Permit>, +state: C.State, +now: Nat, clean: FreshCurrent(state)) ->
    FreshCurrent(C.expire_all(permits, state, now)):
  match permits:
    case Nil{}: clean
    case P.Permit{+token, +tool, _, _, +deadline} <> +rest:
      expire_all_fresh(rest, C.expire_one(state, token, tool, Nat.is_ge(now, deadline)), now,
        expire_one_fresh(state, token, tool, Nat.is_ge(now, deadline), clean))

def expire_now_fresh(+state: C.State, +now: Nat, clean: FreshCurrent(state)) -> FreshCurrent(C.expire_now(state, now)):
  expire_all_fresh(C.get_pending(C.get_permit(state)), state, now, clean)

def current_consume_fresh(+state: C.State, +tool: Nat, +result: P.AdmissionResult,
    clean: FreshState(C.result_state(result))) -> FreshCurrent(C.current_consume(state, tool, result)):
  match result:
    case P.Rejected{+permit, _}: replace_fresh(state, permit, clean)
    case P.Accepted{+permit, _, _}:
      accepted_fresh(C.replace_permit(state, permit), tool, replace_fresh(state, permit, clean))

def current_post_fresh(+state: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat,
    duplicate: Bool, clean: FreshCurrent(state)) -> FreshCurrent(C.current_post(state, partition, live, tool, now, duplicate)):
  match duplicate:
    case True{}: clean
    case False{}:
      current_consume_fresh(state, tool,
        P.step(C.get_permit(state), partition, live, P.Consume{C.token(C.get_permit(state), tool), tool, now}),
        step_fresh(C.get_permit(state), partition, live, P.Consume{C.token(C.get_permit(state), tool), tool, now}, clean))

def post_fresh(+state: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat,
    clean: FreshCurrent(state)) -> FreshCurrent(C.post(C.Current{}, state, partition, live, tool, now)):
  current_post_fresh(C.expire_now(state, now), partition, live, tool, now,
    C.seen(tool, C.completed(C.expire_now(state, now))), expire_now_fresh(state, now, clean))

def issue_guard_current_fresh(+state: C.State, +partition: Nat, +live: Nat, +tool: Nat,
    +start: Nat, +deadline: Nat, +now: Nat, allowed: Bool, clean: FreshCurrent(state)) ->
    FreshCurrent(C.issue_guard(state, partition, live, tool, start, deadline, now, allowed)):
  match allowed:
    case False{}: clean
    case True{}:
      replace_fresh(state, C.result_state(P.step(C.get_permit(state), partition, live, P.Issue{tool, start, deadline, now})),
        step_fresh(C.get_permit(state), partition, live, P.Issue{tool, start, deadline, now}, clean))

def pre_fresh(+state: C.State, +partition: Nat, +live: Nat, +tool: Nat,
    +start: Nat, +deadline: Nat, +now: Nat, clean: FreshCurrent(state)) ->
    FreshCurrent(C.pre(C.Current{}, state, partition, live, tool, start, deadline, now)):
  issue_guard_current_fresh(C.expire_now(state, now), partition, live, tool, start, deadline, now,
    Bool.and(Bool.not(C.seen(tool, C.completed(C.expire_now(state, now)))),
      Bool.and(Nat.is_lt(C.pending(C.expire_now(state, now)), 2n), Nat.is_lt(now, (start + 5n : Nat)))),
    expire_now_fresh(state, now, clean))

def duplicate_fresh.join(+start: Nat, +rest: List<&2, P.Permit>, +fence: Nat,
    +head: {Nat.is_gt(start, fence) == True{} : Bool}, copies: Fresh(rest, fence) & Fresh(rest, fence)) ->
    ({Nat.is_gt(start, fence) == True{} : Bool} & Fresh(rest, fence)) &
    ({Nat.is_gt(start, fence) == True{} : Bool} & Fresh(rest, fence)):
  match copies:
    case (left, right): ((head, left), (head, right))

def duplicate_fresh(+permits: List<&2, P.Permit>, +fence: Nat, clean: Fresh(permits, fence)) ->
    Fresh(permits, fence) & Fresh(permits, fence):
  match permits:
    case Nil{}: (Unit{}, Unit{})
    case P.Permit{_, _, _, +start, _} <> +rest:
      (head, tail) = clean
      duplicate_fresh.join(start, rest, fence, head, duplicate_fresh(rest, fence, tail))

def duplicate_current_fresh(+state: C.State, clean: FreshCurrent(state)) -> FreshCurrent(state) & FreshCurrent(state):
  duplicate_fresh(S.permits(C.get_permit(state)), C.fence(C.get_permit(state)), clean)

def close_result_fresh(+state: C.State, +result: P.AdmissionResult, original: FreshCurrent(state),
    output: FreshState(C.result_state(result))) -> FreshCurrent(C.close_result(state, result)):
  match result:
    case P.Rejected{_, _}: original
    case P.Accepted{permit, _, _}: output

def close_current_fresh.copies(+state: C.State, +at: Nat, copies: FreshCurrent(state) & FreshCurrent(state)) -> FreshCurrent(C.close(state, at)):
  match copies:
    case (original, clean):
      close_result_fresh(state, P.step(C.get_permit(state), C.owner(C.get_permit(state)), C.lifetime(C.get_permit(state)), P.CloseRound{at}),
        original, step_fresh(C.get_permit(state), C.owner(C.get_permit(state)), C.lifetime(C.get_permit(state)), P.CloseRound{at}, clean))

def close_current_fresh(+state: C.State, +at: Nat, clean: FreshCurrent(state)) -> FreshCurrent(C.close(state, at)):
  close_current_fresh.copies(state, at, duplicate_current_fresh(state, clean))

def restart_result_fresh(+state: C.State, +result: P.AdmissionResult, original: FreshCurrent(state),
    output: FreshState(C.result_state(result))) -> FreshCurrent(C.restart_result(state, result)):
  match result:
    case P.Rejected{_, _}: original
    case P.Accepted{permit, _, _}: output

def restart_current_fresh.copies(+state: C.State, +live: Nat, +at: Nat, copies: FreshCurrent(state) & FreshCurrent(state)) ->
    FreshCurrent(C.restart(state, live, at)):
  match copies:
    case (original, clean):
      restart_result_fresh(state, P.step(C.get_permit(state), C.owner(C.get_permit(state)), C.lifetime(C.get_permit(state)), P.Restart{live, at}),
        original, step_fresh(C.get_permit(state), C.owner(C.get_permit(state)), C.lifetime(C.get_permit(state)), P.Restart{live, at}, clean))

def restart_current_fresh(+state: C.State, +live: Nat, +at: Nat, clean: FreshCurrent(state)) ->
    FreshCurrent(C.restart(state, live, at)):
  restart_current_fresh.copies(state, live, at, duplicate_current_fresh(state, clean))

def continue_fresh(+state: C.State, clean: FreshCurrent(state)) -> FreshCurrent(C.continue(state)):
  match state:
    case C.State{_, _, _, _, _, _}: clean

def current_step_fresh(+state: C.State, +event: C.TraceEvent, clean: FreshCurrent(state)) ->
    FreshCurrent(C.step(C.Current{}, state, event)):
  match event:
    case C.Pre{partition, live, tool, start, deadline, now}: pre_fresh(state, partition, live, tool, start, deadline, now, clean)
    case C.Post{partition, live, tool, now}: post_fresh(state, partition, live, tool, now, clean)
    case C.Release{+tool}:
      replace_fresh(state, C.result_state(P.release(C.get_permit(state), C.token(C.get_permit(state), tool))),
        release_fresh(C.get_permit(state), C.token(C.get_permit(state), tool), clean))
    case C.RoundClose{at}: close_current_fresh(state, at, clean)
    case C.Restart{live, at}: restart_current_fresh(state, live, at, clean)
    case C.Continue{}: continue_fresh(state, clean)
    case C.NativeStart{_, _}: clean
    case C.NativeComplete{_, _}: clean

def current_run_fresh(+history: List<&2, C.TraceEvent>, +state: C.State, clean: FreshCurrent(state)) ->
    FreshCurrent(C.run(history, C.Current{}, state)):
  match history:
    case Nil{}: clean
    case +event <> +rest:
      current_run_fresh(rest, C.step(C.Current{}, state, event), current_step_fresh(state, event, clean))

def reachable_fresh(+history: List<&2, C.TraceEvent>) -> FreshCurrent(C.run(history, C.Current{}, C.initial())):
  current_run_fresh(history, C.initial(), initial_fresh(1n, 1n))
