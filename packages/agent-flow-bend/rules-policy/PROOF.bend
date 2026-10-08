import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

# ---- command_exact ----
def Laws.command_exact(phase, scope_present, plan_present):
  match phase:
    case Core.RulesScope{}: {==}
    case Core.RulesPreviewing{}: {==}
    case Core.RulesPreview{}: {==}
    case Core.RulesApproval{}: {==}
    case Core.RulesApplying{}: {==}
    case Core.RulesDone{}: {==}
    case Core.RulesCancelled{}: {==}

# ---- step_exact ----
def Laws.step_exact(phase, action, current, plan_matches, digest_matches, yes, stale):
  match phase action current:
    case Core.RulesScope{} Core.RulesScopeSelected{} False{}: {==}
    case Core.RulesScope{} Core.RulesScopeSelected{} True{}: {==}
    case Core.RulesScope{} Core.RulesContinue{} False{}: {==}
    case Core.RulesScope{} Core.RulesContinue{} True{}: {==}
    case Core.RulesScope{} Core.RulesApprove{} False{}: {==}
    case Core.RulesScope{} Core.RulesApprove{} True{}: {==}
    case Core.RulesScope{} Core.RulesBack{} False{}: {==}
    case Core.RulesScope{} Core.RulesBack{} True{}: {==}
    case Core.RulesScope{} Core.RulesExit{} False{}: {==}
    case Core.RulesScope{} Core.RulesExit{} True{}: {==}
    case Core.RulesScope{} Core.RulesPreviewed{} False{}: {==}
    case Core.RulesScope{} Core.RulesPreviewed{} True{}: {==}
    case Core.RulesScope{} Core.RulesObserved{} False{}: {==}
    case Core.RulesScope{} Core.RulesObserved{} True{}: {==}
    case Core.RulesPreviewing{} Core.RulesScopeSelected{} False{}: {==}
    case Core.RulesPreviewing{} Core.RulesScopeSelected{} True{}: {==}
    case Core.RulesPreviewing{} Core.RulesContinue{} False{}: {==}
    case Core.RulesPreviewing{} Core.RulesContinue{} True{}: {==}
    case Core.RulesPreviewing{} Core.RulesApprove{} False{}: {==}
    case Core.RulesPreviewing{} Core.RulesApprove{} True{}: {==}
    case Core.RulesPreviewing{} Core.RulesBack{} False{}: {==}
    case Core.RulesPreviewing{} Core.RulesBack{} True{}: {==}
    case Core.RulesPreviewing{} Core.RulesExit{} False{}: {==}
    case Core.RulesPreviewing{} Core.RulesExit{} True{}: {==}
    case Core.RulesPreviewing{} Core.RulesPreviewed{} False{}: {==}
    case Core.RulesPreviewing{} Core.RulesPreviewed{} True{}: {==}
    case Core.RulesPreviewing{} Core.RulesObserved{} False{}: {==}
    case Core.RulesPreviewing{} Core.RulesObserved{} True{}: {==}
    case Core.RulesPreview{} Core.RulesScopeSelected{} False{}: {==}
    case Core.RulesPreview{} Core.RulesScopeSelected{} True{}: {==}
    case Core.RulesPreview{} Core.RulesContinue{} False{}: {==}
    case Core.RulesPreview{} Core.RulesContinue{} True{}: {==}
    case Core.RulesPreview{} Core.RulesApprove{} False{}: {==}
    case Core.RulesPreview{} Core.RulesApprove{} True{}: {==}
    case Core.RulesPreview{} Core.RulesBack{} False{}: {==}
    case Core.RulesPreview{} Core.RulesBack{} True{}: {==}
    case Core.RulesPreview{} Core.RulesExit{} False{}: {==}
    case Core.RulesPreview{} Core.RulesExit{} True{}: {==}
    case Core.RulesPreview{} Core.RulesPreviewed{} False{}: {==}
    case Core.RulesPreview{} Core.RulesPreviewed{} True{}: {==}
    case Core.RulesPreview{} Core.RulesObserved{} False{}: {==}
    case Core.RulesPreview{} Core.RulesObserved{} True{}: {==}
    case Core.RulesApproval{} Core.RulesScopeSelected{} False{}: {==}
    case Core.RulesApproval{} Core.RulesScopeSelected{} True{}: {==}
    case Core.RulesApproval{} Core.RulesContinue{} False{}: {==}
    case Core.RulesApproval{} Core.RulesContinue{} True{}: {==}
    case Core.RulesApproval{} Core.RulesApprove{} False{}: {==}
    case Core.RulesApproval{} Core.RulesApprove{} True{}: {==}
    case Core.RulesApproval{} Core.RulesBack{} False{}: {==}
    case Core.RulesApproval{} Core.RulesBack{} True{}: {==}
    case Core.RulesApproval{} Core.RulesExit{} False{}: {==}
    case Core.RulesApproval{} Core.RulesExit{} True{}: {==}
    case Core.RulesApproval{} Core.RulesPreviewed{} False{}: {==}
    case Core.RulesApproval{} Core.RulesPreviewed{} True{}: {==}
    case Core.RulesApproval{} Core.RulesObserved{} False{}: {==}
    case Core.RulesApproval{} Core.RulesObserved{} True{}: {==}
    case Core.RulesApplying{} Core.RulesScopeSelected{} False{}: {==}
    case Core.RulesApplying{} Core.RulesScopeSelected{} True{}: {==}
    case Core.RulesApplying{} Core.RulesContinue{} False{}: {==}
    case Core.RulesApplying{} Core.RulesContinue{} True{}: {==}
    case Core.RulesApplying{} Core.RulesApprove{} False{}: {==}
    case Core.RulesApplying{} Core.RulesApprove{} True{}: {==}
    case Core.RulesApplying{} Core.RulesBack{} False{}: {==}
    case Core.RulesApplying{} Core.RulesBack{} True{}: {==}
    case Core.RulesApplying{} Core.RulesExit{} False{}: {==}
    case Core.RulesApplying{} Core.RulesExit{} True{}: {==}
    case Core.RulesApplying{} Core.RulesPreviewed{} False{}: {==}
    case Core.RulesApplying{} Core.RulesPreviewed{} True{}: {==}
    case Core.RulesApplying{} Core.RulesObserved{} False{}: {==}
    case Core.RulesApplying{} Core.RulesObserved{} True{}: {==}
    case Core.RulesDone{} Core.RulesScopeSelected{} False{}: {==}
    case Core.RulesDone{} Core.RulesScopeSelected{} True{}: {==}
    case Core.RulesDone{} Core.RulesContinue{} False{}: {==}
    case Core.RulesDone{} Core.RulesContinue{} True{}: {==}
    case Core.RulesDone{} Core.RulesApprove{} False{}: {==}
    case Core.RulesDone{} Core.RulesApprove{} True{}: {==}
    case Core.RulesDone{} Core.RulesBack{} False{}: {==}
    case Core.RulesDone{} Core.RulesBack{} True{}: {==}
    case Core.RulesDone{} Core.RulesExit{} False{}: {==}
    case Core.RulesDone{} Core.RulesExit{} True{}: {==}
    case Core.RulesDone{} Core.RulesPreviewed{} False{}: {==}
    case Core.RulesDone{} Core.RulesPreviewed{} True{}: {==}
    case Core.RulesDone{} Core.RulesObserved{} False{}: {==}
    case Core.RulesDone{} Core.RulesObserved{} True{}: {==}
    case Core.RulesCancelled{} Core.RulesScopeSelected{} False{}: {==}
    case Core.RulesCancelled{} Core.RulesScopeSelected{} True{}: {==}
    case Core.RulesCancelled{} Core.RulesContinue{} False{}: {==}
    case Core.RulesCancelled{} Core.RulesContinue{} True{}: {==}
    case Core.RulesCancelled{} Core.RulesApprove{} False{}: {==}
    case Core.RulesCancelled{} Core.RulesApprove{} True{}: {==}
    case Core.RulesCancelled{} Core.RulesBack{} False{}: {==}
    case Core.RulesCancelled{} Core.RulesBack{} True{}: {==}
    case Core.RulesCancelled{} Core.RulesExit{} False{}: {==}
    case Core.RulesCancelled{} Core.RulesExit{} True{}: {==}
    case Core.RulesCancelled{} Core.RulesPreviewed{} False{}: {==}
    case Core.RulesCancelled{} Core.RulesPreviewed{} True{}: {==}
    case Core.RulesCancelled{} Core.RulesObserved{} False{}: {==}
    case Core.RulesCancelled{} Core.RulesObserved{} True{}: {==}
