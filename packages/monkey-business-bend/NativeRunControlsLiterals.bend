# Executable control-boundary witnesses; these are examples, not universal laws.
import Base
import ./NativeRunControls.bend as Controls
import ./NativeRun.bend as Run
import ./NativeRunTypes.bend as T
import ./NativeRunLiterals.bend as Literals
import ./Callbacks.bend as Callbacks
import ./Driver.bend as Driver
import ./Scheduler.bend as Scheduler
import ./CollectionScenario.bend as Response
import ./WriterScenario.bend as Writer
import ./Engine.bend as Engine
import ./Types.bend as EngineTypes
import ../agent-flow-bend/Canonical.bend as Canonical

def state(result: Controls.Applied) -> T.State:
  match result:
    case Controls.Applied{state, _, _}: state

def applied_callback(result: Controls.Applied) -> Bool:
  match result:
    case Controls.Applied{_, True{}, Controls.CallbackReport{Callbacks.Applied{}}}: True{}
    case _: False{}

def target() -> Callbacks.Target:
  Callbacks.Target{Callbacks.Owner{1n, 1n, 1n, 3n}, Callbacks.JevStarted{4n}, 9n}

def queued() -> T.State:
  Run.schedule_action(
    Literals.state(),
    Driver.Action{Canonical.JevRequestStarted{1n, 1n, 1n, 3n, 4n}, 10n, None{}, False{}, None{}},
    None{}
  )

def no_head(entry: Maybe<&2, Scheduler.Entry>) -> Bool:
  match entry:
    case None{}: True{}
    case Some{_}: False{}

def held() -> Bool:
  +result = Controls.apply(queued(), T.CallbackControl{target(), Callbacks.Hold{}, None{}})
  applied_callback(result) && no_head(Run.peek(state(result)))

def released() -> Bool:
  applied_callback(
    Controls.apply(
      state(Controls.apply(queued(), T.CallbackControl{target(), Callbacks.Hold{}, None{}})),
      T.CallbackControl{target(), Callbacks.Release{}, None{}}
    )
  )

def released_source(input: Maybe<&2, T.Input>) -> Bool:
  match input:
    case Some{
      T.Event{
        Driver.Action{
          Canonical.JevRequestStarted{1n, 1n, 1n, 3n, 4n},
          10n,
          None{},
          False{},
          None{}
        },
        None{},
        None{} <> _,
        None{}
      }
    }: True{}
    case _: False{}

def release_preserves_payload() -> Bool:
  +released = state(
    Controls.apply(
      state(Controls.apply(queued(), T.CallbackControl{target(), Callbacks.Hold{}, None{}})),
      T.CallbackControl{target(), Callbacks.Release{}, None{}}
    )
  )
  released_source(Run.payload_at(Run.runtime_items(released), 10n))

def first_source(values: List<&2, T.RetainedCallback>) -> Maybe<&2, T.RetainedCallback>:
  match values:
    case head <> _: Some{head}
    case Nil{}: None{}

def step_state(step: T.Step) -> T.State:
  match step:
    case T.Step{state, _, _}: state

def historical_duplicate() -> Bool:
  +original = queued()
  applied_callback(
    Controls.apply(
      step_state(Run.step(original)),
      T.CallbackControl{
        target(),
        Callbacks.Duplicate{},
        first_source(Controls.callback_sources(original))
      }
    )
  )

# Rotation changes the shared credential owner, without creating a product frame.
def credential_generation(result: Controls.Applied) -> Nat:
  match result:
    case Controls.Applied{state, _, _}: Engine.current_credential_generation(
      Engine.credentials(Run.core(state))
    )

def writer_missing(result: Controls.Applied) -> Bool:
  match result:
    case Controls.Applied{
      _,
      True{},
      Controls.WriterAttemptReport{Engine.ResponseResult{Response.Missing{}, None{}}, None{}}
    }: True{}
    case _: False{}

def response_input_consumed(step: T.Step) -> Bool:
  match step:
    case T.Step{_, None{}, _}: True{}
    case _: False{}

def missing_response() -> Bool:
  response_input_consumed(
    Run.response_input(
      Literals.state(),
      Driver.immediate(Canonical.CollectionReserveLease{1n, 1n}, False{}),
      Some{Response.Identity{1n, 1n, 1n, 1n}},
      None{},
      False{}
    )
  )

def opened_core(transition: Engine.Transition) -> EngineTypes.State:
  match transition:
    case Engine.Transition{core, _}: core

def opened() -> T.State:
  +original = Literals.state()
  Run.replace_core(
    original,
    opened_core(Engine.step(Run.core(original), Canonical.OpenRound{1n, 1n}))
  )

def claim_facts() -> Writer.ClaimFacts:
  Writer.ClaimFacts{
    Writer.Target{1n, 1n, 1n, 7n},
    0n,
    100n,
    2n,
    Response.Response{1n, 1n, 1n, 0n, 100n, False{}}
  }

def issued_feedback(step: T.Step) -> Bool:
  match step:
    case T.Step{
      _,
      Some{
        T.ProductFrame{
          _,
          _,
          _,
          _,
          _,
          _,
          None{},
          T.FrameDetails{
            _,
            _,
            _,
            _,
            _,
            _,
            _,
            _,
            _,
            _,
            Some{Engine.ResponseResult{Response.Applied{}, Some{_}}}
          }
        }
      },
      _
    }: True{}
    case _: False{}

def claim_feedback() -> Bool:
  issued_feedback(Run.step(state(Controls.apply(opened(), T.WriterClaimControl{claim_facts()}))))

def writer_expiry_frame(step: T.Step) -> Bool:
  match step:
    case T.Step{
      _,
      Some{
        T.ProductFrame{
          _,
          100n,
          Canonical.CollectionExpireBackground{1n, 7n, 100n, 100n},
          _,
          _,
          _,
          _,
          _
        }
      },
      _
    }: True{}
    case _: False{}

def writer_expiry() -> Bool:
  writer_expiry_frame(
    Run.step(
      step_state(Run.step(state(Controls.apply(opened(), T.WriterClaimControl{claim_facts()}))))
    )
  )

def main() -> Bool:
  historical_duplicate() && release_preserves_payload() && writer_expiry() && claim_feedback() && held() && released() && Nat.is_eq(
    credential_generation(Controls.apply(Literals.state(), T.CredentialControl{True{}, True{}})),
    2n
  ) && writer_missing(
    Controls.apply(Literals.state(), T.WriterAttemptControl{Writer.Target{1n, 1n, 1n, 1n}, True{}})
  ) && missing_response()
