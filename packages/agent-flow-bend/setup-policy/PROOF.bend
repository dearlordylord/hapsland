import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.command_exact(phase):
  match phase:
    case Core.SetupPreviewing{}: {==}
    case Core.SetupHookApproval{}: {==}
    case Core.SetupRulesApproval{}: {==}
    case Core.SetupApplying{}: {==}
    case Core.SetupActivating{}: {==}
    case Core.SetupVerifying{}: {==}
    case Core.SetupDiagnosing{}: {==}
    case Core.SetupDone{}: {==}
    case Core.SetupCancelled{}: {==}
    case Core.SetupBack{}: {==}
    case Core.SetupFailed{}: {==}

def Laws.installation_proceed_exact(status):
  match status:
    case Core.SetupComplete{}: {==}
    case Core.SetupPending{}: {==}
    case Core.SetupPartial{}: {==}
    case Core.SetupSkipped{}: {==}
    case Core.SetupMissing{}: {==}
    case Core.SetupOther{}: {==}

def Laws.installation_written_exact(status):
  match status:
    case Core.SetupComplete{}: {==}
    case Core.SetupPending{}: {==}
    case Core.SetupPartial{}: {==}
    case Core.SetupSkipped{}: {==}
    case Core.SetupMissing{}: {==}
    case Core.SetupOther{}: {==}

def Laws.readiness_exact(installation, credential, repository, rules):
  match installation credential repository rules:
    case Core.SetupPending{} _ _ _: {==}
    case Core.SetupPartial{} _ _ _: {==}
    case Core.SetupSkipped{} _ _ _: {==}
    case Core.SetupMissing{} _ _ _: {==}
    case Core.SetupOther{} _ _ _: {==}
    case Core.SetupComplete{} Core.SetupPending{} _ _: {==}
    case Core.SetupComplete{} Core.SetupPartial{} _ _: {==}
    case Core.SetupComplete{} Core.SetupSkipped{} _ _: {==}
    case Core.SetupComplete{} Core.SetupMissing{} _ _: {==}
    case Core.SetupComplete{} Core.SetupOther{} _ _: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupPending{} _: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupPartial{} _: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupSkipped{} _: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupMissing{} _: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupOther{} _: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{}: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{} Core.SetupPending{}: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{} Core.SetupPartial{}: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{} Core.SetupSkipped{}: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{} Core.SetupMissing{}: {==}
    case Core.SetupComplete{} Core.SetupComplete{} Core.SetupComplete{} Core.SetupOther{}: {==}

def Laws.step_exact(
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
):
  match phase action current:
    case Core.SetupPreviewing{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupApplied{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupApplied{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupActivated{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupActivated{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupStale{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupStale{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupVerified{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupVerified{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupPreviewing{} Core.SetupExit{} False{}: {==}
    case Core.SetupPreviewing{} Core.SetupExit{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupApplied{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupApplied{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupActivated{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupActivated{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupStale{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupStale{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupVerified{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupVerified{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupHookApproval{} Core.SetupExit{} False{}: {==}
    case Core.SetupHookApproval{} Core.SetupExit{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupApplied{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupApplied{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupActivated{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupActivated{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupStale{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupStale{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupVerified{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupVerified{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupRulesApproval{} Core.SetupExit{} False{}: {==}
    case Core.SetupRulesApproval{} Core.SetupExit{} True{}: {==}
    case Core.SetupApplying{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupApplying{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupApplying{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupApplying{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupApplying{} Core.SetupApplied{} False{}: {==}
    case Core.SetupApplying{} Core.SetupApplied{} True{}: {==}
    case Core.SetupApplying{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupApplying{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupApplying{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupApplying{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupApplying{} Core.SetupActivated{} False{}: {==}
    case Core.SetupApplying{} Core.SetupActivated{} True{}: {==}
    case Core.SetupApplying{} Core.SetupStale{} False{}: {==}
    case Core.SetupApplying{} Core.SetupStale{} True{}: {==}
    case Core.SetupApplying{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupApplying{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupApplying{} Core.SetupVerified{} False{}: {==}
    case Core.SetupApplying{} Core.SetupVerified{} True{}: {==}
    case Core.SetupApplying{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupApplying{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupApplying{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupApplying{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupApplying{} Core.SetupExit{} False{}: {==}
    case Core.SetupApplying{} Core.SetupExit{} True{}: {==}
    case Core.SetupActivating{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupActivating{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupActivating{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupActivating{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupActivating{} Core.SetupApplied{} False{}: {==}
    case Core.SetupActivating{} Core.SetupApplied{} True{}: {==}
    case Core.SetupActivating{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupActivating{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupActivating{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupActivating{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupActivating{} Core.SetupActivated{} False{}: {==}
    case Core.SetupActivating{} Core.SetupActivated{} True{}: {==}
    case Core.SetupActivating{} Core.SetupStale{} False{}: {==}
    case Core.SetupActivating{} Core.SetupStale{} True{}: {==}
    case Core.SetupActivating{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupActivating{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupActivating{} Core.SetupVerified{} False{}: {==}
    case Core.SetupActivating{} Core.SetupVerified{} True{}: {==}
    case Core.SetupActivating{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupActivating{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupActivating{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupActivating{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupActivating{} Core.SetupExit{} False{}: {==}
    case Core.SetupActivating{} Core.SetupExit{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupApplied{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupApplied{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupActivated{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupActivated{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupStale{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupStale{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupVerified{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupVerified{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupVerifying{} Core.SetupExit{} False{}: {==}
    case Core.SetupVerifying{} Core.SetupExit{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupApplied{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupApplied{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupActivated{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupActivated{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupStale{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupStale{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupVerified{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupVerified{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupDiagnosing{} Core.SetupExit{} False{}: {==}
    case Core.SetupDiagnosing{} Core.SetupExit{} True{}: {==}
    case Core.SetupDone{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupDone{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupDone{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupDone{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupDone{} Core.SetupApplied{} False{}: {==}
    case Core.SetupDone{} Core.SetupApplied{} True{}: {==}
    case Core.SetupDone{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupDone{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupDone{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupDone{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupDone{} Core.SetupActivated{} False{}: {==}
    case Core.SetupDone{} Core.SetupActivated{} True{}: {==}
    case Core.SetupDone{} Core.SetupStale{} False{}: {==}
    case Core.SetupDone{} Core.SetupStale{} True{}: {==}
    case Core.SetupDone{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupDone{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupDone{} Core.SetupVerified{} False{}: {==}
    case Core.SetupDone{} Core.SetupVerified{} True{}: {==}
    case Core.SetupDone{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupDone{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupDone{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupDone{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupDone{} Core.SetupExit{} False{}: {==}
    case Core.SetupDone{} Core.SetupExit{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupApplied{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupApplied{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupActivated{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupActivated{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupStale{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupStale{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupVerified{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupVerified{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupCancelled{} Core.SetupExit{} False{}: {==}
    case Core.SetupCancelled{} Core.SetupExit{} True{}: {==}
    case Core.SetupBack{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupBack{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupBack{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupBack{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupBack{} Core.SetupApplied{} False{}: {==}
    case Core.SetupBack{} Core.SetupApplied{} True{}: {==}
    case Core.SetupBack{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupBack{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupBack{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupBack{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupBack{} Core.SetupActivated{} False{}: {==}
    case Core.SetupBack{} Core.SetupActivated{} True{}: {==}
    case Core.SetupBack{} Core.SetupStale{} False{}: {==}
    case Core.SetupBack{} Core.SetupStale{} True{}: {==}
    case Core.SetupBack{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupBack{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupBack{} Core.SetupVerified{} False{}: {==}
    case Core.SetupBack{} Core.SetupVerified{} True{}: {==}
    case Core.SetupBack{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupBack{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupBack{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupBack{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupBack{} Core.SetupExit{} False{}: {==}
    case Core.SetupBack{} Core.SetupExit{} True{}: {==}
    case Core.SetupFailed{} Core.SetupProgressed{} False{}: {==}
    case Core.SetupFailed{} Core.SetupProgressed{} True{}: {==}
    case Core.SetupFailed{} Core.SetupPreviewed{} False{}: {==}
    case Core.SetupFailed{} Core.SetupPreviewed{} True{}: {==}
    case Core.SetupFailed{} Core.SetupApplied{} False{}: {==}
    case Core.SetupFailed{} Core.SetupApplied{} True{}: {==}
    case Core.SetupFailed{} Core.SetupApproveHooks{} False{}: {==}
    case Core.SetupFailed{} Core.SetupApproveHooks{} True{}: {==}
    case Core.SetupFailed{} Core.SetupApproveRules{} False{}: {==}
    case Core.SetupFailed{} Core.SetupApproveRules{} True{}: {==}
    case Core.SetupFailed{} Core.SetupActivated{} False{}: {==}
    case Core.SetupFailed{} Core.SetupActivated{} True{}: {==}
    case Core.SetupFailed{} Core.SetupStale{} False{}: {==}
    case Core.SetupFailed{} Core.SetupStale{} True{}: {==}
    case Core.SetupFailed{} Core.SetupActionFailed{} False{}: {==}
    case Core.SetupFailed{} Core.SetupActionFailed{} True{}: {==}
    case Core.SetupFailed{} Core.SetupVerified{} False{}: {==}
    case Core.SetupFailed{} Core.SetupVerified{} True{}: {==}
    case Core.SetupFailed{} Core.SetupDiagnosed{} False{}: {==}
    case Core.SetupFailed{} Core.SetupDiagnosed{} True{}: {==}
    case Core.SetupFailed{} Core.SetupNavigateBack{} False{}: {==}
    case Core.SetupFailed{} Core.SetupNavigateBack{} True{}: {==}
    case Core.SetupFailed{} Core.SetupExit{} False{}: {==}
    case Core.SetupFailed{} Core.SetupExit{} True{}: {==}
