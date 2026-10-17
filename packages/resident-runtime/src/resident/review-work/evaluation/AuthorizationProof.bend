import Base
import ./Authorization.bend as A
import ./AuthorizationSpecification.bend as S

# Supporting proof for the owner-approved whole evaluation_protocol_exact law.
# Exhaustive typed constructors; Nat request IDs, tokens and invocation identities
# remain arbitrary variables. Native facts and Canonical issuance stay external.
# Maintain with the cursor API; transfer guarantees and delete on replacement.

def initial_exact(+invocation: Nat) -> {A.initial(invocation) == S.initial(invocation) : A.Step}:
  {==}

def transition_exact(+phase: A.Phase, +response: A.Response, +invocation: Nat, +next: Nat) -> {
  A.advance(phase, response, invocation, next)
  == S.transition(phase, response, invocation, next)
  : A.Step
}:
  match phase response:
    case A.Analytics{} A.Ack{}: {==}
    case A.Analytics{} A.Flag{True{}}: {==}
    case A.Analytics{} A.Flag{False{}}: {==}
    case A.Analytics{} A.Resolved{True{}}: {==}
    case A.Analytics{} A.Resolved{False{}}: {==}
    case A.Analytics{} A.FileAdmission{True{}, True{}}: {==}
    case A.Analytics{} A.FileAdmission{True{}, False{}}: {==}
    case A.Analytics{} A.FileAdmission{False{}, True{}}: {==}
    case A.Analytics{} A.FileAdmission{False{}, False{}}: {==}
    case A.Analytics{} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Analytics{} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Analytics{} A.RequestDecision{A.Stale{}}: {==}
    case A.Analytics{} A.Failed{r_token}: {==}
    case A.Controlled{} A.Ack{}: {==}
    case A.Controlled{} A.Flag{True{}}: {==}
    case A.Controlled{} A.Flag{False{}}: {==}
    case A.Controlled{} A.Resolved{True{}}: {==}
    case A.Controlled{} A.Resolved{False{}}: {==}
    case A.Controlled{} A.FileAdmission{True{}, True{}}: {==}
    case A.Controlled{} A.FileAdmission{True{}, False{}}: {==}
    case A.Controlled{} A.FileAdmission{False{}, True{}}: {==}
    case A.Controlled{} A.FileAdmission{False{}, False{}}: {==}
    case A.Controlled{} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Controlled{} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Controlled{} A.RequestDecision{A.Stale{}}: {==}
    case A.Controlled{} A.Failed{r_token}: {==}
    case A.Required{} A.Ack{}: {==}
    case A.Required{} A.Flag{True{}}: {==}
    case A.Required{} A.Flag{False{}}: {==}
    case A.Required{} A.Resolved{True{}}: {==}
    case A.Required{} A.Resolved{False{}}: {==}
    case A.Required{} A.FileAdmission{True{}, True{}}: {==}
    case A.Required{} A.FileAdmission{True{}, False{}}: {==}
    case A.Required{} A.FileAdmission{False{}, True{}}: {==}
    case A.Required{} A.FileAdmission{False{}, False{}}: {==}
    case A.Required{} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Required{} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Required{} A.RequestDecision{A.Stale{}}: {==}
    case A.Required{} A.Failed{r_token}: {==}
    case A.Shape{True{}} A.Ack{}: {==}
    case A.Shape{True{}} A.Flag{True{}}: {==}
    case A.Shape{True{}} A.Flag{False{}}: {==}
    case A.Shape{True{}} A.Resolved{True{}}: {==}
    case A.Shape{True{}} A.Resolved{False{}}: {==}
    case A.Shape{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Shape{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Shape{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Shape{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Shape{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Shape{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Shape{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Shape{True{}} A.Failed{r_token}: {==}
    case A.Shape{False{}} A.Ack{}: {==}
    case A.Shape{False{}} A.Flag{True{}}: {==}
    case A.Shape{False{}} A.Flag{False{}}: {==}
    case A.Shape{False{}} A.Resolved{True{}}: {==}
    case A.Shape{False{}} A.Resolved{False{}}: {==}
    case A.Shape{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Shape{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Shape{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Shape{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Shape{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Shape{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Shape{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Shape{False{}} A.Failed{r_token}: {==}
    case A.InitialRoot{True{}} A.Ack{}: {==}
    case A.InitialRoot{True{}} A.Flag{True{}}: {==}
    case A.InitialRoot{True{}} A.Flag{False{}}: {==}
    case A.InitialRoot{True{}} A.Resolved{True{}}: {==}
    case A.InitialRoot{True{}} A.Resolved{False{}}: {==}
    case A.InitialRoot{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.InitialRoot{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.InitialRoot{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.InitialRoot{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.InitialRoot{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.InitialRoot{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.InitialRoot{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.InitialRoot{True{}} A.Failed{r_token}: {==}
    case A.InitialRoot{False{}} A.Ack{}: {==}
    case A.InitialRoot{False{}} A.Flag{True{}}: {==}
    case A.InitialRoot{False{}} A.Flag{False{}}: {==}
    case A.InitialRoot{False{}} A.Resolved{True{}}: {==}
    case A.InitialRoot{False{}} A.Resolved{False{}}: {==}
    case A.InitialRoot{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.InitialRoot{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.InitialRoot{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.InitialRoot{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.InitialRoot{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.InitialRoot{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.InitialRoot{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.InitialRoot{False{}} A.Failed{r_token}: {==}
    case A.Authorized{True{}} A.Ack{}: {==}
    case A.Authorized{True{}} A.Flag{True{}}: {==}
    case A.Authorized{True{}} A.Flag{False{}}: {==}
    case A.Authorized{True{}} A.Resolved{True{}}: {==}
    case A.Authorized{True{}} A.Resolved{False{}}: {==}
    case A.Authorized{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Authorized{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Authorized{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Authorized{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Authorized{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Authorized{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Authorized{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Authorized{True{}} A.Failed{r_token}: {==}
    case A.Authorized{False{}} A.Ack{}: {==}
    case A.Authorized{False{}} A.Flag{True{}}: {==}
    case A.Authorized{False{}} A.Flag{False{}}: {==}
    case A.Authorized{False{}} A.Resolved{True{}}: {==}
    case A.Authorized{False{}} A.Resolved{False{}}: {==}
    case A.Authorized{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Authorized{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Authorized{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Authorized{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Authorized{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Authorized{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Authorized{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Authorized{False{}} A.Failed{r_token}: {==}
    case A.Resolve{True{}} A.Ack{}: {==}
    case A.Resolve{True{}} A.Flag{True{}}: {==}
    case A.Resolve{True{}} A.Flag{False{}}: {==}
    case A.Resolve{True{}} A.Resolved{True{}}: {==}
    case A.Resolve{True{}} A.Resolved{False{}}: {==}
    case A.Resolve{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Resolve{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Resolve{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Resolve{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Resolve{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Resolve{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Resolve{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Resolve{True{}} A.Failed{r_token}: {==}
    case A.Resolve{False{}} A.Ack{}: {==}
    case A.Resolve{False{}} A.Flag{True{}}: {==}
    case A.Resolve{False{}} A.Flag{False{}}: {==}
    case A.Resolve{False{}} A.Resolved{True{}}: {==}
    case A.Resolve{False{}} A.Resolved{False{}}: {==}
    case A.Resolve{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Resolve{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Resolve{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Resolve{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Resolve{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Resolve{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Resolve{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Resolve{False{}} A.Failed{r_token}: {==}
    case A.GenerationBefore{True{}} A.Ack{}: {==}
    case A.GenerationBefore{True{}} A.Flag{True{}}: {==}
    case A.GenerationBefore{True{}} A.Flag{False{}}: {==}
    case A.GenerationBefore{True{}} A.Resolved{True{}}: {==}
    case A.GenerationBefore{True{}} A.Resolved{False{}}: {==}
    case A.GenerationBefore{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.GenerationBefore{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.GenerationBefore{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.GenerationBefore{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.GenerationBefore{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.GenerationBefore{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.GenerationBefore{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.GenerationBefore{True{}} A.Failed{r_token}: {==}
    case A.GenerationBefore{False{}} A.Ack{}: {==}
    case A.GenerationBefore{False{}} A.Flag{True{}}: {==}
    case A.GenerationBefore{False{}} A.Flag{False{}}: {==}
    case A.GenerationBefore{False{}} A.Resolved{True{}}: {==}
    case A.GenerationBefore{False{}} A.Resolved{False{}}: {==}
    case A.GenerationBefore{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.GenerationBefore{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.GenerationBefore{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.GenerationBefore{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.GenerationBefore{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.GenerationBefore{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.GenerationBefore{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.GenerationBefore{False{}} A.Failed{r_token}: {==}
    case A.CredentialBoundary{True{}} A.Ack{}: {==}
    case A.CredentialBoundary{True{}} A.Flag{True{}}: {==}
    case A.CredentialBoundary{True{}} A.Flag{False{}}: {==}
    case A.CredentialBoundary{True{}} A.Resolved{True{}}: {==}
    case A.CredentialBoundary{True{}} A.Resolved{False{}}: {==}
    case A.CredentialBoundary{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.CredentialBoundary{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.CredentialBoundary{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.CredentialBoundary{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.CredentialBoundary{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.CredentialBoundary{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.CredentialBoundary{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.CredentialBoundary{True{}} A.Failed{r_token}: {==}
    case A.CredentialBoundary{False{}} A.Ack{}: {==}
    case A.CredentialBoundary{False{}} A.Flag{True{}}: {==}
    case A.CredentialBoundary{False{}} A.Flag{False{}}: {==}
    case A.CredentialBoundary{False{}} A.Resolved{True{}}: {==}
    case A.CredentialBoundary{False{}} A.Resolved{False{}}: {==}
    case A.CredentialBoundary{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.CredentialBoundary{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.CredentialBoundary{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.CredentialBoundary{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.CredentialBoundary{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.CredentialBoundary{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.CredentialBoundary{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.CredentialBoundary{False{}} A.Failed{r_token}: {==}
    case A.GenerationAfter{True{}} A.Ack{}: {==}
    case A.GenerationAfter{True{}} A.Flag{True{}}: {==}
    case A.GenerationAfter{True{}} A.Flag{False{}}: {==}
    case A.GenerationAfter{True{}} A.Resolved{True{}}: {==}
    case A.GenerationAfter{True{}} A.Resolved{False{}}: {==}
    case A.GenerationAfter{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.GenerationAfter{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.GenerationAfter{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.GenerationAfter{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.GenerationAfter{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.GenerationAfter{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.GenerationAfter{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.GenerationAfter{True{}} A.Failed{r_token}: {==}
    case A.GenerationAfter{False{}} A.Ack{}: {==}
    case A.GenerationAfter{False{}} A.Flag{True{}}: {==}
    case A.GenerationAfter{False{}} A.Flag{False{}}: {==}
    case A.GenerationAfter{False{}} A.Resolved{True{}}: {==}
    case A.GenerationAfter{False{}} A.Resolved{False{}}: {==}
    case A.GenerationAfter{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.GenerationAfter{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.GenerationAfter{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.GenerationAfter{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.GenerationAfter{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.GenerationAfter{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.GenerationAfter{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.GenerationAfter{False{}} A.Failed{r_token}: {==}
    case A.Name{} A.Ack{}: {==}
    case A.Name{} A.Flag{True{}}: {==}
    case A.Name{} A.Flag{False{}}: {==}
    case A.Name{} A.Resolved{True{}}: {==}
    case A.Name{} A.Resolved{False{}}: {==}
    case A.Name{} A.FileAdmission{True{}, True{}}: {==}
    case A.Name{} A.FileAdmission{True{}, False{}}: {==}
    case A.Name{} A.FileAdmission{False{}, True{}}: {==}
    case A.Name{} A.FileAdmission{False{}, False{}}: {==}
    case A.Name{} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Name{} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Name{} A.RequestDecision{A.Stale{}}: {==}
    case A.Name{} A.Failed{r_token}: {==}
    case A.Provider{True{}} A.Ack{}: {==}
    case A.Provider{True{}} A.Flag{True{}}: {==}
    case A.Provider{True{}} A.Flag{False{}}: {==}
    case A.Provider{True{}} A.Resolved{True{}}: {==}
    case A.Provider{True{}} A.Resolved{False{}}: {==}
    case A.Provider{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Provider{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Provider{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Provider{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Provider{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Provider{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Provider{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Provider{True{}} A.Failed{r_token}: {==}
    case A.Provider{False{}} A.Ack{}: {==}
    case A.Provider{False{}} A.Flag{True{}}: {==}
    case A.Provider{False{}} A.Flag{False{}}: {==}
    case A.Provider{False{}} A.Resolved{True{}}: {==}
    case A.Provider{False{}} A.Resolved{False{}}: {==}
    case A.Provider{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Provider{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Provider{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Provider{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Provider{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Provider{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Provider{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Provider{False{}} A.Failed{r_token}: {==}
    case A.DispatchRoot{True{}} A.Ack{}: {==}
    case A.DispatchRoot{True{}} A.Flag{True{}}: {==}
    case A.DispatchRoot{True{}} A.Flag{False{}}: {==}
    case A.DispatchRoot{True{}} A.Resolved{True{}}: {==}
    case A.DispatchRoot{True{}} A.Resolved{False{}}: {==}
    case A.DispatchRoot{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.DispatchRoot{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.DispatchRoot{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.DispatchRoot{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.DispatchRoot{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.DispatchRoot{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.DispatchRoot{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.DispatchRoot{True{}} A.Failed{r_token}: {==}
    case A.DispatchRoot{False{}} A.Ack{}: {==}
    case A.DispatchRoot{False{}} A.Flag{True{}}: {==}
    case A.DispatchRoot{False{}} A.Flag{False{}}: {==}
    case A.DispatchRoot{False{}} A.Resolved{True{}}: {==}
    case A.DispatchRoot{False{}} A.Resolved{False{}}: {==}
    case A.DispatchRoot{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.DispatchRoot{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.DispatchRoot{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.DispatchRoot{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.DispatchRoot{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.DispatchRoot{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.DispatchRoot{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.DispatchRoot{False{}} A.Failed{r_token}: {==}
    case A.RootRefusal{} A.Ack{}: {==}
    case A.RootRefusal{} A.Flag{True{}}: {==}
    case A.RootRefusal{} A.Flag{False{}}: {==}
    case A.RootRefusal{} A.Resolved{True{}}: {==}
    case A.RootRefusal{} A.Resolved{False{}}: {==}
    case A.RootRefusal{} A.FileAdmission{True{}, True{}}: {==}
    case A.RootRefusal{} A.FileAdmission{True{}, False{}}: {==}
    case A.RootRefusal{} A.FileAdmission{False{}, True{}}: {==}
    case A.RootRefusal{} A.FileAdmission{False{}, False{}}: {==}
    case A.RootRefusal{} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.RootRefusal{} A.RequestDecision{A.Unavailable{}}: {==}
    case A.RootRefusal{} A.RequestDecision{A.Stale{}}: {==}
    case A.RootRefusal{} A.Failed{r_token}: {==}
    case A.Admission{True{}} A.Ack{}: {==}
    case A.Admission{True{}} A.Flag{True{}}: {==}
    case A.Admission{True{}} A.Flag{False{}}: {==}
    case A.Admission{True{}} A.Resolved{True{}}: {==}
    case A.Admission{True{}} A.Resolved{False{}}: {==}
    case A.Admission{True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Admission{True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Admission{True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Admission{True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Admission{True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Admission{True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Admission{True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Admission{True{}} A.Failed{r_token}: {==}
    case A.Admission{False{}} A.Ack{}: {==}
    case A.Admission{False{}} A.Flag{True{}}: {==}
    case A.Admission{False{}} A.Flag{False{}}: {==}
    case A.Admission{False{}} A.Resolved{True{}}: {==}
    case A.Admission{False{}} A.Resolved{False{}}: {==}
    case A.Admission{False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Admission{False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Admission{False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Admission{False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Admission{False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Admission{False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Admission{False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Admission{False{}} A.Failed{r_token}: {==}
    case A.AdmissionObserved{True{}, True{}} A.Ack{}: {==}
    case A.AdmissionObserved{True{}, True{}} A.Flag{True{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.Flag{False{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.Resolved{True{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.Resolved{False{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.AdmissionObserved{True{}, True{}} A.Failed{r_token}: {==}
    case A.AdmissionObserved{True{}, False{}} A.Ack{}: {==}
    case A.AdmissionObserved{True{}, False{}} A.Flag{True{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.Flag{False{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.Resolved{True{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.Resolved{False{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.AdmissionObserved{True{}, False{}} A.Failed{r_token}: {==}
    case A.AdmissionObserved{False{}, True{}} A.Ack{}: {==}
    case A.AdmissionObserved{False{}, True{}} A.Flag{True{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.Flag{False{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.Resolved{True{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.Resolved{False{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.AdmissionObserved{False{}, True{}} A.Failed{r_token}: {==}
    case A.AdmissionObserved{False{}, False{}} A.Ack{}: {==}
    case A.AdmissionObserved{False{}, False{}} A.Flag{True{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.Flag{False{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.Resolved{True{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.Resolved{False{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.AdmissionObserved{False{}, False{}} A.Failed{r_token}: {==}
    case A.Current{True{}, True{}} A.Ack{}: {==}
    case A.Current{True{}, True{}} A.Flag{True{}}: {==}
    case A.Current{True{}, True{}} A.Flag{False{}}: {==}
    case A.Current{True{}, True{}} A.Resolved{True{}}: {==}
    case A.Current{True{}, True{}} A.Resolved{False{}}: {==}
    case A.Current{True{}, True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Current{True{}, True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Current{True{}, True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Current{True{}, True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Current{True{}, True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Current{True{}, True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Current{True{}, True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Current{True{}, True{}} A.Failed{r_token}: {==}
    case A.Current{True{}, False{}} A.Ack{}: {==}
    case A.Current{True{}, False{}} A.Flag{True{}}: {==}
    case A.Current{True{}, False{}} A.Flag{False{}}: {==}
    case A.Current{True{}, False{}} A.Resolved{True{}}: {==}
    case A.Current{True{}, False{}} A.Resolved{False{}}: {==}
    case A.Current{True{}, False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Current{True{}, False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Current{True{}, False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Current{True{}, False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Current{True{}, False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Current{True{}, False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Current{True{}, False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Current{True{}, False{}} A.Failed{r_token}: {==}
    case A.Current{False{}, True{}} A.Ack{}: {==}
    case A.Current{False{}, True{}} A.Flag{True{}}: {==}
    case A.Current{False{}, True{}} A.Flag{False{}}: {==}
    case A.Current{False{}, True{}} A.Resolved{True{}}: {==}
    case A.Current{False{}, True{}} A.Resolved{False{}}: {==}
    case A.Current{False{}, True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Current{False{}, True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Current{False{}, True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Current{False{}, True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Current{False{}, True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Current{False{}, True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Current{False{}, True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Current{False{}, True{}} A.Failed{r_token}: {==}
    case A.Current{False{}, False{}} A.Ack{}: {==}
    case A.Current{False{}, False{}} A.Flag{True{}}: {==}
    case A.Current{False{}, False{}} A.Flag{False{}}: {==}
    case A.Current{False{}, False{}} A.Resolved{True{}}: {==}
    case A.Current{False{}, False{}} A.Resolved{False{}}: {==}
    case A.Current{False{}, False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Current{False{}, False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Current{False{}, False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Current{False{}, False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Current{False{}, False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Current{False{}, False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Current{False{}, False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Current{False{}, False{}} A.Failed{r_token}: {==}
    case A.Physical{True{}, True{}, True{}} A.Ack{}: {==}
    case A.Physical{True{}, True{}, True{}} A.Flag{True{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.Flag{False{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.Resolved{True{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.Resolved{False{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Physical{True{}, True{}, True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Physical{True{}, True{}, True{}} A.Failed{r_token}: {==}
    case A.Physical{True{}, True{}, False{}} A.Ack{}: {==}
    case A.Physical{True{}, True{}, False{}} A.Flag{True{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.Flag{False{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.Resolved{True{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.Resolved{False{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Physical{True{}, True{}, False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Physical{True{}, True{}, False{}} A.Failed{r_token}: {==}
    case A.Physical{True{}, False{}, True{}} A.Ack{}: {==}
    case A.Physical{True{}, False{}, True{}} A.Flag{True{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.Flag{False{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.Resolved{True{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.Resolved{False{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Physical{True{}, False{}, True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Physical{True{}, False{}, True{}} A.Failed{r_token}: {==}
    case A.Physical{True{}, False{}, False{}} A.Ack{}: {==}
    case A.Physical{True{}, False{}, False{}} A.Flag{True{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.Flag{False{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.Resolved{True{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.Resolved{False{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Physical{True{}, False{}, False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Physical{True{}, False{}, False{}} A.Failed{r_token}: {==}
    case A.Physical{False{}, True{}, True{}} A.Ack{}: {==}
    case A.Physical{False{}, True{}, True{}} A.Flag{True{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.Flag{False{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.Resolved{True{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.Resolved{False{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Physical{False{}, True{}, True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Physical{False{}, True{}, True{}} A.Failed{r_token}: {==}
    case A.Physical{False{}, True{}, False{}} A.Ack{}: {==}
    case A.Physical{False{}, True{}, False{}} A.Flag{True{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.Flag{False{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.Resolved{True{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.Resolved{False{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Physical{False{}, True{}, False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Physical{False{}, True{}, False{}} A.Failed{r_token}: {==}
    case A.Physical{False{}, False{}, True{}} A.Ack{}: {==}
    case A.Physical{False{}, False{}, True{}} A.Flag{True{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.Flag{False{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.Resolved{True{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.Resolved{False{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Physical{False{}, False{}, True{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Physical{False{}, False{}, True{}} A.Failed{r_token}: {==}
    case A.Physical{False{}, False{}, False{}} A.Ack{}: {==}
    case A.Physical{False{}, False{}, False{}} A.Flag{True{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.Flag{False{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.Resolved{True{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.Resolved{False{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Physical{False{}, False{}, False{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Physical{False{}, False{}, False{}} A.Failed{r_token}: {==}
    case A.Requested{} A.Ack{}: {==}
    case A.Requested{} A.Flag{True{}}: {==}
    case A.Requested{} A.Flag{False{}}: {==}
    case A.Requested{} A.Resolved{True{}}: {==}
    case A.Requested{} A.Resolved{False{}}: {==}
    case A.Requested{} A.FileAdmission{True{}, True{}}: {==}
    case A.Requested{} A.FileAdmission{True{}, False{}}: {==}
    case A.Requested{} A.FileAdmission{False{}, True{}}: {==}
    case A.Requested{} A.FileAdmission{False{}, False{}}: {==}
    case A.Requested{} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Requested{} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Requested{} A.RequestDecision{A.Stale{}}: {==}
    case A.Requested{} A.Failed{r_token}: {==}
    case A.Denied{A.Lost{}} A.Ack{}: {==}
    case A.Denied{A.Lost{}} A.Flag{True{}}: {==}
    case A.Denied{A.Lost{}} A.Flag{False{}}: {==}
    case A.Denied{A.Lost{}} A.Resolved{True{}}: {==}
    case A.Denied{A.Lost{}} A.Resolved{False{}}: {==}
    case A.Denied{A.Lost{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Denied{A.Lost{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Denied{A.Lost{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Denied{A.Lost{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Denied{A.Lost{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Denied{A.Lost{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Denied{A.Lost{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Denied{A.Lost{}} A.Failed{r_token}: {==}
    case A.Denied{A.Credential{}} A.Ack{}: {==}
    case A.Denied{A.Credential{}} A.Flag{True{}}: {==}
    case A.Denied{A.Credential{}} A.Flag{False{}}: {==}
    case A.Denied{A.Credential{}} A.Resolved{True{}}: {==}
    case A.Denied{A.Credential{}} A.Resolved{False{}}: {==}
    case A.Denied{A.Credential{}} A.FileAdmission{True{}, True{}}: {==}
    case A.Denied{A.Credential{}} A.FileAdmission{True{}, False{}}: {==}
    case A.Denied{A.Credential{}} A.FileAdmission{False{}, True{}}: {==}
    case A.Denied{A.Credential{}} A.FileAdmission{False{}, False{}}: {==}
    case A.Denied{A.Credential{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Denied{A.Credential{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Denied{A.Credential{}} A.RequestDecision{A.Stale{}}: {==}
    case A.Denied{A.Credential{}} A.Failed{r_token}: {==}
    case A.IssuedObserved{p_request} A.Ack{}: {==}
    case A.IssuedObserved{p_request} A.Flag{True{}}: {==}
    case A.IssuedObserved{p_request} A.Flag{False{}}: {==}
    case A.IssuedObserved{p_request} A.Resolved{True{}}: {==}
    case A.IssuedObserved{p_request} A.Resolved{False{}}: {==}
    case A.IssuedObserved{p_request} A.FileAdmission{True{}, True{}}: {==}
    case A.IssuedObserved{p_request} A.FileAdmission{True{}, False{}}: {==}
    case A.IssuedObserved{p_request} A.FileAdmission{False{}, True{}}: {==}
    case A.IssuedObserved{p_request} A.FileAdmission{False{}, False{}}: {==}
    case A.IssuedObserved{p_request} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.IssuedObserved{p_request} A.RequestDecision{A.Unavailable{}}: {==}
    case A.IssuedObserved{p_request} A.RequestDecision{A.Stale{}}: {==}
    case A.IssuedObserved{p_request} A.Failed{r_token}: {==}
    case A.Armed{p_request} A.Ack{}: {==}
    case A.Armed{p_request} A.Flag{True{}}: {==}
    case A.Armed{p_request} A.Flag{False{}}: {==}
    case A.Armed{p_request} A.Resolved{True{}}: {==}
    case A.Armed{p_request} A.Resolved{False{}}: {==}
    case A.Armed{p_request} A.FileAdmission{True{}, True{}}: {==}
    case A.Armed{p_request} A.FileAdmission{True{}, False{}}: {==}
    case A.Armed{p_request} A.FileAdmission{False{}, True{}}: {==}
    case A.Armed{p_request} A.FileAdmission{False{}, False{}}: {==}
    case A.Armed{p_request} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.Armed{p_request} A.RequestDecision{A.Unavailable{}}: {==}
    case A.Armed{p_request} A.RequestDecision{A.Stale{}}: {==}
    case A.Armed{p_request} A.Failed{r_token}: {==}
    case A.UnavailableObserved{A.Lost{}} A.Ack{}: {==}
    case A.UnavailableObserved{A.Lost{}} A.Flag{True{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.Flag{False{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.Resolved{True{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.Resolved{False{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.FileAdmission{True{}, True{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.FileAdmission{True{}, False{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.FileAdmission{False{}, True{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.FileAdmission{False{}, False{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.RequestDecision{A.Stale{}}: {==}
    case A.UnavailableObserved{A.Lost{}} A.Failed{r_token}: {==}
    case A.UnavailableObserved{A.Credential{}} A.Ack{}: {==}
    case A.UnavailableObserved{A.Credential{}} A.Flag{True{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.Flag{False{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.Resolved{True{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.Resolved{False{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.FileAdmission{True{}, True{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.FileAdmission{True{}, False{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.FileAdmission{False{}, True{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.FileAdmission{False{}, False{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.RequestDecision{A.Issued{r_decision_request}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.RequestDecision{A.Unavailable{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.RequestDecision{A.Stale{}}: {==}
    case A.UnavailableObserved{A.Credential{}} A.Failed{r_token}: {==}

def correlated_exact(
  +valid: Bool,
  +phase: A.Phase,
  +response: A.Response,
  +invocation: Nat,
  +next: Nat
) -> {
  A.correlated(valid, phase, response, invocation, next)
  == S.correlated(valid, phase, response, invocation, next)
  : A.Step
}:
  match valid:
    case False{}: {==}
    case True{}: transition_exact(phase, response, invocation, next)

def resume_exact(+step: A.Step, +reply: A.Reply) -> {
  A.resume(step, reply) == S.resume(step, reply) : A.Step
}:
  match step reply:
    case A.Await{+invocation, +id, phase, A.Request{owner, request, _}} A.Reply{
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
    case A.AuthorizedRequest{_} _: {==}
    case A.NotAuthorized{_} _: {==}
    case A.Aborted{_} _: {==}
    case A.Rejected{} _: {==}

def main() -> Unit:
  Unit{}
