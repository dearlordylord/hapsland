import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../PermitScenario.bend as Permit
import ../Workload.bend as Workload
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Admission.bend as Admission
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../Scheduler.bend as Scheduler
import ./advicee-lifecycle-driver.bend as Edge

# Original PRE/job facts. The existing generic edge owns graph payloads and
# callback context; actual Engine/Canonical/PermitScenario own every decision.
def facts(
  list: List<&2, Permit.Fact>,
  queue: Edge.Queue,
  +anchor: Nat,
  +job: Edge.Job
) -> Edge.Queue:
  match list:
    case Nil{}: queue
    case Permit.Fact{event, +delay, binding} <> tail:
      facts(
        tail,
        Edge.append(
          queue,
          (anchor + delay : Nat),
          Edge.Event{
            Driver.Action{event, delay, None{}, binding, None{}},
            job,
            None{},
            Edge.Environmental{None{}}
          }
        ),
        anchor,
        job
      )

def tokens(list: List<&2, Canonical.Output>) -> Nat:
  match list:
    case Nil{}: 0n
    case Canonical.EventEstablished{Canonical.PermitIssued{token, _}} <> _: token
    case _ <> tail: tokens(tail)

def generation(list: List<&2, Canonical.Output>) -> Nat:
  match list:
    case Nil{}: 0n
    case Canonical.EventEstablished{Canonical.PermitConsumed{round}} <> _: round
    case _ <> tail: generation(tail)

def permits(list: List<&2, Admission.AdmissionState>) -> Nat:
  match list:
    case Nil{}: 0n
    case Admission.AdmissionState{_, _, _, _, _, _, tokens} <> tail:
      (List.length(&2, Admission.Permit, tokens) + permits(tail) : Nat)

def counts(state: Canonical.State) -> List<&2, Nat>:
  match state:
    case Canonical.State{_, _, _, _, _, +admissions, _, _, _}:
      permits(admissions) <> Edge.state_counts(state)

def permit_row(
  event: Canonical.CanonicalEvent,
  outputs: List<&2, Canonical.Output>,
  +state: Types.State,
  now: Nat,
  rejected: Nat
) -> List<&2, Nat>:
  match event:
    case Canonical.IssuePermit{p, l, tool, started, deadline, _, _, _}:
      List.append(
        &2,
        Nat,
        [90n, now, p, l, tokens(outputs), tool, started, deadline, rejected],
        counts(Engine.canonical(state))
      )
    case Canonical.ConsumePermit{+p, l, token, _, _}:
      List.append(
        &2,
        Nat,
        [
          91n,
          now,
          p,
          l,
          token,
          generation(outputs),
          Edge.round(Engine.canonical(state), p),
          0n,
          rejected
        ],
        counts(Engine.canonical(state))
      )
    case Canonical.ReleasePermit{p, l, token}:
      List.append(
        &2,
        Nat,
        [92n, now, p, l, token, 0n, 0n, 0n, rejected],
        counts(Engine.canonical(state))
      )
    case Canonical.ExpirePermit{p, l, token, _}:
      List.append(
        &2,
        Nat,
        [93n, now, p, l, token, 0n, 0n, 0n, rejected],
        counts(Engine.canonical(state))
      )
    case _: [99n]

def follow(
  event: Canonical.CanonicalEvent,
  +outputs: List<&2, Canonical.Output>,
  +state: Types.State,
  queue: Edge.Queue,
  +capture: Permit.Capture,
  job: Edge.Job,
  now: Nat
) -> Edge.Queue:
  match event capture:
    case Canonical.IssuePermit{_, _, _, _, _, _, _, _} Permit.Capture{
      p,
      l,
      tool,
      +started,
      deadline,
      duration,
      outcome,
      local,
      resident
    }:
      facts(
        Engine.permit_issued(
          Permit.Capture{p, l, tool, started, deadline, duration, outcome, local, resident},
          tokens(outputs)
        ),
        queue,
        started,
        job
      )
    case Canonical.ConsumePermit{+p, +l, _, _, _} capture:
      facts(
        Engine.permit_consumed(
          state,
          Canonical.EventEstablished{Canonical.PermitConsumed{generation(outputs)}},
          p,
          l
        ),
        queue,
        now,
        job
      )
    case _ _: queue

# A future workload duration update must not change the already issued capture.
def duration_changed(changed: Engine.WorkloadTransition) -> Types.State:
  match changed:
    case Engine.WorkloadTransition{state, _, _}: state

def future_duration(state: Types.State, event: Canonical.CanonicalEvent) -> Types.State:
  match event:
    case Canonical.IssuePermit{_, _, _, _, _, _, _, _}:
      duration_changed(
        Engine.workload_action(state, 1n, Workload.Controlled{Workload.Duration{0n}})
      )
    case _: state

def permit_transition(
  transition: Engine.Transition,
  +event: Canonical.CanonicalEvent,
  queue: Edge.Queue,
  jobs: List<&2, Edge.Stored>,
  +job: Edge.Job,
  +now: Nat,
  delay: Nat,
  +capture: Permit.Capture,
  ih: Edge.Runtime -> List<&2, List<&2, Nat>>
) -> List<&2, List<&2, Nat>>:
  match transition:
    case Engine.Transition{+state, Canonical.Advanced{_, +outputs}}:
      permit_row(event, outputs, state, now, 0n) <>
        ih(
          Edge.Runtime{
            future_duration(state, event),
            follow(event, outputs, state, queue, capture, job, now),
            jobs,
            delay
          }
        )
    case Engine.Transition{+state, Canonical.Rejected{_, _}}:
      permit_row(event, [], state, now, 1n) <> ih(Edge.Runtime{state, queue, jobs, delay})

def event(
  action: Driver.Action,
  +state: Types.State,
  queue: Edge.Queue,
  jobs: List<&2, Edge.Stored>,
  +job: Edge.Job,
  +now: Nat,
  delay: Nat,
  capture: Permit.Capture,
  ih: Edge.Runtime -> List<&2, List<&2, Nat>>
) -> List<&2, List<&2, Nat>>:
  match action:
    case Driver.Action{+ev, _, candidate, _, _}:
      match ev:
        case Canonical.IssuePermit{_, _, _, _, _, _, _, _}: permit_transition(
          Engine.step(state, ev),
          ev,
          queue,
          jobs,
          job,
          now,
          delay,
          capture,
          ih
        )
        case Canonical.ConsumePermit{_, _, _, _, _}: permit_transition(
          Engine.step(state, ev),
          ev,
          queue,
          jobs,
          job,
          now,
          delay,
          capture,
          ih
        )
        case Canonical.ReleasePermit{_, _, _}: permit_transition(
          Engine.step(state, ev),
          ev,
          queue,
          jobs,
          job,
          now,
          delay,
          capture,
          ih
        )
        case Canonical.ExpirePermit{_, _, _, _}: permit_transition(
          Engine.step(state, ev),
          ev,
          queue,
          jobs,
          job,
          now,
          delay,
          capture,
          ih
        )
        case ev: Edge.input(
          Edge.Event{
            Driver.Action{ev, 0n, candidate, True{}, None{}},
            job,
            None{},
            Edge.Environmental{None{}}
          },
          state,
          queue,
          jobs,
          now,
          delay,
          ih
        )

def selected(input: Edge.Input, +state: Types.State, queue: Edge.Queue,
    jobs: List<&2, Edge.Stored>, +now: Nat, delay: Nat, capture: Permit.Capture,
    ih: Edge.Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match input:
    case Edge.Event{action, job, _, issuance}: event(
      action,
      state,
      queue,
      jobs,
      job,
      now,
      delay,
      capture,
      ih
    )
    case input: Edge.input(input, state, queue, jobs, now, delay, ih)

def taken(taken: Engine.Taken, +items: List<&2, Edge.Item>, +sequence: Nat,
    jobs: List<&2, Edge.Stored>, delay: Nat, capture: Permit.Capture,
    ih: Edge.Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match taken:
    case Engine.Taken{state, Some{Scheduler.Entry{+now, +order}}}:
      selected(
        Edge.lookup(items, order),
        state,
        Edge.Queue{Edge.remove(items, order), sequence, sequence},
        jobs,
        now,
        delay,
        capture,
        ih
      )
    case Engine.Taken{_, None{}}: []

def bounded(valid: Bool, state: Types.State, items: List<&2, Edge.Item>, sequence: Nat,
    jobs: List<&2, Edge.Stored>, delay: Nat, capture: Permit.Capture,
    ih: Edge.Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match valid:
    case True{}: taken(Engine.take(state), items, sequence, jobs, delay, capture, ih)
    case False{}: []

def selected_time(
  entries: List<&2, Scheduler.Entry>,
  state: Types.State,
  items: List<&2, Edge.Item>,
  sequence: Nat,
  jobs: List<&2, Edge.Stored>,
  delay: Nat,
  capture: Permit.Capture,
  ih: Edge.Runtime -> List<&2, List<&2, Nat>>
) -> List<&2, List<&2, Nat>>:
  match entries:
    case Nil{}: []
    case Scheduler.Entry{at, _} <> _: bounded(
      Nat.is_le(at, 30n),
      state,
      items,
      sequence,
      jobs,
      delay,
      capture,
      ih
    )

def published(+state: Types.State, items: List<&2, Edge.Item>, sequence: Nat,
    jobs: List<&2, Edge.Stored>, delay: Nat, capture: Permit.Capture,
    ih: Edge.Runtime -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  selected_time(Engine.queued(state), state, items, sequence, jobs, delay, capture, ih)

def loop(fuel: Nat, runtime: Edge.Runtime, +capture: Permit.Capture) -> List<&2, List<&2, Nat>>:
  match fuel runtime:
    case 0n _: [[98n]]
    case 1n+rest Edge.Runtime{state, Edge.Queue{+items, +sequence, synced}, jobs, delay}:
      continuation: Edge.Runtime -> List<&2, List<&2, Nat>> = next => loop(rest, next, capture)
      published(
        Edge.sync(items, state, synced),
        items,
        sequence,
        jobs,
        delay,
        capture,
        continuation
      )

# A different partition already owns canonical round 1. Admission generation 1
# for partition 1 must resolve canonical round 2 after successful consumption.
def opened(transition: Engine.Transition) -> Types.State:
  match transition:
    case Engine.Transition{state, _}: state

def captured(timing: Workload.PreTiming, outcome: Permit.PostOutcome) -> Permit.Capture:
  match timing:
    case Workload.PreTiming{started, deadline, _, duration, _}:
      Permit.Capture{1n, 1n, 1n, started, deadline, duration, outcome, 32n, 4096n}

def run(
  +outcome: Permit.PostOutcome,
  +duration: Nat,
  review: Canonical.RequestOutcome
) -> List<&2, List<&2, Nat>>:
  +state = opened(
    Engine.step(
      Engine.configure_workload(
        Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}),
        1n,
        Edge.profile(11, 10n, [5n])
      ),
      Canonical.OpenRound{2n, 1n}
    )
  )
  +capture = {captured(Engine.pre_timing(state, 1n, None{}, duration, 10n), outcome) : Permit.Capture}
  +job = {Edge.Job{1n, 1n, 10n, [5n], Some{review}} : Edge.Job}
  loop(
    150n,
    Edge.Runtime{
      state,
      Edge.append(
        Edge.Queue{[], 0n, 0n},
        1n,
        Edge.Event{
          Driver.immediate(Engine.permit_issue(capture, 1n), True{}),
          job,
          None{},
          Edge.Environmental{None{}}
        }
      ),
      [],
      5n
    },
    capture
  )
