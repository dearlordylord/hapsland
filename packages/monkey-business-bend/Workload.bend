import Base
import ./Session.bend as Session
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Admission.bend as Admission
import ./Driver.bend as Driver

type Profile is Data:
  Profile{settings: Session.Config, seed: U32, codes: List<&2, U32>, bytes: Nat, units: List<&2, Nat>, duration: Maybe<&2, Nat>}
type Advicee is Data:
  Advicee{partition: Nat, settings: Session.Config, stream: Session.State, duration: Maybe<&2, Nat>}
type Control is Data:
  Pace{interval: U32}
  Sizes{bytes: Nat, units: List<&2, Nat>}
  Burst{count: Nat}
  Suspend{suspended: Bool}
  Duration{duration: Nat}
type Emission is Data:
  Emission{at: Nat, partition: Nat, generation: Nat, kind: U32, task: Nat, revision: Nat, bytes: Nat, units: List<&2, Nat>, repair: Bool, recurring: Bool}
type Changed is Data:
  Changed{advicees: List<&2, Advicee>, events: List<&2, Emission>, valid: Bool}

def partition(advicee: Advicee) -> Nat:
  match advicee:
    case Advicee{partition, _, _, _}: partition

def initial(partition: Nat, profile: Profile) -> Advicee:
  match profile:
    case Profile{+settings, seed, codes, bytes, units, duration}:
      Advicee{partition, settings, Session.initial(settings, seed, codes, bytes, units), duration}

def kept(remove: Bool, head: Advicee, tail: List<&2, Advicee>) -> List<&2, Advicee>:
  match remove:
    case True{}: tail
    case False{}: head <> tail

def remove(advicees: List<&2, Advicee>, +target: Nat) -> List<&2, Advicee>:
  match advicees:
    case Nil{}: Nil{}
    case +head <> tail: kept(Nat.is_eq(partition(head), target), head, remove(tail, target))

def configure(advicees: List<&2, Advicee>, +target: Nat, profile: Profile) -> List<&2, Advicee>:
  initial(target, profile) <> remove(advicees, target)

def find(advicees: List<&2, Advicee>, +target: Nat) -> Maybe<&2, Advicee>:
  match advicees:
    case Nil{}: None{}
    case +head <> tail: Bool.pick(Maybe<&2, Advicee>, Nat.is_eq(partition(head), target), Some{head}, find(tail, target))

def dated(event: Session.Input, now: Nat, partition: Nat) -> Emission:
  match event:
    case Session.Emission{delay, kind, task, revision, generation, bytes, units, repair, recurring}:
      Emission{(now + U32.to_nat(delay) : Nat), partition, generation, kind, task, revision, bytes, units, repair, recurring}

def date(events: List<&2, Session.Input>, +now: Nat, +partition: Nat) -> List<&2, Emission>:
  match events:
    case Nil{}: Nil{}
    case head <> tail: dated(head, now, partition) <> date(tail, now, partition)

def valid_event(event: Session.Input, +now: Nat) -> Bool:
  match event:
    case Session.Emission{delay, _, _, _, _, _, _, _, _}:
      Nat.is_le(now, ((65536n * 4294967295n + 65535n : Nat) - U32.to_nat(delay) : Nat))

def valid_events(events: List<&2, Session.Input>, +now: Nat) -> Bool:
  match events:
    case Nil{}: True{}
    case head <> tail: valid_event(head, now) && valid_events(tail, now)

type Updated is Data:
  Updated{advicee: Advicee, events: List<&2, Session.Input>}

def update(partition: Nat, settings: Session.Config, duration: Maybe<&2, Nat>, transition: Session.Transition) -> Updated:
  match transition:
    case Session.Changed{stream, events}: Updated{Advicee{partition, settings, stream, duration}, events}

def next(advicee: Advicee) -> Updated:
  match advicee:
    case Advicee{partition, +settings, stream, duration}: update(partition, settings, duration, Session.next(settings, stream))

def finish(advicee: Advicee, continuation: Bool) -> Updated:
  match advicee:
    case Advicee{partition, +settings, stream, duration}: update(partition, settings, duration, Session.on_finish(settings, stream, continuation))

def advice(advicee: Advicee) -> Updated:
  match advicee:
    case Advicee{partition, +settings, stream, duration}: update(partition, settings, duration, Session.on_advice(settings, stream))

def paced(partition: Nat, settings: Session.Config, stream: Session.State, duration: Maybe<&2, Nat>, interval: U32) -> Updated:
  +config = Session.set_interval(settings, interval)
  update(partition, config, duration, Session.rewind(config, stream))

def control(advicee: Advicee, control: Control) -> Updated:
  match advicee control:
    case Advicee{partition, settings, stream, duration} Pace{interval}: paced(partition, settings, stream, duration, interval)
    case Advicee{partition, settings, stream, duration} Sizes{bytes, units}: Updated{Advicee{partition, settings, Session.sizes(stream, bytes, units), duration}, []}
    case Advicee{partition, settings, stream, duration} Burst{count}: update(partition, settings, duration, Session.burst(count, stream))
    case Advicee{partition, +settings, stream, duration} Suspend{suspended}: update(partition, settings, duration, Session.suspend(settings, stream, suspended))
    case Advicee{partition, settings, stream, _} Duration{duration}: Updated{Advicee{partition, settings, stream, Some{duration}}, []}

# Only recurring generated arrivals are fenced; bursts, repairs and issued IO survive.
def valid_found(found: Maybe<&2, Advicee>, generation: Nat) -> Bool:
  match found:
    case None{}: False{}
    case Some{Advicee{_, _, stream, _}}: Nat.is_eq(Session.state_generation(stream), generation)

def valid(advicees: List<&2, Advicee>, target: Nat, generation: Nat, recurring: Bool) -> Bool:
  Bool.not(recurring) || valid_found(find(advicees, target), generation)

def duration_found(found: Maybe<&2, Advicee>, fallback: Nat) -> Nat:
  match found:
    case Some{Advicee{_, _, _, Some{duration}}}: duration
    case _: fallback

def duration(advicees: List<&2, Advicee>, target: Nat, fallback: Nat) -> Nat:
  duration_found(find(advicees, target), fallback)

type Action is Data:
  Next{}
  Finished{continuation: Bool}
  Advice{}
  Controlled{control: Control}

def changed(valid: Bool, original: List<&2, Advicee>, +updated: Advicee, events: List<&2, Session.Input>, now: Nat) -> Changed:
  match valid:
    case False{}: Changed{original, [], False{}}
    case True{}: Changed{updated <> remove(original, partition(updated)), date(events, now, partition(updated)), True{}}

def completed(original: List<&2, Advicee>, +now: Nat, updated: Updated) -> Changed:
  match updated:
    case Updated{advicee, +events}: changed(valid_events(events, now), original, advicee, events, now)

def acted(advicee: Advicee, action: Action) -> Updated:
  match action:
    case Next{}: next(advicee)
    case Finished{continuation}: finish(advicee, continuation)
    case Advice{}: advice(advicee)
    case Controlled{value}: control(advicee, value)

def found_action(found: Maybe<&2, Advicee>, original: List<&2, Advicee>, now: Nat, action: Action) -> Changed:
  match found:
    case None{}: Changed{original, [], True{}}
    case Some{advicee}: completed(original, now, acted(advicee, action))

def run(+advicees: List<&2, Advicee>, target: Nat, now: Nat, action: Action) -> Changed:
  found_action(find(advicees, target), advicees, now, action)

type PreTiming is Data:
  PreTiming{started: Nat, deadline: Nat, post: Nat, duration: Nat, valid: Bool}

def pre_duration(provided: Maybe<&2, Nat>, advicees: List<&2, Advicee>, target: Nat, fallback: Nat) -> Nat:
  match provided:
    case Some{duration}: duration
    case None{}: duration(advicees, target, fallback)

def pre_captured(+started: Nat, +duration: Nat, +lifetime: Nat) -> PreTiming:
  +maximum = (65536n * 4294967295n + 65535n : Nat)
  PreTiming{started, (started + lifetime : Nat), (started + duration : Nat), duration,
    Nat.is_le(started, (maximum - lifetime : Nat)) && Nat.is_le(started, (maximum - duration : Nat))}

def pre_timing(advicees: List<&2, Advicee>, target: Nat, +now: Nat, provided: Maybe<&2, Nat>, fallback: Nat, lifetime: Nat) -> PreTiming:
  pre_captured(Bool.pick(Nat, Nat.is_eq(now, 0n), 1n, now), pre_duration(provided, advicees, target, fallback), lifetime)

type PermitFacts is Data:
  PermitFacts{partition: Nat, lifetime: Nat, tool: Nat, provided: Maybe<&2, Nat>, fallback: Nat, permit_lifetime: Nat, advicee_limit: Nat, resident_limit: Nat}
type PermitCapture is Data:
  PermitCapture{partition: Nat, lifetime: Nat, token: Nat, tool: Nat, deadline: Nat, duration: Nat, terminal: U32}

def pre_action(facts: PermitFacts, now: Nat, timing: PreTiming) -> Driver.Handled:
  match facts timing:
    case PermitFacts{+partition, +lifetime, tool, _, _, +permit_lifetime, advicee_limit, resident_limit} PreTiming{+started, deadline, _, _, True{}}:
      Driver.Handled{True{}, [Driver.Action{Canonical.IssuePermit{partition, lifetime, tool, started, deadline, started, 0n,
        Admission.ProspectiveFacts{True{}, permit_lifetime, started, started, advicee_limit, resident_limit}},
        (started - now : Nat), None{}, True{}, None{}}]}
    case _ _: Driver.Handled{False{}, []}

def issue(advicees: List<&2, Advicee>, +now: Nat, facts: PermitFacts) -> Driver.Handled:
  match facts:
    case PermitFacts{+partition, lifetime, tool, provided, +fallback, +permit_lifetime, advicee_limit, resident_limit}:
      pre_action(PermitFacts{partition, lifetime, tool, None{}, fallback, permit_lifetime, advicee_limit, resident_limit}, now,
        pre_timing(advicees, partition, now, provided, fallback, permit_lifetime))

def terminal_action(capture: PermitCapture, +now: Nat) -> Driver.Action:
  match capture:
    case PermitCapture{partition, lifetime, token, tool, _, +duration, 0}:
      Driver.Action{Canonical.ConsumePermit{partition, lifetime, token, tool, (now + duration : Nat)}, duration, None{}, True{}, None{}}
    case PermitCapture{partition, lifetime, token, _, _, duration, 1}:
      Driver.Action{Canonical.ReleasePermit{partition, lifetime, token}, duration, None{}, False{}, None{}}
    case PermitCapture{partition, lifetime, token, _, deadline, _, _}:
      Driver.Action{Canonical.ExpirePermit{partition, lifetime, token, True{}}, (deadline - now : Nat), None{}, False{}, None{}}

def post_actions(+capture: PermitCapture, +now: Nat) -> Driver.Handled:
  match capture:
    case PermitCapture{+partition, +lifetime, +token, +tool, +deadline, +duration, +terminal}:
      Driver.Handled{True{}, Bool.pick(List<&2, Driver.Action>, U32.is_ne(terminal, 2) && Nat.is_gt(duration, (deadline - now : Nat)),
        Driver.Action{Canonical.ExpirePermit{partition, lifetime, token, True{}}, (deadline - now : Nat), None{}, False{}, None{}} <>
          [terminal_action(PermitCapture{partition, lifetime, token, tool, deadline, duration, terminal}, now)],
        [terminal_action(PermitCapture{partition, lifetime, token, tool, deadline, duration, terminal}, now)])}
