import Base
import ../../../../../agent-flow-bend/ImportGraph.bend as G
import ./AttachmentTransactionProbe.bend as Transaction
import ./AttachmentReferenceBoundary.bend as Boundary
import ../Types.bend as T
import ../ExpansionSpecification.bend as X
import ../Environment.bend as E
import ../ExpansionDriverSpecification.bend as D
import ../Machine.bend as Machine
import ../Loop.bend as Loop

# Finite consumer probe for a separate zero-elapsed clock reply and final
# product measurement. This is not an extended attachment macrostep or law.
def consume_reusable(+state: D.State, outcome: T.ServiceOutcome) -> D.Selection:
  match state outcome:
    case _ T.ProviderRejected{exception}: D.Rejected{state, T.ForeignProviderFailure{exception}}
    case D.State{_, _, _, _, _, _, _, D.AwaitDeadline{}} T.ClockRead{T.Binary64{0, 0}}:
      D.deadline(state, False{})
    case D.State{_, _, _, _, _, _, _, D.AwaitCompletion{product}} T.ProductEncoded{bytes}:
      D.completed(state, product, Nat.is_le(bytes, D.tree_cap(D.limits(D.frame(state)))))
    case _ _: D.Rejected{state, T.WrongReplyKind{}}

def consume(state: D.State, outcome: T.ServiceOutcome) -> D.Selection:
  consume_reusable(state, outcome)

def frame_command(frame: X.Frame) -> G.Command:
  match frame:
    case X.Frame{_, command, _, _, _, _, _, _, _, _, _}: command

def pure_step(+selection: D.Selection) -> D.Selection:
  match selection:
    case D.Internal{+state}:
      match state:
        case D.State{_, _, _, _, _, _, _, D.Command{}}:
          D.dispatch_command(state, frame_command(D.frame(state)))
        case _: Boundary.boundary_step(selection)
    case _: selection

def normalize(fuel: Nat, +selection: D.Selection) -> D.Selection:
  match fuel selection:
    case 0n _: selection
    case 1n+remaining D.Internal{_}: normalize(remaining, pure_step(selection))
    case _ _: selection

def normalized(progress: D.Progress<Unit>) -> D.Progress<Unit>:
  match progress:
    case D.DriverReady{state, world}: D.consumed(Unit, normalize(6n, D.Internal{state}), world)
    case _: progress

def delivered(progress: D.Progress<Unit>, reply: T.Reply) -> D.Progress<Unit>:
  match progress:
    case D.DriverSelected{
      D.State{+config, frame, targets, ids, target, +next, iterations, stage},
      operation,
      world
    }:
      normalized(
        D.delivered(
          consume,
          Unit,
          T.Request{D.invocation(config), next, operation},
          D.State{config, frame, targets, ids, target, (next + 1n : Nat), iterations, stage},
          reply,
          world
        )
      )
    case _: progress

def actual_delivered(step: Loop.Continuation, reply: T.Reply) -> Loop.Continuation:
  Machine.resume(step, T.ServiceReply{reply})

def main() -> Unit:
  Unit{}
