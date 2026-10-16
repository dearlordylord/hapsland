import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Execution.bend as E
import ./Specification.bend as S
import ./ProtocolReference.bend as P

# DRAFT: owner approval pending. No proofs have been written against these laws.
# Lifecycle: retain these Hapsland preflight laws, their proofs once completed,
# and the independent Bend specifications after whole-unit migration acceptance.
# At acceptance, delete superseded TypeScript implementations and temporary TS
# differential oracles. These equations do not require the old TS implementation.
# TypeScript and Go name the analyzed source languages. Maintain these guarantees
# when an accepted change to the preflight contract requires it.
#
# Exact whole grouped execution: admission, <=1024 count, missing type bound,
# refusal/empty effects, ordered callable/IEEE primitives and lazy imports.
# None cannot satisfy the law. Native parser facts, numbers and thrown identity
# remain the physical binding obligations, not facts proved by this equation.
law typescript_exact:
  for +valid: Bool
  for +types: Nat
  for +sites: List<&2, Nat>
  for +bound: Bool
  for +root_imports: Bool
  for +type_imports: Bool
  {
    E.typescript(valid, types, sites, bound, root_imports, type_imports)
    == Some{S.typescript(valid, types, sites, bound, root_imports, type_imports)}
    : Maybe<&2, M.Plan>
  }

# Preserve an existing bound without inspection; otherwise inspect once and
# retain the original unavailable/empty-with-imports fallback decision.
law go_exact:
  for +bound: Bool
  for +valid: Bool
  {E.go(bound, valid) == Some{S.go(bound, valid)} : Maybe<&2, M.Plan>}

# Other adapters preserve their original bound decision and perform no effects.
law passthrough_exact:
  for +bound: Bool
  {E.passthrough(bound) == Some{S.passthrough(bound)} : Maybe<&2, M.Plan>}

# Every scalar reply constructor/id obeys the independent protocol equations,
# including wrong phase, wrong id, terminal and invalid states. Advance also
# preserves the exact request and stage; trace equality alone does not pin it.
law scalar_protocol_exact:
  for +step: C.Step
  for +reply: C.Reply
  {C.resume(step, reply) == P.resume(step, reply) : C.Step}
  & {C.advance(step) == P.advance(step) : C.Step}

# A group accepts only its initial matching Ack, drains precisely its queue and
# preserves the exact next phase and scalar successor request; all else rejects.
law resume_group_exact:
  for +step: C.Step
  for +reply: C.Reply
  {C.resume_group(step, reply) == P.group(step, reply) : C.Step}

def main() -> Unit:
  Unit{}
