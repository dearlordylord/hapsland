import Base
import ./core.bend as Core

# Draft-time declaration: proposed laws awaiting Astra review; no proofs written yet.
def command_spec(phase: Core.Phase, scope_present: Bool, plan_present: Bool) -> Core.Command:
  match phase:
    case Core.RulesPreviewing{}: Bool.pick(
      Core.Command,
      scope_present,
      Core.RulesPreviewCommand{},
      Core.RulesNoCommand{}
    )
    case Core.RulesApplying{}: Bool.pick(
      Core.Command,
      plan_present,
      Core.RulesApplyCommand{},
      Core.RulesNoCommand{}
    )
    case _: Core.RulesNoCommand{}

def transition_spec(
  phase: Core.Phase,
  action: Core.Action,
  plan_matches: Bool,
  digest_matches: Bool,
  yes: Bool,
  stale: Bool
) -> Core.Plan:
  match phase action:
    case Core.RulesPreview{} Core.RulesBack{}: Core.RulesAdvance{
      Core.RulesScope{},
      Core.RulesClearPlanOutcomePatch{}
    }
    case Core.RulesPreviewing{} Core.RulesBack{}: Core.RulesAdvance{
      Core.RulesScope{},
      Core.RulesClearPlanOutcomePatch{}
    }
    case Core.RulesApproval{} Core.RulesBack{}: Core.RulesAdvance{
      Core.RulesPreview{},
      Core.RulesNoPatch{}
    }
    case Core.RulesScope{} Core.RulesExit{}: Core.RulesAdvance{
      Core.RulesCancelled{},
      Core.RulesClearPlanPatch{}
    }
    case Core.RulesPreviewing{} Core.RulesExit{}: Core.RulesAdvance{
      Core.RulesCancelled{},
      Core.RulesClearPlanPatch{}
    }
    case Core.RulesPreview{} Core.RulesExit{}: Core.RulesAdvance{
      Core.RulesCancelled{},
      Core.RulesClearPlanPatch{}
    }
    case Core.RulesApproval{} Core.RulesExit{}: Core.RulesAdvance{
      Core.RulesCancelled{},
      Core.RulesClearPlanPatch{}
    }
    case Core.RulesScope{} Core.RulesScopeSelected{}: Core.RulesAdvance{
      Core.RulesPreviewing{},
      Core.RulesScopePatch{}
    }
    case Core.RulesPreviewing{} Core.RulesPreviewed{}: Bool.pick(
      Core.Plan,
      plan_matches,
      Core.RulesAdvance{Core.RulesPreview{}, Core.RulesPreviewPatch{}},
      Core.RulesHold{}
    )
    case Core.RulesPreview{} Core.RulesContinue{}: Core.RulesAdvance{
      Core.RulesApproval{},
      Core.RulesNoPatch{}
    }
    case Core.RulesApproval{} Core.RulesApprove{}: Bool.pick(
      Core.Plan,
      digest_matches,
      Bool.pick(
        Core.Plan,
        yes,
        Core.RulesAdvance{Core.RulesApplying{}, Core.RulesNoPatch{}},
        Core.RulesAdvance{Core.RulesDone{}, Core.RulesDeclinedPatch{}}
      ),
      Core.RulesHold{}
    )
    case Core.RulesApplying{} Core.RulesObserved{}: Bool.pick(
      Core.Plan,
      stale,
      Core.RulesAdvance{Core.RulesPreviewing{}, Core.RulesStalePatch{}},
      Core.RulesAdvance{Core.RulesDone{}, Core.RulesOutcomePatch{}}
    )
    case _ _: Core.RulesHold{}

law command_exact:
  for +phase: Core.Phase
  for +scope_present: Bool
  for +plan_present: Bool
  {
    Core.command(phase, scope_present, plan_present)
    == command_spec(phase, scope_present, plan_present)
    : Core.Command
  }

law step_exact:
  for +phase: Core.Phase
  for +action: Core.Action
  for +current: Bool
  for +plan_matches: Bool
  for +digest_matches: Bool
  for +yes: Bool
  for +stale: Bool
  {
    Core.step(phase, action, current, plan_matches, digest_matches, yes, stale)
    == Bool.pick(
      Core.Plan,
      current,
      transition_spec(phase, action, plan_matches, digest_matches, yes, stale),
      Core.RulesHold{}
    )
    : Core.Plan
  }
