import Base

# Frozen authority of one active response attempt; no retained lookup state.
type Reason is Data:
  Backend{}
  Credential{}
  Capacity{}
  Stale{}
  Lost{}
  Expired{}

type CollectGate is Data:
  CollectProceed{}
  CollectUnavailable{reason: Reason}

type FinalAuthority is Data:
  FinalProceed{}
  FinalRelease{}

# Expiry and current credential authority guard collection independently of work outcome.
def collect_gate(expired: Bool, credential_valid: Bool) -> CollectGate:
  Bool.pick(CollectGate, expired, CollectUnavailable{Expired{}},
    Bool.pick(CollectGate, Bool.not(credential_valid),
      CollectUnavailable{Credential{}}, CollectProceed{}))

# A block-mode response cannot hand off its leased selection after opt-in is revoked.
def final_authority(admitted_block: Bool, current_block: Bool) -> FinalAuthority:
  Bool.pick(FinalAuthority, Bool.and(admitted_block, Bool.not(current_block)),
    FinalRelease{}, FinalProceed{})

def main() -> CollectGate:
  collect_gate(False{}, True{})
