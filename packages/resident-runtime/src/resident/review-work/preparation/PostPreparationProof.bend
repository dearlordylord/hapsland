import Base
import ./PostPreparationLaws.bend as Laws
import ./PostPreparation.bend as Post

# Bind only after the actual emitted finite/physical chronology consumer passes.

def Laws.admission_offer_exact(
  invocation,
  next,
  bound,
  incomplete,
  refused,
  previous,
  outcome,
  rest,
  ready
):
  {==}

def Laws.delivery_offer_exact(
  invocation,
  next,
  bound,
  incomplete,
  refused,
  previous,
  outcome,
  rest,
  accepted
):
  match outcome:
    case Post.Outcome{_, _, _, _}: {==}

def Laws.retained_initial_exact():
  {==}

def Laws.retained_receipt_exact(value):
  {==}

def Laws.retained_receipt_rejects_ack():
  {==}

def Laws.retained_enabled_exact(value):
  {==}

def Laws.retained_enabled_rejects_ack():
  {==}

def Laws.retained_evaluation_exact(value):
  {==}

def Laws.retained_evaluation_rejects_ack():
  {==}

def Laws.retained_base_exact():
  {==}

def Laws.retained_base_rejects_flag(value):
  {==}

def Laws.retained_attachment_exact():
  {==}

def Laws.retained_attachment_rejects_flag(value):
  {==}

def Laws.retained_offer_exact():
  {==}

def Laws.retained_offer_rejects_flag(value):
  {==}

def Laws.retained_complete_exact():
  {==}

def Laws.retained_complete_rejects_flag(value):
  {==}

def Laws.retained_done_refuses(reply):
  {==}

def Laws.retained_rejected_refuses(reply):
  {==}

def Laws.settle_zero_exact(step):
  {==}

def Laws.settle_internal_exact(remaining, state):
  {==}

def Laws.settle_await_exact(remaining, state, request):
  {==}

def Laws.settle_finished_exact(remaining):
  {==}

def Laws.settle_stopped_exact(remaining, reason):
  {==}

def Laws.settle_rejected_exact(remaining):
  {==}

def Laws.initial_settled_exact(invocation, bound, outcomes, incomplete):
  {==}

def Laws.resume_settled_exact(step, reply):
  {==}

def main() -> Unit:
  Unit{}
