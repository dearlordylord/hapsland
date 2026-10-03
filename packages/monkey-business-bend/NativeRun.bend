import Base
import ./NativeRunTypes.bend as T
import ./Engine.bend as Engine
import ./Types.bend as EngineTypes
import ./Advicees.bend as Advicees
import ./Workload.bend as Workload
import ./Driver.bend as Driver
import ./Numeric.bend as Numeric
import ./PreparationScenario.bend as PreparationScenario
import ./TreeFacts.bend as TreeFacts
import ./NativeFinish.bend as NativeFinish
import ./Scheduler.bend as Scheduler
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ../agent-flow-bend/Ledger.bend as Ledger

# Generic factual orchestration over the shared decision/effect owner. Every
# dated input goes through Engine.enqueue/take; this module never selects order.
def core_value(values: List<&2, EngineTypes.State>) -> EngineTypes.State:
  match values:
    case value <> _: value
    case Nil{}: Engine.initial(Ledger.Limits{0n, 0n, 0n, 0n})

def core(state: T.State) -> EngineTypes.State:
  match state:
    case T.State{value, _, _, _, _, _, _, _, +finishes, +next_finish}: core_value(value)

def replace_core(state: T.State, value: EngineTypes.State) -> T.State:
  match state:
    case T.State{_, items, next, count, seed, environment, latest, valid, +finishes, +next_finish}:
      T.State{[value], items, next, count, seed, environment, latest, valid, finishes, next_finish}

def invalid(state: T.State) -> T.State:
  match state:
    case T.State{core, items, next, count, seed, environment, latest, _, +finishes, +next_finish}:
      T.State{core, items, next, count, seed, environment, latest, False{}, finishes, next_finish}

def clock(state: T.State) -> Nat:
  Engine.clock(core(state))

def next_order(state: T.State) -> Nat:
  match state:
    case T.State{_, _, next, _, _, _, _, _, +finishes, +next_finish}: next

def maximum() -> Nat:
  Advicees.maximum()

def enqueued(valid: Bool, state: T.State, time: Nat, input: T.Input) -> T.State:
  match valid state:
    case True{} T.State{core, items, +next, count, seed, environment, latest, valid, finishes, next_finish}:
      T.State{[Engine.enqueue(core_value(core), time, next)], List.append(&2, T.Item, items, [T.Item{next, input}]),
        (next + 1n : Nat), count, seed, environment, latest, valid, finishes, next_finish}
    case False{} state: invalid(state)

def enqueue(+state: T.State, +time: Nat, input: T.Input) -> T.State:
  enqueued(Nat.is_le(clock(state), time) && Nat.is_le(time, maximum()) && Nat.is_lt(next_order(state), maximum()), state, time, input)

def arrival_time(emission: Workload.Emission) -> Nat:
  match emission:
    case Workload.Emission{time, _, _, _, _, _, _, _, _, _}: time

def arrivals(events: List<&2, Workload.Emission>, state: T.State) -> T.State:
  match events:
    case Nil{}: state
    case +head <> tail: arrivals(tail, enqueue(state, arrival_time(head), T.Arrival{head}))

def workload_changed(state: T.State, changed: Engine.WorkloadTransition) -> T.State:
  match changed:
    case Engine.WorkloadTransition{core, events, True{}}: arrivals(events, replace_core(state, core))
    case _: invalid(state)

def workload(+state: T.State, partition: Nat, action: Workload.Action) -> T.State:
  workload_changed(state, Engine.workload_action(core(state), partition, action))

def profile_seed(profile: Workload.Profile) -> U32:
  match profile:
    case Workload.Profile{_, seed, _, _, _, _}: seed

def configured_scope(+state: T.State, profile: Workload.Profile, scope: Maybe<&2, Advicees.Scope>) -> T.State:
  match scope:
    case Some{Advicees.Scope{_, +partition, _}}:
      workload(replace_core(state, Engine.configure_workload(core(state), partition, profile)), partition, Workload.Next{})
    case None{}: invalid(state)

def declared(state: T.State, profile: Workload.Profile, result: Engine.AdviceeDeclared) -> T.State:
  match result:
    case Engine.AdviceeDeclared{core, scope, True{}}: configured_scope(replace_core(state, core), profile, scope)
    case _: invalid(state)

def configure(advicees: List<&2, T.Advicee>, +state: T.State) -> T.State:
  match advicees:
    case Nil{}: state
    case T.Advicee{identity, +profile} <> tail:
      configure(tail, declared(state, profile, Engine.declare_advicee(core(state), identity, profile_seed(profile))))

def initial_core(environment: T.Environment, limits: Ledger.Limits, seed: Nat) -> EngineTypes.State:
  match environment:
    case T.Environment{_, _, _, _, _, _, _, _, _, ready, generation, _, _}:
      Engine.configure_credentials(Engine.configure_seed(Engine.initial(limits), seed), ready, generation)

def weight_valid(weight: Numeric.Words) -> Bool:
  match weight:
    case Numeric.Words{+high, +low}:
      Nat.is_le(low, 4294967295n) && Nat.is_le(high, 1079574528n) &&
        (Nat.is_lt(high, 1079574528n) || Nat.is_eq(low, 0n))

def weights_valid(weights: List<&2, Numeric.Words>) -> Bool:
  match weights:
    case Nil{}: True{}
    case head <> tail: weight_valid(head) && weights_valid(tail)

def weights_enabled(weights: List<&2, Numeric.Words>) -> Bool:
  match weights:
    case Nil{}: False{}
    case Numeric.Words{high, low} <> tail: Nat.is_gt(high, 0n) || Nat.is_gt(low, 0n) || weights_enabled(tail)

def initial_environment_supported(environment: T.Environment) -> Bool:
  match environment:
    case T.Environment{jev, _, +weights, preparation, _, _, output, +lease, _, _, +generation, _, +lifetime}:
      Nat.is_le(jev, maximum()) && Nat.is_le(preparation, maximum()) &&
        Nat.is_le(output, 1000000000n) && Nat.is_gt(lease, 0n) && Nat.is_le(lease, 1000000000n) &&
        Nat.is_gt(generation, 0n) && Nat.is_le(generation, 1000000000n) &&
        Nat.is_gt(lifetime, 0n) && Nat.is_le(lifetime, maximum()) &&
        Nat.is_eq(List.length(&2, Numeric.Words, weights), 6n) && weights_valid(weights) && weights_enabled(weights)

def created(supported: Bool, advicees: List<&2, T.Advicee>, limits: Ledger.Limits,
    +environment: T.Environment, +seed: Nat) -> T.State:
  match supported:
    case True{}:
      configure(advicees, T.State{[initial_core(environment, limits, seed)], [], 0n, 0n, seed, environment, [], True{}, [], 100000n})
    case False{}:
      T.State{[Engine.initial(limits)], [], 0n, 0n, 0n, environment, [], False{}, [], 100000n}

def create(config: T.Config, +seed: Nat) -> T.State:
  match config:
    case T.Config{limits, advicees, +environment}:
      created(Nat.is_le(seed, maximum()) && initial_environment_supported(environment), advicees, limits, environment, seed)

def latest_frame(frames: List<&2, T.Frame>) -> Maybe<&2, T.Frame>:
  match frames:
    case head <> _: Some{head}
    case Nil{}: None{}

def observed(state: T.State) -> T.Observation:
  match state:
    case T.State{+core, +items, _, count, _, _, latest, valid, +finishes, +next_finish}:
      T.Observation{Engine.clock(core_value(core)), count, Engine.canonical(core_value(core)), latest_frame(latest), List.length(&2, T.Item, items), valid}

def observe(state: T.State) -> T.Observation:
  observed(state)

def located_item(equal: Bool, item: T.Item, rest: List<&2, T.Item>, found: T.Located) -> T.Located:
  match equal item found:
    case True{} T.Item{_, input} _: T.Located{Some{input}, rest}
    case False{} item T.Located{input, remaining}: T.Located{input, item <> remaining}

def locate(items: List<&2, T.Item>, +order: Nat) -> T.Located:
  match items:
    case Nil{}: T.Located{None{}, []}
    case +head <> +tail:
      match head:
        case T.Item{+key, input}:
          located_item(Nat.is_eq(key, order), T.Item{key, input}, tail, locate(tail, order))

def replaced_items(state: T.State, items: List<&2, T.Item>) -> T.State:
  match state:
    case T.State{core, _, next, count, seed, environment, latest, valid, +finishes, +next_finish}:
      T.State{core, items, next, count, seed, environment, latest, valid, finishes, next_finish}

def scheduled_action(valid: Bool, state: T.State, time: Nat, action: Driver.Action, job: Maybe<&2, T.Job>) -> T.State:
  match valid:
    case True{}: enqueue(state, time, T.Event{action, job})
    case False{}: invalid(state)

def action_delay(action: Driver.Action) -> Nat:
  match action:
    case Driver.Action{_, delay, _, _, _}: delay

def schedule_action(+state: T.State, +action: Driver.Action, job: Maybe<&2, T.Job>) -> T.State:
  +now = clock(state)
  +delay = action_delay(action)
  scheduled_action(Nat.is_le(delay, Nat.sub(maximum(), now)), state, Nat.add(now, delay), action, job)

def schedule_actions(actions: List<&2, Driver.Action>, state: T.State, +job: Maybe<&2, T.Job>) -> T.State:
  match actions:
    case Nil{}: state
    case action <> tail: schedule_actions(tail, schedule_action(state, action, job), job)

def issued_actions(state: T.State, job: Maybe<&2, T.Job>, issued: Engine.IssuedActions) -> T.State:
  match issued:
    case Engine.IssuedActions{core, actions}: schedule_actions(actions, replace_core(state, core), job)

def issue(+state: T.State, actions: List<&2, Driver.Action>, job: Maybe<&2, T.Job>) -> T.State:
  issued_actions(state, job, Engine.issue_actions(core(state), actions))

def context_environment(job: T.Job, supplied: Bool, action: Driver.Action, outcome: Canonical.RequestOutcome, environment: T.Environment) -> Driver.Context:
  match job action environment:
    case T.Job{p, l, r, bytes, _, _, _, _} Driver.Action{_, _, candidate, _, _}
      T.Environment{delay, _, _, _, _, _, output, lease, current, credential, _, readable, lifetime}:
      Driver.Context{p, l, r, bytes, supplied, delay, outcome, current, credential, True{}, readable,
        lifetime, candidate, True{}, True{}, True{}, True{}, output, lease, True{}, True{}}

def job_context(job: Maybe<&2, T.Job>, action: Driver.Action, outcome: Canonical.RequestOutcome, environment: T.Environment) -> Driver.Context:
  match job:
    case Some{job}: context_environment(job, True{}, action, outcome, environment)
    case None{}: context_environment(T.Job{0n, 1n, 0n, 0n, [], 0n, False{}, None{}}, False{}, action, outcome, environment)

def context(state: T.State, action: Driver.Action, job: Maybe<&2, T.Job>, outcome: Canonical.RequestOutcome) -> Driver.Context:
  match state:
    case T.State{_, _, _, _, _, environment, _, _, +finishes, +next_finish}: job_context(job, action, outcome, environment)

def recorded(state: T.State, +frame: T.Frame) -> T.Step:
  match state:
    case T.State{core, items, next, count, seed, environment, _, valid, +finishes, +next_finish}:
      T.Step{T.State{core, items, next, Nat.add(count, 1n), seed, environment, [frame], valid, finishes, next_finish}, Some{frame}}

def product_frame(state: T.State, event: Canonical.CanonicalEvent, before: Canonical.State,
    after: Canonical.State, commands: List<&2, Canonical.Command>, reason: Maybe<&2, Canonical.Reason>) -> T.Step:
  match state:
    case T.State{+core, items, next, +count, seed, environment, latest, valid, +finishes, +next_finish}:
      recorded(T.State{core, items, next, count, seed, environment, latest, valid, finishes, next_finish},
        T.ProductFrame{count, Engine.clock(core_value(core)), event, [before], [after], commands, reason})

def graph_frame(state: T.State, key: EngineTypes.GraphKey, position: Nat, fact: ImportGraph.GraphEvent,
    before: ImportGraph.Bounded, after: ImportGraph.Bounded, command: ImportGraph.Command) -> T.Step:
  match state:
    case T.State{+core, items, next, +count, seed, environment, latest, valid, +finishes, +next_finish}:
      recorded(T.State{core, items, next, count, seed, environment, latest, valid, finishes, next_finish},
        T.GraphFrame{count, Engine.clock(core_value(core)), key, position, fact, [before], [after], command})

def graph_transition(state: T.State, key: EngineTypes.GraphKey, position: Nat,
    fact: ImportGraph.GraphEvent, result: EngineTypes.GraphTransition) -> T.Step:
  match result:
    case EngineTypes.GraphTransition{core, before, ImportGraph.BoundedStep{after, command}}:
      graph_frame(replace_core(state, core), key, position, fact, before, after, command)
    case EngineTypes.GraphRejected{core}: T.Step{invalid(replace_core(state, core)), None{}}

def graph_active(active: Bool, +state: T.State, +key: EngineTypes.GraphKey, +position: Nat,
    +fact: ImportGraph.GraphEvent, limits: ImportGraph.Limits) -> T.Step:
  match active:
    case True{}: graph_transition(state, key, position, fact, Engine.graph_step(core(state), key, position, limits, fact))
    case False{}: T.Step{state, None{}}

def graph(+state: T.State, key: EngineTypes.GraphKey, position: Nat,
    fact: ImportGraph.GraphEvent, limits: ImportGraph.Limits) -> T.Step:
  match key:
    case EngineTypes.GraphKey{+p, +l, +r, +operation, unit}:
      graph_active(Engine.preparation_active(core(state), p, l, r, operation), state,
        EngineTypes.GraphKey{p, l, r, operation, unit}, position, fact, limits)

def graph_inputs(facts: List<&2, ImportGraph.GraphEvent>, +key: EngineTypes.GraphKey,
    +position: Nat, +limits: ImportGraph.Limits) -> List<&2, T.Input>:
  match facts:
    case Nil{}: []
    case fact <> tail:
      T.GraphFact{key, position, fact, limits} <> graph_inputs(tail, key, Nat.add(position, 1n), limits)

def generated_inputs(result: PreparationScenario.Generated, key: EngineTypes.GraphKey, limits: ImportGraph.Limits) -> List<&2, T.Input>:
  match result:
    case PreparationScenario.Generated{_, facts, _, _, _, _}: graph_inputs(facts, key, 0n, limits)

def unit_inputs(units: List<&2, Nat>, +seed: Nat, +p: Nat, +l: Nat, +r: Nat, +operation: Nat,
    +position: Nat, +profile: TreeFacts.Profile, +limits: ImportGraph.Limits) -> List<&2, T.Input>:
  match units:
    case Nil{}: []
    case _ <> tail:
      List.append(&2, T.Input,
        generated_inputs(Engine.generate_tree(seed, operation, position, profile, limits), EngineTypes.GraphKey{p, l, r, operation, position}, limits),
        unit_inputs(tail, seed, p, l, r, operation, Nat.add(position, 1n), profile, limits))

def timed_inputs(inputs: List<&2, T.Input>, state: T.State, +start: Nat, +delay: Nat, +position: Nat, +count: Nat) -> T.State:
  match inputs:
    case Nil{}: state
    case input <> tail:
      timed_inputs(tail, enqueue(state, Nat.add(start, Engine.preparation_fact_time(delay, position, count)), input),
        start, delay, Nat.add(position, 1n), count)

def preparation_inputs(+state: T.State, +job: T.Job, operation: Nat) -> List<&2, T.Input>:
  match state job:
    case T.State{_, _, _, _, seed, T.Environment{_, _, _, _, profile, limits, _, _, _, _, _, _, _}, _, _, +finishes, +next_finish}
      T.Job{p, l, r, _, units, _, _, _}:
      unit_inputs(units, seed, p, l, r, operation, 0n, profile, limits)

def preparation_delay(state: T.State) -> Nat:
  match state:
    case T.State{_, _, _, _, _, T.Environment{_, _, _, delay, _, _, _, _, _, _, _, _, _}, _, _, +finishes, +next_finish}: delay

def preparation_completed(state: T.State, job: T.Job, operation: Nat, delay: Nat) -> T.State:
  match job:
    case T.Job{+p, +l, +r, bytes, +units, revision, repair, duration}:
      issue(state, [Engine.preparation_completed(p, l, r, operation, units, delay)],
        Some{T.Job{p, l, r, bytes, units, revision, repair, duration}})

def preparation_bounded(valid: Bool, +state: T.State, +job: T.Job, +operation: Nat, +delay: Nat) -> T.State:
  match valid:
    case False{}: invalid(state)
    case True{}:
      +facts = preparation_inputs(state, job, operation)
      preparation_completed(timed_inputs(facts, state, clock(state), delay, 0n, List.length(&2, T.Input, facts)), job, operation, delay)

def prepare(+state: T.State, job: T.Job, operation: Nat) -> T.State:
  +delay = preparation_delay(state)
  preparation_bounded(Nat.is_le(delay, Nat.sub(maximum(), clock(state))), state, job, operation, delay)

def outcome(index: Nat) -> Canonical.RequestOutcome:
  match index:
    case 0n: Canonical.NeverSent{}
    case 1n: Canonical.RequestFinding{}
    case 2n: Canonical.RequestClear{}
    case 3n: Canonical.RequestBackendFailure{}
    case 4n: Canonical.RequestTimeout{}
    case _: Canonical.RequestInterrupted{}

def handled_actions(state: T.State, job: Maybe<&2, T.Job>, result: Driver.Handled) -> T.State:
  match result:
    case Driver.Handled{_, actions}: issue(state, actions, job)

def handle_outcome(+state: T.State, +action: Driver.Action, +job: Maybe<&2, T.Job>, command: Canonical.Command, value: Canonical.RequestOutcome) -> T.State:
  match action:
    case Driver.Action{+event, delay, candidate, supplied, expiry}:
      handled_actions(state, job, Engine.handle(core(state), event, command,
        context(state, Driver.Action{event, delay, candidate, supplied, expiry}, job, value)))

def sampled_command(state: T.State, action: Driver.Action, job: Maybe<&2, T.Job>, command: Canonical.Command, sampled: Engine.OutcomeTransition) -> T.State:
  match sampled:
    case Engine.OutcomeTransition{core, value}: handle_outcome(replace_core(state, core), action, job, command, outcome(value))

def weighted_command(+state: T.State, action: Driver.Action, job: Maybe<&2, T.Job>, command: Canonical.Command) -> T.State:
  match state:
    case T.State{+core, items, next, count, seed, T.Environment{delay, fixed, +weights, prep, tree, limits, output, lease, current, credential, generation, readable, lifetime}, latest, valid, +finishes, +next_finish}:
      sampled_command(T.State{core, items, next, count, seed,
        T.Environment{delay, fixed, weights, prep, tree, limits, output, lease, current, credential, generation, readable, lifetime}, latest, valid, finishes, next_finish},
        action, job, command, Engine.sample_outcome(core_value(core), weights))

def fixed_outcome(state: T.State) -> Maybe<&2, Canonical.RequestOutcome>:
  match state:
    case T.State{_, _, _, _, _, T.Environment{_, value, _, _, _, _, _, _, _, _, _, _, _}, _, _, +finishes, +next_finish}: value

def issued_command(state: T.State, action: Driver.Action, job: Maybe<&2, T.Job>, command: Canonical.Command,
    fixed: Maybe<&2, Canonical.RequestOutcome>) -> T.State:
  match fixed:
    case Some{value}: handle_outcome(state, action, job, command, value)
    case None{}: weighted_command(state, action, job, command)

def prepare_job(state: T.State, job: Maybe<&2, T.Job>, operation: Nat) -> T.State:
  match job:
    case Some{job}: prepare(state, job, operation)
    case None{}: invalid(state)

def finish_job(finish: T.Finish) -> T.Job:
  match finish:
    case T.Finish{p, l, r, _, _, _, _, _, _, _}: T.Job{p, l, r, 0n, [], 0n, False{}, None{}}

def finish_attempt(finish: T.Finish) -> Nat:
  match finish:
    case T.Finish{_, _, _, attempt, _, _, _, _, _, _}: attempt

def finish_scopes(state: T.State) -> List<&2, T.Finish>:
  match state:
    case T.State{_, _, _, _, _, _, _, _, finishes, _}: finishes

def replace_finishes(state: T.State, finishes: List<&2, T.Finish>) -> T.State:
  match state:
    case T.State{core, items, next, count, seed, environment, latest, valid, _, next_finish}:
      T.State{core, items, next, count, seed, environment, latest, valid, finishes, next_finish}

def replace_finish(+state: T.State, finish: T.Finish) -> T.State:
  replace_finishes(state, NativeFinish.replace(finish_scopes(state), finish))

def finish_input(valid: Bool, state: T.State, time: Nat, action: Driver.Action, +finish: T.Finish) -> T.State:
  match valid:
    case True{}: enqueue(state, time, T.FinishInput{action, finish_job(finish), finish_attempt(finish)})
    case False{}: invalid(state)

def finish_action(+state: T.State, +action: Driver.Action, finish: T.Finish) -> T.State:
  +now = clock(state)
  +delay = action_delay(action)
  finish_input(Nat.is_le(delay, Nat.sub(maximum(), now)), state, Nat.add(now, delay), action, finish)

def finish_actions(actions: List<&2, Driver.Action>, state: T.State, +finish: T.Finish) -> T.State:
  match actions:
    case Nil{}: state
    case action <> tail: finish_actions(tail, finish_action(state, action, finish), finish)

def finish_environment(state: T.State) -> T.Environment:
  match state:
    case T.State{_, _, _, _, _, environment, _, _, _, _}: environment

def finish_ready(state: T.State, ready: NativeFinish.Ready) -> T.State:
  match ready:
    case NativeFinish.Ready{+finish, actions}: finish_actions(actions, replace_finish(state, finish), finish)

def finish_found(state: T.State, job: Maybe<&2, T.Job>) -> Maybe<&2, T.Finish>:
  match job:
    case Some{T.Job{p, _, _, _, _, _, _, _}}: NativeFinish.find(finish_scopes(state), p)
    case None{}: None{}

def finish_waiting(state: T.State, found: Maybe<&2, T.Finish>, waiting: Bool) -> T.State:
  match found:
    case Some{finish}: replace_finish(state, NativeFinish.waiting(finish, waiting))
    case None{}: state

def finish_ready_found(+state: T.State, found: Maybe<&2, T.Finish>, limit: Bool) -> T.State:
  match found:
    case Some{finish}: finish_ready(state, NativeFinish.ready(finish, Engine.canonical(core(state)), finish_environment(state), limit))
    case None{}: state

def input_finish(input: T.Input) -> Maybe<&2, Nat>:
  match input:
    case T.FinishInput{_, _, attempt}: Some{attempt}
    case _: None{}

def finish_equal(value: Maybe<&2, Nat>, attempt: Nat) -> Bool:
  match value:
    case Some{value}: Nat.is_eq(value, attempt)
    case None{}: False{}

def cancel_finish_items(items: List<&2, T.Item>, +state: T.State, +attempt: Nat, +kept: List<&2, T.Item>) -> T.State:
  match items:
    case Nil{}: replaced_items(state, List.reverse(&2, T.Item, kept))
    case T.Item{+order, +input} <> tail:
      +remove = finish_equal(input_finish(input), attempt)
      cancel_finish_items(tail, Bool.pick(T.State, remove, replace_core(state, Engine.cancel(core(state), order)), state), attempt,
        Bool.pick(List<&2, T.Item>, remove, kept, T.Item{order, input} <> kept))

def cancel_finish(state: T.State, attempt: Nat) -> T.State:
  match state:
    case T.State{core, +items, next, count, seed, environment, latest, valid, finishes, next_finish}:
      cancel_finish_items(items, T.State{core, items, next, count, seed, environment, latest, valid, finishes, next_finish}, attempt, [])

def finish_feedback(state: T.State, finish: T.Finish, continuation: Bool) -> T.State:
  match finish:
    case T.Finish{p, _, _, _, _, _, True{}, _, _, _}: workload(state, p, Workload.Finished{continuation})
    case _: state

def finish_end(+state: T.State, +finish: T.Finish, +continuation: Bool) -> T.State:
  +cleared = replace_finishes(cancel_finish(state, finish_attempt(finish)), NativeFinish.remove(finish_scopes(state), NativeFinish.partition(finish)))
  finish_feedback(issue(cleared, NativeFinish.end_actions(finish, Engine.canonical(core(state)), continuation), Some{finish_job(finish)}), finish, continuation)

def finish_end_found(state: T.State, found: Maybe<&2, T.Finish>, continuation: Bool) -> T.State:
  match found:
    case Some{finish}: finish_end(state, finish, continuation)
    case None{}: state

def finish_reserve_found(+state: T.State, found: Maybe<&2, T.Finish>) -> T.State:
  match found:
    case Some{+finish}: finish_action(state, NativeFinish.reserve(finish, clock(state)), finish)
    case None{}: state

def finish_reserved_found(state: T.State, found: Maybe<&2, T.Finish>) -> T.State:
  match found:
    case Some{+finish}: finish_actions(NativeFinish.reserved(finish), state, finish)
    case None{}: state

def finish_authorized(state: T.State, +finish: T.Finish) -> T.State:
  match state:
    case T.State{core, items, next, count, seed, +environment, latest, valid, finishes, next_finish}:
      match environment:
        case T.Environment{_, _, _, _, _, _, delay, lease, _, _, _, _, _}:
          finish_actions(NativeFinish.authorized(finish, delay, lease),
            T.State{core, items, next, count, seed, environment, latest, valid, finishes, next_finish}, finish)

def finish_authorized_found(state: T.State, found: Maybe<&2, T.Finish>) -> T.State:
  match found:
    case Some{finish}: finish_authorized(state, finish)
    case None{}: state

def finish_recorded_found(state: T.State, found: Maybe<&2, T.Finish>) -> T.State:
  match found:
    case Some{+finish}: finish_actions(NativeFinish.consumed(finish), state, finish)
    case None{}: state

def finish_exhausted(state: T.State, found: Maybe<&2, T.Finish>) -> T.State:
  match found:
    case Some{finish}: replace_finish(state, NativeFinish.empty_selection(finish))
    case None{}: state

def selected_finish(+state: T.State, +finish: T.Finish) -> T.State:
  +updated = replace_finish(state, finish)
  Bool.pick(T.State, Nat.is_eq(NativeFinish.validation_count(finish), 0n),
    finish_action(updated, NativeFinish.budget(finish, Engine.canonical(core(updated))), finish), updated)

def selected_found(state: T.State, advice: Nat, keep: Bool, found: Maybe<&2, T.Finish>) -> T.State:
  match found:
    case Some{finish}: selected_finish(state, NativeFinish.selected(finish, advice, keep))
    case None{}: state

def selected_candidate(+state: T.State, candidate: Maybe<&2, Driver.Candidate>, keep: Bool) -> T.State:
  match candidate:
    case Some{Driver.Candidate{+p, advice, _, _, _, True{}}}:
      selected_found(state, advice, keep, NativeFinish.find(finish_scopes(state), p))
    case _: state

def finish_candidate(state: T.State, action: Driver.Action, keep: Bool) -> T.State:
  match action:
    case Driver.Action{_, _, candidate, _, _}: selected_candidate(state, candidate, keep)

def expiry_matches(input: T.Input, advice: Nat) -> Bool:
  match input:
    case T.Event{Driver.Action{_, _, _, _, Some{value}}, _}: Nat.is_eq(value, advice)
    case T.FinishInput{Driver.Action{_, _, _, _, Some{value}}, _, _}: Nat.is_eq(value, advice)
    case _: False{}

def cancel_expiry_items(items: List<&2, T.Item>, +state: T.State, +advice: Nat, +kept: List<&2, T.Item>) -> T.State:
  match items:
    case Nil{}: replaced_items(state, List.reverse(&2, T.Item, kept))
    case T.Item{+order, +input} <> tail:
      +remove = expiry_matches(input, advice)
      cancel_expiry_items(tail, Bool.pick(T.State, remove, replace_core(state, Engine.cancel(core(state), order)), state), advice,
        Bool.pick(List<&2, T.Item>, remove, kept, T.Item{order, input} <> kept))

def cancel_expiry(state: T.State, advice: Nat) -> T.State:
  match state:
    case T.State{core, +items, next, count, seed, environment, latest, valid, finishes, next_finish}:
      cancel_expiry_items(items, T.State{core, items, next, count, seed, environment, latest, valid, finishes, next_finish}, advice, [])

def cancel_retired(state: T.State, action: Driver.Action) -> T.State:
  match action:
    case Driver.Action{Canonical.CollectionRetireAdvice{advice}, _, _, _, _}: cancel_expiry(state, advice)
    case _: state

def expired(+state: T.State, job: Maybe<&2, T.Job>, advice: Maybe<&2, Nat>) -> T.State:
  match advice:
    case Some{+advice}:
      handled_actions(state, job, Driver.retired_work(Driver.find_operation(Driver.work_list(Engine.canonical(core(state))), advice), advice))
    case None{}: state

def expired_action(state: T.State, action: Driver.Action, job: Maybe<&2, T.Job>) -> T.State:
  match action:
    case Driver.Action{_, _, _, _, advice}: expired(state, job, advice)

def ordinary_command(+state: T.State, +action: Driver.Action, +job: Maybe<&2, T.Job>, command: Canonical.Command) -> T.State:
  match command:
    case Canonical.CollectionAdviceRetired{}: cancel_retired(state, action)
    case Canonical.CollectionExpired{}: expired_action(state, action, job)
    case Canonical.WaitForWork{}: finish_waiting(state, finish_found(state, job), True{})
    case Canonical.WaitForOutput{}: finish_waiting(state, finish_found(state, job), True{})
    case Canonical.FinishReady{}: finish_ready_found(state, finish_found(state, job), False{})
    case Canonical.FinishLimit{}: finish_ready_found(state, finish_found(state, job), True{})
    case Canonical.RoundContinuationAvailable{}: finish_reserve_found(state, finish_found(state, job))
    case Canonical.RoundContinuationExhausted{}:
      +cleared = finish_exhausted(state, finish_found(state, job))
      finish_reserve_found(cleared, finish_found(cleared, job))
    case Canonical.FinishAllowedNoAdvice{}: finish_end_found(state, finish_found(state, job), False{})
    case Canonical.FinishAllowedDeadline{}: finish_end_found(state, finish_found(state, job), False{})
    case Canonical.FinishAllowedUnavailable{}: finish_end_found(state, finish_found(state, job), False{})
    case Canonical.FinishReserved{}: finish_reserved_found(state, finish_found(state, job))
    case Canonical.FinishAuthorized{}: finish_authorized_found(state, finish_found(state, job))
    case Canonical.FinishRecorded{_}: finish_recorded_found(state, finish_found(state, job))
    case Canonical.FinishReleased{}: finish_end_found(state, finish_found(state, job), True{})
    case Canonical.FinishEnded{}: finish_end_found(state, finish_found(state, job), True{})
    case Canonical.FinishRefused{}: finish_waiting(state, finish_found(state, job), False{})
    case Canonical.SubmissionUnsuppressed{}:
      handle_outcome(finish_candidate(state, action, True{}), action, job, Canonical.SubmissionUnsuppressed{}, Canonical.RequestClear{})
    case Canonical.RetireCandidate{}:
      handle_outcome(finish_candidate(state, action, False{}), action, job, Canonical.RetireCandidate{}, Canonical.RequestClear{})
    case Canonical.ReleaseCandidate{}: finish_candidate(state, action, False{})
    case Canonical.IgnoreCandidate{}: finish_candidate(state, action, False{})
    case Canonical.SubmissionSuppresses{}: finish_candidate(state, action, False{})
    case Canonical.Prepare{operation, _}: prepare_job(state, job, operation)
    case Canonical.JevRequestIssued{p, l, r, operation, request}:
      issued_command(state, action, job, Canonical.JevRequestIssued{p, l, r, operation, request}, fixed_outcome(state))
    case command: handle_outcome(state, action, job, command, Canonical.RequestClear{})

def ordinary_commands(commands: List<&2, Canonical.Command>, state: T.State,
    +action: Driver.Action, +job: Maybe<&2, T.Job>) -> T.State:
  match commands:
    case Nil{}: state
    case command <> tail: ordinary_commands(tail, ordinary_command(state, action, job, command), action, job)

def scoped_round(job: T.Job, found: Maybe<&2, Canonical.Round>) -> T.Job:
  match job found:
    case T.Job{p, l, 0n, bytes, units, revision, repair, duration} Some{Canonical.Round{_, _, round, _, _, _, _, _}}:
      T.Job{p, l, round, bytes, units, revision, repair, duration}
    case job _: job

def scoped_job(+state: T.State, job: Maybe<&2, T.Job>) -> Maybe<&2, T.Job>:
  match job:
    case None{}: None{}
    case Some{T.Job{+p, l, r, bytes, units, revision, repair, duration}}:
      Some{scoped_round(T.Job{p, l, r, bytes, units, revision, repair, duration}, Canonical.find_round(p, Driver.rounds(Engine.canonical(core(state)))))}

def scheduler_entries(state: EngineTypes.State) -> List<&2, Scheduler.Entry>:
  Engine.queued(state)

def scheduled_found(found: Bool, time: Nat, other: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match found:
    case True{}: Some{time}
    case False{}: other

def scheduled_at(entries: List<&2, Scheduler.Entry>, +order: Nat) -> Maybe<&2, Nat>:
  match entries:
    case Nil{}: None{}
    case Scheduler.Entry{time, key} <> tail: scheduled_found(Nat.is_eq(key, order), time, scheduled_at(tail, order))

def time_equal(time: Maybe<&2, Nat>, now: Nat) -> Bool:
  match time:
    case Some{time}: Nat.is_eq(time, now)
    case None{}: False{}

def input_poll(input: T.Input, attempt: Nat) -> Bool:
  match input:
    case T.FinishInput{Driver.Action{Canonical.StopPolled{_, _, _, _}, _, _, _, _}, _, value}: Nat.is_eq(value, attempt)
    case _: False{}

def queued_poll(items: List<&2, T.Item>, +entries: List<&2, Scheduler.Entry>, +attempt: Nat, +now: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case T.Item{order, input} <> tail:
      (input_poll(input, attempt) && time_equal(scheduled_at(entries, order), now)) || queued_poll(tail, entries, attempt, now)

def has_poll(state: T.State, attempt: Nat) -> Bool:
  match state:
    case T.State{+core, items, _, _, _, _, _, _, _, _}: queued_poll(items, scheduler_entries(core_value(core)), attempt, Engine.clock(core_value(core)))

def wake_finish(+state: T.State, finish: T.Finish) -> T.State:
  match finish:
    case T.Finish{p, l, r, +attempt, token, deadline, recurring, selected, True{}, validating}:
      +finish = {T.Finish{p, l, r, attempt, token, deadline, recurring, selected, True{}, validating} : T.Finish}
      Bool.pick(T.State, has_poll(state, attempt), state, finish_action(state, NativeFinish.poll(finish, clock(state), 0n), finish))
    case _: state

def wake_finishes(finishes: List<&2, T.Finish>, state: T.State) -> T.State:
  match finishes:
    case Nil{}: state
    case finish <> tail: wake_finishes(tail, wake_finish(state, finish))

def wake_event(+state: T.State, event: Canonical.CanonicalEvent) -> T.State:
  match event:
    case Canonical.PreparationCompleted{_, _, _, _, _}: wake_finishes(finish_scopes(state), state)
    case Canonical.JevRequestSettled{_, _, _, _, _, _, _}: wake_finishes(finish_scopes(state), state)
    case Canonical.SubmissionTerminal{_, _, _}: wake_finishes(finish_scopes(state), state)
    case Canonical.CollectionReleaseLease{_, _}: wake_finishes(finish_scopes(state), state)
    case _: state

def submission_recorded(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case Canonical.SubmissionRecorded{} <> _: True{}
    case _ <> tail: submission_recorded(tail)

def finish_recorded(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case Canonical.FinishRecorded{Canonical.Acknowledged{}} <> _: True{}
    case _ <> tail: finish_recorded(tail)

def advice_recorded(event: Canonical.CanonicalEvent, commands: List<&2, Canonical.Command>) -> Bool:
  match event:
    case Canonical.SubmissionTerminal{_, _, _}: submission_recorded(commands)
    case Canonical.FinishTerminal{_, _, _, _, _, Canonical.Acknowledged{}}: finish_recorded(commands)
    case _: False{}

def advice_scope(state: T.State, scope: Maybe<&2, Nat>) -> T.State:
  match scope:
    case Some{p}: workload(state, p, Workload.Advice{})
    case None{}: state

def advice_job(+state: T.State, event: Canonical.CanonicalEvent, job: Maybe<&2, T.Job>) -> T.State:
  match job:
    case Some{T.Job{p, _, _, _, _, _, _, _}}: workload(state, p, Workload.Advice{})
    case None{}: advice_scope(state, Engine.scope_event(core(state), core(state), event, None{}))

def advice_feedback(accepted: Bool, state: T.State, event: Canonical.CanonicalEvent, job: Maybe<&2, T.Job>) -> T.State:
  match accepted:
    case True{}: advice_job(state, event, job)
    case False{}: state

def product_feedback(+state: T.State, +event: Canonical.CanonicalEvent, commands: List<&2, Canonical.Command>, job: Maybe<&2, T.Job>) -> T.State:
  advice_feedback(advice_recorded(event, commands), wake_event(state, event), event, job)

def advanced_product(+state: T.State, +event: Canonical.CanonicalEvent, +action: Driver.Action,
    +job: Maybe<&2, T.Job>, before: Canonical.State, +after: Canonical.State, +commands: List<&2, Canonical.Command>, post: List<&2, Driver.Action>) -> T.Step:
  product_frame(product_feedback(issue(ordinary_commands(commands, state, action, job), post, job), event, commands, job), event, before, after, commands, None{})

def product_result(state: T.State, +event: Canonical.CanonicalEvent, action: Driver.Action,
    +job: Maybe<&2, T.Job>, before: Canonical.State, result: Canonical.Step, post: List<&2, Driver.Action>) -> T.Step:
  match result:
    case Canonical.Advanced{after, commands}: advanced_product(state, event, action, job, before, after, commands, post)
    case Canonical.Rejected{after, reason}: product_frame(wake_event(issue(state, post, job), event), event, before, after, [], Some{reason})

def product_transition(+state: T.State, +event: Canonical.CanonicalEvent, action: Driver.Action,
    +job: Maybe<&2, T.Job>, transition: Engine.Transition) -> T.Step:
  match transition:
    case Engine.Transition{+updated, result}:
      +settled = replace_core(state, updated)
      product_result(settled, event, action,
        scoped_job(settled, job), Engine.canonical(core(state)), result, Engine.after(core(state), updated, event))

def fenced_product(+state: T.State, +event: Canonical.CanonicalEvent, action: Driver.Action, +job: Maybe<&2, T.Job>) -> T.Step:
  match action:
    case Driver.Action{_, delay, candidate, supplied, expiry}:
      product_transition(state, event, Driver.Action{event, delay, candidate, supplied, expiry}, job, Engine.step(core(state), event))

def product(+state: T.State, action: Driver.Action, +job: Maybe<&2, T.Job>) -> T.Step:
  match action:
    case Driver.Action{+event, +delay, +candidate, +supplied, +expiry}:
      +action = {Driver.Action{event, delay, candidate, supplied, expiry} : Driver.Action}
      fenced_product(state, Engine.fence(core(state), event, True{}, context(state, action, job, Canonical.RequestClear{})), action, job)

def retry_edit(retry: Bool, +state: T.State, job: T.Job) -> T.State:
  match retry:
    case True{}: enqueue(state, clock(state), T.Edit{job})
    case False{}: state

def edit_planned(state: T.State, +job: T.Job, attempted: Engine.EditAttempt) -> T.State:
  match attempted:
    case Engine.EditAttempt{core, Driver.EditPlan{retry, actions}}:
      retry_edit(retry, issue(replace_core(state, core), actions, Some{job}), job)

def edit(+state: T.State, +job: T.Job) -> T.State:
  match job:
    case T.Job{+p, +l, r, bytes, units, revision, repair, duration}:
      edit_planned(state, T.Job{p, l, r, bytes, units, revision, repair, duration}, Engine.edit_attempt(core(state), p, l))

def finish_stored(state: T.State, p: Nat, l: Nat, r: Nat, recurring: Bool) -> T.State:
  match state:
    case T.State{+core, items, next, count, seed, environment, latest, valid, +finishes, +next_finish}:
      +now = Engine.clock(core_value(core))
      +finish = {T.Finish{p, l, r, next_finish, next_finish, Nat.add(now, 200n), recurring, [], False{}, 0n} : T.Finish}
      finish_actions([NativeFinish.poll(finish, now, 0n), NativeFinish.poll(finish, now, 200n)],
        T.State{core, items, next, count, seed, environment, latest, valid, NativeFinish.replace(finishes, finish), Nat.add(next_finish, 1n)}, finish)

def next_finish(state: T.State) -> Nat:
  match state:
    case T.State{_, _, _, _, _, _, _, _, _, value}: value

def finish_available(found: Maybe<&2, T.Finish>, +state: T.State, p: Nat, l: Nat, r: Nat, recurring: Bool) -> T.State:
  match found:
    case Some{_}: state
    case None{}:
      Bool.pick(T.State, Nat.is_le(200n, Nat.sub(maximum(), clock(state))) && Nat.is_lt(next_finish(state), maximum()),
        finish_stored(state, p, l, r, recurring), invalid(state))

def finish_round(+state: T.State, +p: Nat, +recurring: Bool, round: Maybe<&2, Canonical.Round>) -> T.State:
  match round:
    case None{}: Bool.pick(T.State, recurring, workload(state, p, Workload.Next{}), state)
    case Some{Canonical.Round{_, l, r, _, _, _, _, _}}:
      finish_available(NativeFinish.find(finish_scopes(state), p), state, p, l, r, recurring)

def start_finish(+state: T.State, +p: Nat, recurring: Bool) -> T.State:
  finish_round(state, p, recurring, Canonical.find_round(p, Driver.rounds(Engine.canonical(core(state)))))

def recurring_next(+state: T.State, +p: Nat, recurring: Bool) -> T.State:
  Bool.pick(T.State, recurring, workload(state, p, Workload.Next{}), state)

def arrival_kind(kind: U32, state: T.State, +p: Nat, revision: Nat, bytes: Nat, units: List<&2, Nat>, repair: Bool, recurring: Bool) -> T.State:
  match kind:
    case 0: recurring_next(state, p, recurring)
    case 1: edit(recurring_next(state, p, recurring), T.Job{p, 1n, 0n, bytes, units, revision, repair, None{}})
    case 2: start_finish(state, p, recurring)
    case _: invalid(state)

def valid_arrival(valid: Bool, state: T.State, emission: Workload.Emission) -> T.State:
  match valid emission:
    case False{} _: state
    case True{} Workload.Emission{_, p, _, kind, _, revision, bytes, units, repair, recurring}:
      arrival_kind(kind, state, p, revision, bytes, units, repair, recurring)

def arrival(+state: T.State, emission: Workload.Emission) -> T.State:
  match emission:
    case Workload.Emission{time, +p, +generation, kind, task, revision, bytes, units, repair, +recurring}:
      valid_arrival(Engine.workload_valid(core(state), p, generation, recurring), state,
        Workload.Emission{time, p, generation, kind, task, revision, bytes, units, repair, recurring})

def finish_live_found(found: Maybe<&2, T.Finish>, attempt: Nat) -> Bool:
  match found:
    case None{}: False{}
    case Some{finish}: Nat.is_eq(finish_attempt(finish), attempt)

def finish_live(state: T.State, job: T.Job, attempt: Nat) -> Bool:
  match job:
    case T.Job{p, _, _, _, _, _, _, _}:
      finish_live_found(NativeFinish.find(finish_scopes(state), p), attempt)

def finish_product(live: Bool, state: T.State, action: Driver.Action, job: T.Job) -> T.Step:
  match live:
    case True{}: product(state, action, Some{job})
    case False{}: T.Step{state, None{}}

def input(+state: T.State, input: T.Input) -> T.Step:
  match input:
    case T.Arrival{emission}: T.Step{arrival(state, emission), None{}}
    case T.Edit{job}: T.Step{edit(state, job), None{}}
    case T.Event{action, job}: product(state, action, job)
    case T.FinishInput{action, +job, attempt}: finish_product(finish_live(state, job, attempt), state, action, job)
    case T.GraphFact{key, position, fact, limits}: graph(state, key, position, fact, limits)

def located_run(state: T.State, located: T.Located) -> T.Step:
  match located:
    case T.Located{Some{value}, remaining}: input(replaced_items(state, remaining), value)
    case T.Located{None{}, _}: T.Step{invalid(state), None{}}

def take_payload(state: T.State, order: Nat) -> T.Step:
  match state:
    case T.State{core, +items, next, count, seed, environment, latest, valid, finishes, next_finish}:
      located_run(T.State{core, items, next, count, seed, environment, latest, valid, finishes, next_finish}, locate(items, order))

def queue_head(entries: List<&2, Scheduler.Entry>) -> Maybe<&2, Scheduler.Entry>:
  match entries:
    case head <> _: Some{head}
    case Nil{}: None{}

def peek_core(state: EngineTypes.State) -> Maybe<&2, Scheduler.Entry>:
  queue_head(Engine.queued(state))

def peek(state: T.State) -> Maybe<&2, Scheduler.Entry>:
  peek_core(core(state))

def within(entry: Maybe<&2, Scheduler.Entry>, endpoint: Nat) -> Bool:
  match entry:
    case Some{Scheduler.Entry{time, _}}: Nat.is_le(time, endpoint)
    case None{}: False{}

def state_valid(state: T.State) -> Bool:
  match state:
    case T.State{_, _, _, _, _, _, _, valid, _, _}: valid

# Candidate private transport only: keep the entire native state opaque to
# recursive forwarding. Public T.State and all facts/controls remain unchanged.
# Only this allocator creates a carrier, always with its actual single state.
# Recursive result lists also keep private outputs boxed; unlike Maybe<Step>,
# they cannot flatten the embedded whole state back into every continuation.
type Carrier is Data:
  Carrier{states: List<&2, T.State>}

def carrier(state: T.State) -> Carrier:
  Carrier{[state]}

def finished_step(states: List<&2, T.State>) -> List<&2, T.Step>:
  match states:
    case state <> _: [T.Step{state,None{}}]
    case Nil{}: []

def continued_step(step: T.Step, rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match step:
    case T.Step{state,None{}}: rest(carrier(state))
    case step: [step]

def taken_carrier(taken: Engine.Taken, states: List<&2, T.State>,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match taken states:
    case Engine.Taken{core,None{}} state <> _: [T.Step{replace_core(state,core),None{}}]
    case Engine.Taken{core,Some{Scheduler.Entry{_,order}}} state <> _:
      continued_step(take_payload(replace_core(state,core),order),rest)
    case _ Nil{}: []

def take_carrier(states: List<&2, T.State>, rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match states:
    case +state <> _: taken_carrier(Engine.take(core(state)),[state],rest)
    case Nil{}: []

def take_allowed(allowed: Bool, states: List<&2, T.State>,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match allowed:
    case True{}: take_carrier(states,rest)
    case False{}: finished_step(states)

def selected_state(states: List<&2, T.State>, endpoint: Nat,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match states:
    case +state <> _:
      take_allowed(state_valid(state) && within(peek(state),endpoint),[state],rest)
    case Nil{}: []

def selected_carrier(value: Carrier, endpoint: Nat,
    rest: Carrier -> List<&2, T.Step>) -> List<&2, T.Step>:
  match value:
    case Carrier{states}: selected_state(states,endpoint,rest)

def stopped_carrier(value: Carrier) -> List<&2, T.Step>:
  match value:
    case Carrier{states}: finished_step(states)

def step_carrier(fuel: Nat, value: Carrier, +endpoint: Nat) -> List<&2, T.Step>:
  match fuel:
    case 0n: stopped_carrier(value)
    case 1n+rest: selected_carrier(value,endpoint,next => step_carrier(rest,next,endpoint))

# Nil cannot arise from the singleton allocator. The outer boundary keeps its
# original input atomically if that private invariant is ever violated.
def step_result(result: List<&2, T.Step>, original: T.State) -> T.Step:
  match result:
    case step <> _: step
    case Nil{}: T.Step{original,None{}}

def step_loop(fuel: Nat, +state: T.State, endpoint: Nat) -> T.Step:
  step_result(step_carrier(fuel,carrier(state),endpoint),state)

def step(state: T.State) -> T.Step:
  step_loop(1000n,state,maximum())

def finished_advance(states: List<&2, T.State>, frames: List<&2, T.Frame>) -> List<&2, T.Advanced>:
  match states:
    case state <> _: [T.Advanced{state,List.reverse(&2,T.Frame,frames)}]
    case Nil{}: []

def stopped_advance(value: Carrier, frames: List<&2, T.Frame>) -> List<&2, T.Advanced>:
  match value:
    case Carrier{states}: finished_advance(states,frames)

def advanced_carrier(result: List<&2, T.Step>, frames: List<&2, T.Frame>,
    rest: Carrier -> List<&2, T.Frame> -> List<&2, T.Advanced>) -> List<&2, T.Advanced>:
  match result:
    case T.Step{state,Some{frame}} <> _: rest(carrier(state),frame <> frames)
    case T.Step{state,None{}} <> _: [T.Advanced{state,List.reverse(&2,T.Frame,frames)}]
    case Nil{}: []

def advance_carrier(budget: Nat, value: Carrier, +endpoint: Nat,
    frames: List<&2, T.Frame>) -> List<&2, T.Advanced>:
  match budget:
    case 0n: stopped_advance(value,frames)
    case 1n+rest:
      advanced_carrier(step_carrier(1000n,value,endpoint),frames,
        next => fs => advance_carrier(rest,next,endpoint,fs))

def advance_result(result: List<&2, T.Advanced>, original: T.State) -> T.Advanced:
  match result:
    case advanced <> _: advanced
    case Nil{}: T.Advanced{original,[]}

def advance_loop(budget: Nat, +state: T.State, endpoint: Nat, frames: List<&2, T.Frame>) -> T.Advanced:
  advance_result(advance_carrier(budget,carrier(state),endpoint,frames),state)

def advance_input_supported(state: T.State, budget: Nat, +endpoint: Nat) -> Bool:
  Nat.is_le(budget, maximum()) && Nat.is_le(endpoint, maximum()) && Nat.is_le(clock(state), endpoint)

def advance_checked(supported: Bool, state: T.State, budget: Nat, endpoint: Nat) -> T.Advanced:
  match supported:
    case True{}: advance_loop(budget, state, endpoint, [])
    case False{}: T.Advanced{invalid(state), []}

def advance(+state: T.State, +budget: Nat, +endpoint: Nat) -> T.Advanced:
  advance_checked(advance_input_supported(state, budget, endpoint), state, budget, endpoint)

# Obsolete recurring arrivals stay in the ordered queue. The actual shared
# scheduler advances its clock when they are taken; arrival validation then
# suppresses their business facts, preserving public metadata-only endpoints.
def atomic_control(valid: Bool, original: T.State, changed: T.State) -> T.Controlled:
  match valid:
    case True{}: T.Controlled{changed, True{}}
    case False{}: T.Controlled{original, False{}}

def controlled_scopes(scopes: List<&2, Advicees.Scope>, state: T.State, +control: Workload.Control) -> T.State:
  match scopes:
    case Nil{}: state
    case Advicees.Scope{_, partition, _} <> tail:
      controlled_scopes(tail, workload(state, partition, Workload.Controlled{control}), control)

def workload_control(+state: T.State, control: Workload.Control, targets: Advicees.Targeted) -> T.Controlled:
  match targets:
    case Advicees.Targeted{scopes, True{}}:
      +changed = controlled_scopes(scopes, state, control)
      atomic_control(state_valid(changed), state, changed)
    case _: T.Controlled{state, False{}}

def revalidate_environment(+state: T.State) -> T.State:
  +action = {Driver.immediate(Canonical.FinalCandidateCheck{True{}, True{}, True{}, False{}, True{}, True{}}, False{}) : Driver.Action}
  issue(state, Engine.revalidate(core(state), context(state, action, None{}, Canonical.RequestClear{})), None{})

def environment_control(+state: T.State, current: Bool, +ready: Bool, +generation: Nat, readable: Bool) -> T.Controlled:
  match state:
    case T.State{core, items, next, count, seed, T.Environment{delay, outcome, weights, prep, tree, limits, output, lease, _, _, _, _, lifetime}, latest, valid, +finishes, +next_finish}:
      +changed = revalidate_environment(T.State{[Engine.configure_credentials(core_value(core), ready, generation)], items, next, count, seed,
        T.Environment{delay, outcome, weights, prep, tree, limits, output, lease, current, ready, generation, readable, lifetime}, latest, valid, finishes, next_finish})
      atomic_control(state_valid(changed), state, changed)

def jev_control(state: T.State, delay: Nat, weights: List<&2, Numeric.Words>) -> T.Controlled:
  match state:
    case T.State{core, items, next, count, seed, T.Environment{_, _, _, prep, tree, limits, output, lease, current, ready, generation, readable, lifetime}, latest, valid, +finishes, +next_finish}:
      T.Controlled{T.State{core, items, next, count, seed,
        T.Environment{delay, None{}, weights, prep, tree, limits, output, lease, current, ready, generation, readable, lifetime}, latest, valid, finishes, next_finish}, True{}}

def jev_supported(valid: Bool, state: T.State, delay: Nat, weights: List<&2, Numeric.Words>) -> T.Controlled:
  match valid:
    case True{}: jev_control(state, delay, weights)
    case False{}: T.Controlled{state, False{}}

def unit_sizes(units: List<&2, Nat>) -> Bool:
  match units:
    case Nil{}: True{}
    case +head <> tail: Nat.is_gt(head, 0n) && Nat.is_le(head, Nat.div(maximum(), 2n)) && unit_sizes(tail)

def workload_supported(control: Workload.Control) -> Bool:
  match control:
    case Workload.Pace{+interval}: Nat.is_gt(U32.to_nat(interval), 0n) && Nat.is_le(U32.to_nat(interval), 1000000000n)
    case Workload.Sizes{+bytes, +units}: Nat.is_gt(bytes, 0n) && Nat.is_le(bytes, Nat.div(maximum(), 2n)) && Nat.is_le(List.length(&2, Nat, units), 1024n) && unit_sizes(units)
    case Workload.Burst{+count}: Nat.is_gt(count, 0n) && Nat.is_le(count, 1024n)
    case Workload.Duration{duration}: Nat.is_le(duration, 1000000000n)
    case Workload.Suspend{_}: True{}

def controlled_workload(valid: Bool, +state: T.State, identity: Maybe<&2, Nat>, value: Workload.Control) -> T.Controlled:
  match valid:
    case True{}: workload_control(state, value, Engine.advicee_targets(core(state), identity))
    case False{}: T.Controlled{state, False{}}

def controlled_environment(valid: Bool, state: T.State, current: Bool, ready: Bool, generation: Nat, readable: Bool) -> T.Controlled:
  match valid:
    case True{}: environment_control(state, current, ready, generation, readable)
    case False{}: T.Controlled{state, False{}}

def control(+state: T.State, control: T.Control) -> T.Controlled:
  match control:
    case T.WorkloadControl{identity, +value}: controlled_workload(workload_supported(value), state, identity, value)
    case T.JevProfile{+delay, +weights}:
      jev_supported(Nat.is_le(delay, 1000000000n) && Nat.is_eq(List.length(&2, Numeric.Words, weights), 6n) && weights_valid(weights) && weights_enabled(weights), state, delay, weights)
    case T.EnvironmentControl{current, ready, +generation, readable}:
      controlled_environment(Nat.is_gt(generation, 0n) && Nat.is_le(generation, 1000000000n), state, current, ready, generation, readable)
