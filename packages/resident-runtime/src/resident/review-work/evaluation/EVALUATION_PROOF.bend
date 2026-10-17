import Base
import ./EVALUATION_LAWS.bend as Laws
import ./EvaluationProof.bend as E
import ./AuthorizationProof.bend as A
import ./DispatchProof.bend as D

# Complete owner-approved evaluation_protocol_exact, including all three cursor
# families. Existing independent specifications choose commands/state/terminals.
# Native facts/IO/drain, shared Work classification and Canonical lifecycle are
# outside this law; those retain their own owners and checks.
# Maintain with these APIs; transfer guarantees and delete on replacement.

def Laws.evaluation_protocol_exact(input, invocation, step, reply, authorization,
  authorization_reply, dispatch, dispatch_reply):
  (
    E.initial_exact(input, invocation),
    (
      E.cleanup_initial_exact(invocation),
      (
        E.resume_exact(step, reply),
        (
          A.initial_exact(invocation),
          (
            A.resume_exact(authorization, authorization_reply),
            (
              D.initial_exact(invocation),
              (D.interruption_initial_exact(invocation), D.resume_exact(dispatch, dispatch_reply))
            )
          )
        )
      )
    )
  )

def main() -> Unit:
  Unit{}
