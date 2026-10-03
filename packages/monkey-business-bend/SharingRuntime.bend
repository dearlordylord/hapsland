import Base
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/ReuseState.bend as Reuse
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
type PreparedUnit is Data:
  PreparedUnit{position: Nat, bytes: Nat, key: Sharing.SharingKey, evaluation: Nat, disposition: Disposition}
type Preparation is Data:
  Preparation{scope: Freshness.Scope, member: Sharing.Member, units: List<&2,PreparedUnit>}
type Binding is Data:
  Binding{scope: Freshness.Scope, evaluation: Nat, bytes: Nat}
type Result is Data:
  Result{evaluation: Nat, outcome: C.RequestOutcome, original: Freshness.Scope, bytes: Nat}
type State is Data:
  State{sharing: Sharing.State, preparations: List<&2,Preparation>, bindings: List<&2,Binding>, results: List<&2,Result>}
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
    case Some{Freshness.Binding{scope,source,generation}}:
      match Nat.is_gt(generation,0n):
        case True{}: Some{Sharing.Member{scope,source,generation}}
        case False{}: None{}

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

def captured_step(+state: State, +scope: Freshness.Scope, +member: Sharing.Member, position: Nat, bytes: Nat, +key: Sharing.SharingKey) -> CaptureStep:
  captured_registration(state,scope,member,position,bytes,key,Sharing.register(sharing(state),key,member))

def step_state(step: CaptureStep) -> State:
  match step:
    case CaptureStep{state,_,_}: state

def captured_tail(step: CaptureStep, tail: Captured) -> Captured:
  match step tail:
    case CaptureStep{_,None{},valid} Captured{state,routes,accepted}: Captured{state,routes,valid && accepted}
    case CaptureStep{_,Some{route},valid} Captured{state,routes,accepted}: Captured{state,route <> routes,valid && accepted}

def capture_units(keys: List<&2,Sharing.SharingKey>, sizes: List<&2,Nat>, +scope: Freshness.Scope, +member: Sharing.Member, position: Nat, state: State) -> Captured:
  match keys sizes:
    case Nil{} Nil{}: Captured{state,[],True{}}
    case key <> tail size <> rest:
      +next = captured_step(state,scope,member,position,size,key)
      captured_tail(next,capture_units(tail,rest,scope,member,(position + 1n : Nat),step_state(next)))
    case _ _: Captured{state,[],False{}}

def capture_found(state: State, scope: Freshness.Scope, keys: List<&2,Sharing.SharingKey>, sizes: List<&2,Nat>, found: Maybe<&2,Sharing.Member>) -> Captured:
  match found:
    case None{}: Captured{state,[],False{}}
    case Some{member}: capture_units(keys,sizes,scope,member,1n,state)

def capture(state: State, freshness: Freshness.State, scope: Freshness.Scope, parent: Freshness.Scope, keys: List<&2,Sharing.SharingKey>, sizes: List<&2,Nat>) -> Captured:
  capture_found(state,scope,keys,sizes,member(Freshness.lookup(Freshness.bindings(freshness),parent)))

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
  match route_valid(state,route):
    case False{}: []
    case True{}:
      match route:
        case Route{_,_,_,evaluation}: Sharing.route(canonical,freshness,sharing(state),evaluation)

def own(commands: List<&2,C.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case C.ReuseOwn{} <> _: True{}
    case _ <> tail: own(tail)

def disposition(commands: List<&2,C.Command>) -> Disposition:
  match own(commands):
    case True{}: Owned{}
    case False{}:
      match Sharing.join_command(commands):
        case True{}: Joined{}
        case False{}: Awaiting{}

def unit_route(units: List<&2,PreparedUnit>, +position: Nat, +evaluation: Nat, +next: Disposition) -> List<&2,PreparedUnit>:
  match units:
    case Nil{}: []
    case PreparedUnit{+p,bytes,key,+id,previous} <> tail:
      PreparedUnit{p,bytes,key,id,Bool.pick(Disposition,Nat.is_eq(p,position) && Nat.is_eq(id,evaluation),next,previous)} <> unit_route(tail,position,evaluation,next)

def routed_found(state: State, route: Route, commands: List<&2,C.Command>, found: Maybe<&2,Preparation>) -> State:
  match route found:
    case Route{scope,+member,+position,+evaluation} Some{Preparation{_,original,units}}:
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

def own_at(units: List<&2,PreparedUnit>, index: Nat) -> Maybe<&2,PreparedUnit>:
  match units:
    case Nil{}: None{}
    case +head <> tail:
      match head:
        case PreparedUnit{_,_,_,_,Owned{}}:
          Bool.pick(Maybe<&2,PreparedUnit>,Nat.is_eq(index,1n),Some{head},own_at(tail,(index - 1n : Nat)))
        case _: own_at(tail,index)

def bound_unit(state: State, scope: Freshness.Scope, bytes: Nat, unit: Maybe<&2,PreparedUnit>) -> State:
  match state unit:
    case State{sharing,preparations,bindings,results} Some{PreparedUnit{_,expected,_,evaluation,_}}:
      Bool.pick(State,Nat.is_eq(bytes,expected),State{sharing,preparations,Binding{scope,evaluation,bytes} <> bindings,results},state)
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
        case Binding{owner,_,_}:
          Bool.pick(Maybe<&2,Binding>,Freshness.same(owner,scope),Some{head},binding_found(tail,scope))

def lookup_binding(state: State, scope: Freshness.Scope) -> Maybe<&2,Binding>:
  match state:
    case State{_,_,bindings,_}: binding_found(bindings,scope)

def issued_found(state: State, physical: Sharing.Physical, binding: Maybe<&2,Binding>) -> State:
  match binding:
    case None{}: state
    case Some{Binding{_,evaluation,_}}: with_sharing(state,Sharing.issued(sharing(state),evaluation,physical))

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

def kept_result(remove: Bool, value: Result, tail: List<&2,Result>) -> List<&2,Result>:
  match remove:
    case True{}: tail
    case False{}: value <> tail

def without_result(items: List<&2,Result>, +evaluation: Nat) -> List<&2,Result>:
  match items:
    case Nil{}: []
    case Result{+id,outcome,original,bytes} <> tail:
      kept_result(Nat.is_eq(id,evaluation),Result{id,outcome,original,bytes},without_result(tail,evaluation))

def result_record(state: State, evaluation: Nat, outcome: C.RequestOutcome, original: Freshness.Scope, bytes: Nat) -> State:
  match state:
    case State{sharing,preparations,bindings,results}:
      State{sharing,preparations,bindings,Result{evaluation,outcome,original,bytes} <> without_result(results,evaluation)}

def terminal_found(+state: State, +scope: Freshness.Scope, physical: Sharing.Physical, outcome: C.RequestOutcome, +commands: List<&2,C.Command>, binding: Maybe<&2,Binding>) -> State:
  match binding:
    case None{}: state
    case Some{Binding{_,+evaluation,bytes}}:
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

def result_found(results: List<&2,Result>, +evaluation: Nat) -> Maybe<&2,C.RequestOutcome>:
  match results:
    case Nil{}: None{}
    case Result{id,outcome,original,bytes} <> tail:
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

def physical_live(view: Authority, captured: Maybe<&2,Sharing.Physical>) -> Bool:
  match view captured:
    case Authority{_,requests,_,_} Some{Sharing.Physical{p,l,r,o,request}}:
      request_live(Dispatch.request_phase(requests,p,l,r,o,request))
    case _ None{}: False{}

def request_live(found: Maybe<&2,Dispatch.Request>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

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
    case Binding{_,id,_} <> tail: Nat.is_eq(id,evaluation) || binding_reference(tail,evaluation)

def evaluation_live(view: Authority, preparations: List<&2,Preparation>, bindings: List<&2,Binding>, evaluation: Sharing.Evaluation) -> Bool:
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
    case Binding{+scope,+evaluation,+bytes} <> tail:
      kept_binding(scope_live(view,scope),Binding{scope,evaluation,bytes},retained_bindings(tail,view))

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

def kept_result(keep: Bool, result: Result, tail: List<&2,Result>) -> List<&2,Result>:
  match keep:
    case True{}: result <> tail
    case False{}: tail

def result_owned(found: Maybe<&2,Sharing.Evaluation>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def retained_results(results: List<&2,Result>, +evaluations: List<&2,Sharing.Evaluation>) -> List<&2,Result>:
  match results:
    case Nil{}: []
    case Result{+id,+outcome,+original,+bytes} <> tail:
      kept_result(result_owned(Sharing.find(evaluations,id)),Result{id,outcome,original,bytes},retained_results(tail,evaluations))

def retained_state(sharing: Sharing.State, +preparations: List<&2,Preparation>, +bindings: List<&2,Binding>, results: List<&2,Result>, view: Authority) -> State:
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
