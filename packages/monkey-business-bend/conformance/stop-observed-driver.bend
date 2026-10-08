import Base
import ./stop-original-inputs.bend as Inputs
import ./stop-output-original-inputs.bend as OutputInputs
import ./stop-observed-wire.bend as Wire
import ./stop-observed-initial.bend as Initial
import ./advicee-lifecycle-driver.bend as Edge
import ./sharing-observed-transport.bend as Transport
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../OutputScenario.bend as Output
import ../Scheduler.bend as Scheduler
import ../StopScenario.bend as Stop
import ../Driver.bend as Driver
import ../Callbacks.bend as Callbacks
import ../../agent-flow-bend/ImportGraph.bend as Graph
import ../../agent-flow-bend/Canonical.bend as C

# Original boundaries call the same factual scheduler/interpreter. The counter
# measures returned public observations, separately from finite transport fuel:
# Finish registration and silent original inputs consume no public event budget.
type Running is Data:
  Running{input: Inputs.Scenario, runtime: List<&2, Edge.Runtime>, issued: Nat,
    frames: List<&2, Wire.Frame>, valid: Bool, observations: Nat}
type Facts is Data:
  Facts{issued: Nat}

def business(+state: Types.State) -> Wire.BusinessState:
  Wire.BusinessState{Engine.canonical(state), Engine.stop_entries(state)}

def business_states(states: List<&2, Types.State>) -> List<&2, Wire.BusinessState>:
  match states:
    case Nil{}: []
    case state <> rest: business(state) <> business_states(rest)

def runtime_business(runtime: List<&2, Edge.Runtime>) -> List<&2, Wire.BusinessState>:
  business_states(Edge.runtime_states(runtime))

def scheduler_time(scheduler: Scheduler.State) -> Nat:
  match scheduler:
    case Scheduler.State{_, now}: now

def state_time(state: Types.State) -> Nat:
  match state:
    case Types.State{_, _, scheduler, _, _, _, _, _, _, _, _, _, _}: scheduler_time(scheduler)

def runtime_time(runtime: List<&2, Edge.Runtime>) -> Nat:
  match runtime:
    case Edge.Runtime{state, _, _, _} <> Nil{}: state_time(state)
    case _: 0n

def endpoint(+runtime: List<&2, Edge.Runtime>) -> Wire.Endpoint:
  Wire.Endpoint{runtime_time(runtime), runtime_business(runtime)}

def outcome(result: List<&2, C.Step>) -> List<&2, Wire.Outcome>:
  match result:
    case Nil{}: []
    case C.Advanced{_, outputs} <> rest: Wire.Advanced{outputs} <> outcome(rest)
    case C.Rejected{_, reason} <> rest: Wire.Rejected{reason} <> outcome(rest)

def graph_result(result: List<&2, Types.GraphTransition>) -> List<&2, Wire.GraphResult>:
  match result:
    case Nil{}: []
    case Types.GraphTransition{_, before, Graph.BoundedStep{after, command}} <> rest:
      Wire.GraphAdvanced{before, after, command} <> graph_result(rest)
    case Types.GraphRejected{_} <> rest: Wire.GraphRejected{} <> graph_result(rest)

def observation(frame: Edge.ObservedFrame) -> List<&2, Wire.Observation>:
  match frame:
    case Edge.CanonicalFrame{
      before,
      after,
      time,
      order,
      event,
      result,
      _,
      _,
      provided,
      scopes,
      _,
      _
    }:
      [
        Wire.Canonical{
          time,
          order,
          business_states(before),
          business_states(after),
          event,
          outcome(result),
          provided,
          scopes
        }
      ]
    case Edge.CacheFrame{
      before,
      after,
      time,
      order,
      fact,
      event,
      result,
      _,
      _,
      provided,
      scopes,
      _,
      _
    }:
      [
        Wire.Cache{
          time,
          order,
          business_states(before),
          business_states(after),
          fact,
          event,
          outcome(result),
          provided,
          scopes
        }
      ]
    case Edge.GraphFrame{
      before,
      after,
      time,
      order,
      key,
      position,
      event,
      result,
      _,
      _,
      provided,
      scopes,
      _,
      _
    }:
      [
        Wire.Graph{
          time,
          order,
          business_states(before),
          business_states(after),
          key,
          position,
          event,
          graph_result(result),
          provided,
          scopes
        }
      ]
    case Edge.FinishFrame{
      before,
      after,
      time,
      order,
      input,
      finish,
      created,
      _,
      _,
      provided,
      scopes,
      _,
      _
    }:
      [
        Wire.Finish{
          time,
          order,
          business_states(before),
          business_states(after),
          input,
          finish,
          created,
          provided,
          scopes
        }
      ]
    case Edge.UnexpectedInput{}: []

def context_receipt(context: Maybe<&2, Edge.EmissionContext>) -> Maybe<&2, Driver.OutcomeReceipt>:
  match context:
    case Some{Edge.EmissionContext{_, receipt}}: receipt
    case None{}: None{}

def output_capture(issuance: Edge.Issuance) -> Maybe<&2, Output.Capture>:
  match issuance:
    case Edge.Environmental{output}: output
    case _: None{}

def origin(issuance: Edge.Issuance) -> Wire.Origin:
  match issuance:
    case Edge.Environmental{_}: Wire.Environmental{}
    case Edge.CanonicalFeedback{}: Wire.CanonicalFeedback{}
    case Edge.RawInput{}: Wire.RawInput{}

def issued(
  job: Edge.Job,
  context: Maybe<&2, Edge.EmissionContext>,
  +issuance: Edge.Issuance
) -> Wire.IssuedFacts:
  Wire.IssuedFacts{
    Edge.source_job(job),
    context_receipt(context),
    output_capture(issuance),
    origin(issuance)
  }

def input_issuance(input: Edge.Input) -> Maybe<&2, Wire.IssuedFacts>:
  match input:
    case Edge.Event{_, job, context, issuance}: Some{issued(job, context, issuance)}
    case Edge.FitEvent{_, job, _, context, issuance}: Some{issued(job, context, issuance)}
    case _: None{}

def boxed_issuance(value: Maybe<&2, Wire.IssuedFacts>) -> List<&2, Wire.IssuedFacts>:
  match value:
    case Some{value}: [value]
    case None{}: []

def optional_issuance(values: List<&2, Wire.IssuedFacts>) -> Maybe<&2, Wire.IssuedFacts>:
  match values:
    case value <> Nil{}: Some{value}
    case _: None{}

def emission(item: Edge.Item) -> Wire.Emission:
  match item:
    case Edge.Item{at, order, Edge.Event{action, job, context, issuance}}:
      Wire.Action{at, order, action, None{}, issued(job, context, issuance)}
    case Edge.Item{at, order, Edge.FitEvent{action, job, attempt, context, issuance}}:
      Wire.Action{at, order, action, Some{attempt}, issued(job, context, issuance)}
    case Edge.Item{at, order, Edge.Edit{job}}: Wire.Edit{at, order, Edge.source_job(job)}
    case Edge.Item{at, order, Edge.SourceEdit{p, activity, bytes, units, outcome}}:
      Wire.SourceEdit{at, order, p, activity, bytes, units, outcome}
    case Edge.Item{at, order, Edge.Finish{input}}: Wire.FinishInput{at, order, input}
    case Edge.Item{at, order, Edge.FinishIntent{p, started, cutoff, recurring}}:
      Wire.FinishIntent{at, order, p, started, cutoff, recurring}
    case Edge.Item{at, order, Edge.Fact{p, l, r, op, position, event}}:
      Wire.GraphInput{at, order, p, l, r, op, position, event}
    case Edge.Item{at, order, Edge.Arrival{event, activity}}: Wire.Arrival{
      at,
      order,
      event,
      activity
    }
    case Edge.Item{at, order, Edge.Cache{fact, job}}: Wire.CacheInput{
      at,
      order,
      fact,
      Edge.source_job(job)
    }
    case Edge.Item{at, order, Edge.Missing{}}: Wire.Missing{at, order}

def appended_item(
  include: Bool,
  item: Edge.Item,
  rest: List<&2, Wire.Emission>
) -> List<&2, Wire.Emission>:
  match include:
    case True{}: emission(item) <> rest
    case False{}: rest

def appended_at(
  item: Edge.Item,
  watermark: Nat,
  rest: List<&2, Wire.Emission>
) -> List<&2, Wire.Emission>:
  match item:
    case Edge.Item{at, +order, input}: appended_item(
      Nat.is_le(watermark, order),
      Edge.Item{at, order, input},
      rest
    )

def appended(items: List<&2, Edge.Item>, +watermark: Nat) -> List<&2, Wire.Emission>:
  match items:
    case Nil{}: []
    case +item <> rest: appended_at(item, watermark, appended(rest, watermark))

def emissions(
  before: List<&2, Edge.Runtime>,
  after: List<&2, Edge.Runtime>
) -> List<&2, Wire.Emission>:
  appended(Edge.runtime_items(after), Edge.runtime_sequence(before))

def physical(
  values: List<&2, Edge.PhysicalDelivery>,
  +time: Nat,
  +order: Nat
) -> List<&2, Wire.Physical>:
  match values:
    case Nil{}: []
    case Edge.PhysicalDelivery{before, after, action} <> rest:
      Wire.Physical{time, order, runtime_business(before), runtime_business(after), action} <> physical(
        rest,
        time,
        order
      )

def captured_hook(
  captured: Transport.Captured,
  ih: Facts -> Edge.CommandHook<Facts>
) -> List<&2, Edge.Runtime> & Edge.CommandHook<Facts>:
  match captured:
    case Transport.Captured{runtime, issued}: (runtime, ih(Facts{issued}))

def capture_command(runtime: List<&2, Edge.Runtime>, facts: Facts,
    ih: Facts -> Edge.CommandHook<Facts>) -> List<&2, Edge.Runtime> & Edge.CommandHook<Facts>:
  match facts:
    case Facts{issued}: captured_hook(Transport.capture(runtime, issued), ih)

def hook(outputs: List<&2, C.Output>, facts: Facts) -> Edge.CommandHook<Facts>:
  match outputs:
    case Nil{}: Edge.HookEnd{facts}
    case _ <> rest:
      continuation: Facts -> Edge.CommandHook<Facts> = next => hook(rest, next)
      apply: Facts -> C.Output -> List<&2, Edge.Runtime> -> (List<&2, Edge.Runtime> & Edge.CommandHook<Facts>) = current => actual => runtime => capture_command(
        runtime,
        current,
        continuation
      )
      Edge.HookNext{facts, Edge.default_handler, apply}

def finish_before(
  before: List<&2, Edge.Runtime>,
  provided: Maybe<&2, Nat>
) -> Maybe<&2, Stop.Finish>:
  match before provided:
    case Edge.Runtime{state, _, _, _} <> Nil{} Some{p}: Engine.stop_find(state, p)
    case _ _: None{}

def frame_finish(frame: Edge.ObservedFrame) -> Maybe<&2, Stop.Finish>:
  match frame:
    case Edge.FinishFrame{_, _, _, _, _, finish, _, _, _, _, _, _, _}: finish
    case Edge.CanonicalFrame{_, _, _, _, _, _, before, _, provided, _, _, _}: finish_before(
      before,
      provided
    )
    case Edge.CacheFrame{_, _, _, _, _, _, _, before, _, provided, _, _, _}: finish_before(
      before,
      provided
    )
    case Edge.GraphFrame{_, _, _, _, _, _, _, _, before, _, provided, _, _, _}: finish_before(
      before,
      provided
    )
    case Edge.UnexpectedInput{}: None{}

def consumed(frame: Edge.ObservedFrame) -> Nat:
  match frame:
    case Edge.FinishFrame{_, _, _, _, _, _, _, _, _, _, _, _, _}: 0n
    case Edge.UnexpectedInput{}: 0n
    case _: 1n

def frame_observation(
  value: List<&2, Wire.Observation>,
  +frame: Edge.ObservedFrame,
  selected_issuance: List<&2, Wire.IssuedFacts>
) -> List<&2, Wire.Frame>:
  match value frame:
    case value <> Nil{} Edge.CanonicalFrame{
      _,
      _,
      time,
      order,
      _,
      _,
      before,
      after,
      _,
      _,
      receipt,
      deliveries
    }:
      [
        Wire.Observed{
          value,
          frame_finish(frame),
          receipt,
          physical(deliveries, time, order),
          optional_issuance(selected_issuance),
          emissions(before, after)
        }
      ]
    case value <> Nil{} Edge.CacheFrame{
      _,
      _,
      time,
      order,
      _,
      _,
      _,
      before,
      after,
      _,
      _,
      receipt,
      deliveries
    }:
      [
        Wire.Observed{
          value,
          frame_finish(frame),
          receipt,
          physical(deliveries, time, order),
          optional_issuance(selected_issuance),
          emissions(before, after)
        }
      ]
    case value <> Nil{} Edge.GraphFrame{
      _,
      _,
      time,
      order,
      _,
      _,
      _,
      _,
      before,
      after,
      _,
      _,
      receipt,
      deliveries
    }:
      [
        Wire.Observed{
          value,
          frame_finish(frame),
          receipt,
          physical(deliveries, time, order),
          optional_issuance(selected_issuance),
          emissions(before, after)
        }
      ]
    case value <> Nil{} Edge.FinishFrame{
      _,
      _,
      time,
      order,
      _,
      _,
      _,
      before,
      after,
      _,
      _,
      receipt,
      deliveries
    }:
      [
        Wire.Observed{
          value,
          frame_finish(frame),
          receipt,
          physical(deliveries, time, order),
          optional_issuance(selected_issuance),
          emissions(before, after)
        }
      ]
    case _ _: []

def wire_frame(
  +frame: Edge.ObservedFrame,
  selected_issuance: List<&2, Wire.IssuedFacts>
) -> List<&2, Wire.Frame>:
  frame_observation(observation(frame), frame, selected_issuance)

def recorded_wire(
  value: List<&2, Wire.Frame>,
  +used: Nat,
  runtime: List<&2, Edge.Runtime>,
  issued: Nat,
  input: Inputs.Scenario,
  frames: List<&2, Wire.Frame>,
  observations: Nat,
  ih: Nat -> Running -> Running
) -> Running:
  match value:
    case value <> Nil{}: ih(
      used,
      Running{
        input,
        runtime,
        issued,
        List.append(&2, Wire.Frame, frames, [value]),
        True{},
        Nat.add(observations, used)
      }
    )
    case _: Running{
      input,
      runtime,
      issued,
      List.append(&2, Wire.Frame, frames, [Wire.InvalidTransport{}]),
      False{},
      observations
    }

def recorded(
  +frame: Edge.ObservedFrame,
  selected_issuance: List<&2, Wire.IssuedFacts>,
  runtime: List<&2, Edge.Runtime>,
  issued: Nat,
  input: Inputs.Scenario,
  frames: List<&2, Wire.Frame>,
  observations: Nat,
  ih: Nat -> Running -> Running
) -> Running:
  recorded_wire(
    wire_frame(frame, selected_issuance),
    consumed(frame),
    runtime,
    issued,
    input,
    frames,
    observations,
    ih
  )

def silent_delivery(
  target: Maybe<&2, Callbacks.Target>,
  receipt: Maybe<&2, Callbacks.Fact>,
  +before: List<&2, Edge.Runtime>,
  +after: List<&2, Edge.Runtime>,
  +time: Nat,
  order: Nat,
  selected_issuance: List<&2, Wire.IssuedFacts>,
  frames: List<&2, Wire.Frame>
) -> List<&2, Wire.Frame>:
  match target receipt:
    case Some{_} Some{+receipt}:
      List.append(
        &2,
        Wire.Frame,
        frames,
        [
          Wire.PhysicalOnly{
            Wire.Physical{
              time,
              order,
              runtime_business(before),
              runtime_business(after),
              Engine.output_deliver(receipt, time)
            },
            receipt,
            optional_issuance(selected_issuance),
            emissions(before, after)
          }
        ]
      )
    case _ _: frames

def observed(
  value: Transport.Stepped<Facts>,
  +before: List<&2, Edge.Runtime>,
  time: Nat,
  order: Nat,
  receipt: Maybe<&2, Callbacks.Fact>,
  selected_issuance: List<&2, Wire.IssuedFacts>,
  input: Inputs.Scenario,
  frames: List<&2, Wire.Frame>,
  observations: Nat,
  ih: Nat -> Running -> Running
) -> Running:
  match value:
    case Transport.Stepped{Edge.Observed{+runtime, Some{Edge.UnexpectedInput{}}, _}, _}:
      Running{
        input,
        runtime,
        0n,
        List.append(&2, Wire.Frame, frames, [Wire.InvalidTransport{}]),
        False{},
        observations
      }
    case Transport.Stepped{Edge.Observed{runtime, Some{frame}, Edge.HookEnd{Facts{issued}}}, _}:
      recorded(frame, selected_issuance, runtime, issued, input, frames, observations, ih)
    case Transport.Stepped{Edge.Observed{+runtime, None{}, Edge.HookEnd{Facts{issued}}}, target}:
      ih(
        0n,
        Running{
          input,
          runtime,
          issued,
          silent_delivery(target, receipt, before, runtime, time, order, selected_issuance, frames),
          True{},
          observations
        }
      )
    case Transport.Stepped{Edge.Observed{+runtime, _, _}, _}:
      Running{
        input,
        runtime,
        0n,
        List.append(&2, Wire.Frame, frames, [Wire.InvalidTransport{}]),
        False{},
        observations
      }

def selected_with_issuance(
  selected_issuance: List<&2, Wire.IssuedFacts>,
  +runtime: List<&2, Edge.Runtime>,
  issued: Nat,
  +time: Nat,
  +order: Nat,
  input: Inputs.Scenario,
  frames: List<&2, Wire.Frame>,
  observations: Nat,
  environment: Edge.Environment,
  endpoint: Nat,
  ih: Nat -> Running -> Running
) -> Running:
  continuation: List<&2, C.Output> -> Edge.TransitionHook<Facts> = outputs => Edge.transition_hook(
    Facts,
    hook(outputs, Facts{issued})
  )
  observed(
    Transport.step(Facts, runtime, endpoint, environment, continuation),
    runtime,
    time,
    order,
    Edge.frame_receipt(runtime, order),
    selected_issuance,
    input,
    frames,
    observations,
    ih
  )

def selected_entry(
  entries: List<&2, Scheduler.Entry>,
  +runtime: List<&2, Edge.Runtime>,
  issued: Nat,
  input: Inputs.Scenario,
  frames: List<&2, Wire.Frame>,
  observations: Nat,
  environment: Edge.Environment,
  endpoint: Nat,
  ih: Nat -> Running -> Running
) -> Running:
  match entries:
    case Scheduler.Entry{+time, +order} <> _:
      selected_with_issuance(
        boxed_issuance(input_issuance(Edge.lookup(Edge.runtime_items(runtime), order))),
        runtime,
        issued,
        time,
        order,
        input,
        frames,
        observations,
        environment,
        endpoint,
        ih
      )
    case Nil{}: Running{input, runtime, issued, frames, True{}, observations}

def selected(+runtime: List<&2, Edge.Runtime>, issued: Nat, input: Inputs.Scenario,
    frames: List<&2, Wire.Frame>, observations: Nat, environment: Edge.Environment, endpoint: Nat,
    ih: Nat -> Running -> Running) -> Running:
  selected_entry(
    Edge.runtime_entries(runtime),
    runtime,
    issued,
    input,
    frames,
    observations,
    environment,
    endpoint,
    ih
  )

def in_horizon(entries: List<&2, Scheduler.Entry>, endpoint: Nat) -> Bool:
  match entries:
    case Scheduler.Entry{at, _} <> _: Nat.is_le(at, endpoint)
    case Nil{}: False{}

def bounded(within: Bool, fuel: Nat, budget: Nat, running: Running,
    environment: Edge.Environment, endpoint: Nat, ih: Nat -> Running -> Running) -> Running:
  match within fuel budget running:
    case False{} _ _ running: running
    case True{} _ 0n running: running
    case True{} 0n _ Running{input, +runtime, issued, frames, _, observations}:
      Running{
        input,
        runtime,
        issued,
        List.append(&2, Wire.Frame, frames, [Wire.InvalidTransport{}]),
        False{},
        observations
      }
    case True{} 1n+rest _ Running{input, runtime, issued, frames, True{}, observations}:
      selected(runtime, issued, input, frames, observations, environment, endpoint, ih)
    case _ _ _ running: running

def synced(+runtime: List<&2, Edge.Runtime>, issued: Nat, input: Inputs.Scenario,
    frames: List<&2, Wire.Frame>, observations: Nat, fuel: Nat, budget: Nat,
    +environment: Edge.Environment, +endpoint: Nat, ih: Nat -> Running -> Running) -> Running:
  bounded(in_horizon(Edge.runtime_entries(runtime), endpoint), fuel, budget,
    Running{input, runtime, issued, frames, True{}, observations}, environment, endpoint, ih)

def captured(captured: Transport.Captured, input: Inputs.Scenario, frames: List<&2, Wire.Frame>,
    observations: Nat, fuel: Nat, budget: Nat, environment: Edge.Environment, endpoint: Nat,
    ih: Nat -> Running -> Running) -> Running:
  match captured:
    case Transport.Captured{runtime, issued}:
      synced(
        Edge.runtime_sync(runtime),
        issued,
        input,
        frames,
        observations,
        fuel,
        budget,
        environment,
        endpoint,
        ih
      )

def advance(
  fuel: Nat,
  +budget: Nat,
  running: Running,
  +environment: Edge.Environment,
  +endpoint: Nat
) -> Running:
  match fuel running:
    case 0n Running{input, +runtime, issued, frames, valid, observations}:
      continuation: Nat -> Running -> Running = used => next => next
      bounded(
        in_horizon(Edge.runtime_entries(runtime), endpoint),
        0n,
        budget,
        Running{input, runtime, issued, frames, valid, observations},
        environment,
        endpoint,
        continuation
      )
    case 1n++rest Running{input, runtime, issued, frames, True{}, observations}:
      continuation: Nat -> Running -> Running = used => next => advance(
        rest,
        Nat.sub(budget, used),
        next,
        environment,
        endpoint
      )
      captured(
        Transport.capture(runtime, issued),
        input,
        frames,
        observations,
        1n+rest,
        budget,
        environment,
        endpoint,
        continuation
      )
    case _ running: running

def boundary_record(value: Inputs.Boundary, initial: Nat, running: Running) -> Running:
  match running:
    case Running{input, +runtime, issued, frames, valid, +observations}:
      Running{
        input,
        runtime,
        issued,
        List.append(
          &2,
          Wire.Frame,
          frames,
          [Wire.Boundary{value, Nat.sub(observations, initial), endpoint(runtime)}]
        ),
        valid,
        observations
      }

def scheduled(result: Initial.Initialized, running: Running) -> Running:
  match result running:
    case Initial.Initialized{runtime, _, accepted} Running{
      input,
      _,
      issued,
      frames,
      valid,
      observations
    }:
      Running{input, Edge.runtime_sync(runtime), issued, frames, valid && accepted, observations}

def scheduled_boundary(
  +value: Inputs.Input,
  +input: Inputs.Scenario,
  +runtime: List<&2, Edge.Runtime>,
  issued: Nat,
  frames: List<&2, Wire.Frame>,
  valid: Bool,
  +observations: Nat
) -> Running:
  match input:
    case Inputs.Scenario{configuration, _, _}:
      boundary_record(
        Inputs.Schedule{value},
        observations,
        scheduled(
          Initial.scheduled(value, configuration, runtime),
          Running{input, runtime, issued, frames, valid, observations}
        )
      )

# Live controls alter only future environmental facts. Original caller input,
# already-issued capsules and physical receipts remain immutable.
def changed_output_profile(
  profile: Maybe<&2, Edge.StopProfile>,
  outcome: Output.Outcome
) -> Maybe<&2, Edge.StopProfile>:
  match profile:
    case None{}: Some{Edge.StopProfile{outcome, None{}}}
    case Some{Edge.StopProfile{_, bytes}}: Some{Edge.StopProfile{outcome, bytes}}
    case Some{Edge.FitProfile{_, bytes, attempt}}: Some{Edge.FitProfile{outcome, bytes, attempt}}

def changed_output_environment(
  environment: Edge.Environment,
  outcome: Output.Outcome,
  delay: Nat,
  lease: Nat
) -> Edge.Environment:
  match environment:
    case Edge.Environment{seed, tree, graph, prep, _, _, profile, outcomes}:
      Edge.Environment{
        seed,
        tree,
        graph,
        prep,
        delay,
        lease,
        changed_output_profile(profile, outcome),
        outcomes
      }

def boundary_environment(value: Inputs.Boundary, environment: Edge.Environment) -> Edge.Environment:
  match value:
    case Inputs.OutputProfile{outcome, delay, lease}: changed_output_environment(
      environment,
      outcome,
      delay,
      lease
    )
    case _: environment

def profile_boundary(
  value: Inputs.Boundary,
  running: Running,
  before: Edge.Environment,
  after: Edge.Environment
) -> Running:
  match running:
    case Running{input, +runtime, issued, frames, valid, observations}:
      Running{
        input,
        runtime,
        issued,
        List.append(
          &2,
          Wire.Frame,
          frames,
          [Wire.Control{value, before, after, endpoint(runtime), endpoint(runtime)}]
        ),
        valid,
        observations
      }

def missing_terminal(running: Running) -> Running:
  match running:
    case Running{input, +runtime, issued, frames, _, observations}:
      Running{
        input,
        runtime,
        issued,
        List.append(&2, Wire.Frame, frames, [Wire.InvalidTransport{}]),
        False{},
        observations
      }

def terminal_scheduled(+value: Inputs.Input, running: Running) -> Running:
  match running:
    case Running{+input, +runtime, issued, frames, valid, +observations}:
      scheduled_boundary(value, input, runtime, issued, frames, valid, observations)

def terminal_captured(finish: Maybe<&2, Stop.Finish>, at: Nat, +running: Running) -> Running:
  match finish:
    case Some{Stop.Finish{p, _, r, attempt, token, _, _, _, _, _, _, _, _}}:
      terminal_scheduled(
        Inputs.CanonicalInput{at, C.FinishTerminal{p, r, attempt, token, [], C.Unknown{}}},
        running
      )
    case None{}: missing_terminal(running)

def terminal_runtime(runtime: Edge.Runtime, partition: Nat, at: Nat, running: Running) -> Running:
  match runtime:
    case Edge.Runtime{state, _, _, _}: terminal_captured(
      Engine.stop_find(state, partition),
      at,
      running
    )

def terminal_agent(
  agent: Maybe<&2, Initial.Agent>,
  +state: Edge.Runtime,
  at: Nat,
  running: Running
) -> Running:
  match agent:
    case Some{Initial.Agent{_, partition}}: terminal_runtime(state, partition, at, running)
    case None{}: missing_terminal(running)

def terminal_state(runtime: Edge.Runtime) -> Types.State:
  match runtime:
    case Edge.Runtime{state, _, _, _}: state

def terminal_configuration(
  configuration: Inputs.Configuration,
  +runtime: Edge.Runtime,
  at: Nat,
  agent: Maybe<&2, String>,
  running: Running
) -> Running:
  match configuration:
    case Inputs.Configuration{_, declarations, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      terminal_agent(
        Initial.agent(Initial.resolve(declarations, terminal_state(runtime)), agent),
        runtime,
        at,
        running
      )

def terminal_scenario(
  input: Inputs.Scenario,
  runtime: Edge.Runtime,
  at: Nat,
  agent: Maybe<&2, String>,
  running: Running
) -> Running:
  match input:
    case Inputs.Scenario{configuration, _, _}: terminal_configuration(
      configuration,
      runtime,
      at,
      agent,
      running
    )

def terminal_input(
  input: Inputs.Scenario,
  runtime: List<&2, Edge.Runtime>,
  at: Nat,
  agent: Maybe<&2, String>,
  running: Running
) -> Running:
  match runtime:
    case value <> Nil{}: terminal_scenario(input, value, at, agent, running)
    case _: missing_terminal(running)

def mismatched_boundary(at: Nat, agent: Maybe<&2, String>, running: Running) -> Running:
  match running:
    case Running{+input, +runtime, issued, frames, valid, observations}:
      terminal_input(
        input,
        runtime,
        at,
        agent,
        Running{input, runtime, issued, frames, valid, observations}
      )

def boundary(value: Inputs.Boundary, running: Running, +environment: Edge.Environment) -> Running:
  match value running:
    case Inputs.OutputProfile{+outcome, +delay, +lease} running: profile_boundary(
      Inputs.OutputProfile{outcome, delay, lease},
      running,
      environment,
      changed_output_environment(environment, outcome, delay, lease)
    )
    case Inputs.MismatchedTerminal{at, agent} running: mismatched_boundary(at, agent, running)
    case Inputs.Advance{+endpoint, +budget} Running{
      input,
      runtime,
      issued,
      frames,
      valid,
      +observations
    }:
      boundary_record(
        Inputs.Advance{endpoint, budget},
        observations,
        advance(
          1000n,
          budget,
          Running{input, runtime, issued, frames, valid, observations},
          environment,
          endpoint
        )
      )
    case Inputs.Schedule{value} Running{input, runtime, issued, frames, valid, observations}:
      scheduled_boundary(value, input, runtime, issued, frames, valid, observations)

def boundaries(
  list: List<&2, Inputs.Boundary>,
  running: Running,
  +environment: Edge.Environment
) -> Running:
  match list running:
    case Nil{} running: running
    case _ Running{input, runtime, issued, frames, False{}, observations}:
      Running{input, runtime, issued, frames, False{}, observations}
    case +value <> rest running: boundaries(
      rest,
      boundary(value, running, environment),
      boundary_environment(value, environment)
    )

def trace(running: Running) -> Wire.Trace:
  match running:
    case Running{input, runtime, _, frames, valid, _}: Wire.Trace{
      input,
      frames,
      endpoint(runtime),
      valid
    }

def initialized(result: Initial.Initialized, +input: Inputs.Scenario) -> Wire.Trace:
  match result input:
    case Initial.Initialized{runtime, _, valid} Inputs.Scenario{
      configuration,
      _,
      original_boundaries
    }:
      trace(
        boundaries(
          original_boundaries,
          Running{input, runtime, 0n, [], valid, 0n},
          Initial.environment(configuration)
        )
      )

def scenario(+input: Inputs.Scenario) -> Wire.Trace:
  initialized(Initial.scenario(input), input)

def first() -> Wire.Trace:
  scenario(Inputs.first_waiting())

type OriginalCase is Data:
  OriginalFirstWaiting{}
  OriginalEqualWaiting{}
  OriginalLateWaiting{}
  OriginalLatePreparation{}
  OriginalNoRound{}
  OriginalRepeatedFinish{}
  OriginalBackgroundCertain{}
  OriginalBackgroundUncertain{}
  OriginalConfiguredNoRound{}
  OriginalGroupOutput{}
  OriginalOtherAdviceeOutput{}

def original_input(entry: OriginalCase) -> Inputs.Scenario:
  match entry:
    case OriginalFirstWaiting{}: Inputs.first_waiting()
    case OriginalEqualWaiting{}: Inputs.equal_waiting()
    case OriginalLateWaiting{}: Inputs.late_waiting()
    case OriginalLatePreparation{}: Inputs.late_preparation()
    case OriginalNoRound{}: Inputs.no_round()
    case OriginalRepeatedFinish{}: Inputs.repeated_finish()
    case OriginalBackgroundCertain{}: Inputs.background(Output.Certain{})
    case OriginalBackgroundUncertain{}: Inputs.background(Output.Uncertain{})
    case OriginalConfiguredNoRound{}: Inputs.configured_no_round()
    case OriginalGroupOutput{}: Inputs.group_output()
    case OriginalOtherAdviceeOutput{}: Inputs.other_advicee_output()

def original_trace(entry: OriginalCase) -> Wire.Trace:
  scenario(original_input(entry))

def original_traces(cases: List<&2, OriginalCase>) -> List<&2, Wire.Trace>:
  match cases:
    case Nil{}: []
    case head <> tail: original_trace(head) <> original_traces(tail)

def original_scenarios() -> List<&2, Wire.Trace>:
  original_traces(
    [
      OriginalFirstWaiting{},
      OriginalEqualWaiting{},
      OriginalLateWaiting{},
      OriginalLatePreparation{},
      OriginalNoRound{},
      OriginalRepeatedFinish{},
      OriginalBackgroundCertain{},
      OriginalBackgroundUncertain{},
      OriginalConfiguredNoRound{},
      OriginalGroupOutput{},
      OriginalOtherAdviceeOutput{}
    ]
  )

# All original #195 caller inputs execute through the same maintained owner.
def output_traces(inputs: List<&2, Inputs.Scenario>) -> List<&2, Wire.Trace>:
  match inputs:
    case Nil{}: []
    case input <> tail: scenario(input) <> output_traces(tail)

def output_scenarios() -> List<&2, Wire.Trace>:
  output_traces(OutputInputs.cases())
