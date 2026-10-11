import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./CONTINUATION_MACHINE_PROOF.bend as Machine
import ./CONTINUATION_REFERENCE_PROOF.bend as Reference
import ./CONTINUATION_STATE_PROOF.bend as State

# Complete bundled classifier correspondence; no recursive child is selected here.
def work_context(+fuel: Nat, +machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +expected: Core.ExpectedKind) -> {
  Reference.observation(Spec.bundle_budget(State.state(CoreTraversal.charge_machine_work(machine)), True{},
    CoreTraversal.machine_path(CoreTraversal.charge_machine_work(machine)), symbol, owner, index, depth, expected,
    Reference.declaration_handle(declaration), CoreTraversal.declaration_identity(declaration)),
    CoreTraversal.charge_machine_work(machine), fuel, owner, index)
    == Reference.observation(Spec.bundle_budget(Spec.local_work(State.state(machine)), True{},
      CoreTraversal.machine_path(machine), symbol, owner, index, depth, expected,
      Reference.declaration_handle(declaration), CoreTraversal.declaration_identity(declaration)),
      machine, fuel, owner, index) : Relation.Observation
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
      %State.work_exact(machine):
        {
          Reference.observation(
            Spec.bundle_budget(
              State.state(CoreTraversal.charge_machine_work(machine)),
              True{},
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              Reference.declaration_handle(declaration),
              CoreTraversal.declaration_identity(declaration)
            ),
            CoreTraversal.charge_machine_work(machine),
            fuel,
            owner,
            index
          )
          == Reference.observation(
            Spec.bundle_budget(
              _,
              True{},
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              Reference.declaration_handle(declaration),
              CoreTraversal.declaration_identity(declaration)
            ),
            machine,
            fuel,
            owner,
            index
          )
          : Relation.Observation
        }
      Reference.budget_context(
        Spec.bundle_budget(
          State.state(CoreTraversal.charge_machine_work(machine)),
          True{},
          path,
          symbol,
          owner,
          index,
          depth,
          expected,
          Reference.declaration_handle(declaration),
          CoreTraversal.declaration_identity(declaration)
        ),
        machine,
        CoreTraversal.charge_work(budget),
        fuel,
        owner,
        index
      )

def seen_exact(+seen: Bool, +fuel: Nat, +machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +expected: Core.ExpectedKind) -> {
  Machine.evaluate(
    fuel,
    CoreTraversal.bundled_seen(seen, machine, declaration, owner, index, symbol, depth, expected)
  )
    == Reference.observation(
      Spec.bundle_budget(
        Spec.bundle_work(seen, State.state(machine)),
        seen,
        CoreTraversal.machine_path(machine),
        symbol,
        owner,
        index,
        depth,
        expected,
        Reference.declaration_handle(declaration),
        CoreTraversal.declaration_identity(declaration)
      ),
      machine,
      fuel,
      owner,
      index
    )
    : Relation.Observation
}:
  match seen:
    case False{}: Reference.bundle_charged_exact(
      fuel,
      machine,
      False{},
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    )
    case True{}:
      Equal.trans(
        Relation.Observation,
        Machine.evaluate(
          fuel,
          CoreTraversal.bundled_seen(True{}, machine, declaration, owner, index, symbol, depth, expected)
        ),
        Reference.observation(
          Spec.bundle_budget(
            State.state(CoreTraversal.charge_machine_work(machine)),
            True{},
            CoreTraversal.machine_path(CoreTraversal.charge_machine_work(machine)),
            symbol,
            owner,
            index,
            depth,
            expected,
            Reference.declaration_handle(declaration),
            CoreTraversal.declaration_identity(declaration)
          ),
          CoreTraversal.charge_machine_work(machine),
          fuel,
          owner,
          index
        ),
        Reference.observation(
          Spec.bundle_budget(
            Spec.local_work(State.state(machine)),
            True{},
            CoreTraversal.machine_path(machine),
            symbol,
            owner,
            index,
            depth,
            expected,
            Reference.declaration_handle(declaration),
            CoreTraversal.declaration_identity(declaration)
          ),
          machine,
          fuel,
          owner,
          index
        ),
        Reference.bundle_charged_exact(
          fuel,
          CoreTraversal.charge_machine_work(machine),
          True{},
          declaration,
          owner,
          index,
          symbol,
          depth,
          expected
        ),
        work_context(fuel, machine, declaration, owner, index, symbol, depth, expected)
      )

def target_context(+seen: Bool, +fuel: Nat, +machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +expected: Core.ExpectedKind) -> {
      Reference.observation(
        Spec.bundle_budget(
          Spec.bundle_work(
            seen,
            State.state(CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration)))
          ),
          seen,
          CoreTraversal.machine_path(
            CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration))
          ),
          symbol,
          owner,
          index,
          depth,
          expected,
          Reference.declaration_handle(declaration),
          CoreTraversal.declaration_identity(declaration)
        ),
        CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration)),
        fuel,
        owner,
        index
      )
      == Reference.observation(
        Spec.bundle_seen(
          seen,
          State.state(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          Reference.declaration_handle(declaration),
          CoreTraversal.declaration_identity(declaration)
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
      %State.target_exact(machine, CoreTraversal.declaration_identity(declaration)):
        {
          Reference.observation(
            Spec.bundle_budget(
              Spec.bundle_work(
                seen,
                State.state(
                  CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration))
                )
              ),
              seen,
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              Reference.declaration_handle(declaration),
              CoreTraversal.declaration_identity(declaration)
            ),
            CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration)),
            fuel,
            owner,
            index
          )
          == Reference.observation(
            Spec.bundle_budget(
              Spec.bundle_work(seen, _),
              seen,
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              Reference.declaration_handle(declaration),
              CoreTraversal.declaration_identity(declaration)
            ),
            machine,
            fuel,
            owner,
            index
          )
          : Relation.Observation
        }
      Reference.budget_context(
        Spec.bundle_budget(
          Spec.bundle_work(
            seen,
            State.state(CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration)))
          ),
          seen,
          path,
          symbol,
          owner,
          index,
          depth,
          expected,
          Reference.declaration_handle(declaration),
          CoreTraversal.declaration_identity(declaration)
        ),
        machine,
        CoreTraversal.charge_target(budget, path, CoreTraversal.declaration_identity(declaration)),
        fuel,
        owner,
        index
      )

def target_using_seen(
  +seen: Bool,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.bundled_seen(
          seen,
          CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration)),
          declaration,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == Reference.observation(
        Spec.bundle_seen(
          seen,
          State.state(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          Reference.declaration_handle(declaration),
          CoreTraversal.declaration_identity(declaration)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.bundled_seen(
        seen,
        CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration)),
        declaration,
        owner,
        index,
        symbol,
        depth,
        expected
      )
    ),
    Reference.observation(
      Spec.bundle_budget(
        Spec.bundle_work(
          seen,
          State.state(CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration)))
        ),
        seen,
        CoreTraversal.machine_path(
          CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration))
        ),
        symbol,
        owner,
        index,
        depth,
        expected,
        Reference.declaration_handle(declaration),
        CoreTraversal.declaration_identity(declaration)
      ),
      CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration)),
      fuel,
      owner,
      index
    ),
    Reference.observation(
      Spec.bundle_seen(
        seen,
        State.state(machine),
        CoreTraversal.machine_path(machine),
        symbol,
        owner,
        index,
        depth,
        expected,
        Reference.declaration_handle(declaration),
        CoreTraversal.declaration_identity(declaration)
      ),
      machine,
      fuel,
      owner,
      index
    ),
    seen_exact(
      seen,
      fuel,
      CoreTraversal.charge_machine_target(machine, CoreTraversal.declaration_identity(declaration)),
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    ),
    target_context(seen, fuel, machine, declaration, owner, index, symbol, depth, expected)
  )

def observed_seen(
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  seen: Bool
) -> Relation.Observation:
  Reference.observation(
    Spec.bundle_seen(
      seen,
      State.state(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      owner,
      index,
      depth,
      expected,
      Reference.declaration_handle(declaration),
      CoreTraversal.declaration_identity(declaration)
    ),
    machine,
    fuel,
    owner,
    index
  )

def target_exact(+fuel: Nat, +machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +expected: Core.ExpectedKind) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.bundled_target(machine, declaration, owner, index, symbol, depth, expected)
      )
      == observed_seen(
        machine,
        declaration,
        fuel,
        owner,
        index,
        symbol,
        depth,
        expected,
        Spec.seen(State.state(machine), CoreTraversal.declaration_identity(declaration))
      )
      : Relation.Observation
    }:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.bundled_target(machine, declaration, owner, index, symbol, depth, expected)
    ),
    observed_seen(
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration))
    ),
    observed_seen(
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      Spec.seen(State.state(machine), CoreTraversal.declaration_identity(declaration))
    ),
    target_using_seen(
      CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration)),
      fuel,
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    ),
    Equal.cong(
      Bool,
      Relation.Observation,
      observed_seen(machine, declaration, fuel, owner, index, symbol, depth, expected),
      CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration)),
      Spec.seen(State.state(machine), CoreTraversal.declaration_identity(declaration)),
      State.seen_exact(machine, CoreTraversal.declaration_identity(declaration))
    )
  )

def observed_admission(
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  valid: Bool
) -> Relation.Observation:
  Reference.observation(
    Spec.bundle_admission(
      valid,
      State.state(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      owner,
      index,
      depth,
      expected,
      Reference.declaration_handle(declaration),
      CoreTraversal.declaration_identity(declaration)
    ),
    machine,
    fuel,
    owner,
    index
  )

def admit_exact(+valid: Bool, +fuel: Nat, +machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +expected: Core.ExpectedKind) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.bundled_admit(valid, machine, declaration, owner, index, symbol, depth, expected)
      )
      == observed_admission(
        machine,
        declaration,
        fuel,
        owner,
        index,
        symbol,
        depth,
        expected,
        valid
      )
      : Relation.Observation
    }:
  match valid:
    case False{}: Reference.omitted_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      Core.UnsupportedTarget{}
    )
    case True{}: target_exact(fuel, machine, declaration, owner, index, symbol, depth, expected)

def lookup_exact(
  +found: Maybe<&2, Core.Declaration>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +target: String
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.bundled_lookup(found, machine, owner, index, symbol, depth, expected, target)
      )
      == Reference.observation(
        Spec.bundle_found(
          found,
          target,
          expected,
          State.state(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match found:
    case None{}: Reference.omitted_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      Core.UnsupportedTarget{}
    )
    case Some{Core.Declaration{+artifact, +identity, +function, +bundled, +references}}:
      +declaration = {Core.Declaration{artifact, identity, function, bundled, references} : Core.Declaration}
      Equal.trans(
        Relation.Observation,
        Machine.evaluate(
          fuel,
          CoreTraversal.bundled_lookup(
            Some{declaration},
            machine,
            owner,
            index,
            symbol,
            depth,
            expected,
            target
          )
        ),
        observed_admission(
          machine,
          declaration,
          fuel,
          owner,
          index,
          symbol,
          depth,
          expected,
          CoreTraversal.bundled_valid(declaration, target, expected)
        ),
        observed_admission(
          machine,
          declaration,
          fuel,
          owner,
          index,
          symbol,
          depth,
          expected,
          State.bundled_test(declaration, target, expected)
        ),
        admit_exact(
          CoreTraversal.bundled_valid(declaration, target, expected),
          fuel,
          machine,
          declaration,
          owner,
          index,
          symbol,
          depth,
          expected
        ),
        Equal.cong(
          Bool,
          Relation.Observation,
          observed_admission(machine, declaration, fuel, owner, index, symbol, depth, expected),
          CoreTraversal.bundled_valid(declaration, target, expected),
          State.bundled_test(declaration, target, expected),
          State.bundled_test_exact(declaration, target, expected)
        )
      )

def observed_found(+machine: Core.Machine, fuel: Nat, +owner: Nat, +index: Nat,
    symbol: String, depth: Nat, expected: Core.ExpectedKind, target: String,
    found: Maybe<&2, Core.Declaration>) -> Relation.Observation:
  Reference.observation(
    Spec.bundle_found(
      found,
      target,
      expected,
      State.state(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      owner,
      index,
      depth
    ),
    machine,
    fuel,
    owner,
    index
  )

def bundled_named_exact(+fuel: Nat, +machine: Core.Machine, +owner: Nat, +index: Nat,
    +symbol: String, +depth: Nat, +expected: Core.ExpectedKind, +target: String) -> {
  Machine.evaluate(
    fuel,
    CoreTraversal.named_reference(Some{target}, machine, owner, index, symbol, depth, expected)
  )
    == Reference.observation(
      Spec.bundle_found(
        Spec.supporting(CoreTraversal.machine_facts(machine), target),
        target,
        expected,
        State.state(machine),
        CoreTraversal.machine_path(machine),
        symbol,
        owner,
        index,
        depth
      ),
      machine,
      fuel,
      owner,
      index
    )
    : Relation.Observation
}:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.named_reference(Some{target}, machine, owner, index, symbol, depth, expected)
    ),
    observed_found(
      machine,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      target,
      CoreTraversal.supporting_lookup(CoreTraversal.machine_facts(machine), target)
    ),
    observed_found(
      machine,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      target,
      Spec.supporting(CoreTraversal.machine_facts(machine), target)
    ),
    lookup_exact(
      CoreTraversal.supporting_lookup(CoreTraversal.machine_facts(machine), target),
      fuel,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      target
    ),
    Equal.cong(
      Maybe<&2, Core.Declaration>,
      Relation.Observation,
      observed_found(machine, fuel, owner, index, symbol, depth, expected, target),
      CoreTraversal.supporting_lookup(CoreTraversal.machine_facts(machine), target),
      Spec.supporting(CoreTraversal.machine_facts(machine), target),
      State.supporting_lookup_exact(CoreTraversal.machine_facts(machine), target)
    )
  )
