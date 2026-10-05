import Base
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/ImportGraph.bend as Graph
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/Dispatch.bend as Dispatch
import ../../agent-flow-bend/CollectionState.bend as Collection

# Read-only test trace labels and formatting, with no execution adapter or policy.
def event_code(event: Canonical.CanonicalEvent) -> Nat:
  match event:
    case Canonical.OpenRound{_, _}: 1n
    case Canonical.AdmitObservation{_, _, _}: 2n
    case Canonical.QueueDispatch{_, _, _, _}: 3n
    case Canonical.StartObservation{_, _, _, _}: 4n
    case Canonical.BeginObservedPreparation{_, _, _, _, _}: 5n
    case Canonical.PreparationCompleted{_, _, _, _, _}: 6n
    case Canonical.CompleteObservation{_, _, _, _}: 7n
    case Canonical.DispatchSettled{_, _, _, _}: 8n
    case Canonical.StartReview{_, _, _, _}: 9n
    case Canonical.JevRequestReady{_, _, _, _, _, _, _, _, _, _}: 10n
    case Canonical.JevRequestInterrupted{_, _, _, _, _}: 25n
    case Canonical.JevRequestStarted{_, _, _, _, _}: 11n
    case Canonical.JevRequestSettled{_, _, _, _, _, _, _}: 12n
    case Canonical.CollectionReady{_, _, _, _, _, _}: 13n
    case Canonical.FinalCandidateCheck{_, _, _, _, _, _}: 14n
    case Canonical.SubmissionSuppressCheck{_, _, _, _}: 15n
    case Canonical.CollectionReserveLease{_, _}: 16n
    case Canonical.SubmissionBegin{_, _, _, _, _, _, _, _}: 17n
    case Canonical.SubmissionTerminal{_, _, _}: 18n
    case Canonical.CollectionLeaseCheck{_, _, _, _, _, _}: 19n
    case Canonical.CollectionReleaseLease{_, _}: 20n
    case Canonical.CollectionRetireAdvice{_}: 22n
    case Canonical.SubmissionForget{_}: 23n
    case Canonical.RetireReview{_, _, _, _}: 24n
    case _: 99n

def event_identity(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.OpenRound{p, l}: [p, l, 0n, 0n, 0n, 0n, 0n]
    case Canonical.AdmitObservation{p, l, r}: [p, l, r, 0n, 0n, 0n, 0n]
    case Canonical.QueueDispatch{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.StartObservation{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.BeginObservedPreparation{p, l, r, o, _}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.PreparationCompleted{p, l, r, o, _}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.CompleteObservation{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.DispatchSettled{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.StartReview{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.JevRequestReady{p, l, r, o, _, _, _, _, _, _}: [p, l, r, o, 0n, 0n, 0n]
    case Canonical.JevRequestInterrupted{p, l, r, o, req}: [p, l, r, o, req, 0n, 0n]
    case Canonical.JevRequestStarted{p, l, r, o, req}: [p, l, r, o, req, 0n, 0n]
    case Canonical.JevRequestSettled{p, l, r, o, req, _, _}: [p, l, r, o, req, 0n, 0n]
    case Canonical.CollectionReady{a, p, l, r, parent, _}: [p, l, r, parent, 0n, a, 0n]
    case Canonical.SubmissionSuppressCheck{a, t, r, _}: [0n, 0n, r, 0n, 0n, a, t]
    case Canonical.CollectionReserveLease{a, t}: [0n, 0n, 0n, 0n, 0n, a, t]
    case Canonical.SubmissionBegin{a, p, r, t, _, _, _, _}: [p, 0n, r, 0n, 0n, a, t]
    case Canonical.SubmissionTerminal{a, t, _}: [0n, 0n, 0n, 0n, 0n, a, t]
    case Canonical.CollectionLeaseCheck{a, t, _, _, _, _}: [0n, 0n, 0n, 0n, 0n, a, t]
    case Canonical.CollectionReleaseLease{a, t}: [0n, 0n, 0n, 0n, 0n, a, t]
    case Canonical.CollectionRetireAdvice{a}: [0n, 0n, 0n, 0n, 0n, a, 0n]
    case Canonical.SubmissionForget{a}: [0n, 0n, 0n, 0n, 0n, a, 0n]
    case Canonical.RetireReview{p, l, r, o}: [p, l, r, o, 0n, 0n, 0n]
    case _: [0n, 0n, 0n, 0n, 0n, 0n, 0n]

def boolean(value: Bool) -> Nat:
  match value:
    case True{}: 1n
    case False{}: 0n

def first(items: List<&2, Nat>) -> Nat:
  match items:
    case Nil{}: 0n
    case head <> _: head

def outcome_code(outcome: Canonical.RequestOutcome) -> Nat:
  match outcome:
    case Canonical.NeverSent{}: 1n
    case Canonical.RequestFinding{}: 2n
    case Canonical.RequestClear{}: 3n
    case Canonical.RequestBackendFailure{}: 4n
    case Canonical.RequestTimeout{}: 5n
    case Canonical.RequestInterrupted{}: 6n

def event_facts(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.FinalCandidateCheck{owner, generation, credential, expired, current, findings}:
      [boolean(owner), boolean(generation), boolean(credential), boolean(expired), boolean(current), boolean(findings)]
    case Canonical.JevRequestReady{_, _, _, _, root, configuration, credential, selected, current, physical}:
      [boolean(root), boolean(configuration), boolean(credential), boolean(selected), boolean(current), boolean(physical)]
    case Canonical.JevRequestSettled{_, _, _, _, _, outcome, current}: [boolean(current), outcome_code(outcome), 0n, 0n, 0n, 0n]
    case Canonical.SubmissionTerminal{_, _, certain}: [boolean(certain), 0n, 0n, 0n, 0n, 0n]
    case Canonical.BeginObservedPreparation{_, _, _, _, bytes}: [bytes, 0n, 0n, 0n, 0n, 0n]
    case Canonical.PreparationCompleted{_, _, _, _, +units}: [List.length(&2, Nat, units), first(units), 0n, 0n, 0n, 0n]
    case Canonical.SubmissionBegin{_, _, _, _, _, authorized, +items, +findings}:
      [boolean(authorized), List.length(&2, Nat, items), first(items), List.length(&2, Nat, findings), first(findings), 0n]
    case Canonical.CollectionLeaseCheck{_, _, expired, retired, acknowledged, failed}:
      [boolean(expired), boolean(retired), boolean(acknowledged), boolean(failed), 0n, 0n]
    case _: [0n, 0n, 0n, 0n, 0n, 0n]

def command_code(command: Canonical.Command) -> Nat:
  match command:
    case Canonical.RoundStarted{_}: 1n
    case Canonical.ObservationAdmitted{_}: 2n
    case Canonical.DispatchStarted{_, _}: 3n
    case Canonical.Prepare{_, _}: 4n
    case Canonical.UnitAdmitted{_, _, _, _, _}: 5n
    case Canonical.JevRequestIssued{_, _, _, _, _}: 6n
    case Canonical.RetainFinding{}: 7n
    case Canonical.CollectionEligible{}: 8n
    case Canonical.RetainCandidate{}: 9n
    case Canonical.SubmissionUnsuppressed{}: 10n
    case Canonical.CollectionLeaseReserved{}: 11n
    case Canonical.SubmissionBegun{}: 12n
    case Canonical.SubmissionRecorded{}: 13n
    case Canonical.ObservationStarted{}: 14n
    case Canonical.PreparationReleased{_, _}: 15n
    case Canonical.ObservationCompleted{}: 16n
    case Canonical.ReviewStarted{}: 17n
    case Canonical.JevInterruptionRecorded{}: 29n
    case Canonical.JevRequestUnavailable{}: 30n
    case Canonical.JevRequestStartRecorded{}: 18n
    case Canonical.JevRequestOutcomeRecorded{_}: 19n
    case Canonical.ReservationReleased{_}: 20n
    case Canonical.CollectionLeaseKept{}: 21n
    case Canonical.CollectionLeaseReleased{}: 22n
    case Canonical.SettleClear{}: 23n
    case Canonical.ReviewRecorded{_}: 24n
    case Canonical.RetireCandidate{}: 25n
    case Canonical.ReleaseCandidate{}: 26n
    case Canonical.CollectionAdviceRetired{}: 27n
    case Canonical.SubmissionForgotten{}: 28n
    case _: 99n

def command_codes(items: List<&2, Canonical.Command>) -> List<&2, Nat>:
  match items:
    case Nil{}: Nil{}
    case head <> tail: command_code(head) <> command_codes(tail)

def graph_code(command: Graph.Command) -> Nat:
  match command:
    case Graph.NoCommand{}: 0n
    case Graph.ResolveEdge{_}: 1n
    case Graph.CheckPath{_}: 2n
    case Graph.ReadSource{_}: 3n
    case Graph.UnitComplete{}: 4n
    case _: 99n

def graph_counts(graph: Graph.Graph) -> List<&2, Nat>:
  match graph:
    case Graph.Graph{_, _, _, files, read, tree, _, _, _, _, _}: [files, read, tree]

def graph_row(+state: Graph.Bounded, command: Graph.Command, now: Nat) -> List<&2, Nat>:
  match state:
    case Graph.Bounded{graph, _}: 21n <> now <> graph_code(command) <> graph_counts(graph)

def usage_counts(usage: Ledger.Usage) -> List<&2, Nat>:
  match usage:
    case Ledger.Usage{items, bytes}: [items, bytes]

def ledger_counts(ledger: Ledger.Ledger) -> List<&2, Nat>:
  match ledger:
    case Ledger.Ledger{_, _, charges}: usage_counts(Ledger.total(charges))

def dispatch_counts(dispatch: Dispatch.State) -> List<&2, Nat>:
  match dispatch:
    case Dispatch.State{_, running, _, _, requests}:
      [List.length(&2, Dispatch.Entry, running), List.length(&2, Dispatch.Request, requests)]

def lease_count(collection: Collection.State) -> List<&2, Nat>:
  match collection:
    case Collection.State{_, leases, _, _, _, _, _}: [List.length(&2, Collection.Lease, leases)]

def canonical_counts(state: Canonical.State) -> List<&2, Nat>:
  match state:
    case Canonical.State{ledger, _, _, _, _, _, dispatch, collection, _}:
      List.append(&2, Nat, ledger_counts(ledger), List.append(&2, Nat, dispatch_counts(dispatch), lease_count(collection)))

def comma(rest: String) -> String:
  match rest:
    case SNil{}: SNil{}
    case SCon{head, tail}: String.append(",", SCon{head, tail})

def show_numbers(items: List<&2, Nat>) -> String:
  match items:
    case Nil{}: ""
    case head <> tail: String.append(Nat.show(head), comma(show_numbers(tail)))

def bracket(text: String) -> String:
  String.append("[", String.append(text, "]"))

def show_rows(rows: List<&2, List<&2, Nat>>) -> String:
  match rows:
    case Nil{}: ""
    case head <> tail: String.append(bracket(show_numbers(head)), comma(show_rows(tail)))
