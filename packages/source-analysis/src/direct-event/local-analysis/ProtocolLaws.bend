import Base
import ./Model.bend as M
import ./Core.bend as Core

# Pin both correlation branches independently of the correct-Ack interpreter.
law ack_exact:
  for operation: M.Op
  for +expected: Nat
  for +actual: Nat
  for +remaining: List<&2, M.Op>
  for +next: Core.Deferred
  {Core.resume(Core.Engine{operation, expected, remaining, next}, Core.Ack{actual})
    == Bool.pick(Core.Step, Nat.is_eq(expected, actual),
      Core.schedule(remaining, next, Nat.add(expected, 1n)), Core.InvalidReply{}) : Core.Step}

# Terminal outcomes cannot accept another reply.
law completed_reply_rejected:
  for outcomes: List<&2, M.Outcome>
  for reply: Core.Reply
  {Core.resume(Core.Completed{outcomes}, reply) == Core.InvalidReply{} : Core.Step}

law preflight_completed_reply_rejected:
  for reply: Core.Reply
  {Core.resume(Core.PreflightCompleted{}, reply) == Core.InvalidReply{} : Core.Step}

def main() -> Unit:
  Unit{}
