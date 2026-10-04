import Base
import ./expiry-observed-wire.bend as Wire
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Advicees.bend as Advicees
import ../NoticeScenario.bend as Notice
import ../ExpiryScenario.bend as Expiry
import ../Workload.bend as Workload
import ../Session.bend as Session
import ../Driver.bend as Driver
import ../Callbacks.bend as Callbacks
import ../Scheduler.bend as Scheduler
import ./advicee-lifecycle-driver.bend as Edge
import ./sharing-observed-transport.bend as Transport
import ./sharing-observed-initial.bend as Initial
import ./sharing-original-inputs.bend as SharingInputs
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/Ledger.bend as Ledger

# Original caller facts. Tick/Release are queued at construction, not recreated
# at their viewing boundary. Controls never provide an expiry decision.
type Action is Data:
  Failure{partition: Nat, group: Nat, key: Nat, sequence: Nat, diagnostic: String}
  Collect{partition: Nat, group: Nat, composed: Bool, authority_bound: Bool, allowed: List<&2,Nat>}
  Lease{partition: Nat, group: Nat, key: Nat}
  Release{key: Nat}
  Profile{profile: Expiry.Profile}
  Tick{}
type Original is Data:
  Original{at: Nat, action: Action}
type Capsule is Data:
  Capsule{order: Nat, scope: Maybe<&2,Notice.Scope>, diagnostic: Maybe<&2,String>}
type ControlEvents is Data:
  ControlEvents{events: List<&2,C.CanonicalEvent>, scope: Maybe<&2,Notice.Scope>, diagnostic: Maybe<&2,String>, partition: Nat}
type Facts is Data:
  Facts{capsules: List<&2,Capsule>, scope: Maybe<&2,Notice.Scope>, diagnostic: Maybe<&2,String>, profile: Expiry.Profile, provided: Maybe<&2,Nat>}
type Frame is Data:
  Observed{frame: Wire.Observation, receipt: Maybe<&2,Callbacks.Target>, scopes: Maybe<&2,List<&2,Maybe<&2,Nat>>>, diagnostic: Maybe<&2,String>, before_capsules: List<&2,Capsule>, after_capsules: List<&2,Capsule>}
  Control{input: Original, before: List<&2,Wire.Snapshot>, after: List<&2,Wire.Snapshot>, before_profile: Expiry.Profile, after_profile: Expiry.Profile, before_capsules: List<&2,Capsule>, after_capsules: List<&2,Capsule>}
  Boundary{endpoint: Nat, budget: Nat, consumed: Nat, runtime: List<&2,Wire.Snapshot>, capsules: List<&2,Capsule>}
  InvalidTransport{}
type Startup is Data:
  Startup{constructed: List<&2,Wire.Snapshot>, suspended: List<&2,Wire.Snapshot>, capsules: List<&2,Capsule>}
type Trace is Data:
  Trace{runtime: List<&2,Edge.Runtime>, capsules: List<&2,Capsule>, issued: Nat, consumed: Nat, frames: List<&2,Frame>, profile: Expiry.Profile, valid: Bool}
type PublicTrace is Data:
  PublicTrace{runtime: List<&2,Wire.Snapshot>, capsules: List<&2,Capsule>, issued: Nat, consumed: Nat, frames: List<&2,Frame>, profile: Expiry.Profile, valid: Bool}
type Envelope is Data:
  Envelope{original: List<&2,Original>, profile: Expiry.Profile, startup: Startup, trace: PublicTrace}

# Accepted maximum, computed without an out-of-range intermediate Nat.
def maximum() -> Nat:
  Advicees.maximum()

def scope(partition: Nat, group: Nat, key: Nat, profile: Expiry.Profile) -> Notice.Scope:
  match profile:
    case Expiry.Profile{_,_,cooldown}: Notice.Scope{partition,group,key,8n,128n,cooldown,maximum()}

def capsule_found(equal: Bool, head: Capsule, tail: Capsule) -> Capsule:
  match equal:
    case True{}: head
    case False{}: tail

def capsule(capsules: List<&2,Capsule>, +order: Nat) -> Capsule:
  match capsules:
    case Nil{}: Capsule{order,None{},None{}}
    case Capsule{+identity,+scope,+diagnostic} <> tail:
      capsule_found(Nat.is_eq(identity,order),Capsule{identity,scope,diagnostic},capsule(tail,order))

def without_order(capsules: List<&2,Capsule>, +order: Nat) -> List<&2,Capsule>:
  match capsules:
    case Nil{}: []
    case Capsule{+identity,+scope,+diagnostic} <> +tail:
      Bool.pick(List<&2,Capsule>,Nat.is_eq(identity,order),without_order(tail,order),
        Capsule{identity,scope,diagnostic} <> without_order(tail,order))

def source_job(state: Types.State, +partition: Nat) -> Edge.Job:
  Edge.NoJob{partition,Edge.life_value(Engine.lifecycle_entry(state,partition))}

def queue_events(events: List<&2,C.CanonicalEvent>, runtime: List<&2,Edge.Runtime>, capsules: List<&2,Capsule>,
    +at: Nat, +partition: Nat, +scope: Maybe<&2,Notice.Scope>, +diagnostic: Maybe<&2,String>) -> List<&2,Edge.Runtime> & List<&2,Capsule>:
  match events runtime:
    case Nil{} runtime: (runtime,capsules)
    case event <> tail Edge.Runtime{+state,Edge.Queue{items,+sequence,synced},jobs,delay} <> Nil{}:
      queue_events(tail,[Edge.Runtime{state,Edge.append(Edge.Queue{items,sequence,synced},at,
        Edge.Event{Driver.immediate(event,False{}),source_job(state,partition),None{},Edge.Environmental{None{}}}),jobs,delay}],
        List.append(&2,Capsule,capsules,[Capsule{sequence,scope,diagnostic}]),at,partition,scope,diagnostic)
    case _ runtime: (runtime,capsules)

# The chain only delegates existing command handling. It neither invents a
# command nor decides feedback/expiry. The precommand owner below runs once.
def command_factory(commands: List<&2,C.Command>, facts: Facts) -> Edge.CommandHook<Facts>:
  match commands:
    case Nil{}: Edge.HookEnd{facts}
    case _ <> tail:
      Edge.HookNext{facts,state => event => command => context => Edge.default_handler(state,event,command,context),
        current => actual => runtime => (runtime,command_factory(tail,current))}

def hook_facts(hook: Edge.CommandHook<Facts>) -> Facts:
  match hook:
    case Edge.HookEnd{facts}: facts
    case Edge.HookNext{facts,_,_}: facts
    case Edge.HookFault{facts}: facts

def queued_feedback(value: List<&2,Edge.Runtime> & List<&2,Capsule>, commands: List<&2,C.Command>,
    scope: Maybe<&2,Notice.Scope>, diagnostic: Maybe<&2,String>, profile: Expiry.Profile, provided: Maybe<&2,Nat>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match value:
    case (runtime,capsules): (runtime,command_factory(commands,Facts{capsules,scope,diagnostic,profile,provided}))

def feedback_transition(transition: Engine.NoticeTransition, runtime: List<&2,Edge.Runtime>,
    facts: Facts, +scope: Notice.Scope, diagnostic: Maybe<&2,String>, commands: List<&2,C.Command>, at: Nat, owner: Nat) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match transition runtime facts scope:
    case Engine.NoticeTransition{+state,events} Edge.Runtime{_,queue,jobs,delay} <> Nil{}
        Facts{capsules,_,_,profile,provided} Notice.Scope{+partition,+group,+key,+maximum_keys,+reservation_bytes,+cooldown,+maximum_count}:
      queued_feedback(queue_events(events,[Edge.Runtime{state,queue,jobs,delay}],capsules,at,owner,
        Some{Notice.Scope{partition,group,key,maximum_keys,reservation_bytes,cooldown,maximum_count}},None{}),commands,
        Some{Notice.Scope{partition,group,key,maximum_keys,reservation_bytes,cooldown,maximum_count}},diagnostic,profile,provided)
    case _ runtime facts _:
      (runtime,command_factory(commands,facts))

def feedback_facts(+facts: Facts, before: List<&2,Edge.Runtime>, +after: List<&2,Edge.Runtime>, +event: C.CanonicalEvent,
    +result: C.Step, +now: Nat) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match facts before after:
    case Facts{capsules,Some{+scope},+diagnostic,+profile,+provided}
        Edge.Runtime{+before,_,_,_} <> Nil{} Edge.Runtime{+state,_,_,_} <> Nil{}:
      feedback_transition(Engine.notice_after(before,state,scope,event,Edge.actual_commands(result),now,profile),
        after,Facts{capsules,Some{scope},diagnostic,profile,provided},scope,diagnostic,Edge.actual_commands(result),now,
        Edge.maybe_owner(Engine.scope_event(before,before,event,provided)))
    case facts _ after: (after,command_factory(Edge.actual_commands(result),facts))

def feedback(before: List<&2,Edge.Runtime>, after: List<&2,Edge.Runtime>, event: C.CanonicalEvent,
    result: C.Step, now: Nat, hook: Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  feedback_facts(hook_facts(hook),before,after,event,result,now)

def factory(commands: List<&2,C.Command>, facts: Facts) -> Edge.TransitionHook<Facts>:
  Edge.TransitionHook{command_factory(commands,facts),before => after => event => result => now => hook =>
    feedback(before,after,event,result,now,hook)}

def frame_scopes(frame: Edge.ObservedFrame) -> Maybe<&2,List<&2,Maybe<&2,Nat>>>:
  match frame:
    case Edge.CanonicalFrame{_,_,_,_,_,_,_,_,_,scopes,_,_}: Some{scopes}
    case Edge.CacheFrame{_,_,_,_,_,_,_,_,_,_,scopes,_,_}: Some{scopes}
    case Edge.GraphFrame{_,_,_,_,_,_,_,_,_,_,_,_,_,_}: Some{[]}
    case Edge.FinishFrame{_,_,_,_,_,_,_,_,_,_,_,_,_}: Some{[]}
    case Edge.UnexpectedInput{}: None{}

# Resolve the event's actual owner before passing a fallback to the shared
# command-scope owner, exactly as public inputPartition/commandScope do.
def command_scopes(commands: List<&2,C.Command>, +before: Types.State, +after: Types.State,
    +provided: Maybe<&2,Nat>) -> List<&2,Maybe<&2,Nat>>:
  match commands:
    case Nil{}: []
    case command <> tail: Engine.scope_command(before,after,command,provided) <> command_scopes(tail,before,after,provided)

def resolved_canonical(+before: List<&2,Types.State>, +after: List<&2,Types.State>,
    time: Nat, order: Nat, +event: C.CanonicalEvent, +result: List<&2,C.Step>,
    runtime_before: List<&2,Edge.Runtime>, runtime_after: List<&2,Edge.Runtime>,
    +provided: Maybe<&2,Nat>, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,Edge.PhysicalDelivery>) -> Edge.ObservedFrame:
  match before after result:
    case +before_state <> Nil{} after_state <> Nil{} step <> Nil{}:
      Edge.CanonicalFrame{before,after,time,order,event,result,runtime_before,runtime_after,provided,
        command_scopes(Edge.actual_commands(step),before_state,after_state,Engine.scope_event(before_state,before_state,event,provided)),receipt,physical}
    case _ _ _: Edge.UnexpectedInput{}

def resolved_frame(frame: Edge.ObservedFrame) -> Edge.ObservedFrame:
  match frame:
    case Edge.CanonicalFrame{before,after,time,order,event,result,runtime_before,runtime_after,provided,_,receipt,physical}:
      resolved_canonical(before,after,time,order,event,result,runtime_before,runtime_after,provided,receipt,physical)
    case frame: frame

def before_capsules(frame: Edge.ObservedFrame, capsules: List<&2,Capsule>) -> List<&2,Capsule>:
  match frame:
    case Edge.CanonicalFrame{_,_,_,order,_,_,_,_,_,_,_,_}: without_order(capsules,order)
    case _: capsules

def observed_frames(frame: Maybe<&2,Edge.ObservedFrame>, receipt: Maybe<&2,Callbacks.Target>, diagnostic: Maybe<&2,String>,
    before: List<&2,Capsule>, +after: List<&2,Capsule>, frames: List<&2,Frame>) -> List<&2,Frame>:
  match frame:
    case Some{frame}:
      +actual=resolved_frame(frame)
      List.append(&2,Frame,frames,[Observed{Wire.observation(actual),receipt,frame_scopes(actual),diagnostic,before_capsules(actual,before),after}])
    case None{}: frames

def counted(frame: Maybe<&2,Edge.ObservedFrame>, consumed: Nat) -> Nat:
  match frame:
    case Some{Edge.FinishFrame{_,_,_,_,_,_,_,_,_,_,_,_,_}}: consumed
    case Some{Edge.UnexpectedInput{}}: consumed
    case Some{_}: Nat.add(consumed,1n)
    case None{}: consumed

def invalid(trace: Trace) -> Trace:
  match trace:
    case Trace{runtime,capsules,issued,consumed,frames,profile,_}:
      Trace{runtime,capsules,issued,consumed,List.append(&2,Frame,frames,[InvalidTransport{}]),profile,False{}}

def completed(observed: Edge.Observed<Facts>, receipt: Maybe<&2,Callbacks.Target>, issued: Nat, previous: Trace) -> Trace:
  match observed previous:
    case Edge.Observed{runtime,Some{Edge.UnexpectedInput{}},_} Trace{_,capsules,_,consumed,frames,profile,_}:
      invalid(Trace{runtime,capsules,issued,consumed,frames,profile,False{}})
    case Edge.Observed{+runtime,+frame,Edge.HookEnd{Facts{+capsules,_,diagnostic,_,_}}}
        Trace{_,before_capsules,_,consumed,frames,profile,valid}:
      Trace{runtime,capsules,issued,counted(frame,consumed),observed_frames(frame,receipt,diagnostic,before_capsules,capsules,frames),profile,valid && Edge.runtime_valid(runtime)}
    case _ previous: invalid(previous)

def stepped(value: Transport.Stepped<Facts>, issued: Nat, previous: Trace) -> Trace:
  match value:
    case Transport.Stepped{observed,receipt}: completed(observed,receipt,issued,previous)

# Capture the original queued transport binding before Engine.step. It is
# separate from the Notice policy scope and never resolved from the endpoint.
def input_provided(input: Edge.Input) -> Maybe<&2,Nat>:
  match input:
    case Edge.Event{_,job,_,issuance}: Some{Edge.job_partition(job)}
    case _: None{}

def selected_capsule(value: Capsule, +runtime: List<&2,Edge.Runtime>, issued: Nat, endpoint: Nat,
    previous: Trace, capsules: List<&2,Capsule>, +order: Nat, profile: Expiry.Profile) -> Trace:
  match value:
    case Capsule{_,scope,diagnostic}:
      stepped(Transport.step(Facts,runtime,endpoint,Edge.default_environment(),
        commands => factory(commands,Facts{without_order(capsules,order),scope,diagnostic,profile,
          input_provided(Edge.lookup(Edge.runtime_items(runtime),order))})),issued,previous)

def selected_entries(entries: List<&2,Scheduler.Entry>, +runtime: List<&2,Edge.Runtime>, issued: Nat, endpoint: Nat, previous: Trace) -> Trace:
  match entries previous:
    case Scheduler.Entry{_,+order} <> _ Trace{_,+capsules,_,_,_,+profile,_}:
      selected_capsule(capsule(capsules,order),runtime,issued,endpoint,previous,capsules,order,profile)
    case _ previous: invalid(previous)

def selected(+runtime: List<&2,Edge.Runtime>, issued: Nat, endpoint: Nat, previous: Trace) -> Trace:
  selected_entries(Edge.runtime_entries(runtime),runtime,issued,endpoint,previous)

def captured(value: Transport.Captured, endpoint: Nat, previous: Trace) -> Trace:
  match value:
    case Transport.Captured{runtime,issued}: selected(Edge.runtime_sync(runtime),issued,endpoint,previous)

def step(+trace: Trace, endpoint: Nat) -> Trace:
  match trace:
    case Trace{runtime,_,issued,_,_,_,True{}}: captured(Transport.capture(runtime,issued),endpoint,trace)
    case trace: invalid(trace)

def pending_entries(entries: List<&2,Scheduler.Entry>, endpoint: Nat) -> Bool:
  match entries:
    case Scheduler.Entry{at,_} <> _: Nat.is_le(at,endpoint)
    case Nil{}: False{}

def pending(trace: Trace, endpoint: Nat) -> Bool:
  match trace:
    case Trace{runtime,_,_,_,_,_,True{}}:
      pending_entries(Edge.runtime_entries(Edge.runtime_sync(runtime)),endpoint)
    case _: False{}

def advanced_step(+trace: Trace, before: Nat, +budget: Nat, ih: Trace -> Nat -> Trace) -> Trace:
  match trace:
    case Trace{_,_,_,after,_,_,_}:
      ih(trace,Bool.pick(Nat,Nat.is_lt(before,after),Nat.sub(budget,1n),budget))

def advance_pending(ready: Bool, +trace: Trace, endpoint: Nat, budget: Nat, ih: Trace -> Nat -> Trace) -> Trace:
  match ready trace:
    case True{} Trace{_,_,_,before,_,_,_}: advanced_step(step(trace,endpoint),before,budget,ih)
    case False{} trace: trace

def advance(fuel: Nat, budget: Nat, +trace: Trace, +endpoint: Nat) -> Trace:
  match fuel budget:
    case 0n _: invalid(trace)
    case _ 0n: trace
    case 1n+rest budget:
      advance_pending(pending(trace,endpoint),trace,endpoint,budget,next => remaining => advance(rest,remaining,next,endpoint))

def boundary_completed(value: Trace, before: Nat, +endpoint: Nat, budget: Nat) -> Trace:
  match value:
    case Trace{+runtime,+capsules,+issued,+consumed,frames,+profile,+valid}:
      Trace{runtime,capsules,issued,consumed,List.append(&2,Frame,frames,
        [Boundary{endpoint,budget,Nat.sub(consumed,before),Wire.snapshots(runtime),capsules}]),profile,valid && Bool.not(pending(Trace{runtime,capsules,issued,consumed,[],profile,valid},endpoint))}

def boundary(+trace: Trace, +endpoint: Nat, +budget: Nat) -> Trace:
  match trace:
    case Trace{_,_,_,before,_,_,_}:
      boundary_completed(advance(10000n,budget,trace,endpoint),before,endpoint,budget)

# The public control owner generates these events. Scoped followups inherit the
# same capsule; NoticeSelect itself and original raw inputs remain unscoped.
def control_event(value: Maybe<&2,C.CanonicalEvent>, scope: Notice.Scope, diagnostic: Maybe<&2,String>, partition: Nat) -> ControlEvents:
  match value:
    case Some{event}: ControlEvents{[event],Some{scope},diagnostic,partition}
    case None{}: ControlEvents{[],Some{scope},diagnostic,partition}

def control_events(input: Original, state: Types.State, +profile: Expiry.Profile) -> ControlEvents:
  match input:
    case Original{at,Failure{+partition,+group,+key,sequence,diagnostic}}:
      control_event(Engine.notice_failure(state,scope(partition,group,key,profile),at,key,sequence),scope(partition,group,key,profile),Some{diagnostic},partition)
    case Original{_,Lease{+partition,+group,+key}}:
      control_event(Engine.notice_lease(state,partition,group,key),scope(partition,group,key,profile),None{},partition)
    case Original{at,Collect{+partition,+group,_,_,_}}:
      ControlEvents{Engine.notice_collection_prune(state,partition,group,at),Some{scope(partition,group,900000n,profile)},None{},partition}
    case _: ControlEvents{[],None{},None{},1n}

def selection_input(input: Original, at: Nat, runtime: List<&2,Edge.Runtime>, capsules: List<&2,Capsule>) -> List<&2,Edge.Runtime> & List<&2,Capsule>:
  match input:
    case Original{_,Collect{+partition,group,composed,bound,allowed}}:
      queue_events([C.NoticeSelect{partition,group,composed,bound,allowed}],runtime,capsules,at,partition,None{},None{})
    case _: (runtime,capsules)

def selection(input: Original, at: Nat, value: List<&2,Edge.Runtime> & List<&2,Capsule>) -> List<&2,Edge.Runtime> & List<&2,Capsule>:
  match value:
    case (runtime,capsules): selection_input(input,at,runtime,capsules)

def controlled_input(+runtime: List<&2,Edge.Runtime>, +capsules: List<&2,Capsule>, before: List<&2,Edge.Runtime>,
    previous: Trace, +input: Original) -> Trace:
  match previous input:
    case Trace{_,before_capsules,issued,consumed,frames,+profile,valid} Original{_,Profile{+next}}:
      Trace{runtime,capsules,issued,consumed,List.append(&2,Frame,frames,[Control{input,Wire.snapshots(before),Wire.snapshots(runtime),profile,next,before_capsules,capsules}]),next,valid}
    case Trace{_,before_capsules,issued,consumed,frames,+profile,valid} input:
      Trace{runtime,capsules,issued,consumed,List.append(&2,Frame,frames,[Control{input,Wire.snapshots(before),Wire.snapshots(runtime),profile,profile,before_capsules,capsules}]),profile,valid}

def controlled(value: List<&2,Edge.Runtime> & List<&2,Capsule>, before: List<&2,Edge.Runtime>, previous: Trace, input: Original) -> Trace:
  match value:
    case (runtime,capsules): controlled_input(Edge.runtime_sync(runtime),capsules,before,previous,input)

def control_queued(+input: Original, +at: Nat, generated: ControlEvents,
    +runtime: List<&2,Edge.Runtime>, capsules: List<&2,Capsule>, previous: Trace) -> Trace:
  match generated:
    case ControlEvents{events,scope,diagnostic,partition}:
      controlled(selection(input,at,queue_events(events,runtime,capsules,at,partition,scope,diagnostic)),runtime,previous,input)

def control_runtime(+runtime: List<&2,Edge.Runtime>, capsules: List<&2,Capsule>, profile: Expiry.Profile,
    +input: Original, at: Nat, trace: Trace) -> Trace:
  match runtime:
    case Edge.Runtime{state,_,_,_} <> Nil{}:
      control_queued(input,at,control_events(input,state,profile),runtime,capsules,trace)
    case _: invalid(trace)

def control(+trace: Trace, +input: Original) -> Trace:
  match trace input:
    case Trace{runtime,capsules,_,_,_,profile,True{}} Original{at,_}:
      control_runtime(runtime,capsules,profile,input,at,trace)
    case trace _: invalid(trace)

def action(trace: Trace, +input: Original) -> Trace:
  match input:
    case Original{at,Tick{}}: boundary(trace,at,100n)
    case Original{at,Release{_}}: boundary(trace,at,100n)
    case Original{_,Profile{_}}: control(trace,input)
    case Original{at,_}: boundary(control(trace,input),at,100n)

def originals(inputs: List<&2,Original>, trace: Trace) -> Trace:
  match inputs:
    case Nil{}: trace
    case input <> tail: originals(tail,action(trace,input))

def raw_input(input: Original) -> Maybe<&2,C.CanonicalEvent>:
  match input:
    case Original{_,Tick{}}: Some{C.CollectionExpiryCheck{0n,1n}}
    case Original{_,Release{key}}: Some{C.NoticeLease{key,False{}}}
    case _: None{}

def raw_queued(event: Maybe<&2,C.CanonicalEvent>, at: Nat, runtime: List<&2,Edge.Runtime>, capsules: List<&2,Capsule>) -> List<&2,Edge.Runtime> & List<&2,Capsule>:
  match event:
    case Some{event}: queue_events([event],runtime,capsules,at,1n,None{},None{})
    case None{}: (runtime,capsules)

def raw_originals_queued(value: List<&2,Edge.Runtime> & List<&2,Capsule>, ih: List<&2,Edge.Runtime> -> List<&2,Capsule> -> (List<&2,Edge.Runtime> & List<&2,Capsule>)) -> List<&2,Edge.Runtime> & List<&2,Capsule>:
  match value:
    case (runtime,capsules): ih(runtime,capsules)

def raw_original(input: Original, runtime: List<&2,Edge.Runtime>, capsules: List<&2,Capsule>,
    ih: List<&2,Edge.Runtime> -> List<&2,Capsule> -> (List<&2,Edge.Runtime> & List<&2,Capsule>)) -> List<&2,Edge.Runtime> & List<&2,Capsule>:
  match input:
    case Original{+at,action}:
      raw_originals_queued(raw_queued(raw_input(Original{at,action}),at,runtime,capsules),ih)

def raw_originals(inputs: List<&2,Original>, runtime: List<&2,Edge.Runtime>, capsules: List<&2,Capsule>) -> List<&2,Edge.Runtime> & List<&2,Capsule>:
  match inputs:
    case Nil{}: (runtime,capsules)
    case input <> tail:
      raw_original(input,runtime,capsules,next => scopes => raw_originals(tail,next,scopes))

# Next is evaluated by Initial.start before external inputs are enqueued.
# Suspend subsequently changes the genuine workload generation, leaving stale
# startup arrivals in the queue for the ordinary transport to consume.
def suspended_transition(changed: Engine.WorkloadTransition, queue: Edge.Queue, jobs: List<&2,Edge.Stored>, delay: Nat,
    ih: List<&2,Edge.Runtime> -> List<&2,Edge.Runtime>) -> List<&2,Edge.Runtime>:
  match changed:
    case Engine.WorkloadTransition{+state,events,True{}}:
      ih([Edge.Runtime{state,Edge.emissions(events,queue,state),jobs,delay}])
    case Engine.WorkloadTransition{_,_,False{}}: []

def suspend(partitions: List<&2,Nat>, runtime: List<&2,Edge.Runtime>) -> List<&2,Edge.Runtime>:
  match partitions runtime:
    case Nil{} runtime: runtime
    case partition <> tail Edge.Runtime{state,queue,jobs,delay} <> Nil{}:
      suspended_transition(Engine.workload_action(state,partition,Workload.Controlled{Workload.Suspend{True{}}}),
        queue,jobs,delay,next => suspend(tail,next))
    case _ _: []

def constructor_runtime(value: Initial.Initialized) -> List<&2,Edge.Runtime>:
  match value:
    case Initial.Initialized{Edge.Runtime{state,queue,jobs,_} <> Nil{},_,_,True{}}:
      [Edge.Runtime{state,queue,jobs,5n}]
    case _: []

def initial() -> List<&2,Edge.Runtime>:
  constructor_runtime(Initial.start(Initial.sessions([
    SharingInputs.SessionInput{"first",1n,Workload.Profile{Session.Settings{100,15,5,500,0,300},1,[102,105,114,115,116],100n,[100n],None{}}},
    SharingInputs.SessionInput{"second",2n,Workload.Profile{Session.Settings{100,15,5,500,0,300},2654435762,[115,101,99,111,110,100],100n,[100n],None{}}}],
    Engine.configure_credentials(Engine.configure_seed(Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),1n),True{},1n),[])))

# Public queuePush publishes each constructor enqueue into Engine.scheduler.
# Publish the same actual inputs before capturing construction/suspension; this
# is an owner transition, not a comparison-time normalization.
def public_trace(trace: Trace) -> PublicTrace:
  match trace:
    case Trace{runtime,capsules,issued,consumed,frames,profile,valid}:
      PublicTrace{Wire.snapshots(runtime),capsules,issued,consumed,frames,profile,valid}

def started_synced(+constructed: List<&2,Edge.Runtime>, +capsules: List<&2,Capsule>,
    +inputs: List<&2,Original>, +profile: Expiry.Profile) -> Envelope:
  +suspended=suspend([1n,2n],constructed)
  Envelope{inputs,profile,Startup{Wire.snapshots(constructed),Wire.snapshots(suspended),capsules},
    public_trace(originals(inputs,boundary(Trace{suspended,capsules,0n,0n,[],profile,Edge.runtime_valid(suspended)},0n,100n)))}

def started(value: List<&2,Edge.Runtime> & List<&2,Capsule>, inputs: List<&2,Original>, profile: Expiry.Profile) -> Envelope:
  match value:
    case (constructed,capsules): started_synced(Edge.runtime_sync(constructed),capsules,inputs,profile)

def run(+inputs: List<&2,Original>, +profile: Expiry.Profile) -> Envelope:
  started(raw_originals(inputs,initial(),[]),inputs,profile)
