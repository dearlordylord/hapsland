import Base

# Setup decisions. Native owners retain observations, digests, tokens and IO.
type Phase is Data:
  SetupPreviewing{}
  SetupHookApproval{}
  SetupRulesApproval{}
  SetupApplying{}
  SetupActivating{}
  SetupVerifying{}
  SetupDiagnosing{}
  SetupDone{}
  SetupCancelled{}
  SetupBack{}
  SetupFailed{}

type Command is Data:
  SetupPreview{}
  SetupApply{}
  SetupActivate{}
  SetupVerify{}
  SetupDiagnose{}
  SetupNoCommand{}

type StageStatus is Data:
  SetupComplete{}
  SetupPending{}
  SetupPartial{}
  SetupSkipped{}
  SetupMissing{}
  SetupOther{}

def command(phase: Phase) -> Command:
  match phase:
    case SetupPreviewing{}: SetupPreview{}
    case SetupApplying{}: SetupApply{}
    case SetupActivating{}: SetupActivate{}
    case SetupVerifying{}: SetupVerify{}
    case SetupDiagnosing{}: SetupDiagnose{}
    case _: SetupNoCommand{}

def complete(status: StageStatus) -> Bool:
  match status:
    case SetupComplete{}: True{}
    case _: False{}

def installation_can_proceed(status: StageStatus) -> Bool:
  match status:
    case SetupComplete{}: True{}
    case SetupPending{}: True{}
    case SetupPartial{}: True{}
    case _: False{}

def installation_was_written(status: StageStatus) -> Bool:
  match status:
    case SetupComplete{}: True{}
    case SetupPartial{}: True{}
    case _: False{}

def rules_ready(status: StageStatus) -> Bool:
  match status:
    case SetupComplete{}: True{}
    case SetupSkipped{}: True{}
    case SetupMissing{}: True{}
    case _: False{}

def observation_ready(installation: StageStatus, credential: StageStatus,
                      repository: StageStatus, rules: StageStatus) -> Bool:
  complete(installation) && complete(credential) && complete(repository) && rules_ready(rules)

type Action is Data:
  SetupProgressed{}
  SetupPreviewed{}
  SetupApplied{}
  SetupApproveHooks{}
  SetupApproveRules{}
  SetupActivated{}
  SetupStale{}
  SetupActionFailed{}
  SetupVerified{}
  SetupDiagnosed{}
  SetupNavigateBack{}
  SetupExit{}

type Patch is Data:
  SetupNoPatch{}
  SetupPreviewPatch{}
  SetupAppendPatch{}
  SetupFreshProposalPatch{}
  SetupInstallApprovalPatch{}
  SetupRulesApprovalPatch{}
  SetupClearApprovalsPatch{}
  SetupActivatedPatch{}
  SetupVerificationPatch{}
  SetupDiagnosisPatch{}
  SetupFailedActivationPatch{}

type ExitChoice is Data:
  SetupKeepExit{}
  SetupExitZero{}
  SetupExitThree{}
  SetupExitFour{}
  SetupExitFive{}
  SetupExitSix{}

type Plan is Data:
  SetupHold{}
  SetupProgress{}
  SetupAdvance{phase: Phase, patch: Patch, exit: ExitChoice}

def approval_phase(install_digest: Bool, rules_digest: Bool) -> Phase:
  Bool.pick(Phase, install_digest, SetupHookApproval{},
    Bool.pick(Phase, rules_digest, SetupRulesApproval{}, SetupApplying{}))

def preview_plan(compat_ok: Bool, proceed: Bool, partial: Bool,
                 install_digest: Bool, rules_digest: Bool) -> Plan:
  Bool.pick(
    Plan,
    compat_ok,
    Bool.pick(
      Plan,
      proceed,
      SetupAdvance{
        approval_phase(install_digest, rules_digest),
        SetupPreviewPatch{},
        SetupKeepExit{}
      },
      SetupAdvance{
        SetupDone{},
        SetupPreviewPatch{},
        Bool.pick(ExitChoice, partial, SetupExitFive{}, SetupExitFour{})
      }
    ),
    SetupAdvance{SetupDone{}, SetupPreviewPatch{}, SetupExitThree{}}
  )

def after_activation_plan(+patch: Patch, cancelled: Bool, +ready: Bool, partial: Bool) -> Plan:
  Bool.pick(Plan, cancelled,
    SetupAdvance{SetupCancelled{}, patch, SetupKeepExit{}},
    SetupAdvance{Bool.pick(Phase, ready, SetupVerifying{}, SetupDone{}), patch,
      Bool.pick(ExitChoice, ready, SetupExitZero{},
        Bool.pick(ExitChoice, partial, SetupExitFive{}, SetupExitSix{}))})

def applied_plan(written: Bool, pending: Bool, install_present: Bool,
                 install_digest: Bool, rules_digest: Bool,
                 cancelled: Bool, ready: Bool, partial: Bool) -> Plan:
  Bool.pick(
    Plan,
    written,
    SetupAdvance{SetupActivating{}, SetupAppendPatch{}, SetupKeepExit{}},
    Bool.pick(
      Plan,
      cancelled,
      SetupAdvance{SetupCancelled{}, SetupAppendPatch{}, SetupKeepExit{}},
      Bool.pick(
        Plan,
        Bool.and(pending, install_present),
        SetupAdvance{
          approval_phase(install_digest, rules_digest),
          SetupFreshProposalPatch{},
          SetupKeepExit{}
        },
        after_activation_plan(SetupAppendPatch{}, False{}, ready, partial)
      )
    )
  )

def current_step(phase: Phase, action: Action,
                 compat_ok: Bool, proceed: Bool, written: Bool, pending: Bool,
                 install_digest: Bool, install_present: Bool, rules_digest: Bool,
                 digest_match: Bool, yes: Bool, ready: Bool, cancelled: Bool,
                 partial: Bool, sequence_next: Bool, succeeded: Bool) -> Plan:
  match phase action:
    case SetupHookApproval{} SetupNavigateBack{}:
      SetupAdvance{SetupBack{}, SetupClearApprovalsPatch{}, SetupKeepExit{}}
    case SetupRulesApproval{} SetupNavigateBack{}:
      SetupAdvance{SetupPreviewing{}, SetupClearApprovalsPatch{}, SetupKeepExit{}}
    case SetupHookApproval{} SetupExit{}:
      SetupAdvance{SetupCancelled{}, SetupNoPatch{}, SetupKeepExit{}}
    case SetupRulesApproval{} SetupExit{}:
      SetupAdvance{SetupCancelled{}, SetupNoPatch{}, SetupKeepExit{}}
    case SetupPreviewing{} SetupActionFailed{}:
      SetupAdvance{SetupFailed{}, SetupNoPatch{}, SetupExitSix{}}
    case SetupApplying{} SetupActionFailed{}:
      SetupAdvance{SetupFailed{}, SetupNoPatch{}, SetupExitSix{}}
    case SetupActivating{} SetupActionFailed{}:
      SetupAdvance{SetupFailed{}, SetupFailedActivationPatch{}, SetupExitSix{}}
    case SetupVerifying{} SetupActionFailed{}:
      SetupAdvance{SetupFailed{}, SetupNoPatch{}, SetupExitSix{}}
    case SetupDiagnosing{} SetupActionFailed{}:
      SetupAdvance{SetupFailed{}, SetupNoPatch{}, SetupExitSix{}}
    case SetupPreviewing{} SetupPreviewed{}:
      preview_plan(compat_ok, proceed, partial, install_digest, rules_digest)
    case SetupHookApproval{} SetupApproveHooks{}:
      Bool.pick(Plan, digest_match,
        Bool.pick(Plan, yes,
          SetupAdvance{Bool.pick(Phase, rules_digest, SetupRulesApproval{}, SetupApplying{}),
            SetupInstallApprovalPatch{}, SetupKeepExit{}},
          SetupAdvance{SetupDone{}, SetupNoPatch{}, SetupKeepExit{}}), SetupHold{})
    case SetupRulesApproval{} SetupApproveRules{}:
      Bool.pick(Plan, digest_match,
        Bool.pick(Plan, yes,
          SetupAdvance{SetupApplying{}, SetupRulesApprovalPatch{}, SetupKeepExit{}},
          SetupAdvance{SetupDone{}, SetupNoPatch{}, SetupKeepExit{}}), SetupHold{})
    case SetupApplying{} SetupProgressed{}:
      Bool.pick(Plan, sequence_next, SetupProgress{}, SetupHold{})
    case SetupApplying{} SetupApplied{}:
      applied_plan(
        written,
        pending,
        install_present,
        install_digest,
        rules_digest,
        cancelled,
        ready,
        partial
      )
    case SetupApplying{} SetupStale{}:
      SetupAdvance{SetupPreviewing{}, SetupClearApprovalsPatch{}, SetupKeepExit{}}
    case SetupActivating{} SetupActivated{}:
      after_activation_plan(SetupActivatedPatch{}, cancelled, ready, partial)
    case SetupVerifying{} SetupVerified{}:
      SetupAdvance{Bool.pick(Phase, cancelled, SetupCancelled{}, SetupDiagnosing{}),
        SetupVerificationPatch{}, SetupKeepExit{}}
    case SetupDiagnosing{} SetupDiagnosed{}:
      SetupAdvance{SetupDone{}, SetupDiagnosisPatch{},
        Bool.pick(ExitChoice, succeeded, SetupExitZero{}, SetupExitSix{})}
    case _ _: SetupHold{}

def step(phase: Phase, action: Action, current: Bool,
         compat_ok: Bool, proceed: Bool, written: Bool, pending: Bool,
         install_digest: Bool, install_present: Bool, rules_digest: Bool,
         digest_match: Bool, yes: Bool, ready: Bool, cancelled: Bool,
         partial: Bool, sequence_next: Bool, succeeded: Bool) -> Plan:
  Bool.pick(Plan, current,
    current_step(phase, action, compat_ok, proceed, written, pending,
      install_digest, install_present, rules_digest, digest_match, yes,
      ready, cancelled, partial, sequence_next, succeeded), SetupHold{})
