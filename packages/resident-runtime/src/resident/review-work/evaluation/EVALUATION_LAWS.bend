import Base
import ./Evaluation.bend as E
import ./EvaluationSpecification.bend as S
import ./Authorization.bend as A
import ./AuthorizationSpecification.bend as AS
import ./Dispatch.bend as D
import ./DispatchSpecification.bend as DS

# PROPOSED; not owner-approved, not proved. One whole public protocol contract.
# The withdrawn seven helper laws are not revived. Every typed input, cursor,
# reply, context, command, signal, continuation and terminal is covered by these
# public equations; the independent specifications call no production decision
# helpers. Initial/one-step equality covers every finite correlated reply tape,
# not eventual response/termination of a native provider.
# W.failure_disposition is explicitly shared classification, not proved here.
# Native facts, IO, original Causes and physical drain are consumer obligations.
# Maintain with this public API. When replaced, transfer current guarantees and
# delete obsolete equations/specifications/proofs; do not preserve TS shims.

law evaluation_protocol_exact:
  for +input: E.Input
  for +invocation: Nat
  for +step: E.Step
  for +reply: E.Reply
  for +authorization: A.Step
  for +authorization_reply: A.Reply
  for +dispatch: D.Step
  for +dispatch_reply: D.Reply
  { E.initial(input, invocation) == S.initial(input, invocation) : E.Step }
  & { E.cleanup_initial(invocation) == S.cleanup_initial(invocation) : E.Step }
  & { E.resume(step, reply) == S.resume(step, reply) : E.Step }
  & { A.initial(invocation) == AS.initial(invocation) : A.Step }
  & {
    A.resume(authorization, authorization_reply)
    == AS.resume(authorization, authorization_reply)
    : A.Step
  }
  & { D.initial(invocation) == DS.initial(invocation) : D.Step }
  & { D.interruption_initial(invocation) == DS.interruption_initial(invocation) : D.Step }
  & { D.resume(dispatch, dispatch_reply) == DS.resume(dispatch, dispatch_reply) : D.Step }
