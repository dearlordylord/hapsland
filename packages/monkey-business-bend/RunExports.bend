import Base
import ./NativeGenerated.bend as Generated
import ./TreeFacts.bend as TreeFacts
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ./NativeRun.bend as Run
import ./NativeRunControls.bend as Controls
import ./NativeRunTypes.bend as T
import ./Types.bend as EngineTypes
import ./Engine.bend as Engine
import ./NoticeScenario.bend as Notice
import ./Driver.bend as Driver

# Compiler-emitted boundary for the same runner imported by native consumers.
def create(config: T.Config, seed: Nat) -> T.State:
  Run.create(config, seed)
def enqueue(state: T.State, time: Nat, input: T.Input) -> T.State:
  Run.enqueue(state, time, input)
def step(state: T.State) -> T.Step:
  Run.step(state)
def step_bounded(state: T.State, endpoint: Nat, take_limit: Nat, allow_frame: Bool) -> T.Step:
  Run.step_checkpoint(state, endpoint, take_limit, allow_frame)
def checkpoint_continue(state: T.State, endpoint: Nat, take_limit: Nat, allow_frame: Bool) -> Bool:
  Run.checkpoint_continue(state, endpoint, take_limit, allow_frame)
def advance(state: T.State, budget: Nat, endpoint: Nat) -> T.Advanced:
  Run.advance(state, budget, endpoint)
def advance_status(state: T.State, budget: Nat, endpoint: Nat) -> T.AdvanceStatus:
  Run.advance_status(state, budget, endpoint)
def advance_step_status(
  state: T.State,
  frame: Maybe<&2, T.Frame>,
  budget: Nat,
  endpoint: Nat
) -> T.AdvanceStatus:
  Run.advance_step_status(frame, state, budget, endpoint)
def observe(state: T.State) -> T.Observation:
  Run.observe(state)
def runtime_snapshot(state: T.State) -> T.RuntimeSnapshot:
  Run.runtime_snapshot(state)
def core(state: T.State) -> EngineTypes.State:
  Run.core(state)
def replace_core(state: T.State, core: EngineTypes.State) -> T.State:
  Run.replace_core(state, core)
def replace_runtime(state: T.State, profile: T.RuntimeProfile) -> T.State:
  Run.replace_runtime(state, profile)
def default_runtime() -> T.RuntimeProfile:
  Run.default_runtime()
def control(state: T.State, control: T.Control) -> Controls.Applied:
  Controls.apply(state, control)
def configure_cache(+state: T.State, entries: Nat, bytes: Nat) -> T.State:
  Run.replace_core(state, Engine.configure_cache(Run.core(state), True{}, entries, bytes))
def notice_facts(
  facts: List<&2, Notice.Scheduled>,
  state: T.State,
  +scope: Notice.Scope,
  +started: Nat
) -> T.State:
  match facts:
    case Nil{}: state
    case Notice.Scheduled{offset, event} <> tail:
      notice_facts(
        tail,
        Run.enqueue(
          state,
          Nat.add(started, offset),
          T.NoticeInput{
            Driver.immediate(event, False{}),
            scope,
            None{},
            1n
          }
        ),
        scope,
        started
      )
def notice_exercise(state: T.State, +scope: Notice.Scope, started: Nat) -> T.State:
  notice_facts(Engine.notice_exercise(scope), state, scope, started)
def normalize(state: T.State) -> T.State:
  Run.normalize(state)

def bind_generated(
  state: T.State,
  key: Generated.GeneratedKey,
  identity: Nat
) -> Run.BoundGenerated:
  Run.bind_generated(state, key, identity)
def unit_key(
  partition: Nat,
  pair: Nat,
  index: Nat,
  bytes: Nat,
  seed: Nat,
  profile: TreeFacts.Profile,
  limits: ImportGraph.Limits,
  tree_label: Nat,
  limits_label: Nat
) -> Generated.GeneratedKey:
  Generated.unit_key(partition, pair, index, bytes, seed, profile, limits, tree_label, limits_label)
def input_key(
  pair: Nat,
  bytes: Nat,
  units: List<&2, Nat>,
  seed: Nat,
  profile: TreeFacts.Profile,
  limits: ImportGraph.Limits,
  tree_label: Nat,
  limits_label: Nat
) -> Generated.GeneratedKey:
  Generated.input_key(pair, bytes, units, seed, profile, limits, tree_label, limits_label)
def subject_key() -> Generated.GeneratedKey:
  Generated.subject_key()
