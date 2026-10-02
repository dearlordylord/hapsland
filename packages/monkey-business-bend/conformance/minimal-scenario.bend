import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../Scheduler.bend as Scheduler
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/ImportGraph.bend as Graph
import ../../agent-flow-bend/Ledger.bend as Ledger

# A native edge adapter supplies original source-free inputs and graph facts.
# Policy, command interpretation, callback generation and ordering are shared.
type Config is Data:
  Config{outcome: Canonical.RequestOutcome, current: Bool, credential: Bool, generation: Bool, readable: Bool}

type Input is Data:
  Edit{}
  Event{action: Driver.Action}
  Fact{operation: Nat, step: Nat, event: Graph.GraphEvent}
type Item is Data:
  Item{at: Nat, order: Nat, input: Input}
type Queue is Data:
  Queue{items: List<&2, Item>, sequence: Nat}

def keys(items: List<&2, Item>) -> List<&2, Scheduler.Entry>:
  match items:
    case Nil{}: Nil{}
    case Item{at, order, _} <> tail: Scheduler.Entry{at, order} <> keys(tail)

def lookup_if(found: Bool, input: Input, rest: Input) -> Input:
  match found:
    case True{}: input
    case False{}: rest

def lookup(items: List<&2, Item>, +order: Nat) -> Input:
  match items:
    case Nil{}: Edit{}
    case Item{_, +id, input} <> tail: lookup_if(Nat.is_eq(id, order), input, lookup(tail, order))


def remove_if(found: Bool, item: Item, rest: List<&2, Item>) -> List<&2, Item>:
  match found:
    case True{}: rest
    case False{}: item <> rest

def remove(items: List<&2, Item>, +order: Nat) -> List<&2, Item>:
  match items:
    case Nil{}: Nil{}
    case Item{at, +id, input} <> tail: remove_if(Nat.is_eq(id, order), Item{at, id, input}, remove(tail, order))

def append(queue: Queue, at: Nat, input: Input) -> Queue:
  match queue:
    case Queue{items, +sequence}: Queue{List.append(&2, Item, items, [Item{at, sequence, input}]), Nat.add(sequence, 1n)}

def enqueue(actions: List<&2, Driver.Action>, queue: Queue, +now: Nat) -> Queue:
  match actions:
    case Nil{}: queue
    case Driver.Action{event, +delay, candidate, job, expiry} <> tail:
      enqueue(tail, append(queue, Nat.add(now, delay), Event{Driver.Action{event, delay, candidate, job, expiry}}), now)

def context_values(action: Driver.Action, outcome: Canonical.RequestOutcome,
    current: Bool, credential: Bool, generation: Bool, readable: Bool) -> Driver.Context:
  match action:
    case Driver.Action{_, _, candidate, _, _}:
      Driver.Context{1n, 1n, 1n, 10n, True{}, 5n, outcome, current, credential, generation, readable,
        600000n, candidate, True{}, True{}, True{}, True{}, 0n, 30n, False{}}

def context_active(active: Bool, action: Driver.Action, config: Config) -> Driver.Context:
  match active config:
    case True{} Config{outcome, current, credential, generation, readable}:
      context_values(action, outcome, current, credential, generation, readable)
    case False{} Config{outcome, _, _, _, _}:
      context_values(action, outcome, True{}, True{}, True{}, True{})

def context(action: Driver.Action, config: Config, now: Nat) -> Driver.Context:
  context_active(Nat.is_le(7n, now), action, config)

def graph_facts(queue: Queue, +now: Nat, +operation: Nat) -> Queue:
  +one = Nat.add(now, Engine.preparation_fact_time(2n, 3n, 6n))
  +q = append(queue, now, Fact{operation, 0n, Graph.Root{1n, 100n, 20n, 0n, [2n]}})
  +q = append(q, now, Fact{operation, 1n, Graph.Next{}})
  +q = append(q, now, Fact{operation, 2n, Graph.Resolved{2n, Graph.Found{}}})
  +q = append(q, one, Fact{operation, 3n, Graph.PathChecked{True{}}})
  +q = append(q, one, Fact{operation, 4n, Graph.Captured{100n, 20n, 0n, Nil{}}})
  +q = append(q, one, Fact{operation, 5n, Graph.Next{}})
  enqueue([Engine.preparation_completed(1n, 1n, 1n, operation, [5n], 2n)], q, now)

def handled(queue: Queue, now: Nat, result: Driver.Handled) -> Queue:
  match result:
    case Driver.Handled{_, actions}: enqueue(actions, queue, now)

def command(queue: Queue, +now: Nat, +state: Types.State, +event: Canonical.CanonicalEvent,
    command: Canonical.Command, +ctx: Driver.Context) -> Queue:
  match command:
    case Canonical.Prepare{operation, _}: graph_facts(queue, now, operation)
    case command: handled(queue, now, Engine.handle(state, event, command, ctx))

def commands(list: List<&2, Canonical.Command>, queue: Queue, +now: Nat, +state: Types.State, +event: Canonical.CanonicalEvent,
    +ctx: Driver.Context) -> Queue:
  match list:
    case Nil{}: queue
    case head <> tail: commands(tail, command(queue, now, state, event, head, ctx), now, state, event, ctx)

def event_code(event: Canonical.CanonicalEvent) -> Nat:
  match event:
    case Canonical.OpenRound{_, _}: 1n
    case Canonical.AdmitObservation{_, _, _}: 2n
    case Canonical.QueueDispatch{_, _, _, _}: 3n
    case Canonical.StartObservation{_, _, _, _}: 4n
    case Canonical.BeginObservedPreparation{_, _, _, _, _}: 5n
    case Canonical.PreparationCompleted{_, _, _, _, _}: 6n
    case Canonical.CompleteObservation{_, _, _, _}: 7n
    case Canonical.DispatchSettled{_, _, _, _}: 8n
    case Canonical.StartReview{_, _, _, _}: 9n
    case Canonical.JevRequestReady{_, _, _, _, _, _, _, _, _, _}: 10n
    case Canonical.JevRequestStarted{_, _, _, _, _}: 11n
    case Canonical.JevRequestSettled{_, _, _, _, _, _, _}: 12n
    case Canonical.CollectionReady{_, _, _, _, _, _}: 13n
    case Canonical.FinalCandidateCheck{_, _, _, _, _, _}: 14n
    case Canonical.SubmissionSuppressCheck{_, _, _, _}: 15n
    case Canonical.CollectionReserveLease{_, _}: 16n
    case Canonical.SubmissionBegin{_, _, _, _, _, _, _, _}: 17n
    case Canonical.SubmissionTerminal{_, _, _}: 18n
    case Canonical.CollectionLeaseCheck{_, _, _, _, _, _}: 19n
    case Canonical.CollectionReleaseLease{_, _}: 20n
    case Canonical.CollectionRetireAdvice{_}: 22n
    case Canonical.SubmissionForget{_}: 23n
    case Canonical.RetireReview{_, _, _, _}: 24n
    case _: 99n

def event_identity(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.OpenRound{p, l}: [p, l, 0n, 0n, 0n, 0n, 0n]
    case Canonical.AdmitObservation{p, l, r}: [p, l, r, 0n, 0n, 0n, 0n]
    case Canonical.QueueDispatch{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.StartObservation{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.BeginObservedPreparation{p, l, r, o, _}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.PreparationCompleted{p, l, r, o, _}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.CompleteObservation{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.DispatchSettled{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.StartReview{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.JevRequestReady{p, l, r, o, _, _, _, _, _, _}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.JevRequestStarted{p, l, r, o, req}: [p, l, r, o, req, 0n, 0n]
    case Canonical.JevRequestSettled{p, l, r, o, req, _, _}: [p, l, r, o, req, 0n, 0n]
    case Canonical.CollectionReady{a, p, l, r, _, _}: [p, l, r, 0n, 0n, a, 0n]
    case Canonical.SubmissionSuppressCheck{a, t, r, _}: [0n, 0n, r, 0n, 0n, a, t]
    case Canonical.CollectionReserveLease{a, t}: [0n, 0n, 0n, 0n, 0n, a, t]
    case Canonical.SubmissionBegin{a, p, r, t, _, _, _, _}: [p, 0n, r, 0n, 0n, a, t]
    case Canonical.SubmissionTerminal{a, t, _}: [0n, 0n, 0n, 0n, 0n, a, t]
    case Canonical.CollectionLeaseCheck{a, t, _, _, _, _}: [0n, 0n, 0n, 0n, 0n, a, t]
    case Canonical.CollectionReleaseLease{a, t}: [0n, 0n, 0n, 0n, 0n, a, t]
    case Canonical.CollectionRetireAdvice{a}: [0n, 0n, 0n, 0n, 0n, a, 0n]
    case Canonical.SubmissionForget{a}: [0n, 0n, 0n, 0n, 0n, a, 0n]
    case Canonical.RetireReview{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case _: [0n, 0n, 0n, 0n, 0n, 0n, 0n]

def boolean(value: Bool) -> Nat:
  match value:
    case True{}: 1n
    case False{}: 0n

def first(items: List<&2, Nat>) -> Nat:
  match items:
    case Nil{}: 0n
    case head <> _: head

def outcome_code(outcome: Canonical.RequestOutcome) -> Nat:
  match outcome:
    case Canonical.NeverSent{}: 1n
    case Canonical.RequestFinding{}: 2n
    case Canonical.RequestClear{}: 3n
    case Canonical.RequestBackendFailure{}: 4n
    case Canonical.RequestTimeout{}: 5n
    case Canonical.RequestInterrupted{}: 6n

def event_facts(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.FinalCandidateCheck{owner, generation, credential, expired, current, findings}:
      [boolean(owner), boolean(generation), boolean(credential), boolean(expired), boolean(current), boolean(findings)]
    case Canonical.JevRequestReady{_, _, _, _, root, configuration, credential, selected, current, physical}:
      [boolean(root), boolean(configuration), boolean(credential), boolean(selected), boolean(current), boolean(physical)]
    case Canonical.JevRequestSettled{_, _, _, _, _, outcome, current}: [boolean(current), outcome_code(outcome), 0n, 0n, 0n, 0n]
    case Canonical.SubmissionTerminal{_, _, certain}: [boolean(certain), 0n, 0n, 0n, 0n, 0n]
    case Canonical.BeginObservedPreparation{_, _, _, _, bytes}: [bytes, 0n, 0n, 0n, 0n, 0n]
    case Canonical.PreparationCompleted{_, _, _, _, +units}: [List.length(&2, Nat, units), first(units), 0n, 0n, 0n, 0n]
    case Canonical.SubmissionBegin{_, _, _, _, _, authorized, +items, +findings}:
      [boolean(authorized), List.length(&2, Nat, items), first(items), List.length(&2, Nat, findings), first(findings), 0n]
    case Canonical.CollectionLeaseCheck{_, _, expired, retired, acknowledged, failed}:
      [boolean(expired), boolean(retired), boolean(acknowledged), boolean(failed), 0n, 0n]
    case _: [0n, 0n, 0n, 0n, 0n, 0n]

def command_code(command: Canonical.Command) -> Nat:
  match command:
    case Canonical.RoundStarted{_}: 1n
    case Canonical.ObservationAdmitted{_}: 2n
    case Canonical.DispatchStarted{_, _}: 3n
    case Canonical.Prepare{_, _}: 4n
    case Canonical.UnitAdmitted{_, _, _, _, _}: 5n
    case Canonical.JevRequestIssued{_, _, _, _, _}: 6n
    case Canonical.RetainFinding{}: 7n
    case Canonical.CollectionEligible{}: 8n
    case Canonical.RetainCandidate{}: 9n
    case Canonical.SubmissionUnsuppressed{}: 10n
    case Canonical.CollectionLeaseReserved{}: 11n
    case Canonical.SubmissionBegun{}: 12n
    case Canonical.SubmissionRecorded{}: 13n
    case Canonical.ObservationStarted{}: 14n
    case Canonical.PreparationReleased{_, _}: 15n
    case Canonical.ObservationCompleted{}: 16n
    case Canonical.ReviewStarted{}: 17n
    case Canonical.JevRequestStartRecorded{}: 18n
    case Canonical.JevRequestOutcomeRecorded{_}: 19n
    case Canonical.ReservationReleased{_}: 20n
    case Canonical.CollectionLeaseKept{}: 21n
    case Canonical.CollectionLeaseReleased{}: 22n
    case Canonical.SettleClear{}: 23n
    case Canonical.ReviewRecorded{_}: 24n
    case Canonical.RetireCandidate{}: 25n
    case Canonical.ReleaseCandidate{}: 26n
    case Canonical.CollectionAdviceRetired{}: 27n
    case Canonical.SubmissionForgotten{}: 28n
    case _: 99n

def command_codes(items: List<&2, Canonical.Command>) -> List<&2, Nat>:
  match items:
    case Nil{}: Nil{}
    case head <> tail: command_code(head) <> command_codes(tail)

def graph_code(command: Graph.Command) -> Nat:
  match command:
    case Graph.NoCommand{}: 0n
    case Graph.ResolveEdge{_}: 1n
    case Graph.CheckPath{_}: 2n
    case Graph.ReadSource{_}: 3n
    case Graph.UnitComplete{}: 4n
    case _: 99n


def edit_retry(retry: Bool, queue: Queue, now: Nat) -> Queue:
  match retry:
    case True{}: append(queue, now, Edit{})
    case False{}: queue

def edit_plan(plan: Driver.EditPlan, state: Types.State, queue: Queue, +now: Nat,
    ih: (Types.State & Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match plan:
    case Driver.EditPlan{retry, actions}: ih((state, edit_retry(retry, enqueue(actions, queue, now), now)))

def graph_counts(graph: Graph.Graph) -> List<&2, Nat>:
  match graph:
    case Graph.Graph{_, _, _, files, read, tree, _, _, _, _, _}: [files, read, tree]

def graph_row(+state: Graph.Bounded, command: Graph.Command, now: Nat) -> List<&2, Nat>:
  match state:
    case Graph.Bounded{graph, _}: 21n <> now <> graph_code(command) <> graph_counts(graph)

def graph_result(transition: Types.GraphTransition, queue: Queue, now: Nat,
    ih: (Types.State & Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match transition:
    case Types.GraphTransition{state, _, Graph.BoundedStep{graph, command}}:
      graph_row(graph, command, now) <> ih((state, queue))

def controlled(config: Config) -> Bool:
  match config:
    case Config{_, current, credential, generation, readable}: Bool.not(current && credential && generation && readable)

def control_if(apply: Bool, queue: Queue, state: Types.State, context: Driver.Context, now: Nat) -> Queue:
  match apply:
    case True{}: enqueue(Engine.revalidate(state, context), queue, now)
    case False{}: queue

def boundary_control(event: Canonical.CanonicalEvent, queue: Queue, state: Types.State,
    +config: Config, context: Driver.Context, now: Nat) -> Queue:
  match event:
    case Canonical.JevRequestSettled{_, _, _, _, _, _, _}: control_if(controlled(config), queue, state, context, now)
    case _: queue

def canonical_result(transition: Engine.Transition, +before: Types.State,
    +action: Driver.Action, queue: Queue, +now: Nat, +config: Config,
    ih: (Types.State & Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match transition action:
    case Engine.Transition{+state, Canonical.Advanced{_, +list}} Driver.Action{+event, +delay, +candidate, +job, +expiry}:
      +q = commands(list, queue, now, state, event, context(Driver.Action{event, delay, candidate, job, expiry}, config, now))
      +q = enqueue(Engine.after(before, state, event), q, now)
      +q = boundary_control(event, q, state, config, context(Driver.Action{event, delay, candidate, job, expiry}, config, now), now)
      (event_code(event) <> now <> List.append(&2, Nat, event_identity(event), List.append(&2, Nat, event_facts(event), command_codes(list)))) <> ih((state, q))
    case _ _: [ [98n, now] ]

def execution_context(event: Canonical.CanonicalEvent, action: Driver.Action, config: Config, now: Nat) -> Driver.Context:
  match event:
    case Canonical.JevRequestSettled{_, _, _, _, _, _, _}:
      context(action, config, 0n)
    case _: context(action, config, now)

def execute(+state: Types.State, +action: Driver.Action, queue: Queue, +now: Nat, +config: Config,
    ih: (Types.State & Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match action:
    case Driver.Action{+event, +delay, +candidate, +job, +expiry}:
      +a = {Driver.Action{event, delay, candidate, job, expiry} : Driver.Action}
      +fenced = Engine.fence(state, event, True{}, execution_context(event, a, config, now))
      canonical_result(Engine.step(state, fenced), state, Driver.Action{fenced, delay, candidate, job, expiry}, queue, now, config, ih)

def input(input: Input, +state: Types.State, queue: Queue, now: Nat,
    config: Config,
    ih: (Types.State & Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match input:
    case Edit{}: edit_plan(Engine.edit(state, 1n, 1n), state, queue, now, ih)
    case Event{Driver.Action{+event, delay, candidate, job, expiry}}:
      execute(state, Driver.Action{event, delay, candidate, job, expiry}, queue, now, config, ih)
    case Fact{operation, step, event}:
      graph_result(Engine.graph_step(state, Types.GraphKey{1n, 1n, 1n, operation, 0n}, step,
        Graph.Limits{1n, 262144n, 20480n, 8n, 1572864n, 16n, 4n, 128n}, event), queue, now, ih)

def selected_if(in_budget: Bool, +items: List<&2, Item>, state: Types.State, sequence: Nat,
    at: Nat, +order: Nat, config: Config,
    ih: (Types.State & Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match in_budget:
    case False{}: Nil{}
    case True{}: input(lookup(items, order), state, Queue{remove(items, order), sequence}, at, config, ih)

def selected(entries: List<&2, Scheduler.Entry>, state: Types.State, +items: List<&2, Item>, sequence: Nat,
    config: Config,
    ih: (Types.State & Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match entries:
    case Nil{}: Nil{}
    case Scheduler.Entry{+at, +order} <> _:
      selected_if(Nat.is_le(at, 10n), items, state, sequence, at, order, config, ih)

def next(state_queue: Types.State & Queue, +config: Config,
    ih: (Types.State & Queue) -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match state_queue:
    case (state, Queue{+items, sequence}): selected(Engine.order(keys(items)), state, items, sequence, config, ih)

def loop(fuel: Nat, state_queue: Types.State & Queue, +config: Config) -> List<&2, List<&2, Nat>>:
  match fuel:
    case 0n: Nil{}
    case 1n+rest: next(state_queue, config, pair => loop(rest, pair, config))

def scenario(config: Config) -> List<&2, List<&2, Nat>>:
  loop(100n, (Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}),
    Queue{[Item{0n, 0n, Edit{}}], 1n}), config)

def main() -> List<&2, List<&2, List<&2, Nat>>>:
  [scenario(Config{Canonical.RequestFinding{}, True{}, True{}, True{}, True{}}),
   scenario(Config{Canonical.RequestClear{}, True{}, True{}, True{}, True{}}),
   scenario(Config{Canonical.RequestFinding{}, False{}, True{}, True{}, True{}}),
   scenario(Config{Canonical.RequestFinding{}, True{}, False{}, True{}, True{}}),
   scenario(Config{Canonical.RequestFinding{}, True{}, True{}, False{}, True{}})]
