import Base

# Nested beforeDispatch child. The provider parent remains parked while this
# cursor obtains one dispatch authorization. Native tokens retain original
# failures; no credential value, provider input or result crosses this ABI.
type Command is Data:
  CheckCredentialGeneration{}
  ClaimDemoBudget{}
  StartRequest{}
  ObserveStarted{}
  ReadAborted{}
  InterruptRequest{}
  ObserveInterrupted{}
type Response is Data:
  Ack{}
  Flag{value: Bool}
  Failed{token: Nat}
type Phase is Data:
  Credential{}
  Budget{}
  Start{}
  Started{}
  AbortedRead{}
  Interrupt{}
  Interrupted{}
type Request is Data:
  Request{invocation: Nat, id: Nat, command: Command}
type Reply is Data:
  Reply{invocation: Nat, id: Nat, response: Response}
type Step is Data:
  Await{invocation: Nat, id: Nat, phase: Phase, request: Request}
  Dispatched{}
  CredentialChanged{}
  StartRefused{}
  Aborted{token: Nat}
  Rejected{}

def issue(+invocation: Nat, +id: Nat, phase: Phase, command: Command) -> Step:
  Await{invocation, id, phase, Request{invocation, id, command}}

def initial(invocation: Nat) -> Step:
  issue(invocation, 0n, Credential{}, CheckCredentialGeneration{})

# Work-abort listener reuses accounting commands without invoking provider dispatch.
def interruption_initial(invocation: Nat) -> Step:
  issue(invocation, 0n, Interrupt{}, InterruptRequest{})

def credential(valid: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, Budget{}, ClaimDemoBudget{})
    case False{}: CredentialChanged{}

def started(accepted: Bool, invocation: Nat, next: Nat) -> Step:
  match accepted:
    case True{}: issue(invocation, next, Started{}, ObserveStarted{})
    case False{}: StartRefused{}

def aborted(value: Bool, invocation: Nat, next: Nat) -> Step:
  match value:
    case True{}: issue(invocation, next, Interrupt{}, InterruptRequest{})
    case False{}: Dispatched{}

def interrupted(accepted: Bool, invocation: Nat, next: Nat) -> Step:
  match accepted:
    case True{}: issue(invocation, next, Interrupted{}, ObserveInterrupted{})
    case False{}: Dispatched{}

def advance(phase: Phase, response: Response, invocation: Nat, next: Nat) -> Step:
  match phase response:
    case _ Failed{token}: Aborted{token}
    case Credential{} Flag{valid}: credential(valid, invocation, next)
    case Budget{} Ack{}: issue(invocation, next, Start{}, StartRequest{})
    case Start{} Flag{accepted}: started(accepted, invocation, next)
    case Started{} Ack{}: issue(invocation, next, AbortedRead{}, ReadAborted{})
    case AbortedRead{} Flag{value}: aborted(value, invocation, next)
    case Interrupt{} Flag{accepted}: interrupted(accepted, invocation, next)
    case Interrupted{} Ack{}: Dispatched{}
    case _ _: Rejected{}

def correlated(valid: Bool, phase: Phase, response: Response, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: advance(phase, response, invocation, next)
    case False{}: Rejected{}

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Await{+invocation, +id, phase, Request{owner, request, _}} Reply{
      actual,
      received,
      response
    }:
      correlated(Bool.and(Nat.is_eq(invocation, owner), Bool.and(Nat.is_eq(id, request),
        Bool.and(Nat.is_eq(invocation, actual), Nat.is_eq(id, received)))), phase, response,
        invocation, Nat.add(id, 1n))
    case _ _: Rejected{}
