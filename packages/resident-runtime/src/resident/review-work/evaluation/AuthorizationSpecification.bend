import Base
import ./Authorization.bend as A

# Draft whole evaluation protocol specification, not an approved contract/proof.
# This complete authorization relation uses existing types and independently
# specifies every command, continuation and terminal. No production transition
# helper is called. Canonical request decisions and native facts remain inputs;
# this relation cannot manufacture credentials, request authority or IO facts.
# Maintain with the public cursor API; transfer guarantees/delete obsolete
# equations/specification/proofs when that API is replaced.

def request(+invocation: Nat, +id: Nat, phase: A.Phase, command: A.Command) -> A.Step:
  A.Await{invocation, id, phase, A.Request{invocation, id, command}}

def initial(invocation: Nat) -> A.Step:
  request(invocation, 0n, A.Analytics{}, A.ReadEffectiveAnalytics{})

def transition(phase: A.Phase, response: A.Response, invocation: Nat, next: Nat) -> A.Step:
  match phase response:
    case _ A.Failed{token}: A.Aborted{token}
    case A.Analytics{} A.Ack{}:
      request(invocation, next, A.Controlled{}, A.ValidateControlled{})
    case A.Controlled{} A.Flag{True{}}:
      request(invocation, next, A.Required{}, A.ReadCredentialRequired{})
    case A.Controlled{} A.Flag{False{}}:
      request(invocation, next, A.Denied{A.Lost{}}, A.DenyRequest{})
    case A.Required{} A.Flag{+required}:
      request(invocation, next, A.Shape{required}, A.CheckCredentialShape{required})
    case A.Shape{required} A.Flag{True{}}:
      request(invocation, next, A.InitialRoot{required}, A.VerifyInitialRoot{})
    case A.Shape{_} A.Flag{False{}}:
      request(invocation, next, A.Denied{A.Credential{}}, A.DenyRequest{})
    case A.InitialRoot{required} A.Flag{True{}}:
      request(invocation, next, A.Authorized{required}, A.AuthorizationBarrier{})
    case A.InitialRoot{_} A.Flag{False{}}:
      request(invocation, next, A.Denied{A.Lost{}}, A.DenyRequest{})
    case A.Authorized{+required} A.Ack{}:
      request(invocation, next, A.Resolve{required}, A.ResolveCredential{required})
    case A.Resolve{False{}} A.Resolved{_}:
      request(invocation, next, A.GenerationBefore{False{}}, A.CheckCredentialGeneration{})
    case A.Resolve{True{}} A.Resolved{True{}}:
      request(invocation, next, A.GenerationBefore{True{}}, A.CheckCredentialGeneration{})
    case A.Resolve{True{}} A.Resolved{False{}}:
      request(invocation, next, A.Denied{A.Credential{}}, A.DenyRequest{})
    case A.GenerationBefore{required} A.Flag{True{}}:
      request(invocation, next, A.CredentialBoundary{required}, A.CredentialBarrier{})
    case A.GenerationBefore{_} A.Flag{False{}}:
      request(invocation, next, A.Denied{A.Credential{}}, A.DenyRequest{})
    case A.CredentialBoundary{required} A.Ack{}:
      request(invocation, next, A.GenerationAfter{required}, A.CheckCredentialGeneration{})
    case A.GenerationAfter{required} A.Flag{True{}}:
      request(invocation, next, A.Name{}, A.CheckCredentialName{required})
    case A.GenerationAfter{_} A.Flag{False{}}:
      request(invocation, next, A.Denied{A.Credential{}}, A.DenyRequest{})
    case A.Name{} A.Flag{True{}}:
      request(invocation, next, A.Provider{True{}}, A.CheckProviderIdentity{})
    case A.Name{} A.Flag{False{}}:
      request(invocation, next, A.Denied{A.Credential{}}, A.DenyRequest{})
    case A.Provider{ready} A.Flag{True{}}:
      request(invocation, next, A.DispatchRoot{ready}, A.VerifyDispatchRoot{})
    case A.Provider{_} A.Flag{False{}}:
      request(invocation, next, A.Denied{A.Lost{}}, A.DenyRequest{})
    case A.DispatchRoot{+ready} A.Flag{True{}}:
      request(invocation, next, A.Admission{ready}, A.ReadFileAdmission{ready})
    case A.DispatchRoot{_} A.Flag{False{}}:
      request(invocation, next, A.RootRefusal{}, A.ObserveRootRefusal{})
    case A.RootRefusal{} A.Ack{}:
      request(invocation, next, A.Denied{A.Lost{}}, A.DenyRequest{})
    case A.Admission{ready} A.FileAdmission{+selected, +admitted}:
      request(invocation, next, A.AdmissionObserved{ready, Bool.and(selected, admitted)},
        A.ObserveFileAdmission{selected, admitted})
    case A.AdmissionObserved{ready, selected} A.Ack{}:
      request(invocation, next, A.Current{ready, selected}, A.ReadCurrentWork{})
    case A.Current{ready, selected} A.Flag{current}:
      request(invocation, next, A.Physical{ready, selected, current}, A.ReadPhysicalAvailable{})
    case A.Physical{ready, selected, current} A.Flag{available}:
      request(
        invocation,
        next,
        A.Requested{},
        A.ReadyRequest{A.Facts{ready, selected, current, available}}
      )
    case A.Requested{} A.RequestDecision{A.Issued{+request_id}}:
      request(invocation, next, A.IssuedObserved{request_id}, A.ObserveIssued{request_id})
    case A.Requested{} A.RequestDecision{A.Unavailable{}}:
      request(invocation, next, A.UnavailableObserved{A.Lost{}}, A.ObserveUnavailable{})
    case A.Requested{} A.RequestDecision{A.Stale{}}: A.NotAuthorized{A.Lost{}}
    case A.Denied{_} A.RequestDecision{A.Issued{_}}: A.Rejected{}
    case A.Denied{reason} A.RequestDecision{A.Unavailable{}}:
      request(invocation, next, A.UnavailableObserved{reason}, A.ObserveUnavailable{})
    case A.Denied{reason} A.RequestDecision{A.Stale{}}: A.NotAuthorized{reason}
    case A.IssuedObserved{request_id} A.Ack{}:
      request(invocation, next, A.Armed{request_id}, A.ArmInterruption{})
    case A.Armed{request_id} A.Ack{}: A.AuthorizedRequest{request_id}
    case A.UnavailableObserved{reason} A.Ack{}: A.NotAuthorized{reason}
    case _ _: A.Rejected{}

def correlated(
  valid: Bool,
  phase: A.Phase,
  response: A.Response,
  invocation: Nat,
  next: Nat
) -> A.Step:
  match valid:
    case False{}: A.Rejected{}
    case True{}: transition(phase, response, invocation, next)

def resume(step: A.Step, reply: A.Reply) -> A.Step:
  match step reply:
    case A.Await{+invocation, +id, phase, A.Request{owner, request_id, _}}
      A.Reply{actual, received, response}:
      correlated(
        Bool.and(Nat.is_eq(invocation, owner), Bool.and(Nat.is_eq(id, request_id),
          Bool.and(Nat.is_eq(invocation, actual), Nat.is_eq(id, received)))),
        phase, response, invocation, Nat.add(id, 1n)
      )
    case _ _: A.Rejected{}

def main() -> Unit:
  Unit{}
