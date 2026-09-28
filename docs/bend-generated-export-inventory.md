# Generated Bend export and static call inventory

Static source inventory at the #117 audit checkpoint. A listed call is a lexical call in non-test application source; it does not prove a supported runtime witness or that every branch executes. Build generators and test scripts are excluded. Installed-host reachability is classified in the [authority map](bend-logic-authority-map.md).

## Resident policy (114)

Generated artifact: [`src/resident/bend-policy.generated.js`](../src/resident/bend-policy.generated.js).

| Export | Static non-test application calls |
| --- | --- |
| `bendSelectionInitial` | [`src/resident/collection.ts` lines 181, 221](../src/resident/collection.ts#L181) |
| `bendSelectionStep` | [`src/resident/collection.ts` lines 195, 240](../src/resident/collection.ts#L195) |
| `bendFitsBatch` | [`src/resident/collection.ts` lines 149](../src/resident/collection.ts#L149) |
| `bendNoticeOffer` | [`src/resident/collection.ts` lines 281, 322](../src/resident/collection.ts#L281) |
| `bendValidationRoute` | [`src/resident/server.ts` lines 895, 948](../src/resident/server.ts#L895) |
| `bendPostValidation` | [`src/resident/server.ts` lines 913, 922, 931, 966, 975, 984](../src/resident/server.ts#L913) |
| `bendFinalCandidate` | [`src/resident/server.ts` lines 1014, 2756](../src/resident/server.ts#L1014) |
| `bendAdmissionInitial` | [`src/resident/composed-delivery.ts` lines 152, 275](../src/resident/composed-delivery.ts#L152) |
| `bendAdmissionStep` | [`src/resident/composed-delivery.ts` lines 161, 197, 237, 441](../src/resident/composed-delivery.ts#L161) |
| `bendAdmissionProspectiveGate` | [`src/resident/composed-delivery.ts` lines 180](../src/resident/composed-delivery.ts#L180) |
| `bendAdmissionExpire` | [`src/resident/composed-delivery.ts` lines 274](../src/resident/composed-delivery.ts#L274) |
| `bendAdmissionCloseProspective` | [`src/resident/composed-delivery.ts` lines 443](../src/resident/composed-delivery.ts#L443) |
| `bendWorkFinishWait` | No application call found |
| `bendWorkPreparedOffer` | [`src/resident/server.ts` lines 1823, 1843](../src/resident/server.ts#L1823) |
| `bendWorkEmptyPrepared` | [`src/resident/server.ts` lines 1827](../src/resident/server.ts#L1827) |
| `bendWorkEvaluatedDisposition` | [`src/resident/server.ts` lines 2240](../src/resident/server.ts#L2240) |
| `bendWorkFailureDisposition` | [`src/resident/server.ts` lines 2268](../src/resident/server.ts#L2268) |
| `bendWorkInitial` | [`src/resident/bend-work.ts` lines 33](../src/resident/bend-work.ts#L33) |
| `bendWorkAdmit` | [`src/resident/bend-work.ts` lines 43](../src/resident/bend-work.ts#L43) |
| `bendWorkStartSource` | [`src/resident/bend-work.ts` lines 54](../src/resident/bend-work.ts#L54) |
| `bendWorkStartUnit` | [`src/resident/bend-work.ts` lines 58](../src/resident/bend-work.ts#L58) |
| `bendWorkSpawn` | [`src/resident/bend-work.ts` lines 49](../src/resident/bend-work.ts#L49) |
| `bendWorkCompleteSource` | [`src/resident/bend-work.ts` lines 67](../src/resident/bend-work.ts#L67) |
| `bendWorkCachedFinding` | [`src/resident/bend-work.ts` lines 62](../src/resident/bend-work.ts#L62) |
| `bendWorkOutcome` | [`src/resident/bend-work.ts` lines 75](../src/resident/bend-work.ts#L75) |
| `bendWorkInterruptObservation` | [`src/resident/bend-work.ts` lines 71](../src/resident/bend-work.ts#L71) |
| `bendWorkInterruptUnit` | [`src/resident/bend-work.ts` lines 81](../src/resident/bend-work.ts#L81) |
| `bendWorkRetire` | [`src/resident/bend-work.ts` lines 87](../src/resident/bend-work.ts#L87) |
| `bendWorkReviseFinding` | [`src/resident/bend-work.ts` lines 91](../src/resident/bend-work.ts#L91) |
| `bendWorkUnfinished` | [`src/resident/bend-work.ts` lines 95](../src/resident/bend-work.ts#L95) |
| `bendWorkPendingFindings` | [`src/resident/bend-work.ts` lines 99](../src/resident/bend-work.ts#L99) |
| `bendWorkPendingFor` | [`src/resident/bend-work.ts` lines 103](../src/resident/bend-work.ts#L103) |
| `bendWorkClose` | [`src/resident/bend-work.ts` lines 108](../src/resident/bend-work.ts#L108) |
| `bendWorkCancelUnfinished` | [`src/resident/bend-work.ts` lines 115](../src/resident/bend-work.ts#L115) |
| `bendLeaseInitial` | [`src/resident/composed-delivery.ts` lines 551, 594](../src/resident/composed-delivery.ts#L551) |
| `bendLeaseReserve` | No application call found |
| `bendLeaseOffer` | [`src/resident/composed-delivery.ts` lines 552, 595](../src/resident/composed-delivery.ts#L552) |
| `bendLeaseAuthorize` | [`src/resident/composed-delivery.ts` lines 557, 601, 649](../src/resident/composed-delivery.ts#L557) |
| `bendLeaseRelease` | No application call found |
| `bendLeaseTerminal` | [`src/resident/composed-delivery.ts` lines 561, 650](../src/resident/composed-delivery.ts#L561) |
| `bendLeaseReoffer` | No application call found |
| `bendLeaseClose` | No application call found |
| `bendLeaseSuppresses` | [`src/resident/composed-delivery.ts` lines 722](../src/resident/composed-delivery.ts#L722) |
| `bendRoundInitial` | [`src/resident/composed-delivery.ts` lines 121](../src/resident/composed-delivery.ts#L121) |
| `bendRoundMaxContinuations` | [`src/resident/composed-delivery.ts` lines 28](../src/resident/composed-delivery.ts#L28) |
| `bendRoundActive` | [`src/resident/composed-delivery.ts` lines 291](../src/resident/composed-delivery.ts#L291) |
| `bendRoundBudget` | [`src/resident/composed-delivery.ts` lines 515](../src/resident/composed-delivery.ts#L515) |
| `bendRoundBeginStop` | [`src/resident/composed-delivery.ts` lines 298](../src/resident/composed-delivery.ts#L298) |
| `bendRoundOwnsStop` | [`src/resident/composed-delivery.ts` lines 309](../src/resident/composed-delivery.ts#L309) |
| `bendRoundBeginDecision` | No application call found |
| `bendRoundConsume` | [`src/resident/composed-delivery.ts` lines 506](../src/resident/composed-delivery.ts#L506) |
| `bendRoundReserveOutput` | No application call found |
| `bendRoundReleaseOutput` | No application call found |
| `bendRoundFinishStop` | [`src/resident/composed-delivery.ts` lines 426](../src/resident/composed-delivery.ts#L426) |
| `bendRoundStopTerminal` | [`src/resident/composed-delivery.ts` lines 416](../src/resident/composed-delivery.ts#L416) |
| `bendRoundExpireClose` | [`src/resident/composed-delivery.ts` lines 473](../src/resident/composed-delivery.ts#L473) |
| `bendRoundReopen` | [`src/resident/composed-delivery.ts` lines 249](../src/resident/composed-delivery.ts#L249) |
| `bendBackgroundInitial` | [`src/resident/composed-delivery.ts` lines 85](../src/resident/composed-delivery.ts#L85) |
| `bendBackgroundClaim` | [`src/resident/composed-delivery.ts` lines 85](../src/resident/composed-delivery.ts#L85) |
| `bendBackgroundRelease` | [`src/resident/composed-delivery.ts` lines 96](../src/resident/composed-delivery.ts#L96) |
| `bendBackgroundExpire` | [`src/resident/composed-delivery.ts` lines 740](../src/resident/composed-delivery.ts#L740) |
| `bendNoticeDecide` | [`src/resident/operational-notice-policy.ts` lines 41](../src/resident/operational-notice-policy.ts#L41) |
| `bendNoticeAdvance` | [`src/resident/operational-notice-policy.ts` lines 26](../src/resident/operational-notice-policy.ts#L26) |
| `bendNoticePrune` | [`src/resident/server.ts` lines 1370](../src/resident/server.ts#L1370) |
| `bendCollectionOrder` | [`src/resident/collection.ts` lines 50](../src/resident/collection.ts#L50) |
| `bendCollectionCredentialDisposition` | [`src/resident/server.ts` lines 816](../src/resident/server.ts#L816) |
| `bendCollectionEligible` | [`src/resident/collection.ts` lines 67](../src/resident/collection.ts#L67) |
| `bendCollectionExpired` | [`src/resident/collection.ts` lines 75](../src/resident/collection.ts#L75) |
| `bendDeliveryTransition` | [`src/resident/composed-delivery.ts` lines 638](../src/resident/composed-delivery.ts#L638) |
| `bendDeliveryExpired` | [`src/resident/composed-delivery.ts` lines 749](../src/resident/composed-delivery.ts#L749) |
| `bendDeliveryBackgroundReofferable` | [`src/resident/composed-delivery.ts` lines 728](../src/resident/composed-delivery.ts#L728) |
| `bendDeliverySubmissionAllowed` | [`src/resident/composed-delivery.ts` lines 482, 488](../src/resident/composed-delivery.ts#L482) |
| `bendDeliveryExistingTokenAllowed` | [`src/resident/composed-delivery.ts` lines 494](../src/resident/composed-delivery.ts#L494) |
| `bendDeliveryLegacyStopAllowed` | [`src/resident/composed-delivery.ts` lines 398](../src/resident/composed-delivery.ts#L398) |
| `bendDeliveryAcknowledge` | [`src/resident/server.ts` lines 1071](../src/resident/server.ts#L1071) |
| `bendDeliveryFinalize` | [`src/resident/server.ts` lines 1102](../src/resident/server.ts#L1102) |
| `bendDeliveryFindingDisposition` | [`src/resident/server.ts` lines 1114](../src/resident/server.ts#L1114) |
| `bendDeliveryReleaseUnacknowledged` | [`src/resident/server.ts` lines 1148, 1152](../src/resident/server.ts#L1148) |
| `bendDeliverySubmissionCandidate` | [`src/resident/server.ts` lines 1168](../src/resident/server.ts#L1168) |
| `bendDeliverySubmissionBatchGate` | [`src/resident/server.ts` lines 1181](../src/resident/server.ts#L1181) |
| `bendDeliveryCredentialObserve` | [`src/resident/server.ts` lines 2746](../src/resident/server.ts#L2746) |
| `bendDeliveryFinalCredentialGate` | [`src/resident/server.ts` lines 2749](../src/resident/server.ts#L2749) |
| `bendDeliveryCollectionLease` | [`src/resident/server.ts` lines 829](../src/resident/server.ts#L829) |
| `bendDeliveryAdviceCandidate` | [`src/resident/server.ts` lines 846](../src/resident/server.ts#L846) |
| `bendDeliveryNoticeCandidate` | [`src/resident/server.ts` lines 1332](../src/resident/server.ts#L1332) |
| `bendDeliveryReserveCandidate` | [`src/resident/server.ts` lines 884](../src/resident/server.ts#L884) |
| `bendReuseRoute` | [`src/resident/server.ts` lines 1856](../src/resident/server.ts#L1856) |
| `bendReuseCacheRoute` | [`src/resident/server.ts` lines 1868](../src/resident/server.ts#L1868) |
| `bendCacheAdmit` | [`src/resident/evaluation-reuse.ts` lines 82, 84](../src/resident/evaluation-reuse.ts#L82) |
| `bendCacheEvict` | [`src/resident/evaluation-reuse.ts` lines 85](../src/resident/evaluation-reuse.ts#L85) |
| `bendLifecycleCutoff` | [`src/resident/bend-work.ts` lines 122](../src/resident/bend-work.ts#L122) |
| `bendLifecycleFinishGate` | [`src/resident/bend-work.ts` lines 134](../src/resident/bend-work.ts#L134) |
| `bendLifecycleFinishDisposition` | [`src/resident/bend-work.ts` lines 156](../src/resident/bend-work.ts#L156) |
| `bendLifecycleFinishOutput` | [`src/resident/bend-work.ts` lines 163](../src/resident/bend-work.ts#L163) |
| `bendLifecycleSelectionReserve` | [`src/resident/bend-work.ts` lines 149](../src/resident/bend-work.ts#L149) |
| `bendLifecycleSelectionAuthorize` | [`src/resident/composed-delivery.ts` lines 403](../src/resident/composed-delivery.ts#L403) |
| `bendLifecycleSelectionConsume` | [`src/resident/composed-delivery.ts` lines 667](../src/resident/composed-delivery.ts#L667) |
| `bendLifecycleReserveSelected` | [`src/resident/bend-work.ts` lines 144](../src/resident/bend-work.ts#L144) |
| `bendLifecycleReleaseUnwritten` | [`src/resident/composed-delivery.ts` lines 380](../src/resident/composed-delivery.ts#L380) |
| `bendTicketInitial` | [`src/resident/server.ts` lines 730](../src/resident/server.ts#L730) |
| `bendTicketFail` | [`src/resident/server.ts` lines 242](../src/resident/server.ts#L242) |
| `bendTicketClose` | [`src/resident/server.ts` lines 245](../src/resident/server.ts#L245) |
| `bendTicketTerminal` | [`src/resident/server.ts` lines 2659](../src/resident/server.ts#L2659) |
| `bendTicketCollectGate` | [`src/resident/server.ts` lines 2639](../src/resident/server.ts#L2639) |
| `bendTicketFinalAuthority` | [`src/resident/server.ts` lines 2820](../src/resident/server.ts#L2820) |
| `bendTicketJoinedDisposition` | [`src/resident/server.ts` lines 2313](../src/resident/server.ts#L2313) |
| `bendTicketUnitStep` | [`src/resident/server.ts` lines 194](../src/resident/server.ts#L194) |
| `bendTicketUnitInitial` | [`src/resident/server.ts` lines 1897](../src/resident/server.ts#L1897) |
| `bendRevisionRegister` | [`src/resident/server.ts` lines 1503, 1552](../src/resident/server.ts#L1503) |
| `bendRevisionSuperseded` | [`src/resident/server.ts` lines 1534](../src/resident/server.ts#L1534) |
| `bendCleanupGate` | [`src/resident/server.ts` lines 658, 669](../src/resident/server.ts#L658) |
| `bendCleanupCommit` | [`src/resident/server.ts` lines 680](../src/resident/server.ts#L680) |
| `bendTicketRetention` | [`src/resident/server.ts` lines 755](../src/resident/server.ts#L755) |
| `bendDiscardScope` | [`src/resident/server.ts` lines 1641](../src/resident/server.ts#L1641) |

## Resident capacity after #120

The direct `bend-ledger.generated.js` export was retired. Production
[`CapacityLedger`](../src/resident/capacity.ts) calls the checked
[`src/canonical/adapter.ts`](../src/canonical/adapter.ts) boundary for reserve,
resize, replacement, release, and projection. That boundary alone imports
[`canonical.generated.js`](../src/canonical/canonical.generated.js). Its
compiled `Canonical.step` owns the shared ledger, purpose, limit checks, and
ordered replacement; the native wrapper retains reservation object identity
and maps partition strings to positive IDs. The artifact hash and
[`check-capacity-boundary.mjs`](../scripts/check-capacity-boundary.mjs) guard
against restoring the direct ledger path.

## Abstract page (3)

Generated artifact: [`packages/agent-flow-bend/flow.generated.js`](../packages/agent-flow-bend/flow.generated.js).

| Export | Static non-test application calls |
| --- | --- |
| `bendInitial` | [`packages/agent-flow-viz/src/bend-flow.ts` lines 97, 117](../packages/agent-flow-viz/src/bend-flow.ts#L97) |
| `bendStep` | [`packages/agent-flow-viz/src/bend-flow.ts` lines 102](../packages/agent-flow-viz/src/bend-flow.ts#L102) |
| `bendChanges` | [`packages/agent-flow-viz/src/bend-flow.ts` lines 103](../packages/agent-flow-viz/src/bend-flow.ts#L103) |

## Lifecycle model (2)

Generated artifact: [`packages/agent-flow-bend/lifecycle.generated.js`](../packages/agent-flow-bend/lifecycle.generated.js).

| Export | Static non-test application calls |
| --- | --- |
| `bendLifecycleInitial` | No application call found |
| `bendLifecycleApply` | No application call found |
