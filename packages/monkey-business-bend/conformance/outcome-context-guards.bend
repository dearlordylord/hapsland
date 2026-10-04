import Base
import ../Engine.bend as Engine
import ../Driver.bend as Driver
import ../Types.bend as Types
import ../Session.bend as Session
import ../Numeric.bend as Numeric
import ./minimal-scenario.bend as Minimal
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/Ledger.bend as Ledger

# Existing issuance/sampling and immutable-origin requirements at their actual
# shared seam. These executable guards do not add or replace accepted laws.
def state() -> Types.State:
  Engine.configure_seed(Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),7n)

def context() -> Driver.Context:
  Driver.with_outcome(Minimal.context_values(Driver.immediate(C.OpenRound{1n,1n},False{}),
    C.RequestClear{},True{},True{},True{},True{},1n),None{})

def manual(context: Driver.Context) -> Driver.Context:
  match context:
    case Driver.Context{p,l,r,bytes,job,delay,outcome,current,credential,generation,readable,
        lifetime,candidate,collection,_,output,certain,output_delay,lease,background,dispatch}:
      Driver.Context{p,l,r,bytes,job,delay,outcome,current,credential,generation,readable,
        lifetime,candidate,collection,False{},output,certain,output_delay,lease,background,dispatch}

def weights() -> List<&2,Numeric.Words>:
  [Numeric.Words{0n,0n},Numeric.Words{1079574528n,0n},Numeric.Words{0n,0n},
    Numeric.Words{0n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n}]

def stream_equal(a: U32,b: U32) -> Bool:
  Nat.is_eq(U32.to_nat(a),U32.to_nat(b))

def edit_selected(prepared: Engine.PreparedCommandContext, before: U32) -> Bool:
  match prepared:
    case Engine.PreparedCommandContext{state,
        Driver.Context{_,_,_,_,_,_,Some{C.RequestClear{}},_,_,_,_,_,_,_,_,_,_,_,_,_,_},
        Some{Driver.OutcomeReceipt{1n,2n,3n,4n,5n,C.RequestClear{},Driver.EditForced{},
          Some{Driver.SourceJob{7n,9n,10n,[5n],Some{C.RequestClear{}}}},None{},None{}}}}:
      stream_equal(Engine.outcome_stream(state),before)
    case _: False{}

def run_selected(prepared: Engine.PreparedCommandContext, before: U32) -> Bool:
  match prepared:
    case Engine.PreparedCommandContext{state,
        Driver.Context{_,_,_,_,_,_,Some{C.RequestClear{}},_,_,_,_,_,_,_,_,_,_,_,_,_,_},
        Some{Driver.OutcomeReceipt{1n,2n,3n,4n,5n,C.RequestClear{},Driver.RunForced{},None{},None{},None{}}}}:
      stream_equal(Engine.outcome_stream(state),before)
    case _: False{}

def sampled(prepared: Engine.PreparedCommandContext, before: U32) -> Bool:
  match prepared:
    case Engine.PreparedCommandContext{state,
        Driver.Context{_,_,_,_,_,_,Some{C.RequestFinding{}},_,_,_,_,_,_,_,_,_,_,_,_,_,_},
        Some{Driver.OutcomeReceipt{1n,2n,3n,4n,5n,C.RequestFinding{},Driver.Sampled{},None{},Some{captured},Some{after}}}}:
      stream_equal(captured,before) && stream_equal(after,Session.random_step(before)) &&
        stream_equal(Engine.outcome_stream(state),after)
    case _: False{}

def untouched(prepared: Engine.PreparedCommandContext,before: U32) -> Bool:
  match prepared:
    case Engine.PreparedCommandContext{state,
        Driver.Context{_,_,_,_,_,_,None{},_,_,_,_,_,_,_,_,_,_,_,_,_,_},None{}}:
      stream_equal(Engine.outcome_stream(state),before)
    case _: False{}

def checks() -> Bool:
  edit_selected(Engine.prepare_command_context(state(),C.JevRequestIssued{1n,2n,3n,4n,5n},
    Some{Driver.SourceJob{7n,9n,10n,[5n],Some{C.RequestClear{}}}},
    Driver.OutcomeEnvironment{Some{C.RequestFinding{}},weights()},context()),Engine.outcome_stream(state())) &&
  run_selected(Engine.prepare_command_context(state(),C.JevRequestIssued{1n,2n,3n,4n,5n},
    None{},Driver.OutcomeEnvironment{Some{C.RequestClear{}},weights()},context()),Engine.outcome_stream(state())) &&
  sampled(Engine.prepare_command_context(state(),C.JevRequestIssued{1n,2n,3n,4n,5n},
    None{},Driver.OutcomeEnvironment{None{},weights()},context()),Engine.outcome_stream(state())) &&
  sampled(Engine.prepare_command_context(state(),C.JevRequestIssued{1n,2n,3n,4n,5n},
    None{},Driver.OutcomeEnvironment{None{},weights()},manual(context())),Engine.outcome_stream(state())) &&
  untouched(Engine.prepare_command_context(state(),C.Prepare{4n,10n},None{},
    Driver.OutcomeEnvironment{None{},weights()},context()),Engine.outcome_stream(state()))

def main() -> Bool:
  checks()
