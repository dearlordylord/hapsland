import Base
import ./CacheRuntime.bend as CacheRuntime
import ./CacheScenario.bend as CacheScenario
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/ReuseState.bend as Reuse
import ../agent-flow-bend/Reuse.bend as ReusePolicy
import ../agent-flow-bend/Canonical.bend as C
import ../agent-flow-bend/Dispatch.bend as Dispatch
import ./FreshnessScenario.bend as Freshness
import ./SharingScenario.bend as Sharing

# Original preparation facts stay ordered here until actual route feedback.
# A joined unit is excluded from NEW review reservation offers, not cleared
# after a second charge. Canonical remains the route/admission authority.
type Disposition is Data:
  Awaiting{}
  Owned{}
  Joined{}
  CachedFinding{}
type PreparedUnit is Data:
  PreparedUnit{position: Nat, bytes: Nat, key: Sharing.SharingKey, evaluation: Nat, disposition: Disposition}
type Preparation is Data:
  Preparation{scope: Freshness.Scope, member: Sharing.Member, units: List<&2,PreparedUnit>}
type Binding is Data:
  Binding{scope: Freshness.Scope, evaluation: Nat, bytes: Nat, cached: Bool}
type SharingResult is Data:
  SharingResult{evaluation: Nat, outcome: C.RequestOutcome, original: Freshness.Scope, bytes: Nat}
type State is Data:
  State{sharing: Sharing.State, preparations: List<&2,Preparation>, bindings: List<&2,Binding>, results: List<&2,SharingResult>}
type Route is Data:
  Route{preparation: Freshness.Scope, member: Sharing.Member, position: Nat, evaluation: Nat}
type Captured is Data:
  Captured{state: State, routes: List<&2,Route>, valid: Bool}
type Completion is Data:
  Completion{event: C.CanonicalEvent, ready: Bool}

def initial() -> State:
  State{Sharing.initial(),[],[],[]}

def sharing(state: State) -> Sharing.State:
  match state:
    case State{sharing,_,_,_}: sharing

def with_sharing(state: State, sharing: Sharing.State) -> State:
  match state:
    case State{_,preparations,bindings,results}: State{sharing,preparations,bindings,results}

def member(binding: Maybe<&2,Freshness.Binding>) -> Maybe<&2,Sharing.Member>:
  match binding:
    case None{}: None{}
    case Some{Freshness.Binding{scope,source,+generation}}:
      Bool.pick(Maybe<&2,Sharing.Member>,Nat.is_gt(generation,0n),Some{Sharing.Member{scope,source,generation}},None{})

def find_preparation(items: List<&2,Preparation>, +scope: Freshness.Scope) -> Maybe<&2,Preparation>:
  match items:
    case Nil{}: None{}
    case +head <> tail:
      match head:
        case Preparation{owner,_,_}:
          Bool.pick(Maybe<&2,Preparation>,Freshness.same(owner,scope),Some{head},find_preparation(tail,scope))

def kept_preparation(remove: Bool, value: Preparation, tail: List<&2,Preparation>) -> List<&2,Preparation>:
  match remove:
    case True{}: tail
    case False{}: value <> tail

def without_preparation(items: List<&2,Preparation>, +scope: Freshness.Scope) -> List<&2,Preparation>:
  match items:
    case Nil{}: []
    case +head <> tail:
      match head:
        case Preparation{owner,_,_}: kept_preparation(Freshness.same(owner,scope),head,without_preparation(tail,scope))

def prepared(state: State, +scope: Freshness.Scope, member: Sharing.Member, units: List<&2,PreparedUnit>) -> State:
  match state:
    case State{sharing,preparations,bindings,results}:
      State{sharing,Preparation{scope,member,units} <> without_preparation(preparations,scope),bindings,results}

def append_found(state: State, scope: Freshness.Scope, member: Sharing.Member, unit: PreparedUnit, found: Maybe<&2,Preparation>) -> State:
  match found:
    case None{}: prepared(state,scope,member,[unit])
    case Some{Preparation{_,_,units}}: prepared(state,scope,member,List.append(&2,PreparedUnit,units,[unit]))

def append_unit(+state: State, +scope: Freshness.Scope, member: Sharing.Member, unit: PreparedUnit) -> State:
  match state:
    case State{_,preparations,_,_}: append_found(state,scope,member,unit,find_preparation(preparations,scope))

type CaptureStep is Data:
  CaptureStep{state: State, route: Maybe<&2,Route>, valid: Bool}

def captured_registration(state: State, +scope: Freshness.Scope, +member: Sharing.Member, +position: Nat, bytes: Nat, key: Sharing.SharingKey, registration: Sharing.Registration) -> CaptureStep:
  match registration:
    case Sharing.Registration{_,None{}}: CaptureStep{state,None{},False{}}
    case Sharing.Registration{sharing,Some{+evaluation}}:
      CaptureStep{append_unit(with_sharing(state,sharing),scope,member,PreparedUnit{position,bytes,key,evaluation,Awaiting{}}),Some{Route{scope,member,position,evaluation}},True{}}

def captured_step(+state: State, +scope: Freshness.Scope, +member: Sharing.Member, position: Nat, bytes: Nat, +key: Sharing.SharingKey, cache: CacheRuntime.State, canonical: C.State) -> CaptureStep:
  captured_registration(state,scope,member,position,bytes,key,Sharing.register_cached(sharing(state),key,member,CacheRuntime.lookup_key(cache,canonical,key)))

def step_state(step: CaptureStep) -> State:
  match step:
    case CaptureStep{state,_,_}: state

def captured_tail(step: CaptureStep, tail: Captured) -> Captured:
  match step tail:
    case CaptureStep{_,None{},valid} Captured{state,routes,accepted}: Captured{state,routes,valid && accepted}
    case CaptureStep{_,Some{route},valid} Captured{state,routes,accepted}: Captured{state,route <> routes,valid && accepted}

def capture_units(keys: List<&2,Sharing.SharingKey>, sizes: List<&2,Nat>, +scope: Freshness.Scope, +member: Sharing.Member, +position: Nat, state: State, +cache: CacheRuntime.State, +canonical: C.State) -> Captured:
  match keys sizes:
    case Nil{} Nil{}: Captured{state,[],True{}}
    case key <> tail size <> rest:
      +next = captured_step(state,scope,member,position,size,key,cache,canonical)
      captured_tail(next,capture_units(tail,rest,scope,member,(position + 1n : Nat),step_state(next),cache,canonical))
    case _ _: Captured{state,[],False{}}

def capture_found(state: State, scope: Freshness.Scope, keys: List<&2,Sharing.SharingKey>, sizes: List<&2,Nat>, found: Maybe<&2,Sharing.Member>, cache: CacheRuntime.State, canonical: C.State) -> Captured:
  match found:
    case None{}: Captured{state,[],False{}}
    case Some{member}: capture_units(keys,sizes,scope,member,1n,state,cache,canonical)

def capture(state: State, freshness: Freshness.State, scope: Freshness.Scope, parent: Freshness.Scope, keys: List<&2,Sharing.SharingKey>, sizes: List<&2,Nat>, cache: CacheRuntime.State, canonical: C.State) -> Captured:
  capture_found(state,scope,keys,sizes,member(Freshness.lookup(Freshness.bindings(freshness),parent)),cache,canonical)

def route_unit(units: List<&2,PreparedUnit>, +position: Nat, +evaluation: Nat) -> Bool:
  match units:
    case Nil{}: False{}
    case PreparedUnit{p,_,_,id,_} <> tail:
      (Nat.is_eq(p,position) && Nat.is_eq(id,evaluation)) || route_unit(tail,position,evaluation)

def route_found(route: Route, found: Maybe<&2,Preparation>) -> Bool:
  match route found:
    case Route{_,member,position,evaluation} Some{Preparation{_,original,units}}:
      Sharing.same_member(member,original) && route_unit(units,position,evaluation)
    case _ None{}: False{}

def route_valid(state: State, +route: Route) -> Bool:
  match state route:
    case State{_,preparations,_,_} Route{scope,_,_,_}:
      route_found(route,find_preparation(preparations,scope))

def route_event(canonical: C.State, freshness: Freshness.State, +state: State, +route: Route) -> List<&2,C.CanonicalEvent>:
  match route:
    case Route{_,_,_,evaluation}:
      Bool.pick(List<&2,C.CanonicalEvent>,route_valid(state,route),Sharing.route(canonical,freshness,sharing(state),evaluation),[])

def own(commands: List<&2,C.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case C.ReuseOwn{} <> _: True{}
    case _ <> tail: own(tail)

def disposition(+commands: List<&2,C.Command>) -> Disposition:
  Bool.pick(Disposition,own(commands),Owned{},Bool.pick(Disposition,Sharing.join_command(commands),Joined{},Awaiting{}))

def unit_route(units: List<&2,PreparedUnit>, +position: Nat, +evaluation: Nat, +next: Disposition) -> List<&2,PreparedUnit>:
  match units:
    case Nil{}: []
    case PreparedUnit{+p,bytes,key,+id,previous} <> tail:
      PreparedUnit{p,bytes,key,id,Bool.pick(Disposition,Nat.is_eq(p,position) && Nat.is_eq(id,evaluation),next,previous)} <> unit_route(tail,position,evaluation,next)

def routed_found(+state: State, route: Route, +commands: List<&2,C.Command>, found: Maybe<&2,Preparation>) -> State:
  match route found:
    case Route{scope,+member,+position,+evaluation} Some{Preparation{_,+original,+units}}:
      Bool.pick(State,Sharing.same_member(member,original) && route_unit(units,position,evaluation),
        prepared(with_sharing(state,Sharing.routed(sharing(state),evaluation,member,commands)),scope,original,unit_route(units,position,evaluation,disposition(commands))),state)
    case _ _: state

def routed(+state: State, +route: Route, commands: List<&2,C.Command>) -> State:
  match state route:
    case State{_,preparations,_,_} Route{scope,_,_,_}: routed_found(state,route,commands,find_preparation(preparations,scope))

def ready(units: List<&2,PreparedUnit>) -> Bool:
  match units:
    case Nil{}: True{}
    case PreparedUnit{_,_,_,_,Awaiting{}} <> _: False{}
    case _ <> tail: ready(tail)

def offered(units: List<&2,PreparedUnit>) -> List<&2,Nat>:
  match units:
    case Nil{}: []
    case PreparedUnit{_,bytes,_,_,Owned{}} <> tail: bytes <> offered(tail)
    case PreparedUnit{_,bytes,_,_,CachedFinding{}} <> tail: bytes <> offered(tail)
    case _ <> tail: offered(tail)

def completion_found(event: C.CanonicalEvent, found: Maybe<&2,Preparation>) -> Completion:
  match event found:
    case C.PreparationCompleted{p,l,r,o,_} Some{Preparation{_,_,+units}}:
      Completion{C.PreparationCompleted{p,l,r,o,offered(units)},ready(units)}
    case _ _: Completion{event,True{}}

def completion(state: State, +event: C.CanonicalEvent) -> Completion:
  match state event:
    case State{_,preparations,_,_} C.PreparationCompleted{p,l,r,o,_}:
      completion_found(event,find_preparation(preparations,Freshness.Scope{p,l,r,o}))
    case _ _: Completion{event,True{}}

def own_at(units: List<&2,PreparedUnit>, +index: Nat) -> Maybe<&2,PreparedUnit>:
  match units:
    case Nil{}: None{}
    case +head <> tail:
      match head:
        case PreparedUnit{_,_,_,_,Owned{}}:
          Bool.pick(Maybe<&2,PreparedUnit>,Nat.is_eq(index,1n),Some{head},own_at(tail,(index - 1n : Nat)))
        case PreparedUnit{_,_,_,_,CachedFinding{}}:
          Bool.pick(Maybe<&2,PreparedUnit>,Nat.is_eq(index,1n),Some{head},own_at(tail,(index - 1n : Nat)))
        case _: own_at(tail,index)

def is_cached(disposition: Disposition) -> Bool:
  match disposition:
    case CachedFinding{}: True{}
    case _: False{}

def bound_unit(+state: State, scope: Freshness.Scope, +bytes: Nat, unit: Maybe<&2,PreparedUnit>) -> State:
  match state unit:
    case State{sharing,preparations,bindings,results} Some{PreparedUnit{_,expected,_,evaluation,disposition}}:
      Bool.pick(State,Nat.is_eq(bytes,expected),State{sharing,preparations,Binding{scope,evaluation,bytes,is_cached(disposition)} <> bindings,results},state)
    case _ _: state

def unit_found(state: State, p: Nat, l: Nat, r: Nat, command: C.Command, found: Maybe<&2,Preparation>) -> State:
  match command found:
    case C.UnitAdmitted{operation,_,position,bytes,_} Some{Preparation{_,_,units}}:
      bound_unit(state,Freshness.Scope{p,l,r,operation},bytes,own_at(units,position))
    case _ _: state

def unit(+state: State, +event: C.CanonicalEvent, command: C.Command) -> State:
  match state event:
    case State{_,preparations,_,_} C.PreparationCompleted{+p,+l,+r,o,_}:
      unit_found(state,p,l,r,command,find_preparation(preparations,Freshness.Scope{p,l,r,o}))
    case _ _: state

def binding_found(bindings: List<&2,Binding>, +scope: Freshness.Scope) -> Maybe<&2,Binding>:
  match bindings:
    case Nil{}: None{}
    case +head <> tail:
      match head:
        case Binding{owner,_,_,_}:
          Bool.pick(Maybe<&2,Binding>,Freshness.same(owner,scope),Some{head},binding_found(tail,scope))

def lookup_binding(state: State, scope: Freshness.Scope) -> Maybe<&2,Binding>:
  match state:
    case State{_,_,bindings,_}: binding_found(bindings,scope)

def issued_found(+state: State, physical: Sharing.Physical, binding: Maybe<&2,Binding>) -> State:
  match binding:
    case None{}: state
    case Some{Binding{_,evaluation,_,_}}: with_sharing(state,Sharing.issued(sharing(state),evaluation,physical))

def issued(+state: State, command: C.Command) -> State:
  match command:
    case C.JevRequestIssued{+p,+l,+r,+o,+request}:
      issued_found(state,Sharing.Physical{p,l,r,o,request},lookup_binding(state,Freshness.Scope{p,l,r,o}))
    case _: state

def retained_finding(commands: List<&2,C.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case C.RetainFinding{} <> _: True{}
    case _ <> tail: retained_finding(tail)

def original_consumed(commands: List<&2,C.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case C.JevObservationIgnored{} <> _: True{}
    case C.JevRequestOutcomeRecorded{_} <> _: True{}
    case _ <> tail: original_consumed(tail)

def kept_result(remove: Bool, value: SharingResult, tail: List<&2,SharingResult>) -> List<&2,SharingResult>:
  match remove:
    case True{}: tail
    case False{}: value <> tail

def without_result(items: List<&2,SharingResult>, +evaluation: Nat) -> List<&2,SharingResult>:
  match items:
    case Nil{}: []
    case SharingResult{+id,outcome,original,bytes} <> tail:
      kept_result(Nat.is_eq(id,evaluation),SharingResult{id,outcome,original,bytes},without_result(tail,evaluation))

def result_record(state: State, +evaluation: Nat, outcome: C.RequestOutcome, original: Freshness.Scope, bytes: Nat) -> State:
  match state:
    case State{sharing,preparations,bindings,results}:
      State{sharing,preparations,bindings,SharingResult{evaluation,outcome,original,bytes} <> without_result(results,evaluation)}

def terminal_found(+state: State, +scope: Freshness.Scope, physical: Sharing.Physical, outcome: C.RequestOutcome, +commands: List<&2,C.Command>, binding: Maybe<&2,Binding>) -> State:
  match binding:
    case None{}: state
    case Some{Binding{_,+evaluation,bytes,_}}:
      Bool.pick(State,Sharing.callback_original(sharing(state),evaluation,physical) && original_consumed(commands),
        result_record(with_sharing(state,Sharing.terminal_feedback(Bool.pick(Sharing.State,retained_finding(commands),Sharing.retained(sharing(state),evaluation,scope),sharing(state)),evaluation,True{})),evaluation,outcome,scope,bytes),state)

def terminal(+state: State, event: C.CanonicalEvent, commands: List<&2,C.Command>) -> State:
  match event:
    case C.JevRequestSettled{+p,+l,+r,+o,+request,outcome,_}:
      terminal_found(state,Freshness.Scope{p,l,r,o},Sharing.Physical{p,l,r,o,request},outcome,commands,lookup_binding(state,Freshness.Scope{p,l,r,o}))
    case _: state

def commands_feedback(commands: List<&2,C.Command>, state: State, +event: C.CanonicalEvent) -> State:
  match commands:
    case Nil{}: state
    case +command <> tail: commands_feedback(tail,issued(unit(state,event,command),command),event)

def completed(state: State, event: C.CanonicalEvent) -> State:
  match state event:
    case State{sharing,preparations,bindings,results} C.PreparationCompleted{p,l,r,o,_}:
      State{sharing,without_preparation(preparations,Freshness.Scope{p,l,r,o}),bindings,results}
    case _ _: state

# Accepted commands are consumed before preparation captures are retired. The
# original full request tuple remains immutable, including Ignored completion.
def feedback(state: State, +event: C.CanonicalEvent, +commands: List<&2,C.Command>) -> State:
  completed(terminal(commands_feedback(commands,state,event),event,commands),event)

def result_found(results: List<&2,SharingResult>, +evaluation: Nat) -> Maybe<&2,C.RequestOutcome>:
  match results:
    case Nil{}: None{}
    case SharingResult{id,outcome,original,bytes} <> tail:
      Bool.pick(Maybe<&2,C.RequestOutcome>,Nat.is_eq(id,evaluation),Some{outcome},result_found(tail,evaluation))

def result(state: State, evaluation: Nat) -> Maybe<&2,C.RequestOutcome>:
  match state:
    case State{_,_,_,results}: result_found(results,evaluation)

# Retention follows actual live authorities; a completed membership list is
# never an archive. Narrow factual lists avoid transporting the entire engine
# through recursive cleanup.
type Authority is Data:
  Authority{work: List<&2,C.Work>, requests: List<&2,Dispatch.Request>, claims: List<&2,Reuse.Claim>, cache: List<&2,Reuse.Entry>}

def authority(canonical: C.State) -> Authority:
  match canonical:
    case C.State{_,_,work,_,_,_,Dispatch.State{_,_,_,_,requests},Collection.State{_,_,_,_,_,Reuse.State{claims,cache},_},_}:
      Authority{work,requests,claims,cache}

def scope_live(view: Authority, scope: Freshness.Scope) -> Bool:
  match view scope:
    case Authority{work,requests,_,_} Freshness.Scope{+p,+l,+r,+o}:
      Freshness.work_owned(C.find_work(p,l,r,o,work)) || Freshness.requests_owned(requests,Freshness.Scope{p,l,r,o})

def claim_found(found: Maybe<&2,Reuse.Claim>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def cache_found(found: Maybe<&2,Reuse.Entry>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def claim_live(view: Authority, +evaluation: Nat) -> Bool:
  match view:
    case Authority{_,_,claims,cache}: claim_found(Reuse.find_claim(evaluation,claims)) || cache_found(Reuse.find_entry(evaluation,cache))

def request_live(found: Maybe<&2,Dispatch.Request>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def physical_live(view: Authority, captured: Maybe<&2,Sharing.Physical>) -> Bool:
  match view captured:
    case Authority{_,requests,_,_} Some{Sharing.Physical{p,l,r,o,request}}:
      request_live(Dispatch.request_phase(requests,p,l,r,o,request))
    case _ None{}: False{}

def advice_live(view: Authority, captured: Maybe<&2,Freshness.Scope>) -> Bool:
  match view captured:
    case Authority{work,_,_,_} Some{scope}: Sharing.pending_advice(work,scope)
    case _ None{}: False{}

def units_reference(units: List<&2,PreparedUnit>, +evaluation: Nat) -> Bool:
  match units:
    case Nil{}: False{}
    case PreparedUnit{_,_,_,id,_} <> tail: Nat.is_eq(id,evaluation) || units_reference(tail,evaluation)

def preparation_reference(preparations: List<&2,Preparation>, +evaluation: Nat) -> Bool:
  match preparations:
    case Nil{}: False{}
    case Preparation{_,_,units} <> tail: units_reference(units,evaluation) || preparation_reference(tail,evaluation)

def binding_reference(bindings: List<&2,Binding>, +evaluation: Nat) -> Bool:
  match bindings:
    case Nil{}: False{}
    case Binding{_,id,_,_} <> tail: Nat.is_eq(id,evaluation) || binding_reference(tail,evaluation)

def evaluation_live(+view: Authority, preparations: List<&2,Preparation>, bindings: List<&2,Binding>, evaluation: Sharing.Evaluation) -> Bool:
  match evaluation:
    case Sharing.Evaluation{+id,_,_,physical,advice}:
      claim_live(view,id) || physical_live(view,physical) || advice_live(view,advice) || preparation_reference(preparations,id) || binding_reference(bindings,id)

def kept_binding(keep: Bool, binding: Binding, tail: List<&2,Binding>) -> List<&2,Binding>:
  match keep:
    case True{}: binding <> tail
    case False{}: tail

def retained_bindings(bindings: List<&2,Binding>, +view: Authority) -> List<&2,Binding>:
  match bindings:
    case Nil{}: []
    case Binding{+scope,+evaluation,+bytes,+cached} <> tail:
      kept_binding(scope_live(view,scope),Binding{scope,evaluation,bytes,cached},retained_bindings(tail,view))

def retained_preparations(preparations: List<&2,Preparation>, +view: Authority) -> List<&2,Preparation>:
  match preparations:
    case Nil{}: []
    case Preparation{+scope,+member,+units} <> tail:
      kept_preparation(Bool.not(scope_live(view,scope)),Preparation{scope,member,units},retained_preparations(tail,view))

def kept_evaluation(keep: Bool, evaluation: Sharing.Evaluation, tail: List<&2,Sharing.Evaluation>) -> List<&2,Sharing.Evaluation>:
  match keep:
    case True{}: evaluation <> tail
    case False{}: tail

def retained_evaluations(evaluations: List<&2,Sharing.Evaluation>, +view: Authority, +preparations: List<&2,Preparation>, +bindings: List<&2,Binding>) -> List<&2,Sharing.Evaluation>:
  match evaluations:
    case Nil{}: []
    case +head <> tail:
      kept_evaluation(evaluation_live(view,preparations,bindings,head),head,retained_evaluations(tail,view,preparations,bindings))

def kept_owned_result(keep: Bool, result: SharingResult, tail: List<&2,SharingResult>) -> List<&2,SharingResult>:
  match keep:
    case True{}: result <> tail
    case False{}: tail

def result_owned(found: Maybe<&2,Sharing.Evaluation>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def retained_results(results: List<&2,SharingResult>, +evaluations: List<&2,Sharing.Evaluation>) -> List<&2,SharingResult>:
  match results:
    case Nil{}: []
    case SharingResult{+id,+outcome,+original,+bytes} <> tail:
      kept_owned_result(result_owned(Sharing.find(evaluations,id)),SharingResult{id,outcome,original,bytes},retained_results(tail,evaluations))

def retained_state(sharing: Sharing.State, +preparations: List<&2,Preparation>, +bindings: List<&2,Binding>, results: List<&2,SharingResult>, view: Authority) -> State:
  match sharing:
    case Sharing.State{evaluations,next}:
      +retained = retained_evaluations(evaluations,view,preparations,bindings)
      State{Sharing.State{retained,next},preparations,bindings,retained_results(results,retained)}

def retain_view(state: State, +view: Authority) -> State:
  match state:
    case State{sharing,preparations,bindings,results}:
      retained_state(sharing,retained_preparations(preparations,view),retained_bindings(bindings,view),results,view)

def retain(state: State, canonical: C.State) -> State:
  retain_view(state,authority(canonical))

def member_scopes(members: List<&2,Sharing.Member>) -> List<&2,Freshness.Scope>:
  match members:
    case Nil{}: []
    case Sharing.Member{scope,_,_} <> tail: scope <> member_scopes(tail)

def references(evaluations: List<&2,Sharing.Evaluation>) -> List<&2,Freshness.Scope>:
  match evaluations:
    case Nil{}: []
    case Sharing.Evaluation{_,_,members,_,_} <> tail: List.append(&2,Freshness.Scope,member_scopes(members),references(tail))

def source_references(state: State) -> List<&2,Freshness.Scope>:
  match state:
    case State{Sharing.State{evaluations,_},_,_,_}: references(evaluations)

# One original admission can supply several units. Its revision membership is
# released once; per-evaluation logical claims are separate. Physical captures
# remain attached to their original issued tuple until genuine terminal facts.
type Departure is Data:
  Departure{state: State, events: List<&2,C.CanonicalEvent>, valid: Bool}
type Removed is Data:
  Removed{evaluations: List<&2,Sharing.Evaluation>, events: List<&2,C.CanonicalEvent>, member: Maybe<&2,Sharing.Member>}

def member_scope(items: List<&2,Sharing.Member>, +scope: Freshness.Scope) -> Maybe<&2,Sharing.Member>:
  match items:
    case Nil{}: None{}
    case +head <> tail:
      match head:
        case Sharing.Member{owner,_,_}:
          Bool.pick(Maybe<&2,Sharing.Member>,Freshness.same(owner,scope),Some{head},member_scope(tail,scope))

def kept_prepared_member(remove: Bool, head: Sharing.Member, tail: List<&2,Sharing.Member>) -> List<&2,Sharing.Member>:
  match remove:
    case True{}: tail
    case False{}: head <> tail

def departed_member(items: List<&2,Sharing.Member>, +scope: Freshness.Scope) -> List<&2,Sharing.Member>:
  match items:
    case Nil{}: []
    case +head <> tail:
      match head:
        case Sharing.Member{owner,_,_}:
          kept_prepared_member(Freshness.same(owner,scope),head,departed_member(tail,scope))

def selected_member(first: Maybe<&2,Sharing.Member>, tail: Maybe<&2,Sharing.Member>) -> Maybe<&2,Sharing.Member>:
  match first:
    case None{}: tail
    case Some{member}: Some{member}

def removed_evaluation(+id: Nat, key: Sharing.SharingKey, +members: List<&2,Sharing.Member>, physical: Maybe<&2,Sharing.Physical>, advice: Maybe<&2,Freshness.Scope>, found: Maybe<&2,Sharing.Member>, tail: Removed) -> Removed:
  match tail:
    case Removed{evaluations,events,last}:
      Removed{Sharing.Evaluation{id,key,members,physical,advice} <> evaluations,
        List.append(&2,C.CanonicalEvent,Sharing.release_claim(id,Sharing.present(members)),events),selected_member(found,last)}

def preserved_evaluation(head: Sharing.Evaluation, tail: Removed) -> Removed:
  match tail:
    case Removed{evaluations,events,member}: Removed{head <> evaluations,events,member}

def removed_found(+head: Sharing.Evaluation, +scope: Freshness.Scope, found: Maybe<&2,Sharing.Member>, tail: Removed) -> Removed:
  match head found:
    case _ None{}: preserved_evaluation(head,tail)
    case Sharing.Evaluation{id,key,members,physical,advice} Some{member}:
      removed_evaluation(id,key,departed_member(members,scope),physical,advice,Some{member},tail)

def removed_scopes(items: List<&2,Sharing.Evaluation>, +scope: Freshness.Scope) -> Removed:
  match items:
    case Nil{}: Removed{[],[],None{}}
    case +head <> tail:
      match head:
        case Sharing.Evaluation{_,_,members,_,_}:
          removed_found(head,scope,member_scope(members,scope),removed_scopes(tail,scope))

def departure_found(+state: State, removed: Removed) -> Departure:
  match state removed:
    case State{Sharing.State{_,next},preparations,bindings,results} Removed{evaluations,events,Some{member}}:
      Departure{State{Sharing.State{evaluations,next},preparations,bindings,results},Sharing.release_revision(member) <> events,True{}}
    case _ Removed{_,_,None{}}: Departure{state,[],False{}}

def depart(+state: State, scope: Freshness.Scope) -> Departure:
  match state:
    case State{Sharing.State{evaluations,_},_,_,_}:
      departure_found(state,removed_scopes(evaluations,scope))


# Attach only an actual Own result for the exact retained route. This is a
# source-free follow-up fact; Canonical remains claim/attachment authority.
def attached_route(route: Route, valid: Bool, commands: List<&2,C.Command>) -> List<&2,C.CanonicalEvent>:
  match route:
    case Route{_,_,_,evaluation}: Bool.pick(List<&2,C.CanonicalEvent>,valid && own(commands),[C.ReuseAttach{evaluation}],[])

def route_followups(+state: State, +route: Route, commands: List<&2,C.Command>) -> List<&2,C.CanonicalEvent>:
  attached_route(route,route_valid(state,route),commands)

# These route facts derive from the retained original plan, not from a host
# completion payload or a current partition lookup. Only unresolved routes
# need preprocessing at the single physical callback boundary.
def unit_routes(units: List<&2,PreparedUnit>, +scope: Freshness.Scope, +member: Sharing.Member) -> List<&2,Route>:
  match units:
    case Nil{}: []
    case PreparedUnit{position,_,_,evaluation,Awaiting{}} <> tail:
      Route{scope,member,position,evaluation} <> unit_routes(tail,scope,member)
    case _ <> tail: unit_routes(tail,scope,member)

def pending_found(found: Maybe<&2,Preparation>) -> List<&2,Route>:
  match found:
    case None{}: []
    case Some{Preparation{scope,member,units}}: unit_routes(units,scope,member)

def pending(state: State, event: C.CanonicalEvent) -> List<&2,Route>:
  match state event:
    case State{_,preparations,_,_} C.PreparationCompleted{p,l,r,o,_}:
      pending_found(find_preparation(preparations,Freshness.Scope{p,l,r,o}))
    case _ _: []

# Member disposition is decided by actual ReuseMemberCheck. The environmental
# result and original retained source scope are inputs, never copied outcomes
# turned into another Jev callback or another review-unit reservation.
def joined_outcome(outcome: C.RequestOutcome) -> ReusePolicy.JoinedState:
  match outcome:
    case C.RequestFinding{}: ReusePolicy.JoinedFinding{}
    case C.RequestClear{}: ReusePolicy.JoinedClear{}
    case _: ReusePolicy.JoinedUnavailable{}

def source_current(found: Maybe<&2,Bool>) -> Bool:
  match found:
    case Some{current}: current
    case None{}: False{}

# resident/joined-reviews.ts retains a captured revision even when its
# generation has become unavailable. Canonical decides the member disposition.
def member_stale(canonical: C.State, source: Freshness.Source, generation: Nat) -> Bool:
  match canonical source:
    case C.State{_,_,_,_,_,_,_,collection,_} Freshness.Source{subject,_}:
      Bool.not(Nat.is_eq(Collection.revision_generation(collection,subject),generation))

def member_facts(+canonical: C.State, +freshness: Freshness.State, members: List<&2,Sharing.Member>, +outcome: C.RequestOutcome, +advice: Maybe<&2,Freshness.Scope>) -> List<&2,C.CanonicalEvent>:
  match members:
    case Nil{}: []
    case Sharing.Member{+scope,+source,+generation} <> tail:
      C.ReuseMemberCheck{joined_outcome(outcome),member_stale(canonical,source,generation),Nat.is_gt(generation,0n),Sharing.live_advice(canonical,freshness,advice)} <>
        member_facts(canonical,freshness,tail,outcome,advice)

def fanout_found(canonical: C.State, freshness: Freshness.State, outcome: C.RequestOutcome, found: Maybe<&2,Sharing.Evaluation>) -> List<&2,C.CanonicalEvent>:
  match found:
    case None{}: []
    case Some{Sharing.Evaluation{_,_,members,_,advice}}: member_facts(canonical,freshness,members,outcome,advice)

def fanout_binding(canonical: C.State, freshness: Freshness.State, state: State, outcome: C.RequestOutcome, found: Maybe<&2,Binding>) -> List<&2,C.CanonicalEvent>:
  match found:
    case None{}: []
    case Some{Binding{_,evaluation,_,_}}: fanout_found(canonical,freshness,outcome,Sharing.lookup(sharing(state),evaluation))

def fanout(before: State, after: State, canonical: C.State, freshness: Freshness.State, event: C.CanonicalEvent, commands: List<&2,C.Command>) -> List<&2,C.CanonicalEvent>:
  match event:
    case C.JevRequestSettled{p,l,r,o,_,outcome,_}:
      Bool.pick(List<&2,C.CanonicalEvent>,original_consumed(commands),fanout_binding(canonical,freshness,after,outcome,lookup_binding(before,Freshness.Scope{p,l,r,o})),[])
    case _: []


# Only the authentic first terminal removes the captured physical tuple. A
# rejected duplicate/wrong tuple leaves it unchanged and gets no fanout.
def physical_consumed(before: Maybe<&2,Sharing.Evaluation>, after: Maybe<&2,Sharing.Evaluation>, +physical: Sharing.Physical) -> Bool:
  match before after:
    case Some{Sharing.Evaluation{_,_,_,captured,_}} Some{Sharing.Evaluation{_,_,_,remaining,_}}:
      Sharing.physical_equal(captured,physical) && Bool.not(Sharing.physical_equal(remaining,physical))
    case Some{Sharing.Evaluation{_,_,_,captured,_}} None{}: Sharing.physical_equal(captured,physical)
    case None{} _: False{}

def result_advice(found: Maybe<&2,Sharing.Evaluation>) -> Maybe<&2,Freshness.Scope>:
  match found:
    case Some{Sharing.Evaluation{_,_,_,_,advice}}: advice
    case None{}: None{}

def terminal_members(canonical: C.State, freshness: Freshness.State, before: Maybe<&2,Sharing.Evaluation>, after: Maybe<&2,Sharing.Evaluation>, outcome: C.RequestOutcome) -> List<&2,C.CanonicalEvent>:
  match before:
    case Some{Sharing.Evaluation{_,_,members,_,_}}: member_facts(canonical,freshness,members,outcome,result_advice(after))
    case None{}: []

def postprocess_binding(+before: State, +after: State, canonical: C.State, freshness: Freshness.State, +physical: Sharing.Physical, outcome: C.RequestOutcome, binding: Maybe<&2,Binding>) -> List<&2,C.CanonicalEvent>:
  match binding:
    case None{}: []
    case Some{Binding{_,+evaluation,_,_}}:
      Bool.pick(List<&2,C.CanonicalEvent>,physical_consumed(Sharing.lookup(sharing(before),evaluation),Sharing.lookup(sharing(after),evaluation),physical),
        terminal_members(canonical,freshness,Sharing.lookup(sharing(before),evaluation),Sharing.lookup(sharing(after),evaluation),outcome),[])

def postprocess(+before: State, after: State, canonical: C.State, freshness: Freshness.State, event: C.CanonicalEvent) -> List<&2,C.CanonicalEvent>:
  match event:
    case C.JevRequestSettled{+p,+l,+r,+o,+request,outcome,_}:
      postprocess_binding(before,after,canonical,freshness,Sharing.Physical{p,l,r,o,request},outcome,lookup_binding(before,Freshness.Scope{p,l,r,o}))
    case _: []

def empty_evaluation(found: Maybe<&2,Sharing.Evaluation>) -> Bool:
  match found:
    case Some{Sharing.Evaluation{_,_,Nil{},_,_}}: True{}
    case _: False{}

def canceled_work(found: Maybe<&2,C.Work>) -> List<&2,C.CanonicalEvent>:
  match found:
    case Some{C.Work{p,l,r,o,_,C.Reviewing{},_}}: [C.CancelReview{p,l,r,o}]
    case Some{C.Work{p,l,r,o,_,C.AtJev{},_}}: [C.CancelReview{p,l,r,o}]
    case Some{C.Work{p,l,r,o,_,C.PendingFinding{_},_}}: [C.RetireReview{p,l,r,o}]
    case _: []

def cancellation_scope(canonical: C.State, scope: Freshness.Scope) -> List<&2,C.CanonicalEvent>:
  match canonical scope:
    case C.State{_,_,work,_,_,_,_,_,_} Freshness.Scope{p,l,r,o}:
      canceled_work(C.find_work(p,l,r,o,work))

def canceled_binding(canonical: C.State, before: Sharing.State, state: Sharing.State, binding: Binding) -> List<&2,C.CanonicalEvent>:
  match binding:
    case Binding{scope,+evaluation,_,_}:
      Bool.pick(List<&2,C.CanonicalEvent>,Bool.not(empty_evaluation(Sharing.lookup(before,evaluation))) && empty_evaluation(Sharing.lookup(state,evaluation)),cancellation_scope(canonical,scope),[])

def cancellation_bindings(bindings: List<&2,Binding>, +canonical: C.State, +before: Sharing.State, +state: Sharing.State) -> List<&2,C.CanonicalEvent>:
  match bindings:
    case Nil{}: []
    case binding <> tail:
      List.append(&2,C.CanonicalEvent,canceled_binding(canonical,before,state,binding),cancellation_bindings(tail,canonical,before,state))

def departure_cancellation(+before: State, canonical: C.State, departure: Departure) -> Departure:
  match before departure:
    case State{original,_,bindings,_} Departure{+state,events,True{}}:
      Departure{state,List.append(&2,C.CanonicalEvent,events,cancellation_bindings(bindings,canonical,original,sharing(state))),True{}}
    case _ Departure{state,events,False{}}: Departure{state,events,False{}}

def depart_canonical(+state: State, canonical: C.State, scope: Freshness.Scope) -> Departure:
  departure_cancellation(state,canonical,depart(state,scope))


def kept_scoped_member(keep: Bool, scope: Freshness.Scope, tail: List<&2,Freshness.Scope>) -> List<&2,Freshness.Scope>:
  match keep:
    case True{}: scope <> tail
    case False{}: tail

def scoped_members(scopes: List<&2,Freshness.Scope>, +partition: Nat, +lifetime: Nat) -> List<&2,Freshness.Scope>:
  match scopes:
    case Nil{}: []
    case +scope <> tail:
      match scope:
        case Freshness.Scope{p,l,_,_}:
          kept_scoped_member(Nat.is_eq(p,partition) && Nat.is_eq(l,lifetime),scope,scoped_members(tail,partition,lifetime))

def departures_joined(events: List<&2,C.CanonicalEvent>, valid: Bool, tail: Departure) -> Departure:
  match tail:
    case Departure{state,rest,next}: Departure{state,List.append(&2,C.CanonicalEvent,events,rest),valid || next}

def departed_tail(departure: Departure, rest: State -> Departure) -> Departure:
  match departure:
    case Departure{state,events,valid}: departures_joined(events,valid,rest(state))

def depart_scopes(scopes: List<&2,Freshness.Scope>, +state: State, +canonical: C.State) -> Departure:
  match scopes:
    case Nil{}: Departure{state,[],False{}}
    case scope <> tail: departed_tail(depart_canonical(state,canonical,scope),next => depart_scopes(tail,next,canonical))

def depart_all(+state: State, canonical: C.State, partition: Nat, lifetime: Nat) -> Departure:
  depart_scopes(scoped_members(source_references(state),partition,lifetime),state,canonical)

# Only the original, accepted physical result can create a stored-result offer.
# Its complete scoped key was captured before preparation; no host outcome map
# or source reconstruction participates in this transfer.
def cache_result_found(results: List<&2,SharingResult>, +scope: Freshness.Scope) -> Maybe<&2,SharingResult>:
  match results:
    case Nil{}: None{}
    case SharingResult{+id,+outcome,+original,+bytes} <> tail:
      Bool.pick(Maybe<&2,SharingResult>,Freshness.same(scope,original),Some{SharingResult{id,outcome,original,bytes}},cache_result_found(tail,scope))

def cache_result_key(found: Maybe<&2,SharingResult>, evaluation: Maybe<&2,Sharing.Evaluation>) -> Maybe<&2,CacheScenario.Offer>:
  match found evaluation:
    case Some{SharingResult{id,outcome,original,bytes}} Some{Sharing.Evaluation{_,key,_,_,_}}:
      Some{CacheScenario.Offer{id,key,original,bytes,outcome}}
    case _ _: None{}

def cache_result_evaluation(+state: State, found: Maybe<&2,SharingResult>) -> Maybe<&2,CacheScenario.Offer>:
  match found:
    case Some{SharingResult{+id,+outcome,+original,+bytes}}:
      cache_result_key(Some{SharingResult{id,outcome,original,bytes}},Sharing.lookup(sharing(state),id))
    case None{}: None{}

def results(state: State) -> List<&2,SharingResult>:
  match state:
    case State{_,_,_,results}: results

def cache_offer(state: State, event: C.CanonicalEvent) -> Maybe<&2,CacheScenario.Offer>:
  match state event:
    case +state C.JevRequestSettled{p,l,r,o,_,_,_}:
      cache_result_evaluation(state,cache_result_found(results(state),Freshness.Scope{p,l,r,o}))
    case _ _: None{}


# Cache routes use only a payload accepted by actual ReuseCached and the exact
# stored entry. A clear has no new unit offer; a finding is a logical review.
def cached_disposition(outcome: C.RequestOutcome) -> Disposition:
  match outcome:
    case C.RequestFinding{}: CachedFinding{}
    case C.RequestClear{}: Joined{}
    case _: Awaiting{}

def cached_units(units: List<&2,PreparedUnit>, +position: Nat, +evaluation: Nat, +key: Sharing.SharingKey, +bytes: Nat, +outcome: C.RequestOutcome) -> List<&2,PreparedUnit>:
  match units:
    case Nil{}: []
    case PreparedUnit{+p,+size,+original,+id,previous} <> tail:
      PreparedUnit{p,size,original,id,Bool.pick(Disposition,Nat.is_eq(p,position) && Nat.is_eq(id,evaluation) && Sharing.same_key(original,key) && Nat.is_eq(size,bytes),cached_disposition(outcome),previous)} <>
        cached_units(tail,position,evaluation,key,bytes,outcome)

def cached_found(state: State, route: Route, payload: CacheScenario.Payload, found: Maybe<&2,Preparation>) -> State:
  match route payload found:
    case Route{scope,member,position,evaluation} CacheScenario.Payload{CacheScenario.Offer{_,key,_,bytes,outcome},_} Some{Preparation{_,original,units}}:
      prepared(state,scope,original,cached_units(units,position,evaluation,key,bytes,outcome))
    case _ _ _: state

def preparations_of(state: State) -> List<&2,Preparation>:
  match state:
    case State{_,preparations,_,_}: preparations

def cached_routed(+state: State, +route: Route, payload: Maybe<&2,CacheScenario.Payload>) -> State:
  match route payload:
    case Route{scope,_,_,_} Some{payload}: cached_found(state,route,payload,find_preparation(preparations_of(state),scope))
    case _ None{}: state

def cached_followups(canonical: C.State, freshness: Freshness.State, route: Route, payload: Maybe<&2,CacheScenario.Payload>) -> List<&2,C.CanonicalEvent>:
  match route payload:
    case Route{_,member,_,_} Some{CacheScenario.Payload{CacheScenario.Offer{_,_,_,_,C.RequestClear{}},_}}:
      member_facts(canonical,freshness,[member],C.RequestClear{},None{})
    case _ _: []

def bindings_of(state: State) -> List<&2,Binding>:
  match state:
    case State{_,_,bindings,_}: bindings

def cached_operation(bindings: List<&2,Binding>, +operation: Nat) -> Maybe<&2,Freshness.Scope>:
  match bindings:
    case Nil{}: None{}
    case Binding{Freshness.Scope{+p,+l,+r,+o},_,_,True{}} <> tail:
      Bool.pick(Maybe<&2,Freshness.Scope>,Nat.is_eq(o,operation),Some{Freshness.Scope{p,l,r,o}},cached_operation(tail,operation))
    case _ <> tail: cached_operation(tail,operation)
def cached_review(state: State, command: C.Command) -> Maybe<&2,Freshness.Scope>:
  match command:
    case C.UnitAdmitted{operation,_,_,_,_}: cached_operation(bindings_of(state),operation)
    case _: None{}

