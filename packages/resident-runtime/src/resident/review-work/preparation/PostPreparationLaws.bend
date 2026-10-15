import Base
import ./PostPreparation.bend as Post

# Draft exact laws for the connected remaining Post capability; review before proof.
# Native primitive effects and mutable resource receipts remain outside this domain.
def reference_fits(outcome: Post.Outcome) -> Bool:
  match outcome:
    case Post.Outcome{_, _, fits, _}: fits

# Pin the actual producer, request charge and continuation, not only a local Boolean.
law admission_offer_exact:
  for +invocation: Nat
  for +next: Nat
  for +bound: Bool
  for +incomplete: Bool
  for +refused: Bool
  for previous: Post.Phase
  for +outcome: Post.Outcome
  for +rest: List<&2, Post.Outcome>
  for +ready: List<&2, Post.Outcome>
  {
    Post.admission_next(Post.State{invocation, next, bound, incomplete, refused, previous},
      outcome <> rest, ready)
    == Post.Await{
      Post.State{invocation, Nat.add(next, 1n), bound, incomplete, refused,
        Post.Admitting{outcome, rest, ready}},
      Post.Request{invocation, next, Post.Offer{outcome, True{}}}
    }
    : Post.Step
  }

# Pin the actual producer, request charge and continuation, not only a local Boolean.
law delivery_offer_exact:
  for +invocation: Nat
  for +next: Nat
  for +bound: Bool
  for +incomplete: Bool
  for +refused: Bool
  for previous: Post.Phase
  for +outcome: Post.Outcome
  for +rest: List<&2, Post.Outcome>
  for +accepted: List<&2, Post.Outcome>
  {
    Post.delivering_next(Post.State{invocation, next, bound, incomplete, refused, previous},
      outcome <> rest, accepted)
    == Post.Await{
      Post.State{invocation, Nat.add(next, 1n), bound, incomplete, refused,
        Post.Delivering{outcome, rest, accepted}},
      Post.Request{invocation, next, Post.Offer{outcome, reference_fits(outcome)}}
    }
    : Post.Step
  }

# One synchronous retained-advice observation cursor, under the existing outer lease.
law retained_initial_exact:
  {Post.retained_observation_initial()
    == Post.RetainedObservationAwait{Post.RetainedReadReceipt{}} : Post.RetainedObservationStep}

law retained_receipt_exact:
  for +value: Bool
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedReadReceipt{}},
      Post.RetainedObservationFlag{value})
    == Bool.pick(Post.RetainedObservationStep, value,
      Post.RetainedObservationAwait{Post.RetainedCheckEnabled{}},
      Post.RetainedObservationAwait{Post.RetainedComplete{}}) : Post.RetainedObservationStep}

law retained_receipt_rejects_ack:
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedReadReceipt{}},
      Post.RetainedObservationAck{})
    == Post.RetainedObservationRejected{} : Post.RetainedObservationStep}

law retained_enabled_exact:
  for +value: Bool
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedCheckEnabled{}},
      Post.RetainedObservationFlag{value})
    == Bool.pick(Post.RetainedObservationStep, value,
      Post.RetainedObservationAwait{Post.RetainedPrepareBase{}},
      Post.RetainedObservationAwait{Post.RetainedComplete{}}) : Post.RetainedObservationStep}

law retained_enabled_rejects_ack:
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedCheckEnabled{}},
      Post.RetainedObservationAck{})
    == Post.RetainedObservationRejected{} : Post.RetainedObservationStep}

law retained_evaluation_exact:
  for +value: Bool
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedReadEvaluation{}},
      Post.RetainedObservationFlag{value})
    == Bool.pick(Post.RetainedObservationStep, value,
      Post.RetainedObservationAwait{Post.RetainedAttachEvaluation{}},
      Post.RetainedObservationAwait{Post.RetainedOffer{}}) : Post.RetainedObservationStep}

law retained_evaluation_rejects_ack:
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedReadEvaluation{}},
      Post.RetainedObservationAck{})
    == Post.RetainedObservationRejected{} : Post.RetainedObservationStep}

law retained_base_exact:
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedPrepareBase{}},
      Post.RetainedObservationAck{})
    == Post.RetainedObservationAwait{Post.RetainedReadEvaluation{}} : Post.RetainedObservationStep}

law retained_base_rejects_flag:
  for +value: Bool
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedPrepareBase{}},
      Post.RetainedObservationFlag{value})
    == Post.RetainedObservationRejected{} : Post.RetainedObservationStep}

law retained_attachment_exact:
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedAttachEvaluation{}},
      Post.RetainedObservationAck{})
    == Post.RetainedObservationAwait{Post.RetainedOffer{}} : Post.RetainedObservationStep}

law retained_attachment_rejects_flag:
  for +value: Bool
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedAttachEvaluation{}},
      Post.RetainedObservationFlag{value})
    == Post.RetainedObservationRejected{} : Post.RetainedObservationStep}

law retained_offer_exact:
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedOffer{}},
      Post.RetainedObservationAck{})
    == Post.RetainedObservationAwait{Post.RetainedComplete{}} : Post.RetainedObservationStep}

law retained_offer_rejects_flag:
  for +value: Bool
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedOffer{}},
      Post.RetainedObservationFlag{value})
    == Post.RetainedObservationRejected{} : Post.RetainedObservationStep}

law retained_complete_exact:
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedComplete{}},
      Post.RetainedObservationAck{})
    == Post.RetainedObservationDone{} : Post.RetainedObservationStep}

law retained_complete_rejects_flag:
  for +value: Bool
  {Post.retained_observation_resume(Post.RetainedObservationAwait{Post.RetainedComplete{}},
      Post.RetainedObservationFlag{value})
    == Post.RetainedObservationRejected{} : Post.RetainedObservationStep}

law retained_done_refuses:
  for reply: Post.RetainedObservationResponse
  {Post.retained_observation_resume(Post.RetainedObservationDone{}, reply)
    == Post.RetainedObservationRejected{} : Post.RetainedObservationStep}

law retained_rejected_refuses:
  for reply: Post.RetainedObservationResponse
  {Post.retained_observation_resume(Post.RetainedObservationRejected{}, reply)
    == Post.RetainedObservationRejected{} : Post.RetainedObservationStep}

# Preserve the original loop's exhaustion-before-settlement rule, including zero.
law settle_zero_exact:
  for step: Post.Step
  {Post.settle(0n, step) == None{} : Maybe<&2, Post.Step>}

law settle_internal_exact:
  for +remaining: Nat
  for +state: Post.State
  {Post.settle(Nat.add(1n, remaining), Post.Internal{state})
    == Post.settle(remaining, Post.advance(state)) : Maybe<&2, Post.Step>}

law settle_await_exact:
  for +remaining: Nat
  for +state: Post.State
  for +request: Post.Request
  {Post.settle(Nat.add(1n, remaining), Post.Await{state, request})
    == Some{Post.Await{state, request}} : Maybe<&2, Post.Step>}

law settle_finished_exact:
  for remaining: Nat
  {Post.settle(Nat.add(1n, remaining), Post.Finished{})
    == Some{Post.Finished{}} : Maybe<&2, Post.Step>}

law settle_stopped_exact:
  for remaining: Nat
  for +reason: Post.Termination
  {Post.settle(Nat.add(1n, remaining), Post.Stopped{reason})
    == Some{Post.Stopped{reason}} : Maybe<&2, Post.Step>}

law settle_rejected_exact:
  for remaining: Nat
  {Post.settle(Nat.add(1n, remaining), Post.Rejected{})
    == Some{Post.Rejected{}} : Maybe<&2, Post.Step>}

# Couple both actual entrypoints to the same unchanged 10000 allowance.
law initial_settled_exact:
  for +invocation: Nat
  for +bound: Bool
  for +outcomes: List<&2, Post.Outcome>
  for +incomplete: Bool
  {Post.initial_settled(invocation, bound, outcomes, incomplete)
    == Post.settle(10000n, Post.initial(invocation, bound, outcomes, incomplete))
    : Maybe<&2, Post.Step>}

law resume_settled_exact:
  for +step: Post.Step
  for +reply: Post.Reply
  {Post.resume_settled(step, reply) == Post.settle(10000n, Post.resume(step, reply))
    : Maybe<&2, Post.Step>}

def main() -> Unit:
  Unit{}
