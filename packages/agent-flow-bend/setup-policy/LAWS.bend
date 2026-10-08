import Base
import ./core.bend as Core

# Initial setup laws approved as written by delegated Astra on 2026-10-08.
# Transition laws and production qualification remain separate.
# Command selection grants no consent and does not establish completed effects.
def command_spec(phase: Core.Phase) -> Core.Command:
  match phase:
    case Core.SetupPreviewing{}: Core.SetupPreview{}
    case Core.SetupHookApproval{}: Core.SetupNoCommand{}
    case Core.SetupRulesApproval{}: Core.SetupNoCommand{}
    case Core.SetupApplying{}: Core.SetupApply{}
    case Core.SetupActivating{}: Core.SetupActivate{}
    case Core.SetupVerifying{}: Core.SetupVerify{}
    case Core.SetupDiagnosing{}: Core.SetupDiagnose{}
    case Core.SetupDone{}: Core.SetupNoCommand{}
    case Core.SetupCancelled{}: Core.SetupNoCommand{}
    case Core.SetupBack{}: Core.SetupNoCommand{}
    case Core.SetupFailed{}: Core.SetupNoCommand{}

law command_exact:
  for +phase: Core.Phase
  {Core.command(phase) == command_spec(phase) : Core.Command}

# Pending installation can proceed but cannot claim that installation was written.
def proceed_spec(status: Core.StageStatus) -> Bool:
  match status:
    case Core.SetupComplete{}: True{}
    case Core.SetupPending{}: True{}
    case Core.SetupPartial{}: True{}
    case Core.SetupSkipped{}: False{}
    case Core.SetupMissing{}: False{}
    case Core.SetupOther{}: False{}

law installation_proceed_exact:
  for +status: Core.StageStatus
  {Core.installation_can_proceed(status) == proceed_spec(status) : Bool}

# Only complete and partial observations report a written installation.
def written_spec(status: Core.StageStatus) -> Bool:
  match status:
    case Core.SetupComplete{}: True{}
    case Core.SetupPartial{}: True{}
    case Core.SetupPending{}: False{}
    case Core.SetupSkipped{}: False{}
    case Core.SetupMissing{}: False{}
    case Core.SetupOther{}: False{}

law installation_written_exact:
  for +status: Core.StageStatus
  {Core.installation_was_written(status) == written_spec(status) : Bool}

# Readiness requires all three mandatory stages; missing or skipped rules are allowed.
def ready_spec(installation: Core.StageStatus, credential: Core.StageStatus,
               repository: Core.StageStatus, rules: Core.StageStatus) -> Bool:
  match installation credential repository rules:
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{}: True{}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{} Core.SetupSkipped{}: True{}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{} Core.SetupMissing{}: True{}
    case _ _ _ _: False{}

law readiness_exact:
  for +installation: Core.StageStatus
  for +credential: Core.StageStatus
  for +repository: Core.StageStatus
  for +rules: Core.StageStatus
  {Core.observation_ready(installation, credential, repository, rules)
   == ready_spec(installation, credential, repository, rules) : Bool}

# Transition law approved as written by delegated Astra on 2026-10-08.
# Independent plan specifications below.
# Host materializers: Advance increments revision and resets progressSequence to zero;
# Progress preserves phase/revision and appends exactly one observation at action.sequence.
# Preview appends observation, replaces proposal, and clears both approval digests.
# FreshProposal does the same after applied; Append adds one observation only.
# Approval patches retain the exact action digest; ClearApprovals retains proposal.
# Activated marks completed; FailedActivation marks failed; both retain observations.
# Verification/Diagnosis retain the exact safe outcome/status; exit choice changes only exitCode.
# KeepExit preserves the previous exitCode. NoPatch preserves all other native fields.
# install_digest/rules_digest mean JS truthiness; install_present means !== undefined.
# current means exact revision and optional commandId equality; sequence_next means exact +1 equality.
# Stage facts and readiness must be supplied through the separately approved Bend classifiers.
def approval_phase_spec(install_digest: Bool, rules_digest: Bool) -> Core.Phase:
  Bool.pick(Core.Phase, install_digest, Core.SetupHookApproval{},
    Bool.pick(Core.Phase, rules_digest, Core.SetupRulesApproval{}, Core.SetupApplying{}))

def preview_plan_spec(compat_ok: Bool, proceed: Bool, partial: Bool,
                 install_digest: Bool, rules_digest: Bool) -> Core.Plan:
  Bool.pick(
    Core.Plan,
    compat_ok,
    Bool.pick(
      Core.Plan,
      proceed,
      Core.SetupAdvance{
        approval_phase_spec(install_digest, rules_digest),
        Core.SetupPreviewPatch{},
        Core.SetupKeepExit{}
      },
      Core.SetupAdvance{
        Core.SetupDone{},
        Core.SetupPreviewPatch{},
        Bool.pick(Core.ExitChoice, partial, Core.SetupExitFive{}, Core.SetupExitFour{})
      }
    ),
    Core.SetupAdvance{Core.SetupDone{}, Core.SetupPreviewPatch{}, Core.SetupExitThree{}}
  )

def after_activation_plan_spec(
  +patch: Core.Patch,
  cancelled: Bool,
  +ready: Bool,
  partial: Bool
) -> Core.Plan:
  Bool.pick(Core.Plan, cancelled,
    Core.SetupAdvance{Core.SetupCancelled{}, patch, Core.SetupKeepExit{}},
    Core.SetupAdvance{Bool.pick(Core.Phase, ready, Core.SetupVerifying{}, Core.SetupDone{}), patch,
      Bool.pick(Core.ExitChoice, ready, Core.SetupExitZero{},
        Bool.pick(Core.ExitChoice, partial, Core.SetupExitFive{}, Core.SetupExitSix{}))})

def applied_plan_spec(written: Bool, pending: Bool, install_present: Bool,
                 install_digest: Bool, rules_digest: Bool,
                 cancelled: Bool, ready: Bool, partial: Bool) -> Core.Plan:
  Bool.pick(
    Core.Plan,
    written,
    Core.SetupAdvance{Core.SetupActivating{}, Core.SetupAppendPatch{}, Core.SetupKeepExit{}},
    Bool.pick(
      Core.Plan,
      cancelled,
      Core.SetupAdvance{Core.SetupCancelled{}, Core.SetupAppendPatch{}, Core.SetupKeepExit{}},
      Bool.pick(
        Core.Plan,
        Bool.and(pending, install_present),
        Core.SetupAdvance{
          approval_phase_spec(install_digest, rules_digest),
          Core.SetupFreshProposalPatch{},
          Core.SetupKeepExit{}
        },
        after_activation_plan_spec(Core.SetupAppendPatch{}, False{}, ready, partial)
      )
    )
  )

def current_step_spec(phase: Core.Phase, action: Core.Action,
                 compat_ok: Bool, proceed: Bool, written: Bool, pending: Bool,
                 install_digest: Bool, install_present: Bool, rules_digest: Bool,
                 digest_match: Bool, yes: Bool, ready: Bool, cancelled: Bool,
                 partial: Bool, sequence_next: Bool, succeeded: Bool) -> Core.Plan:
  match phase action:
    case Core.SetupHookApproval{} Core.SetupNavigateBack{}:
      Core.SetupAdvance{Core.SetupBack{}, Core.SetupClearApprovalsPatch{}, Core.SetupKeepExit{}}
    case Core.SetupRulesApproval{} Core.SetupNavigateBack{}:
      Core.SetupAdvance{
        Core.SetupPreviewing{},
        Core.SetupClearApprovalsPatch{},
        Core.SetupKeepExit{}
      }
    case Core.SetupHookApproval{} Core.SetupExit{}:
      Core.SetupAdvance{Core.SetupCancelled{}, Core.SetupNoPatch{}, Core.SetupKeepExit{}}
    case Core.SetupRulesApproval{} Core.SetupExit{}:
      Core.SetupAdvance{Core.SetupCancelled{}, Core.SetupNoPatch{}, Core.SetupKeepExit{}}
    case Core.SetupPreviewing{} Core.SetupActionFailed{}:
      Core.SetupAdvance{Core.SetupFailed{}, Core.SetupNoPatch{}, Core.SetupExitSix{}}
    case Core.SetupApplying{} Core.SetupActionFailed{}:
      Core.SetupAdvance{Core.SetupFailed{}, Core.SetupNoPatch{}, Core.SetupExitSix{}}
    case Core.SetupActivating{} Core.SetupActionFailed{}:
      Core.SetupAdvance{Core.SetupFailed{}, Core.SetupFailedActivationPatch{}, Core.SetupExitSix{}}
    case Core.SetupVerifying{} Core.SetupActionFailed{}:
      Core.SetupAdvance{Core.SetupFailed{}, Core.SetupNoPatch{}, Core.SetupExitSix{}}
    case Core.SetupDiagnosing{} Core.SetupActionFailed{}:
      Core.SetupAdvance{Core.SetupFailed{}, Core.SetupNoPatch{}, Core.SetupExitSix{}}
    case Core.SetupPreviewing{} Core.SetupPreviewed{}:
      preview_plan_spec(compat_ok, proceed, partial, install_digest, rules_digest)
    case Core.SetupHookApproval{} Core.SetupApproveHooks{}:
      Bool.pick(
        Core.Plan,
        digest_match,
        Bool.pick(
          Core.Plan,
          yes,
          Core.SetupAdvance{
            Bool.pick(Core.Phase, rules_digest, Core.SetupRulesApproval{}, Core.SetupApplying{}),
            Core.SetupInstallApprovalPatch{},
            Core.SetupKeepExit{}
          },
          Core.SetupAdvance{Core.SetupDone{}, Core.SetupNoPatch{}, Core.SetupKeepExit{}}
        ),
        Core.SetupHold{}
      )
    case Core.SetupRulesApproval{} Core.SetupApproveRules{}:
      Bool.pick(
        Core.Plan,
        digest_match,
        Bool.pick(
          Core.Plan,
          yes,
          Core.SetupAdvance{
            Core.SetupApplying{},
            Core.SetupRulesApprovalPatch{},
            Core.SetupKeepExit{}
          },
          Core.SetupAdvance{Core.SetupDone{}, Core.SetupNoPatch{}, Core.SetupKeepExit{}}
        ),
        Core.SetupHold{}
      )
    case Core.SetupApplying{} Core.SetupProgressed{}:
      Bool.pick(Core.Plan, sequence_next, Core.SetupProgress{}, Core.SetupHold{})
    case Core.SetupApplying{} Core.SetupApplied{}:
      applied_plan_spec(
        written,
        pending,
        install_present,
        install_digest,
        rules_digest,
        cancelled,
        ready,
        partial
      )
    case Core.SetupApplying{} Core.SetupStale{}:
      Core.SetupAdvance{
        Core.SetupPreviewing{},
        Core.SetupClearApprovalsPatch{},
        Core.SetupKeepExit{}
      }
    case Core.SetupActivating{} Core.SetupActivated{}:
      after_activation_plan_spec(Core.SetupActivatedPatch{}, cancelled, ready, partial)
    case Core.SetupVerifying{} Core.SetupVerified{}:
      Core.SetupAdvance{
        Bool.pick(Core.Phase, cancelled, Core.SetupCancelled{}, Core.SetupDiagnosing{}),
        Core.SetupVerificationPatch{},
        Core.SetupKeepExit{}
      }
    case Core.SetupDiagnosing{} Core.SetupDiagnosed{}:
      Core.SetupAdvance{Core.SetupDone{}, Core.SetupDiagnosisPatch{},
        Bool.pick(Core.ExitChoice, succeeded, Core.SetupExitZero{}, Core.SetupExitSix{})}
    case _ _: Core.SetupHold{}

# Exact transitions, including mismatches, terminal holds, and activation-before-cancellation.
law step_exact:
  for +phase: Core.Phase
  for +action: Core.Action
  for +current: Bool
  for +compat_ok: Bool
  for +proceed: Bool
  for +written: Bool
  for +pending: Bool
  for +install_digest: Bool
  for +install_present: Bool
  for +rules_digest: Bool
  for +digest_match: Bool
  for +yes: Bool
  for +ready: Bool
  for +cancelled: Bool
  for +partial: Bool
  for +sequence_next: Bool
  for +succeeded: Bool
  {
    Core.step(
      phase,
      action,
      current,
      compat_ok,
      proceed,
      written,
      pending,
      install_digest,
      install_present,
      rules_digest,
      digest_match,
      yes,
      ready,
      cancelled,
      partial,
      sequence_next,
      succeeded
    )
    == Bool.pick(
      Core.Plan,
      current,
      current_step_spec(
        phase,
        action,
        compat_ok,
        proceed,
        written,
        pending,
        install_digest,
        install_present,
        rules_digest,
        digest_match,
        yes,
        ready,
        cancelled,
        partial,
        sequence_next,
        succeeded
      ),
      Core.SetupHold{}
    )
    : Core.Plan
  }
