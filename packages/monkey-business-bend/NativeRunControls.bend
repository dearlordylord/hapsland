import Base
import ./NativeRun.bend as Run
import ./FreshnessScenario.bend as Freshness
import ./NativeRunTypes.bend as T
import ./Engine.bend as Engine
import ./Callbacks.bend as Callbacks
import ./OutputScenario.bend as Output
import ./CredentialFacts.bend as Credentials
import ./TreeFacts.bend as Tree
import ./Numeric.bend as Numeric
import ./Driver.bend as Driver
import ./CollectionScenario.bend as CollectionScenario
import ./WriterScenario.bend as WriterScenario
import ./ExpiryScenario.bend as Expiry
import ./PermitScenario.bend as Permit
import ./FaultTargets.bend as Targets
import ./JevEffects.bend as Jev
import ./NoticeScenario.bend as Notice
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/ImportGraph.bend as Graph

# Shared control application retains original payload ownership across queue
# interventions. Reports expose owner decisions without recomputing them in hosts.
type Report is Data:
  Ordinary{}
  CallbackReport{result: Callbacks.Applicability}
  OutputReport{result: Callbacks.Applicability}
  CredentialsReport{}
  JevReport{result: Jev.Intervention}
  ResponseReport{result: Engine.ResponseResult}
  WriterClaimReport{pending: Maybe<&2, WriterScenario.Pending>}
  WriterAttemptReport{result: Engine.ResponseResult, target: Maybe<&2, CollectionScenario.Identity>}
  WriterReleaseReport{queued: Bool}
type Applied is Data:
  Applied{state: T.State, applied: Bool, report: Report}

def ordinary(changed: T.Controlled) -> Applied:
  match changed:
    case T.Controlled{state, applied}: Applied{state, applied, Ordinary{}}

def callback_sources(state: T.State) -> List<&2, T.RetainedCallback>:
  match state:
    case T.State{_, _, _, _, _, _, _, _, _, _, T.HostFacts{_, callbacks, _, _, _, _}}: callbacks

def retained_match(
  equal: Bool,
  item: T.RetainedCallback,
  rest: Maybe<&2, T.RetainedCallback>
) -> Maybe<&2, T.RetainedCallback>:
  match equal:
    case True{}: Some{item}
    case False{}: rest

def retained_target(item: T.RetainedCallback) -> Callbacks.Target:
  match item:
    case T.RetainedCallback{_, _, _, _, Callbacks.Fact{target, _, _, _}}: target

def callback_source(
  items: List<&2, T.RetainedCallback>,
  +target: Callbacks.Target
) -> Maybe<&2, T.RetainedCallback>:
  match items:
    case Nil{}: None{}
    case +head <> tail: retained_match(
      Callbacks.target_equal(retained_target(head), target),
      head,
      callback_source(tail, target)
    )

def callback_fact(source: Maybe<&2, T.RetainedCallback>) -> Maybe<&2, Callbacks.Fact>:
  match source:
    case Some{T.RetainedCallback{_, _, _, _, fact}}: Some{fact}
    case None{}: None{}

def remaining_items(located: T.Located) -> List<&2, T.Item>:
  match located:
    case T.Located{_, remaining}: remaining

def cancel_orders(orders: List<&2, Nat>, +state: T.State) -> T.State:
  match orders:
    case Nil{}: state
    case +order <> tail:
      cancel_orders(
        tail,
        Run.replaced_items(
          Run.replace_core(state, Engine.cancel(Run.core(state), order)),
          remaining_items(Run.locate(Run.runtime_items(state), order))
        )
      )

# A callback's retained payload is immutable. Hold, release, reorder and copies
# move that exact payload rather than reconstructing a current-round event.
def scheduled_payload(source: Maybe<&2, T.RetainedCallback>) -> Maybe<&2, T.Input>:
  match source:
    case Some{T.RetainedCallback{_, _, _, payload, _}}: Some{payload}
    case None{}: None{}

def queue_exact(
  state: T.State,
  time: Nat,
  +order: Nat,
  payload: T.Input,
  receipt: Maybe<&2, Callbacks.Fact>
) -> T.State:
  match state:
    case T.State{core, items, next, count, seed, env, latest, valid, prepared, jobs, host}:
      T.State{
        [Engine.enqueue(Run.core_value(core), time, order)],
        List.append(&2, T.Item, items, [T.Item{order, payload, [receipt]}]),
        Nat.max(next, (order + 1n : Nat)),
        count,
        seed,
        env,
        latest,
        valid,
        prepared,
        jobs,
        host
      }

def schedule_payload(
  payload: Maybe<&2, T.Input>,
  state: T.State,
  time: Nat,
  order: Nat,
  receipt: Maybe<&2, Callbacks.Fact>
) -> T.State:
  match payload:
    case Some{payload}: queue_exact(state, time, order, payload, receipt)
    case None{}: Run.invalid(state)

def callback_schedule(
  items: List<&2, Callbacks.Scheduled>,
  state: T.State,
  +payload: Maybe<&2, T.Input>,
  +receipt: Maybe<&2, Callbacks.Fact>
) -> T.State:
  match items:
    case Nil{}: state
    case Callbacks.Scheduled{time, order, _} <> tail: callback_schedule(
      tail,
      schedule_payload(payload, state, time, order, receipt),
      payload,
      receipt
    )

def callback_changed(
  state: T.State,
  +source: Maybe<&2, T.RetainedCallback>,
  changed: Engine.CallbackTransition
) -> Applied:
  match changed:
    case Engine.CallbackTransition{core, result, cancel, schedule}:
      Applied{
        callback_schedule(
          schedule,
          cancel_orders(cancel, Run.replace_core(state, core)),
          scheduled_payload(source),
          callback_fact(source)
        ),
        True{},
        CallbackReport{result}
      }

def callback(
  +state: T.State,
  target: Callbacks.Target,
  action: Callbacks.Control,
  +source: Maybe<&2, T.RetainedCallback>
) -> Applied:
  callback_changed(
    state,
    source,
    Engine.callback_action(
      Run.core(state),
      target,
      action,
      callback_fact(source),
      Run.clock(state),
      Run.next_order(state)
    )
  )

def output_payload(payload: T.Input, action: Driver.Action) -> T.Input:
  match payload:
    case T.Event{_, job, context <> _, source_job}: T.Event{action, job, [context], source_job}
    case _: payload

def changed_output_payload(source: Maybe<&2, T.Input>, action: Driver.Action) -> Maybe<&2, T.Input>:
  match source:
    case Some{payload}: Some{output_payload(payload, action)}
    case None{}: None{}

def output_schedule(
  items: List<&2, Callbacks.Scheduled>,
  state: T.State,
  +payload: Maybe<&2, T.Input>
) -> T.State:
  match items:
    case Nil{}: state
    case Callbacks.Scheduled{time, order, action} <> tail:
      output_schedule(
        tail,
        schedule_payload(changed_output_payload(payload, action), state, time, order, None{}),
        payload
      )

def replaced_callback_source(
  equal: Bool,
  original: T.RetainedCallback,
  fact: Callbacks.Fact
) -> T.RetainedCallback:
  match equal original fact:
    case True{} T.RetainedCallback{order, issued, due, payload, _} Callbacks.Fact{
      target,
      at,
      +action,
      completion
    }:
      T.RetainedCallback{
        order,
        issued,
        due,
        output_payload(payload, action),
        Callbacks.Fact{target, at, action, completion}
      }
    case False{} original _: original

def replace_callback_sources(
  values: List<&2, T.RetainedCallback>,
  +fact: Callbacks.Fact,
  +target: Callbacks.Target
) -> List<&2, T.RetainedCallback>:
  match values:
    case Nil{}: []
    case +head <> tail:
      replaced_callback_source(Callbacks.target_equal(retained_target(head), target), head, fact) <> replace_callback_sources(
        tail,
        fact,
        target
      )

def output_receipt_state(state: T.State, receipt: Maybe<&2, Callbacks.Fact>) -> T.State:
  match state receipt:
    case T.State{
      core,
      items,
      next,
      count,
      seed,
      environment,
      latest,
      valid,
      prepared,
      jobs,
      T.HostFacts{requests, callbacks, partitions, runtime, generated, pending}
    } Some{Callbacks.Fact{+target, +at, +action, +completion}}:
      T.State{
        core,
        items,
        next,
        count,
        seed,
        environment,
        latest,
        valid,
        prepared,
        jobs,
        T.HostFacts{
          requests,
          replace_callback_sources(
            callbacks,
            Callbacks.Fact{target, at, action, completion},
            target
          ),
          partitions,
          runtime,
          generated,
          pending
        }
      }
    case state None{}: state

def output_changed(
  state: T.State,
  source: Maybe<&2, T.RetainedCallback>,
  changed: Engine.OutputIntervention
) -> Applied:
  match changed:
    case Engine.OutputIntervention{core, result, cancel, schedule, receipt}:
      Applied{
        output_schedule(
          schedule,
          cancel_orders(cancel, output_receipt_state(Run.replace_core(state, core), receipt)),
          scheduled_payload(source)
        ),
        True{},
        OutputReport{result}
      }

def output(
  +state: T.State,
  target: Callbacks.Target,
  outcome: Output.Outcome,
  +source: Maybe<&2, T.RetainedCallback>
) -> Applied:
  output_changed(
    state,
    source,
    Engine.output_intervene(Run.core(state), target, outcome, callback_fact(source))
  )

def configured_environment(credentials: Credentials.State, state: T.State) -> Applied:
  match credentials state:
    case Credentials.State{ready, generation, _} T.State{
      core,
      items,
      next,
      count,
      seed,
      T.Environment{
        jev,
        outcome,
        weights,
        prep,
        tree,
        limits,
        out,
        lease,
        current,
        _,
        _,
        readable,
        lifetime,
        profile
      },
      latest,
      valid,
      prepared,
      jobs,
      host
    }:
      Applied{
        Run.revalidate_environment(
          T.State{
            core,
            items,
            next,
            count,
            seed,
            T.Environment{
              jev,
              outcome,
              weights,
              prep,
              tree,
              limits,
              out,
              lease,
              current,
              ready,
              generation,
              readable,
              lifetime,
              profile
            },
            latest,
            valid,
            prepared,
            jobs,
            host
          }
        ),
        True{},
        CredentialsReport{}
      }

def credentials(+state: T.State, ready: Bool, rotate: Bool) -> Applied:
  +changed = Run.replace_core(state, Engine.credential_action(Run.core(state), ready, rotate))
  configured_environment(Engine.credentials(Run.core(changed)), changed)

def tree_identity(runtime: T.RuntimeProfile, identity: Nat) -> T.RuntimeProfile:
  match runtime:
    case T.RuntimeProfile{finish, next, takes, permit, expiry, quiet, reuse, _, limits_label}:
      T.RuntimeProfile{finish, next, takes, permit, expiry, quiet, reuse, identity, limits_label}

def limits_identity(runtime: T.RuntimeProfile, identity: Nat) -> T.RuntimeProfile:
  match runtime:
    case T.RuntimeProfile{finish, next, takes, permit, expiry, quiet, reuse, tree_label, _}:
      T.RuntimeProfile{finish, next, takes, permit, expiry, quiet, reuse, tree_label, identity}

def file_trees(state: T.State, tree: Tree.Profile) -> Applied:
  match state:
    case T.State{
      core,
      items,
      next,
      count,
      seed,
      T.Environment{
        jev,
        outcome,
        weights,
        prep,
        _,
        limits,
        out,
        lease,
        current,
        ready,
        generation,
        readable,
        lifetime,
        profile
      },
      latest,
      valid,
      prepared,
      jobs,
      host
    }:
      Applied{
        T.State{
          core,
          items,
          next,
          count,
          seed,
          T.Environment{
            jev,
            outcome,
            weights,
            prep,
            tree,
            limits,
            out,
            lease,
            current,
            ready,
            generation,
            readable,
            lifetime,
            profile
          },
          latest,
          valid,
          prepared,
          jobs,
          host
        },
        True{},
        Ordinary{}
      }

def graph_limits(state: T.State, limits: Graph.Limits) -> Applied:
  match state:
    case T.State{
      core,
      items,
      next,
      count,
      seed,
      T.Environment{
        jev,
        outcome,
        weights,
        prep,
        tree,
        _,
        out,
        lease,
        current,
        ready,
        generation,
        readable,
        lifetime,
        profile
      },
      latest,
      valid,
      prepared,
      jobs,
      host
    }:
      Applied{
        T.State{
          core,
          items,
          next,
          count,
          seed,
          T.Environment{
            jev,
            outcome,
            weights,
            prep,
            tree,
            limits,
            out,
            lease,
            current,
            ready,
            generation,
            readable,
            lifetime,
            profile
          },
          latest,
          valid,
          prepared,
          jobs,
          host
        },
        True{},
        Ordinary{}
      }

def jev_outcome(state: T.State, delay: Nat, outcome: Canonical.RequestOutcome) -> Applied:
  match state:
    case T.State{
      core,
      items,
      next,
      count,
      seed,
      T.Environment{
        _,
        _,
        weights,
        prep,
        tree,
        limits,
        out,
        lease,
        current,
        ready,
        generation,
        readable,
        lifetime,
        profile
      },
      latest,
      valid,
      prepared,
      jobs,
      host
    }:
      Applied{
        T.State{
          core,
          items,
          next,
          count,
          seed,
          T.Environment{
            delay,
            Some{outcome},
            weights,
            prep,
            tree,
            limits,
            out,
            lease,
            current,
            ready,
            generation,
            readable,
            lifetime,
            profile
          },
          latest,
          valid,
          prepared,
          jobs,
          host
        },
        True{},
        Ordinary{}
      }

def response_actions(
  actions: List<&2, Driver.Action>,
  +state: T.State,
  +target: Maybe<&2, CollectionScenario.Identity>,
  +pending: Maybe<&2, WriterScenario.Pending>,
  +writer: Bool
) -> T.State:
  match actions:
    case Nil{}: state
    case +action <> tail:
      +order = Run.next_order(state)
      +time = Nat.add(Run.clock(state), Run.action_delay(action))
      response_actions(
        tail,
        Run.callback_register(
          Run.enqueue(state, time, T.ResponseInput{action, target, pending, writer}),
          order,
          time,
          action,
          None{}
        ),
        target,
        pending,
        writer
      )

def response_changed(
  state: T.State,
  target: Maybe<&2, CollectionScenario.Identity>,
  changed: Engine.ResponseTransition
) -> Applied:
  match changed:
    case Engine.ResponseTransition{core, result, actions}:
      Applied{
        response_actions(actions, Run.replace_core(state, core), target, None{}, False{}),
        True{},
        ResponseReport{result}
      }

def response_attempt(+state: T.State, +target: CollectionScenario.Identity, block: Bool) -> Applied:
  match target:
    case CollectionScenario.Identity{+id, +p, +l, +r}:
      response_changed(
        state,
        Some{target},
        Engine.collection_response_attempt(Run.core(state), id, p, l, r, Run.clock(state), block)
      )

def response_close(+state: T.State, target: CollectionScenario.Identity) -> Applied:
  match target:
    case CollectionScenario.Identity{id, p, l, r}: response_changed(
      state,
      None{},
      Engine.collection_response_close(Run.core(state), id, p, l, r)
    )

def writer_claimed(state: T.State, changed: Engine.WriterPrepared) -> Applied:
  match changed:
    case Engine.WriterPrepared{core, +pending, actions}:
      Applied{
        response_actions(actions, Run.replace_core(state, core), None{}, pending, True{}),
        True{},
        WriterClaimReport{pending}
      }

def writer_attempted(state: T.State, changed: Engine.WriterAttempt) -> Applied:
  match changed:
    case Engine.WriterAttempt{Engine.ResponseTransition{core, result, actions}, +target}:
      Applied{
        response_actions(actions, Run.replace_core(state, core), target, None{}, True{}),
        True{},
        WriterAttemptReport{result, target}
      }

def writer_events(events: List<&2, Canonical.CanonicalEvent>, state: T.State) -> T.State:
  match events:
    case Nil{}: state
    case event <> tail: writer_events(
      tail,
      Run.schedule_action(state, Driver.immediate(event, False{}), None{})
    )

def writer_release_events(
  events: List<&2, Canonical.CanonicalEvent>,
  +state: T.State,
  +capture: Maybe<&2, WriterScenario.Capture>
) -> T.State:
  match events capture:
    case Nil{} _: state
    case +event <> tail Some{+capture}:
      writer_release_events(
        tail,
        Run.enqueue(
          state,
          Run.clock(state),
          T.WriterReleaseInput{
            Driver.immediate(event, False{}),
            WriterScenario.PhysicalRelease{capture, event}
          }
        ),
        Some{capture}
      )
    case _ None{}: state

def writer_released(
  state: T.State,
  +events: List<&2, Canonical.CanonicalEvent>,
  capture: Maybe<&2, WriterScenario.Capture>
) -> Applied:
  Applied{
    writer_release_events(events, state, capture),
    True{},
    WriterReleaseReport{Bool.not(List.is_empty(&2, Canonical.CanonicalEvent, events))}
  }

def writer_release(+state: T.State, +target: WriterScenario.Target, expire: Bool) -> Applied:
  match expire:
    case True{}: writer_released(
      state,
      Engine.writer_expire(Run.core(state), target, Run.clock(state)),
      Engine.writer_capture(Run.core(state), target)
    )
    case False{}: writer_released(
      state,
      Engine.writer_release(Run.core(state), target),
      Engine.writer_capture(Run.core(state), target)
    )

def sharing_partition(target: Freshness.Scope) -> Nat:
  match target:
    case Freshness.Scope{partition, _, _, _}: partition

def sharing_actions(events: List<&2, Canonical.CanonicalEvent>) -> List<&2, Driver.Action>:
  match events:
    case Nil{}: []
    case event <> tail: Driver.immediate(event, False{}) <> sharing_actions(tail)

def sharing_changed(state: T.State, changed: Engine.SharingDeparture, partition: Nat) -> Applied:
  match changed:
    case Engine.SharingDeparture{core, events, valid}:
      Applied{
        Run.emitter_actions(
          sharing_actions(events),
          Run.replace_core(state, core),
          partition,
          [None{}]
        ),
        valid,
        Ordinary{}
      }

def expiry(state: T.State, profile: Expiry.Profile, runtime: T.RuntimeProfile) -> Applied:
  match runtime:
    case T.RuntimeProfile{finish, next, takes, permit, _, quiet, reuse, tree_label, limits_label}:
      Applied{
        Run.replace_runtime(
          state,
          T.RuntimeProfile{
            finish,
            next,
            takes,
            permit,
            profile,
            quiet,
            reuse,
            tree_label,
            limits_label
          }
        ),
        True{},
        Ordinary{}
      }

def default_permit() -> T.PermitProfile:
  T.PermitProfile{0n, 30000n, Permit.Successful{}, 32n, 4096n}

def permit_current(value: Maybe<&2, T.PermitProfile>) -> T.PermitProfile:
  match value:
    case Some{profile}: profile
    case None{}: default_permit()

def permit_profile_value(
  value: T.PermitProfile,
  duration: Nat,
  lifetime: Nat,
  outcome: Permit.PostOutcome
) -> T.PermitProfile:
  match value:
    case T.PermitProfile{_, _, _, advicee, resident}: T.PermitProfile{
      duration,
      lifetime,
      outcome,
      advicee,
      resident
    }

def permit_profile(
  state: T.State,
  duration: Nat,
  lifetime: Nat,
  outcome: Permit.PostOutcome,
  runtime: T.RuntimeProfile
) -> Applied:
  match runtime:
    case T.RuntimeProfile{
      finish,
      next,
      takes,
      permit,
      expiry,
      quiet,
      reuse,
      tree_label,
      limits_label
    }:
      Applied{
        Run.replace_runtime(
          state,
          T.RuntimeProfile{
            finish,
            next,
            takes,
            Some{permit_profile_value(permit_current(permit), duration, lifetime, outcome)},
            expiry,
            quiet,
            reuse,
            tree_label,
            limits_label
          }
        ),
        True{},
        Ordinary{}
      }

def permit_limits_value(value: T.PermitProfile, advicee: Nat, resident: Nat) -> T.PermitProfile:
  match value:
    case T.PermitProfile{duration, lifetime, outcome, _, _}: T.PermitProfile{
      duration,
      lifetime,
      outcome,
      advicee,
      resident
    }

def permit_limits(
  state: T.State,
  advicee: Nat,
  resident: Nat,
  runtime: T.RuntimeProfile
) -> Applied:
  match runtime:
    case T.RuntimeProfile{
      finish,
      next,
      takes,
      permit,
      expiry,
      quiet,
      reuse,
      tree_label,
      limits_label
    }:
      Applied{
        Run.replace_runtime(
          state,
          T.RuntimeProfile{
            finish,
            next,
            takes,
            Some{permit_limits_value(permit_current(permit), advicee, resident)},
            expiry,
            quiet,
            reuse,
            tree_label,
            limits_label
          }
        ),
        True{},
        Ordinary{}
      }

def request_item(input: T.Input, target: Targets.Target) -> Bool:
  match input:
    case T.Event{Driver.Action{event, _, _, _, _}, _, _, _}: Engine.callback_matches(event, target)
    case _: False{}

def selected_order(selected: Bool, order: Nat, tail: List<&2, Nat>) -> List<&2, Nat>:
  match selected:
    case True{}: order <> tail
    case False{}: tail

def request_orders(items: List<&2, T.Item>, +target: Targets.Target) -> List<&2, Nat>:
  match items:
    case Nil{}: []
    case T.Item{order, input, _} <> tail: selected_order(
      request_item(input, target),
      order,
      request_orders(tail, target)
    )

def settled_event(event: Canonical.CanonicalEvent, target: Targets.Target) -> Bool:
  match event:
    case Canonical.JevRequestSettled{p, l, r, o, q, outcome, physical}: Engine.callback_matches(
      Canonical.JevRequestSettled{p, l, r, o, q, outcome, physical},
      target
    )
    case _: False{}

def settled_item(input: T.Input, target: Targets.Target) -> Bool:
  match input:
    case T.Event{Driver.Action{+event, _, _, _, _}, _, _, _}: settled_event(event, target)
    case _: False{}

def request_due_choose(
  selected: Bool,
  +state: T.State,
  order: Nat,
  tail: Maybe<&2, Nat>
) -> Maybe<&2, Nat>:
  match selected:
    case True{}: Run.scheduled_at(Run.scheduler_entries(Run.core(state)), order)
    case False{}: tail

def request_due(
  items: List<&2, T.Item>,
  +state: T.State,
  +target: Targets.Target
) -> Maybe<&2, Nat>:
  match items:
    case Nil{}: None{}
    case T.Item{order, input, _} <> tail: request_due_choose(
      settled_item(input, target),
      state,
      order,
      request_due(tail, state, target)
    )

def request_delay(due: Maybe<&2, Nat>, now: Nat) -> Nat:
  match due:
    case Some{time}: Nat.sub(time, now)
    case None{}: 0n

def request_facts(facts: List<&2, Jev.ScheduledFact>, state: T.State) -> T.State:
  match facts:
    case Nil{}: state
    case Jev.ScheduledFact{event, delay} <> tail: request_facts(
      tail,
      Run.schedule_action(state, Driver.Action{event, delay, None{}, False{}, None{}}, None{})
    )

def request_changed(+state: T.State, +orders: List<&2, Nat>, changed: Jev.Intervention) -> Applied:
  match changed:
    case Jev.Applied{facts}: Applied{
      request_facts(
        facts,
        cancel_orders(
          orders,
          Run.replace_core(state, Engine.callback_replaced(Run.core(state), orders))
        )
      ),
      True{},
      JevReport{Jev.Applied{[]}}
    }
    case value: Applied{state, True{}, JevReport{value}}

def request(+state: T.State, +target: Targets.Target, outcome: Canonical.RequestOutcome) -> Applied:
  request_changed(
    state,
    request_orders(Run.runtime_items(state), target),
    Engine.intervene_request(
      Run.core(state),
      target,
      outcome,
      request_delay(request_due(Run.runtime_items(state), state, target), Run.clock(state))
    )
  )

def notice_source_partition(scope: Notice.Scope) -> Nat:
  match scope:
    case Notice.Scope{partition, _, _, _, _, _, _}: partition

def notice_actions(
  events: List<&2, Canonical.CanonicalEvent>,
  +state: T.State,
  +scope: Notice.Scope,
  +diagnostic: Maybe<&2, String>
) -> T.State:
  match events:
    case Nil{}: state
    case event <> tail: notice_actions(
      tail,
      Run.enqueue(
        state,
        Run.clock(state),
        T.NoticeInput{
          Driver.immediate(event, False{}),
          scope,
          diagnostic,
          notice_source_partition(scope)
        }
      ),
      scope,
      diagnostic
    )

def notice_event(
  event: Maybe<&2, Canonical.CanonicalEvent>,
  state: T.State,
  scope: Notice.Scope,
  diagnostic: Maybe<&2, String>
) -> Applied:
  match event:
    case None{}: Applied{state, True{}, Ordinary{}}
    case Some{event}: Applied{notice_actions([event], state, scope, diagnostic), True{}, Ordinary{}}

def notice_owned(+state: T.State, +scope: Notice.Scope, lease: Bool) -> Applied:
  match scope lease:
    case Notice.Scope{p, g, key, _, _, _, _} True{}: notice_event(
      Engine.notice_lease(Run.core(state), p, g, key),
      state,
      scope,
      None{}
    )
    case Notice.Scope{p, g, key, _, _, _, _} False{}: notice_event(
      Engine.notice_acknowledge(Run.core(state), p, g, key),
      state,
      scope,
      None{}
    )

def notice_collect(
  +state: T.State,
  +scope: Notice.Scope,
  composed: Bool,
  bound: Bool,
  allowed: List<&2, Nat>
) -> Applied:
  match scope:
    case Notice.Scope{+p, +g, _, _, _, _, _}:
      Applied{
        Run.schedule_action(
          notice_actions(
            Engine.notice_collection_prune(Run.core(state), p, g, Run.clock(state)),
            state,
            scope,
            None{}
          ),
          Driver.immediate(Canonical.NoticeSelect{p, g, composed, bound, allowed}, False{}),
          None{}
        ),
        True{},
        Ordinary{}
      }

def live_or_history(
  live: Maybe<&2, T.RetainedCallback>,
  historical: Maybe<&2, T.RetainedCallback>
) -> Maybe<&2, T.RetainedCallback>:
  match live:
    case Some{live}: Some{live}
    case None{}: historical

def notice_runtime_scope(scope: Notice.Scope, runtime: T.RuntimeProfile) -> Notice.Scope:
  match scope runtime:
    case Notice.Scope{p, g, key, maximum, bytes, _, count}
        T.RuntimeProfile{_, _, _, _, Expiry.Profile{_, _, cooldown}, _, _, _, _}:
      Notice.Scope{p, g, key, maximum, bytes, cooldown, count}

def notice_failure_control(
  +state: T.State,
  +scope: Notice.Scope,
  key: Nat,
  sequence: Nat,
  diagnostic: Maybe<&2, String>
) -> Applied:
  +captured = notice_runtime_scope(scope, Run.runtime(state))
  notice_event(
    Engine.notice_failure(Run.core(state), captured, Run.clock(state), key, sequence),
    state,
    captured,
    diagnostic
  )

def apply(+state: T.State, control: T.Control) -> Applied:
  match control:
    case T.NoticeFailureControl{scope, key, sequence, diagnostic}: notice_failure_control(
      state,
      scope,
      key,
      sequence,
      diagnostic
    )
    case T.NoticeOwnedControl{scope, lease}: notice_owned(
      state,
      notice_runtime_scope(scope, Run.runtime(state)),
      lease
    )
    case T.NoticeCollectControl{scope, composed, bound, allowed}: notice_collect(
      state,
      notice_runtime_scope(scope, Run.runtime(state)),
      composed,
      bound,
      allowed
    )
    case T.JevRequestControl{target, outcome}: request(state, target, outcome)
    case T.ExpiryProfileControl{profile}: expiry(state, profile, Run.runtime(state))
    case T.PermitProfileControl{duration, lifetime, outcome}: permit_profile(
      state,
      duration,
      lifetime,
      outcome,
      Run.runtime(state)
    )
    case T.PermitLimitsControl{advicee, resident}: permit_limits(
      state,
      advicee,
      resident,
      Run.runtime(state)
    )
    case T.ResponseOpenControl{response}: response_changed(
      state,
      None{},
      Engine.collection_response_open(Run.core(state), response)
    )
    case T.ResponseAttemptControl{target, block}: response_attempt(state, target, block)
    case T.ResponseCloseControl{target}: response_close(state, target)
    case T.WriterClaimControl{capture}: writer_claimed(
      state,
      Engine.writer_prepare(Run.core(state), capture)
    )
    case T.WriterAttemptControl{target, block}: writer_attempted(
      state,
      Engine.writer_attempt(Run.core(state), target, Run.clock(state), block)
    )
    case T.WriterReleaseControl{target, expire}: writer_release(state, target, expire)
    case T.SharingLeaveControl{+target}: sharing_changed(
      state,
      Engine.sharing_leave(Run.core(state), target),
      sharing_partition(target)
    )
    case T.SharingLeaveAllControl{+p, l}: sharing_changed(
      state,
      Engine.sharing_leave_all(Run.core(state), p, l),
      p
    )
    case T.CallbackControl{+target, action, historical}: callback(
      state,
      target,
      action,
      live_or_history(callback_source(callback_sources(state), target), historical)
    )
    case T.OutputAttemptControl{+target, outcome, historical}: output(
      state,
      target,
      outcome,
      live_or_history(callback_source(callback_sources(state), target), historical)
    )
    case T.CredentialControl{ready, rotate}: credentials(state, ready, rotate)
    case T.FileTreesControl{profile, identity}: file_trees(
      Run.replace_runtime(state, tree_identity(Run.runtime(state), identity)),
      profile
    )
    case T.GraphLimitsControl{limits, identity}: graph_limits(
      Run.replace_runtime(state, limits_identity(Run.runtime(state), identity)),
      limits
    )
    case T.JevOutcomeControl{delay, outcome}: jev_outcome(state, delay, outcome)
    case control: ordinary(Run.control(state, control))

def controlled(result: Applied) -> T.Controlled:
  match result:
    case Applied{state, applied, _}: T.Controlled{state, applied}

def control(state: T.State, control: T.Control) -> T.Controlled:
  controlled(apply(state, control))
