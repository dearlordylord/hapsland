import Base
import ./Flow.bend as Flow

def advance(result: Flow.Step, event: Flow.FlowEvent) -> Flow.Step:
  match result:
    case Flow.Accepted{state, _, _}:
      Flow.step(state, event, None{})
    case Flow.Rejected{state, reason}:
      Flow.Rejected{state, reason}

def finding_then_finish() -> Flow.Step:
  a = Flow.step(Flow.initial(), Flow.EditObserved{}, None{})
  b = advance(a, Flow.ReviewUnitPrepared{})
  c = advance(b, Flow.JevFindingReceived{})
  advance(c, Flow.StopHookFired{})

def clear_then_finish() -> Flow.Step:
  a = Flow.step(Flow.initial(), Flow.EditObserved{}, None{})
  b = advance(a, Flow.ReviewUnitPrepared{})
  c = advance(b, Flow.JevClearReceived{})
  advance(c, Flow.StopHookFired{})

def pending_then_deadline() -> Flow.Step:
  a = Flow.step(Flow.initial(), Flow.EditObserved{}, None{})
  b = advance(a, Flow.ReviewUnitPrepared{})
  c = advance(b, Flow.StopHookFired{})
  advance(c, Flow.FinishDecisionDeadlineReached{})

def main() -> Flow.Step & Flow.Step & Flow.Step:
  (finding_then_finish(), clear_then_finish(), pending_then_deadline())
