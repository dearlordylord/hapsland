import Base
import ./Driver.bend as Driver
import ./OutputScenario.bend as Output
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Handoff.bend as Handoff
import ../agent-flow-bend/CollectionState.bend as CollectionState
import ../agent-flow-bend/DeliveryState.bend as DeliveryState

# Source-free facts for an already issued Stop. The caller captures its existing
# safe hook cutoff; Canonical owns waiting, selection, cancellation and output.
type Capture is Data:
  Capture{partition: Nat, lifetime: Nat, round: Nat, attempt: Nat, token: Nat,
    started: Nat, cutoff: Nat}
# One factual Finish registry for all native and host consumers. Output facts
# are zero/one boxed original issuance captures, never regenerated outcomes.
type Finish is Data:
  Finish{partition: Nat, lifetime: Nat, round: Nat, attempt: Nat, token: Nat,
    deadline: Nat, recurring: Bool, selected: List<&2, Nat>, waiting: Bool, validating: Nat,
    started: Nat, fit_pending: Bool, output: List<&2, Output.Capture>}
type State is Data:
  State{finishes: List<&2, Finish>, next_identity: Nat}
type Input is Data:
  Input{partition: Nat, lifetime: Nat, round: Nat, started: Nat, cutoff: Nat, recurring: Bool}
type Registered is Data:
  Registered{state: State, finish: Maybe<&2, Finish>, created: Bool}

type Fact is Data:
  Fact{at: Nat, event: Canonical.CanonicalEvent}

def cutoff_poll(p: Nat, l: Nat, r: Nat, cutoff: Nat, now: Nat) -> Canonical.CanonicalEvent:
  Canonical.StopPolled{p, l, r, Nat.is_le(cutoff, now)}

def poll(capture: Capture, now: Nat) -> Canonical.CanonicalEvent:
  match capture:
    case Capture{p, l, r, _, _, _, cutoff}:
      cutoff_poll(p, l, r, cutoff, now)

def initial_distinct(
  distinct: Bool,
  +capture: Capture,
  +started: Nat,
  +cutoff: Nat
) -> List<&2, Fact>:
  match distinct:
    case True{}: [Fact{started, poll(capture, started)}, Fact{cutoff, poll(capture, cutoff)}]
    case False{}: [Fact{started, poll(capture, started)}]

def initial(capture: Capture) -> List<&2, Fact>:
  match capture:
    case Capture{+p, +l, +r, +attempt, +token, +started, +cutoff}:
      initial_distinct(Bool.not(Nat.is_eq(started, cutoff)),
        Capture{p, l, r, attempt, token, started, cutoff}, started, cutoff)

# Equality means the cutoff has been reached. Same-time callback/poll order is
# determined by the existing scheduler's insertion order, never by this helper.
def wake(capture: Capture, +now: Nat) -> Fact:
  Fact{now, poll(capture, now)}

# Called only for an actual Canonical decision and its selected membership.
def reserve_fields(p: Nat, l: Nat, r: Nat, attempt: Nat, token: Nat, cutoff: Nat,
    selected: List<&2, Nat>, now: Nat) -> Driver.Action:
  Driver.immediate(Canonical.FinishReserve{p, l, r, attempt, token, selected,
    False{}, True{}, True{}, True{}, Nat.is_le(cutoff, now)}, False{})

def reserve(capture: Capture, selected: List<&2, Nat>, now: Nat) -> Driver.Action:
  match capture:
    case Capture{p, l, r, attempt, token, _, cutoff}:
      reserve_fields(p, l, r, attempt, token, cutoff, selected, now)

def ended_fields(+p: Nat, l: Nat, +r: Nat) -> Driver.Action:
  Driver.immediate(Canonical.StopGroupEnded{p, l, r, [Canonical.StopScope{p, r}]}, False{})

def continued_fields(+p: Nat, +r: Nat, attempt: Nat, token: Nat) -> List<&2, Driver.Action>:
  [Driver.immediate(Canonical.FinishEnd{p, r, attempt, token}, False{})]

def continued(capture: Capture) -> List<&2, Driver.Action>:
  match capture:
    case Capture{p, _, r, attempt, token, _, _}: continued_fields(p, r, attempt, token)

def reserve_selected(
  selected: List<&2, Nat>,
  +p: Nat,
  +r: Nat,
  +token: Nat
) -> List<&2, Driver.Action>:
  match selected:
    case Nil{}: []
    case +advice <> tail:
      Driver.immediate(Canonical.CollectionReserveLease{advice, token}, False{}) <>
      Driver.immediate(
        Canonical.SubmissionBegin{advice, p, r, token, Handoff.Stop{}, False{}, [advice], [advice]},
        False{}
      ) <>
      reserve_selected(tail, p, r, token)

# A proven failure before authorization releases the provisional attempt;
# otherwise the same selected membership is authorized exactly once.
def reserved_permission(
  failed: Bool,
  p: Nat,
  r: Nat,
  attempt: Nat,
  token: Nat,
  selected: List<&2, Nat>,
  delay: Nat
) -> List<&2, Driver.Action>:
  match failed:
    case True{}: [
      Driver.Action{Canonical.FinishRelease{p, r, attempt, token}, delay, None{}, False{}, None{}}
    ]
    case False{}: [
      Driver.immediate(Canonical.FinishAuthorize{p, r, attempt, token, selected}, False{})
    ]

def reserved_fields(+p: Nat, +r: Nat, attempt: Nat, +token: Nat,
    +selected: List<&2, Nat>, failed: Bool, delay: Nat) -> List<&2, Driver.Action>:
  List.append(&2, Driver.Action, reserve_selected(selected, p, r, token),
    reserved_permission(failed, p, r, attempt, token, selected, delay))

def reserved(
  capture: Capture,
  selected: List<&2, Nat>,
  failed: Bool,
  delay: Nat
) -> List<&2, Driver.Action>:
  match capture:
    case Capture{p, _, r, attempt, token, _, _}: reserved_fields(
      p,
      r,
      attempt,
      token,
      selected,
      failed,
      delay
    )

# Exact current Stop scope; unrelated lifetime/round findings are not candidates.
def candidate_owned(work: Canonical.Work, p: Nat, l: Nat, r: Nat) -> Maybe<&2, Nat>:
  match work:
    case Canonical.Work{wp, wl, wr, o, _, Canonical.PendingFinding{_}, _}:
      Bool.pick(
        Maybe<&2, Nat>,
        Nat.is_eq(p, wp) && Nat.is_eq(l, wl) && Nat.is_eq(r, wr),
        Some{o},
        None{}
      )
    case _: None{}

def candidate_cons(value: Maybe<&2, Nat>, rest: List<&2, Nat>) -> List<&2, Nat>:
  match value:
    case Some{o}: o <> rest
    case None{}: rest

def candidates(work: List<&2, Canonical.Work>, +p: Nat, +l: Nat, +r: Nat) -> List<&2, Nat>:
  match work:
    case Nil{}: []
    case head <> tail: candidate_cons(candidate_owned(head, p, l, r), candidates(tail, p, l, r))

def continuation_count(state: Canonical.State, p: Nat, r: Nat) -> Nat:
  match state:
    case Canonical.State{
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      CollectionState.State{_, _, _, DeliveryState.State{_, counters, _}, _, _, _},
      _
    }:
      DeliveryState.count(p, r, counters)

def budget_fields(state: Canonical.State, p: Nat, r: Nat) -> Driver.Action:
  Driver.immediate(
    Canonical.RoundContinuationBudgetCheck{True{}, continuation_count(state, p, r)},
    False{}
  )

def budget(state: Canonical.State, capture: Capture) -> Driver.Action:
  match capture:
    case Capture{p, _, r, _, _, _, _}: budget_fields(state, p, r)

# Cleanup is derived from the same retained work owner used by ordinary advice
# retirement. Original Stop scope includes lifetime; other scopes are untouched.
def retired_actions(handled: Driver.Handled) -> List<&2, Driver.Action>:
  match handled:
    case Driver.Handled{_, actions}: actions

def retire_candidate(value: Maybe<&2, Nat>, work: Canonical.Work) -> List<&2, Driver.Action>:
  match value:
    case Some{advice}: retired_actions(Driver.retired_work(Some{work}, advice))
    case None{}: []

def retire_pending(
  work: List<&2, Canonical.Work>,
  +p: Nat,
  +l: Nat,
  +r: Nat
) -> List<&2, Driver.Action>:
  match work:
    case Nil{}: []
    case +head <> tail:
      List.append(&2, Driver.Action, retire_candidate(candidate_owned(head, p, l, r), head),
        retire_pending(tail, p, l, r))

def cleanup(
  continuation: Bool,
  work: List<&2, Canonical.Work>,
  +p: Nat,
  +l: Nat,
  +r: Nat
) -> List<&2, Driver.Action>:
  match continuation:
    case True{}: []
    case False{}: List.append(&2, Driver.Action, retire_pending(work, p, l, r),
      [Driver.immediate(Canonical.RetirePartition{p, l, r}, False{})])

def end_fields(
  state: Canonical.State,
  +p: Nat,
  +l: Nat,
  +r: Nat,
  continuation: Bool
) -> List<&2, Driver.Action>:
  ended_fields(p, l, r) <> cleanup(continuation, Driver.work_list(state), p, l, r)

def end(state: Canonical.State, capture: Capture, continuation: Bool) -> List<&2, Driver.Action>:
  match capture:
    case Capture{p, l, r, _, _, _, _}: end_fields(state, p, l, r, continuation)

# Factual availability/credential inputs are captured by the existing driver.
# Canonical's existing fence resolves actual owner and frozen generation facts
# before accepting this candidate; the Stop owner only supplies its selection.
def validation(+advice: Nat, p: Nat, r: Nat, token: Nat, current: Bool,
    credential: Bool, generation: Bool, readable: Bool) -> Driver.Action:
  Driver.candidate_action(
    Canonical.FinalCandidateCheck{
      True{},
      generation,
      credential,
      False{},
      current && readable,
      True{}
    },
    Driver.Candidate{p, advice, r, token, Handoff.Stop{}, True{}}
  )

def registry_initial() -> State:
  State{[], 100000n}

def finish_partition(finish: Finish) -> Nat:
  match finish:
    case Finish{p, _, _, _, _, _, _, _, _, _, _, _, _}: p

def find_value(found: Bool, finish: Finish, rest: Maybe<&2, Finish>) -> Maybe<&2, Finish>:
  match found:
    case True{}: Some{finish}
    case False{}: rest

def find(finishes: List<&2, Finish>, +p: Nat) -> Maybe<&2, Finish>:
  match finishes:
    case Nil{}: None{}
    case +head <> tail: find_value(Nat.is_eq(finish_partition(head), p), head, find(tail, p))

def entries(state: State) -> List<&2, Finish>:
  match state:
    case State{finishes, _}: finishes

def active_found(found: Maybe<&2, Finish>) -> Bool:
  match found:
    case Some{_}: True{}
    case None{}: False{}


def active(state: State, p: Nat) -> Bool:
  active_found(find(entries(state), p))

def next_identity(state: State) -> Nat:
  match state:
    case State{_, next}: next

def replaced(found: Bool, head: Finish, tail: List<&2, Finish>, finish: Finish,
    rest: List<&2, Finish>) -> List<&2, Finish>:
  match found:
    case True{}: finish <> tail
    case False{}: head <> rest

def replace(finishes: List<&2, Finish>, +finish: Finish) -> List<&2, Finish>:
  match finishes:
    case Nil{}: [finish]
    case +head <> +tail:
      replaced(
        Nat.is_eq(finish_partition(head), finish_partition(finish)),
        head,
        tail,
        finish,
        replace(tail, finish)
      )

def put(state: State, finish: Finish) -> State:
  match state:
    case State{finishes, next}: State{replace(finishes, finish), next}

def keep_finish(keep: Bool, head: Finish, tail: List<&2, Finish>) -> List<&2, Finish>:
  match keep:
    case True{}: head <> tail
    case False{}: tail

def remove(finishes: List<&2, Finish>, +p: Nat) -> List<&2, Finish>:
  match finishes:
    case Nil{}: []
    case +head <> tail:
      keep_finish(Bool.not(Nat.is_eq(finish_partition(head), p)), head, remove(tail, p))

def close(state: State, p: Nat) -> State:
  match state:
    case State{finishes, next}: State{remove(finishes, p), next}

# Registry retention follows actual Canonical scope; physical callback facts
# remain in their separate callback owner and are not canceled here.
def retained_scope(found: Maybe<&2, Canonical.Round>, finish: Finish) -> Bool:
  match found finish:
    case Some{Canonical.Round{p, l, r, _, _, _, _, _}} Finish{
      owner,
      generation,
      round,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      Nat.is_eq(p, owner) && Nat.is_eq(l, generation) && Nat.is_eq(r, round)
    case _ _: False{}

def retained_finishes(finishes: List<&2, Finish>, +canonical: Canonical.State) -> List<&2, Finish>:
  match finishes:
    case Nil{}: []
    case +finish <> tail:
      keep_finish(
        retained_scope(
          Canonical.find_round(finish_partition(finish), Driver.rounds(canonical)),
          finish
        ),
        finish,
        retained_finishes(tail, canonical)
      )

def retain(state: State, canonical: Canonical.State) -> State:
  match state:
    case State{finishes, next}: State{retained_finishes(finishes, canonical), next}

def finish_capture(finish: Finish) -> Capture:
  match finish:
    case Finish{p, l, r, attempt, token, cutoff, _, _, _, _, started, _, _}:
      Capture{p, l, r, attempt, token, started, cutoff}

def input_capture(finish: Finish) -> Input:
  match finish:
    case Finish{p, l, r, _, _, cutoff, recurring, _, _, _, started, _, _}: Input{
      p,
      l,
      r,
      started,
      cutoff,
      recurring
    }

def registered(valid: Bool, +state: State, input: Input) -> Registered:
  match valid state input:
    case True{} State{finishes, +next} Input{p, l, r, started, cutoff, recurring}:
      +finish = {Finish{p, l, r, next, next, cutoff, recurring, [], False{}, 0n, started, False{}, []} : Finish}
      Registered{State{replace(finishes, finish), Nat.add(next, 1n)}, Some{finish}, True{}}
    case _ _ _: Registered{state, None{}, False{}}

def register_found(
  found: Maybe<&2, Finish>,
  +state: State,
  input: Input,
  valid: Bool
) -> Registered:
  match found:
    case Some{finish}: Registered{state, Some{finish}, False{}}
    case None{}: registered(
      valid && Nat.is_lt(next_identity(state), Nat.add(Nat.mul(65536n, 4294967295n), 65535n)),
      state,
      input
    )

def register(+state: State, +input: Input, valid: Bool) -> Registered:
  match input:
    case Input{p, _, _, +started, +cutoff, _}:
      register_found(find(entries(state), p), state, input, valid && Nat.is_le(started, cutoff))

def progress_waiting(finish: Finish, value: Bool) -> Finish:
  match finish:
    case Finish{p, l, r, a, t, d, c, s, _, v, start, fit, output}: Finish{
      p,
      l,
      r,
      a,
      t,
      d,
      c,
      s,
      value,
      v,
      start,
      fit,
      output
    }

def progress_ready(finish: Finish, count: Nat) -> Finish:
  match finish:
    case Finish{p, l, r, a, t, d, c, _, _, _, start, fit, output}: Finish{
      p,
      l,
      r,
      a,
      t,
      d,
      c,
      [],
      False{},
      count,
      start,
      fit,
      output
    }

def progress_clear(finish: Finish) -> Finish:
  match finish:
    case Finish{p, l, r, a, t, d, c, _, w, v, start, fit, output}: Finish{
      p,
      l,
      r,
      a,
      t,
      d,
      c,
      [],
      w,
      v,
      start,
      fit,
      output
    }

def progress_selected(finish: Finish, advice: Nat, keep: Bool) -> Finish:
  match finish:
    case Finish{p, l, r, a, t, d, c, +selected, w, v, start, fit, output}:
      Finish{
        p,
        l,
        r,
        a,
        t,
        d,
        c,
        Bool.pick(List<&2, Nat>, keep, List.append(&2, Nat, selected, [advice]), selected),
        w,
        Nat.sub(v, 1n),
        start,
        fit,
        output
      }

def progress_fit(finish: Finish, value: Bool) -> Finish:
  match finish:
    case Finish{p, l, r, a, t, d, c, s, w, v, start, _, output}: Finish{
      p,
      l,
      r,
      a,
      t,
      d,
      c,
      s,
      w,
      v,
      start,
      value,
      output
    }

def progress_output(finish: Finish, output: Output.Capture) -> Finish:
  match finish:
    case Finish{p, l, r, a, t, d, c, s, w, v, start, fit, _}: Finish{
      p,
      l,
      r,
      a,
      t,
      d,
      c,
      s,
      w,
      v,
      start,
      fit,
      [output]
    }


type Progress is Data:
  Waiting{value: Bool}
  ProgressReady{count: Nat}
  Selected{advice: Nat, keep: Bool}
  Clear{}
  Fit{value: Bool}
  Output{capture: Output.Capture}

def progressed(finish: Finish, progress: Progress) -> Finish:
  match progress:
    case Waiting{value}: progress_waiting(finish, value)
    case ProgressReady{count}: progress_ready(finish, count)
    case Selected{advice, keep}: progress_selected(finish, advice, keep)
    case Clear{}: progress_clear(finish)
    case Fit{value}: progress_fit(finish, value)
    case Output{capture}: progress_output(finish, capture)

def finish_attempt(finish: Finish) -> Nat:
  match finish:
    case Finish{_, _, _, attempt, _, _, _, _, _, _, _, _, _}: attempt

def progress_owned(valid: Bool, +state: State, finish: Finish, progress: Progress) -> State:
  match valid:
    case True{}: put(state, progressed(finish, progress))
    case False{}: state

def progress_found(
  +state: State,
  found: Maybe<&2, Finish>,
  attempt: Nat,
  progress: Progress
) -> State:
  match found:
    case Some{+finish}: progress_owned(
      Nat.is_eq(finish_attempt(finish), attempt),
      state,
      finish,
      progress
    )
    case None{}: state

def progress(+state: State, partition: Nat, attempt: Nat, change: Progress) -> State:
  progress_found(state, find(entries(state), partition), attempt, change)


def output_capture(
  finish: Finish,
  now: Nat,
  outcome: Output.Outcome,
  delay: Nat,
  lease: Nat
) -> Output.Capture:
  match finish:
    case Finish{p, _, r, attempt, token, _, _, selected, _, _, _, _, _}:
      Output.Capture{Output.Finish{p, r, attempt, token, selected}, now, outcome, delay, lease}

def output_actions(capture: Output.Capture) -> List<&2, Driver.Action>:
  Driver.output_actions(Output.issued(capture))

# Factual frontend parameters at the actual command boundary. The byte count is
# optional original output input; the fit attempt is actual queued metadata.
type CommandFacts is Data:
  CommandFacts{now: Nat, outcome: Output.Outcome, delay: Nat, lease: Nat,
    bytes: Maybe<&2, Nat>, fit_attempt: Maybe<&2, Nat>}
type Ended is Data:
  Ended{finish: Finish, continuation: Bool}
type Changed is Data:
  Changed{state: State, handled: Driver.Handled, ended: Maybe<&2, Ended>,
    fit_attempt: Maybe<&2, Nat>, output: Maybe<&2, Output.Capture>}

def command_changed(state: State, actions: List<&2, Driver.Action>) -> Changed:
  Changed{state, Driver.Handled{True{}, actions}, None{}, None{}, None{}}

def command_unhandled(state: State) -> Changed:
  Changed{state, Driver.Handled{False{}, []}, None{}, None{}, None{}}

def command_wait(state: State, finish: Finish, waiting: Bool) -> Changed:
  command_changed(put(state, progress_waiting(finish, waiting)), [])

def command_budget_fit(fit: Bool, +state: State, +finish: Finish, canonical: Canonical.State,
    bytes: Nat) -> Changed:
  match fit finish:
    case True{} Finish{_, _, _, +attempt, _, _, _, selected, _, _, _, _, _}:
      Changed{
        put(state, progress_fit(finish, True{})),
        Driver.Handled{
          True{},
          [
            Driver.immediate(
              Canonical.CollectionFitCheck{List.length(&2, Nat, selected), bytes},
              False{}
            )
          ]
        },
        None{},
        Some{attempt},
        None{}
      }
    case False{} _:
      command_changed(
        put(state, progress_fit(finish, False{})),
        [budget(canonical, finish_capture(finish))]
      )

def command_budget_bytes(bytes: Maybe<&2, Nat>, state: State, +finish: Finish,
    canonical: Canonical.State, fitted: Bool) -> Changed:
  match bytes finish:
    case Some{bytes} Finish{_, _, _, _, _, _, _, selected, _, _, _, _, _}:
      command_budget_fit(
        Bool.not(fitted) && Nat.is_gt(List.length(&2, Nat, selected), 0n),
        state,
        finish,
        canonical,
        bytes
      )
    case None{} _: command_changed(
      put(state, progress_fit(finish, False{})),
      [budget(canonical, finish_capture(finish))]
    )

def command_budget(state: State, finish: Finish, canonical: Canonical.State,
    facts: CommandFacts, fitted: Bool) -> Changed:
  match facts:
    case CommandFacts{_, _, _, _, bytes, _}: command_budget_bytes(
      bytes,
      state,
      finish,
      canonical,
      fitted
    )

def command_validations(
  advicees: List<&2, Nat>,
  +p: Nat,
  +r: Nat,
  +token: Nat,
  +current: Bool,
  +credential: Bool,
  +generation: Bool,
  +readable: Bool
) -> List<&2, Driver.Action>:
  match advicees:
    case Nil{}: []
    case advice <> tail:
      validation(advice, p, r, token, current, credential, generation, readable) <>
        command_validations(tail, p, r, token, current, credential, generation, readable)

def command_ready_nonempty(empty: Bool, +state: State, +finish: Finish, canonical: Canonical.State,
    facts: CommandFacts, advicees: List<&2, Nat>, context: Driver.Context) -> Changed:
  match empty finish context:
    case True{} _ _: command_budget(state, finish, canonical, facts, False{})
    case False{} Finish{p, _, r, _, token, _, _, _, _, _, _, _, _}
      Driver.Context{
        _,
        _,
        _,
        _,
        _,
        _,
        _,
        current,
        credential,
        generation,
        readable,
        _,
        _,
        _,
        _,
        _,
        _,
        _,
        _,
        _,
        _
      }:
      command_changed(
        put(state, finish),
        command_validations(advicees, p, r, token, current, credential, generation, readable)
      )

def command_ready_selected(+state: State, finish: Finish, canonical: Canonical.State,
    facts: CommandFacts, +advicees: List<&2, Nat>, context: Driver.Context) -> Changed:
  command_ready_nonempty(Nat.is_eq(List.length(&2, Nat, advicees), 0n), state,
    progress_ready(finish, List.length(&2, Nat, advicees)), canonical, facts, advicees, context)

def command_ready(state: State, +finish: Finish, +canonical: Canonical.State,
    facts: CommandFacts, context: Driver.Context, limit: Bool) -> Changed:
  match finish:
    case Finish{p, l, r, _, _, _, _, _, _, _, _, _, _}:
      command_ready_selected(
        state,
        finish,
        canonical,
        facts,
        Bool.pick(List<&2, Nat>, limit, [], candidates(Driver.work_list(canonical), p, l, r)),
        context
      )

def finish_selected(finish: Finish) -> List<&2, Nat>:
  match finish:
    case Finish{_, _, _, _, _, _, _, selected, _, _, _, _, _}: selected

def command_reserve_mode(exhausted: Bool, state: State, +finish: Finish, now: Nat) -> Changed:
  match exhausted:
    case True{}:
      +cleared = progress_clear(finish)
      command_changed(
        put(state, cleared),
        [reserve(finish_capture(cleared), finish_selected(cleared), now)]
      )
    case False{}:
      command_changed(state, [reserve(finish_capture(finish), finish_selected(finish), now)])

def command_reserve(state: State, finish: Finish, facts: CommandFacts, exhausted: Bool) -> Changed:
  match facts:
    case CommandFacts{now, _, _, _, _, _}: command_reserve_mode(exhausted, state, finish, now)

def command_end(
  state: State,
  +finish: Finish,
  canonical: Canonical.State,
  +continuation: Bool
) -> Changed:
  Changed{
    close(state, finish_partition(finish)),
    Driver.Handled{True{}, end(canonical, finish_capture(finish), continuation)},
    Some{Ended{finish, continuation}},
    None{},
    None{}
  }

def command_failed(outcome: Output.Outcome) -> Bool:
  match outcome:
    case Output.Failed{}: True{}
    case _: False{}

def command_reserved(state: State, +finish: Finish, facts: CommandFacts) -> Changed:
  match facts:
    case CommandFacts{_, outcome, delay, _, _, _}:
      command_changed(
        state,
        reserved(finish_capture(finish), finish_selected(finish), command_failed(outcome), delay)
      )

def command_output(+state: State, +finish: Finish, +capture: Output.Capture) -> Changed:
  Changed{
    put(state, progress_output(finish, capture)),
    Driver.Handled{True{}, output_actions(capture)},
    None{},
    None{},
    Some{capture}
  }

def command_authorized(state: State, +finish: Finish, facts: CommandFacts) -> Changed:
  match facts:
    case CommandFacts{now, outcome, delay, lease, _, _}: command_output(
      state,
      finish,
      output_capture(finish, now, outcome, delay, lease)
    )

def command_recorded(state: State, finish: Finish) -> Changed:
  command_changed(state, continued(finish_capture(finish)))

# Primitive projections keep the full original record; callers never reconstruct
# a reduced Finish or Canonical state to make a callback fit this boundary.
def finish_validating(finish: Finish) -> Nat:
  match finish:
    case Finish{_, _, _, _, _, _, _, _, _, validating, _, _, _}: validating

def command_selected_complete(done: Bool, state: State, finish: Finish,
    canonical: Canonical.State, facts: CommandFacts) -> Changed:
  match done:
    case True{}: command_budget(state, finish, canonical, facts, False{})
    case False{}: command_changed(put(state, finish), [])

def command_selected(state: State, finish: Finish, canonical: Canonical.State,
    facts: CommandFacts, advice: Nat, keep: Bool) -> Changed:
  +updated = progress_selected(finish, advice, keep)
  command_selected_complete(
    Nat.is_eq(finish_validating(updated), 0n),
    state,
    updated,
    canonical,
    facts
  )

def command_fit_matches(finish: Finish, attempt: Maybe<&2, Nat>) -> Bool:
  match finish attempt:
    case Finish{_, _, _, a, _, _, _, _, _, _, _, True{}, _} Some{other}: Nat.is_eq(a, other)
    case _ _: False{}

def command_fit_result(matches: Bool, state: State, finish: Finish, canonical: Canonical.State,
    facts: CommandFacts, keep: Bool) -> Changed:
  match matches keep:
    case True{} True{}: command_budget(state, finish, canonical, facts, True{})
    case True{} False{}: command_budget(state, progress_clear(finish), canonical, facts, True{})
    case False{} _: command_unhandled(state)

def command_candidate_owned(candidate: Driver.Candidate, finish: Finish) -> Bool:
  match candidate finish:
    case Driver.Candidate{p, _, r, t, Handoff.Stop{}, True{}} Finish{
      owner,
      _,
      round,
      _,
      token,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      Nat.is_eq(p, owner) && Nat.is_eq(r, round) && Nat.is_eq(t, token)
    case _ _: False{}

def command_candidate_valid(valid: Bool, state: State, finish: Finish, canonical: Canonical.State,
    facts: CommandFacts, candidate: Driver.Candidate, keep: Bool) -> Changed:
  match valid candidate:
    case True{} Driver.Candidate{_, advice, _, _, _, _}: command_selected(
      state,
      finish,
      canonical,
      facts,
      advice,
      keep
    )
    case False{} _: command_unhandled(state)

def command_candidate_fit(state: State, +finish: Finish, canonical: Canonical.State,
    +facts: CommandFacts, keep: Bool) -> Changed:
  match facts:
    case CommandFacts{_, _, _, _, _, attempt}:
      command_fit_result(
        command_fit_matches(finish, attempt),
        state,
        finish,
        canonical,
        facts,
        keep
      )

def command_candidate(state: State, +finish: Finish, canonical: Canonical.State,
    facts: CommandFacts, context: Driver.Context, keep: Bool) -> Changed:
  match context:
    case Driver.Context{
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
      _,
      Some{+candidate},
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      command_candidate_valid(
        command_candidate_owned(candidate, finish),
        state,
        finish,
        canonical,
        facts,
        candidate,
        keep
      )
    case _: command_candidate_fit(state, finish, canonical, facts, keep)

def command_finish(+state: State, +finish: Finish, +canonical: Canonical.State,
    +facts: CommandFacts, +context: Driver.Context, command: Canonical.Command) -> Changed:
  match command:
    case Canonical.WaitForWork{}: command_wait(state, finish, True{})
    case Canonical.WaitForOutput{}: command_wait(state, finish, True{})
    case Canonical.FinishReady{}: command_ready(state, finish, canonical, facts, context, False{})
    case Canonical.FinishLimit{}: command_ready(state, finish, canonical, facts, context, True{})
    case Canonical.RoundContinuationAvailable{}: command_reserve(state, finish, facts, False{})
    case Canonical.RoundContinuationExhausted{}: command_reserve(state, finish, facts, True{})
    case Canonical.FinishAllowedNoAdvice{}: command_end(state, finish, canonical, False{})
    case Canonical.FinishAllowedDeadline{}: command_end(state, finish, canonical, False{})
    case Canonical.FinishAllowedUnavailable{}: command_end(state, finish, canonical, False{})
    case Canonical.FinishReserved{}: command_reserved(state, finish, facts)
    case Canonical.FinishAuthorized{}: command_authorized(state, finish, facts)
    case Canonical.FinishRecorded{_}: command_recorded(state, finish)
    case Canonical.FinishReleased{}: command_end(state, finish, canonical, True{})
    case Canonical.FinishEnded{}: command_end(state, finish, canonical, True{})
    case Canonical.FinishRefused{}: command_wait(state, finish, False{})
    case Canonical.SubmissionUnsuppressed{}: command_candidate(
      state,
      finish,
      canonical,
      facts,
      context,
      True{}
    )
    case Canonical.CollectionFits{}: command_candidate(
      state,
      finish,
      canonical,
      facts,
      context,
      True{}
    )
    case Canonical.CollectionLimited{}: command_candidate(
      state,
      finish,
      canonical,
      facts,
      context,
      False{}
    )
    case Canonical.RetireCandidate{}: command_candidate(
      state,
      finish,
      canonical,
      facts,
      context,
      False{}
    )
    case Canonical.ReleaseCandidate{}: command_candidate(
      state,
      finish,
      canonical,
      facts,
      context,
      False{}
    )
    case Canonical.IgnoreCandidate{}: command_candidate(
      state,
      finish,
      canonical,
      facts,
      context,
      False{}
    )
    case Canonical.SubmissionSuppresses{}: command_candidate(
      state,
      finish,
      canonical,
      facts,
      context,
      False{}
    )
    case _: command_unhandled(state)

def command_found(+state: State, found: Maybe<&2, Finish>, canonical: Canonical.State,
    facts: CommandFacts, context: Driver.Context, command: Canonical.Command) -> Changed:
  match found:
    case Some{finish}: command_finish(state, finish, canonical, facts, context, command)
    case None{}: command_unhandled(state)

def command_partition(context: Driver.Context) -> Nat:
  match context:
    case Driver.Context{p, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: p

def handle(+state: State, canonical: Canonical.State, facts: CommandFacts, +context: Driver.Context,
    command: Canonical.Command) -> Changed:
  command_found(
    state,
    find(entries(state), command_partition(context)),
    canonical,
    facts,
    context,
    command
  )
