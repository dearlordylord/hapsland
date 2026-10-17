import Base
import ../Evaluation.bend as E

def discard_existing(values: List<&2, E.Candidate>) -> Maybe<&2, Nat>:
  None{}

def suppress_work_signal(phase: E.Phase) -> E.SignalScope:
  E.NativeSignal{}

def never_sent(receipt: E.Receipt, aborted: Bool, result: E.ProviderResult) -> E.Outcome:
  E.NeverSent{}
