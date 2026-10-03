import Base
import ../OutputScenario.bend as Output
import ../OutputCompletion.bend as Completion
import ../Callbacks.bend as Callbacks
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as C
import ./minimal-scenario.bend as Minimal

# Original authorized receipt and immutable capture. Exact control mismatch
# examples are syntax/fact replacement, not the central actual queued gate.
def capture() -> Output.Capture:
  Output.Capture{Output.Individual{7n,9n},10n,Output.Certain{},5n,10n}
def target(order: Nat) -> Callbacks.Target:
  Callbacks.Target{Callbacks.Owner{1n,2n,3n,4n},Callbacks.OutputTerminal{7n,9n},order}
def original() -> Callbacks.Fact:
  Callbacks.Fact{target(17n),15n,Output.action(C.SubmissionTerminal{7n,9n,True{}},5n),Some{capture()}}
def boolean(value: Bool) -> Nat:
  match value:
    case True{}: 1n
    case False{}: 0n

def event_words(event: C.CanonicalEvent) -> List<&2,Nat>:
  match event:
    case C.SubmissionTerminal{advice,token,certain}: [1n,advice,token,boolean(certain)]
    case C.SubmissionExpiryCheck{advice,token,elapsed,lease}: [2n,advice,token,elapsed,lease]
    case C.FinishTerminal{group,round,attempt,token,selected,C.Unknown{}}:
      List.append(&2,Nat,[3n,group,round,attempt,token],selected)
    case _: [99n]

def action_words(action: Maybe<&2,Driver.Action>) -> List<&2,Nat>:
  match action:
    case Some{Driver.Action{event,delay,_,_,_}}: delay <> event_words(event)
    case None{}: [0n]

def row(fact: Maybe<&2,Callbacks.Fact>) -> List<&2,Nat>:
  match fact:
    case Some{Callbacks.Fact{Callbacks.Target{Callbacks.Owner{p,l,r,o},_,order},at,action,_}}:
      List.append(&2,Nat,[p,l,r,o,order,at],action_words(Some{action}))
    case None{}: [0n]

def finish_capture() -> Output.Capture:
  Output.Capture{Output.Finish{1n,3n,5n,9n,[7n,11n]},10n,Output.Certain{},5n,10n}
def finish_action() -> Driver.Action:
  Output.action(C.FinishTerminal{1n,3n,5n,9n,[7n,11n],C.Acknowledged{}},5n)

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_rows([
    row(Completion.replace(original(),capture(),target(17n),Output.Certain{},Completion.EnvironmentCompletion{})),
    row(Completion.replace(original(),capture(),target(17n),Output.Uncertain{},Completion.EnvironmentCompletion{})),
    row(Completion.replace(original(),capture(),target(17n),Output.Failed{},Completion.EnvironmentCompletion{})),
    row(Completion.replace(original(),capture(),target(18n),Output.Certain{},Completion.EnvironmentCompletion{})),
    row(Completion.replace(original(),capture(),Callbacks.Target{Callbacks.Owner{1n,99n,3n,4n},Callbacks.OutputTerminal{7n,9n},17n},Output.Certain{},Completion.EnvironmentCompletion{})),
    row(Completion.replace(original(),capture(),Callbacks.Target{Callbacks.Owner{1n,2n,3n,4n},Callbacks.OutputTerminal{7n,99n},17n},Output.Certain{},Completion.EnvironmentCompletion{})),
    action_words(Completion.rewrite(capture(),Output.action(C.SubmissionTerminal{7n,9n,True{}},5n),Output.Certain{},19n,Completion.EnvironmentCompletion{})),
    action_words(Completion.rewrite(capture(),Output.action(C.SubmissionTerminal{7n,9n,True{}},5n),Output.Certain{},20n,Completion.EnvironmentCompletion{})),
    action_words(Completion.rewrite(capture(),Output.action(C.SubmissionTerminal{7n,9n,True{}},5n),Output.Certain{},21n,Completion.EnvironmentCompletion{})),
    action_words(Completion.rewrite(finish_capture(),finish_action(),Output.Failed{},15n,Completion.EnvironmentCompletion{})),
    action_words(Completion.rewrite(finish_capture(),Output.action(C.FinishTerminal{1n,3n,5n,9n,[11n,7n],C.Acknowledged{}},5n),Output.Uncertain{},15n,Completion.EnvironmentCompletion{})),
    action_words(Completion.rewrite(capture(),Output.action(C.DeliveryAcknowledgeCheck{1n,True{}},11n),Output.Certain{},21n,Completion.EnvironmentCompletion{})),
    action_words(Completion.rewrite(capture(),Output.action(C.SubmissionTerminal{7n,9n,False{}},0n),Output.Certain{},21n,Completion.CanonicalFeedback{})),
    action_words(Completion.deliver(capture(),Output.action(C.SubmissionTerminal{7n,9n,False{}},0n),Output.Certain{},21n,Completion.CanonicalFeedback{}))])))
