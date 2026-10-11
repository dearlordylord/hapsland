import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./CONTINUATION_MACHINE_PROOF.bend as Machine
import ./CONTINUATION_REFERENCE_PROOF.bend as Reference
import ./CONTINUATION_ORDINARY_PROOF.bend as Ordinary
import ./CONTINUATION_BUNDLED_PROOF.bend as Bundled
import ./CONTINUATION_STATE_PROOF.bend as State
import ./INTERPRETER_COMPLETION_RELATION.bend as C
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

def named_exact(
  +target: Maybe<&2, String>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool}
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.named_reference(target, machine, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.named(
          target,
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          State.state(machine),
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match target:
    case None{}: Ordinary.ordinary_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough
    )
    case Some{identity}: Bundled.bundled_named_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      identity
    )

def kind_exact(
  +kind: Core.ReferenceKind,
  +target: Maybe<&2, String>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool}
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.reference_kind(kind, target, machine, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.by_kind(
          kind,
          target,
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          State.state(machine),
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match kind:
    case Core.Unsupported{}: Reference.omitted_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      Core.UnsupportedTarget{}
    )
    case Core.Named{}: named_exact(
      target,
      fuel,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough
    )

def depth_context(
  +fuel: Nat,
  +machine: Core.Machine,
  +kind: Core.ReferenceKind,
  +target: Maybe<&2, String>,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> {
      Reference.observation(
        Spec.by_kind(
          kind,
          target,
          CoreTraversal.machine_facts(CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat))),
          CoreTraversal.machine_path(CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat))),
          symbol,
          owner,
          index,
          depth,
          expected,
          State.state(CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat))),
          C.build_child(fuel)
        ),
        CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat)),
        fuel,
        owner,
        index
      )
      == Reference.observation(
        Spec.by_kind(
          kind,
          target,
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          Spec.reference_depth(State.state(machine), (depth + 1n : Nat)),
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +machine = {Core.Machine{facts, path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      %State.depth_exact(machine, (depth + 1n : Nat)):
        {
          Reference.observation(
            Spec.by_kind(
              kind,
              target,
              facts,
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              State.state(CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat))),
              C.build_child(fuel)
            ),
            CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat)),
            fuel,
            owner,
            index
          )
          == Reference.observation(
            Spec.by_kind(
              kind,
              target,
              facts,
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              _,
              C.build_child(fuel)
            ),
            machine,
            fuel,
            owner,
            index
          )
          : Relation.Observation
        }
      Reference.budget_context(
        Spec.by_kind(
          kind,
          target,
          facts,
          path,
          symbol,
          owner,
          index,
          depth,
          expected,
          State.state(CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat))),
          C.build_child(fuel)
        ),
        machine,
        CoreTraversal.observe_depth(budget, (depth + 1n : Nat)),
        fuel,
        owner,
        index
      )

def visit_exact(
  +reference: Core.Reference,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool}
) -> {
      Machine.evaluate(fuel, CoreTraversal.visit_reference(machine, owner, index, depth, reference))
      == Reference.observation(
        Spec.reference(
          reference,
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          owner,
          index,
          depth,
          State.state(machine),
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match reference machine:
    case Core.Reference{+kind, +symbol, +expected, +target}
      Core.Machine{+facts, +path, +frames, +visited, +budget, +address, +nodes, +slots, +pending}:
      +machine = {Core.Machine{facts, path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      Equal.trans(
        Relation.Observation,
        Machine.evaluate(
          fuel,
          CoreTraversal.visit_reference(
            machine,
            owner,
            index,
            depth,
            Core.Reference{kind, symbol, expected, target}
          )
        ),
        Reference.observation(
          Spec.by_kind(
            kind,
            target,
            facts,
            path,
            symbol,
            owner,
            index,
            depth,
            expected,
            State.state(CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat))),
            C.build_child(fuel)
          ),
          CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat)),
          fuel,
          owner,
          index
        ),
        Reference.observation(
          Spec.reference(
            Core.Reference{kind, symbol, expected, target},
            facts,
            path,
            owner,
            index,
            depth,
            State.state(machine),
            C.build_child(fuel)
          ),
          machine,
          fuel,
          owner,
          index
        ),
        kind_exact(
          kind,
          target,
          fuel,
          CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat)),
          owner,
          index,
          symbol,
          depth,
          expected,
          valid,
          enough
        ),
        depth_context(fuel, machine, kind, target, owner, index, symbol, depth, expected)
      )
