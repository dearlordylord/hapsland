import Base

# Source-free rules conversation policy; rule owners retain proposal payloads and writes.
type Phase is Data:
  RulesScope{}
  RulesPreviewing{}
  RulesPreview{}
  RulesApproval{}
  RulesApplying{}
  RulesDone{}
  RulesCancelled{}

type Action is Data:
  RulesScopeSelected{}
  RulesContinue{}
  RulesApprove{}
  RulesBack{}
  RulesExit{}
  RulesPreviewed{}
  RulesObserved{}

type Patch is Data:
  RulesNoPatch{}
  RulesScopePatch{}
  RulesClearPlanOutcomePatch{}
  RulesPreviewPatch{}
  RulesDeclinedPatch{}
  RulesStalePatch{}
  RulesOutcomePatch{}
  RulesClearPlanPatch{}

type Command is Data:
  RulesPreviewCommand{}
  RulesApplyCommand{}
  RulesNoCommand{}

type Plan is Data:
  RulesHold{}
  RulesAdvance{phase: Phase, patch: Patch}

def command(phase: Phase, scope_present: Bool, plan_present: Bool) -> Command:
  match phase:
    case RulesPreviewing{}: Bool.pick(
      Command,
      scope_present,
      RulesPreviewCommand{},
      RulesNoCommand{}
    )
    case RulesApplying{}: Bool.pick(Command, plan_present, RulesApplyCommand{}, RulesNoCommand{})
    case _: RulesNoCommand{}

def current_step(
  phase: Phase,
  action: Action,
  plan_matches: Bool,
  digest_matches: Bool,
  yes: Bool,
  stale: Bool
) -> Plan:
  match phase action:
    case RulesPreview{} RulesBack{}: RulesAdvance{RulesScope{}, RulesClearPlanOutcomePatch{}}
    case RulesPreviewing{} RulesBack{}: RulesAdvance{RulesScope{}, RulesClearPlanOutcomePatch{}}
    case RulesApproval{} RulesBack{}: RulesAdvance{RulesPreview{}, RulesNoPatch{}}
    case RulesScope{} RulesExit{}: RulesAdvance{RulesCancelled{}, RulesClearPlanPatch{}}
    case RulesPreviewing{} RulesExit{}: RulesAdvance{RulesCancelled{}, RulesClearPlanPatch{}}
    case RulesPreview{} RulesExit{}: RulesAdvance{RulesCancelled{}, RulesClearPlanPatch{}}
    case RulesApproval{} RulesExit{}: RulesAdvance{RulesCancelled{}, RulesClearPlanPatch{}}
    case RulesScope{} RulesScopeSelected{}: RulesAdvance{RulesPreviewing{}, RulesScopePatch{}}
    case RulesPreviewing{} RulesPreviewed{}: Bool.pick(
      Plan,
      plan_matches,
      RulesAdvance{RulesPreview{}, RulesPreviewPatch{}},
      RulesHold{}
    )
    case RulesPreview{} RulesContinue{}: RulesAdvance{RulesApproval{}, RulesNoPatch{}}
    case RulesApproval{} RulesApprove{}: Bool.pick(
      Plan,
      digest_matches,
      Bool.pick(
        Plan,
        yes,
        RulesAdvance{RulesApplying{}, RulesNoPatch{}},
        RulesAdvance{RulesDone{}, RulesDeclinedPatch{}}
      ),
      RulesHold{}
    )
    case RulesApplying{} RulesObserved{}: Bool.pick(
      Plan,
      stale,
      RulesAdvance{RulesPreviewing{}, RulesStalePatch{}},
      RulesAdvance{RulesDone{}, RulesOutcomePatch{}}
    )
    case _ _: RulesHold{}

def step(
  phase: Phase,
  action: Action,
  current: Bool,
  plan_matches: Bool,
  digest_matches: Bool,
  yes: Bool,
  stale: Bool
) -> Plan:
  Bool.pick(
    Plan,
    current,
    current_step(phase, action, plan_matches, digest_matches, yes, stale),
    RulesHold{}
  )
