import Base
import ./OutputScenario.bend as Output
import ./Driver.bend as Driver
import ./Callbacks.bend as Callbacks
import ./Scheduler.bend as Scheduler
import ../agent-flow-bend/Canonical.bend as C
import ../agent-flow-bend/Delivery.bend as Delivery
import ../agent-flow-bend/DeliveryState.bend as DeliveryState

# Completion-only environment intervention. Central #182 must supply the actual
# retained private receipt, actual queued status/order and original authorized
# Capture. This module creates neither authority nor another callback registry.
# An observed failed write after authorization is not proof of pre-output failure
# (advicing-target-contract.md:260–263,278–288). Keep the fault label in the report;
# record uncertainty when output may have reached the runtime. A genuine known
# pre-output failure is a distinct existing release path, never this control.
# This is a private actual Driver-source fact, never a live-control field.
# EnvironmentCompletion is the one original authorized external write result.
# CanonicalFeedback is derived only from an actual Canonical command, notably
# SubmissionExpired -> SubmissionTerminal(false); it remains observable but
# cannot become another writable environmental receipt or expiry-check loop.
type Provenance is Data:
  EnvironmentCompletion{}
  CanonicalFeedback{}

# Actual expiry-command feedback is a new logical observation, not another
# environmental write completion. The original event supplies its exact tuple.
def feedback(command: C.Output, event: C.CanonicalEvent) -> List<&2, Driver.Action>:
  match command event:
    case C.PolicyDecided{C.SubmissionExpired{}} C.SubmissionExpiryCheck{advice, token, _, _}:
      [Driver.output_action(Output.action(C.SubmissionTerminal{advice, token, False{}}, 0n))]
    case _ _: []

def elapsed(started: Nat, now: Nat) -> Nat:
  Nat.sub(now, started)

def expired(capture: Output.Capture, now: Nat) -> Bool:
  match capture:
    case Output.Capture{_, started, _, _, lease}:
      Delivery.expired(Delivery.Authorized{}, elapsed(started, now), lease)

def certain(outcome: Output.Outcome) -> Bool:
  match outcome:
    case Output.Certain{}: True{}
    case _: False{}

def finish_outcome(outcome: Output.Outcome, expired: Bool) -> C.WriteOutcome:
  match outcome expired:
    case Output.Certain{} False{}: C.Acknowledged{}
    case _ _: C.Unknown{}

# None means this is not the exact original completion action. In particular,
# cleanup/late ACK/stateless checks and pre-output rollback actions are not
# rewritten. Membership, token, original timing and every nonterminal field stay.
def individual_event(matches: Bool, expired: Bool, advice: Nat, token: Nat,
    elapsed: Nat, lease: Nat, outcome: Output.Outcome) -> Maybe<&2, C.CanonicalEvent>:
  match matches expired:
    case True{} True{}: Some{C.SubmissionExpiryCheck{advice, token, elapsed, lease}}
    case True{} False{}: Some{C.SubmissionTerminal{advice, token, certain(outcome)}}
    case _ _: None{}

def expiry_event(
  matches: Bool,
  advice: Nat,
  token: Nat,
  elapsed: Nat,
  lifetime: Nat
) -> Maybe<&2, C.CanonicalEvent>:
  match matches:
    case True{}: Some{C.SubmissionExpiryCheck{advice, token, elapsed, lifetime}}
    case False{}: None{}

def finish_event(matches: Bool, group: Nat, round: Nat, attempt: Nat, token: Nat,
    selected: List<&2, Nat>, outcome: Output.Outcome, expired: Bool) -> Maybe<&2, C.CanonicalEvent>:
  match matches:
    case True{}: Some{
      C.FinishTerminal{group, round, attempt, token, selected, finish_outcome(outcome, expired)}
    }
    case False{}: None{}

def rewrite_event(capture: Output.Capture, event: C.CanonicalEvent,
    outcome: Output.Outcome, +now: Nat) -> Maybe<&2, C.CanonicalEvent>:
  match capture event:
    case Output.Capture{
      Output.Individual{+advice, +token},
      +started,
      +original_outcome,
      +delay,
      +lease
    } C.SubmissionTerminal{other, other_token, _}:
      individual_event(
        Nat.is_eq(advice, other) && Nat.is_eq(token, other_token),
        expired(
          Output.Capture{Output.Individual{advice, token}, started, original_outcome, delay, lease},
          now
        ),
        advice,
        token,
        elapsed(started, now),
        lease,
        outcome
      )
    case Output.Capture{Output.Individual{+advice, +token}, _, _, _, _} C.SubmissionExpiryCheck{
      other,
      other_token,
      elapsed,
      lifetime
    }:
      expiry_event(
        Nat.is_eq(advice, other) && Nat.is_eq(token, other_token),
        advice,
        token,
        elapsed,
        lifetime
      )
    case Output.Capture{
      Output.Finish{+group, +round, +attempt, +token, +selected},
      started,
      original_outcome,
      delay,
      lease
    }
        C.FinishTerminal{owner, other_round, other_attempt, other_token, members, _}:
      finish_event(
        Nat.is_eq(
          group,
          owner
        ) && Nat.is_eq(
          round,
          other_round
        ) && Nat.is_eq(
          attempt,
          other_attempt
        ) && Nat.is_eq(token, other_token) && DeliveryState.same_selected(selected, members),
        group,
        round,
        attempt,
        token,
        selected,
        outcome,
        expired(
          Output.Capture{
            Output.Finish{group, round, attempt, token, selected},
            started,
            original_outcome,
            delay,
            lease
          },
          now
        )
      )
    case _ _: None{}

def action_result(
  result: Maybe<&2, C.CanonicalEvent>,
  delay: Nat,
  candidate: Maybe<&2, Driver.Candidate>,
  job: Bool,
  expiry: Maybe<&2, Nat>
) -> Maybe<&2, Driver.Action>:
  match result:
    case Some{event}: Some{Driver.Action{event, delay, candidate, job, expiry}}
    case None{}: None{}

def rewrite_environment(
  capture: Output.Capture,
  action: Driver.Action,
  outcome: Output.Outcome,
  now: Nat
) -> Maybe<&2, Driver.Action>:
  match action:
    case Driver.Action{event, delay, candidate, job, expiry}:
      action_result(rewrite_event(capture, event, outcome, now), delay, candidate, job, expiry)

# Live interventions cannot rewrite actual Canonical feedback.
def rewrite(capture: Output.Capture, action: Driver.Action, outcome: Output.Outcome,
    now: Nat, provenance: Provenance) -> Maybe<&2, Driver.Action>:
  match provenance:
    case EnvironmentCompletion{}: rewrite_environment(capture, action, outcome, now)
    case CanonicalFeedback{}: None{}

# Actual delayed delivery preserves the policy-derived terminal unchanged.
# In particular this cannot re-fence terminal(false) into another expiry check.
def deliver(capture: Output.Capture, action: Driver.Action, outcome: Output.Outcome,
    now: Nat, provenance: Provenance) -> Maybe<&2, Driver.Action>:
  match provenance:
    case EnvironmentCompletion{}: rewrite_environment(capture, action, outcome, now)
    case CanonicalFeedback{}: Some{action}

def fact_result(
  result: Maybe<&2, Driver.Action>,
  target: Callbacks.Target,
  at: Nat,
  completion: Maybe<&2, Output.Capture>
) -> Maybe<&2, Callbacks.Fact>:
  match result:
    case Some{action}: Some{Callbacks.Fact{target, at, action, completion}}
    case None{}: None{}

# Equality covers p/l/r/op, effect token/attempt and original scheduler order.
# Status, private provenance and atomic scheduler replacement remain #182's gate.
# Pure original-fact replacement for finite evidence adapters. Live intervention
# below resolves the actual scheduler timestamp independently of immutable at.
def replace_matching(matches: Bool, fact: Callbacks.Fact, capture: Output.Capture,
    outcome: Output.Outcome, provenance: Provenance) -> Maybe<&2, Callbacks.Fact>:
  match matches fact:
    case True{} Callbacks.Fact{original, +at, action, completion}:
      fact_result(rewrite(capture, action, outcome, at, provenance), original, at, completion)
    case False{} _: None{}

def replace(fact: Callbacks.Fact, capture: Output.Capture, target: Callbacks.Target,
    outcome: Output.Outcome, provenance: Provenance) -> Maybe<&2, Callbacks.Fact>:
  match fact:
    case Callbacks.Fact{+original, +at, +action, completion}:
      replace_matching(
        Callbacks.target_equal(original, target),
        Callbacks.Fact{original, at, action, completion},
        capture,
        outcome,
        provenance
      )

# The replacement gate inspects the actual queued original, not a caller-owned
# receipt or an independently reconstructed action. Immutable issuance time and
# membership stay fixed; actual queued time/order follow release or reorder.
type Intervention is Data:
  Intervention{
    state: Callbacks.State,
    result: Callbacks.Applicability,
    cancel: List<&2, Nat>,
    schedule: List<&2, Callbacks.Scheduled>,
    receipt: Maybe<&2, Callbacks.Fact>
  }

def refused(
  originals: List<&2, Callbacks.Original>,
  result: Callbacks.Applicability
) -> Intervention:
  Intervention{Callbacks.State{originals}, result, Nil{}, Nil{}, None{}}

def replaced_fact(result: Maybe<&2, Callbacks.Fact>, original: Callbacks.Original,
    tail: List<&2, Callbacks.Original>, +order: Nat, queued_at: Nat) -> Intervention:
  match result:
    case Some{Callbacks.Fact{+target, +at, +action, +capture}}:
      Intervention{
        Callbacks.State{
          Callbacks.Original{
            Callbacks.Fact{target, at, action, capture},
            Callbacks.Queued{},
            order
          } <> tail
        },
        Callbacks.Applied{},
        [order],
        [Callbacks.Scheduled{queued_at, order, action}],
        Some{Callbacks.Fact{target, at, action, capture}}
      }
    case None{}: refused(original <> tail, Callbacks.Missing{})

# Resolve only the actual scheduled identity. Original Fact.at stays immutable;
# replacement delivery cannot precede the current scheduler clock.
def scheduled_match(matches: Bool, at: Nat, now: Nat, rest: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match matches:
    case True{}: Some{Nat.max(at, now)}
    case False{}: rest

def scheduled_at(queue: List<&2, Scheduler.Entry>, +order: Nat, +now: Nat) -> Maybe<&2, Nat>:
  match queue:
    case Nil{}: None{}
    case Scheduler.Entry{at, id} <> tail:
      scheduled_match(Nat.is_eq(id, order), at, now, scheduled_at(tail, order, now))

def queued_replacement(+original: Callbacks.Original, tail: List<&2, Callbacks.Original>,
    outcome: Output.Outcome, scheduled: Maybe<&2, Nat>) -> Intervention:
  match original scheduled:
    case Callbacks.Original{
      Callbacks.Fact{+target, +at, +action, Some{+capture}},
      Callbacks.Queued{},
      +order
    } Some{+queued_at}:
      replaced_fact(
        fact_result(
          rewrite(capture, action, outcome, queued_at, EnvironmentCompletion{}),
          target,
          at,
          Some{capture}
        ),
        Callbacks.Original{
          Callbacks.Fact{target, at, action, Some{capture}},
          Callbacks.Queued{},
          order
        },
        tail,
        order,
        queued_at
      )
    case _ _: refused(original <> tail, Callbacks.NotQueued{})

def queued_original(
  +original: Callbacks.Original,
  tail: List<&2, Callbacks.Original>,
  outcome: Output.Outcome,
  queue: List<&2, Scheduler.Entry>,
  now: Nat
) -> Intervention:
  match original:
    case Callbacks.Original{_, Callbacks.Queued{}, +order}:
      queued_replacement(original, tail, outcome, scheduled_at(queue, order, now))
    case _: refused(original <> tail, Callbacks.NotQueued{})

def prepend_original(head: Callbacks.Original, result: Intervention) -> Intervention:
  match result:
    case Intervention{Callbacks.State{tail}, result, cancel, schedule, receipt}:
      Intervention{Callbacks.State{head <> tail}, result, cancel, schedule, receipt}

def selected_original(
  matches: Bool,
  head: Callbacks.Original,
  tail: List<&2, Callbacks.Original>,
  outcome: Output.Outcome,
  rest: Intervention,
  queue: List<&2, Scheduler.Entry>,
  now: Nat
) -> Intervention:
  match matches:
    case True{}: queued_original(head, tail, outcome, queue, now)
    case False{}: prepend_original(head, rest)

def intervene_list(
  originals: List<&2, Callbacks.Original>,
  +target: Callbacks.Target,
  +outcome: Output.Outcome,
  +queue: List<&2, Scheduler.Entry>,
  +now: Nat
) -> Intervention:
  match originals:
    case Nil{}: refused(Nil{}, Callbacks.Missing{})
    case +head <> +tail:
      selected_original(
        Callbacks.target_equal(Callbacks.target_of(head), target),
        head,
        tail,
        outcome,
        intervene_list(tail, target, outcome, queue, now),
        queue,
        now
      )

def intervene(
  state: Callbacks.State,
  target: Callbacks.Target,
  outcome: Output.Outcome,
  queue: List<&2, Scheduler.Entry>,
  now: Nat
) -> Intervention:
  match state:
    case Callbacks.State{originals}: intervene_list(originals, target, outcome, queue, now)

def receipt_refusal(matches: Bool, state: Callbacks.State) -> Intervention:
  match matches:
    case True{}: Intervention{state, Callbacks.NotQueued{}, Nil{}, Nil{}, None{}}
    case False{}: Intervention{state, Callbacks.Missing{}, Nil{}, Nil{}, None{}}

def known_receipt(
  state: Callbacks.State,
  target: Callbacks.Target,
  receipt: Maybe<&2, Callbacks.Fact>
) -> Intervention:
  match receipt:
    case Some{Callbacks.Fact{original, _, _, Some{_}}}: receipt_refusal(
      Callbacks.target_equal(original, target),
      state
    )
    case _: Intervention{state, Callbacks.Missing{}, Nil{}, Nil{}, None{}}

def known_intervention(
  changed: Intervention,
  target: Callbacks.Target,
  receipt: Maybe<&2, Callbacks.Fact>
) -> Intervention:
  match changed:
    case Intervention{state, Callbacks.Missing{}, _, _, _}: known_receipt(state, target, receipt)
    case _: changed

def intervene_receipt(state: Callbacks.State, +target: Callbacks.Target, outcome: Output.Outcome,
    receipt: Maybe<&2, Callbacks.Fact>, queue: List<&2, Scheduler.Entry>, now: Nat) -> Intervention:
  known_intervention(intervene(state, target, outcome, queue, now), target, receipt)

# Lease fencing reads the current original environmental result. Failed after
# authorization has already been represented as uncertain, never fake rollback.
def completion_outcome(event: C.CanonicalEvent) -> Output.Outcome:
  match event:
    case C.SubmissionTerminal{_, _, True{}}: Output.Certain{}
    case C.FinishTerminal{_, _, _, _, _, C.Acknowledged{}}: Output.Certain{}
    case _: Output.Uncertain{}

def delivered_fact(fact: Callbacks.Fact, now: Nat) -> Maybe<&2, Driver.Action>:
  match fact:
    case Callbacks.Fact{_, _, Driver.Action{+event, delay, candidate, job, expiry}, Some{capture}}:
      deliver(
        capture,
        Driver.Action{event, delay, candidate, job, expiry},
        completion_outcome(event),
        now,
        EnvironmentCompletion{}
      )
    case Callbacks.Fact{_, _, action, None{}}: Some{action}
