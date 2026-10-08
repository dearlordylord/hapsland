# Credential verification and replacement interaction

**Purpose:** Show production paid-check consent, source-specific correction and replacement outcomes.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted credential and installation contracts retain authority.
**Expected use:** Understand paid-check consent and recovery; run `npm run interaction:diagrams:check` for non-writing freshness.
**Lifecycle:** Regenerate with `npm run interaction:diagrams:write` when the reducer, interpreter or diagram generation changes; review when accepted verification or credential behavior changes.

Review the active credential source before approving a paid check. Each retry needs fresh approval, with at most three checks. Replacing a saved key needs separate confirmation and private input. For a file credential, correct the file and choose Recheck; for an environment credential, update the launch environment. Busy or uncertain saving stops further checks. A successful key check does not establish agent trust or a completed code review.

```mermaid
flowchart TD
  Loading["Read the active credential source"]
  Approval["Approve a paid key check?"]
  Checking["Check the key"]
  Done["Show the check or save result"]
  Recovery["Choose how to correct the credential"]
  ReplacementApproval["Approve replacing the saved key?"]
  EnteringKey["Enter the replacement key privately"]
  SavingKey["Save the replacement key"]
  Cancelled["End credential verification"]
  Loading -->|"Saved key available"| Approval
  Approval -->|"Yes"| Checking
  Checking -->|"Key accepted"| Done
  Approval -->|"Decline"| Done
  Loading -->|"No key available"| Done
  Loading -->|"Configured provider does not use this key check"| Done
  Loading -->|"Environment key available"| Approval
  Checking -->|"Key rejected"| Done
  Loading -->|"File key available"| Approval
  Checking -->|"Key rejected"| Recovery
  Recovery -->|"Recheck"| Loading
  Recovery -->|"Replace saved key"| ReplacementApproval
  ReplacementApproval -->|"Yes, replace saved key"| EnteringKey
  EnteringKey -->|"Key entered"| SavingKey
  SavingKey -->|"Replacement saved"| Loading
  Approval -->|"Back"| Recovery
  Recovery -->|"Exit or end of input"| Cancelled
  EnteringKey -->|"Cancel key entry"| Cancelled
  SavingKey -->|"Another save is running"| Done
  SavingKey -->|"Save result is uncertain"| Done
  Checking -->|"Provider rate limit reached"| Done
  Checking -->|"Check could not be confirmed"| Done
```
