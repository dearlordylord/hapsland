// Generated mechanical transport descriptors from actual Bend owner declarations.
// Semantic validation remains in the production exact boundary codecs.
export const callbackNativeDescriptors = {
  ledger_limits: {
    kind: "adt",
    constructors: [
      {
        tag: "Ledger.Limits",
        fields: [
          ["global_items", "nat"],
          ["global_bytes", "nat"],
          ["partition_items", "nat"],
          ["partition_bytes", "nat"]
        ]
      }
    ]
  },
  ledger_purpose: {
    kind: "adt",
    constructors: [
      { tag: "Ledger.ObservationDispatch", fields: [] },
      { tag: "Ledger.Preparation", fields: [] },
      { tag: "Ledger.ReviewUnit", fields: [] },
      { tag: "Ledger.StoredResult", fields: [] },
      { tag: "Ledger.OperationalNotice", fields: [] },
      { tag: "Ledger.AdviceRecheck", fields: [] }
    ]
  },
  ledger_charge: {
    kind: "adt",
    constructors: [
      {
        tag: "Ledger.Charge",
        fields: [
          ["id", "nat"],
          ["partition", "nat"],
          ["bytes", "nat"],
          ["purpose", "ledger_purpose"]
        ]
      }
    ]
  },
  list_ledger_charge: { kind: "list", element: "ledger_charge", representation: "bend" },
  ledger_ledger: {
    kind: "adt",
    constructors: [
      {
        tag: "Ledger.Ledger",
        fields: [
          ["limits", "ledger_limits"],
          ["next_id", "nat"],
          ["charges", "list_ledger_charge"]
        ]
      }
    ]
  },
  maybe_nat: { kind: "maybe", element: "nat", representation: "bend" },
  canonical_round: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.Round",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["id", "nat"],
          ["waiting", "bool"],
          ["deciding", "bool"],
          ["write", "maybe_nat"],
          ["uncertain", "bool"],
          ["quiet_since", "maybe_nat"]
        ]
      }
    ]
  },
  list_canonical_round: { kind: "list", element: "canonical_round", representation: "bend" },
  canonical_workkind: {
    kind: "adt",
    constructors: [
      { tag: "Canonical.AwaitingSourceRead", fields: [] },
      { tag: "Canonical.SourceReading", fields: [] },
      { tag: "Canonical.Preparing", fields: [] },
      { tag: "Canonical.Reviewing", fields: [] },
      { tag: "Canonical.AtJev", fields: [] },
      { tag: "Canonical.PendingFinding", fields: [["count", "nat"]] }
    ]
  },
  canonical_work: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.Work",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["charge", "nat"],
          ["kind", "canonical_workkind"],
          ["parent", "nat"]
        ]
      }
    ]
  },
  list_canonical_work: { kind: "list", element: "canonical_work", representation: "bend" },
  admission_permit: {
    kind: "adt",
    constructors: [
      {
        tag: "Admission.Permit",
        fields: [
          ["token", "nat"],
          ["tool", "nat"],
          ["round", "nat"],
          ["started", "nat"],
          ["deadline", "nat"]
        ]
      }
    ]
  },
  list_admission_permit: { kind: "list", element: "admission_permit", representation: "bend" },
  admission_admissionstate: {
    kind: "adt",
    constructors: [
      {
        tag: "Admission.AdmissionState",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["active", "bool"],
          ["closed_at", "nat"],
          ["next_token", "nat"],
          ["permits", "list_admission_permit"]
        ]
      }
    ]
  },
  list_admission_admissionstate: { kind: "list", element: "admission_admissionstate", representation: "bend" },
  dispatch_entry: {
    kind: "adt",
    constructors: [
      {
        tag: "Dispatch.Entry",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["sequence", "nat"],
          ["cancelled", "bool"],
          ["preparation", "bool"]
        ]
      }
    ]
  },
  list_dispatch_entry: { kind: "list", element: "dispatch_entry", representation: "bend" },
  dispatch_request: {
    kind: "adt",
    constructors: [
      {
        tag: "Dispatch.Request",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["request", "nat"],
          ["started", "bool"],
          ["interrupted", "bool"]
        ]
      }
    ]
  },
  list_dispatch_request: { kind: "list", element: "dispatch_request", representation: "bend" },
  dispatch_state: {
    kind: "adt",
    constructors: [
      {
        tag: "Dispatch.State",
        fields: [
          ["queued", "list_dispatch_entry"],
          ["running", "list_dispatch_entry"],
          ["next_sequence", "nat"],
          ["closed", "bool"],
          ["requests", "list_dispatch_request"]
        ]
      }
    ]
  },
  list_nat: { kind: "list", element: "nat", representation: "bend" },
  collectionstate_lease: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectionState.Lease",
        fields: [
          ["advice", "nat"],
          ["owner", "nat"]
        ]
      }
    ]
  },
  list_collectionstate_lease: { kind: "list", element: "collectionstate_lease", representation: "bend" },
  collectionstate_claim: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectionState.Claim",
        fields: [
          ["group", "nat"],
          ["owner", "nat"]
        ]
      }
    ]
  },
  list_collectionstate_claim: { kind: "list", element: "collectionstate_claim", representation: "bend" },
  deliverystate_phase: {
    kind: "adt",
    constructors: [
      { tag: "DeliveryState.Reserved", fields: [] },
      { tag: "DeliveryState.Authorized", fields: [] },
      { tag: "DeliveryState.Submitted", fields: [] },
      { tag: "DeliveryState.Failed", fields: [] },
      { tag: "DeliveryState.Uncertain", fields: [] }
    ]
  },
  deliverystate_slot: {
    kind: "adt",
    constructors: [
      {
        tag: "DeliveryState.Slot",
        fields: [
          ["group", "nat"],
          ["round", "nat"],
          ["attempt", "nat"],
          ["token", "nat"],
          ["selected", "list_nat"],
          ["phase", "deliverystate_phase"]
        ]
      }
    ]
  },
  list_deliverystate_slot: { kind: "list", element: "deliverystate_slot", representation: "bend" },
  deliverystate_counter: {
    kind: "adt",
    constructors: [
      {
        tag: "DeliveryState.Counter",
        fields: [
          ["group", "nat"],
          ["round", "nat"],
          ["used", "nat"]
        ]
      }
    ]
  },
  list_deliverystate_counter: { kind: "list", element: "deliverystate_counter", representation: "bend" },
  handoff_surface: {
    kind: "adt",
    constructors: [
      { tag: "Handoff.Edit", fields: [] },
      { tag: "Handoff.Background", fields: [] },
      { tag: "Handoff.Stop", fields: [] }
    ]
  },
  handoff_leasephase: {
    kind: "adt",
    constructors: [
      { tag: "Handoff.Available", fields: [] },
      {
        tag: "Handoff.Reserved",
        fields: [
          ["token", "nat"],
          ["surface", "handoff_surface"]
        ]
      },
      {
        tag: "Handoff.Authorized",
        fields: [
          ["token", "nat"],
          ["surface", "handoff_surface"]
        ]
      },
      { tag: "Handoff.Submitted", fields: [["surface", "handoff_surface"]] },
      { tag: "Handoff.Uncertain", fields: [["surface", "handoff_surface"]] }
    ]
  },
  handoff_lease: {
    kind: "adt",
    constructors: [
      {
        tag: "Handoff.Lease",
        fields: [
          ["item", "nat"],
          ["round", "nat"],
          ["closed", "bool"],
          ["reoffered", "bool"],
          ["phase", "handoff_leasephase"]
        ]
      }
    ]
  },
  maybe_handoff_lease: { kind: "maybe", element: "handoff_lease", representation: "bend" },
  submissionstate_leaserecord: {
    kind: "adt",
    constructors: [
      {
        tag: "SubmissionState.LeaseRecord",
        fields: [
          ["advice", "nat"],
          ["fingerprint", "nat"],
          ["current", "handoff_lease"],
          ["previous", "maybe_handoff_lease"]
        ]
      }
    ]
  },
  list_submissionstate_leaserecord: { kind: "list", element: "submissionstate_leaserecord", representation: "bend" },
  delivery_phase: {
    kind: "adt",
    constructors: [
      { tag: "Delivery.Reserved", fields: [] },
      { tag: "Delivery.Authorized", fields: [] },
      { tag: "Delivery.Submitted", fields: [] },
      { tag: "Delivery.Uncertain", fields: [] }
    ]
  },
  submissionstate_batch: {
    kind: "adt",
    constructors: [
      {
        tag: "SubmissionState.Batch",
        fields: [
          ["advice", "nat"],
          ["group", "nat"],
          ["round", "nat"],
          ["token", "nat"],
          ["surface", "handoff_surface"],
          ["phase", "delivery_phase"],
          ["fingerprints", "list_nat"],
          ["units", "list_nat"]
        ]
      }
    ]
  },
  list_submissionstate_batch: { kind: "list", element: "submissionstate_batch", representation: "bend" },
  submissionstate_state: {
    kind: "adt",
    constructors: [
      {
        tag: "SubmissionState.State",
        fields: [
          ["leases", "list_submissionstate_leaserecord"],
          ["batches", "list_submissionstate_batch"]
        ]
      }
    ]
  },
  deliverystate_state: {
    kind: "adt",
    constructors: [
      {
        tag: "DeliveryState.State",
        fields: [
          ["slots", "list_deliverystate_slot"],
          ["counters", "list_deliverystate_counter"],
          ["submissions", "submissionstate_state"]
        ]
      }
    ]
  },
  revisionstate_entry: {
    kind: "adt",
    constructors: [
      {
        tag: "RevisionState.Entry",
        fields: [
          ["subject", "nat"],
          ["input", "nat"],
          ["generation", "nat"],
          ["members", "nat"]
        ]
      }
    ]
  },
  list_revisionstate_entry: { kind: "list", element: "revisionstate_entry", representation: "bend" },
  revisionstate_state: {
    kind: "adt",
    constructors: [
      {
        tag: "RevisionState.State",
        fields: [
          ["entries", "list_revisionstate_entry"],
          ["next_generation", "nat"]
        ]
      }
    ]
  },
  reusestate_claim: {
    kind: "adt",
    constructors: [
      {
        tag: "ReuseState.Claim",
        fields: [
          ["id", "nat"],
          ["attached", "bool"]
        ]
      }
    ]
  },
  list_reusestate_claim: { kind: "list", element: "reusestate_claim", representation: "bend" },
  reusestate_entry: {
    kind: "adt",
    constructors: [
      {
        tag: "ReuseState.Entry",
        fields: [
          ["id", "nat"],
          ["partition", "nat"],
          ["bytes", "nat"],
          ["reservation", "nat"]
        ]
      }
    ]
  },
  list_reusestate_entry: { kind: "list", element: "reusestate_entry", representation: "bend" },
  reusestate_state: {
    kind: "adt",
    constructors: [
      {
        tag: "ReuseState.State",
        fields: [
          ["claims", "list_reusestate_claim"],
          ["cache", "list_reusestate_entry"]
        ]
      }
    ]
  },
  noticestate_pending: {
    kind: "adt",
    constructors: [
      {
        tag: "NoticeState.Pending",
        fields: [
          ["id", "nat"],
          ["count", "nat"],
          ["sequence", "nat"],
          ["leased", "bool"]
        ]
      }
    ]
  },
  maybe_noticestate_pending: { kind: "maybe", element: "noticestate_pending", representation: "bend" },
  noticestate_record: {
    kind: "adt",
    constructors: [
      {
        tag: "NoticeState.Record",
        fields: [
          ["id", "nat"],
          ["partition", "nat"],
          ["group", "nat"],
          ["reservation", "nat"],
          ["suppressed", "nat"],
          ["pending", "maybe_noticestate_pending"]
        ]
      }
    ]
  },
  list_noticestate_record: { kind: "list", element: "noticestate_record", representation: "bend" },
  noticestate_state: {
    kind: "adt",
    constructors: [{ tag: "NoticeState.State", fields: [["records", "list_noticestate_record"]] }]
  },
  collectionstate_state: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectionState.State",
        fields: [
          ["ready", "list_nat"],
          ["leases", "list_collectionstate_lease"],
          ["claims", "list_collectionstate_claim"],
          ["delivery", "deliverystate_state"],
          ["revision", "revisionstate_state"],
          ["reuse", "reusestate_state"],
          ["notices", "noticestate_state"]
        ]
      }
    ]
  },
  edithistory_reason: {
    kind: "adt",
    constructors: [
      { tag: "EditHistory.Consumed", fields: [] },
      { tag: "EditHistory.Released", fields: [] },
      { tag: "EditHistory.Expired", fields: [] },
      { tag: "EditHistory.Closed", fields: [] }
    ]
  },
  edithistory_completed: {
    kind: "adt",
    constructors: [
      {
        tag: "EditHistory.Completed",
        fields: [
          ["tool", "nat"],
          ["reason", "edithistory_reason"],
          ["reported", "bool"]
        ]
      }
    ]
  },
  list_edithistory_completed: { kind: "list", element: "edithistory_completed", representation: "bend" },
  edithistory_state: {
    kind: "adt",
    constructors: [{ tag: "EditHistory.State", fields: [["entries", "list_edithistory_completed"]] }]
  },
  canonical_state: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.State",
        fields: [
          ["ledger", "ledger_ledger"],
          ["rounds", "list_canonical_round"],
          ["work", "list_canonical_work"],
          ["next_round", "nat"],
          ["next_operation", "nat"],
          ["admissions", "list_admission_admissionstate"],
          ["dispatch", "dispatch_state"],
          ["collection", "collectionstate_state"],
          ["history", "edithistory_state"]
        ]
      }
    ]
  },
  canonical_actionrequest: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.Prepare",
        fields: [
          ["operation", "nat"],
          ["reservation", "nat"]
        ]
      },
      { tag: "Canonical.CancelWork", fields: [["operation", "nat"]] },
      { tag: "Canonical.CreateNoticeKey", fields: [] }
    ]
  },
  ledger_usage: {
    kind: "adt",
    constructors: [
      {
        tag: "Ledger.Usage",
        fields: [
          ["items", "nat"],
          ["bytes", "nat"]
        ]
      }
    ]
  },
  canonical_capacityview: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.CapacityView",
        fields: [
          ["global", "ledger_usage"],
          ["local", "ledger_usage"],
          ["charges", "list_ledger_charge"]
        ]
      }
    ]
  },
  canonical_requestoutcome: {
    kind: "adt",
    constructors: [
      { tag: "Canonical.NeverSent", fields: [] },
      { tag: "Canonical.RequestFinding", fields: [] },
      { tag: "Canonical.RequestClear", fields: [] },
      { tag: "Canonical.RequestBackendFailure", fields: [] },
      { tag: "Canonical.RequestTimeout", fields: [] },
      { tag: "Canonical.RequestInterrupted", fields: [] }
    ]
  },
  canonical_outcome: {
    kind: "adt",
    constructors: [
      { tag: "Canonical.Finding", fields: [] },
      { tag: "Canonical.Clear", fields: [] },
      { tag: "Canonical.Unavailable", fields: [] },
      { tag: "Canonical.Interrupted", fields: [] },
      { tag: "Canonical.Discarded", fields: [] }
    ]
  },
  canonical_writeoutcome: {
    kind: "adt",
    constructors: [
      { tag: "Canonical.Acknowledged", fields: [] },
      { tag: "Canonical.Failed", fields: [] },
      { tag: "Canonical.Unknown", fields: [] }
    ]
  },
  canonical_domainevent: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.CapacityGranted",
        fields: [
          ["id", "nat"],
          ["after", "canonical_capacityview"]
        ]
      },
      {
        tag: "Canonical.CapacityResized",
        fields: [
          ["id", "nat"],
          ["after", "canonical_capacityview"]
        ]
      },
      {
        tag: "Canonical.CapacityUnitAdmitted",
        fields: [
          ["reservation", "nat"],
          ["position", "nat"],
          ["bytes", "nat"],
          ["after", "canonical_capacityview"]
        ]
      },
      {
        tag: "Canonical.PermitIssued",
        fields: [
          ["token", "nat"],
          ["round", "nat"]
        ]
      },
      {
        tag: "Canonical.CompletedEditSeen",
        fields: [
          ["reason", "edithistory_reason"],
          ["report", "bool"]
        ]
      },
      { tag: "Canonical.CompletedEditRemembered", fields: [["evicted", "maybe_nat"]] },
      { tag: "Canonical.QuietRoundBusy", fields: [] },
      { tag: "Canonical.QuietRoundWaiting", fields: [["since", "nat"]] },
      { tag: "Canonical.QuietRoundResetRecorded", fields: [] },
      { tag: "Canonical.PermitConsumed", fields: [["round", "nat"]] },
      { tag: "Canonical.PermitReleased", fields: [] },
      { tag: "Canonical.PermitExpired", fields: [] },
      { tag: "Canonical.PermitRoundClosed", fields: [["round", "nat"]] },
      { tag: "Canonical.RoundStarted", fields: [["id", "nat"]] },
      { tag: "Canonical.ObservationAdmitted", fields: [["id", "nat"]] },
      { tag: "Canonical.ObservationStarted", fields: [] },
      { tag: "Canonical.ObservationCompleted", fields: [] },
      { tag: "Canonical.ObservationInterrupted", fields: [] },
      {
        tag: "Canonical.UnitAdmitted",
        fields: [
          ["operation", "nat"],
          ["reservation", "nat"],
          ["position", "nat"],
          ["bytes", "nat"],
          ["after", "canonical_capacityview"]
        ]
      },
      {
        tag: "Canonical.PreparationReleased",
        fields: [
          ["id", "nat"],
          ["after", "canonical_capacityview"]
        ]
      },
      { tag: "Canonical.ReviewStarted", fields: [] },
      {
        tag: "Canonical.JevRequestIssued",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["request", "nat"]
        ]
      },
      { tag: "Canonical.JevRequestStartRecorded", fields: [] },
      { tag: "Canonical.JevInterruptionRecorded", fields: [] },
      { tag: "Canonical.JevRequestOutcomeRecorded", fields: [["outcome", "canonical_requestoutcome"]] },
      { tag: "Canonical.ReservationReleased", fields: [["id", "nat"]] },
      { tag: "Canonical.ReviewRecorded", fields: [["outcome", "canonical_outcome"]] },
      { tag: "Canonical.FindingRetained", fields: [] },
      { tag: "Canonical.FindingCountRecorded", fields: [] },
      { tag: "Canonical.ClearSettled", fields: [] },
      { tag: "Canonical.StaleClearSettled", fields: [] },
      { tag: "Canonical.StaleFindingRetired", fields: [] },
      {
        tag: "Canonical.DispatchStarted",
        fields: [
          ["operation", "nat"],
          ["sequence", "nat"]
        ]
      },
      {
        tag: "Canonical.DispatchDiscarded",
        fields: [
          ["operation", "nat"],
          ["running", "bool"]
        ]
      },
      { tag: "Canonical.WaitForWork", fields: [] },
      { tag: "Canonical.FinishReady", fields: [] },
      { tag: "Canonical.FinishLimit", fields: [] },
      { tag: "Canonical.StopEnded", fields: [] },
      { tag: "Canonical.CollectionEligible", fields: [] },
      { tag: "Canonical.CollectionLeaseReserved", fields: [] },
      { tag: "Canonical.CollectionLeaseReleased", fields: [] },
      { tag: "Canonical.CollectionAdviceRetired", fields: [] },
      { tag: "Canonical.CollectionBackgroundClaimed", fields: [] },
      { tag: "Canonical.CollectionBackgroundReleased", fields: [] },
      { tag: "Canonical.FinishReserved", fields: [] },
      { tag: "Canonical.FinishReleased", fields: [] },
      { tag: "Canonical.FinishAuthorized", fields: [] },
      { tag: "Canonical.FinishRecorded", fields: [["outcome", "canonical_writeoutcome"]] },
      { tag: "Canonical.FinishEnded", fields: [] },
      { tag: "Canonical.ContinuationConsumed", fields: [] },
      { tag: "Canonical.SubmissionBegun", fields: [] },
      { tag: "Canonical.SubmissionAuthorized", fields: [] },
      { tag: "Canonical.SubmissionRecorded", fields: [] },
      { tag: "Canonical.SubmissionReleased", fields: [] },
      { tag: "Canonical.SubmissionForgotten", fields: [] },
      { tag: "Canonical.RevisionReused", fields: [["generation", "nat"]] },
      { tag: "Canonical.RevisionReplaced", fields: [["generation", "nat"]] },
      { tag: "Canonical.RevisionReleased", fields: [] },
      { tag: "Canonical.CleanupCommitted", fields: [] },
      { tag: "Canonical.ReuseAdviceJoined", fields: [] },
      { tag: "Canonical.ReusePendingJoined", fields: [] },
      { tag: "Canonical.ReuseClaimedJoined", fields: [] },
      { tag: "Canonical.ReuseCacheHit", fields: [] },
      { tag: "Canonical.ReuseOwned", fields: [] },
      { tag: "Canonical.ReuseClaimed", fields: [] },
      { tag: "Canonical.ReuseAttached", fields: [] },
      { tag: "Canonical.ReuseReleased", fields: [] },
      { tag: "Canonical.CachePrepared", fields: [["evicted", "list_nat"]] },
      { tag: "Canonical.CacheCommitted", fields: [] },
      { tag: "Canonical.CacheDiscarded", fields: [["ids", "list_nat"]] },
      { tag: "Canonical.NoticeSuppressed", fields: [["count", "nat"]] },
      { tag: "Canonical.NoticePendingCreated", fields: [["count", "nat"]] },
      { tag: "Canonical.NoticePendingMerged", fields: [["count", "nat"]] },
      { tag: "Canonical.NoticeLeaseKept", fields: [] },
      { tag: "Canonical.NoticeCommitted", fields: [] },
      {
        tag: "Canonical.NoticePruned",
        fields: [
          ["drop_lease", "bool"],
          ["drop_pending", "bool"],
          ["drop_key", "bool"]
        ]
      },
      { tag: "Canonical.NoticeDropped", fields: [] },
      { tag: "Canonical.NoticeLeased", fields: [] },
      { tag: "Canonical.NoticePendingCleared", fields: [] },
      { tag: "Canonical.WriteAuthorized", fields: [["operation", "nat"]] },
      { tag: "Canonical.WriteRecorded", fields: [["outcome", "canonical_writeoutcome"]] },
      { tag: "Canonical.ReofferAtStop", fields: [] },
      { tag: "Canonical.PartitionRetired", fields: [["round", "nat"]] },
      { tag: "Canonical.AdmissionForgotten", fields: [] }
    ]
  },
  ledger_fitdecision: {
    kind: "adt",
    constructors: [
      { tag: "Ledger.Fits", fields: [] },
      { tag: "Ledger.GlobalItemLimit", fields: [] },
      { tag: "Ledger.GlobalByteLimit", fields: [] },
      { tag: "Ledger.PartitionItemLimit", fields: [] },
      { tag: "Ledger.PartitionByteLimit", fields: [] }
    ]
  },
  collectorauthority_reason: {
    kind: "adt",
    constructors: [
      { tag: "CollectorAuthority.Backend", fields: [] },
      { tag: "CollectorAuthority.Credential", fields: [] },
      { tag: "CollectorAuthority.Capacity", fields: [] },
      { tag: "CollectorAuthority.Stale", fields: [] },
      { tag: "CollectorAuthority.Lost", fields: [] },
      { tag: "CollectorAuthority.Expired", fields: [] }
    ]
  },
  configuration_includechoice: {
    kind: "adt",
    constructors: [
      { tag: "Configuration.ReplaceIncludes", fields: [] },
      { tag: "Configuration.KeepIncludes", fields: [] }
    ]
  },
  configuration_selection: {
    kind: "adt",
    constructors: [
      { tag: "Configuration.Protected", fields: [] },
      { tag: "Configuration.Excluded", fields: [] },
      { tag: "Configuration.EmptyIncludes", fields: [] },
      { tag: "Configuration.NotIncluded", fields: [] },
      { tag: "Configuration.Selected", fields: [] }
    ]
  },
  configuration_protection: {
    kind: "adt",
    constructors: [
      { tag: "Configuration.AllowedPath", fields: [] },
      { tag: "Configuration.RepositoryBoundary", fields: [] },
      { tag: "Configuration.SensitivePath", fields: [] },
      { tag: "Configuration.GeneratedOrVendor", fields: [] },
      { tag: "Configuration.FileExtension", fields: [] }
    ]
  },
  configuration_candidate: {
    kind: "adt",
    constructors: [
      { tag: "Configuration.CandidateAllowed", fields: [] },
      { tag: "Configuration.RefuseGitAdmin", fields: [] },
      { tag: "Configuration.RefuseFileKind", fields: [] },
      { tag: "Configuration.RefuseGitIgnore", fields: [] }
    ]
  },
  configuration_admission: {
    kind: "adt",
    constructors: [
      { tag: "Configuration.AdmitReview", fields: [] },
      { tag: "Configuration.RefuseRoot", fields: [] },
      { tag: "Configuration.RefuseConfiguration", fields: [] },
      { tag: "Configuration.RefuseCredential", fields: [] },
      { tag: "Configuration.RefuseSelection", fields: [] }
    ]
  },
  rulepolicy_gate: {
    kind: "adt",
    constructors: [
      { tag: "RulePolicy.Admit", fields: [] },
      { tag: "RulePolicy.Omit", fields: [] }
    ]
  },
  rulepolicy_order: {
    kind: "adt",
    constructors: [
      { tag: "RulePolicy.Before", fields: [] },
      { tag: "RulePolicy.Equal", fields: [] },
      { tag: "RulePolicy.After", fields: [] }
    ]
  },
  canonical_policydecision: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.CapacityRefused",
        fields: [
          ["reason", "ledger_fitdecision"],
          ["after", "canonical_capacityview"]
        ]
      },
      {
        tag: "Canonical.CapacityUnitRefused",
        fields: [
          ["position", "nat"],
          ["bytes", "nat"],
          ["reason", "ledger_fitdecision"],
          ["after", "canonical_capacityview"]
        ]
      },
      { tag: "Canonical.CompletedEditAbsent", fields: [] },
      { tag: "Canonical.QuietRoundExpired", fields: [["since", "nat"]] },
      { tag: "Canonical.PermitKept", fields: [] },
      { tag: "Canonical.PreparationRefused", fields: [] },
      {
        tag: "Canonical.UnitRefused",
        fields: [
          ["position", "nat"],
          ["bytes", "nat"],
          ["reason", "ledger_fitdecision"],
          ["after", "canonical_capacityview"]
        ]
      },
      { tag: "Canonical.JevRequestUnavailable", fields: [] },
      { tag: "Canonical.JevObservationIgnored", fields: [] },
      { tag: "Canonical.PreparedSkipped", fields: [] },
      { tag: "Canonical.PreparedAdmitted", fields: [] },
      { tag: "Canonical.PreparedCapacityRefused", fields: [] },
      { tag: "Canonical.EmptyLost", fields: [] },
      { tag: "Canonical.EmptyAccepted", fields: [] },
      { tag: "Canonical.FailureBackend", fields: [] },
      { tag: "Canonical.FailureCredential", fields: [] },
      { tag: "Canonical.FailureLost", fields: [] },
      { tag: "Canonical.FailureNone", fields: [] },
      { tag: "Canonical.DiscardNamedOnly", fields: [] },
      { tag: "Canonical.DiscardAllUnfinished", fields: [] },
      { tag: "Canonical.CollectionWaiting", fields: [] },
      { tag: "Canonical.CollectionRetireCredential", fields: [] },
      { tag: "Canonical.CollectionRetainCredential", fields: [] },
      { tag: "Canonical.CollectionCandidate", fields: [] },
      { tag: "Canonical.CollectionSkip", fields: [] },
      { tag: "Canonical.CollectionBefore", fields: [] },
      { tag: "Canonical.CollectionEqual", fields: [] },
      { tag: "Canonical.CollectionAfter", fields: [] },
      { tag: "Canonical.CollectionExpired", fields: [] },
      { tag: "Canonical.CollectionCurrent", fields: [] },
      { tag: "Canonical.CollectionFits", fields: [] },
      { tag: "Canonical.CollectionLimited", fields: [] },
      { tag: "Canonical.CollectionFindingSelected", fields: [] },
      { tag: "Canonical.CollectionFindingRetained", fields: [] },
      { tag: "Canonical.CollectionFindingLimited", fields: [] },
      { tag: "Canonical.CollectionFindingExpired", fields: [] },
      { tag: "Canonical.CollectionNoticeIncluded", fields: [] },
      { tag: "Canonical.CollectionNoticeSkipped", fields: [] },
      { tag: "Canonical.CollectionNoticeStopped", fields: [] },
      { tag: "Canonical.CollectionLeaseRefused", fields: [] },
      { tag: "Canonical.CollectionLeaseKept", fields: [] },
      { tag: "Canonical.CollectionBackgroundRefused", fields: [] },
      { tag: "Canonical.CollectionBackgroundKept", fields: [] },
      { tag: "Canonical.FinishNotices", fields: [] },
      { tag: "Canonical.FinishAllowedNoAdvice", fields: [] },
      { tag: "Canonical.FinishAllowedDeadline", fields: [] },
      { tag: "Canonical.FinishAllowedUnavailable", fields: [] },
      { tag: "Canonical.FinishRefused", fields: [] },
      { tag: "Canonical.ContinuationRefused", fields: [] },
      { tag: "Canonical.SubmissionRefused", fields: [] },
      { tag: "Canonical.SubmissionSuppresses", fields: [] },
      { tag: "Canonical.SubmissionUnsuppressed", fields: [] },
      { tag: "Canonical.SubmissionReofferable", fields: [] },
      { tag: "Canonical.SubmissionNotReofferable", fields: [] },
      { tag: "Canonical.SubmissionExpired", fields: [] },
      { tag: "Canonical.SubmissionCurrent", fields: [] },
      { tag: "Canonical.RevisionCurrent", fields: [] },
      { tag: "Canonical.RevisionStale", fields: [] },
      { tag: "Canonical.RevisionSuperseded", fields: [] },
      { tag: "Canonical.RevisionNotSuperseded", fields: [] },
      { tag: "Canonical.RevisionGeneration", fields: [["generation", "nat"]] },
      { tag: "Canonical.RevisionCount", fields: [["count", "nat"]] },
      { tag: "Canonical.CollectorProceed", fields: [] },
      { tag: "Canonical.CollectorUnavailable", fields: [["reason", "collectorauthority_reason"]] },
      { tag: "Canonical.CollectorFinalProceed", fields: [] },
      { tag: "Canonical.CollectorFinalRelease", fields: [] },
      { tag: "Canonical.ReuseKeepMember", fields: [] },
      { tag: "Canonical.ReuseSetMemberClear", fields: [] },
      { tag: "Canonical.ReuseSetMemberFinding", fields: [] },
      { tag: "Canonical.ReuseSetMemberUnavailable", fields: [] },
      { tag: "Canonical.ReuseSetMemberLost", fields: [] },
      { tag: "Canonical.CleanupReady", fields: [] },
      { tag: "Canonical.CleanupBusy", fields: [] },
      { tag: "Canonical.DeliveryReleaseUnacknowledged", fields: [] },
      { tag: "Canonical.DeliveryKeepAcknowledged", fields: [] },
      { tag: "Canonical.DeliveryAckReady", fields: [] },
      { tag: "Canonical.DeliveryAckExpired", fields: [] },
      { tag: "Canonical.DeliveryAckEmpty", fields: [] },
      { tag: "Canonical.DeliveryFinalReady", fields: [] },
      { tag: "Canonical.DeliveryFinalExpired", fields: [] },
      { tag: "Canonical.DeliveryFinalEmpty", fields: [] },
      { tag: "Canonical.DeliveryRetireAdvice", fields: [] },
      { tag: "Canonical.DeliveryKeepRemaining", fields: [] },
      { tag: "Canonical.DeliveryKeepForReoffer", fields: [] },
      { tag: "Canonical.DeliverySubmissionCandidate", fields: [] },
      { tag: "Canonical.DeliverySubmissionRefused", fields: [] },
      { tag: "Canonical.DeliveryBatchProceed", fields: [] },
      { tag: "Canonical.DeliveryBatchRelease", fields: [] },
      { tag: "Canonical.DeliveryCredentialInvalid", fields: [] },
      { tag: "Canonical.DeliveryCredentialValid", fields: [] },
      { tag: "Canonical.IgnoreCandidate", fields: [] },
      { tag: "Canonical.ReleaseCandidate", fields: [] },
      { tag: "Canonical.RetireCandidate", fields: [] },
      { tag: "Canonical.ContinueCandidate", fields: [] },
      { tag: "Canonical.RetainCandidate", fields: [] },
      { tag: "Canonical.RoundStopBegun", fields: [] },
      { tag: "Canonical.RoundStopRefused", fields: [] },
      { tag: "Canonical.RoundActive", fields: [] },
      { tag: "Canonical.RoundInactive", fields: [] },
      { tag: "Canonical.RoundBarrierRaised", fields: [] },
      { tag: "Canonical.RoundBarrierClear", fields: [] },
      { tag: "Canonical.RoundStopOwned", fields: [] },
      { tag: "Canonical.RoundStopNotOwned", fields: [] },
      {
        tag: "Canonical.RoundStopTerminal",
        fields: [
          ["revoke_provisional", "bool"],
          ["close", "bool"]
        ]
      },
      { tag: "Canonical.RoundExpireCloses", fields: [] },
      { tag: "Canonical.RoundExpireKeeps", fields: [] },
      { tag: "Canonical.RoundContinuationAvailable", fields: [] },
      { tag: "Canonical.RoundContinuationExhausted", fields: [] },
      { tag: "Canonical.DeliverySubmissionAllowed", fields: [] },
      { tag: "Canonical.DeliverySubmissionDenied", fields: [] },
      { tag: "Canonical.DeliveryExistingTokenAllowed", fields: [] },
      { tag: "Canonical.DeliveryExistingTokenDenied", fields: [] },
      { tag: "Canonical.DeliveryUnreservedStopAllowed", fields: [] },
      { tag: "Canonical.DeliveryUnreservedStopDenied", fields: [] },
      { tag: "Canonical.ReuseRefused", fields: [] },
      { tag: "Canonical.CacheAlready", fields: [] },
      { tag: "Canonical.CacheRejected", fields: [] },
      { tag: "Canonical.NoticeRejectedFull", fields: [] },
      { tag: "Canonical.NoticeRefused", fields: [] },
      { tag: "Canonical.NoticeSelected", fields: [["ids", "list_nat"]] },
      { tag: "Canonical.IncludeChoice", fields: [["choice", "configuration_includechoice"]] },
      { tag: "Canonical.FileSelection", fields: [["selection", "configuration_selection"]] },
      { tag: "Canonical.FileProtection", fields: [["protection", "configuration_protection"]] },
      { tag: "Canonical.CandidateFile", fields: [["candidate", "configuration_candidate"]] },
      { tag: "Canonical.ReviewAdmission", fields: [["admission", "configuration_admission"]] },
      { tag: "Canonical.RuleGate", fields: [["gate", "rulepolicy_gate"]] },
      { tag: "Canonical.RuleOrder", fields: [["order", "rulepolicy_order"]] },
      { tag: "Canonical.WaitForOutput", fields: [] }
    ]
  },
  canonical_output: {
    kind: "adt",
    constructors: [
      { tag: "Canonical.ActionRequested", fields: [["request", "canonical_actionrequest"]] },
      { tag: "Canonical.EventEstablished", fields: [["event", "canonical_domainevent"]] },
      { tag: "Canonical.PolicyDecided", fields: [["decision", "canonical_policydecision"]] }
    ]
  },
  list_canonical_output: { kind: "list", element: "canonical_output", representation: "bend" },
  admission_admissionrejection: {
    kind: "adt",
    constructors: [
      { tag: "Admission.WrongPartition", fields: [] },
      { tag: "Admission.WrongLifetime", fields: [] },
      { tag: "Admission.StaleInvocation", fields: [] },
      { tag: "Admission.Expired", fields: [] },
      { tag: "Admission.DuplicateTool", fields: [] },
      { tag: "Admission.NoPermit", fields: [] },
      { tag: "Admission.WrongTool", fields: [] },
      { tag: "Admission.OldRound", fields: [] },
      { tag: "Admission.InvalidClock", fields: [] },
      { tag: "Admission.RoundAlreadyClosed", fields: [] },
      { tag: "Admission.LifetimeNotFresh", fields: [] }
    ]
  },
  canonical_reason: {
    kind: "adt",
    constructors: [
      { tag: "Canonical.InvalidIdentity", fields: [] },
      { tag: "Canonical.RoundLimit", fields: [] },
      { tag: "Canonical.StaleRound", fields: [] },
      { tag: "Canonical.StaleOperation", fields: [] },
      { tag: "Canonical.WrongStage", fields: [] },
      { tag: "Canonical.InconsistentLedger", fields: [] },
      { tag: "Canonical.ProspectiveDenied", fields: [] },
      { tag: "Canonical.AdviceePermitLimit", fields: [] },
      { tag: "Canonical.ResidentPermitLimit", fields: [] },
      { tag: "Canonical.PermitDenied", fields: [["reason", "admission_admissionrejection"]] }
    ]
  },
  canonical_step: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.Advanced",
        fields: [
          ["state", "canonical_state"],
          ["outputs", "list_canonical_output"]
        ]
      },
      {
        tag: "Canonical.Rejected",
        fields: [
          ["state", "canonical_state"],
          ["reason", "canonical_reason"]
        ]
      }
    ]
  },
  admission_prospectivefacts: {
    kind: "adt",
    constructors: [
      {
        tag: "Admission.ProspectiveFacts",
        fields: [
          ["clock_valid", "bool"],
          ["hook_window", "nat"],
          ["started_upper", "nat"],
          ["now_lower", "nat"],
          ["advicee_permit_limit", "nat"],
          ["resident_permit_limit", "nat"]
        ]
      }
    ]
  },
  quiescence_facts: {
    kind: "adt",
    constructors: [
      {
        tag: "Quiescence.Facts",
        fields: [
          ["native_work_idle", "bool"],
          ["advice_empty", "bool"],
          ["handoff_idle", "bool"],
          ["stop_absent", "bool"]
        ]
      }
    ]
  },
  canonical_stopscope: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.StopScope",
        fields: [
          ["partition", "nat"],
          ["round", "nat"]
        ]
      }
    ]
  },
  list_canonical_stopscope: { kind: "list", element: "canonical_stopscope", representation: "bend" },
  reuse_joinedstate: {
    kind: "adt",
    constructors: [
      { tag: "Reuse.JoinedPending", fields: [] },
      { tag: "Reuse.JoinedClear", fields: [] },
      { tag: "Reuse.JoinedFinding", fields: [] },
      { tag: "Reuse.JoinedUnavailable", fields: [] }
    ]
  },
  retention_cleanupfacts: {
    kind: "adt",
    constructors: [
      {
        tag: "Retention.CleanupFacts",
        fields: [
          ["active", "bool"],
          ["dispatcher_idle", "bool"],
          ["no_advice", "bool"],
          ["no_notices", "bool"],
          ["no_pending_evaluations", "bool"],
          ["no_current_work", "bool"],
          ["no_cooldowns", "bool"],
          ["connection_count_ok", "bool"],
          ["cache_matches_ledger", "bool"]
        ]
      }
    ]
  },
  delivery_submissionfacts: {
    kind: "adt",
    constructors: [
      {
        tag: "Delivery.SubmissionFacts",
        fields: [
          ["round_active", "bool"],
          ["has_round", "bool"],
          ["has_unit", "bool"],
          ["has_delivery", "bool"],
          ["pending_capacity", "bool"],
          ["submission_allowed", "bool"],
          ["current_work", "bool"],
          ["credential_authorized", "bool"]
        ]
      }
    ]
  },
  handoff_validationstatus: {
    kind: "adt",
    constructors: [
      { tag: "Handoff.Current", fields: [] },
      { tag: "Handoff.Stale", fields: [] },
      { tag: "Handoff.Unavailable", fields: [] },
      { tag: "Handoff.Unattributed", fields: [] }
    ]
  },
  delivery_surface: {
    kind: "adt",
    constructors: [
      { tag: "Delivery.Edit", fields: [] },
      { tag: "Delivery.Background", fields: [] },
      { tag: "Delivery.Stop", fields: [] }
    ]
  },
  rulepolicy_target: {
    kind: "adt",
    constructors: [
      { tag: "RulePolicy.TypeShape", fields: [] },
      { tag: "RulePolicy.FunctionTarget", fields: [] },
      { tag: "RulePolicy.UnsupportedTarget", fields: [] }
    ]
  },
  rulepolicy_probabilitywords: {
    kind: "adt",
    constructors: [
      {
        tag: "RulePolicy.Words",
        fields: [
          ["high", "nat"],
          ["low", "nat"]
        ]
      }
    ]
  },
  canonical_canonicalevent: {
    kind: "adt",
    constructors: [
      {
        tag: "Canonical.ReserveCapacity",
        fields: [
          ["partition", "nat"],
          ["bytes", "nat"],
          ["purpose", "ledger_purpose"]
        ]
      },
      {
        tag: "Canonical.ResizeCapacity",
        fields: [
          ["reservation", "nat"],
          ["bytes", "nat"],
          ["purpose", "ledger_purpose"]
        ]
      },
      { tag: "Canonical.ReleaseCapacity", fields: [["reservation", "nat"]] },
      {
        tag: "Canonical.ReplaceCapacity",
        fields: [
          ["reservation", "nat"],
          ["unit_bytes", "list_nat"]
        ]
      },
      {
        tag: "Canonical.IssuePermit",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["tool", "nat"],
          ["started", "nat"],
          ["deadline", "nat"],
          ["now", "nat"],
          ["minimum_started", "nat"],
          ["facts", "admission_prospectivefacts"]
        ]
      },
      { tag: "Canonical.CheckCompletedEdit", fields: [["tool", "nat"]] },
      {
        tag: "Canonical.RememberCompletedEdit",
        fields: [
          ["tool", "nat"],
          ["reason", "edithistory_reason"]
        ]
      },
      {
        tag: "Canonical.QuietRoundTick",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["now", "nat"],
          ["window", "nat"],
          ["facts", "quiescence_facts"]
        ]
      },
      {
        tag: "Canonical.QuietRoundReset",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"]
        ]
      },
      {
        tag: "Canonical.ConsumePermit",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["token", "nat"],
          ["tool", "nat"],
          ["now", "nat"]
        ]
      },
      {
        tag: "Canonical.ReleasePermit",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Canonical.ExpirePermit",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["token", "nat"],
          ["deadline_reached", "bool"]
        ]
      },
      {
        tag: "Canonical.ClosePermitRound",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["at", "nat"]
        ]
      },
      {
        tag: "Canonical.ForgetAdmission",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"]
        ]
      },
      {
        tag: "Canonical.OpenRound",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"]
        ]
      },
      {
        tag: "Canonical.AdmitObservation",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"]
        ]
      },
      {
        tag: "Canonical.StartObservation",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["observation", "nat"]
        ]
      },
      {
        tag: "Canonical.CompleteObservation",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["observation", "nat"]
        ]
      },
      {
        tag: "Canonical.InterruptObservation",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["observation", "nat"]
        ]
      },
      {
        tag: "Canonical.BeginPreparation",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["bytes", "nat"]
        ]
      },
      {
        tag: "Canonical.BeginObservedPreparation",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["observation", "nat"],
          ["bytes", "nat"]
        ]
      },
      {
        tag: "Canonical.InterruptPreparation",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"]
        ]
      },
      {
        tag: "Canonical.PreparationCompleted",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["unit_bytes", "list_nat"]
        ]
      },
      {
        tag: "Canonical.StartReview",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"]
        ]
      },
      {
        tag: "Canonical.JevRequestReady",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["root_valid", "bool"],
          ["configuration_valid", "bool"],
          ["credential_ready", "bool"],
          ["selected", "bool"],
          ["current_work", "bool"],
          ["physical_available", "bool"]
        ]
      },
      {
        tag: "Canonical.JevRequestStarted",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["request", "nat"]
        ]
      },
      {
        tag: "Canonical.JevRequestInterrupted",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["request", "nat"]
        ]
      },
      {
        tag: "Canonical.JevRequestSettled",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["request", "nat"],
          ["outcome", "canonical_requestoutcome"],
          ["current_work", "bool"]
        ]
      },
      {
        tag: "Canonical.ReviewCompleted",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["outcome", "canonical_outcome"]
        ]
      },
      {
        tag: "Canonical.RetireReview",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"]
        ]
      },
      {
        tag: "Canonical.CancelReview",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"]
        ]
      },
      {
        tag: "Canonical.ReviewObserved",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["outcome", "canonical_outcome"],
          ["current_work", "bool"]
        ]
      },
      {
        tag: "Canonical.FindingCountUpdated",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["count", "nat"]
        ]
      },
      {
        tag: "Canonical.QueueDispatch",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"]
        ]
      },
      {
        tag: "Canonical.DispatchSettled",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"]
        ]
      },
      { tag: "Canonical.DiscardDispatch", fields: [["operations", "list_nat"]] },
      {
        tag: "Canonical.DispatchScopeCheck",
        fields: [
          ["named_count", "nat"],
          ["cancelled_count", "nat"],
          ["has_unnamed", "bool"]
        ]
      },
      { tag: "Canonical.CloseDispatch", fields: [] },
      {
        tag: "Canonical.PreparedOfferCheck",
        fields: [
          ["ready", "bool"],
          ["within_frame", "bool"]
        ]
      },
      {
        tag: "Canonical.EmptyPreparedCheck",
        fields: [
          ["ready_count", "nat"],
          ["has_non_skipped", "bool"],
          ["authority_bound", "bool"]
        ]
      },
      {
        tag: "Canonical.ReviewFailureCheck",
        fields: [
          ["backend_or_timeout", "bool"],
          ["credential", "bool"],
          ["missing", "bool"]
        ]
      },
      {
        tag: "Canonical.StopPolled",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["deadline", "bool"]
        ]
      },
      {
        tag: "Canonical.StopGroupPolled",
        fields: [
          ["group", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["scopes", "list_canonical_stopscope"],
          ["deadline", "bool"],
          ["extra_pending", "bool"],
          ["continuations", "nat"]
        ]
      },
      {
        tag: "Canonical.StopGroupEnded",
        fields: [
          ["group", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["scopes", "list_canonical_stopscope"]
        ]
      },
      {
        tag: "Canonical.CollectionReady",
        fields: [
          ["advice", "nat"],
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["observation", "nat"],
          ["joined_pending", "bool"]
        ]
      },
      {
        tag: "Canonical.CollectionCredentialCheck",
        fields: [
          ["same_scope", "bool"],
          ["generation_valid", "bool"]
        ]
      },
      {
        tag: "Canonical.CollectionCandidateCheck",
        fields: [
          ["same_partition", "bool"],
          ["unleased", "bool"],
          ["has_unsuppressed", "bool"],
          ["authority_owns", "bool"]
        ]
      },
      {
        tag: "Canonical.CollectionOrderCheck",
        fields: [
          ["left_sequence", "nat"],
          ["right_sequence", "nat"]
        ]
      },
      {
        tag: "Canonical.CollectionExpiryCheck",
        fields: [
          ["elapsed", "nat"],
          ["lifetime", "nat"]
        ]
      },
      {
        tag: "Canonical.CollectionFitCheck",
        fields: [
          ["items", "nat"],
          ["bytes", "nat"]
        ]
      },
      {
        tag: "Canonical.CollectionFindingCheck",
        fields: [
          ["selection_partition", "nat"],
          ["selection_round", "nat"],
          ["unit", "nat"],
          ["partition", "nat"],
          ["round", "nat"],
          ["snapshot", "nat"],
          ["current_snapshot", "nat"],
          ["credential", "nat"],
          ["current_credential", "nat"],
          ["age_ms", "nat"],
          ["solo_bytes", "nat"],
          ["collection_ready", "bool"],
          ["selected_count", "nat"],
          ["prospective_bytes", "nat"]
        ]
      },
      {
        tag: "Canonical.CollectionNoticeCheck",
        fields: [
          ["items", "nat"],
          ["bytes", "nat"],
          ["skip_unfitting", "bool"]
        ]
      },
      {
        tag: "Canonical.CollectionReserveLease",
        fields: [
          ["advice", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Canonical.CollectionReleaseLease",
        fields: [
          ["advice", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Canonical.CollectionLeaseCheck",
        fields: [
          ["advice", "nat"],
          ["token", "nat"],
          ["expired", "bool"],
          ["stop_collector", "bool"],
          ["same_group", "bool"],
          ["reofferable", "bool"]
        ]
      },
      { tag: "Canonical.CollectionRetireAdvice", fields: [["advice", "nat"]] },
      {
        tag: "Canonical.CollectionClaimBackground",
        fields: [
          ["group", "nat"],
          ["token", "nat"],
          ["active", "bool"],
          ["capacity", "nat"]
        ]
      },
      {
        tag: "Canonical.CollectionReleaseBackground",
        fields: [
          ["group", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Canonical.CollectionExpireBackground",
        fields: [
          ["group", "nat"],
          ["token", "nat"],
          ["elapsed", "nat"],
          ["lifetime", "nat"]
        ]
      },
      {
        tag: "Canonical.FinishReserve",
        fields: [
          ["group", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["attempt", "nat"],
          ["token", "nat"],
          ["selected", "list_nat"],
          ["has_notice", "bool"],
          ["pass_notices", "bool"],
          ["can_write", "bool"],
          ["binding_valid", "bool"],
          ["deadline_reached", "bool"]
        ]
      },
      {
        tag: "Canonical.FinishRelease",
        fields: [
          ["group", "nat"],
          ["round", "nat"],
          ["attempt", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Canonical.FinishAuthorize",
        fields: [
          ["group", "nat"],
          ["round", "nat"],
          ["attempt", "nat"],
          ["token", "nat"],
          ["selected", "list_nat"]
        ]
      },
      {
        tag: "Canonical.FinishTerminal",
        fields: [
          ["group", "nat"],
          ["round", "nat"],
          ["attempt", "nat"],
          ["token", "nat"],
          ["selected", "list_nat"],
          ["outcome", "canonical_writeoutcome"]
        ]
      },
      {
        tag: "Canonical.FinishEnd",
        fields: [
          ["group", "nat"],
          ["round", "nat"],
          ["attempt", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Canonical.ContinuationConsume",
        fields: [
          ["group", "nat"],
          ["round", "nat"]
        ]
      },
      {
        tag: "Canonical.SubmissionBegin",
        fields: [
          ["advice", "nat"],
          ["group", "nat"],
          ["round", "nat"],
          ["token", "nat"],
          ["surface", "handoff_surface"],
          ["authorize_now", "bool"],
          ["fingerprints", "list_nat"],
          ["units", "list_nat"]
        ]
      },
      {
        tag: "Canonical.SubmissionAuthorize",
        fields: [
          ["advice", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Canonical.SubmissionTerminal",
        fields: [
          ["advice", "nat"],
          ["token", "nat"],
          ["certain", "bool"]
        ]
      },
      {
        tag: "Canonical.SubmissionRelease",
        fields: [
          ["advice", "nat"],
          ["token", "nat"]
        ]
      },
      { tag: "Canonical.SubmissionForget", fields: [["advice", "nat"]] },
      {
        tag: "Canonical.SubmissionSuppressCheck",
        fields: [
          ["advice", "nat"],
          ["fingerprint", "nat"],
          ["round", "nat"],
          ["surface", "handoff_surface"]
        ]
      },
      {
        tag: "Canonical.SubmissionReofferCheck",
        fields: [
          ["advice", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Canonical.SubmissionExpiryCheck",
        fields: [
          ["advice", "nat"],
          ["token", "nat"],
          ["elapsed", "nat"],
          ["lifetime", "nat"]
        ]
      },
      {
        tag: "Canonical.RevisionRegister",
        fields: [
          ["subject", "nat"],
          ["input", "nat"],
          ["add_member", "bool"]
        ]
      },
      {
        tag: "Canonical.RevisionRelease",
        fields: [
          ["subject", "nat"],
          ["generation", "nat"]
        ]
      },
      {
        tag: "Canonical.RevisionCurrentCheck",
        fields: [
          ["subject", "nat"],
          ["input", "nat"],
          ["generation", "nat"]
        ]
      },
      {
        tag: "Canonical.RevisionSupersededCheck",
        fields: [
          ["subject", "nat"],
          ["candidate_subject", "nat"],
          ["generation", "nat"]
        ]
      },
      { tag: "Canonical.RevisionGenerationCheck", fields: [["subject", "nat"]] },
      { tag: "Canonical.RevisionCountCheck", fields: [] },
      {
        tag: "Canonical.CollectorGateCheck",
        fields: [
          ["expired", "bool"],
          ["credential_valid", "bool"]
        ]
      },
      {
        tag: "Canonical.CollectorFinalAuthorityCheck",
        fields: [
          ["admitted_block", "bool"],
          ["current_block", "bool"]
        ]
      },
      {
        tag: "Canonical.ReuseMemberCheck",
        fields: [
          ["joined_state", "reuse_joinedstate"],
          ["stale_unavailable", "bool"],
          ["has_revision", "bool"],
          ["has_advice_id", "bool"]
        ]
      },
      { tag: "Canonical.CleanupCheck", fields: [["facts", "retention_cleanupfacts"]] },
      { tag: "Canonical.CleanupCommit", fields: [] },
      { tag: "Canonical.DeliveryReleaseCheck", fields: [["acknowledged", "bool"]] },
      {
        tag: "Canonical.DeliveryAcknowledgeCheck",
        fields: [
          ["items", "nat"],
          ["any_expired", "bool"]
        ]
      },
      {
        tag: "Canonical.DeliveryFinalizeCheck",
        fields: [
          ["items", "nat"],
          ["all_acknowledged", "bool"],
          ["any_expired", "bool"]
        ]
      },
      {
        tag: "Canonical.DeliveryFindingDispositionCheck",
        fields: [
          ["composed", "bool"],
          ["remaining", "nat"]
        ]
      },
      { tag: "Canonical.DeliverySubmissionCandidateCheck", fields: [["facts", "delivery_submissionfacts"]] },
      {
        tag: "Canonical.DeliverySubmissionBatchCheck",
        fields: [
          ["count", "nat"],
          ["all_valid", "bool"]
        ]
      },
      {
        tag: "Canonical.DeliveryCredentialObserveCheck",
        fields: [
          ["invalid_seen", "bool"],
          ["generation_valid", "bool"],
          ["authorized", "bool"]
        ]
      },
      {
        tag: "Canonical.DeliveryFinalCredentialCheck",
        fields: [
          ["shared_collect", "bool"],
          ["invalid_seen", "bool"]
        ]
      },
      {
        tag: "Canonical.ValidationRouteCheck",
        fields: [
          ["owner_current", "bool"],
          ["status", "handoff_validationstatus"]
        ]
      },
      {
        tag: "Canonical.PostValidationCheck",
        fields: [
          ["work_accepted", "bool"],
          ["expired", "bool"],
          ["has_fitting", "bool"]
        ]
      },
      {
        tag: "Canonical.FinalCandidateCheck",
        fields: [
          ["owner_current", "bool"],
          ["credential_generation", "bool"],
          ["credential_authorized", "bool"],
          ["expired", "bool"],
          ["work_current", "bool"],
          ["has_findings", "bool"]
        ]
      },
      {
        tag: "Canonical.RoundBeginStopCheck",
        fields: [
          ["active", "bool"],
          ["has_stop", "bool"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Canonical.RoundActivityCheck",
        fields: [
          ["bound", "bool"],
          ["has_admission", "bool"],
          ["round", "nat"],
          ["active", "bool"],
          ["closed_at", "nat"],
          ["expected_generation", "nat"]
        ]
      },
      {
        tag: "Canonical.RoundBarrierCheck",
        fields: [
          ["has_stop", "bool"],
          ["used_at_start", "nat"],
          ["used_now", "nat"]
        ]
      },
      {
        tag: "Canonical.RoundOwnsStopCheck",
        fields: [
          ["active", "bool"],
          ["token_matches", "bool"],
          ["deciding", "bool"]
        ]
      },
      {
        tag: "Canonical.RoundStopTerminalCheck",
        fields: [
          ["has_output", "bool"],
          ["authorized", "bool"],
          ["requested_close", "bool"]
        ]
      },
      {
        tag: "Canonical.RoundExpireCloseCheck",
        fields: [
          ["barrier", "bool"],
          ["authorized_output", "bool"]
        ]
      },
      {
        tag: "Canonical.RoundContinuationBudgetCheck",
        fields: [
          ["active", "bool"],
          ["count", "nat"]
        ]
      },
      {
        tag: "Canonical.DeliverySubmissionAllowedCheck",
        fields: [
          ["active", "bool"],
          ["barrier", "bool"],
          ["deciding", "bool"],
          ["surface", "delivery_surface"],
          ["existing_token", "bool"],
          ["finish_permit", "bool"]
        ]
      },
      {
        tag: "Canonical.DeliveryExistingTokenCheck",
        fields: [
          ["surface", "delivery_surface"],
          ["existing_token", "bool"],
          ["finish_permit", "bool"]
        ]
      },
      {
        tag: "Canonical.DeliveryUnreservedStopCheck",
        fields: [
          ["active", "bool"],
          ["deciding", "bool"]
        ]
      },
      {
        tag: "Canonical.IncludeLayerCheck",
        fields: [
          ["supplied", "bool"],
          ["current_rank", "nat"],
          ["candidate_rank", "nat"]
        ]
      },
      {
        tag: "Canonical.FileSelectionCheck",
        fields: [
          ["protected", "bool"],
          ["excluded", "bool"],
          ["includes_empty", "bool"],
          ["included", "bool"]
        ]
      },
      { tag: "Canonical.FileProtectionInvalid", fields: [] },
      {
        tag: "Canonical.FileProtectionCheck",
        fields: [
          ["sensitive_name", "bool"],
          ["generated_or_vendor", "bool"],
          ["allowed_extension", "bool"]
        ]
      },
      {
        tag: "Canonical.CandidateFileCheck",
        fields: [
          ["git_admin", "bool"],
          ["physical_safe", "bool"],
          ["git_allowed", "bool"]
        ]
      },
      {
        tag: "Canonical.ReviewAdmissionCheck",
        fields: [
          ["root_valid", "bool"],
          ["configuration_valid", "bool"],
          ["credential_ready", "bool"],
          ["selected", "bool"]
        ]
      },
      {
        tag: "Canonical.RuleEnableCheck",
        fields: [
          ["pack_enabled", "bool"],
          ["rule_enabled", "bool"]
        ]
      },
      {
        tag: "Canonical.RuleApplicabilityCheck",
        fields: [
          ["consent", "bool"],
          ["complete", "bool"],
          ["target", "rulepolicy_target"],
          ["global_included", "bool"],
          ["global_excluded", "bool"],
          ["pack_enabled", "bool"],
          ["rule_enabled", "bool"],
          ["rule_included", "bool"],
          ["rule_excluded", "bool"],
          ["target_declared", "bool"],
          ["capabilities_available", "bool"],
          ["source_rung", "nat"],
          ["minimum_rung", "nat"]
        ]
      },
      {
        tag: "Canonical.RuleFindingCheck",
        fields: [
          ["probability", "rulepolicy_probabilitywords"],
          ["threshold", "rulepolicy_probabilitywords"]
        ]
      },
      {
        tag: "Canonical.RuleRankOrderCheck",
        fields: [
          ["left", "rulepolicy_probabilitywords"],
          ["right", "rulepolicy_probabilitywords"],
          ["left_rank", "nat"],
          ["right_rank", "nat"]
        ]
      },
      {
        tag: "Canonical.AdviceOrderCheck",
        fields: [
          ["left", "rulepolicy_probabilitywords"],
          ["right", "rulepolicy_probabilitywords"],
          ["path_order", "rulepolicy_order"],
          ["id_order", "rulepolicy_order"]
        ]
      },
      {
        tag: "Canonical.RuleBudgetCheck",
        fields: [
          ["position", "nat"],
          ["limit", "nat"]
        ]
      },
      {
        tag: "Canonical.ReuseRoute",
        fields: [
          ["id", "nat"],
          ["live_advice", "bool"]
        ]
      },
      { tag: "Canonical.ReuseClaim", fields: [["id", "nat"]] },
      { tag: "Canonical.ReuseAttach", fields: [["id", "nat"]] },
      { tag: "Canonical.ReuseRelease", fields: [["id", "nat"]] },
      { tag: "Canonical.ReuseTouch", fields: [["id", "nat"]] },
      {
        tag: "Canonical.CachePrepare",
        fields: [
          ["id", "nat"],
          ["bytes", "nat"],
          ["entry_limit", "nat"],
          ["byte_limit", "nat"]
        ]
      },
      {
        tag: "Canonical.CacheCommit",
        fields: [
          ["id", "nat"],
          ["partition", "nat"],
          ["bytes", "nat"],
          ["reservation", "nat"],
          ["entry_limit", "nat"],
          ["byte_limit", "nat"]
        ]
      },
      { tag: "Canonical.CacheDiscardPartition", fields: [["partition", "nat"]] },
      { tag: "Canonical.CacheClear", fields: [] },
      {
        tag: "Canonical.NoticeAdvance",
        fields: [
          ["key", "nat"],
          ["remaining", "maybe_nat"],
          ["maximum_keys", "nat"],
          ["proposed", "nat"],
          ["sequence", "nat"],
          ["max_count", "nat"]
        ]
      },
      {
        tag: "Canonical.NoticeCommit",
        fields: [
          ["key", "nat"],
          ["partition", "nat"],
          ["group", "nat"],
          ["reservation", "nat"],
          ["pending", "nat"],
          ["sequence", "nat"],
          ["maximum_keys", "nat"]
        ]
      },
      {
        tag: "Canonical.NoticePrune",
        fields: [
          ["key", "nat"],
          ["lease_expired", "bool"],
          ["pending_expired", "bool"],
          ["excepted", "bool"],
          ["cooldown_expired", "bool"]
        ]
      },
      { tag: "Canonical.NoticeDrop", fields: [["key", "nat"]] },
      {
        tag: "Canonical.NoticeLease",
        fields: [
          ["key", "nat"],
          ["leased", "bool"]
        ]
      },
      { tag: "Canonical.NoticeClearPending", fields: [["key", "nat"]] },
      {
        tag: "Canonical.NoticeSelect",
        fields: [
          ["partition", "nat"],
          ["group", "nat"],
          ["composed", "bool"],
          ["authority_bound", "bool"],
          ["allowed", "list_nat"]
        ]
      },
      {
        tag: "Canonical.OutputStarted",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"]
        ]
      },
      {
        tag: "Canonical.OutputTerminal",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["outcome", "canonical_writeoutcome"]
        ]
      },
      {
        tag: "Canonical.RetirePartition",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"]
        ]
      }
    ]
  },
  importgraph_edge: {
    kind: "adt",
    constructors: [
      {
        tag: "ImportGraph.Edge",
        fields: [
          ["id", "nat"],
          ["depth", "nat"]
        ]
      }
    ]
  },
  importgraph_reason: {
    kind: "adt",
    constructors: [
      { tag: "ImportGraph.Missing", fields: [] },
      { tag: "ImportGraph.Ambiguous", fields: [] },
      { tag: "ImportGraph.Unsupported", fields: [] },
      { tag: "ImportGraph.Omitted", fields: [] },
      { tag: "ImportGraph.Excluded", fields: [] },
      { tag: "ImportGraph.CaptureUnavailable", fields: [] },
      { tag: "ImportGraph.FileLimit", fields: [] },
      { tag: "ImportGraph.ReadLimit", fields: [] },
      { tag: "ImportGraph.TreeLimit", fields: [] },
      { tag: "ImportGraph.WorkLimit", fields: [] },
      { tag: "ImportGraph.Deadline", fields: [] },
      { tag: "ImportGraph.DepthLimit", fields: [] },
      { tag: "ImportGraph.ProtocolViolation", fields: [] }
    ]
  },
  importgraph_phase: {
    kind: "adt",
    constructors: [
      { tag: "ImportGraph.Idle", fields: [] },
      { tag: "ImportGraph.GraphReady", fields: [] },
      { tag: "ImportGraph.Resolving", fields: [["edge", "importgraph_edge"]] },
      {
        tag: "ImportGraph.Checking",
        fields: [
          ["edge", "importgraph_edge"],
          ["target", "nat"]
        ]
      },
      {
        tag: "ImportGraph.Capturing",
        fields: [
          ["edge", "importgraph_edge"],
          ["target", "nat"]
        ]
      },
      { tag: "ImportGraph.Complete", fields: [] },
      { tag: "ImportGraph.Incomplete", fields: [["reason", "importgraph_reason"]] }
    ]
  },
  list_importgraph_edge: { kind: "list", element: "importgraph_edge", representation: "bend" },
  importgraph_limits: {
    kind: "adt",
    constructors: [
      {
        tag: "ImportGraph.Limits",
        fields: [
          ["version", "nat"],
          ["source_bytes", "nat"],
          ["tree_bytes", "nat"],
          ["files", "nat"],
          ["read_bytes", "nat"],
          ["outgoing_edges", "nat"],
          ["depth", "nat"],
          ["work", "nat"]
        ]
      }
    ]
  },
  importgraph_graph: {
    kind: "adt",
    constructors: [
      {
        tag: "ImportGraph.Graph",
        fields: [
          ["phase", "importgraph_phase"],
          ["pending", "list_importgraph_edge"],
          ["visited", "list_nat"],
          ["files", "nat"],
          ["read_bytes", "nat"],
          ["tree_bytes", "nat"],
          ["work", "nat"],
          ["skipped_tree", "bool"],
          ["skipped_excluded", "bool"],
          ["skipped_other", "bool"],
          ["limits", "importgraph_limits"]
        ]
      }
    ]
  },
  importgraph_bounded: {
    kind: "adt",
    constructors: [
      {
        tag: "ImportGraph.Bounded",
        fields: [
          ["graph", "importgraph_graph"],
          ["remaining", "nat"]
        ]
      }
    ]
  },
  importgraph_command: {
    kind: "adt",
    constructors: [
      { tag: "ImportGraph.NoCommand", fields: [] },
      { tag: "ImportGraph.ResolveEdge", fields: [["edge", "nat"]] },
      { tag: "ImportGraph.CheckPath", fields: [["target", "nat"]] },
      { tag: "ImportGraph.ReadSource", fields: [["target", "nat"]] },
      { tag: "ImportGraph.UnitComplete", fields: [] },
      { tag: "ImportGraph.UnitIncomplete", fields: [["reason", "importgraph_reason"]] },
      {
        tag: "ImportGraph.SkipImport",
        fields: [
          ["target", "nat"],
          ["reason", "importgraph_reason"]
        ]
      }
    ]
  },
  importgraph_boundedstep: {
    kind: "adt",
    constructors: [
      {
        tag: "ImportGraph.BoundedStep",
        fields: [
          ["state", "importgraph_bounded"],
          ["command", "importgraph_command"]
        ]
      }
    ]
  },
  importgraph_resolution: {
    kind: "adt",
    constructors: [
      { tag: "ImportGraph.Found", fields: [] },
      { tag: "ImportGraph.NotFound", fields: [] },
      { tag: "ImportGraph.Many", fields: [] },
      { tag: "ImportGraph.Unhandled", fields: [] }
    ]
  },
  importgraph_graphevent: {
    kind: "adt",
    constructors: [
      {
        tag: "ImportGraph.Root",
        fields: [
          ["target", "nat"],
          ["source_bytes", "nat"],
          ["tree_bytes", "nat"],
          ["local_work", "nat"],
          ["edges", "list_nat"]
        ]
      },
      { tag: "ImportGraph.Next", fields: [] },
      {
        tag: "ImportGraph.Resolved",
        fields: [
          ["target", "nat"],
          ["result", "importgraph_resolution"]
        ]
      },
      { tag: "ImportGraph.PathChecked", fields: [["allowed", "bool"]] },
      {
        tag: "ImportGraph.Captured",
        fields: [
          ["source_bytes", "nat"],
          ["node_bytes", "nat"],
          ["local_work", "nat"],
          ["edges", "list_nat"]
        ]
      },
      { tag: "ImportGraph.CaptureFailed", fields: [] },
      { tag: "ImportGraph.DeadlineReached", fields: [] }
    ]
  },
  callbacks_owner: {
    kind: "adt",
    constructors: [
      {
        tag: "Callbacks.Owner",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"]
        ]
      }
    ]
  },
  callbacks_effect: {
    kind: "adt",
    constructors: [
      { tag: "Callbacks.JevStarted", fields: [["request", "nat"]] },
      { tag: "Callbacks.JevInterrupted", fields: [["request", "nat"]] },
      { tag: "Callbacks.JevSettled", fields: [["request", "nat"]] },
      { tag: "Callbacks.PreparationCompleted", fields: [] },
      {
        tag: "Callbacks.OutputTerminal",
        fields: [
          ["advice", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Callbacks.OutputExpiry",
        fields: [
          ["advice", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "Callbacks.FinishTerminal",
        fields: [
          ["group", "nat"],
          ["round", "nat"],
          ["attempt", "nat"],
          ["token", "nat"],
          ["selected", "list_nat"]
        ]
      }
    ]
  },
  callbacks_target: {
    kind: "adt",
    constructors: [
      {
        tag: "Callbacks.Target",
        fields: [
          ["owner", "callbacks_owner"],
          ["effect", "callbacks_effect"],
          ["original_order", "nat"]
        ]
      }
    ]
  },
  callbacks_applicability: {
    kind: "adt",
    constructors: [
      { tag: "Callbacks.Applied", fields: [] },
      { tag: "Callbacks.Missing", fields: [] },
      { tag: "Callbacks.NotQueued", fields: [] },
      { tag: "Callbacks.NotHeld", fields: [] }
    ]
  },
  callbacks_control: {
    kind: "adt",
    constructors: [
      { tag: "Callbacks.Hold", fields: [] },
      { tag: "Callbacks.Release", fields: [] },
      { tag: "Callbacks.Drop", fields: [] },
      { tag: "Callbacks.Duplicate", fields: [] },
      { tag: "Callbacks.Reorder", fields: [] }
    ]
  },
  adviceelifecycle_status: {
    kind: "adt",
    constructors: [
      { tag: "AdviceeLifecycle.Active", fields: [] },
      { tag: "AdviceeLifecycle.Disconnected", fields: [] },
      { tag: "AdviceeLifecycle.Removed", fields: [] }
    ]
  },
  adviceelifecycle_entry: {
    kind: "adt",
    constructors: [
      {
        tag: "AdviceeLifecycle.Entry",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["status", "adviceelifecycle_status"]
        ]
      }
    ]
  },
  adviceelifecycle_action: {
    kind: "adt",
    constructors: [
      { tag: "AdviceeLifecycle.Disconnect", fields: [] },
      { tag: "AdviceeLifecycle.Remove", fields: [] },
      { tag: "AdviceeLifecycle.Resume", fields: [] }
    ]
  },
  types_graphkey: {
    kind: "adt",
    constructors: [
      {
        tag: "Types.GraphKey",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["unit", "nat"]
        ]
      }
    ]
  },
  types_graphentry: {
    kind: "adt",
    constructors: [
      {
        tag: "Types.GraphEntry",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["unit", "nat"],
          ["position", "nat"],
          ["graph", "importgraph_bounded"]
        ]
      }
    ]
  },
  list_adviceelifecycle_entry: { kind: "list", element: "adviceelifecycle_entry", representation: "bend" },
  expiryscenario_profile: {
    kind: "adt",
    constructors: [
      {
        tag: "ExpiryScenario.Profile",
        fields: [
          ["pending_duration", "nat"],
          ["lease_duration", "nat"],
          ["cooldown_duration", "nat"]
        ]
      }
    ]
  },
  expiry_observed_driver_action: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_driver.Failure",
        fields: [
          ["partition", "nat"],
          ["group", "nat"],
          ["key", "nat"],
          ["sequence", "nat"],
          ["diagnostic", "string"]
        ]
      },
      {
        tag: "expiry_observed_driver.Collect",
        fields: [
          ["partition", "nat"],
          ["group", "nat"],
          ["composed", "bool"],
          ["authority_bound", "bool"],
          ["allowed", "list_nat"]
        ]
      },
      {
        tag: "expiry_observed_driver.Lease",
        fields: [
          ["partition", "nat"],
          ["group", "nat"],
          ["key", "nat"]
        ]
      },
      { tag: "expiry_observed_driver.Release", fields: [["key", "nat"]] },
      { tag: "expiry_observed_driver.Profile", fields: [["profile", "expiryscenario_profile"]] },
      { tag: "expiry_observed_driver.Tick", fields: [] }
    ]
  },
  expiry_observed_driver_original: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_driver.Original",
        fields: [
          ["at", "nat"],
          ["action", "expiry_observed_driver_action"]
        ]
      }
    ]
  },
  list_expiry_observed_driver_original: {
    kind: "list",
    element: "expiry_observed_driver_original",
    representation: "bend"
  },
  noticescenario_scope: {
    kind: "adt",
    constructors: [
      {
        tag: "NoticeScenario.Scope",
        fields: [
          ["partition", "nat"],
          ["group", "nat"],
          ["key", "nat"],
          ["maximum_keys", "nat"],
          ["reservation_bytes", "nat"],
          ["cooldown", "nat"],
          ["maximum_count", "nat"]
        ]
      }
    ]
  },
  noticescenario_pending: {
    kind: "adt",
    constructors: [
      {
        tag: "NoticeScenario.Pending",
        fields: [
          ["scope", "noticescenario_scope"],
          ["key", "nat"],
          ["sequence", "nat"]
        ]
      }
    ]
  },
  list_noticescenario_pending: { kind: "list", element: "noticescenario_pending", representation: "bend" },
  noticescenario_state: {
    kind: "adt",
    constructors: [{ tag: "NoticeScenario.State", fields: [["pending", "list_noticescenario_pending"]] }]
  },
  expiryscenario_noticeclock: {
    kind: "adt",
    constructors: [
      {
        tag: "ExpiryScenario.NoticeClock",
        fields: [
          ["partition", "nat"],
          ["group", "nat"],
          ["key", "nat"],
          ["retained_at", "nat"],
          ["pending_duration", "nat"],
          ["lease_started", "nat"],
          ["lease_duration", "nat"],
          ["cooldown_started", "nat"],
          ["cooldown_duration", "nat"]
        ]
      }
    ]
  },
  maybe_expiryscenario_noticeclock: { kind: "maybe", element: "expiryscenario_noticeclock", representation: "bend" },
  noticescenario_clock: {
    kind: "adt",
    constructors: [
      {
        tag: "NoticeScenario.Clock",
        fields: [
          ["partition", "nat"],
          ["group", "nat"],
          ["key", "nat"],
          ["next_allowed", "nat"],
          ["expiry", "maybe_expiryscenario_noticeclock"]
        ]
      }
    ]
  },
  list_noticescenario_clock: { kind: "list", element: "noticescenario_clock", representation: "bend" },
  collectionscenario_identity: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectionScenario.Identity",
        fields: [
          ["id", "nat"],
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"]
        ]
      }
    ]
  },
  collectionscenario_response: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectionScenario.Response",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["started", "nat"],
          ["deadline", "nat"],
          ["admitted_block", "bool"]
        ]
      }
    ]
  },
  collectionscenario_phase: {
    kind: "adt",
    constructors: [
      { tag: "CollectionScenario.Idle", fields: [] },
      { tag: "CollectionScenario.Gating", fields: [["current_block", "bool"]] },
      { tag: "CollectionScenario.Selecting", fields: [] }
    ]
  },
  collectionscenario_selection: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectionScenario.Selection",
        fields: [
          ["advice", "nat"],
          ["token", "nat"]
        ]
      }
    ]
  },
  list_collectionscenario_selection: { kind: "list", element: "collectionscenario_selection", representation: "bend" },
  collectionscenario_context: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectionScenario.Context",
        fields: [
          ["identity", "collectionscenario_identity"],
          ["response", "collectionscenario_response"],
          ["credential", "nat"],
          ["phase", "collectionscenario_phase"],
          ["selections", "list_collectionscenario_selection"]
        ]
      }
    ]
  },
  list_collectionscenario_context: { kind: "list", element: "collectionscenario_context", representation: "bend" },
  collectionscenario_scope: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectionScenario.Scope",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"]
        ]
      }
    ]
  },
  list_collectionscenario_scope: { kind: "list", element: "collectionscenario_scope", representation: "bend" },
  collectionscenario_state: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectionScenario.State",
        fields: [
          ["next_identity", "nat"],
          ["contexts", "list_collectionscenario_context"],
          ["controlled", "list_collectionscenario_scope"]
        ]
      }
    ]
  },
  outputscenario_attempt: {
    kind: "adt",
    constructors: [
      {
        tag: "OutputScenario.Individual",
        fields: [
          ["advice", "nat"],
          ["token", "nat"]
        ]
      },
      {
        tag: "OutputScenario.Finish",
        fields: [
          ["group", "nat"],
          ["round", "nat"],
          ["attempt", "nat"],
          ["token", "nat"],
          ["selected", "list_nat"]
        ]
      }
    ]
  },
  outputscenario_outcome: {
    kind: "adt",
    constructors: [
      { tag: "OutputScenario.Certain", fields: [] },
      { tag: "OutputScenario.Uncertain", fields: [] },
      { tag: "OutputScenario.Failed", fields: [] }
    ]
  },
  outputscenario_capture: {
    kind: "adt",
    constructors: [
      {
        tag: "OutputScenario.Capture",
        fields: [
          ["attempt", "outputscenario_attempt"],
          ["started", "nat"],
          ["outcome", "outputscenario_outcome"],
          ["delay", "nat"],
          ["lease", "nat"]
        ]
      }
    ]
  },
  list_outputscenario_capture: { kind: "list", element: "outputscenario_capture", representation: "bend" },
  stopscenario_finish: {
    kind: "adt",
    constructors: [
      {
        tag: "StopScenario.Finish",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["attempt", "nat"],
          ["token", "nat"],
          ["deadline", "nat"],
          ["recurring", "bool"],
          ["selected", "list_nat"],
          ["waiting", "bool"],
          ["validating", "nat"],
          ["started", "nat"],
          ["fit_pending", "bool"],
          ["output", "list_outputscenario_capture"]
        ]
      }
    ]
  },
  list_stopscenario_finish: { kind: "list", element: "stopscenario_finish", representation: "bend" },
  expiry_observed_wire_businessstate: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_wire.BusinessState",
        fields: [
          ["canonical", "canonical_state"],
          ["notices", "noticescenario_state"],
          ["clocks", "list_noticescenario_clock"],
          ["collection", "collectionscenario_state"],
          ["finishes", "list_stopscenario_finish"],
          ["lifecycles", "list_adviceelifecycle_entry"]
        ]
      }
    ]
  },
  list_expiry_observed_wire_businessstate: {
    kind: "list",
    element: "expiry_observed_wire_businessstate",
    representation: "bend"
  },
  driver_candidate: {
    kind: "adt",
    constructors: [
      {
        tag: "Driver.Candidate",
        fields: [
          ["partition", "nat"],
          ["advice", "nat"],
          ["round", "nat"],
          ["token", "nat"],
          ["surface", "handoff_surface"],
          ["selection", "bool"]
        ]
      }
    ]
  },
  maybe_driver_candidate: { kind: "maybe", element: "driver_candidate", representation: "bend" },
  driver_action: {
    kind: "adt",
    constructors: [
      {
        tag: "Driver.Action",
        fields: [
          ["event", "canonical_canonicalevent"],
          ["delay", "nat"],
          ["candidate", "maybe_driver_candidate"],
          ["job", "bool"],
          ["expiry_advice", "maybe_nat"]
        ]
      }
    ]
  },
  workload_emission: {
    kind: "adt",
    constructors: [
      {
        tag: "Workload.Emission",
        fields: [
          ["at", "nat"],
          ["partition", "nat"],
          ["generation", "nat"],
          ["kind", "u32"],
          ["task", "nat"],
          ["revision", "nat"],
          ["bytes", "nat"],
          ["units", "list_nat"],
          ["repair", "bool"],
          ["recurring", "bool"]
        ]
      }
    ]
  },
  expiry_observed_wire_pending: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_wire.Event",
        fields: [
          ["at", "nat"],
          ["order", "nat"],
          ["action", "driver_action"],
          ["partition", "nat"],
          ["lifetime", "nat"]
        ]
      },
      {
        tag: "expiry_observed_wire.Arrival",
        fields: [
          ["at", "nat"],
          ["order", "nat"],
          ["event", "workload_emission"],
          ["lifetime", "nat"]
        ]
      },
      { tag: "expiry_observed_wire.Unexpected", fields: [] }
    ]
  },
  list_expiry_observed_wire_pending: { kind: "list", element: "expiry_observed_wire_pending", representation: "bend" },
  expiry_observed_wire_snapshot: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_wire.Snapshot",
        fields: [
          ["time", "nat"],
          ["business", "list_expiry_observed_wire_businessstate"],
          ["next_order", "nat"],
          ["pending", "list_expiry_observed_wire_pending"],
          ["jobs", "nat"]
        ]
      }
    ]
  },
  list_expiry_observed_wire_snapshot: {
    kind: "list",
    element: "expiry_observed_wire_snapshot",
    representation: "bend"
  },
  maybe_noticescenario_scope: { kind: "maybe", element: "noticescenario_scope", representation: "bend" },
  maybe_string: { kind: "maybe", element: "string", representation: "bend" },
  expiry_observed_driver_capsule: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_driver.Capsule",
        fields: [
          ["order", "nat"],
          ["scope", "maybe_noticescenario_scope"],
          ["diagnostic", "maybe_string"]
        ]
      }
    ]
  },
  list_expiry_observed_driver_capsule: {
    kind: "list",
    element: "expiry_observed_driver_capsule",
    representation: "bend"
  },
  expiry_observed_driver_startup: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_driver.Startup",
        fields: [
          ["constructed", "list_expiry_observed_wire_snapshot"],
          ["suspended", "list_expiry_observed_wire_snapshot"],
          ["capsules", "list_expiry_observed_driver_capsule"]
        ]
      }
    ]
  },
  expiry_observed_wire_outcome: {
    kind: "adt",
    constructors: [
      { tag: "expiry_observed_wire.Advanced", fields: [["outputs", "list_canonical_output"]] },
      { tag: "expiry_observed_wire.Rejected", fields: [["reason", "canonical_reason"]] }
    ]
  },
  list_expiry_observed_wire_outcome: { kind: "list", element: "expiry_observed_wire_outcome", representation: "bend" },
  list_maybe_nat: { kind: "list", element: "maybe_nat", representation: "bend" },
  maybe_outputscenario_capture: { kind: "maybe", element: "outputscenario_capture", representation: "bend" },
  callbacks_fact: {
    kind: "adt",
    constructors: [
      {
        tag: "Callbacks.Fact",
        fields: [
          ["target", "callbacks_target"],
          ["at", "nat"],
          ["action", "driver_action"],
          ["completion", "maybe_outputscenario_capture"]
        ]
      }
    ]
  },
  maybe_callbacks_fact: { kind: "maybe", element: "callbacks_fact", representation: "bend" },
  maybe_driver_action: { kind: "maybe", element: "driver_action", representation: "bend" },
  expiry_observed_wire_physical: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_wire.Physical",
        fields: [
          ["before", "list_expiry_observed_wire_snapshot"],
          ["after", "list_expiry_observed_wire_snapshot"],
          ["action", "maybe_driver_action"]
        ]
      }
    ]
  },
  list_expiry_observed_wire_physical: {
    kind: "list",
    element: "expiry_observed_wire_physical",
    representation: "bend"
  },
  expiry_observed_wire_observation: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_wire.Canonical",
        fields: [
          ["before", "list_expiry_observed_wire_snapshot"],
          ["after", "list_expiry_observed_wire_snapshot"],
          ["time", "nat"],
          ["order", "nat"],
          ["event", "canonical_canonicalevent"],
          ["result", "list_expiry_observed_wire_outcome"],
          ["provided", "maybe_nat"],
          ["output_scopes", "list_maybe_nat"],
          ["receipt", "maybe_callbacks_fact"],
          ["physical", "list_expiry_observed_wire_physical"]
        ]
      },
      { tag: "expiry_observed_wire.UnexpectedObservation", fields: [] }
    ]
  },
  maybe_callbacks_target: { kind: "maybe", element: "callbacks_target", representation: "bend" },
  maybe_list_maybe_nat: { kind: "maybe", element: "list_maybe_nat", representation: "bend" },
  expiry_observed_driver_frame: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_driver.Observed",
        fields: [
          ["frame", "expiry_observed_wire_observation"],
          ["receipt", "maybe_callbacks_target"],
          ["scopes", "maybe_list_maybe_nat"],
          ["diagnostic", "maybe_string"],
          ["before_capsules", "list_expiry_observed_driver_capsule"],
          ["after_capsules", "list_expiry_observed_driver_capsule"]
        ]
      },
      {
        tag: "expiry_observed_driver.Control",
        fields: [
          ["input", "expiry_observed_driver_original"],
          ["before", "list_expiry_observed_wire_snapshot"],
          ["after", "list_expiry_observed_wire_snapshot"],
          ["before_profile", "expiryscenario_profile"],
          ["after_profile", "expiryscenario_profile"],
          ["before_capsules", "list_expiry_observed_driver_capsule"],
          ["after_capsules", "list_expiry_observed_driver_capsule"]
        ]
      },
      {
        tag: "expiry_observed_driver.Boundary",
        fields: [
          ["endpoint", "nat"],
          ["budget", "nat"],
          ["consumed", "nat"],
          ["runtime", "list_expiry_observed_wire_snapshot"],
          ["capsules", "list_expiry_observed_driver_capsule"]
        ]
      },
      { tag: "expiry_observed_driver.InvalidTransport", fields: [] }
    ]
  },
  list_expiry_observed_driver_frame: { kind: "list", element: "expiry_observed_driver_frame", representation: "bend" },
  expiry_observed_driver_publictrace: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_driver.PublicTrace",
        fields: [
          ["runtime", "list_expiry_observed_wire_snapshot"],
          ["capsules", "list_expiry_observed_driver_capsule"],
          ["issued", "nat"],
          ["consumed", "nat"],
          ["frames", "list_expiry_observed_driver_frame"],
          ["profile", "expiryscenario_profile"],
          ["valid", "bool"]
        ]
      }
    ]
  },
  expiry_observed_driver_envelope: {
    kind: "adt",
    constructors: [
      {
        tag: "expiry_observed_driver.Envelope",
        fields: [
          ["original", "list_expiry_observed_driver_original"],
          ["profile", "expiryscenario_profile"],
          ["startup", "expiry_observed_driver_startup"],
          ["trace", "expiry_observed_driver_publictrace"]
        ]
      }
    ]
  },
  list_expiry_observed_driver_envelope: {
    kind: "list",
    element: "expiry_observed_driver_envelope",
    representation: "bend"
  },
  session_config: {
    kind: "adt",
    constructors: [
      {
        tag: "Session.Settings",
        fields: [
          ["interval", "u32"],
          ["variation", "u32"],
          ["edits", "u32"],
          ["pause", "u32"],
          ["response", "u32"],
          ["repairDelay", "u32"]
        ]
      }
    ]
  },
  list_u32: { kind: "list", element: "u32", representation: "bend" },
  workload_profile: {
    kind: "adt",
    constructors: [
      {
        tag: "Workload.Profile",
        fields: [
          ["settings", "session_config"],
          ["seed", "u32"],
          ["codes", "list_u32"],
          ["bytes", "nat"],
          ["units", "list_nat"],
          ["duration", "maybe_nat"]
        ]
      }
    ]
  },
  maybe_workload_profile: { kind: "maybe", element: "workload_profile", representation: "bend" },
  stop_original_inputs_advicee: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_original_inputs.Advicee",
        fields: [
          ["agent", "string"],
          ["identity", "nat"],
          ["agent_seed", "nat"],
          ["workload", "maybe_workload_profile"]
        ]
      }
    ]
  },
  list_stop_original_inputs_advicee: { kind: "list", element: "stop_original_inputs_advicee", representation: "bend" },
  treefacts_profile: {
    kind: "adt",
    constructors: [
      {
        tag: "TreeFacts.Profile",
        fields: [
          ["min_files", "nat"],
          ["max_files", "nat"],
          ["max_imports", "nat"],
          ["max_depth", "nat"],
          ["denied_percent", "nat"],
          ["missing_percent", "nat"],
          ["unreadable_percent", "nat"],
          ["repeated_percent", "nat"],
          ["cyclic_percent", "nat"],
          ["unsupported_percent", "nat"],
          ["deadline_step", "nat"],
          ["local_work", "nat"],
          ["min_source", "nat"],
          ["max_source", "nat"],
          ["min_tree", "nat"],
          ["max_tree", "nat"]
        ]
      }
    ]
  },
  maybe_canonical_requestoutcome: { kind: "maybe", element: "canonical_requestoutcome", representation: "bend" },
  numeric_words: {
    kind: "adt",
    constructors: [
      {
        tag: "Numeric.Words",
        fields: [
          ["high", "nat"],
          ["low", "nat"]
        ]
      }
    ]
  },
  list_numeric_words: { kind: "list", element: "numeric_words", representation: "bend" },
  driver_outcomeenvironment: {
    kind: "adt",
    constructors: [
      {
        tag: "Driver.OutcomeEnvironment",
        fields: [
          ["outcome", "maybe_canonical_requestoutcome"],
          ["weights", "list_numeric_words"]
        ]
      }
    ]
  },
  collectorscenario_profile: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectorScenario.Profile",
        fields: [
          ["capacity", "nat"],
          ["lifetime", "nat"]
        ]
      }
    ]
  },
  maybe_collectorscenario_profile: { kind: "maybe", element: "collectorscenario_profile", representation: "bend" },
  stop_original_inputs_configuration: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_original_inputs.Configuration",
        fields: [
          ["seed", "nat"],
          ["advicees", "list_stop_original_inputs_advicee"],
          ["retention", "nat"],
          ["limits", "ledger_limits"],
          ["tree", "treefacts_profile"],
          ["graph", "importgraph_limits"],
          ["preparation_delay", "nat"],
          ["jev_delay", "nat"],
          ["outcomes", "driver_outcomeenvironment"],
          ["finish_wait", "nat"],
          ["output", "outputscenario_outcome"],
          ["output_delay", "nat"],
          ["output_lease", "nat"],
          ["candidate_bytes", "maybe_nat"],
          ["collectors", "maybe_collectorscenario_profile"]
        ]
      }
    ]
  },
  stop_original_inputs_input: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_original_inputs.Edit",
        fields: [
          ["at", "nat"],
          ["agent", "maybe_string"],
          ["bytes", "nat"],
          ["units", "list_nat"],
          ["outcome", "maybe_canonical_requestoutcome"]
        ]
      },
      {
        tag: "stop_original_inputs.Finish",
        fields: [
          ["at", "nat"],
          ["agent", "maybe_string"],
          ["recurring", "bool"]
        ]
      },
      {
        tag: "stop_original_inputs.CanonicalInput",
        fields: [
          ["at", "nat"],
          ["event", "canonical_canonicalevent"]
        ]
      }
    ]
  },
  list_stop_original_inputs_input: { kind: "list", element: "stop_original_inputs_input", representation: "bend" },
  stop_original_inputs_boundary: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_original_inputs.OutputProfile",
        fields: [
          ["outcome", "outputscenario_outcome"],
          ["delay", "nat"],
          ["lease", "nat"]
        ]
      },
      {
        tag: "stop_original_inputs.MismatchedTerminal",
        fields: [
          ["at", "nat"],
          ["agent", "maybe_string"]
        ]
      },
      {
        tag: "stop_original_inputs.Advance",
        fields: [
          ["endpoint", "nat"],
          ["budget", "nat"]
        ]
      },
      { tag: "stop_original_inputs.Schedule", fields: [["input", "stop_original_inputs_input"]] }
    ]
  },
  list_stop_original_inputs_boundary: {
    kind: "list",
    element: "stop_original_inputs_boundary",
    representation: "bend"
  },
  stop_original_inputs_scenario: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_original_inputs.Scenario",
        fields: [
          ["configuration", "stop_original_inputs_configuration"],
          ["inputs", "list_stop_original_inputs_input"],
          ["boundaries", "list_stop_original_inputs_boundary"]
        ]
      }
    ]
  },
  advicee_lifecycle_driver_stopprofile: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.StopProfile",
        fields: [
          ["outcome", "outputscenario_outcome"],
          ["bytes", "maybe_nat"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.FitProfile",
        fields: [
          ["outcome", "outputscenario_outcome"],
          ["bytes", "maybe_nat"],
          ["attempt", "nat"]
        ]
      }
    ]
  },
  maybe_advicee_lifecycle_driver_stopprofile: {
    kind: "maybe",
    element: "advicee_lifecycle_driver_stopprofile",
    representation: "bend"
  },
  advicee_lifecycle_driver_environment: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.Environment",
        fields: [
          ["seed", "nat"],
          ["tree", "treefacts_profile"],
          ["graph", "importgraph_limits"],
          ["preparation_delay", "nat"],
          ["output_delay", "nat"],
          ["output_lease", "nat"],
          ["stop_profile", "maybe_advicee_lifecycle_driver_stopprofile"],
          ["outcomes", "driver_outcomeenvironment"]
        ]
      }
    ]
  },
  stop_observed_wire_businessstate: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_observed_wire.BusinessState",
        fields: [
          ["canonical", "canonical_state"],
          ["finishes", "list_stopscenario_finish"]
        ]
      }
    ]
  },
  list_stop_observed_wire_businessstate: {
    kind: "list",
    element: "stop_observed_wire_businessstate",
    representation: "bend"
  },
  stop_observed_wire_endpoint: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_observed_wire.Endpoint",
        fields: [
          ["time", "nat"],
          ["projection", "list_stop_observed_wire_businessstate"]
        ]
      }
    ]
  },
  stop_observed_wire_outcome: {
    kind: "adt",
    constructors: [
      { tag: "stop_observed_wire.Advanced", fields: [["outputs", "list_canonical_output"]] },
      { tag: "stop_observed_wire.Rejected", fields: [["reason", "canonical_reason"]] }
    ]
  },
  list_stop_observed_wire_outcome: { kind: "list", element: "stop_observed_wire_outcome", representation: "bend" },
  sharingscenario_sharingkey: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingScenario.SharingKey",
        fields: [
          ["partition", "nat"],
          ["prepared", "nat"]
        ]
      }
    ]
  },
  freshnessscenario_scope: {
    kind: "adt",
    constructors: [
      {
        tag: "FreshnessScenario.Scope",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"]
        ]
      }
    ]
  },
  cachescenario_offer: {
    kind: "adt",
    constructors: [
      {
        tag: "CacheScenario.Offer",
        fields: [
          ["id", "nat"],
          ["key", "sharingscenario_sharingkey"],
          ["original", "freshnessscenario_scope"],
          ["bytes", "nat"],
          ["outcome", "canonical_requestoutcome"]
        ]
      }
    ]
  },
  cacheruntime_stage: {
    kind: "adt",
    constructors: [
      { tag: "CacheRuntime.PrepareStage", fields: [] },
      { tag: "CacheRuntime.ReserveStage", fields: [] },
      { tag: "CacheRuntime.CommitStage", fields: [] }
    ]
  },
  cacheruntime_fact: {
    kind: "adt",
    constructors: [
      {
        tag: "CacheRuntime.Fact",
        fields: [
          ["offer", "cachescenario_offer"],
          ["entry_limit", "nat"],
          ["byte_limit", "nat"],
          ["stage", "cacheruntime_stage"],
          ["reservation", "maybe_nat"],
          ["event", "canonical_canonicalevent"]
        ]
      }
    ]
  },
  stop_observed_wire_graphresult: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_observed_wire.GraphAdvanced",
        fields: [
          ["before", "importgraph_bounded"],
          ["after", "importgraph_bounded"],
          ["command", "importgraph_command"]
        ]
      },
      { tag: "stop_observed_wire.GraphRejected", fields: [] }
    ]
  },
  list_stop_observed_wire_graphresult: {
    kind: "list",
    element: "stop_observed_wire_graphresult",
    representation: "bend"
  },
  stopscenario_input: {
    kind: "adt",
    constructors: [
      {
        tag: "StopScenario.Input",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["started", "nat"],
          ["cutoff", "nat"],
          ["recurring", "bool"]
        ]
      }
    ]
  },
  maybe_stopscenario_finish: { kind: "maybe", element: "stopscenario_finish", representation: "bend" },
  stop_observed_wire_observation: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_observed_wire.Canonical",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["before", "list_stop_observed_wire_businessstate"],
          ["after", "list_stop_observed_wire_businessstate"],
          ["event", "canonical_canonicalevent"],
          ["result", "list_stop_observed_wire_outcome"],
          ["provided", "maybe_nat"],
          ["output_scopes", "list_maybe_nat"]
        ]
      },
      {
        tag: "stop_observed_wire.Cache",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["before", "list_stop_observed_wire_businessstate"],
          ["after", "list_stop_observed_wire_businessstate"],
          ["fact", "cacheruntime_fact"],
          ["event", "canonical_canonicalevent"],
          ["result", "list_stop_observed_wire_outcome"],
          ["provided", "maybe_nat"],
          ["output_scopes", "list_maybe_nat"]
        ]
      },
      {
        tag: "stop_observed_wire.Graph",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["before", "list_stop_observed_wire_businessstate"],
          ["after", "list_stop_observed_wire_businessstate"],
          ["key", "types_graphkey"],
          ["position", "nat"],
          ["event", "importgraph_graphevent"],
          ["result", "list_stop_observed_wire_graphresult"],
          ["provided", "maybe_nat"],
          ["output_scopes", "list_maybe_nat"]
        ]
      },
      {
        tag: "stop_observed_wire.Finish",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["before", "list_stop_observed_wire_businessstate"],
          ["after", "list_stop_observed_wire_businessstate"],
          ["input", "stopscenario_input"],
          ["finish", "maybe_stopscenario_finish"],
          ["created", "bool"],
          ["provided", "maybe_nat"],
          ["output_scopes", "list_maybe_nat"]
        ]
      }
    ]
  },
  stop_observed_wire_physical: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_observed_wire.Physical",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["before", "list_stop_observed_wire_businessstate"],
          ["after", "list_stop_observed_wire_businessstate"],
          ["action", "maybe_driver_action"]
        ]
      }
    ]
  },
  list_stop_observed_wire_physical: { kind: "list", element: "stop_observed_wire_physical", representation: "bend" },
  driver_sourcejob: {
    kind: "adt",
    constructors: [
      {
        tag: "Driver.SourceJob",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["bytes", "nat"],
          ["units", "list_nat"],
          ["outcome", "maybe_canonical_requestoutcome"]
        ]
      }
    ]
  },
  maybe_driver_sourcejob: { kind: "maybe", element: "driver_sourcejob", representation: "bend" },
  driver_outcomesource: {
    kind: "adt",
    constructors: [
      { tag: "Driver.EditForced", fields: [] },
      { tag: "Driver.RunForced", fields: [] },
      { tag: "Driver.Sampled", fields: [] }
    ]
  },
  maybe_u32: { kind: "maybe", element: "u32", representation: "bend" },
  driver_outcomereceipt: {
    kind: "adt",
    constructors: [
      {
        tag: "Driver.OutcomeReceipt",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["request", "nat"],
          ["outcome", "canonical_requestoutcome"],
          ["source", "driver_outcomesource"],
          ["job", "maybe_driver_sourcejob"],
          ["stream_before", "maybe_u32"],
          ["stream_after", "maybe_u32"]
        ]
      }
    ]
  },
  maybe_driver_outcomereceipt: { kind: "maybe", element: "driver_outcomereceipt", representation: "bend" },
  stop_observed_wire_origin: {
    kind: "adt",
    constructors: [
      { tag: "stop_observed_wire.Environmental", fields: [] },
      { tag: "stop_observed_wire.CanonicalFeedback", fields: [] },
      { tag: "stop_observed_wire.RawInput", fields: [] }
    ]
  },
  stop_observed_wire_issuedfacts: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_observed_wire.IssuedFacts",
        fields: [
          ["source_job", "maybe_driver_sourcejob"],
          ["outcome_receipt", "maybe_driver_outcomereceipt"],
          ["output_capture", "maybe_outputscenario_capture"],
          ["origin", "stop_observed_wire_origin"]
        ]
      }
    ]
  },
  maybe_stop_observed_wire_issuedfacts: {
    kind: "maybe",
    element: "stop_observed_wire_issuedfacts",
    representation: "bend"
  },
  stop_observed_wire_emission: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_observed_wire.Action",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["action", "driver_action"],
          ["attempt", "maybe_nat"],
          ["issued", "stop_observed_wire_issuedfacts"]
        ]
      },
      {
        tag: "stop_observed_wire.Edit",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["source_job", "maybe_driver_sourcejob"]
        ]
      },
      {
        tag: "stop_observed_wire.SourceEdit",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["partition", "nat"],
          ["activity", "nat"],
          ["bytes", "nat"],
          ["units", "list_nat"],
          ["outcome", "maybe_canonical_requestoutcome"]
        ]
      },
      {
        tag: "stop_observed_wire.FinishInput",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["input", "stopscenario_input"]
        ]
      },
      {
        tag: "stop_observed_wire.FinishIntent",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["partition", "nat"],
          ["started", "nat"],
          ["cutoff", "nat"],
          ["recurring", "bool"]
        ]
      },
      {
        tag: "stop_observed_wire.GraphInput",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["position", "nat"],
          ["event", "importgraph_graphevent"]
        ]
      },
      {
        tag: "stop_observed_wire.Arrival",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["event", "workload_emission"],
          ["activity", "nat"]
        ]
      },
      {
        tag: "stop_observed_wire.CacheInput",
        fields: [
          ["time", "nat"],
          ["order", "nat"],
          ["fact", "cacheruntime_fact"],
          ["source_job", "maybe_driver_sourcejob"]
        ]
      },
      {
        tag: "stop_observed_wire.Missing",
        fields: [
          ["time", "nat"],
          ["order", "nat"]
        ]
      }
    ]
  },
  list_stop_observed_wire_emission: { kind: "list", element: "stop_observed_wire_emission", representation: "bend" },
  stop_observed_wire_frame: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_observed_wire.Control",
        fields: [
          ["input", "stop_original_inputs_boundary"],
          ["before_environment", "advicee_lifecycle_driver_environment"],
          ["after_environment", "advicee_lifecycle_driver_environment"],
          ["before", "stop_observed_wire_endpoint"],
          ["after", "stop_observed_wire_endpoint"]
        ]
      },
      {
        tag: "stop_observed_wire.Observed",
        fields: [
          ["observation", "stop_observed_wire_observation"],
          ["original_finish", "maybe_stopscenario_finish"],
          ["receipt", "maybe_callbacks_fact"],
          ["physical", "list_stop_observed_wire_physical"],
          ["issuance", "maybe_stop_observed_wire_issuedfacts"],
          ["emissions", "list_stop_observed_wire_emission"]
        ]
      },
      {
        tag: "stop_observed_wire.PhysicalOnly",
        fields: [
          ["physical", "stop_observed_wire_physical"],
          ["receipt", "callbacks_fact"],
          ["issuance", "maybe_stop_observed_wire_issuedfacts"],
          ["emissions", "list_stop_observed_wire_emission"]
        ]
      },
      {
        tag: "stop_observed_wire.Boundary",
        fields: [
          ["input", "stop_original_inputs_boundary"],
          ["consumed", "nat"],
          ["endpoint", "stop_observed_wire_endpoint"]
        ]
      },
      { tag: "stop_observed_wire.InvalidTransport", fields: [] }
    ]
  },
  list_stop_observed_wire_frame: { kind: "list", element: "stop_observed_wire_frame", representation: "bend" },
  stop_observed_wire_trace: {
    kind: "adt",
    constructors: [
      {
        tag: "stop_observed_wire.Trace",
        fields: [
          ["input", "stop_original_inputs_scenario"],
          ["frames", "list_stop_observed_wire_frame"],
          ["endpoint", "stop_observed_wire_endpoint"],
          ["valid", "bool"]
        ]
      }
    ]
  },
  list_stop_observed_wire_trace: { kind: "list", element: "stop_observed_wire_trace", representation: "bend" },
  stop_observed_wire_envelope: {
    kind: "adt",
    constructors: [{ tag: "stop_observed_wire.Envelope", fields: [["traces", "list_stop_observed_wire_trace"]] }]
  },
  list_stop_observed_wire_envelope: { kind: "list", element: "stop_observed_wire_envelope", representation: "bend" },
  sharing_original_inputs_sessioninput: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_original_inputs.SessionInput",
        fields: [
          ["agent", "string"],
          ["identity", "nat"],
          ["profile", "workload_profile"]
        ]
      }
    ]
  },
  list_sharing_original_inputs_sessioninput: {
    kind: "list",
    element: "sharing_original_inputs_sessioninput",
    representation: "bend"
  },
  sharing_original_inputs_configuration: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_original_inputs.Configuration",
        fields: [
          ["seed", "nat"],
          ["limits", "ledger_limits"],
          ["retention", "nat"],
          ["sessions", "list_sharing_original_inputs_sessioninput"],
          ["tree", "treefacts_profile"],
          ["graph", "importgraph_limits"],
          ["preparation_delay", "nat"],
          ["output_delay", "nat"],
          ["output_lease", "nat"],
          ["reuse_entries", "nat"],
          ["reuse_bytes", "nat"],
          ["outcomes", "driver_outcomeenvironment"]
        ]
      }
    ]
  },
  sharing_original_inputs_namespace: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_original_inputs.Namespace",
        fields: [
          ["partition", "string"],
          ["work", "maybe_string"],
          ["credential", "maybe_nat"],
          ["prepared", "string"]
        ]
      }
    ]
  },
  sharing_original_inputs_edit: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_original_inputs.Edit",
        fields: [
          ["agent", "string"],
          ["at", "nat"],
          ["bytes", "nat"],
          ["units", "list_nat"],
          ["subject", "string"],
          ["input", "string"],
          ["namespace", "sharing_original_inputs_namespace"],
          ["outcome", "maybe_canonical_requestoutcome"]
        ]
      }
    ]
  },
  list_sharing_original_inputs_edit: { kind: "list", element: "sharing_original_inputs_edit", representation: "bend" },
  sharing_original_inputs_boundary: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_original_inputs.Advance",
        fields: [
          ["endpoint", "nat"],
          ["budget", "nat"]
        ]
      },
      {
        tag: "sharing_original_inputs.Leave",
        fields: [
          ["agent", "string"],
          ["admission_index", "nat"]
        ]
      },
      { tag: "sharing_original_inputs.LeaveAll", fields: [["agent", "string"]] }
    ]
  },
  list_sharing_original_inputs_boundary: {
    kind: "list",
    element: "sharing_original_inputs_boundary",
    representation: "bend"
  },
  sharing_original_inputs_scenario: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_original_inputs.Scenario",
        fields: [
          ["configuration", "sharing_original_inputs_configuration"],
          ["edits", "list_sharing_original_inputs_edit"],
          ["jev_delay", "nat"],
          ["boundaries", "list_sharing_original_inputs_boundary"]
        ]
      }
    ]
  },
  list_types_graphentry: { kind: "list", element: "types_graphentry", representation: "bend" },
  scheduler_entry: {
    kind: "adt",
    constructors: [
      {
        tag: "Scheduler.Entry",
        fields: [
          ["at", "nat"],
          ["order", "nat"]
        ]
      }
    ]
  },
  list_scheduler_entry: { kind: "list", element: "scheduler_entry", representation: "bend" },
  scheduler_state: {
    kind: "adt",
    constructors: [
      {
        tag: "Scheduler.State",
        fields: [
          ["queue", "list_scheduler_entry"],
          ["now", "nat"]
        ]
      }
    ]
  },
  session_state: {
    kind: "adt",
    constructors: [
      {
        tag: "Session.Stream",
        fields: [
          ["random", "u32"],
          ["phase", "u32"],
          ["edit", "u32"],
          ["task", "nat"],
          ["revision", "nat"],
          ["generation", "nat"],
          ["suspended", "bool"],
          ["pendingPhase", "u32"],
          ["pendingEdit", "u32"],
          ["pendingTask", "nat"],
          ["bytes", "nat"],
          ["units", "list_nat"]
        ]
      }
    ]
  },
  workload_advicee: {
    kind: "adt",
    constructors: [
      {
        tag: "Workload.Advicee",
        fields: [
          ["partition", "nat"],
          ["settings", "session_config"],
          ["stream", "session_state"],
          ["duration", "maybe_nat"]
        ]
      }
    ]
  },
  list_workload_advicee: { kind: "list", element: "workload_advicee", representation: "bend" },
  random_state: {
    kind: "adt",
    constructors: [
      {
        tag: "Random.State",
        fields: [
          ["outcomes", "u32"],
          ["faults", "u32"]
        ]
      }
    ]
  },
  advicees_scope: {
    kind: "adt",
    constructors: [
      {
        tag: "Advicees.Scope",
        fields: [
          ["identity", "nat"],
          ["partition", "nat"],
          ["seed", "nat"]
        ]
      }
    ]
  },
  list_advicees_scope: { kind: "list", element: "advicees_scope", representation: "bend" },
  advicees_registry: {
    kind: "adt",
    constructors: [
      {
        tag: "Advicees.Registry",
        fields: [
          ["next", "nat"],
          ["scopes", "list_advicees_scope"]
        ]
      }
    ]
  },
  credentialfacts_capture: {
    kind: "adt",
    constructors: [
      {
        tag: "CredentialFacts.Capture",
        fields: [
          ["operation", "nat"],
          ["generation", "nat"]
        ]
      }
    ]
  },
  list_credentialfacts_capture: { kind: "list", element: "credentialfacts_capture", representation: "bend" },
  credentialfacts_state: {
    kind: "adt",
    constructors: [
      {
        tag: "CredentialFacts.State",
        fields: [
          ["available", "bool"],
          ["generation", "nat"],
          ["issued", "list_credentialfacts_capture"]
        ]
      }
    ]
  },
  adviceelifecyclecleanup_capturedpreparation: {
    kind: "adt",
    constructors: [
      {
        tag: "AdviceeLifecycleCleanup.CapturedPreparation",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["parent", "nat"]
        ]
      }
    ]
  },
  list_adviceelifecyclecleanup_capturedpreparation: {
    kind: "list",
    element: "adviceelifecyclecleanup_capturedpreparation",
    representation: "bend"
  },
  adviceeactivity_scope: {
    kind: "adt",
    constructors: [
      {
        tag: "AdviceeActivity.Scope",
        fields: [
          ["partition", "nat"],
          ["incarnation", "nat"]
        ]
      }
    ]
  },
  list_adviceeactivity_scope: { kind: "list", element: "adviceeactivity_scope", representation: "bend" },
  callbacks_status: {
    kind: "adt",
    constructors: [
      { tag: "Callbacks.Queued", fields: [] },
      { tag: "Callbacks.Held", fields: [] },
      { tag: "Callbacks.Dropped", fields: [] }
    ]
  },
  callbacks_original: {
    kind: "adt",
    constructors: [
      {
        tag: "Callbacks.Original",
        fields: [
          ["fact", "callbacks_fact"],
          ["status", "callbacks_status"],
          ["scheduled_order", "nat"]
        ]
      }
    ]
  },
  list_callbacks_original: { kind: "list", element: "callbacks_original", representation: "bend" },
  callbacks_state: {
    kind: "adt",
    constructors: [{ tag: "Callbacks.State", fields: [["originals", "list_callbacks_original"]] }]
  },
  freshnessscenario_source: {
    kind: "adt",
    constructors: [
      {
        tag: "FreshnessScenario.Source",
        fields: [
          ["subject", "nat"],
          ["input", "nat"]
        ]
      }
    ]
  },
  freshnessscenario_binding: {
    kind: "adt",
    constructors: [
      {
        tag: "FreshnessScenario.Binding",
        fields: [
          ["scope", "freshnessscenario_scope"],
          ["source", "freshnessscenario_source"],
          ["generation", "nat"]
        ]
      }
    ]
  },
  list_freshnessscenario_binding: { kind: "list", element: "freshnessscenario_binding", representation: "bend" },
  freshnessscenario_state: {
    kind: "adt",
    constructors: [{ tag: "FreshnessScenario.State", fields: [["bindings", "list_freshnessscenario_binding"]] }]
  },
  scopedrevision_subjectkey: {
    kind: "adt",
    constructors: [
      {
        tag: "ScopedRevision.SubjectKey",
        fields: [
          ["partition", "nat"],
          ["label", "nat"],
          ["subject", "nat"]
        ]
      }
    ]
  },
  list_scopedrevision_subjectkey: { kind: "list", element: "scopedrevision_subjectkey", representation: "bend" },
  scopedrevision_state: {
    kind: "adt",
    constructors: [
      {
        tag: "ScopedRevision.State",
        fields: [
          ["keys", "list_scopedrevision_subjectkey"],
          ["next", "nat"]
        ]
      }
    ]
  },
  sharingscenario_member: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingScenario.Member",
        fields: [
          ["scope", "freshnessscenario_scope"],
          ["source", "freshnessscenario_source"],
          ["generation", "nat"]
        ]
      }
    ]
  },
  list_sharingscenario_member: { kind: "list", element: "sharingscenario_member", representation: "bend" },
  sharingscenario_physical: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingScenario.Physical",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["request", "nat"]
        ]
      }
    ]
  },
  maybe_sharingscenario_physical: { kind: "maybe", element: "sharingscenario_physical", representation: "bend" },
  maybe_freshnessscenario_scope: { kind: "maybe", element: "freshnessscenario_scope", representation: "bend" },
  sharingscenario_evaluation: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingScenario.Evaluation",
        fields: [
          ["id", "nat"],
          ["key", "sharingscenario_sharingkey"],
          ["members", "list_sharingscenario_member"],
          ["physical", "maybe_sharingscenario_physical"],
          ["advice", "maybe_freshnessscenario_scope"]
        ]
      }
    ]
  },
  list_sharingscenario_evaluation: { kind: "list", element: "sharingscenario_evaluation", representation: "bend" },
  sharingscenario_state: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingScenario.State",
        fields: [
          ["evaluations", "list_sharingscenario_evaluation"],
          ["next_id", "nat"]
        ]
      }
    ]
  },
  sharingruntime_disposition: {
    kind: "adt",
    constructors: [
      { tag: "SharingRuntime.Awaiting", fields: [] },
      { tag: "SharingRuntime.Owned", fields: [] },
      { tag: "SharingRuntime.Joined", fields: [] },
      { tag: "SharingRuntime.CachedFinding", fields: [] }
    ]
  },
  sharingruntime_preparedunit: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingRuntime.PreparedUnit",
        fields: [
          ["position", "nat"],
          ["bytes", "nat"],
          ["key", "sharingscenario_sharingkey"],
          ["evaluation", "nat"],
          ["disposition", "sharingruntime_disposition"]
        ]
      }
    ]
  },
  list_sharingruntime_preparedunit: { kind: "list", element: "sharingruntime_preparedunit", representation: "bend" },
  sharingruntime_preparation: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingRuntime.Preparation",
        fields: [
          ["scope", "freshnessscenario_scope"],
          ["member", "sharingscenario_member"],
          ["units", "list_sharingruntime_preparedunit"]
        ]
      }
    ]
  },
  list_sharingruntime_preparation: { kind: "list", element: "sharingruntime_preparation", representation: "bend" },
  sharingruntime_binding: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingRuntime.Binding",
        fields: [
          ["scope", "freshnessscenario_scope"],
          ["evaluation", "nat"],
          ["bytes", "nat"],
          ["cached", "bool"]
        ]
      }
    ]
  },
  list_sharingruntime_binding: { kind: "list", element: "sharingruntime_binding", representation: "bend" },
  sharingruntime_sharingresult: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingRuntime.SharingResult",
        fields: [
          ["evaluation", "nat"],
          ["outcome", "canonical_requestoutcome"],
          ["original", "freshnessscenario_scope"],
          ["bytes", "nat"]
        ]
      }
    ]
  },
  list_sharingruntime_sharingresult: { kind: "list", element: "sharingruntime_sharingresult", representation: "bend" },
  sharingruntime_state: {
    kind: "adt",
    constructors: [
      {
        tag: "SharingRuntime.State",
        fields: [
          ["sharing", "sharingscenario_state"],
          ["preparations", "list_sharingruntime_preparation"],
          ["bindings", "list_sharingruntime_binding"],
          ["results", "list_sharingruntime_sharingresult"]
        ]
      }
    ]
  },
  cachescenario_payload: {
    kind: "adt",
    constructors: [
      {
        tag: "CacheScenario.Payload",
        fields: [
          ["offer", "cachescenario_offer"],
          ["reservation", "nat"]
        ]
      }
    ]
  },
  list_cachescenario_payload: { kind: "list", element: "cachescenario_payload", representation: "bend" },
  cachescenario_state: {
    kind: "adt",
    constructors: [{ tag: "CacheScenario.State", fields: [["payloads", "list_cachescenario_payload"]] }]
  },
  cacheruntime_pending: {
    kind: "adt",
    constructors: [
      {
        tag: "CacheRuntime.Pending",
        fields: [
          ["offer", "cachescenario_offer"],
          ["entry_limit", "nat"],
          ["byte_limit", "nat"],
          ["reservation", "maybe_nat"],
          ["stage", "cacheruntime_stage"]
        ]
      }
    ]
  },
  list_cacheruntime_pending: { kind: "list", element: "cacheruntime_pending", representation: "bend" },
  cacheruntime_sourcecapture: {
    kind: "adt",
    constructors: [
      {
        tag: "CacheRuntime.SourceCapture",
        fields: [
          ["offer", "cachescenario_offer"],
          ["binding", "freshnessscenario_binding"]
        ]
      }
    ]
  },
  list_cacheruntime_sourcecapture: { kind: "list", element: "cacheruntime_sourcecapture", representation: "bend" },
  cacheruntime_config: {
    kind: "adt",
    constructors: [
      {
        tag: "CacheRuntime.Config",
        fields: [
          ["enabled", "bool"],
          ["entry_limit", "nat"],
          ["byte_limit", "nat"]
        ]
      }
    ]
  },
  cacheruntime_state: {
    kind: "adt",
    constructors: [
      {
        tag: "CacheRuntime.State",
        fields: [
          ["cache", "cachescenario_state"],
          ["pending", "list_cacheruntime_pending"],
          ["sources", "list_cacheruntime_sourcecapture"],
          ["config", "cacheruntime_config"]
        ]
      }
    ]
  },
  writerscenario_target: {
    kind: "adt",
    constructors: [
      {
        tag: "WriterScenario.Target",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["token", "nat"]
        ]
      }
    ]
  },
  writerscenario_capture: {
    kind: "adt",
    constructors: [
      {
        tag: "WriterScenario.Capture",
        fields: [
          ["target", "writerscenario_target"],
          ["claim_started", "nat"],
          ["claim_lifetime", "nat"],
          ["capacity", "nat"],
          ["response_id", "nat"],
          ["response", "collectionscenario_response"]
        ]
      }
    ]
  },
  list_writerscenario_capture: { kind: "list", element: "writerscenario_capture", representation: "bend" },
  writerscenario_state: {
    kind: "adt",
    constructors: [
      {
        tag: "WriterScenario.State",
        fields: [
          ["writers", "list_writerscenario_capture"],
          ["managed", "list_collectionscenario_scope"]
        ]
      }
    ]
  },
  collectorscenario_candidate: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectorScenario.Candidate",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["advice", "nat"],
          ["token", "nat"]
        ]
      }
    ]
  },
  list_collectorscenario_candidate: { kind: "list", element: "collectorscenario_candidate", representation: "bend" },
  collectorscenario_state: {
    kind: "adt",
    constructors: [
      {
        tag: "CollectorScenario.State",
        fields: [
          ["profile", "maybe_collectorscenario_profile"],
          ["candidates", "list_collectorscenario_candidate"]
        ]
      }
    ]
  },
  stopscenario_state: {
    kind: "adt",
    constructors: [
      {
        tag: "StopScenario.State",
        fields: [
          ["finishes", "list_stopscenario_finish"],
          ["next_identity", "nat"]
        ]
      }
    ]
  },
  runtimescenarios_state: {
    kind: "adt",
    constructors: [
      {
        tag: "RuntimeScenarios.State",
        fields: [
          ["callbacks", "callbacks_state"],
          ["notices", "noticescenario_state"],
          ["clocks", "list_noticescenario_clock"],
          ["freshness", "freshnessscenario_state"],
          ["sources", "scopedrevision_state"],
          ["sharing", "sharingruntime_state"],
          ["cache", "cacheruntime_state"],
          ["collection", "collectionscenario_state"],
          ["writers", "writerscenario_state"],
          ["background_collection", "collectorscenario_state"],
          ["stop", "stopscenario_state"]
        ]
      }
    ]
  },
  types_state: {
    kind: "adt",
    constructors: [
      {
        tag: "Types.State",
        fields: [
          ["canonical", "canonical_state"],
          ["graphs", "list_types_graphentry"],
          ["scheduler", "scheduler_state"],
          ["workloads", "list_workload_advicee"],
          ["random", "random_state"],
          ["advicees", "advicees_registry"],
          ["credentials", "credentialfacts_state"],
          ["opening", "list_nat"],
          ["retiring", "list_nat"],
          ["lifecycles", "list_adviceelifecycle_entry"],
          ["preparations", "list_adviceelifecyclecleanup_capturedpreparation"],
          ["activity_scopes", "list_adviceeactivity_scope"],
          ["scenarios", "runtimescenarios_state"]
        ]
      }
    ]
  },
  advicee_lifecycle_driver_job: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.Job",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["bytes", "nat"],
          ["units", "list_nat"],
          ["outcome", "maybe_canonical_requestoutcome"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.NoJob",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"]
        ]
      },
      { tag: "advicee_lifecycle_driver.Unbound", fields: [["source", "driver_sourcejob"]] }
    ]
  },
  driver_context: {
    kind: "adt",
    constructors: [
      {
        tag: "Driver.Context",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["bytes", "nat"],
          ["job", "bool"],
          ["jev_delay", "nat"],
          ["outcome", "maybe_canonical_requestoutcome"],
          ["current_work", "bool"],
          ["credential_ready", "bool"],
          ["credential_generation", "bool"],
          ["source_readable", "bool"],
          ["advice_lifetime", "nat"],
          ["candidate", "maybe_driver_candidate"],
          ["automatic_collection", "bool"],
          ["automatic_review", "bool"],
          ["automatic_output", "bool"],
          ["output_certain", "bool"],
          ["output_delay", "nat"],
          ["output_lease", "nat"],
          ["background", "bool"],
          ["automatic_dispatch", "bool"]
        ]
      }
    ]
  },
  advicee_lifecycle_driver_emissioncontext: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.EmissionContext",
        fields: [
          ["context", "driver_context"],
          ["receipt", "maybe_driver_outcomereceipt"]
        ]
      }
    ]
  },
  maybe_advicee_lifecycle_driver_emissioncontext: {
    kind: "maybe",
    element: "advicee_lifecycle_driver_emissioncontext",
    representation: "bend"
  },
  advicee_lifecycle_driver_issuance: {
    kind: "adt",
    constructors: [
      { tag: "advicee_lifecycle_driver.Environmental", fields: [["output", "maybe_outputscenario_capture"]] },
      { tag: "advicee_lifecycle_driver.CanonicalFeedback", fields: [] },
      { tag: "advicee_lifecycle_driver.RawInput", fields: [] }
    ]
  },
  advicee_lifecycle_driver_input: {
    kind: "adt",
    constructors: [
      { tag: "advicee_lifecycle_driver.Edit", fields: [["job", "advicee_lifecycle_driver_job"]] },
      {
        tag: "advicee_lifecycle_driver.SourceEdit",
        fields: [
          ["partition", "nat"],
          ["activity", "nat"],
          ["bytes", "nat"],
          ["units", "list_nat"],
          ["outcome", "maybe_canonical_requestoutcome"]
        ]
      },
      { tag: "advicee_lifecycle_driver.Finish", fields: [["input", "stopscenario_input"]] },
      {
        tag: "advicee_lifecycle_driver.FinishIntent",
        fields: [
          ["partition", "nat"],
          ["started", "nat"],
          ["cutoff", "nat"],
          ["recurring", "bool"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.Event",
        fields: [
          ["action", "driver_action"],
          ["job", "advicee_lifecycle_driver_job"],
          ["context", "maybe_advicee_lifecycle_driver_emissioncontext"],
          ["issuance", "advicee_lifecycle_driver_issuance"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.FitEvent",
        fields: [
          ["action", "driver_action"],
          ["job", "advicee_lifecycle_driver_job"],
          ["attempt", "nat"],
          ["context", "maybe_advicee_lifecycle_driver_emissioncontext"],
          ["issuance", "advicee_lifecycle_driver_issuance"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.Fact",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"],
          ["operation", "nat"],
          ["position", "nat"],
          ["event", "importgraph_graphevent"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.Arrival",
        fields: [
          ["event", "workload_emission"],
          ["lifetime", "nat"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.Cache",
        fields: [
          ["fact", "cacheruntime_fact"],
          ["job", "advicee_lifecycle_driver_job"]
        ]
      },
      { tag: "advicee_lifecycle_driver.Missing", fields: [] }
    ]
  },
  advicee_lifecycle_driver_item: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.Item",
        fields: [
          ["at", "nat"],
          ["order", "nat"],
          ["input", "advicee_lifecycle_driver_input"]
        ]
      }
    ]
  },
  list_advicee_lifecycle_driver_item: {
    kind: "list",
    element: "advicee_lifecycle_driver_item",
    representation: "bend"
  },
  advicee_lifecycle_driver_queue: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.Queue",
        fields: [
          ["items", "list_advicee_lifecycle_driver_item"],
          ["sequence", "nat"],
          ["synced", "nat"]
        ]
      }
    ]
  },
  advicee_lifecycle_driver_stored: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.Stored",
        fields: [
          ["operation", "nat"],
          ["job", "advicee_lifecycle_driver_job"]
        ]
      }
    ]
  },
  list_advicee_lifecycle_driver_stored: {
    kind: "list",
    element: "advicee_lifecycle_driver_stored",
    representation: "bend"
  },
  advicee_lifecycle_driver_runtime: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.Runtime",
        fields: [
          ["state", "types_state"],
          ["queue", "advicee_lifecycle_driver_queue"],
          ["jobs", "list_advicee_lifecycle_driver_stored"],
          ["delay", "nat"]
        ]
      }
    ]
  },
  list_advicee_lifecycle_driver_runtime: {
    kind: "list",
    element: "advicee_lifecycle_driver_runtime",
    representation: "bend"
  },
  sharing_observed_initial_agent: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_observed_initial.Agent",
        fields: [
          ["agent", "string"],
          ["partition", "nat"],
          ["lifetime", "nat"]
        ]
      }
    ]
  },
  list_sharing_observed_initial_agent: {
    kind: "list",
    element: "sharing_observed_initial_agent",
    representation: "bend"
  },
  sharing_observed_initial_queuedoriginal: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_observed_initial.QueuedOriginal",
        fields: [
          ["order", "nat"],
          ["edit", "sharing_original_inputs_edit"]
        ]
      }
    ]
  },
  list_sharing_observed_initial_queuedoriginal: {
    kind: "list",
    element: "sharing_observed_initial_queuedoriginal",
    representation: "bend"
  },
  sharing_original_captures_label: {
    kind: "adt",
    constructors: [
      { tag: "sharing_original_captures.Subject", fields: [["value", "string"]] },
      { tag: "sharing_original_captures.RevisionInput", fields: [["value", "string"]] },
      { tag: "sharing_original_captures.Prepared", fields: [["namespace", "sharing_original_inputs_namespace"]] }
    ]
  },
  sharing_original_captures_identity: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_original_captures.Identity",
        fields: [
          ["label", "sharing_original_captures_label"],
          ["id", "nat"]
        ]
      }
    ]
  },
  list_sharing_original_captures_identity: {
    kind: "list",
    element: "sharing_original_captures_identity",
    representation: "bend"
  },
  sharing_original_captures_labels: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_original_captures.Labels",
        fields: [
          ["entries", "list_sharing_original_captures_identity"],
          ["next", "nat"]
        ]
      }
    ]
  },
  sharing_original_captures_original: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_original_captures.Original",
        fields: [
          ["scope", "freshnessscenario_scope"],
          ["edit", "sharing_original_inputs_edit"]
        ]
      }
    ]
  },
  list_sharing_original_captures_original: {
    kind: "list",
    element: "sharing_original_captures_original",
    representation: "bend"
  },
  list_types_state: { kind: "list", element: "types_state", representation: "bend" },
  list_canonical_step: { kind: "list", element: "canonical_step", representation: "bend" },
  advicee_lifecycle_driver_physicaldelivery: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.PhysicalDelivery",
        fields: [
          ["before", "list_advicee_lifecycle_driver_runtime"],
          ["after", "list_advicee_lifecycle_driver_runtime"],
          ["action", "maybe_driver_action"]
        ]
      }
    ]
  },
  list_advicee_lifecycle_driver_physicaldelivery: {
    kind: "list",
    element: "advicee_lifecycle_driver_physicaldelivery",
    representation: "bend"
  },
  types_graphtransition: {
    kind: "adt",
    constructors: [
      {
        tag: "Types.GraphTransition",
        fields: [
          ["state", "types_state"],
          ["before", "importgraph_bounded"],
          ["result", "importgraph_boundedstep"]
        ]
      },
      { tag: "Types.GraphRejected", fields: [["state", "types_state"]] }
    ]
  },
  list_types_graphtransition: { kind: "list", element: "types_graphtransition", representation: "bend" },
  advicee_lifecycle_driver_observedframe: {
    kind: "adt",
    constructors: [
      {
        tag: "advicee_lifecycle_driver.CanonicalFrame",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["order", "nat"],
          ["event", "canonical_canonicalevent"],
          ["result", "list_canonical_step"],
          ["runtime_before", "list_advicee_lifecycle_driver_runtime"],
          ["runtime_after", "list_advicee_lifecycle_driver_runtime"],
          ["provided", "maybe_nat"],
          ["output_scopes", "list_maybe_nat"],
          ["receipt", "maybe_callbacks_fact"],
          ["physical", "list_advicee_lifecycle_driver_physicaldelivery"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.GraphFrame",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["order", "nat"],
          ["key", "types_graphkey"],
          ["position", "nat"],
          ["event", "importgraph_graphevent"],
          ["result", "list_types_graphtransition"],
          ["runtime_before", "list_advicee_lifecycle_driver_runtime"],
          ["runtime_after", "list_advicee_lifecycle_driver_runtime"],
          ["provided", "maybe_nat"],
          ["output_scopes", "list_maybe_nat"],
          ["receipt", "maybe_callbacks_fact"],
          ["physical", "list_advicee_lifecycle_driver_physicaldelivery"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.CacheFrame",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["order", "nat"],
          ["fact", "cacheruntime_fact"],
          ["event", "canonical_canonicalevent"],
          ["result", "list_canonical_step"],
          ["runtime_before", "list_advicee_lifecycle_driver_runtime"],
          ["runtime_after", "list_advicee_lifecycle_driver_runtime"],
          ["provided", "maybe_nat"],
          ["output_scopes", "list_maybe_nat"],
          ["receipt", "maybe_callbacks_fact"],
          ["physical", "list_advicee_lifecycle_driver_physicaldelivery"]
        ]
      },
      {
        tag: "advicee_lifecycle_driver.FinishFrame",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["order", "nat"],
          ["input", "stopscenario_input"],
          ["finish", "maybe_stopscenario_finish"],
          ["created", "bool"],
          ["runtime_before", "list_advicee_lifecycle_driver_runtime"],
          ["runtime_after", "list_advicee_lifecycle_driver_runtime"],
          ["provided", "maybe_nat"],
          ["output_scopes", "list_maybe_nat"],
          ["receipt", "maybe_callbacks_fact"],
          ["physical", "list_advicee_lifecycle_driver_physicaldelivery"]
        ]
      },
      { tag: "advicee_lifecycle_driver.UnexpectedInput", fields: [] }
    ]
  },
  list_canonical_canonicalevent: { kind: "list", element: "canonical_canonicalevent", representation: "bend" },
  sharing_observed_driver_frame: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_observed_driver.Observed",
        fields: [
          ["frame", "advicee_lifecycle_driver_observedframe"],
          ["receipt", "maybe_callbacks_target"],
          ["provided", "maybe_nat"],
          ["scopes", "maybe_list_maybe_nat"]
        ]
      },
      {
        tag: "sharing_observed_driver.Control",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["input", "sharing_original_inputs_boundary"],
          ["target", "maybe_freshnessscenario_scope"],
          ["events", "list_canonical_canonicalevent"],
          ["applied", "bool"]
        ]
      },
      {
        tag: "sharing_observed_driver.Boundary",
        fields: [
          ["endpoint", "nat"],
          ["budget", "nat"],
          ["consumed", "nat"],
          ["state", "list_types_state"]
        ]
      },
      { tag: "sharing_observed_driver.InvalidTransport", fields: [] }
    ]
  },
  list_sharing_observed_driver_frame: {
    kind: "list",
    element: "sharing_observed_driver_frame",
    representation: "bend"
  },
  sharing_observed_driver_trace: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_observed_driver.Trace",
        fields: [
          ["runtime", "list_advicee_lifecycle_driver_runtime"],
          ["agents", "list_sharing_observed_initial_agent"],
          ["queued", "list_sharing_observed_initial_queuedoriginal"],
          ["labels", "sharing_original_captures_labels"],
          ["originals", "list_sharing_original_captures_original"],
          ["issued", "nat"],
          ["consumed", "nat"],
          ["frames", "list_sharing_observed_driver_frame"],
          ["valid", "bool"]
        ]
      }
    ]
  },
  sharing_observed_wire_envelope: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_observed_wire.Envelope",
        fields: [
          ["input", "sharing_original_inputs_scenario"],
          ["trace", "sharing_observed_driver_trace"]
        ]
      }
    ]
  },
  callbacks_scheduled: {
    kind: "adt",
    constructors: [
      {
        tag: "Callbacks.Scheduled",
        fields: [
          ["at", "nat"],
          ["order", "nat"],
          ["action", "driver_action"]
        ]
      }
    ]
  },
  list_callbacks_scheduled: { kind: "list", element: "callbacks_scheduled", representation: "bend" },
  output_scenario_driver_frame: {
    kind: "adt",
    constructors: [
      {
        tag: "output_scenario_driver.Observed",
        fields: [
          ["frame", "advicee_lifecycle_driver_observedframe"],
          ["receipt", "maybe_callbacks_fact"],
          ["output_scopes", "list_maybe_nat"]
        ]
      },
      {
        tag: "output_scenario_driver.OutcomeControl",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["target", "callbacks_target"],
          ["outcome", "outputscenario_outcome"],
          ["result", "callbacks_applicability"],
          ["schedule", "list_callbacks_scheduled"]
        ]
      },
      {
        tag: "output_scenario_driver.CallbackControl",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["target", "callbacks_target"],
          ["action", "callbacks_control"],
          ["result", "callbacks_applicability"],
          ["schedule", "list_callbacks_scheduled"]
        ]
      },
      { tag: "output_scenario_driver.InvalidTransport", fields: [] }
    ]
  },
  list_output_scenario_driver_frame: { kind: "list", element: "output_scenario_driver_frame", representation: "bend" },
  output_scenario_driver_trace: {
    kind: "adt",
    constructors: [
      {
        tag: "output_scenario_driver.Trace",
        fields: [
          ["frames", "list_output_scenario_driver_frame"],
          ["endpoint", "list_types_state"],
          ["valid", "bool"]
        ]
      }
    ]
  },
  list_output_scenario_driver_trace: { kind: "list", element: "output_scenario_driver_trace", representation: "bend" },
  output_scenario_driver_envelope: {
    kind: "adt",
    constructors: [
      { tag: "output_scenario_driver.Envelope", fields: [["traces", "list_output_scenario_driver_trace"]] }
    ]
  },
  list_output_scenario_driver_envelope: {
    kind: "list",
    element: "output_scenario_driver_envelope",
    representation: "bend"
  },
  writer_original_inputs_edit: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_original_inputs.Edit",
        fields: [
          ["agent", "string"],
          ["at", "nat"],
          ["bytes", "nat"],
          ["units", "list_nat"],
          ["outcome", "maybe_canonical_requestoutcome"]
        ]
      },
      { tag: "writer_original_inputs.SharedEdit", fields: [["original", "sharing_original_inputs_edit"]] }
    ]
  },
  list_writer_original_inputs_edit: { kind: "list", element: "writer_original_inputs_edit", representation: "bend" },
  writerscenario_claimfacts: {
    kind: "adt",
    constructors: [
      {
        tag: "WriterScenario.ClaimFacts",
        fields: [
          ["target", "writerscenario_target"],
          ["claim_started", "nat"],
          ["claim_lifetime", "nat"],
          ["capacity", "nat"],
          ["response", "collectionscenario_response"]
        ]
      }
    ]
  },
  writer_observed_driver_control: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_observed_driver.Claim",
        fields: [
          ["agent", "string"],
          ["facts", "writerscenario_claimfacts"]
        ]
      },
      {
        tag: "writer_observed_driver.Attempt",
        fields: [
          ["agent", "string"],
          ["target", "writerscenario_target"],
          ["blocked", "bool"]
        ]
      },
      {
        tag: "writer_observed_driver.Release",
        fields: [
          ["agent", "string"],
          ["target", "writerscenario_target"]
        ]
      },
      {
        tag: "writer_observed_driver.Expire",
        fields: [
          ["agent", "string"],
          ["target", "writerscenario_target"]
        ]
      }
    ]
  },
  writer_intersection_controls_control: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_intersection_controls.OpenResponse",
        fields: [
          ["agent", "string"],
          ["response", "collectionscenario_response"]
        ]
      },
      {
        tag: "writer_intersection_controls.AttemptIssuedResponse",
        fields: [
          ["agent", "string"],
          ["open_index", "nat"],
          ["blocked", "bool"]
        ]
      },
      {
        tag: "writer_intersection_controls.OutputProfile",
        fields: [
          ["delay", "nat"],
          ["lease", "nat"]
        ]
      },
      {
        tag: "writer_intersection_controls.LeaveMember",
        fields: [
          ["agent", "string"],
          ["admission_index", "nat"]
        ]
      },
      {
        tag: "writer_intersection_controls.CloseIssuedResponse",
        fields: [
          ["agent", "string"],
          ["open_index", "nat"]
        ]
      },
      {
        tag: "writer_intersection_controls.AttemptIssuedResponseScope",
        fields: [
          ["agent", "string"],
          ["open_index", "nat"],
          ["lifetime", "nat"],
          ["blocked", "bool"]
        ]
      }
    ]
  },
  writer_original_inputs_boundary: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_original_inputs.Advance",
        fields: [
          ["endpoint", "nat"],
          ["budget", "nat"]
        ]
      },
      { tag: "writer_original_inputs.WriterControl", fields: [["input", "writer_observed_driver_control"]] },
      {
        tag: "writer_original_inputs.IntersectionControl",
        fields: [["input", "writer_intersection_controls_control"]]
      },
      {
        tag: "writer_original_inputs.Departure",
        fields: [
          ["agent", "string"],
          ["partition", "nat"],
          ["action", "adviceelifecycle_action"]
        ]
      }
    ]
  },
  list_writer_original_inputs_boundary: {
    kind: "list",
    element: "writer_original_inputs_boundary",
    representation: "bend"
  },
  writer_original_inputs_scenario: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_original_inputs.Scenario",
        fields: [
          ["configuration", "sharing_original_inputs_configuration"],
          ["edits", "list_writer_original_inputs_edit"],
          ["jev_delay", "nat"],
          ["boundaries", "list_writer_original_inputs_boundary"]
        ]
      }
    ]
  },
  writerscenario_pending: {
    kind: "adt",
    constructors: [
      {
        tag: "WriterScenario.Pending",
        fields: [
          ["facts", "writerscenario_claimfacts"],
          ["credential", "nat"]
        ]
      }
    ]
  },
  writer_observed_transport_capsule: {
    kind: "adt",
    constructors: [
      { tag: "writer_observed_transport.Pending", fields: [["original", "writerscenario_pending"]] },
      { tag: "writer_observed_transport.Response", fields: [["original", "collectionscenario_identity"]] },
      { tag: "writer_observed_transport.Release", fields: [["original", "writerscenario_capture"]] },
      { tag: "writer_observed_transport.UnissuedRelease", fields: [["original", "writerscenario_pending"]] }
    ]
  },
  writer_observed_context_scope: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_observed_context.Scope",
        fields: [
          ["partition", "nat"],
          ["lifetime", "nat"],
          ["round", "nat"]
        ]
      }
    ]
  },
  writer_observed_context_payload: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_observed_context.Payload",
        fields: [
          ["scope", "writer_observed_context_scope"],
          ["has_job", "bool"]
        ]
      }
    ]
  },
  maybe_writer_observed_transport_capsule: {
    kind: "maybe",
    element: "writer_observed_transport_capsule",
    representation: "bend"
  },
  writer_observed_transport_binding: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_observed_transport.Binding",
        fields: [
          ["order", "nat"],
          ["capsule", "writer_observed_transport_capsule"]
        ]
      },
      {
        tag: "writer_observed_transport.ContextBinding",
        fields: [
          ["order", "nat"],
          ["payload", "writer_observed_context_payload"],
          ["capsule", "maybe_writer_observed_transport_capsule"]
        ]
      }
    ]
  },
  list_writer_observed_transport_binding: {
    kind: "list",
    element: "writer_observed_transport_binding",
    representation: "bend"
  },
  maybe_writerscenario_pending: { kind: "maybe", element: "writerscenario_pending", representation: "bend" },
  collectionscenario_applicability: {
    kind: "adt",
    constructors: [
      { tag: "CollectionScenario.Applied", fields: [] },
      { tag: "CollectionScenario.Missing", fields: [] },
      { tag: "CollectionScenario.WrongScope", fields: [] },
      { tag: "CollectionScenario.AlreadyAttempting", fields: [] },
      { tag: "CollectionScenario.IdentityExhausted", fields: [] },
      { tag: "CollectionScenario.ContextBound", fields: [] }
    ]
  },
  maybe_collectionscenario_identity: { kind: "maybe", element: "collectionscenario_identity", representation: "bend" },
  engine_responseresult: {
    kind: "adt",
    constructors: [
      {
        tag: "Engine.ResponseResult",
        fields: [
          ["result", "collectionscenario_applicability"],
          ["issued", "maybe_collectionscenario_identity"]
        ]
      }
    ]
  },
  writer_observed_driver_report: {
    kind: "adt",
    constructors: [
      { tag: "writer_observed_driver.Queued", fields: [] },
      { tag: "writer_observed_driver.RefusedScope", fields: [] },
      {
        tag: "writer_observed_driver.OwnerResult",
        fields: [
          ["value", "engine_responseresult"],
          ["target", "maybe_collectionscenario_identity"]
        ]
      }
    ]
  },
  maybe_adviceelifecycle_entry: { kind: "maybe", element: "adviceelifecycle_entry", representation: "bend" },
  adviceelifecycle_changed: {
    kind: "adt",
    constructors: [
      {
        tag: "AdviceeLifecycle.Changed",
        fields: [
          ["entries", "list_adviceelifecycle_entry"],
          ["previous", "maybe_adviceelifecycle_entry"],
          ["current", "maybe_adviceelifecycle_entry"],
          ["valid", "bool"]
        ]
      }
    ]
  },
  list_driver_action: { kind: "list", element: "driver_action", representation: "bend" },
  adviceelifecyclecleanup_cleanupplan: {
    kind: "adt",
    constructors: [
      {
        tag: "AdviceeLifecycleCleanup.CleanupPlan",
        fields: [
          ["actions", "list_driver_action"],
          ["operations", "list_nat"],
          ["preparations", "list_adviceelifecyclecleanup_capturedpreparation"]
        ]
      }
    ]
  },
  list_workload_emission: { kind: "list", element: "workload_emission", representation: "bend" },
  maybe_engine_responseresult: { kind: "maybe", element: "engine_responseresult", representation: "bend" },
  writer_observed_driver_frame: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_observed_driver.ControlFrame",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["input", "writer_observed_driver_control"],
          ["pending", "maybe_writerscenario_pending"],
          ["report", "writer_observed_driver_report"],
          ["order", "maybe_nat"]
        ]
      },
      {
        tag: "writer_observed_driver.GrantFrame",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["original", "writerscenario_pending"],
          ["event", "canonical_canonicalevent"],
          ["result", "canonical_step"],
          ["report", "engine_responseresult"],
          ["order", "nat"]
        ]
      },
      {
        tag: "writer_observed_driver.Observed",
        fields: [
          ["frame", "advicee_lifecycle_driver_observedframe"],
          ["receipt", "maybe_callbacks_target"],
          ["scopes", "maybe_list_maybe_nat"]
        ]
      },
      {
        tag: "writer_observed_driver.Boundary",
        fields: [
          ["endpoint", "nat"],
          ["budget", "nat"],
          ["consumed", "nat"],
          ["state", "list_types_state"]
        ]
      },
      {
        tag: "writer_observed_driver.LifecycleFrame",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["agent", "string"],
          ["partition", "nat"],
          ["action", "adviceelifecycle_action"],
          ["changed", "adviceelifecycle_changed"],
          ["cleanup", "adviceelifecyclecleanup_cleanupplan"],
          ["emissions", "list_workload_emission"]
        ]
      },
      {
        tag: "writer_observed_driver.IntersectionFrame",
        fields: [
          ["before", "list_types_state"],
          ["after", "list_types_state"],
          ["time", "nat"],
          ["input", "writer_intersection_controls_control"],
          ["response", "maybe_collectionscenario_identity"],
          ["member", "maybe_freshnessscenario_scope"],
          ["result", "maybe_engine_responseresult"],
          ["events", "list_canonical_canonicalevent"],
          ["applied", "bool"]
        ]
      },
      { tag: "writer_observed_driver.InvalidTransport", fields: [] }
    ]
  },
  list_writer_observed_driver_frame: { kind: "list", element: "writer_observed_driver_frame", representation: "bend" },
  writer_observed_driver_runtime: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_observed_driver.Runtime",
        fields: [
          ["runtime", "list_advicee_lifecycle_driver_runtime"],
          ["bindings", "list_writer_observed_transport_binding"],
          ["frames", "list_writer_observed_driver_frame"],
          ["consumed", "nat"],
          ["valid", "bool"]
        ]
      }
    ]
  },
  writer_observed_program_originalinputs: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_observed_program.OriginalInputs",
        fields: [
          ["edits", "list_writer_original_inputs_edit"],
          ["sharing", "list_sharing_observed_initial_queuedoriginal"]
        ]
      }
    ]
  },
  writer_observed_program_trace: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_observed_program.Trace",
        fields: [
          ["writer", "writer_observed_driver_runtime"],
          ["agents", "list_sharing_observed_initial_agent"],
          ["queued", "writer_observed_program_originalinputs"],
          ["labels", "sharing_original_captures_labels"],
          ["originals", "list_sharing_original_captures_original"],
          ["issued", "nat"]
        ]
      }
    ]
  },
  writer_observed_wire_envelope: {
    kind: "adt",
    constructors: [
      {
        tag: "writer_observed_wire.Envelope",
        fields: [
          ["input", "writer_original_inputs_scenario"],
          ["trace", "writer_observed_program_trace"]
        ]
      }
    ]
  },
  list_writer_observed_wire_envelope: {
    kind: "list",
    element: "writer_observed_wire_envelope",
    representation: "bend"
  },
  wire_graph: {
    kind: "record",
    fields: [
      ["before", "importgraph_bounded"],
      ["after", "importgraph_bounded"],
      ["command", "importgraph_command"]
    ]
  },
  wire_scope: { kind: "maybe", element: "nat", representation: "plain" },
  wire_scopes: { kind: "list", element: "wire_scope", representation: "plain" },
  wire_receipt: { kind: "maybe", element: "callbacks_target", representation: "plain" },
  wire_frames: { kind: "list", element: "wire_frame", representation: "plain" },
  wire_targets: { kind: "list", element: "callbacks_target", representation: "plain" },
  wire_endpoint: {
    kind: "record",
    fields: [
      ["time", "nat"],
      ["projection", "canonical_state"],
      ["targets", "wire_targets"],
      ["lifecycles", "list_adviceelifecycle_entry"]
    ]
  },
  wire_scenario: {
    kind: "record",
    fields: [
      ["frames", "wire_frames"],
      ["endpoint", "wire_endpoint"]
    ]
  },
  wire_scenarios: { kind: "list", element: "wire_scenario", representation: "plain" },
  wire_frame: {
    kind: "variant",
    constructors: [
      {
        kind: "canonical",
        fields: [
          ["time", "nat"],
          ["before", "canonical_state"],
          ["after", "canonical_state"],
          ["event", "canonical_canonicalevent"],
          ["result", "canonical_step"],
          ["outputScopes", "wire_scopes"],
          ["receipt", "wire_receipt"]
        ]
      },
      {
        kind: "graph",
        fields: [
          ["time", "nat"],
          ["before", "canonical_state"],
          ["after", "canonical_state"],
          ["key", "types_graphkey"],
          ["position", "nat"],
          ["event", "importgraph_graphevent"],
          ["graph", "wire_graph"]
        ]
      },
      {
        kind: "callback",
        fields: [
          ["time", "nat"],
          ["before", "canonical_state"],
          ["after", "canonical_state"],
          ["target", "callbacks_target"],
          ["action", "callbacks_control"],
          ["result", "callbacks_applicability"]
        ]
      },
      {
        kind: "lifecycle",
        fields: [
          ["before", "canonical_state"],
          ["after", "canonical_state"],
          ["partition", "nat"],
          ["action", "adviceelifecycle_action"]
        ]
      },
      {
        kind: "source",
        fields: [
          ["time", "nat"],
          ["event", "canonical_canonicalevent"]
        ]
      },
      { kind: "fuelExhausted", fields: [] },
      { kind: "unexpectedCoreNil", fields: [] },
      { kind: "unexpectedSerializerInput", fields: [] }
    ]
  },
  expiry_scenarios: { kind: "list", element: "expiry_observed_driver_envelope", representation: "bend" },
  stop_scenarios: { kind: "list", element: "stop_observed_wire_envelope", representation: "bend" },
  sharing_scenarios: {
    kind: "adt",
    constructors: [
      {
        tag: "sharing_observed_wire.Envelope",
        fields: [
          ["input", "sharing_original_inputs_scenario"],
          ["trace", "sharing_observed_driver_trace"]
        ]
      }
    ]
  },
  output_scenarios: { kind: "list", element: "output_scenario_driver_envelope", representation: "bend" },
  writer_scenarios: { kind: "list", element: "writer_observed_wire_envelope", representation: "bend" }
} as const
export const callbackNativeOwnerSources = [
  {
    path: "packages/agent-flow-bend/Admission.bend",
    sha256: "ea0b408bc8f96d5df0e73cbfea666d2af0ec96e34bb6e7e730bf5b7a62cf1697"
  },
  {
    path: "packages/agent-flow-bend/Canonical.bend",
    sha256: "05e6e2367d3112c3cd0614acabf71ffa5bc247a4cdd53a2f6916f734e1c3610b"
  },
  {
    path: "packages/agent-flow-bend/CollectionState.bend",
    sha256: "9e61f14523b15d1f98b0f89ff0c324788b5304be2560f0b2eb02e45a365758dc"
  },
  {
    path: "packages/agent-flow-bend/CollectorAuthority.bend",
    sha256: "f75d85ce2d8eff051593ffa51ef31c0a29c17d1912540d07352918704c58c042"
  },
  {
    path: "packages/agent-flow-bend/Configuration.bend",
    sha256: "3ac261b12ee4d463c32975fdf84f63cd8d39418230d3d0dda6af83d0cc4fae61"
  },
  {
    path: "packages/agent-flow-bend/Delivery.bend",
    sha256: "1681ef298739ae232400c9137d4e9687bf80219006bd6881bf249676388c420a"
  },
  {
    path: "packages/agent-flow-bend/DeliveryState.bend",
    sha256: "fe38df27671f8f67164e33eb131b4b7b38f2635edddfd2552e3cb5d0a5900237"
  },
  {
    path: "packages/agent-flow-bend/Dispatch.bend",
    sha256: "ae10e0bde2c5059b330cb968a165703e029eb05d1d223bd790b413bf5998bf46"
  },
  {
    path: "packages/agent-flow-bend/EditHistory.bend",
    sha256: "93af7be4e6acadc605ac6a2a709316bc10e84da03929da3c82cd037c213ed99a"
  },
  {
    path: "packages/agent-flow-bend/Handoff.bend",
    sha256: "d1bd58f4de5346e47aa8cefa6daa86808a9aaf7312f3bbe28188dc48721d9696"
  },
  {
    path: "packages/agent-flow-bend/ImportGraph.bend",
    sha256: "ff45b8e5663bd0d5bb3e52e86cd766545cd61550b2b5ad1c01d17c8dc46a5346"
  },
  {
    path: "packages/agent-flow-bend/Ledger.bend",
    sha256: "5bb64c9bb55d7ec4d94648cf320b27cfaa3660f29c9806131ed96ffdee075cad"
  },
  {
    path: "packages/agent-flow-bend/NoticeState.bend",
    sha256: "4354186ba0d3c2000ff4a763fc69e8487f0cf3052fc069d20f8c1ac2814ca89c"
  },
  {
    path: "packages/agent-flow-bend/Quiescence.bend",
    sha256: "abb7112120c681419d252072b0682ee8e36a50bc33b4ddde217c9d60d2813b34"
  },
  {
    path: "packages/agent-flow-bend/Retention.bend",
    sha256: "1f1159849de71778a3c7eec075f0ca1e7c3c17e335ce2923731ddd85e36eeccd"
  },
  {
    path: "packages/agent-flow-bend/Reuse.bend",
    sha256: "1b8b0483f0d577d97fd60ee93d55caa4261dc022743b6541cf7bc7ee854e58b7"
  },
  {
    path: "packages/agent-flow-bend/ReuseState.bend",
    sha256: "88dd20e7ac490cefb356e144c8af92d3193a6ed119a622cdf294bfa8633a5ba4"
  },
  {
    path: "packages/agent-flow-bend/RevisionState.bend",
    sha256: "fb53b4ccc36c3153b39691560b0f905d1f72a13204c3889136207bf2e3b89d7b"
  },
  {
    path: "packages/agent-flow-bend/RulePolicy.bend",
    sha256: "ae3d229f70614445b50736e5365c8f306845e134c335ace7ece78b071994b2a1"
  },
  {
    path: "packages/agent-flow-bend/SubmissionState.bend",
    sha256: "b0f699a559c0fdf7a117e491c4fd44a863cc86c62bc23ee67e93cac443b50f95"
  },
  {
    path: "packages/monkey-business-bend/AdviceeActivity.bend",
    sha256: "d88133281988b9210e3a41d05703e7a6afcaf605f0077f6f7af9dcb71efbf10b"
  },
  {
    path: "packages/monkey-business-bend/AdviceeLifecycle.bend",
    sha256: "a6a4bfbe62f66d9d41f6954d8092c518ee33e228974f0fe009035febb84b727a"
  },
  {
    path: "packages/monkey-business-bend/AdviceeLifecycleCleanup.bend",
    sha256: "305f635b955172ad0dc52a1a4a89c55f16994b867d4ac30b9296d44ca5493135"
  },
  {
    path: "packages/monkey-business-bend/Advicees.bend",
    sha256: "d73b3c369855e05f2e2bade0e59ec10c0e34714efad320252efc68f8b8771ccd"
  },
  {
    path: "packages/monkey-business-bend/CacheRuntime.bend",
    sha256: "36a6126ecf26bb1e229e28f5c70e21a593a3d23556ccc0a3078054c8ba1d34fb"
  },
  {
    path: "packages/monkey-business-bend/CacheScenario.bend",
    sha256: "ff1792e62fd289dcd81938231b070a9b0fb9a40c18732bf1d5550d4638f5f737"
  },
  {
    path: "packages/monkey-business-bend/Callbacks.bend",
    sha256: "fe215ef69a690ef9a6aa4667c9cf1479c1fdfb4776c47f6480aa6b097930cce5"
  },
  {
    path: "packages/monkey-business-bend/CollectionScenario.bend",
    sha256: "227d85c6070fab18990a41a9fc318ff478a01a87377fa8660e2ca042a650a638"
  },
  {
    path: "packages/monkey-business-bend/CollectorScenario.bend",
    sha256: "a3c2903e38605e0d304dc9ed8d4bca50d6be356a9830931da78fa0c1951b767c"
  },
  {
    path: "packages/monkey-business-bend/CredentialFacts.bend",
    sha256: "0e0b5513aba142fb909641832e91ce21e30870f9b9065c3b95270193ed78f193"
  },
  {
    path: "packages/monkey-business-bend/Driver.bend",
    sha256: "7c5c76130225134e117c467143d7011411be3b1fc1d91244d9ca9b964fae5f36"
  },
  {
    path: "packages/monkey-business-bend/Engine.bend",
    sha256: "1392c9d269bd0284d9e6621189b2ce5c2aa69ab09961bda73150a48609624fd3"
  },
  {
    path: "packages/monkey-business-bend/ExpiryScenario.bend",
    sha256: "9d0b4e9987657e470a9216f4abf9bd619939256928a36bae9cfea8a16101d495"
  },
  {
    path: "packages/monkey-business-bend/FreshnessScenario.bend",
    sha256: "28284f350e4225d46d3a7ea457c9c0a8a6b634ab3842b26e58349ad862ee0a89"
  },
  {
    path: "packages/monkey-business-bend/NoticeScenario.bend",
    sha256: "a088d8d889ba2aed5fa68c8a59fccda331bd034da9c1b046b780d5c48c89d6e4"
  },
  {
    path: "packages/monkey-business-bend/Numeric.bend",
    sha256: "f105f5ed959cf6f0e549f4c6122cce8b28e725ea1ddd564e77435ebb3676dae0"
  },
  {
    path: "packages/monkey-business-bend/OutputScenario.bend",
    sha256: "be7888b3661e1d6b410803509e3905a2e2eef971da9eb40c217183ea663bb58f"
  },
  {
    path: "packages/monkey-business-bend/Random.bend",
    sha256: "2360899d33d3d776e6ea0c03cebc4888fc4a40bf606469d5baf907d11fb0925f"
  },
  {
    path: "packages/monkey-business-bend/RuntimeScenarios.bend",
    sha256: "68b3831ea67e49fac0d1e3af253ee77a26d782d3dab1609c30a3c55d887e3a80"
  },
  {
    path: "packages/monkey-business-bend/Scheduler.bend",
    sha256: "ed06bd1a9d4cfb70ebae9ecdaae383aab863392b68c261d63c6890a96a23225c"
  },
  {
    path: "packages/monkey-business-bend/ScopedRevision.bend",
    sha256: "71b3ace544f196364e53f5d565ecfbbd2802a1caf0437071206f30b7c6e721c5"
  },
  {
    path: "packages/monkey-business-bend/Session.bend",
    sha256: "97d8c87aab34273dbda1b44b188060676c0c3287908ea6a0f89fb97df7575038"
  },
  {
    path: "packages/monkey-business-bend/SharingRuntime.bend",
    sha256: "8fed55f906b8f2f0cc7af97c8d657d2ad4f3134b0692313d911450c176e18503"
  },
  {
    path: "packages/monkey-business-bend/SharingScenario.bend",
    sha256: "316a96c614863696710f2bb1b4ba7e3ee85a4d9c01d722e7023a94c0306cbaab"
  },
  {
    path: "packages/monkey-business-bend/StopScenario.bend",
    sha256: "bd38c6fe0f3743809baba5bd9bc3694e42e6717660299ab430f77cad6685e317"
  },
  {
    path: "packages/monkey-business-bend/TreeFacts.bend",
    sha256: "72ba2fd5b8fceeb9ff371094bea2b678707ee50cf9fc0f57883809e6eb8b156b"
  },
  {
    path: "packages/monkey-business-bend/Types.bend",
    sha256: "1e94c15affe08b8f7d10ce2cb9b624cfce49a5b12cf2be0014eb5127ec656f1f"
  },
  {
    path: "packages/monkey-business-bend/Workload.bend",
    sha256: "61bf4338611c9a5e5247bdb8f599007b81042c4165437d4dfb656aa4861e184d"
  },
  {
    path: "packages/monkey-business-bend/WriterScenario.bend",
    sha256: "dcf66b08a47a501b47876194d24c150948a5740fb95d040af7821b4bd3fad4cf"
  },
  {
    path: "packages/monkey-business-bend/conformance/advicee-lifecycle-driver.bend",
    sha256: "a2049c407e7d68127191163c11aaab8cc90d2a8dc882d1ceaa2def8e2eae93e7"
  },
  {
    path: "packages/monkey-business-bend/conformance/expiry-observed-driver.bend",
    sha256: "2a2c8d4654113a401b0cec043e1b50b6aba34d630f6b877ffea2d13caf211e73"
  },
  {
    path: "packages/monkey-business-bend/conformance/expiry-observed-wire.bend",
    sha256: "5c70878ba673d56b3bbc4aba3941e8ded85103c4512362badd3a0faf6f284143"
  },
  {
    path: "packages/monkey-business-bend/conformance/output-scenario-driver.bend",
    sha256: "77c0b0b776d3300e1dca79b23dc3db19726e353fa7999a6eabd0a844dad92ac5"
  },
  {
    path: "packages/monkey-business-bend/conformance/sharing-observed-driver.bend",
    sha256: "355a278c38b32b40a8ec4fe87b685114771f44250ead41db13139c0e01aea119"
  },
  {
    path: "packages/monkey-business-bend/conformance/sharing-observed-initial.bend",
    sha256: "89227186c46113846824819938cee083090baba2b28e576a582a982c9438968b"
  },
  {
    path: "packages/monkey-business-bend/conformance/sharing-observed-wire.bend",
    sha256: "1d1730d44f56666e8d52e99ff3b23543a1618161dd74ee1e71b0c4eca4e42288"
  },
  {
    path: "packages/monkey-business-bend/conformance/sharing-original-captures.bend",
    sha256: "1767fd4233c9205c9ab4ff23da555149382808fa6c36f684eafb9d6a5d2e18f0"
  },
  {
    path: "packages/monkey-business-bend/conformance/sharing-original-inputs.bend",
    sha256: "ea0146abe9364918d37bd4a27e84ca9434796062a3c9cf5cb45f462c485f4d18"
  },
  {
    path: "packages/monkey-business-bend/conformance/stop-observed-wire.bend",
    sha256: "7e64eb5fb89e43e30f77b2f4eb2d2f434cf9efd8b10c810f7f2d4afd8c3a14b6"
  },
  {
    path: "packages/monkey-business-bend/conformance/stop-original-inputs.bend",
    sha256: "5a7d9f2529d52078cc44eaeb1fb62c6149b0aa39e90941fc2e1be5335c6b33d6"
  },
  {
    path: "packages/monkey-business-bend/conformance/writer-intersection-controls.bend",
    sha256: "799c129a5371b6ec6a8016bf7325788ab1e8938adbbcb63e42720a40eb258942"
  },
  {
    path: "packages/monkey-business-bend/conformance/writer-observed-context.bend",
    sha256: "7c60e600bf2e79a777ca94599c397943e88c1677a457f394209c437884fda666"
  },
  {
    path: "packages/monkey-business-bend/conformance/writer-observed-driver.bend",
    sha256: "5259e8501e082a981a01984ab7a1c2a75b0bdf964542c30f714b6921fd48e4a9"
  },
  {
    path: "packages/monkey-business-bend/conformance/writer-observed-program.bend",
    sha256: "8bfc2337efa90941719bf921c041d1a2f4b790e09424a53b4dc640e97c311d43"
  },
  {
    path: "packages/monkey-business-bend/conformance/writer-observed-transport.bend",
    sha256: "c8d39cbd9e976cc8146064e38b1984e4bf40c68b75052d6f2ccea1234651d56b"
  },
  {
    path: "packages/monkey-business-bend/conformance/writer-observed-wire.bend",
    sha256: "dae89548c8b96ee38825f8cfdd17440d8e586e6fec07397bc9cce291782fc928"
  },
  {
    path: "packages/monkey-business-bend/conformance/writer-original-inputs.bend",
    sha256: "282471e9f7e45a9b33ae503bef885e3638e0cac5f4e1d32047652712d5fbbc15"
  }
] as const
