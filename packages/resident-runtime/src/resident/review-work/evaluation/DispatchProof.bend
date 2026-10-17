import Base
import ./Dispatch.bend as D
import ./DispatchSpecification.bend as S

# Supporting proof for the owner-approved whole evaluation_protocol_exact law.
# Arbitrary Nat identities and failure tokens; exhaustive typed constructors.
# No native IO or Canonical authority claim. Delete/transfer with this cursor API.

def initial_exact(+invocation: Nat) -> {D.initial(invocation) == S.initial(invocation) : D.Step}:
  {==}

def interruption_initial_exact(
  +invocation: Nat
) -> {D.interruption_initial(invocation) == S.interruption_initial(invocation) : D.Step}:
  {==}

def transition_exact(+phase: D.Phase, +response: D.Response, +invocation: Nat, +next: Nat) -> {
  D.advance(phase, response, invocation, next)
  == S.transition(phase, response, invocation, next)
  : D.Step
}:
  match phase response:
    case D.Credential{} D.Ack{}: {==}
    case D.Credential{} D.Flag{True{}}: {==}
    case D.Credential{} D.Flag{False{}}: {==}
    case D.Credential{} D.Failed{token}: {==}
    case D.Budget{} D.Ack{}: {==}
    case D.Budget{} D.Flag{True{}}: {==}
    case D.Budget{} D.Flag{False{}}: {==}
    case D.Budget{} D.Failed{token}: {==}
    case D.Start{} D.Ack{}: {==}
    case D.Start{} D.Flag{True{}}: {==}
    case D.Start{} D.Flag{False{}}: {==}
    case D.Start{} D.Failed{token}: {==}
    case D.Started{} D.Ack{}: {==}
    case D.Started{} D.Flag{True{}}: {==}
    case D.Started{} D.Flag{False{}}: {==}
    case D.Started{} D.Failed{token}: {==}
    case D.AbortedRead{} D.Ack{}: {==}
    case D.AbortedRead{} D.Flag{True{}}: {==}
    case D.AbortedRead{} D.Flag{False{}}: {==}
    case D.AbortedRead{} D.Failed{token}: {==}
    case D.Interrupt{} D.Ack{}: {==}
    case D.Interrupt{} D.Flag{True{}}: {==}
    case D.Interrupt{} D.Flag{False{}}: {==}
    case D.Interrupt{} D.Failed{token}: {==}
    case D.Interrupted{} D.Ack{}: {==}
    case D.Interrupted{} D.Flag{True{}}: {==}
    case D.Interrupted{} D.Flag{False{}}: {==}
    case D.Interrupted{} D.Failed{token}: {==}

def correlated_exact(
  +valid: Bool,
  +phase: D.Phase,
  +response: D.Response,
  +invocation: Nat,
  +next: Nat
) -> {
  D.correlated(valid, phase, response, invocation, next)
  == S.correlated(valid, phase, response, invocation, next)
  : D.Step
}:
  match valid:
    case False{}: {==}
    case True{}: transition_exact(phase, response, invocation, next)

def resume_exact(+step: D.Step, +reply: D.Reply) -> {
  D.resume(step, reply) == S.resume(step, reply) : D.Step
}:
  match step reply:
    case D.Await{+invocation, +id, phase, D.Request{owner, request, _}} D.Reply{
      actual,
      received,
      response
    }:
      correlated_exact(
        Bool.and(
          Nat.is_eq(invocation, owner),
          Bool.and(
            Nat.is_eq(id, request),
            Bool.and(Nat.is_eq(invocation, actual), Nat.is_eq(id, received))
          )
        ),
        phase,
        response,
        invocation,
        Nat.add(id, 1n)
      )
    case D.Dispatched{} _: {==}
    case D.CredentialChanged{} _: {==}
    case D.StartRefused{} _: {==}
    case D.Aborted{_} _: {==}
    case D.Rejected{} _: {==}

def main() -> Unit:
  Unit{}
