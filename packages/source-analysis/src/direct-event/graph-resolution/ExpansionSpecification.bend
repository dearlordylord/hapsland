import Base
import ./Types.bend as T
import ./WholeObservation.bend as O
import ./ForestSpecification.bend as F
import ./SignedLocalSpecification.bend as Signed
import ./SPEC.bend as Root
import ./GraphSpecification.bend as Policy
import ./traversal/core.bend as Local
import ./traversal/SPEC.bend as Recursive
import ../../../../agent-flow-bend/ImportGraph.bend as G

# Independent expansion transaction. EncodeProduct is a mechanical measurement
# of the exact semantic unit, not a policy supplied by the environment.
# The enclosing command/service driver and whole observer remain to be connected.
type Edge is Data:
  Edge{id: Nat, pending: F.Pending, source: T.SourceFacts, catalog: Root.Source}
type Captured is Data:
  Captured{path: String, source: T.SourceFacts, bytes: Nat}
type TargetArtifact is Data:
  TargetArtifact{target: Nat, identity: String}
type Frame is Data:
  Frame{graph: G.Bounded, command: G.Command, forest: F.Forest,
    local: Signed.State, pending: List<&2, Edge>, captured: List<&2, Captured>,
    identities: List<&2, TargetArtifact>, next_edge: Nat, next_episode: Nat,
    next_artifact: Nat, dependencies: List<&2, String>}
type ChildKind is Data:
  FileChild{path: String}
  BundledChild{}
type Attempt is Data:
  Attempt{target: Nat, edge: Edge, kind: ChildKind, source: T.SourceFacts,
    bytes: Nat, name: String, expected: Local.ExpectedKind, declaration: Local.Declaration,
    catalog: Root.Source, local_work_before: Nat}
type Child is Data:
  Child{attempt: Attempt, created: F.Created, tentative: Signed.State,
    pending: List<&2, F.Pending>}
type Transaction is Data:
  MeasureBefore{frame: Frame, attempt: Attempt}
  BuildChild{frame: Frame, attempt: Attempt, previous: Maybe<&2, Nat>}
  MeasureFileBefore{frame: Frame, child: Child}
  MeasureAfter{frame: Frame, child: Child, previous: Nat}
  TransactionFinished{frame: Frame}
  TransactionExhausted{frame: Frame}
  TransactionInvalid{frame: Frame}
  TransactionFailed{frame: Frame, failure: T.TechnicalFailure}
type Selection is Data:
  Continue{transaction: Transaction}
  Request{transaction: Transaction, operation: T.Operation}

# Budget mutations survive refusal; visited identities remain tentative.
type Registration is Data:
  Registration{edges: List<&2, Edge>, ids: List<&2, Nat>, next: Nat}

def budget_work(+budget: Local.Budget) -> Nat:
  match budget:
    case Local.Budget{_, _, _, work, _, _}: work

def local_work(+state: Signed.State) -> Nat:
  budget_work(Recursive.state_budget(Signed.local(state)))

def graph_work(+graph: G.Bounded) -> Nat:
  match graph:
    case G.Bounded{G.Graph{_, _, _, _, _, _, work, _, _, _, _}, _}: work

def signed_difference(+nonnegative: Bool, +left: Nat, +right: Nat) -> O.SignedNat:
  match nonnegative:
    case True{}: O.Nonnegative{Nat.sub(left, right)}
    case False{}: O.Negative{Nat.sub(right, left)}

def difference(+left: Nat, +right: Nat) -> O.SignedNat:
  signed_difference(Nat.is_le(right, left), left, right)

def retained_local(
  +old: Recursive.State,
  +next: Recursive.State,
  +tentative: Signed.State
) -> Signed.State:
  match old next tentative:
    case Recursive.State{visited, _, address, pending}
      Recursive.State{_, budget, _, _} Signed.State{_, signed}:
      Signed.State{Recursive.State{visited, budget, address, pending}, signed}

def retain_budget(+old: Signed.State, +tentative: Signed.State) -> Signed.State:
  retained_local(Signed.local(old), Signed.local(tentative), tentative)

def with_local(+frame: Frame, +state: Signed.State) -> Frame:
  match frame:
    case Frame{graph, command, forest, _, pending, captured, identities,
      edge, episode, artifact, dependencies}:
      Frame{graph, command, forest, state, pending, captured, identities,
        edge, episode, artifact, dependencies}

def event_result(+frame: Frame, +step: G.BoundedStep) -> Frame:
  match frame step:
    case Frame{_, _, forest, local, pending, captured, identities,
      edge, episode, artifact, dependencies} G.BoundedStep{graph, command}:
      Frame{graph, command, forest, local, pending, captured, identities,
        edge, episode, artifact, dependencies}

def frame_graph(+frame: Frame) -> G.Bounded:
  match frame:
    case Frame{graph, _, _, _, _, _, _, _, _, _, _}: graph

def event(+frame: Frame, +event: G.GraphEvent) -> Frame:
  event_result(frame, Policy.bounded_transition(frame_graph(frame), event))

def frame_local(+frame: Frame) -> Signed.State:
  match frame:
    case Frame{_, _, _, local, _, _, _, _, _, _, _}: local

def captured_event(+frame: Frame, +bytes: Nat, +contribution: Nat,
    +before: Nat, +edges: List<&2, Nat>) -> Frame:
  event(frame, G.Captured{bytes, contribution,
    Nat.sub(local_work(frame_local(frame)), before), edges})

def budget_allowed(+budget: Local.Budget, +work_only: Bool) -> Bool:
  match budget work_only:
        case Local.Budget{limits, _, maximum, work, graph, depth} False{}:
          Recursive.within_limits(limits, work, graph, depth, maximum)
        case Local.Budget{limits, _, _, work, graph, _} True{}:
          Recursive.within_limits(limits, work, graph, 0n, 0n)

def allowed(+state: Signed.State, +work_only: Bool) -> Bool:
  match state:
    case Signed.State{local, O.Negative{1n++_}}: False{}
    case Signed.State{local, O.Nonnegative{work}}:
      budget_allowed(Recursive.state_budget(Signed.structural_state(local, work)), work_only)
    case Signed.State{local, O.Negative{0n}}:
      budget_allowed(Recursive.state_budget(Signed.structural_state(local, 0n)), work_only)

def fresh_local(+local: Recursive.State) -> Recursive.State:
  match local:
    case Recursive.State{visited, budget, _, _}: Recursive.State{visited, budget, 0n, []}

def build_state(+frame: Frame) -> Recursive.State:
  fresh_local(Signed.local(frame_local(frame)))

def edge_depth(+edge: Edge) -> Nat:
  match edge:
    case Edge{_, F.Pending{_, Local.Pending{_, _, _, _, _, depth, _, _}}, _, _}: (depth + 1n : Nat)

def attempt_path(+attempt: Attempt) -> String:
  match attempt:
    case Attempt{_, _, FileChild{path}, _, _, _, _, _, _, _}: path
    case Attempt{_, Edge{_, F.Pending{_, Local.Pending{_, _, from, _, _, _, _, _}}, _, _},
      BundledChild{}, _, _, _, _, _, _, _}: from

def identity(+declaration: Local.Declaration) -> String:
  match declaration:
    case Local.Declaration{_, identity, _, _, _}: identity

def known_file(+frame: Frame, +attempt: Attempt) -> Bool:
  match attempt:
    case Attempt{_, _, FileChild{_}, _, _, _, _, declaration, _, _}:
      Recursive.seen(Signed.local(frame_local(frame)), identity(declaration))
    case _: False{}

def known_state(+local: Recursive.State, +signed: O.SignedNat) -> Signed.State:
  match signed:
    case O.Nonnegative{work}: Signed.State{Signed.structural_state(local, work), signed}
    case O.Negative{0n}: Signed.State{Signed.structural_state(local, 0n), signed}
    case _: Signed.State{local, signed}

def selected_child(+fuel: Nat, +frame: Frame, +attempt: Attempt, +known: Bool) -> Signed.Build:
  match attempt known:
    case Attempt{_, _, _, _, _, _, _, Local.Declaration{artifact, _, _, _, _}, _, _} True{}:
      Signed.Built{known_state(build_state(frame),
        difference(graph_work(frame_graph(frame)), local_work(frame_local(frame)))),
        Recursive.Tree{0n, artifact, []}}
    case Attempt{_, edge, _, _, _, name, expected, _, Root.Source{facts, _, _}, _} False{}:
      Signed.build(fuel, difference(graph_work(frame_graph(frame)), local_work(frame_local(frame))),
        facts, attempt_path(attempt), name, expected, edge_depth(edge), build_state(frame))

# The bundle caller supplies source() of the native one-declaration clone,
# whose key is the artifact name even when kind-aware lookup will miss it.
def local_child(+fuel: Nat, +frame: Frame, +attempt: Attempt) -> Signed.Build:
  selected_child(fuel, frame, attempt, known_file(frame, attempt))

def bundle_start(
  +oversized: Bool,
  +frame: Frame,
  +attempt: Attempt,
  +bytes: Nat,
  +before: Nat
) -> Transaction:
  match oversized:
    case True{}: TransactionFinished{captured_event(frame, bytes, 0n, before, [])}
    case False{}: MeasureBefore{frame, attempt}

def begin_with_graph(+frame: Frame, +graph: G.Bounded, +attempt: Attempt) -> Transaction:
  match graph attempt:
    case _ Attempt{_, _, FileChild{_}, _, _, _, _, _, _, _}:
      BuildChild{frame, attempt, None{}}
    case G.Bounded{G.Graph{_, _, _, _, _, _, _, _, _, _, G.Limits{_, cap, _, _, _, _, _, _}}, _}
      Attempt{_, _, BundledChild{}, _, bytes, _, _, _, _, before}:
      bundle_start(Nat.is_gt(bytes, cap), frame, attempt, bytes, before)

def begin(+frame: Frame, +attempt: Attempt) -> Transaction:
  begin_with_graph(frame, frame_graph(frame), attempt)

def attached(
  +replacement: F.Replacement,
  +frame: Frame,
  +child: Child,
  +previous: Nat
) -> Transaction:
  match replacement frame child:
    case F.ReplacementInvalid{} _ _: TransactionInvalid{frame}
    case F.Replaced{forest} Frame{graph, command, _, local, pending, captured, identities,
      edge, episode, artifact, dependencies} Child{_, _, _, _}:
      MeasureAfter{Frame{graph, command, forest, local, pending, captured, identities,
        edge, (episode + 1n : Nat), artifact, dependencies}, child, previous}

def attachment_reference(
  +known: Bool,
  +created: F.Created,
  +symbol: String,
  +identity: String
) -> F.Reference:
  match known created:
    case True{} _: F.Included{F.ReferenceSymbol{symbol}, F.ArtifactIdentity{identity}}
    case False{} F.Created{root, _, _}: F.Expanded{F.ReferenceSymbol{symbol}, root}

def attachment_kind(+frame: Frame, +child: Child, +known: Bool) -> F.Replacement:
  match frame child:
    case Frame{_, _, forest, _, _, _, _, _, _, _, _}
      Child{
        Attempt{
          _,
          Edge{_, F.Pending{owner, Local.Pending{_, index, _, symbol, _, _, _, _}}, _, _},
          _,
          _,
          _,
          _,
          _,
          declaration,
          _,
          _
        },
        +created,
        _,
        _
      }:
      F.replace(F.append(forest, created), owner, index,
        attachment_reference(known, created, symbol, identity(declaration)))

def attachment(+frame: Frame, +child: Child) -> F.Replacement:
  match child:
    case Child{attempt, _, _, _}: attachment_kind(frame, child, known_file(frame, attempt))

def attach(+frame: Frame, +child: Child, +previous: Nat) -> Transaction:
  attached(attachment(frame, child), frame, child, previous)

def child_ready(+frame: Frame, +child: Child, +previous: Maybe<&2, Nat>) -> Transaction:
  match previous:
    case None{}: MeasureFileBefore{frame, child}
    case Some{bytes}: attach(frame, child, bytes)

def child_pending(+frame: Frame, +attempt: Attempt, +state: Signed.State,
    +previous: Maybe<&2, Nat>, +created: F.Created, +pending: F.PendingResult) -> Transaction:
  match pending:
    case F.PendingInvalid{}: TransactionInvalid{frame}
    case F.PendingBuilt{pending}:
      child_ready(frame, Child{attempt, created, state, pending}, previous)

def constructed_pending(+frame: Frame, +attempt: Attempt, +state: Signed.State,
    +previous: Maybe<&2, Nat>, +created: F.Created, +local: Recursive.State) -> Transaction:
  match created local:
        case F.Created{_, _, addresses} Recursive.State{_, _, _, pending}:
          child_pending(frame, attempt, state, previous, created,
            F.pending(List.reverse(&2, Local.Pending, pending), addresses))

def constructed(+frame: Frame, +attempt: Attempt, +state: Signed.State,
    +previous: Maybe<&2, Nat>, +construction: F.Construction) -> Transaction:
  match construction:
    case F.ConstructionExhausted{}: TransactionExhausted{frame}
    case F.ConstructionInvalid{}: TransactionInvalid{frame}
    case F.Constructed{+created}:
      constructed_pending(frame, attempt, state, previous, created, Signed.local(state))

def guard_work(
  +frame: Frame,
  +attempt: Attempt,
  +state: Signed.State,
  +tree: Recursive.Tree,
  +previous: Maybe<&2, Nat>,
  +fuel: Nat,
  +work_ok: Bool,
  +all_ok: Bool
) -> Transaction:
  match frame attempt work_ok all_ok:
    case _ Attempt{_, _, FileChild{_}, _, bytes, _, _, _, _, before} False{} _:
      TransactionFinished{captured_event(frame, bytes, 0n, before, [])}
    case _ _ _ False{}: TransactionFinished{event(frame, G.CaptureFailed{})}
    case Frame{_, _, _, _, _, _, _, _, episode, _, _}
      Attempt{_, _, _, _, _, _, _, _, Root.Source{_, _, artifacts}, _} _ True{}:
      constructed(frame, attempt, state, previous, F.construct(fuel, tree, episode, [], artifacts))

# The signed conversion occurs at the native post-traversal permit, including
# a successful child whose references never invoked a recursive permit.
def post_permit(
  +frame: Frame,
  +attempt: Attempt,
  +state: Signed.State,
  +tree: Recursive.Tree,
  +previous: Maybe<&2, Nat>,
  +fuel: Nat,
  +signed: O.SignedNat
) -> Transaction:
  match signed:
    case O.Negative{1n++magnitude}:
      TransactionFailed{frame, T.NegativeGraphWork{(magnitude + 1n : Nat)}}
    case _:
      guard_work(frame, attempt, state, tree, previous, fuel,
        allowed(state, True{}), allowed(state, False{}))

def signed_work(+state: Signed.State) -> O.SignedNat:
  match state:
    case Signed.State{_, signed}: signed

def guarded(+frame: Frame, +attempt: Attempt, +state: Signed.State,
    +tree: Recursive.Tree, +previous: Maybe<&2, Nat>, +fuel: Nat) -> Transaction:
  post_permit(with_local(frame, retain_budget(frame_local(frame), state)), attempt,
    state, tree, previous, fuel, signed_work(state))

def built(+frame: Frame, +attempt: Attempt, +previous: Maybe<&2, Nat>,
    +build: Signed.Build, +fuel: Nat) -> Transaction:
  match build:
    case Signed.TechnicalFailure{state, failure}:
      TransactionFailed{with_local(frame, retain_budget(frame_local(frame), state)), failure}
    case Signed.EvaluationExhausted{state}:
      TransactionExhausted{with_local(frame, retain_budget(frame_local(frame), state))}
    case Signed.Missing{state}:
      TransactionFinished{
        event(with_local(frame, retain_budget(frame_local(frame), state)), G.CaptureFailed{})
      }
    case Signed.Built{state, tree}: guarded(frame, attempt, state, tree, previous, fuel)

def registered(
  +rest: Registration,
  +head: F.Pending,
  +source: T.SourceFacts,
  +catalog: Root.Source,
  +next: Nat
) -> Registration:
  match rest:
    case Registration{edges, ids, last}: Registration{
      Edge{next, head, source, catalog} <> edges,
      next <> ids,
      last
    }

def register(
  +items: List<&2, F.Pending>,
  +source: T.SourceFacts,
  +catalog: Root.Source,
  +next: Nat
) -> Registration:
  match items:
    case []: Registration{[], [], next}
    case head <> tail:
      registered(register(tail, source, catalog, (next + 1n : Nat)), head, source, catalog, next)

def rolled_back(+frame: Frame, +replacement: F.Replacement) -> Transaction:
  match frame replacement:
    case _ F.ReplacementInvalid{}: TransactionInvalid{frame}
    case Frame{graph, command, _, local, pending, captured, identities,
      edge, episode, artifact, dependencies} F.Replaced{forest}:
      TransactionFinished{Frame{graph, command, forest, local, pending, captured, identities,
        edge, episode, artifact, dependencies}}

# Captured/target lists are insertion-ordered maps. Replacement preserves the
# original position, exactly as native Map.set does.
def rollback_target(+kind: ChildKind, +name: String, +symbol: String) -> String:
  match kind:
    case FileChild{_}: name
    case BundledChild{}: symbol

def rollback(+frame: Frame, +child: Child) -> Transaction:
  match frame child:
    case Frame{graph, command, forest, local, pending, captured, identities,
      edge, episode, artifact, dependencies}
      Child{
        Attempt{
          _,
          Edge{_, F.Pending{owner, Local.Pending{_, index, _, symbol, name, _, _, _}}, _, _},
          kind,
          _,
          _,
          _,
          _,
          _,
          _,
          _
        },
        _,
        _,
        _
      }:
      rolled_back(
        frame,
        F.replace(
          forest,
          owner,
          index,
          F.Omitted{
            F.ReferenceSymbol{symbol},
            F.ReferenceSymbol{rollback_target(kind, name, symbol)},
            Local.ReferenceLimit{}
          }
        )
      )

def store_capture(
  +items: List<&2, Captured>,
  +path: String,
  +source: T.SourceFacts,
  +bytes: Nat
) -> List<&2, Captured>:
  match items:
    case []: [Captured{path, source, bytes}]
    case +head <> +tail:
      match head:
        case Captured{key, _, _}:
          Bool.pick(List<&2, Captured>, String.eq(key, path),
            Captured{path, source, bytes} <> tail, head <> store_capture(tail, path, source, bytes))

def publish_capture(
  +kind: ChildKind,
  +captured: List<&2, Captured>,
  +source: T.SourceFacts,
  +bytes: Nat
) -> List<&2, Captured>:
  match kind:
    case FileChild{path}: store_capture(captured, path, source, bytes)
    case BundledChild{}: captured

def store_identity(
  +items: List<&2, TargetArtifact>,
  +target: Nat,
  +identity: String
) -> List<&2, TargetArtifact>:
  match items:
    case []: [TargetArtifact{target, identity}]
    case +head <> +tail:
      match head:
        case TargetArtifact{key, _}:
          Bool.pick(
            List<&2, TargetArtifact>,
            Nat.is_eq(key, target),
            TargetArtifact{target, identity} <> tail,
            head <> store_identity(tail, target, identity)
          )

def publish(
  +frame: Frame,
  +child: Child,
  +next: Recursive.State,
  +old: Recursive.State
) -> Transaction:
  match frame child next old:
    case Frame{graph, command, forest, Signed.State{_, signed}, pending, captured, identities,
      edge, episode, artifact, dependencies}
      Child{Attempt{target, _, kind, source, bytes, _, _, declaration, _, _}, _, _, _}
      Recursive.State{visited, budget, _, _} Recursive.State{_, _, address, old_pending}:
      TransactionFinished{
        Frame{
          graph,
          command,
          forest,
          Signed.State{Recursive.State{visited, budget, address, old_pending}, signed},
          pending,
          publish_capture(kind, captured, source, bytes),
          store_identity(identities, target, identity(declaration)),
          edge,
          episode,
          artifact,
          dependencies
        }
      }

def committed(+frame: Frame, +child: Child) -> Transaction:
  match frame child:
    case Frame{_, G.SkipImport{_, _}, _, _, _, _, _, _, _, _, _} _: rollback(frame, child)
    case Frame{_, _, _, local, _, _, _, _, _, _, _} Child{_, _, state, _}:
      publish(frame, child, Signed.local(state), Signed.local(local))

def registered_capture(+frame: Frame, +child: Child, +previous: Nat, +measured: Nat,
    +registration: Registration) -> Transaction:
  match frame child registration:
    case Frame{graph, command, forest, local, pending, captured, identities,
      _, episode, artifact, dependencies}
      Child{Attempt{_, _, _, _, bytes, _, _, _, _, before}, _, _, _}
      Registration{edges, ids, next}:
      committed(
        captured_event(
          Frame{
            graph,
            command,
            forest,
            local,
            List.append(&2, Edge, pending, edges),
            captured,
            identities,
            next,
            episode,
            artifact,
            dependencies
          },
          bytes,
          Nat.sub(measured, previous),
          before,
          ids
        ),
        child
      )

def admitted(+frame: Frame, +child: Child, +previous: Nat, +measured: Nat) -> Transaction:
  match frame child:
    case Frame{_, _, _, _, _, _, _, edge, _, _, _}
      Child{Attempt{_, _, _, source, _, _, _, _, catalog, _}, _, _, more}:
      registered_capture(frame, child, previous, measured, register(more, source, catalog, edge))

def measured(+result: F.Materialization, +frame: Frame, +transaction: Transaction) -> Selection:
  match result:
    case F.Materialized{product}: Request{transaction, T.EncodeProduct{product}}
    case F.MaterializationExhausted{}: Continue{TransactionExhausted{frame}}
    case F.MaterializationInvalid{}: Continue{TransactionInvalid{frame}}

def measure(+fuel: Nat, +frame: Frame, +transaction: Transaction) -> Selection:
  match frame:
    case Frame{_, _, forest, _, _, _, _, _, _, _, dependencies}:
      measured(F.unit(fuel, forest, dependencies), frame, transaction)

def choose(+fuel: Nat, +transaction: Transaction) -> Selection:
  match transaction:
    case MeasureBefore{frame, _}: measure(fuel, frame, transaction)
    case MeasureFileBefore{frame, _}: measure(fuel, frame, transaction)
    case MeasureAfter{frame, _, _}: measure(fuel, frame, transaction)
    case BuildChild{+frame, +attempt, previous}:
      Continue{built(frame, attempt, previous, local_child(fuel, frame, attempt), fuel)}
    case _: Continue{transaction}

def consume(+transaction: Transaction, +outcome: T.ServiceOutcome) -> Transaction:
  match transaction outcome:
    case MeasureBefore{frame, attempt} T.ProductEncoded{bytes}: BuildChild{
      frame,
      attempt,
      Some{bytes}
    }
    case MeasureFileBefore{frame, child} T.ProductEncoded{bytes}: attach(frame, child, bytes)
    case MeasureAfter{frame, child, before} T.ProductEncoded{bytes}: admitted(
      frame,
      child,
      before,
      bytes
    )
    case MeasureBefore{frame, _} T.ProviderRejected{exception}: TransactionFailed{
      frame,
      T.ForeignProviderFailure{exception}
    }
    case MeasureFileBefore{frame, _} T.ProviderRejected{exception}: TransactionFailed{
      frame,
      T.ForeignProviderFailure{exception}
    }
    case MeasureAfter{frame, _, _} T.ProviderRejected{exception}: TransactionFailed{
      frame,
      T.ForeignProviderFailure{exception}
    }
    case MeasureBefore{frame, _} _: TransactionFailed{frame, T.WrongReplyKind{}}
    case MeasureFileBefore{frame, _} _: TransactionFailed{frame, T.WrongReplyKind{}}
    case MeasureAfter{frame, _, _} _: TransactionFailed{frame, T.WrongReplyKind{}}
    case _ _: transaction

def main() -> Unit:
  Unit{}
