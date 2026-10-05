import Base
import ../../agent-flow-bend/Canonical.bend as C
import ./advicee-lifecycle-driver.bend as Edge
import ./writer-original-inputs.bend as Inputs
import ./writer-observed-driver.bend as Writer
import ./sharing-original-inputs.bend as Shared
import ../WriterScenario.bend as Core
import ../CollectionScenario.bend as Response
import ../AdviceeLifecycle.bend as Lifecycle
import ../Workload.bend as Workload
import ../Session.bend as Session
import ../TreeFacts.bend as Tree
import ./writer-intersection-controls.bend as Intersection
import ../../agent-flow-bend/Ledger.bend as Ledger

# Seven original directed response cases, four seeded public interleavings,
# and two original Edit/sharing ownership intersections.
# Every response identity is returned by Engine; inputs contain no caller ID.
def target(p: Nat, r: Nat, token: Nat) -> Core.Target:
  Core.Target{p,1n,r,token}
def claim(+p: Nat, +r: Nat, token: Nat, lifetime: Nat) -> Core.ClaimFacts:
  Core.ClaimFacts{target(p,r,token),0n,lifetime,2n,Response.Response{p,1n,r,0n,30n,False{}}}
def session(name: String, identity: Nat, seed: U32, codes: List<&2,U32>) -> Shared.SessionInput:
  Shared.SessionInput{name,identity,Workload.Profile{Session.Settings{1000000,0,1000,500,0,300},seed,codes,100n,[100n],None{}}}
def tree(fixed: Bool) -> Tree.Profile:
  match fixed:
    # Accepted public validator in monkey-business/src/file-trees.ts rejects
    # maxFiles above 1 + imports + ... + imports^depth. The old 2-files/0-
    # imports draft was never runnable; one edge corrects that contradiction.
    case True{}: Tree.Profile{2n,2n,1n,3n,15n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n}
    case False{}: Tree.Profile{3n,8n,3n,3n,15n,0n,0n,0n,0n,0n,0n,0n,512n,4096n,256n,2048n}
def configuration(seed: Nat, retention: Nat, sessions: List<&2,Shared.SessionInput>, fixed: Bool, preparation: Nat) -> Shared.Configuration:
  Shared.Configuration{seed,Ledger.Limits{32n,100000n,16n,50000n},retention,sessions,tree(fixed),Shared.graph_limits(),preparation,0n,30000n,0n,0n,Edge.outcome_environment(Some{C.RequestFinding{}})}
def lifetime(mode: Nat) -> Nat:
  match mode:
    case 3n: 7n
    case 4n: 6n
    case _: 8n
def duplicate(mode: Nat) -> List<&2,Inputs.Boundary>:
  match mode:
    case 5n: [Inputs.WriterControl{Writer.Claim{"owner",claim(1n,1n,52n,8n)}}]
    case _: []
def release(mode: Nat) -> List<&2,Inputs.Boundary>:
  match mode:
    case 1n: [Inputs.WriterControl{Writer.Release{"owner",target(1n,1n,99n)}}]
    case 2n: [Inputs.WriterControl{Writer.Release{"owner",target(1n,1n,51n)}}]
    case _: []
def attempted(mode: Nat) -> Writer.Control:
  match mode:
    case 6n: Writer.Attempt{"owner",Core.Target{1n,2n,1n,51n},False{}}
    case _: Writer.Attempt{"owner",target(1n,1n,51n),False{}}
def directed(+mode: Nat) -> Inputs.Scenario:
  Inputs.Scenario{configuration(1n,1000n,[session("owner",1n,1,[111,119,110,101,114])],True{},2n),
    [Inputs.Edit{"owner",0n,10n,[5n],Some{C.RequestFinding{}}}],5n,
    List.append(&2,Inputs.Boundary,[Inputs.Advance{0n,100n},Inputs.WriterControl{Writer.Claim{"owner",claim(1n,1n,51n,lifetime(mode))}}],
    List.append(&2,Inputs.Boundary,duplicate(mode),List.append(&2,Inputs.Boundary,[Inputs.Advance{7n,200n}],
    List.append(&2,Inputs.Boundary,release(mode),[Inputs.WriterControl{attempted(mode)},Inputs.Advance{8n,200n}]))))}

def competing(cutoff: Nat) -> List<&2,Inputs.Boundary>:
  [Inputs.WriterControl{Writer.Release{"agent-1",target(1n,1n,99n)}},
   Inputs.WriterControl{Writer.Claim{"agent-1",claim(1n,1n,99n,cutoff)}}]
def ending(mode: Nat, cutoff: Nat) -> List<&2,Inputs.Boundary>:
  match mode:
    case 7n: [Inputs.WriterControl{Writer.Release{"agent-1",target(1n,1n,51n)}}]
    case 8n: [Inputs.Advance{cutoff,500n},Inputs.WriterControl{Writer.Expire{"agent-1",target(1n,1n,51n)}}]
    case 9n: [Inputs.Departure{"agent-1",1n,Lifecycle.Disconnect{}}]
    case _: [Inputs.Departure{"agent-1",1n,Lifecycle.Remove{}}]
def endpoint(mode: Nat, ready: Nat, cutoff: Nat) -> Nat:
  match mode:
    case 8n: Nat.add(cutoff,1n)
    case _: Nat.add(ready,1n)
def seeded(+mode: Nat, +seed: Nat, seed32: U32, other_seed: U32, +preparation: Nat, +delay: Nat) -> Inputs.Scenario:
  +ready=Nat.add(preparation,delay)
  +cutoff=Nat.add(ready,2n)
  Inputs.Scenario{configuration(seed,2000n,[session("agent-1",1n,seed32,[97,103,101,110,116,45,49]),
    session("healthy-writer",2n,other_seed,[104,101,97,108,116,104,121,45,119,114,105,116,101,114])],False{},preparation),
    [Inputs.Edit{"agent-1",0n,10n,[5n],Some{C.RequestFinding{}}},Inputs.Edit{"healthy-writer",0n,10n,[5n],Some{C.RequestFinding{}}}],delay,
    List.append(&2,Inputs.Boundary,[Inputs.Advance{0n,500n},
      Inputs.WriterControl{Writer.Claim{"agent-1",claim(1n,1n,51n,cutoff)}},
      Inputs.WriterControl{Writer.Claim{"healthy-writer",claim(2n,2n,61n,Nat.add(cutoff,10n))}}],
    List.append(&2,Inputs.Boundary,competing(cutoff),List.append(&2,Inputs.Boundary,
      [Inputs.Advance{0n,500n},Inputs.Advance{preparation,500n},Inputs.Advance{ready,500n}],
    List.append(&2,Inputs.Boundary,ending(mode,cutoff),[
      Inputs.WriterControl{Writer.Attempt{"agent-1",target(1n,1n,51n),False{}}},
      Inputs.WriterControl{Writer.Attempt{"healthy-writer",target(2n,2n,61n),False{}}},
      Inputs.Advance{endpoint(mode,ready,cutoff),500n}]))))}

# Original public intersections retained at full input/event/state boundaries.
def overlapping() -> Inputs.Scenario:
  Inputs.Scenario{configuration(1n,1000n,[session("agent-1",1n,1,[97,103,101,110,116,45,49])],False{},2n),
    [Inputs.Edit{"agent-1",0n,10n,[5n],Some{C.RequestFinding{}}}],5n,[
      Inputs.Advance{0n,100n},Inputs.WriterControl{Writer.Claim{"agent-1",claim(1n,1n,51n,20n)}},
      Inputs.IntersectionControl{Intersection.OutputProfile{5n,20n}},Inputs.Advance{7n,200n},
      Inputs.IntersectionControl{Intersection.OpenResponse{"agent-1",Response.Response{1n,1n,1n,7n,30n,False{}}}},
      Inputs.WriterControl{Writer.Attempt{"agent-1",target(1n,1n,51n),False{}}},
      Inputs.IntersectionControl{Intersection.AttemptIssuedResponse{"agent-1",0n,False{}}},Inputs.Advance{7n,300n},
      Inputs.WriterControl{Writer.Release{"agent-1",target(1n,1n,51n)}},Inputs.Advance{8n,100n},Inputs.Advance{12n,200n}]}

def shared_configuration() -> Shared.Configuration:
  Shared.Configuration{1n,Ledger.Limits{32n,100000n,16n,50000n},3000n,[session("agent-1",1n,1,[97,103,101,110,116,45,49])],tree(False{}),Shared.graph_limits(),2n,0n,30000n,8n,1n,Edge.outcome_environment(Some{C.RequestFinding{}})}

def shared_edit() -> Inputs.Edit:
  Inputs.SharedEdit{Shared.Edit{"agent-1",0n,10n,[5n],"same","same",Shared.Namespace{"agent-1",None{},None{},"shared-original"},Some{C.RequestFinding{}}}}

def shared_member() -> Inputs.Scenario:
  Inputs.Scenario{shared_configuration(),[shared_edit(),shared_edit()],10n,[
    Inputs.Advance{0n,200n},Inputs.WriterControl{Writer.Claim{"agent-1",claim(1n,1n,51n,20n)}},Inputs.Advance{2n,300n},
    Inputs.IntersectionControl{Intersection.LeaveMember{"agent-1",0n}},Inputs.Advance{3n,100n},Inputs.Advance{12n,300n},
    Inputs.WriterControl{Writer.Attempt{"agent-1",target(1n,1n,51n),False{}}},Inputs.Advance{13n,200n}]}

def original(+mode: Nat) -> Inputs.Scenario:
  match mode:
    case 11n: overlapping()
    case 12n: shared_member()
    case 7n: seeded(mode,3n,3,2654435764,2n,6n)
    case 8n: seeded(mode,17n,17,2654435778,4n,4n)
    case 9n: seeded(mode,41n,41,2654435802,4n,4n)
    case 10n: seeded(mode,97n,97,2654435858,3n,4n)
    case _: directed(mode)
