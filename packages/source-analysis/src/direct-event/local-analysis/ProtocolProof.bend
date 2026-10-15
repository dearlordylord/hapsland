import Base
import ./Model.bend as M
import ./Core.bend as Core
import ./ProtocolLaws.bend as Laws

def acknowledge_exact(
  +same: Bool,
  +remaining: List<&2, M.Op>,
  +next: Core.Deferred,
  +request: Nat
) -> {
  Core.acknowledge(same, remaining, next, request)
  == Bool.pick(
    Core.Step,
    same,
    Core.schedule(remaining, next, Nat.add(request, 1n)),
    Core.InvalidReply{}
  )
  : Core.Step
}:
  match same:
    case False{}: {==}
    case True{}: {==}

def Laws.ack_exact(operation, expected, actual, remaining, next):
  acknowledge_exact(Nat.is_eq(expected, actual), remaining, next, expected)

def Laws.completed_reply_rejected(outcomes, reply):
  {==}

def Laws.preflight_completed_reply_rejected(reply):
  {==}

def main() -> Unit:
  Unit{}
