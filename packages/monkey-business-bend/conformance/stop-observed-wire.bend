import Base
import ./stop-original-inputs.bend as Inputs
import ./advicee-lifecycle-driver.bend as Edge
import ../StopScenario.bend as Stop
import ../Driver.bend as Driver
import ../Callbacks.bend as Callbacks
import ../OutputScenario.bend as Output
import ../CacheRuntime.bend as CacheRuntime
import ../Types.bend as Types
import ../Workload.bend as Workload
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/ImportGraph.bend as ImportGraph

# Ordered public business facts captured at the actual interpreter transition.
# No recursive runtime, queue, private context or duplicate engine snapshot.
type BusinessState is Data:
  BusinessState{canonical: C.State, finishes: List<&2,Stop.Finish>}
type Endpoint is Data:
  Endpoint{time: Nat, projection: List<&2,BusinessState>}
type Outcome is Data:
  Advanced{commands: List<&2,C.Command>}
  Rejected{reason: C.Reason}
type GraphResult is Data:
  GraphAdvanced{before: ImportGraph.Bounded, after: ImportGraph.Bounded, command: ImportGraph.Command}
  GraphRejected{}
type Observation is Data:
  Canonical{time: Nat, order: Nat, before: List<&2,BusinessState>, after: List<&2,BusinessState>, event: C.CanonicalEvent, result: List<&2,Outcome>, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>}
  Cache{time: Nat, order: Nat, before: List<&2,BusinessState>, after: List<&2,BusinessState>, fact: CacheRuntime.Fact, event: C.CanonicalEvent, result: List<&2,Outcome>, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>}
  Graph{time: Nat, order: Nat, before: List<&2,BusinessState>, after: List<&2,BusinessState>, key: Types.GraphKey, position: Nat, event: ImportGraph.GraphEvent, result: List<&2,GraphResult>, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>}
  Finish{time: Nat, order: Nat, before: List<&2,BusinessState>, after: List<&2,BusinessState>, input: Stop.Input, finish: Maybe<&2,Stop.Finish>, created: Bool, provided: Maybe<&2,Nat>, command_scopes: List<&2,Maybe<&2,Nat>>}
type Origin is Data:
  Environmental{}
  CanonicalFeedback{}
  RawInput{}
type IssuedFacts is Data:
  IssuedFacts{source_job: Maybe<&2,Driver.SourceJob>, outcome_receipt: Maybe<&2,Driver.OutcomeReceipt>, output_capture: Maybe<&2,Output.Capture>, origin: Origin}
type Physical is Data:
  Physical{time: Nat, order: Nat, before: List<&2,BusinessState>, after: List<&2,BusinessState>, action: Maybe<&2,Driver.Action>}
# Producer facts for newly appended slots, selected by the actual enqueue watermark.
type Emission is Data:
  Action{time: Nat, order: Nat, action: Driver.Action, attempt: Maybe<&2,Nat>, issued: IssuedFacts}
  Edit{time: Nat, order: Nat, source_job: Maybe<&2,Driver.SourceJob>}
  SourceEdit{time: Nat, order: Nat, partition: Nat, activity: Nat, bytes: Nat, units: List<&2,Nat>, outcome: Maybe<&2,C.RequestOutcome>}
  FinishInput{time: Nat, order: Nat, input: Stop.Input}
  FinishIntent{time: Nat, order: Nat, partition: Nat, started: Nat, cutoff: Nat, recurring: Bool}
  GraphInput{time: Nat, order: Nat, partition: Nat, lifetime: Nat, round: Nat, operation: Nat, position: Nat, event: ImportGraph.GraphEvent}
  Arrival{time: Nat, order: Nat, event: Workload.Emission, activity: Nat}
  CacheInput{time: Nat, order: Nat, fact: CacheRuntime.Fact, source_job: Maybe<&2,Driver.SourceJob>}
  Missing{time: Nat, order: Nat}
type Frame is Data:
  Control{input: Inputs.Boundary, before_environment: Edge.Environment, after_environment: Edge.Environment, before: Endpoint, after: Endpoint}
  Observed{observation: Observation, original_finish: Maybe<&2,Stop.Finish>, receipt: Maybe<&2,Callbacks.Fact>, physical: List<&2,Physical>, issuance: Maybe<&2,IssuedFacts>, emissions: List<&2,Emission>}
  PhysicalOnly{physical: Physical, receipt: Callbacks.Fact, issuance: Maybe<&2,IssuedFacts>, emissions: List<&2,Emission>}
  Boundary{input: Inputs.Boundary, consumed: Nat, endpoint: Endpoint}
  InvalidTransport{}
type Trace is Data:
  Trace{input: Inputs.Scenario, frames: List<&2,Frame>, endpoint: Endpoint, valid: Bool}
type Envelope is Data:
  Envelope{traces: List<&2,Trace>}
