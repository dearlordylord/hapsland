import Base
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_BOOL_FACTS.bend as B
import ./Preparation.bend as Preparation

# Correspondence obligations for the existing 10000-step host loop.
def external(step: Preparation.Step) -> Bool:
  match step:
    case Preparation.Internal{_}: False{}
    case _: True{}

def settled(value: Maybe<&2, Preparation.Step>) -> Bool:
  match value:
    case None{}: True{}
    case Some{step}: external(step)

def exhausted(
  step: Preparation.Step
) -> {Preparation.settle(0n, step) == None{} : Maybe<&2, Preparation.Step>}:
  {==}

def internal_step(
  remaining: Nat,
  state: Preparation.State
) -> {
  Preparation.settle(1n+remaining, Preparation.Internal{state})
  == Preparation.settle(remaining, Preparation.advance(state))
  : Maybe<&2, Preparation.Step>
}:
  {==}

def first_external(
  remaining: Nat,
  step: Preparation.Step,
  ready: {external(step) == True{} : Bool}
) -> {Preparation.settle(1n+remaining, step) == Some{step} : Maybe<&2, Preparation.Step>}:
  match step:
    case Preparation.Internal{+state}: Empty.absurd(
      {
        Preparation.settle(1n+remaining, Preparation.Internal{state})
        == Some{Preparation.Internal{state}}
        : Maybe<&2, Preparation.Step>
      },
      B.internal_false_ne_true(ready)
    )
    case Preparation.Await{_, _}: {==}
    case Preparation.Finished{_}: {==}
    case Preparation.Failed{_}: {==}

def no_internal(
  remaining: Nat,
  step: Preparation.Step
) -> {settled(Preparation.settle(remaining, step)) == True{} : Bool}:
  match remaining:
    case 0n: {==}
    case 1n++rest:
      match step:
        case Preparation.Internal{state}: no_internal(rest, Preparation.advance(state))
        case Preparation.Await{_, _}: {==}
        case Preparation.Finished{_}: {==}
        case Preparation.Failed{_}: {==}

def initial_allowance(
  invocation: Nat,
  input: Preparation.Input
) -> {
  Preparation.initial_settled(invocation, input)
  == Preparation.settle(10000n, Preparation.initial(invocation, input))
  : Maybe<&2, Preparation.Step>
}:
  {==}

def resume_allowance(
  step: Preparation.Step,
  reply: Preparation.Reply
) -> {
  Preparation.resume_settled(step, reply)
  == Preparation.settle(10000n, Preparation.resume(step, reply))
  : Maybe<&2, Preparation.Step>
}:
  {==}

def main() -> Unit:
  Unit{}
