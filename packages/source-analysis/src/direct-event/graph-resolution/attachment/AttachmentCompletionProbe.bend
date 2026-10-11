import ../../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ../../../../../agent-flow-bend/ImportGraph.bend as G
import ./AttachmentTransactionProbe.bend as Transaction
import ./AttachmentReferenceBoundary.bend as Boundary
import ../Types.bend as T
import ../ExpansionSpecification.bend as X
import ../Environment.bend as E
import ../ExpansionDriverSpecification.bend as D
import ../ExpansionDriverState.bend as DriverState
import ../Machine.bend as Machine
import ../Loop.bend as Loop
import ../Clock.bend as Clock

# Finite consumer probe for a separate zero-elapsed clock reply and final
# product measurement. This is not an extended attachment macrostep or law.
def consume_reusable(+state: DriverState.State, outcome: T.ServiceOutcome) -> DriverState.Selection:
  match state outcome:
    case _ T.ProviderRejected{exception}: DriverState.Rejected{state, T.ForeignProviderFailure{exception}}
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitDeadline{}, _} T.ClockRead{
      ArtifactValue.Binary64{0, 0}
    }:
      D.deadline(state, False{})
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitCompletion{product}, _} T.ProductEncoded{bytes}:
      D.completed(state, product, Nat.is_le(bytes, D.tree_cap(D.limits(DriverState.frame(state)))))
    case DriverState.State{_, _, _, _, _, _, _, DriverState.AwaitFinalDeadline{product}, _} T.ClockRead{bits}:
      D.final_deadline(state, product, Clock.expired(bits))
    case _ _: DriverState.Rejected{state, T.WrongReplyKind{}}

def consume(state: DriverState.State, outcome: T.ServiceOutcome) -> DriverState.Selection:
  consume_reusable(state, outcome)

def frame_command(frame: X.Frame) -> G.Command:
  match frame:
    case X.Frame{_, command, _, _, _, _, _, _, _, _, _, _}: command

def pure_step(+selection: DriverState.Selection) -> DriverState.Selection:
  match selection:
    case DriverState.Internal{+state}:
      match state:
        case DriverState.State{_, _, _, _, _, _, _, DriverState.Command{}, _}:
          D.dispatch_command(state, frame_command(DriverState.frame(state)))
        case _: Boundary.boundary_step(selection)
    case _: selection

def normalize(fuel: Nat, +selection: DriverState.Selection) -> DriverState.Selection:
  match fuel selection:
    case 0n _: selection
    case 1n+remaining DriverState.Internal{_}: normalize(remaining, pure_step(selection))
    case _ _: selection

def normalized(progress: DriverState.Progress<Unit>) -> DriverState.Progress<Unit>:
  match progress:
    case DriverState.DriverReady{state, world}: DriverState.consumed(Unit, normalize(6n, DriverState.Internal{state}), world)
    case _: progress

def delivered(progress: DriverState.Progress<Unit>, reply: T.Reply) -> DriverState.Progress<Unit>:
  match progress:
    case DriverState.DriverSelected{
      DriverState.State{+config, frame, targets, ids, target, +next, iterations, stage, +python},
      operation,
      world
    }:
      normalized(
        DriverState.delivered(
          consume,
          Unit,
          T.Request{DriverState.invocation(config), next, operation},
          DriverState.State{config, frame, targets, ids, target, (next + 1n : Nat), iterations, stage, python},
          reply,
          world
        )
      )
    case _: progress

def actual_delivered(step: Loop.Continuation, reply: T.Reply) -> Loop.Continuation:
  Machine.resume(step, T.ServiceReply{reply})

def main() -> Unit:
  Unit{}
