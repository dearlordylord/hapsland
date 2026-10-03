import Base
import ./FreshnessScenario.bend as Freshness
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as Canonical

def candidate_scope(bindings: List<&2,Freshness.Binding>, +partition: Nat, +round: Nat, +advice: Nat) -> Maybe<&2,Freshness.Scope>:
  match bindings:
    case Nil{}: None{}
    case Freshness.Binding{Freshness.Scope{+p,+l,+r,+o},_,_} <> tail:
      Bool.pick(Maybe<&2,Freshness.Scope>,Nat.is_eq(p,partition) && Nat.is_eq(r,round) && Nat.is_eq(o,advice),
        Some{Freshness.Scope{p,l,r,o}},candidate_scope(tail,partition,round,advice))

def operation_scope(bindings: List<&2,Freshness.Binding>, +advice: Nat) -> Maybe<&2,Freshness.Scope>:
  match bindings:
    case Nil{}: None{}
    case Freshness.Binding{Freshness.Scope{+p,+l,+r,+o},_,_} <> tail:
      Bool.pick(Maybe<&2,Freshness.Scope>,Nat.is_eq(o,advice),Some{Freshness.Scope{p,l,r,o}},operation_scope(tail,advice))

def candidate(state: Freshness.State, value: Maybe<&2,Driver.Candidate>) -> Maybe<&2,Freshness.Scope>:
  match value:
    case None{}: None{}
    case Some{Driver.Candidate{p,o,r,_,_,_}}: candidate_scope(Freshness.bindings(state),p,r,o)

def scope(+state: Freshness.State, event: Canonical.CanonicalEvent, value: Maybe<&2,Driver.Candidate>) -> Maybe<&2,Freshness.Scope>:
  match event:
    case Canonical.JevRequestReady{p,l,r,o,_,_,_,_,_,_}: Some{Freshness.Scope{p,l,r,o}}
    case Canonical.JevRequestStarted{p,l,r,o,_}: Some{Freshness.Scope{p,l,r,o}}
    case Canonical.JevRequestInterrupted{p,l,r,o,_}: Some{Freshness.Scope{p,l,r,o}}
    case Canonical.JevRequestSettled{p,l,r,o,_,_,_}: Some{Freshness.Scope{p,l,r,o}}
    case Canonical.CollectionReady{advice,_,_,_,_,_}: operation_scope(Freshness.bindings(state),advice)
    case _: candidate(state,value)

def current(state: Freshness.State, canonical: Canonical.State, owner: Maybe<&2,Freshness.Scope>, supplied: Bool) -> Bool:
  match owner:
    case None{}: supplied
    case Some{scope}:
      match Freshness.current(state,canonical,scope):
        case None{}: supplied
        case Some{actual}: supplied && actual

def apply(+state: Freshness.State, canonical: Canonical.State, event: Canonical.CanonicalEvent, context: Driver.Context) -> Driver.Context:
  match context:
    case Driver.Context{p,l,r,bytes,job,delay,outcome,supplied,credential,generation,readable,lifetime,+value,collection,review,output,certain,output_delay,output_lease,background,dispatch}:
      Driver.Context{p,l,r,bytes,job,delay,outcome,current(state,canonical,scope(state,event,value),supplied),credential,generation,readable,lifetime,value,collection,review,output,certain,output_delay,output_lease,background,dispatch}
