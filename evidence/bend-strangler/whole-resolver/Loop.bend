import Base
import ./Types.bend as T
import ./State.bend as S
import ./Root.bend as Root
import ./Core.bend as Materialize
import ./Clock.bend as Clock
import ../local-graph-draft/core.bend as Local
import ../../../packages/agent-flow-bend/ImportGraph.bend as Graph

# These are Bend continuations, not commands for a JS graph-policy owner.
type Continuation is Data:
  PrepareRust{state: T.ResolverState}
  PreparedRust{state: T.ResolverState, prepared: T.PreparedLanguage, frontend: T.RustContext}
  RustAdvance{state: T.ResolverState, event: Graph.GraphEvent}
  RustInvalid{state: T.ResolverState}
  RustFollowInvalid{state: T.ResolverState}
  RustFindCargo{state: T.ResolverState}
  RustCargoContinue{state: T.ResolverState}
  RustFollow{state: T.ResolverState, route: T.RustRoute, capture: T.CaptureToken}
  RustCargo{state: T.ResolverState, syntax: T.TomlValue}
  RustModules{state: T.ResolverState, names: List<&2, String>}
  RustTasks{state: T.ResolverState, tasks: List<&2, T.RustTask>}
  ServiceStep{step: T.ResolverStep}
  ResolvePending{state: T.ResolverState, edge: Nat}
  CheckTarget{state: T.ResolverState, target: Nat}
  ReadTarget{state: T.ResolverState, target: Nat}
  InspectCaptured{state: T.ResolverState, facts: T.SourceFacts}
  ReadBundled{state: T.ResolverState, declaration: Nat, facts: Local.Facts, edge: Local.Pending}
  PrepareImportedRust{state: T.ResolverState}

# Follow only reachable Expanded links. A finite valid address tree needs at
# most one node-count of fuel; unreachable rejected records cannot create a
# partial ReviewUnit. Shape/completion preservation remains a whole-machine law.
def omission_slot(same: Bool, reference: Local.PlannedReference,
    child: Nat -> Bool, remaining: Unit -> Bool) -> Bool:
  match same:
    case False{}: remaining(Unit{})
    case True{}:
      match reference:
        case Local.Omitted{_, _}: True{}
        case Local.Included{_}: remaining(Unit{})
        case Local.Expanded{node}: Bool.or(child(node), remaining(Unit{}))

def has_omission(+fuel: Nat, slots: List<&2, Local.ReferenceSlot>, +owner: Nat,
    +all_slots: List<&2, Local.ReferenceSlot>) -> Bool:
  match fuel:
    case 0n: False{}
    case 1n++remaining:
      match slots:
        case []: False{}
        case Local.ReferenceSlot{actual, _, _, reference} <> tail:
          child : Nat -> Bool = node => has_omission(remaining, all_slots, node, all_slots)
          next : Unit -> Bool = _ => has_omission(fuel, tail, owner, all_slots)
          omission_slot(Nat.is_eq(actual, owner), reference, child, next)

def frame_has_omission(+frame: T.ResolverFrame) -> Bool:
  has_omission((List.length(&2, Local.PlannedNode, S.frame_nodes(frame)) + 1n : Nat),
    S.frame_references(frame), S.frame_root(frame), S.frame_references(frame))

def eligible_reason(reason: Graph.Reason) -> Bool:
  match reason:
    case Graph.Deadline{}: False{}
    case Graph.ProtocolViolation{}: False{}
    case _: True{}

def files(graph: Graph.Graph) -> Nat:
  match graph:
    case Graph.Graph{_, _, _, files, _, _, _, _, _, _, _}: files

def partial_allowed(+frame: T.ResolverFrame, reason: Graph.Reason) -> Bool:
  Bool.and(
    eligible_reason(reason),
    Bool.and(Nat.is_gt(files(S.frame_graph(frame)), 0n), frame_has_omission(frame))
  )

def completion_product(product: Maybe<&2, T.ProductValue>, +state: T.ResolverState) -> Continuation:
  match product:
    case None{}: ServiceStep{T.FailedResolver{T.MalformedReply{}}}
    case Some{+value}: ServiceStep{
      S.request(
        S.with_state_scratch(
          state,
          S.with_scratch_measured_product(S.state_scratch(state), Some{value})
        ),
        T.MeasuringCompletion{},
        T.EncodeProduct{value}
      )
    }

def request_completion(
  allowed: Bool,
  +state: T.ResolverState,
  frame: T.ResolverFrame
) -> Continuation:
  match allowed:
    case False{}: ServiceStep{T.FinishedResolver{T.NoReviewUnit{}, S.state_frame(state)}}
    case True{}: completion_product(Root.unit(frame), state)

def next_clock(clock: Maybe<&2, T.ClockToken>, state: T.ResolverState) -> Continuation:
  match clock:
    case None{}: ServiceStep{T.FailedResolver{T.MalformedReply{}}}
    case Some{clock}: ServiceStep{
      S.request(state, T.CheckingIterationDeadline{}, T.ReadClock{clock})
    }

def start_fuel(fuel: Nat, +state: T.ResolverState) -> Continuation:
  match fuel:
    case 0n: ServiceStep{T.FinishedResolver{T.NoReviewUnit{}, S.state_frame(state)}}
    case 1n++remaining: next_clock(
      S.state_clock(state),
      S.with_state_iteration_fuel(state, remaining)
    )

def start(+state: T.ResolverState) -> Continuation:
  start_fuel(S.state_iteration_fuel(state), state)

# Native graphIteration performs phase completion after command execution,
# except the explicit continue outcome for an unsupported normalized path.
def after_phase(
  graph: Graph.Graph,
  +state: T.ResolverState,
  +frame: T.ResolverFrame
) -> Continuation:
  match graph:
    case Graph.Graph{phase, _, _, _, _, _, _, _, _, _, _}:
      match phase:
        case Graph.Complete{}: request_completion(True{}, state, frame)
        case Graph.Incomplete{reason}: request_completion(
          partial_allowed(frame, reason),
          state,
          frame
        )
        case _: start(state)

def after_frame(frame: Maybe<&2, T.ResolverFrame>, state: T.ResolverState) -> Continuation:
  match frame:
    case None{}: ServiceStep{T.FailedResolver{T.MalformedReply{}}}
    case Some{+frame}: after_phase(S.frame_graph(frame), state, frame)

def after_command(skip_phase: Bool, +state: T.ResolverState) -> Continuation:
  match skip_phase:
    case True{}: start(state)
    case False{}:
      after_frame(S.state_frame(state), state)

def advanced(+state: T.ResolverState, frame: T.ResolverFrame) -> Continuation:
  after_command(False{}, S.with_state_frame(state, Some{S.advance(frame, Graph.Next{})}))

def command(
  command: Graph.Command,
  +state: T.ResolverState,
  +frame: T.ResolverFrame
) -> Continuation:
  match command:
    case Graph.NoCommand{}: advanced(state, frame)
    case Graph.SkipImport{_, _}: advanced(state, frame)
    case Graph.ResolveEdge{edge}: ResolvePending{state, edge}
    case Graph.CheckPath{target}: CheckTarget{state, target}
    case Graph.ReadSource{target}: ReadTarget{state, target}
    case Graph.UnitComplete{}: request_completion(True{}, state, frame)
    case Graph.UnitIncomplete{reason}: request_completion(
      partial_allowed(frame, reason),
      state,
      frame
    )

def iteration_frame(frame: Maybe<&2, T.ResolverFrame>, state: T.ResolverState) -> Continuation:
  match frame:
    case None{}: ServiceStep{T.FailedResolver{T.MalformedReply{}}}
    case Some{+frame}: command(S.frame_command(frame), state, frame)

def deadline(frame: Maybe<&2, T.ResolverFrame>) -> Continuation:
  match frame:
    case None{}: ServiceStep{T.FailedResolver{T.MalformedReply{}}}
    case Some{frame}: ServiceStep{T.FinishedResolver{
      T.NoReviewUnit{}, Some{S.advance(frame, Graph.DeadlineReached{})}}}

def iteration(expired: Bool, +state: T.ResolverState) -> Continuation:
  match expired:
    case True{}: deadline(S.state_frame(state))
    case False{}:
      iteration_frame(S.state_frame(state), state)

def elapsed(bits: T.Binary64, state: T.ResolverState) -> Continuation:
  iteration(Clock.expired(bits), state)

def finished_product(product: Maybe<&2, T.ProductValue>, frame: T.ResolverFrame) -> T.ResolverStep:
  match product:
    case None{}: T.FailedResolver{T.MalformedReply{}}
    case Some{value}: T.FinishedResolver{T.ReviewUnitResult{value}, Some{frame}}

def completion_bytes(allowed: Bool, frame: T.ResolverFrame,
    product: Maybe<&2, T.ProductValue>) -> T.ResolverStep:
  match allowed:
    case False{}: T.FinishedResolver{T.NoReviewUnit{}, Some{frame}}
    case True{}: finished_product(product, frame)

def measured_frame(frame: Maybe<&2, T.ResolverFrame>, bytes: Nat,
    product: Maybe<&2, T.ProductValue>) -> T.ResolverStep:
  match frame:
    case None{}: T.FailedResolver{T.MalformedReply{}}
    case Some{+frame}: completion_bytes(
      Nat.is_le(bytes, Graph.tree_cap(S.frame_limits(frame))), frame, product)

def measured(bytes: Nat, +state: T.ResolverState) -> T.ResolverStep:
  measured_frame(S.state_frame(state), bytes,
    S.scratch_measured_product(S.state_scratch(state)))

def main() -> Unit:
  Unit{}
