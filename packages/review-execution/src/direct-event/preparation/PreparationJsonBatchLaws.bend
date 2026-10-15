import Base
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value
import ../../../../runtime-environment/src/runtime/backend/Backend.bend as Backend
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonPlanValidation.bend as Validation
import ./CanonicalJsonBatch.bend as Batch
import ./CanonicalJsonBatchLaws.bend as Reference
import ./FrozenInput.bend as Input
import ./PreparationFinalization.bend as Top

# DRAFT: actual connected transitions, pending designated review/falsification.
# Header and authoritative command lists below come from the same constructor.
# No agreement is assumed for independently forged copies of a Step's fields.

# Hash the exported core fields while retaining metadata in the prepared input.
# Exporting performs no primitive request and changes neither Input identifier.
law export_exact:
  for +invocation: Nat
  for +request: Nat
  for +frame: Input.Frame
  for +identity: Backend.Identity
  {
    Input.identity_ready(invocation, request, frame, identity)
    == Input.ExportJson{
      Input.State{invocation, request, Input.FlattenWork{
        Input.input_value(frame, Input.core_fields(frame, identity)),
        Value.ProductObject{Input.core_fields(frame, identity)}
      }},
      Value.ProductObject{Input.core_fields(frame, identity)}
    }
    : Input.Step
  }

# A different but well-formed tree is not an accepted mechanical ABI conversion.
law wrong_tree_refused:
  for +invocation: Nat
  for +request: Nat
  for input: Value.ProductValue
  for +value: Value.ProductValue
  for +operations: List<&2, Plan.Operation>
  for rejected: {Validation.validate(operations, value) == False{} : Bool}
  {
    Input.resume(
      Input.ExportJson{Input.State{invocation, request, Input.FlattenWork{input, value}}, value},
      Input.Planned{invocation, request, operations})
    == Input.InvalidReply{}
    : Input.Step
  }

# A nonempty plan charges exactly its first primitive and exposes that first ID.
law first_request_exact:
  for +invocation: Nat
  for +request: Nat
  for +input: Value.ProductValue
  for +parts: List<&2, Plan.Piece>
  for +first: Batch.Command
  for +rest: List<&2, Batch.Command>
  {
    Input.batch_selected(invocation, request, input, parts, first <> rest)
    == Input.SerializeBatch{
      Input.State{invocation, Nat.add(1n, request), Input.BatchWork{input, parts, first <> rest}},
      first <> rest
    }
    : Input.Step
  }

# Full Input acceptance, including both header IDs, every token ID and count.
# Binding preserves individual parts; only the subsequent advance concatenates.
law batch_resume_exact:
  for +invocation: Nat
  for +request: Nat
  for +received_invocation: Nat
  for +received_request: Nat
  for +input: Value.ProductValue
  for +parts: List<&2, Plan.Piece>
  for +first: Batch.Command
  for +rest: List<&2, Batch.Command>
  for +tokens: List<&2, Batch.Token>
  {
    Input.resume(
      Input.SerializeBatch{
        Input.State{invocation, request, Input.BatchWork{input, parts, first <> rest}},
        first <> rest},
      Input.SerializedBatch{received_invocation, received_request, tokens})
    == Bool.pick(
      Input.Step,
      Bool.and(
        Nat.is_eq(invocation, received_invocation),
        Bool.and(
          Nat.is_eq(request, received_request),
          Bool.and(
            Reference.inner_matches(first <> rest, tokens),
            Nat.is_eq(
              List.length(&2, Json.Primitive, Reference.primitives(parts)),
              List.length(&2, Batch.Token, tokens)
            )
          )
        )
      ),
      Input.Continue{
        Input.State{
          invocation,
          Nat.add(request, List.length(&2, Batch.Command, rest)),
          Input.AssemblyWork{
            input,
            Reference.substituted(parts, Reference.token_values(tokens), 0n)
          }
        }
      },
      Input.InvalidReply{}
    )
    : Input.Step
  }

# The original native String.concat remains in advance, followed by one digest ID.
law assembly_advance_exact:
  for +invocation: Nat
  for +request: Nat
  for +input: Value.ProductValue
  for +parts: List<&2, String>
  {
    Input.advance(Input.State{invocation, request, Input.AssemblyWork{input, parts}})
    == Input.Digest{Input.State{invocation, Nat.add(1n, request), Input.HashWork{input}},
      String.concat(parts)}
    : Input.Step
  }

# The outer Finalization namespace also leaves mechanical export uncharged.
law outer_export_exact:
  for +unit: Top.UnitState
  for +state: Input.State
  for +value: Value.ProductValue
  {
    Top.input_expose(unit, Input.ExportJson{state, value})
    == Top.InputRequest{unit, Input.ExportJson{state, value}}
    : Top.Step
  }

def main() -> Unit:
  Unit{}

# Proposed extension: pending root review before proof implementation.
def literal_pieces(strings: List<&2, String>) -> List<&2, Plan.Piece>:
  match strings:
    case []: []
    case value <> rest: Plan.LiteralPiece{value} <> literal_pieces(rest)

law empty_plan_uncharged:
  for +invocation: Nat
  for +request: Nat
  for +input: Value.ProductValue
  for +strings: List<&2, String>
  {
    Input.planned(invocation, request, input, Some{literal_pieces(strings)})
    == Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input, strings}}}
    : Input.Step
  }

# Independent record decomposition; no production increment/add_requests helper.
def unit_progress(unit: Top.UnitState, count: Nat) -> Top.UnitState:
  match unit:
    case Top.UnitState{Top.State{invocation, request, context, pending, reversed},
      value, location, partial, fingerprints}:
      Top.UnitState{Top.State{invocation, Nat.add(request, count), context, pending, reversed},
        value, location, partial, fingerprints}

def unit_request(unit: Top.UnitState) -> Nat:
  match unit:
    case Top.UnitState{Top.State{_, request, _, _, _}, _, _, _, _}: request

def outer_header(unit: Top.UnitState, received: Top.Invocation, request: Nat) -> Bool:
  match unit received:
    case Top.UnitState{Top.State{Top.Invocation{owner, command}, expected, _, _, _}, _, _, _, _}
      Top.Invocation{other_owner, other_command}:
      Bool.and(Bool.and(Nat.is_eq(owner, other_owner), Nat.is_eq(command, other_command)),
        Nat.is_eq(expected, request))

law outer_batch_first_exact:
  for +unit: Top.UnitState
  for +state: Input.State
  for +first: Batch.Command
  for +rest: List<&2, Batch.Command>
  {
    Top.input_expose(unit, Input.SerializeBatch{state, first <> rest})
    == Top.JsonBatchRequest{unit_progress(unit, 1n), Input.SerializeBatch{state, first <> rest},
      Batch.schedule(first <> rest, Nat.add(1n, unit_request(unit)))}
    : Top.Step
  }

# The outer unit is already charged its first request by outer_batch_first_exact.
# Inner commands are arbitrary: acceptance checks their actual IDs, not an assumed
# relation to the Input header or to the independent outer schedule.
law outer_batch_resume_exact:
  for +unit: Top.UnitState
  for +received: Top.Invocation
  for +received_request: Nat
  for +invocation: Nat
  for +request: Nat
  for +input: Value.ProductValue
  for +parts: List<&2, Plan.Piece>
  for +first: Batch.Command
  for +rest: List<&2, Batch.Command>
  for +observations: List<&2, Batch.Observed>
  {
    Top.resume(
      Top.JsonBatchRequest{
        unit,
        Input.SerializeBatch{
          Input.State{invocation, request, Input.BatchWork{input, parts, first <> rest}},
          first <> rest
        },
        Batch.schedule(first <> rest, unit_request(unit))
      },
      Top.Reply{received, received_request, Top.BatchSerialized{observations}}
    )
    == Bool.pick(
      Top.Step,
      Bool.and(
        outer_header(unit, received, received_request),
        Bool.and(
          Reference.outer_matches(Batch.schedule(first <> rest, unit_request(unit)), observations),
          Bool.and(
            Reference.inner_matches(first <> rest, Reference.inner_tokens(observations)),
            Nat.is_eq(
              List.length(&2, Json.Primitive, Reference.primitives(parts)),
              List.length(&2, Batch.Observed, observations)
            )
          )
        )
      ),
      Top.Continue{
        Top.InputPhase{
          unit_progress(unit, List.length(&2, Batch.Command, rest)),
          Input.Continue{
            Input.State{
              invocation,
              Nat.add(request, List.length(&2, Batch.Command, rest)),
              Input.AssemblyWork{
                input,
                Reference.substituted(
                  parts,
                  Reference.token_values(Reference.inner_tokens(observations)),
                  0n
                )
              }
            }
          }
        }
      },
      Top.InvalidReply{}
    )
    : Top.Step
  }

# Six crossed response families are rejected regardless of work/header contents.
law export_rejects_batch:
  for +state: Input.State for +value: Value.ProductValue
  for +invocation: Nat for +request: Nat for +tokens: List<&2, Batch.Token>
  {Input.resume(Input.ExportJson{state, value}, Input.SerializedBatch{invocation, request, tokens})
    == Input.InvalidReply{} : Input.Step}

law export_rejects_digest:
  for +state: Input.State for +value: Value.ProductValue
  for +invocation: Nat for +request: Nat for +hash: String
  {Input.resume(Input.ExportJson{state, value}, Input.Hashed{invocation, request, hash})
    == Input.InvalidReply{} : Input.Step}

law batch_rejects_export:
  for +state: Input.State for +commands: List<&2, Batch.Command>
  for +invocation: Nat for +request: Nat for +operations: List<&2, Plan.Operation>
  {
    Input.resume(
      Input.SerializeBatch{state, commands},
      Input.Planned{invocation, request, operations}
    )
    == Input.InvalidReply{}
    : Input.Step
  }

law batch_rejects_digest:
  for +state: Input.State for +commands: List<&2, Batch.Command>
  for +invocation: Nat for +request: Nat for +hash: String
  {Input.resume(Input.SerializeBatch{state, commands}, Input.Hashed{invocation, request, hash})
    == Input.InvalidReply{} : Input.Step}

law digest_rejects_export:
  for +state: Input.State for +text: String
  for +invocation: Nat for +request: Nat for +operations: List<&2, Plan.Operation>
  {Input.resume(Input.Digest{state, text}, Input.Planned{invocation, request, operations})
    == Input.InvalidReply{} : Input.Step}

law digest_rejects_batch:
  for +state: Input.State for +text: String
  for +invocation: Nat for +request: Nat for +tokens: List<&2, Batch.Token>
  {Input.resume(Input.Digest{state, text}, Input.SerializedBatch{invocation, request, tokens})
    == Input.InvalidReply{} : Input.Step}

# Proposed final composition laws: pending designated review before proof.
# This pins the actual plan-to-command connection, including the first logical ID.
law planned_exact:
  for +invocation: Nat
  for +request: Nat
  for +input: Value.ProductValue
  for +parts: List<&2, Plan.Piece>
  {
    Input.planned(invocation, request, input, Some{parts})
    == Bool.pick(
      Input.Step,
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), 0n),
      Input.Continue{Input.State{invocation, request, Input.AssemblyWork{
        input, Reference.substituted(parts, [], 0n)
      }}},
      Input.SerializeBatch{
        Input.State{invocation, Nat.add(1n, request), Input.BatchWork{
          input, parts,
          Reference.enumerate(Reference.primitives(parts), invocation, Nat.add(1n, request))
        }},
        Reference.enumerate(Reference.primitives(parts), invocation, Nat.add(1n, request))
      }
    )
    : Input.Step
  }

# Foreign headers and the retained authoritative value are both checked before
# the actual plan-to-command composition above. Displayed data is not authority.
law export_resume_exact:
  for +invocation: Nat
  for +request: Nat
  for +input: Value.ProductValue
  for +value: Value.ProductValue
  for +displayed: Value.ProductValue
  for +received_invocation: Nat
  for +received_request: Nat
  for +operations: List<&2, Plan.Operation>
  {
    Input.resume(
      Input.ExportJson{Input.State{invocation, request, Input.FlattenWork{input, value}}, displayed},
      Input.Planned{received_invocation, received_request, operations})
    == Bool.pick(
      Input.Step,
      Bool.and(
        Bool.and(Nat.is_eq(invocation, received_invocation), Nat.is_eq(request, received_request)),
        Validation.validate(operations, value)
      ),
      Input.planned(invocation, request, input, Plan.compile(operations)),
      Input.InvalidReply{}
    )
    : Input.Step
  }
