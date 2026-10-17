import Base

# Evaluation authorization cursor. Credentials, prepared units and canonical
# request identities stay in the invocation's native capability session.
# This is not a second request ledger: ReadyRequest asks the existing Canonical
# request owner, whose issued/unavailable/stale answer remains authoritative.
type Reason is Data:
  Lost{}
  Credential{}
type Facts is Data:
  Facts{credential_ready: Bool, selected: Bool, current_work: Bool, physical_available: Bool}
type Command is Data:
  ReadEffectiveAnalytics{}
  ValidateControlled{}
  ReadCredentialRequired{}
  CheckCredentialShape{required: Bool}
  VerifyInitialRoot{}
  AuthorizationBarrier{}
  ResolveCredential{required: Bool}
  CheckCredentialGeneration{}
  CredentialBarrier{}
  CheckCredentialName{required: Bool}
  CheckProviderIdentity{}
  VerifyDispatchRoot{}
  ObserveRootRefusal{}
  ReadFileAdmission{credential_ready: Bool}
  ObserveFileAdmission{selected: Bool, admitted: Bool}
  ReadCurrentWork{}
  ReadPhysicalAvailable{}
  ReadyRequest{facts: Facts}
  DenyRequest{}
  ObserveIssued{request: Nat}
  ArmInterruption{}
  ObserveUnavailable{}
type Decision is Data:
  Issued{request: Nat}
  Unavailable{}
  Stale{}
type Response is Data:
  Ack{}
  Flag{value: Bool}
  Resolved{present: Bool}
  FileAdmission{selected: Bool, admitted: Bool}
  RequestDecision{decision: Decision}
  Failed{token: Nat}
type Phase is Data:
  Analytics{}
  Controlled{}
  Required{}
  Shape{required: Bool}
  InitialRoot{required: Bool}
  Authorized{required: Bool}
  Resolve{required: Bool}
  GenerationBefore{required: Bool}
  CredentialBoundary{required: Bool}
  GenerationAfter{required: Bool}
  Name{}
  Provider{ready: Bool}
  DispatchRoot{ready: Bool}
  RootRefusal{}
  Admission{ready: Bool}
  AdmissionObserved{ready: Bool, selected: Bool}
  Current{ready: Bool, selected: Bool}
  Physical{ready: Bool, selected: Bool, current: Bool}
  Requested{}
  Denied{reason: Reason}
  IssuedObserved{request: Nat}
  Armed{request: Nat}
  UnavailableObserved{reason: Reason}
type Request is Data:
  Request{invocation: Nat, id: Nat, command: Command}
type Reply is Data:
  Reply{invocation: Nat, id: Nat, response: Response}
type Step is Data:
  Await{invocation: Nat, id: Nat, phase: Phase, request: Request}
  AuthorizedRequest{request: Nat}
  NotAuthorized{reason: Reason}
  Aborted{token: Nat}
  Rejected{}

def issue(+invocation: Nat, +id: Nat, phase: Phase, command: Command) -> Step:
  Await{invocation, id, phase, Request{invocation, id, command}}

def initial(invocation: Nat) -> Step:
  issue(invocation, 0n, Analytics{}, ReadEffectiveAnalytics{})

def deny(reason: Reason, invocation: Nat, next: Nat) -> Step:
  issue(invocation, next, Denied{reason}, DenyRequest{})

def controlled(valid: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, Required{}, ReadCredentialRequired{})
    case False{}: deny(Lost{}, invocation, next)

def shaped(valid: Bool, required: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, InitialRoot{required}, VerifyInitialRoot{})
    case False{}: deny(Credential{}, invocation, next)

def initial_root(valid: Bool, required: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, Authorized{required}, AuthorizationBarrier{})
    case False{}: deny(Lost{}, invocation, next)

def resolved(valid: Bool, required: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, GenerationBefore{required}, CheckCredentialGeneration{})
    case False{}: deny(Credential{}, invocation, next)

def generation_before(valid: Bool, required: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, CredentialBoundary{required}, CredentialBarrier{})
    case False{}: deny(Credential{}, invocation, next)

def generation_after(valid: Bool, required: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, Name{}, CheckCredentialName{required})
    case False{}: deny(Credential{}, invocation, next)

def credential_name(valid: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, Provider{True{}}, CheckProviderIdentity{})
    case False{}: deny(Credential{}, invocation, next)

def provider_identity(valid: Bool, ready: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, DispatchRoot{ready}, VerifyDispatchRoot{})
    case False{}: deny(Lost{}, invocation, next)

def dispatch_root(valid: Bool, +ready: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(invocation, next, Admission{ready}, ReadFileAdmission{ready})
    case False{}: issue(invocation, next, RootRefusal{}, ObserveRootRefusal{})

def denied_decision(decision: Decision, reason: Reason, invocation: Nat, next: Nat) -> Step:
  match decision:
    case Issued{_}: Rejected{}
    case Unavailable{}: issue(invocation, next, UnavailableObserved{reason}, ObserveUnavailable{})
    case Stale{}: NotAuthorized{reason}

def requested(decision: Decision, invocation: Nat, next: Nat) -> Step:
  match decision:
    case Issued{+request}: issue(invocation, next, IssuedObserved{request}, ObserveIssued{request})
    case Unavailable{}: issue(invocation, next, UnavailableObserved{Lost{}}, ObserveUnavailable{})
    case Stale{}: NotAuthorized{Lost{}}

def advance(phase: Phase, response: Response, +invocation: Nat, +next: Nat) -> Step:
  match phase response:
    case _ Failed{token}: Aborted{token}
    case Analytics{} Ack{}: issue(invocation, next, Controlled{}, ValidateControlled{})
    case Controlled{} Flag{valid}: controlled(valid, invocation, next)
    case Required{} Flag{+required}: issue(
      invocation,
      next,
      Shape{required},
      CheckCredentialShape{required}
    )
    case Shape{required} Flag{valid}: shaped(valid, required, invocation, next)
    case InitialRoot{required} Flag{valid}: initial_root(valid, required, invocation, next)
    case Authorized{+required} Ack{}: issue(
      invocation,
      next,
      Resolve{required},
      ResolveCredential{required}
    )
    case Resolve{+required} Resolved{present}: resolved(
      Bool.or(Bool.not(required), present),
      required,
      invocation,
      next
    )
    case GenerationBefore{required} Flag{valid}: generation_before(
      valid,
      required,
      invocation,
      next
    )
    case CredentialBoundary{required} Ack{}: issue(
      invocation,
      next,
      GenerationAfter{required},
      CheckCredentialGeneration{}
    )
    case GenerationAfter{required} Flag{valid}: generation_after(valid, required, invocation, next)
    case Name{} Flag{valid}: credential_name(valid, invocation, next)
    case Provider{ready} Flag{valid}: provider_identity(valid, ready, invocation, next)
    case DispatchRoot{ready} Flag{valid}: dispatch_root(valid, ready, invocation, next)
    case RootRefusal{} Ack{}: deny(Lost{}, invocation, next)
    case Admission{ready} FileAdmission{+selected, +admitted}:
      issue(
        invocation,
        next,
        AdmissionObserved{ready, Bool.and(selected, admitted)},
        ObserveFileAdmission{selected, admitted}
      )
    case AdmissionObserved{ready, selected} Ack{}: issue(
      invocation,
      next,
      Current{ready, selected},
      ReadCurrentWork{}
    )
    case Current{ready, selected} Flag{current}: issue(
      invocation,
      next,
      Physical{ready, selected, current},
      ReadPhysicalAvailable{}
    )
    case Physical{ready, selected, current} Flag{available}:
      issue(invocation, next, Requested{}, ReadyRequest{Facts{ready, selected, current, available}})
    case Requested{} RequestDecision{decision}: requested(decision, invocation, next)
    case Denied{reason} RequestDecision{decision}: denied_decision(
      decision,
      reason,
      invocation,
      next
    )
    case IssuedObserved{+request} Ack{}: issue(invocation, next, Armed{request}, ArmInterruption{})
    case Armed{request} Ack{}: AuthorizedRequest{request}
    case UnavailableObserved{reason} Ack{}: NotAuthorized{reason}
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
