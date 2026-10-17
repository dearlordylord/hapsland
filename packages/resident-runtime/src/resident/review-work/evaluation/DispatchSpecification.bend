import Base
import ./Dispatch.bend as D

# Draft whole evaluation protocol specification, not an approved contract/proof.
# This complete Dispatch relation uses production types, never production
# transition helpers. Canonical parent/lease/start authority is a separate
# owner-family obligation; native dispatch/drain remain real IO obligations.
# Maintain with the public cursor API. On replacement transfer current
# guarantees and delete obsolete specification/laws/proofs.

def request(+invocation: Nat, +id: Nat, phase: D.Phase, command: D.Command) -> D.Step:
  D.Await{invocation, id, phase, D.Request{invocation, id, command}}

def initial(invocation: Nat) -> D.Step:
  request(invocation, 0n, D.Credential{}, D.CheckCredentialGeneration{})

def interruption_initial(invocation: Nat) -> D.Step:
  request(invocation, 0n, D.Interrupt{}, D.InterruptRequest{})

def transition(phase: D.Phase, response: D.Response, invocation: Nat, next: Nat) -> D.Step:
  match phase response:
    case _ D.Failed{token}: D.Aborted{token}
    case D.Credential{} D.Flag{True{}}:
      request(invocation, next, D.Budget{}, D.ClaimDemoBudget{})
    case D.Credential{} D.Flag{False{}}: D.CredentialChanged{}
    case D.Budget{} D.Ack{}:
      request(invocation, next, D.Start{}, D.StartRequest{})
    case D.Start{} D.Flag{True{}}:
      request(invocation, next, D.Started{}, D.ObserveStarted{})
    case D.Start{} D.Flag{False{}}: D.StartRefused{}
    case D.Started{} D.Ack{}:
      request(invocation, next, D.AbortedRead{}, D.ReadAborted{})
    case D.AbortedRead{} D.Flag{True{}}:
      request(invocation, next, D.Interrupt{}, D.InterruptRequest{})
    case D.AbortedRead{} D.Flag{False{}}: D.Dispatched{}
    case D.Interrupt{} D.Flag{True{}}:
      request(invocation, next, D.Interrupted{}, D.ObserveInterrupted{})
    case D.Interrupt{} D.Flag{False{}}: D.Dispatched{}
    case D.Interrupted{} D.Ack{}: D.Dispatched{}
    case _ _: D.Rejected{}

def correlated(
  valid: Bool,
  phase: D.Phase,
  response: D.Response,
  invocation: Nat,
  next: Nat
) -> D.Step:
  match valid:
    case False{}: D.Rejected{}
    case True{}: transition(phase, response, invocation, next)

def resume(step: D.Step, reply: D.Reply) -> D.Step:
  match step reply:
    case D.Await{+invocation, +id, phase, D.Request{owner, request_id, _}}
      D.Reply{actual, received, response}:
      correlated(
        Bool.and(Nat.is_eq(invocation, owner), Bool.and(Nat.is_eq(id, request_id),
          Bool.and(Nat.is_eq(invocation, actual), Nat.is_eq(id, received)))),
        phase, response, invocation, Nat.add(id, 1n)
      )
    case _ _: D.Rejected{}

def main() -> Unit:
  Unit{}
