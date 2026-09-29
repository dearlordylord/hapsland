# OpenCode integration status

**Purpose:** Explain the current OpenCode adapter boundary and how to remove an existing Hapsland-owned plugin.
**Status:** Candidate integration unavailable for review.
**Authority:** Maintained runtime guidance; the [advice contract](advicing-target-contract.md) owns admission requirements.
**Expected use:** Check whether OpenCode can currently deliver Hapsland review and remove an earlier owned installation.
**Lifecycle:** Keep this page current with OpenCode hook capabilities and Hapsland installation behavior. Review it when a reliable pre-edit hook and matching post-edit lifecycle are implemented and validated.

The OpenCode 1.14.44 candidate plugin receives `tool.execute.after` events but does not provide the synchronous pre-edit permit required before Hapsland accepts an edit. Hapsland therefore keeps OpenCode hook calls quiet and does not offer OpenCode install or update. Doctor reports this missing lifecycle as not ready. No OpenCode finding is submitted to the agent through this path.

An existing Hapsland-owned OpenCode plugin can still be removed. Call `uninstall` without a digest to preview removal, inspect the owned paths and digest, then repeat `uninstall` with that digest. Removal checks ownership and local modifications before deleting files; it does not remove unrelated plugins.

The [historical host evidence](../evidence/host-94/decision-and-evidence.md#remaining-decisions-and-evidence) records earlier local probes. Those observations do not establish the required pre-edit lifecycle or current review support.
