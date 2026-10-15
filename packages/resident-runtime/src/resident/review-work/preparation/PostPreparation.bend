import Base

# Synchronous sizing recipe. Register values remain native and retain IEEE arithmetic.
# Registers 0n/1n/2n are prepared/observation/dispatch. Every record field is selected here.
type SizingField is Data:
  SizingField{name: String, value: Nat}
type SizingFindingField is Data:
  SizingFindingField{name: String, source: Nat, path: List<&2, String>}
type SizingPrimitive is Data:
  SizingOutput{}
  SizingMeasure{}
  SizingRecipient{}
  SizingEvaluationPartition{}
  SizingEvaluationIdentity{}
  SizingSourcePartition{}
  SizingWorkSubject{}
  SizingMultiply{}
  SizingAdd{}
  SizingMaximum{}
  SizingLessEqual{}
  SizingSubtract{}
type SizingLiteral is Data:
  SizingUnitKind{}
  SizingZeroUuid{}
  SizingMaxGeneration{}
  SizingDigestPlaceholder{}
  SizingOne{}
  SizingZero{}
  SizingFalse{}
  SizingProbabilityMargin{}
  SizingOverhead{}
  SizingFrameBytes{}
type SizingOperation is Data:
  SizingFindings{target: Nat}
  SizingRead{target: Nat, source: Nat, path: List<&2, String>}
  SizingRecord{target: Nat, fields: List<&2, SizingField>}
  SizingArray{target: Nat, values: List<&2, Nat>}
  SizingConstant{target: Nat, literal: SizingLiteral}
  SizingCall{target: Nat, primitive: SizingPrimitive, arguments: List<&2, Nat>}
type SizingMode is Data:
  WorstOutcomeSizing{}
  ReservationSizing{}
  DeliverabilitySizing{}
type SizingStep is Data:
  SizingAwait{operation: SizingOperation, remaining: List<&2, SizingOperation>, result: Nat}
  SizingRules{target: Nat, remaining: List<&2, SizingOperation>, result: Nat}
  SizingPresence{
    index: Nat,
    left: Nat,
    target: Nat,
    remaining: List<&2, SizingOperation>,
    result: Nat
  }
  SizingThreshold{
    index: Nat,
    left: Nat,
    target: Nat,
    remaining: List<&2, SizingOperation>,
    result: Nat
  }
  SizingFinding{
    index: Nat,
    left: Nat,
    target: Nat,
    remaining: List<&2, SizingOperation>,
    result: Nat,
    fields: List<&2, SizingFindingField>
  }
  SizingDone{result: Nat}
  SizingRejected{}
type SizingReply is Data:
  SizingAck{}
  SizingLength{length: Nat}
  SizingFlag{value: Bool}

def sizing_worst_recipe() -> List<&2, SizingOperation>:
  [
    SizingFindings{3n},
    SizingCall{4n, SizingOutput{}, [3n]},
    SizingRecord{5n, [SizingField{"findings", 3n}, SizingField{"output", 4n}]},
    SizingCall{6n, SizingMeasure{}, [5n]},
    SizingRead{7n, 3n, ["length"]},
    SizingConstant{8n, SizingProbabilityMargin{}},
    SizingCall{9n, SizingMultiply{}, [7n, 8n]},
    SizingCall{10n, SizingAdd{}, [6n, 9n]}
  ]

def sizing_reservation_recipe() -> List<&2, SizingOperation>:
  [
    SizingFindings{3n},
    SizingRead{4n, 1n, ["advicee"]},
    SizingCall{5n, SizingRecipient{}, [4n]},
    SizingConstant{6n, SizingZeroUuid{}},
    SizingConstant{7n, SizingMaxGeneration{}},
    SizingConstant{8n, SizingDigestPlaceholder{}},
    SizingCall{9n, SizingEvaluationPartition{}, [1n, 6n, 7n, 8n]},
    SizingCall{10n, SizingEvaluationIdentity{}, [9n, 0n]},
    SizingRead{11n, 1n, ["root"]},
    SizingRead{12n, 1n, ["advicee"]},
    SizingCall{13n, SizingSourcePartition{}, [11n, 12n]},
    SizingCall{14n, SizingWorkSubject{}, [13n, 0n]},
    SizingRecord{
      15n,
      [SizingField{"subject", 14n}, SizingField{"token", 6n}, SizingField{"generation", 7n}]
    },
    SizingRead{16n, 15n, ["subject"]},
    SizingRead{17n, 15n, ["token"]},
    SizingRead{18n, 15n, ["generation"]},
    SizingRead{19n, 0n, ["input"]},
    SizingConstant{20n, SizingOne{}},
    SizingRecord{
      21n,
      [
        SizingField{"subject", 16n},
        SizingField{"token", 17n},
        SizingField{"generation", 18n},
        SizingField{"input", 19n},
        SizingField{"members", 20n}
      ]
    },
    SizingConstant{22n, SizingUnitKind{}},
    SizingRecord{
      23n,
      [
        SizingField{"kind", 22n},
        SizingField{"observation", 1n},
        SizingField{"partition", 5n},
        SizingField{"dispatch", 2n},
        SizingField{"prepared", 0n},
        SizingField{"revision", 15n},
        SizingField{"evaluationKey", 10n},
        SizingField{"currentWork", 21n}
      ]
    },
    SizingCall{24n, SizingMeasure{}, [23n]},
    SizingRecord{25n, [SizingField{"prepared", 0n}, SizingField{"findings", 3n}]},
    SizingArray{26n, [25n]},
    SizingCall{27n, SizingOutput{}, [3n]},
    SizingCall{28n, SizingMeasure{}, [27n]},
    SizingRecord{
      29n,
      [
        SizingField{"observation", 1n},
        SizingField{"partition", 5n},
        SizingField{"prepared", 0n},
        SizingField{"revision", 15n},
        SizingField{"evaluationKey", 10n},
        SizingField{"evaluations", 26n},
        SizingField{"findings", 3n},
        SizingField{"encodedBytes", 28n},
        SizingField{"currentWork", 21n}
      ]
    },
    SizingCall{30n, SizingMeasure{}, [29n]},
    SizingRead{31n, 3n, ["length"]},
    SizingConstant{32n, SizingProbabilityMargin{}},
    SizingCall{33n, SizingMultiply{}, [31n, 32n]},
    SizingCall{34n, SizingAdd{}, [30n, 33n]},
    SizingCall{35n, SizingMaximum{}, [24n, 34n]},
    SizingConstant{36n, SizingOverhead{}},
    SizingCall{37n, SizingAdd{}, [35n, 36n]}
  ]

def sizing_next(operations: List<&2, SizingOperation>, result: Nat) -> SizingStep:
  match operations:
    case Nil{}: SizingDone{result}
    case SizingFindings{target} <> rest: SizingRules{target, rest, result}
    case operation <> rest: SizingAwait{operation, rest, result}

def sizing_append(
  first: List<&2, SizingOperation>,
  last: List<&2, SizingOperation>
) -> List<&2, SizingOperation>:
  match first:
    case Nil{}: last
    case head <> tail: head <> sizing_append(tail, last)

def sizing_deliverability_recipe() -> List<&2, SizingOperation>:
  sizing_append(sizing_worst_recipe(), [
    SizingConstant{11n, SizingFrameBytes{}},
    SizingConstant{12n, SizingOverhead{}},
    SizingCall{13n, SizingSubtract{}, [11n, 12n]},
    SizingCall{14n, SizingLessEqual{}, [10n, 13n]}
  ])

def sizing_initial(mode: SizingMode) -> SizingStep:
  match mode:
    case WorstOutcomeSizing{}: sizing_next(sizing_worst_recipe(), 10n)
    case DeliverabilitySizing{}: sizing_next(sizing_deliverability_recipe(), 14n)
    case ReservationSizing{}: sizing_next(sizing_reservation_recipe(), 37n)

def sizing_absent(mode: SizingMode) -> SizingStep:
  match mode:
    case DeliverabilitySizing{}: sizing_next([SizingConstant{0n, SizingFalse{}}], 0n)
    case _: sizing_next([SizingConstant{0n, SizingZero{}}], 0n)

def sizing_initial_ready(mode: SizingMode, ready: Bool) -> SizingStep:
  match ready:
    case True{}: sizing_initial(mode)
    case False{}: sizing_absent(mode)

def sizing_find_next(
  index: Nat,
  left: Nat,
  target: Nat,
  rest: List<&2, SizingOperation>,
  result: Nat
) -> SizingStep:
  match left:
    case 0n: sizing_next(rest, result)
    case 1n++more: SizingPresence{index, more, target, rest, result}

def sizing_finding_fields() -> List<&2, SizingFindingField>:
  [
    SizingFindingField{"path", 0n, ["input", "path"]},
    SizingFindingField{"declaration", 0n, ["input", "declaration", "name"]},
    SizingFindingField{"ruleId", 1n, ["id"]},
    SizingFindingField{"probability", 2n, []},
    SizingFindingField{"message", 1n, ["message"]},
    SizingFindingField{"semanticIdentity", 0n, ["identity"]}
  ]

def sizing_resume(step: SizingStep, reply: SizingReply) -> SizingStep:
  match step reply:
    case SizingAwait{_, rest, result} SizingAck{}: sizing_next(rest, result)
    case SizingRules{target, rest, result} SizingLength{length}: sizing_find_next(
      0n,
      length,
      target,
      rest,
      result
    )
    case SizingPresence{index, left, target, rest, result} SizingFlag{False{}}: sizing_find_next(
      (index + 1n : Nat),
      left,
      target,
      rest,
      result
    )
    case SizingPresence{index, left, target, rest, result} SizingFlag{True{}}: SizingThreshold{
      index,
      left,
      target,
      rest,
      result
    }
    case SizingThreshold{index, left, target, rest, result} SizingFlag{False{}}: sizing_find_next(
      (index + 1n : Nat),
      left,
      target,
      rest,
      result
    )
    case SizingThreshold{index, left, target, rest, result} SizingFlag{True{}}: SizingFinding{
      index,
      left,
      target,
      rest,
      result,
      sizing_finding_fields()
    }
    case SizingFinding{index, left, target, rest, result, _} SizingAck{}: sizing_find_next(
      (index + 1n : Nat),
      left,
      target,
      rest,
      result
    )
    case _ _: SizingRejected{}

# Cached-advice enrollment stays inside the original atomic handoff command.
# Native registers 0/1/2 retain unit/planned/context identity; the recipe owns reads and fields.
type EnrollmentField is Data:
  EnrollmentField{name: String, value: Nat}
type EnrollmentLiteral is Data:
  EnrollmentTrue{}
  EnrollmentFalse{}
  EnrollmentNullValue{}
type EnrollmentCheck is Data:
  EnrollmentNull{}
  EnrollmentNullish{}
  EnrollmentUndefined{}
  EnrollmentTrueCheck{}
type EnrollmentPrimitive is Data:
  EnrollmentUuid{}
  EnrollmentNow{}
  EnrollmentEnvironmentOnly{}
type EnrollmentOperation is Data:
  EnrollmentRead{target: Nat, source: Nat, path: List<&2, String>}
  EnrollmentConstant{target: Nat, literal: EnrollmentLiteral}
  EnrollmentRecord{target: Nat, fields: List<&2, EnrollmentField>}
  EnrollmentArray{target: Nat, values: List<&2, Nat>}
  EnrollmentPut{name: String, value: Nat}
  EnrollmentCall{target: Nat, primitive: EnrollmentPrimitive, arguments: List<&2, Nat>}
  EnrollmentChoose{
    source: Nat,
    check: EnrollmentCheck,
    when_true: List<&2, EnrollmentOperation>,
    when_false: List<&2, EnrollmentOperation>
  }
type EnrollmentStep is Data:
  EnrollmentAwait{operation: EnrollmentOperation, remaining: List<&2, EnrollmentOperation>}
  EnrollmentInspect{
    source: Nat,
    check: EnrollmentCheck,
    when_true: List<&2, EnrollmentOperation>,
    when_false: List<&2, EnrollmentOperation>,
    remaining: List<&2, EnrollmentOperation>
  }
  EnrollmentDone{evaluation: Nat}
  EnrollmentRejected{}
type EnrollmentReply is Data:
  EnrollmentAck{}
  EnrollmentFlag{value: Bool}

def enrollment_recipe() -> List<&2, EnrollmentOperation>:
  [
    EnrollmentRead{10n, 0n, ["dispatch", "credential"]},
    EnrollmentRead{11n, 0n, ["dispatch", "controlled"]},
    EnrollmentChoose{
      11n,
      EnrollmentNull{},
      [EnrollmentConstant{20n, EnrollmentTrue{}}],
      [
        EnrollmentRead{12n, 0n, ["dispatch", "controlled", "requireCredential"]},
        EnrollmentChoose{
          12n,
          EnrollmentTrueCheck{},
          [EnrollmentConstant{20n, EnrollmentTrue{}}],
          [EnrollmentConstant{20n, EnrollmentFalse{}}]
        }
      ]
    },
    EnrollmentRead{31n, 0n, ["prepared"]},
    EnrollmentRead{32n, 1n, ["cached", "evaluation", "findings"]},
    EnrollmentRecord{30n, [EnrollmentField{"prepared", 31n}, EnrollmentField{"findings", 32n}]},
    EnrollmentRead{40n, 0n, ["dispatch", "activityPath"]},
    EnrollmentPut{"analyticsPath", 40n},
    EnrollmentRead{41n, 0n, ["analyticsEnabled"]},
    EnrollmentChoose{
      41n,
      EnrollmentNullish{},
      [
        EnrollmentRead{42n, 0n, ["dispatch", "sessionAnalytics"]},
        EnrollmentChoose{
          42n,
          EnrollmentTrueCheck{},
          [EnrollmentConstant{41n, EnrollmentTrue{}}],
          [EnrollmentConstant{41n, EnrollmentFalse{}}]
        }
      ],
      []
    },
    EnrollmentPut{"analyticsEnabled", 41n},
    EnrollmentRead{43n, 0n, ["dispatch", "controlled"]},
    EnrollmentChoose{
      43n,
      EnrollmentNull{},
      [EnrollmentConstant{43n, EnrollmentFalse{}}],
      [EnrollmentConstant{43n, EnrollmentTrue{}}]
    },
    EnrollmentPut{"analyticsControlled", 43n},
    EnrollmentCall{44n, EnrollmentUuid{}, []},
    EnrollmentPut{"id", 44n},
    EnrollmentRead{45n, 0n, ["round"]},
    EnrollmentChoose{
      45n,
      EnrollmentUndefined{},
      [],
      [EnrollmentRead{46n, 0n, ["round"]}, EnrollmentPut{"round", 46n}]
    },
    EnrollmentRead{47n, 0n, ["workUnitId"]},
    EnrollmentChoose{
      47n,
      EnrollmentUndefined{},
      [],
      [EnrollmentRead{48n, 0n, ["workUnitId"]}, EnrollmentPut{"workUnitId", 48n}]
    },
    EnrollmentRead{49n, 0n, ["admissionId"]},
    EnrollmentPut{"admissionId", 49n},
    EnrollmentRead{50n, 0n, ["canonicalOperationId"]},
    EnrollmentPut{"canonicalOperationId", 50n},
    EnrollmentRead{51n, 0n, ["canonicalRound"]},
    EnrollmentPut{"canonicalRound", 51n},
    EnrollmentRead{52n, 0n, ["observation"]},
    EnrollmentPut{"observation", 52n},
    EnrollmentRead{53n, 0n, ["settings"]},
    EnrollmentPut{"settings", 53n},
    EnrollmentRead{54n, 0n, ["partition"]},
    EnrollmentPut{"partition", 54n},
    EnrollmentRead{55n, 0n, ["reservation"]},
    EnrollmentPut{"reservation", 55n},
    EnrollmentRead{56n, 0n, ["prepared"]},
    EnrollmentPut{"prepared", 56n},
    EnrollmentRead{57n, 0n, ["sourceHash"]},
    EnrollmentChoose{
      57n,
      EnrollmentUndefined{},
      [],
      [EnrollmentRead{58n, 0n, ["sourceHash"]}, EnrollmentPut{"sourceHash", 58n}]
    },
    EnrollmentRead{59n, 0n, ["revision"]},
    EnrollmentPut{"revision", 59n},
    EnrollmentRead{60n, 0n, ["evaluationKey"]},
    EnrollmentPut{"evaluationKey", 60n},
    EnrollmentArray{61n, [30n]},
    EnrollmentPut{"evaluations", 61n},
    EnrollmentRead{62n, 30n, ["findings"]},
    EnrollmentPut{"findings", 62n},
    EnrollmentRead{63n, 2n, ["sequence"]},
    EnrollmentPut{"sequence", 63n},
    EnrollmentChoose{
      10n,
      EnrollmentNullish{},
      [EnrollmentConstant{64n, EnrollmentNullValue{}}],
      [
        EnrollmentRead{64n, 10n, ["generation"]},
        EnrollmentChoose{
          64n,
          EnrollmentNullish{},
          [EnrollmentConstant{64n, EnrollmentNullValue{}}],
          []
        }
      ]
    },
    EnrollmentPut{"credentialGeneration", 64n},
    EnrollmentChoose{
      10n,
      EnrollmentNullish{},
      [EnrollmentConstant{65n, EnrollmentNullValue{}}],
      [
        EnrollmentRead{65n, 10n, ["statePath"]},
        EnrollmentChoose{
          65n,
          EnrollmentNullish{},
          [EnrollmentConstant{65n, EnrollmentNullValue{}}],
          []
        }
      ]
    },
    EnrollmentPut{"credentialStatePath", 65n},
    EnrollmentPut{"credentialRequired", 20n},
    EnrollmentChoose{
      10n,
      EnrollmentNull{},
      [EnrollmentConstant{66n, EnrollmentFalse{}}],
      [
        EnrollmentRead{67n, 0n, ["settings"]},
        EnrollmentCall{66n, EnrollmentEnvironmentOnly{}, [67n]}
      ]
    },
    EnrollmentPut{"credentialEnvironmentOnly", 66n},
    EnrollmentCall{68n, EnrollmentNow{}, []},
    EnrollmentPut{"pendingAt", 68n}
  ]

def enrollment_append(
  first: List<&2, EnrollmentOperation>,
  last: List<&2, EnrollmentOperation>
) -> List<&2, EnrollmentOperation>:
  match first:
    case Nil{}: last
    case head <> tail: head <> enrollment_append(tail, last)

def enrollment_next(operations: List<&2, EnrollmentOperation>) -> EnrollmentStep:
  match operations:
    case Nil{}: EnrollmentDone{30n}
    case EnrollmentChoose{source, check, yes, no} <> rest: EnrollmentInspect{
      source,
      check,
      yes,
      no,
      rest
    }
    case operation <> rest: EnrollmentAwait{operation, rest}

def enrollment_initial() -> EnrollmentStep:
  enrollment_next(enrollment_recipe())

def enrollment_resume(step: EnrollmentStep, reply: EnrollmentReply) -> EnrollmentStep:
  match step reply:
    case EnrollmentAwait{_, rest} EnrollmentAck{}: enrollment_next(rest)
    case EnrollmentInspect{_, _, yes, _, rest} EnrollmentFlag{True{}}: enrollment_next(
      enrollment_append(yes, rest)
    )
    case EnrollmentInspect{_, _, _, no, rest} EnrollmentFlag{False{}}: enrollment_next(
      enrollment_append(no, rest)
    )
    case _ _: EnrollmentRejected{}

# Whole post-preparation control protocol. Source-bearing values stay behind handles.
# Every response is a result of an existing semantic owner or an external effect.
# Canonical-owned composition candidate; whole correspondence and acceptance remain open.
type Outcome is Data:
  Outcome{handle: Nat, ready: Bool, fits: Bool, reservation_bytes: Nat}
type Route is Data:
  Owner{}
  CachedEntry{}
  CachedClear{}
  CachedFinding{evaluation: Nat}
  JoinedAdvice{}
  JoinedPending{}
  JoinedClaimed{}
type Planned is Data:
  Planned{outcome: Outcome, key: Nat, route: Route}
type Allocation is Data:
  Allocation{operation: Nat, reservation: Nat}
type Slot is Data:
  Slot{item: Planned, operation: Nat, reservation: Nat}
type ReuseActivity is Data:
  ClearActivity{}
  FindingsActivity{findings: Nat}
  UnavailableActivity{}
type ReuseStage is Data:
  ClearRegistered{}
  ClearReleased{revision: Nat}
  ActivityRecorded{}
  AdviceRead{}
  AdvicePublished{advice: Nat}
  JoinedRecorded{advice: Nat}
  AdviceCurrent{}
  JoinedPendingRead{}
  JoinedAppended{}
  ExpectedRemembered{}
type CachedStage is Data:
  CachedStarted{}
  CachedCompleted{}
  CachedActivity{}
  CachedActive{}
  CachedExisting{}
  CachedPublished{advice: Nat}
  CachedRecorded{}
  CachedRetired{}
  CachedReleased{}
  CachedInserted{}
  CachedInspected{tail: Nat}
  CachedPreserving{reason: Termination}
  CachedFailureFinalized{reason: Termination}
  CachedTailAwaited{}
  CachedFinalized{}

type AdviceRetirement is Data:
  ExpiredRetirement{}
  RetentionFailureRetirement{}

def advice_retirement(expired: Bool) -> AdviceRetirement:
  Bool.pick(AdviceRetirement, expired, ExpiredRetirement{}, RetentionFailureRetirement{})

# Cleanup is selected here; native maps remain the resource authority.
type CleanupAction is Data:
  DrainCleanupTail{handle: Nat}
  RetireCleanupWork{handle: Nat}
  ReleaseCleanupReservation{handle: Nat}
  ReleaseCleanupRevision{handle: Nat}
  ReleaseCleanupClaim{handle: Nat}
  ReleaseCleanupWorkspace{}
  InvalidCleanupAllocation{}
  InvalidCleanupReservation{}
  InvalidCleanupPlan{}
type CleanupFact is Data:
  CleanupTail{handle: Nat, started: Bool}
  CleanupWork{handle: Nat, cached: Bool, completed: Bool, round_bound: Bool, work_bound: Bool}
  CleanupReservation{handle: Nat, present: Bool, transferred: Bool, discharged: Bool}
  CleanupRevision{handle: Nat, present: Bool, transferred: Bool}
  CleanupClaim{handle: Nat, present: Bool, transferred: Bool}
  CleanupWorkspace{source_owned: Bool, active: Bool}
  CleanupInvalidAllocation{}
  CleanupInvalidPlan{}
type CleanupMode is Data:
  RetryCleanup{}
  CollectCleanup{}
type CleanupCursor is Data:
  CleanupDone{}
  CleanupAwait{mode: CleanupMode, action: CleanupAction, remaining: List<&2, CleanupAction>}

type CleanupStage is Data:
  CleanupTails{}
  CleanupWorks{}
  CleanupReservations{}
  CleanupRevisions{}
  CleanupClaims{}
  CleanupWorkspaceStage{}
type CleanupFinish is Data:
  CleanupFinishRead{stage: CleanupStage}
  CleanupFinishRun{stage: CleanupStage, cursor: CleanupCursor}
  CleanupFinishDone{}
  CleanupFinishRejected{}

# These sequences remain inside the original Canonical request/lease. Native
# queries are lazy, preserving each variant's read/effect/receipt ordering.
type ReleaseKind is Data:
  UnspawnedRelease{}
  AttachedRelease{}
  CachedRelease{}
  FinalizedRelease{}
type ReleaseOperation is Data:
  ReleaseReadTransfer{}
  ReleaseReadOwner{}
  ReleaseBuildUnit{}
  ReleaseReadPlanClaim{}
  ReleaseReadUnitClaim{}
  ReleasePlanClaim{}
  ReleaseCapacityClaim{}
  ReleaseForgetPlanClaim{}
  ReleaseForgetUnitClaim{}
  ReleaseSlotReservation{}
  ReleaseUnitReservation{}
  ReleaseForgetReservation{}
  ReleaseAcquisition{}
  ReleaseCurrentWork{}
  ReleaseForgetAcquisition{}
  ReleaseMarkUnit{}
  ReleaseReadWorkBound{}
  ReleaseReadCompleted{work_bound: Bool}
  ReleaseReadRound{work_bound: Bool}
  ReleaseRetireWork{}
  ReleaseReadReleased{}
type ReleaseResponse is Data:
  ReleaseAck{}
  ReleaseFlag{value: Bool}
type ReleaseStep is Data:
  ReleaseAwait{kind: ReleaseKind, operation: ReleaseOperation}
  ReleaseDone{}
  ReleaseRejected{}

type SelectionKind is Data:
  AdviceMembership{}
  AdviceSelection{}
  ObservedSelection{}
  CachedPlanMembership{}
type SelectionStage is Data:
  SelectionPresence{}
  SelectionStatus{}
  SelectionEquality{}
  SelectionRoute{}
type SelectionStep is Data:
  SelectionRead{kind: SelectionKind, index: Nat, remaining: Nat, stage: SelectionStage}
  SelectionFound{index: Nat}
  SelectionMissing{}
  SelectionRejected{}
type SelectionResponse is Data:
  SelectionFlag{value: Bool}
  SelectionPlanRoute{route: Route}
type NativePlanAction is Data:
  StoreNativePlan{}
  TrackNativeClaim{}
type ReuseObservation is Data:
  CachedReuseObservation{}
  JoinedReuseObservation{}
  InvalidReuseObservation{}
type WorkChoice is Data:
  NoPlannedWork{}
  SpawnPlannedWork{}
  CachedPlannedWork{}
type InspectionRoute is Data:
  FreshInspection{}
  CachedInspection{}
  AdviceInspection{}
  PendingInspection{}
  ClaimedInspection{}
type PlanObservationStage is Data:
  PlanReadReceipt{}
  PlanForgotOrigin{receipt: Bool}
  PlanEnabled{}
  PlanRegistered{}
  PlanEvaluationRead{}
  PlanOffered{}
type PlanObservationOperation is Data:
  ReadPlanReceipt{}
  ForgetPlanOrigin{}
  CheckPlanInspection{}
  RegisterPlanOrigin{}
  ReadPlanEvaluation{}
  OfferMissingPlan{route: InspectionRoute}
  OfferLinkedPlan{route: InspectionRoute}
type PlanObservationStep is Data:
  PlanObservationAwait{
    route: Route,
    stage: PlanObservationStage,
    operation: PlanObservationOperation
  }
  PlanObservationDone{}
  PlanObservationRejected{}
type PlanObservationResponse is Data:
  PlanObservationAck{}
  PlanObservationFlag{value: Bool}

# Synchronous native inspection effects share the existing Post command lease.
type RetainedObservationOperation is Data:
  RetainedReadReceipt{}
  RetainedCheckEnabled{}
  RetainedPrepareBase{}
  RetainedReadEvaluation{}
  RetainedAttachEvaluation{}
  RetainedOffer{}
  RetainedComplete{}
type RetainedObservationStep is Data:
  RetainedObservationAwait{operation: RetainedObservationOperation}
  RetainedObservationDone{}
  RetainedObservationRejected{}
type RetainedObservationResponse is Data:
  RetainedObservationAck{}
  RetainedObservationFlag{value: Bool}

type Command is Data:
  ObservePreparation{}
  AdvicePendingBarrier{advice: Nat}
  AdviceCheckActive{advice: Nat}
  AdvicePublish{advice: Nat}
  AdviceRecordPublished{advice: Nat, publication: Nat}
  AdviceCheckExpired{advice: Nat}
  AdviceRemove{advice: Nat, retirement: AdviceRetirement}
  CheckActive{}
  ReleaseWorkspace{}
  Offer{outcome: Outcome, allowed: Bool}
  ReportDeliverabilityCapacity{}
  ReportDeliverabilityNotice{}
  ReportEmptyAnalytics{incomplete: Bool}
  ReportEmptyActivity{incomplete: Bool}
  ObserveReady{ready: List<&2, Outcome>}
  LookupReuse{outcome: Outcome}
  ReadCached{item: Planned}
  ReadPending{item: Planned}
  RestorePending{item: Planned, owner: Nat}
  ObservePlans{planned: List<&2, Planned>}
  RecordReuseAnalytics{item: Planned}
  OwnerBarrier{}
  CompletePreparation{retained: List<&2, Planned>}
  RegisterClear{item: Planned}
  ReleaseClear{revision: Nat}
  ReadLiveAdvice{item: Planned}
  PublishJoinedAdvice{advice: Nat}
  RecordJoinedOutcomes{advice: Nat, publication: Nat}
  ReadCurrentAdvice{advice: Nat}
  ReadJoinedPending{item: Planned}
  AppendJoined{item: Planned, owner: Maybe<&2, Nat>}
  RememberExpected{item: Planned}
  RecordReuseActivity{item: Planned, activity: ReuseActivity}
  JoinedBarrier{}
  RegisterRevision{slot: Slot}
  RegisterWork{slot: Slot, revision: Nat}
  ObserveUnit{slot: Slot, revision: Nat, work: Maybe<&2, Nat>}
  AttachOwner{slot: Slot, revision: Nat, work: Maybe<&2, Nat>}
  Enqueue{slot: Slot, revision: Nat, work: Maybe<&2, Nat>}
  StartCachedReview{slot: Slot}
  CompleteCachedReview{slot: Slot}
  RecordCachedActivity{slot: Slot}
  CheckCachedActive{slot: Slot, revision: Nat, work: Maybe<&2, Nat>}
  ReadCachedAdvice{slot: Slot}
  RetireCachedWork{slot: Slot, revision: Nat, work: Maybe<&2, Nat>}
  ReleaseCachedUnit{slot: Slot, revision: Nat, work: Maybe<&2, Nat>}
  InsertCachedAdvice{slot: Slot, revision: Nat, work: Maybe<&2, Nat>}
  ObserveRetainedAdvice{tail: Nat}
  PreserveAdviceTail{tail: Nat}
  AwaitAdviceTail{tail: Nat}
  FinalizeCachedUnit{slot: Slot, revision: Nat, work: Maybe<&2, Nat>}
  ReleaseAttached{slot: Slot, revision: Nat, work: Maybe<&2, Nat>}
  ReleaseUnspawned{slot: Slot, revision: Nat}
  ReportCapacity{item: Planned}
  Cleanup{actions: List<&2, CleanupAction>}
  PerformCleanup{action: CleanupAction}
type Response is Data:
  Ack{}
  CleanupInventory{facts: List<&2, CleanupFact>}
  Active{value: Bool}
  Expired{value: Bool}
  Offered{accepted: Bool}
  Routed{key: Nat, route: Route}
  CachedFacts{evaluation: Nat, findings: Nat}
  PendingOwner{owner: Nat}
  AdviceOwner{owner: Maybe<&2, Nat>}
  Published{publication: Nat}
  FindingCount{findings: Nat}
  JoinOwner{owner: Maybe<&2, Nat>}
  Reserved{allocations: List<&2, Maybe<&2, Allocation>>}
  Revision{token: Nat}
  Work{token: Maybe<&2, Nat>}
  Attached{accepted: Bool}
  Queued{accepted: Bool}
  ReviewAccepted{value: Bool}
  AdviceInserted{tail: Nat}
  Cancelled{token: Nat}
  Failed{token: Nat}
  Defect{token: Nat}
type Phase is Data:
  PreparedObserved{outcomes: List<&2, Outcome>}
  Begin{outcomes: List<&2, Outcome>}
  InactiveWorkspace{planned: List<&2, Planned>}
  Admit{rest: List<&2, Outcome>, ready: List<&2, Outcome>}
  Admitting{outcome: Outcome, rest: List<&2, Outcome>, ready: List<&2, Outcome>}
  EmptyAnalytics{}
  EmptyActivity{}
  ReadyObserved{ready: List<&2, Outcome>}
  Deliver{rest: List<&2, Outcome>, accepted: List<&2, Outcome>}
  Delivering{outcome: Outcome, rest: List<&2, Outcome>, accepted: List<&2, Outcome>}
  DeliverabilityRefused{rest: List<&2, Outcome>, accepted: List<&2, Outcome>}
  DeliverabilityNoticed{continuation: Phase}
  Routes{rest: List<&2, Outcome>, planned: List<&2, Planned>}
  Routing{outcome: Outcome, rest: List<&2, Outcome>, planned: List<&2, Planned>}
  CachedRead{item: Planned, rest: List<&2, Outcome>, planned: List<&2, Planned>}
  PendingRead{item: Planned, rest: List<&2, Outcome>, planned: List<&2, Planned>}
  PendingRestored{item: Planned, rest: List<&2, Outcome>, planned: List<&2, Planned>}
  PlansObserved{planned: List<&2, Planned>}
  PlansAnalytics{planned: List<&2, Planned>, remaining: List<&2, Planned>}
  OwnerChecked{planned: List<&2, Planned>}
  LiveChecked{planned: List<&2, Planned>}
  ReservedUnits{planned: List<&2, Planned>, retained: List<&2, Planned>}
  ReuseNext{remaining: List<&2, Planned>, continuation: Phase}
  ReuseAwait{item: Planned, stage: ReuseStage, continuation: Phase}
  ReuseObserved{
    planned: List<&2, Planned>,
    retained: List<&2, Planned>,
    slots: List<&2, Maybe<&2, Slot>>
  }
  JoinedChecked{
    planned: List<&2, Planned>,
    retained: List<&2, Planned>,
    slots: List<&2, Maybe<&2, Slot>>
  }
  NextUnit{
    planned: List<&2, Planned>,
    retained: List<&2, Planned>,
    slots: List<&2, Maybe<&2, Slot>>
  }
  UnitChecked{
    planned: List<&2, Planned>,
    retained: List<&2, Planned>,
    slots: List<&2, Maybe<&2, Slot>>
  }
  RevisionRegistered{slot: Slot, continuation: Phase}
  WorkRegistered{slot: Slot, revision: Nat, continuation: Phase}
  UnitObserved{slot: Slot, revision: Nat, work: Maybe<&2, Nat>, continuation: Phase}
  OwnerAttached{slot: Slot, revision: Nat, work: Maybe<&2, Nat>, continuation: Phase}
  UnitEnqueued{slot: Slot, revision: Nat, work: Maybe<&2, Nat>, continuation: Phase}
  CachedSettled{
    slot: Slot,
    revision: Nat,
    work: Maybe<&2, Nat>,
    stage: CachedStage,
    continuation: Phase
  }
  EnqueueReleased{item: Planned, continuation: Phase}
  Released{continuation: Phase}
  CapacityReported{continuation: Phase}
  Cleaned{
    slots: List<&2, Slot>,
    planned: List<&2, Planned>,
    revision: Maybe<&2, Nat>,
    reason: Termination
  }
  Cleaning{cursor: CleanupCursor, reason: Termination}
type Termination is Data:
  Inactive{}
  CancelledReason{token: Nat}
  TechnicalFailure{token: Nat}
  DefectFailure{token: Nat}
type State is Data:
  State{
    invocation: Nat,
    next: Nat,
    round_bound: Bool,
    incomplete: Bool,
    delivery_refused: Bool,
    phase: Phase
  }
type Request is Data:
  Request{invocation: Nat, id: Nat, command: Command}
type Reply is Data:
  Reply{invocation: Nat, id: Nat, response: Response}
type Step is Data:
  Internal{state: State}
  Await{state: State, request: Request}
  Finished{}
  Stopped{reason: Termination}
  Rejected{}

# The independently owned tail begins only after a committed advice insert.
# Source/round cutoff does not govern this continuation. The binding must fence
# each mutation to the exact advice capability and a closed tail operation.
type AdviceTailPhase is Data:
  AdviceBarrier{}
  AdviceActive{}
  AdviceTailPublishing{}
  AdviceRecorded{publication: Nat}
  AdviceExpiry{reason: Termination}
  AdviceRemoving{reason: Termination, retirement: AdviceRetirement}
  AdviceRemovalRetry{reason: Termination, retirement: AdviceRetirement}
type AdviceTailState is Data:
  AdviceTailState{invocation: Nat, advice: Nat, next: Nat, phase: AdviceTailPhase}
type AdviceTailStep is Data:
  AdviceAwait{state: AdviceTailState, request: Request}
  AdvicePreserved{}
  AdviceFinished{}
  AdviceStopped{reason: Termination}
  AdviceRejected{}
  AdviceCleanupPending{advice: Nat, reason: Termination}

def advice_await(
  state: AdviceTailState,
  phase: AdviceTailPhase,
  command: Command
) -> AdviceTailStep:
  match state:
    case AdviceTailState{+invocation, advice, +next, _}:
      AdviceAwait{
        AdviceTailState{invocation, advice, Nat.add(next, 1n), phase},
        Request{invocation, next, command}
      }

def advice_initial(+invocation: Nat, +advice: Nat) -> AdviceTailStep:
  advice_await(
    AdviceTailState{invocation, advice, 0n, AdviceBarrier{}},
    AdviceBarrier{},
    AdvicePendingBarrier{advice}
  )

def advice_remove(+state: AdviceTailState, reason: Termination) -> AdviceTailStep:
  match state:
    case AdviceTailState{_, advice, _, _}: advice_await(
      state,
      AdviceExpiry{reason},
      AdviceCheckExpired{advice}
    )

def advice_initial_preserved() -> AdviceTailStep:
  AdvicePreserved{}

def advice_initial_cleanup(invocation: Nat, advice: Nat, reason: Termination) -> AdviceTailStep:
  advice_remove(AdviceTailState{invocation, advice, 0n, AdviceBarrier{}}, reason)

def advice_response(+state: AdviceTailState, response: Response) -> AdviceTailStep:
  match state response:
    case AdviceTailState{_, advice, _, AdviceBarrier{}} Ack{}:
      advice_await(state, AdviceActive{}, AdviceCheckActive{advice})
    case AdviceTailState{_, _, _, AdviceActive{}} Active{False{}}: AdviceFinished{}
    case AdviceTailState{_, advice, _, AdviceActive{}} Active{True{}}:
      advice_await(state, AdviceTailPublishing{}, AdvicePublish{advice})
    case AdviceTailState{_, advice, _, AdviceTailPublishing{}} Published{+publication}:
      advice_await(state, AdviceRecorded{publication}, AdviceRecordPublished{advice, publication})
    case AdviceTailState{_, _, _, AdviceRecorded{_}} Ack{}: AdviceFinished{}
    case AdviceTailState{_, +advice, _, AdviceExpiry{+reason}} Expired{+expired}:
      advice_await(
        state,
        AdviceRemoving{reason, advice_retirement(expired)},
        AdviceRemove{advice, advice_retirement(expired)}
      )
    case AdviceTailState{_, advice, _, AdviceExpiry{reason}} _: AdviceCleanupPending{advice, reason}
    case AdviceTailState{_, _, _, AdviceRemoving{reason, _}} Ack{}: AdviceStopped{reason}
    case AdviceTailState{_, +advice, _, AdviceRemoving{+reason, +retirement}} _: advice_await(
      state,
      AdviceRemovalRetry{reason, retirement},
      AdviceRemove{advice, retirement}
    )
    case AdviceTailState{_, _, _, AdviceRemovalRetry{reason, _}} Ack{}: AdviceStopped{reason}
    case AdviceTailState{_, advice, _, AdviceRemovalRetry{reason, _}} _: AdviceCleanupPending{
      advice,
      reason
    }
    case _ Defect{token}: advice_remove(state, DefectFailure{token})
    case _ Failed{token}: advice_remove(state, TechnicalFailure{token})
    case _ Cancelled{token}: advice_remove(state, CancelledReason{token})
    case _ _: AdviceRejected{}

def advice_correlated(ok: Bool, state: AdviceTailState, response: Response) -> AdviceTailStep:
  match ok:
    case True{}: advice_response(state, response)
    case False{}: AdviceRejected{}

def advice_resume(step: AdviceTailStep, reply: Reply) -> AdviceTailStep:
  match step reply:
    case AdviceAwait{state, Request{invocation, id, _}} Reply{other, other_id, response}:
      advice_correlated(
        Bool.and(Nat.is_eq(invocation, other), Nat.is_eq(id, other_id)),
        state,
        response
      )
    case _ _: AdviceRejected{}

def reverse(values: List<&2, Outcome>, accumulator: List<&2, Outcome>) -> List<&2, Outcome>:
  match values:
    case Nil{}: accumulator
    case head <> rest: reverse(rest, head <> accumulator)

def reverse_plans(values: List<&2, Planned>, accumulator: List<&2, Planned>) -> List<&2, Planned>:
  match values:
    case Nil{}: accumulator
    case head <> rest: reverse_plans(rest, head <> accumulator)

def keep(route: Route) -> Bool:
  match route:
    case Owner{}: True{}
    case CachedFinding{_}: True{}
    case _: False{}

def retained_item(+item: Planned, +rest: List<&2, Planned>) -> List<&2, Planned>:
  match item:
    case Planned{_, _, route}: Bool.pick(List<&2, Planned>, keep(route), item <> rest, rest)

def retained(items: List<&2, Planned>) -> List<&2, Planned>:
  match items:
    case Nil{}: Nil{}
    case +item <> rest: retained_item(item, retained(rest))

def outcome_fits(outcome: Outcome) -> Bool:
  match outcome:
    case Outcome{_, _, fits, _}: fits

def outcome_ready(outcome: Outcome) -> Bool:
  match outcome:
    case Outcome{_, ready, _, _}: ready

def any_owner(items: List<&2, Planned>) -> Bool:
  match items:
    case Nil{}: False{}
    case Planned{_, _, Owner{}} <> _: True{}
    case _ <> rest: any_owner(rest)

def any_claimed(items: List<&2, Planned>) -> Bool:
  match items:
    case Nil{}: False{}
    case Planned{_, _, JoinedClaimed{}} <> _: True{}
    case _ <> rest: any_claimed(rest)

def installed(slots: List<&2, Maybe<&2, Slot>>) -> List<&2, Slot>:
  match slots:
    case Nil{}: Nil{}
    case None{} <> rest: installed(rest)
    case Some{slot} <> rest: slot <> installed(rest)

def held_slots(phase: Phase) -> List<&2, Slot>:
  match phase:
    case DeliverabilityNoticed{continuation}: held_slots(continuation)
    case ReuseNext{_, continuation}: held_slots(continuation)
    case ReuseAwait{_, _, continuation}: held_slots(continuation)
    case ReuseObserved{_, _, slots}: installed(slots)
    case JoinedChecked{_, _, slots}: installed(slots)
    case NextUnit{_, _, slots}: installed(slots)
    case UnitChecked{_, _, slots}: installed(slots)
    case RevisionRegistered{slot, continuation}: slot <> held_slots(continuation)
    case WorkRegistered{slot, _, continuation}: slot <> held_slots(continuation)
    case UnitObserved{slot, _, _, continuation}: slot <> held_slots(continuation)
    case OwnerAttached{slot, _, _, continuation}: slot <> held_slots(continuation)
    case UnitEnqueued{slot, _, _, continuation}: slot <> held_slots(continuation)
    case CachedSettled{slot, _, _, _, continuation}: slot <> held_slots(continuation)
    case EnqueueReleased{_, continuation}: held_slots(continuation)
    case Released{continuation}: held_slots(continuation)
    case CapacityReported{continuation}: held_slots(continuation)
    case Cleaned{slots, _, _, _}: slots
    case _: Nil{}

def held_plans(phase: Phase) -> List<&2, Planned>:
  match phase:
    case Routes{_, planned}: planned
    case Routing{_, _, planned}: planned
    case CachedRead{_, _, planned}: planned
    case PendingRead{_, _, planned}: planned
    case PendingRestored{_, _, planned}: planned
    case PlansObserved{planned}: planned
    case PlansAnalytics{planned, _}: planned
    case OwnerChecked{planned}: planned
    case LiveChecked{planned}: planned
    case InactiveWorkspace{planned}: planned
    case ReservedUnits{planned, _}: planned
    case DeliverabilityNoticed{continuation}: held_plans(continuation)
    case ReuseNext{_, continuation}: held_plans(continuation)
    case ReuseAwait{_, _, continuation}: held_plans(continuation)
    case ReuseObserved{planned, _, _}: planned
    case JoinedChecked{planned, _, _}: planned
    case NextUnit{planned, _, _}: planned
    case UnitChecked{planned, _, _}: planned
    case RevisionRegistered{_, continuation}: held_plans(continuation)
    case WorkRegistered{_, _, continuation}: held_plans(continuation)
    case UnitObserved{_, _, _, continuation}: held_plans(continuation)
    case OwnerAttached{_, _, _, continuation}: held_plans(continuation)
    case UnitEnqueued{_, _, _, continuation}: held_plans(continuation)
    case CachedSettled{_, _, _, _, continuation}: held_plans(continuation)
    case EnqueueReleased{_, continuation}: held_plans(continuation)
    case Released{continuation}: held_plans(continuation)
    case CapacityReported{continuation}: held_plans(continuation)
    case Cleaned{_, planned, _, _}: planned
    case _: Nil{}

def held_revision(phase: Phase) -> Maybe<&2, Nat>:
  match phase:
    case ReuseAwait{_, ClearReleased{revision}, _}: Some{revision}
    case WorkRegistered{_, revision, _}: Some{revision}
    case UnitObserved{_, revision, _, _}: Some{revision}
    case OwnerAttached{_, revision, _, _}: Some{revision}
    case UnitEnqueued{_, revision, _, _}: Some{revision}
    case CachedSettled{_, revision, _, _, _}: Some{revision}
    case Cleaned{_, _, revision, _}: revision
    case _: None{}

def same_key(key: Nat, item: Planned) -> Bool:
  match item:
    case Planned{_, other, _}: Nat.is_eq(key, other)

def remove_plan(+key: Nat, items: List<&2, Planned>) -> List<&2, Planned>:
  match items:
    case Nil{}: Nil{}
    case +item <> rest:
      +remaining = remove_plan(key, rest)
      Bool.pick(List<&2, Planned>, same_key(key, item), remaining, item <> remaining)

def detached(continuation: Phase, slot: Slot) -> Phase:
  match continuation slot:
    case NextUnit{planned, items, slots} Slot{Planned{_, key, _}, _, _}: NextUnit{
      remove_plan(key, planned),
      items,
      slots
    }
    case +other _: other

def slot_item(slot: Slot) -> Planned:
  match slot:
    case Slot{item, _, _}: item

def moved(state: State, phase: Phase) -> State:
  match state:
    case State{invocation, next, bound, incomplete, refused, _}: State{
      invocation,
      next,
      bound,
      incomplete,
      refused,
      phase
    }

def inside(state: State, phase: Phase) -> Step:
  Internal{moved(state, phase)}

def await_command(state: State, phase: Phase, command: Command) -> Step:
  match state:
    case State{+invocation, +next, bound, incomplete, refused, _}:
      Await{
        State{invocation, Nat.add(next, 1n), bound, incomplete, refused, phase},
        Request{invocation, next, command}
      }

def route_cached(route: Route) -> Bool:
  match route:
    case CachedEntry{}: True{}
    case CachedClear{}: True{}
    case CachedFinding{_}: True{}
    case _: False{}

def route_owner(route: Route) -> Bool:
  match route:
    case Owner{}: True{}
    case _: False{}

def native_plan_actions(route: Route) -> List<&2, NativePlanAction>:
  match route:
    case Owner{}: [StoreNativePlan{}, TrackNativeClaim{}]
    case _: [StoreNativePlan{}]

def reuse_observation(route: Route) -> ReuseObservation:
  match route:
    case Owner{}: InvalidReuseObservation{}
    case CachedEntry{}: CachedReuseObservation{}
    case CachedClear{}: CachedReuseObservation{}
    case CachedFinding{_}: CachedReuseObservation{}
    case _: JoinedReuseObservation{}

def planned_work_choice(route: Route, available: Bool) -> WorkChoice:
  match available:
    case False{}: NoPlannedWork{}
    case True{}: Bool.pick(WorkChoice, route_cached(route), CachedPlannedWork{}, SpawnPlannedWork{})

def planned_work(route: Route, policy: Bool, observation: Bool) -> WorkChoice:
  planned_work_choice(route, policy && observation)

def inspection_route(route: Route) -> InspectionRoute:
  match route:
    case Owner{}: FreshInspection{}
    case CachedEntry{}: CachedInspection{}
    case CachedClear{}: CachedInspection{}
    case CachedFinding{_}: CachedInspection{}
    case JoinedAdvice{}: AdviceInspection{}
    case JoinedPending{}: PendingInspection{}
    case JoinedClaimed{}: ClaimedInspection{}

def selection_stage(kind: SelectionKind) -> SelectionStage:
  match kind:
    case AdviceMembership{}: SelectionPresence{}
    case CachedPlanMembership{}: SelectionPresence{}
    case ObservedSelection{}: SelectionStatus{}
    case AdviceSelection{}: SelectionEquality{}

def selection_next(+kind: SelectionKind, index: Nat, remaining: Nat) -> SelectionStep:
  match remaining:
    case 0n: SelectionMissing{}
    case 1n+rest: SelectionRead{kind, index, rest, selection_stage(kind)}

def selection_initial(kind: SelectionKind, length: Nat) -> SelectionStep:
  selection_next(kind, 0n, length)

def selection_route_match(
  yes: Bool,
  kind: SelectionKind,
  +index: Nat,
  remaining: Nat
) -> SelectionStep:
  match yes:
    case True{}: SelectionFound{index}
    case False{}: selection_next(kind, Nat.add(index, 1n), remaining)

def selection_equal(
  +kind: SelectionKind,
  +index: Nat,
  remaining: Nat,
  equal: Bool
) -> SelectionStep:
  match kind equal:
    case CachedPlanMembership{} True{}: SelectionRead{kind, index, remaining, SelectionRoute{}}
    case _ True{}: SelectionFound{index}
    case _ False{}: selection_next(kind, Nat.add(index, 1n), remaining)

def selection_resume(step: SelectionStep, response: SelectionResponse) -> SelectionStep:
  match step response:
    case SelectionRead{kind, index, remaining, SelectionPresence{}} SelectionFlag{True{}}: SelectionRead{
      kind,
      index,
      remaining,
      SelectionEquality{}
    }
    case SelectionRead{kind, index, remaining, SelectionStatus{}} SelectionFlag{True{}}: SelectionRead{
      kind,
      index,
      remaining,
      SelectionEquality{}
    }
    case SelectionRead{kind, index, remaining, SelectionPresence{}} SelectionFlag{False{}}: selection_next(
      kind,
      Nat.add(index, 1n),
      remaining
    )
    case SelectionRead{kind, index, remaining, SelectionStatus{}} SelectionFlag{False{}}: selection_next(
      kind,
      Nat.add(index, 1n),
      remaining
    )
    case SelectionRead{kind, index, remaining, SelectionEquality{}} SelectionFlag{equal}: selection_equal(
      kind,
      index,
      remaining,
      equal
    )
    case SelectionRead{kind, index, remaining, SelectionRoute{}} SelectionPlanRoute{route}: selection_route_match(
      route_cached(route),
      kind,
      index,
      remaining
    )
    case _ _: SelectionRejected{}

def plan_observation_initial(+route: Route) -> PlanObservationStep:
  PlanObservationAwait{route, PlanReadReceipt{}, ReadPlanReceipt{}}

def plan_observation_enable(route: Route, receipt: Bool) -> PlanObservationStep:
  match receipt:
    case False{}: PlanObservationDone{}
    case True{}: PlanObservationAwait{route, PlanEnabled{}, CheckPlanInspection{}}

def plan_observation_origin(route: Route, receipt: Bool, owner: Bool) -> PlanObservationStep:
  match owner:
    case True{}: PlanObservationAwait{route, PlanForgotOrigin{receipt}, ForgetPlanOrigin{}}
    case False{}: plan_observation_enable(route, receipt)

def plan_observation_evaluation(route: Route) -> PlanObservationStep:
  PlanObservationAwait{route, PlanEvaluationRead{}, ReadPlanEvaluation{}}

def plan_observation_register(route: Route, owner: Bool) -> PlanObservationStep:
  match owner:
    case True{}: PlanObservationAwait{route, PlanRegistered{}, RegisterPlanOrigin{}}
    case False{}: plan_observation_evaluation(route)

def plan_observation_offer(+route: Route, linked: Bool) -> PlanObservationStep:
  match linked:
    case True{}: PlanObservationAwait{
      route,
      PlanOffered{},
      OfferLinkedPlan{inspection_route(route)}
    }
    case False{}: PlanObservationAwait{
      route,
      PlanOffered{},
      OfferMissingPlan{inspection_route(route)}
    }

def plan_observation_resume(
  step: PlanObservationStep,
  response: PlanObservationResponse
) -> PlanObservationStep:
  match step response:
    case PlanObservationAwait{+route, PlanReadReceipt{}, _} PlanObservationFlag{receipt}: plan_observation_origin(
      route,
      receipt,
      route_owner(route)
    )
    case PlanObservationAwait{route, PlanForgotOrigin{receipt}, _} PlanObservationAck{}: plan_observation_enable(
      route,
      receipt
    )
    case PlanObservationAwait{_, PlanEnabled{}, _} PlanObservationFlag{False{}}: PlanObservationDone{}
    case PlanObservationAwait{+route, PlanEnabled{}, _} PlanObservationFlag{True{}}: plan_observation_register(
      route,
      route_owner(route)
    )
    case PlanObservationAwait{route, PlanRegistered{}, _} PlanObservationAck{}: plan_observation_evaluation(
      route
    )
    case PlanObservationAwait{route, PlanEvaluationRead{}, _} PlanObservationFlag{linked}: plan_observation_offer(
      route,
      linked
    )
    case PlanObservationAwait{_, PlanOffered{}, _} PlanObservationAck{}: PlanObservationDone{}
    case _ _: PlanObservationRejected{}

def release_initial(+kind: ReleaseKind) -> ReleaseStep:
  match kind:
    case UnspawnedRelease{}: ReleaseAwait{kind, ReleaseReadTransfer{}}
    case AttachedRelease{}: ReleaseAwait{kind, ReleaseReadTransfer{}}
    case CachedRelease{}: ReleaseAwait{kind, ReleaseSlotReservation{}}
    case FinalizedRelease{}: ReleaseAwait{kind, ReleaseBuildUnit{}}

def release_finalize(ready: Bool) -> ReleaseStep:
  match ready:
    case True{}: ReleaseAwait{FinalizedRelease{}, ReleaseRetireWork{}}
    case False{}: ReleaseDone{}

def release_transition(
  +kind: ReleaseKind,
  operation: ReleaseOperation,
  response: ReleaseResponse
) -> ReleaseStep:
  match kind operation response:
    case UnspawnedRelease{} ReleaseReadTransfer{} ReleaseFlag{False{}}: ReleaseAwait{
      kind,
      ReleaseReadOwner{}
    }
    case AttachedRelease{} ReleaseReadTransfer{} ReleaseFlag{False{}}: ReleaseAwait{
      kind,
      ReleaseBuildUnit{}
    }
    case _ ReleaseReadTransfer{} ReleaseFlag{True{}}: ReleaseDone{}
    case UnspawnedRelease{} ReleaseReadOwner{} ReleaseFlag{True{}}: ReleaseAwait{
      kind,
      ReleaseReadPlanClaim{}
    }
    case UnspawnedRelease{} ReleaseReadOwner{} ReleaseFlag{False{}}: ReleaseAwait{
      kind,
      ReleaseSlotReservation{}
    }
    case UnspawnedRelease{} ReleaseReadPlanClaim{} ReleaseFlag{True{}}: ReleaseAwait{
      kind,
      ReleasePlanClaim{}
    }
    case UnspawnedRelease{} ReleaseReadPlanClaim{} ReleaseFlag{False{}}: ReleaseAwait{
      kind,
      ReleaseForgetPlanClaim{}
    }
    case UnspawnedRelease{} ReleasePlanClaim{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseForgetPlanClaim{}
    }
    case UnspawnedRelease{} ReleaseForgetPlanClaim{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseSlotReservation{}
    }
    case UnspawnedRelease{} ReleaseSlotReservation{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseForgetReservation{}
    }
    case UnspawnedRelease{} ReleaseForgetReservation{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseAcquisition{}
    }
    case UnspawnedRelease{} ReleaseAcquisition{} ReleaseAck{}: ReleaseDone{}
    case AttachedRelease{} ReleaseBuildUnit{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseReadUnitClaim{}
    }
    case AttachedRelease{} ReleaseReadUnitClaim{} ReleaseFlag{True{}}: ReleaseAwait{
      kind,
      ReleaseCapacityClaim{}
    }
    case AttachedRelease{} ReleaseReadUnitClaim{} ReleaseFlag{False{}}: ReleaseAwait{
      kind,
      ReleaseUnitReservation{}
    }
    case AttachedRelease{} ReleaseCapacityClaim{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseUnitReservation{}
    }
    case AttachedRelease{} ReleaseUnitReservation{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseCurrentWork{}
    }
    case AttachedRelease{} ReleaseCurrentWork{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseForgetAcquisition{}
    }
    case AttachedRelease{} ReleaseForgetAcquisition{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseMarkUnit{}
    }
    case AttachedRelease{} ReleaseMarkUnit{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseForgetUnitClaim{}
    }
    case AttachedRelease{} ReleaseForgetUnitClaim{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseForgetReservation{}
    }
    case AttachedRelease{} ReleaseForgetReservation{} ReleaseAck{}: ReleaseDone{}
    case CachedRelease{} ReleaseSlotReservation{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseAcquisition{}
    }
    case CachedRelease{} ReleaseAcquisition{} ReleaseAck{}: ReleaseAwait{kind, ReleaseBuildUnit{}}
    case CachedRelease{} ReleaseBuildUnit{} ReleaseAck{}: ReleaseAwait{kind, ReleaseMarkUnit{}}
    case CachedRelease{} ReleaseMarkUnit{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseForgetReservation{}
    }
    case CachedRelease{} ReleaseForgetReservation{} ReleaseAck{}: ReleaseDone{}
    case FinalizedRelease{} ReleaseBuildUnit{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseReadWorkBound{}
    }
    case FinalizedRelease{} ReleaseReadWorkBound{} ReleaseFlag{bound}: ReleaseAwait{
      kind,
      ReleaseReadCompleted{bound}
    }
    case FinalizedRelease{} ReleaseReadCompleted{_} ReleaseFlag{True{}}: ReleaseDone{}
    case FinalizedRelease{} ReleaseReadCompleted{bound} ReleaseFlag{False{}}: ReleaseAwait{
      kind,
      ReleaseReadRound{bound}
    }
    case FinalizedRelease{} ReleaseReadRound{_} ReleaseFlag{False{}}: ReleaseDone{}
    case FinalizedRelease{} ReleaseReadRound{bound} ReleaseFlag{True{}}: release_finalize(bound)
    case FinalizedRelease{} ReleaseRetireWork{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseReadReleased{}
    }
    case FinalizedRelease{} ReleaseReadReleased{} ReleaseFlag{True{}}: ReleaseDone{}
    case FinalizedRelease{} ReleaseReadReleased{} ReleaseFlag{False{}}: ReleaseAwait{
      kind,
      ReleaseUnitReservation{}
    }
    case FinalizedRelease{} ReleaseUnitReservation{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseCurrentWork{}
    }
    case FinalizedRelease{} ReleaseCurrentWork{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseForgetAcquisition{}
    }
    case FinalizedRelease{} ReleaseForgetAcquisition{} ReleaseAck{}: ReleaseAwait{
      kind,
      ReleaseMarkUnit{}
    }
    case FinalizedRelease{} ReleaseMarkUnit{} ReleaseAck{}: ReleaseDone{}
    case _ _ _: ReleaseRejected{}

def release_resume(step: ReleaseStep, response: ReleaseResponse) -> ReleaseStep:
  match step:
    case ReleaseAwait{kind, operation}: release_transition(kind, operation, response)
    case _: ReleaseRejected{}

def cleanup_choose(
  required: Bool,
  action: CleanupAction,
  rest: List<&2, CleanupAction>
) -> List<&2, CleanupAction>:
  match required:
    case True{}: action <> rest
    case False{}: rest

def cleanup_reservation_fact(
  handle: Nat,
  present: Bool,
  transferred: Bool,
  discharged: Bool,
  rest: List<&2, CleanupAction>
) -> List<&2, CleanupAction>:
  match present transferred discharged:
    case _ True{} _: rest
    case True{} False{} _: ReleaseCleanupReservation{handle} <> rest
    case False{} False{} True{}: rest
    case False{} False{} False{}: InvalidCleanupReservation{} <> rest

def cleanup_select(fact: CleanupFact, rest: List<&2, CleanupAction>) -> List<&2, CleanupAction>:
  match fact:
    case CleanupTail{handle, started}: cleanup_choose(
      Bool.not(started),
      DrainCleanupTail{handle},
      rest
    )
    case CleanupWork{handle, cached, completed, round_bound, work_bound}: cleanup_choose(
      cached && Bool.not(completed) && round_bound && work_bound,
      RetireCleanupWork{handle},
      rest
    )
    case CleanupReservation{handle, present, transferred, discharged}: cleanup_reservation_fact(
      handle,
      present,
      transferred,
      discharged,
      rest
    )
    case CleanupRevision{handle, present, transferred}: cleanup_choose(
      present && Bool.not(transferred),
      ReleaseCleanupRevision{handle},
      rest
    )
    case CleanupClaim{handle, present, transferred}: cleanup_choose(
      present && Bool.not(transferred),
      ReleaseCleanupClaim{handle},
      rest
    )
    case CleanupWorkspace{source_owned, active}: cleanup_choose(
      Bool.not(source_owned) && active,
      ReleaseCleanupWorkspace{},
      rest
    )
    case CleanupInvalidAllocation{}: InvalidCleanupAllocation{} <> rest
    case CleanupInvalidPlan{}: InvalidCleanupPlan{} <> rest

def cleanup_actions_go(
  facts: List<&2, CleanupFact>,
  acc: List<&2, CleanupAction>
) -> List<&2, CleanupAction>:
  match facts:
    case Nil{}: List.reverse(&2, CleanupAction, acc)
    case fact <> rest: cleanup_actions_go(rest, cleanup_select(fact, acc))

def cleanup_actions(facts: List<&2, CleanupFact>) -> List<&2, CleanupAction>:
  cleanup_actions_go(facts, Nil{})

def cleanup_next(mode: CleanupMode, actions: List<&2, CleanupAction>) -> CleanupCursor:
  match actions:
    case Nil{}: CleanupDone{}
    case action <> remaining: CleanupAwait{mode, action, remaining}

def cleanup_initial(mode: CleanupMode, facts: List<&2, CleanupFact>) -> CleanupCursor:
  cleanup_next(mode, cleanup_actions(facts))

def cleanup_reply(+cursor: CleanupCursor, success: Bool) -> CleanupCursor:
  match cursor success:
    case CleanupDone{} _: CleanupDone{}
    case CleanupAwait{RetryCleanup{}, _, _} False{}: cursor
    case CleanupAwait{mode, _, remaining} _: cleanup_next(mode, remaining)

# Read each finalization stage only after earlier effects settle, matching the
# native custody observation order. No resource inventory survives a finish retry.
def cleanup_finish_next(stage: CleanupStage) -> CleanupFinish:
  match stage:
    case CleanupTails{}: CleanupFinishRead{CleanupWorks{}}
    case CleanupWorks{}: CleanupFinishRead{CleanupReservations{}}
    case CleanupReservations{}: CleanupFinishRead{CleanupRevisions{}}
    case CleanupRevisions{}: CleanupFinishRead{CleanupClaims{}}
    case CleanupClaims{}: CleanupFinishRead{CleanupWorkspaceStage{}}
    case CleanupWorkspaceStage{}: CleanupFinishDone{}

def cleanup_finish_wrap(stage: CleanupStage, cursor: CleanupCursor) -> CleanupFinish:
  match cursor:
    case CleanupDone{}: cleanup_finish_next(stage)
    case +other: CleanupFinishRun{stage, other}

def cleanup_finish_initial() -> CleanupFinish:
  CleanupFinishRead{CleanupTails{}}

def cleanup_finish_inventory(finish: CleanupFinish, facts: List<&2, CleanupFact>) -> CleanupFinish:
  match finish:
    case CleanupFinishRead{stage}: cleanup_finish_wrap(
      stage,
      cleanup_initial(CollectCleanup{}, facts)
    )
    case _: CleanupFinishRejected{}

def cleanup_finish_reply(finish: CleanupFinish, success: Bool) -> CleanupFinish:
  match finish:
    case CleanupFinishRun{stage, cursor}: cleanup_finish_wrap(stage, cleanup_reply(cursor, success))
    case _: CleanupFinishRejected{}

def cleanup_key(item: Planned) -> Nat:
  match item:
    case Planned{_, key, _}: key

# Preserve the previous Map's last slot for duplicate keys, and consume all
# matching entries before checking for a slot without a bound plan.
def cleanup_find(+key: Nat, slots: List<&2, Slot>, found: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match slots:
    case Nil{}: found
    case Slot{Planned{_, other, _}, _, reservation} <> rest:
      cleanup_find(
        key,
        rest,
        Bool.pick(Maybe<&2, Nat>, Nat.is_eq(key, other), Some{reservation}, found)
      )

def cleanup_remove_go(+key: Nat, slots: List<&2, Slot>, +acc: List<&2, Slot>) -> List<&2, Slot>:
  match slots:
    case Nil{}: List.reverse(&2, Slot, acc)
    case +slot <> rest: cleanup_remove_go(
      key,
      rest,
      Bool.pick(List<&2, Slot>, Nat.is_eq(key, cleanup_key(slot_item(slot))), acc, slot <> acc)
    )

def cleanup_remove(key: Nat, slots: List<&2, Slot>) -> List<&2, Slot>:
  cleanup_remove_go(key, slots, Nil{})

def cleanup_plan(
  reservation: Maybe<&2, Nat>,
  key: Nat,
  acc: List<&2, CleanupAction>
) -> List<&2, CleanupAction>:
  match reservation:
    case None{}: ReleaseCleanupClaim{key} <> acc
    case Some{handle}: ReleaseCleanupClaim{key} <> ReleaseCleanupReservation{handle} <> acc

def cleanup_unbound(slots: List<&2, Slot>, acc: List<&2, CleanupAction>) -> List<&2, CleanupAction>:
  match slots:
    case Nil{}: acc
    case _ <> _: InvalidCleanupAllocation{} <> acc

def cleanup_plans_go(
  planned: List<&2, Planned>,
  +slots: List<&2, Slot>,
  acc: List<&2, CleanupAction>
) -> List<&2, CleanupAction>:
  match planned:
    case Nil{}: List.reverse(&2, CleanupAction, cleanup_unbound(slots, acc))
    case +item <> rest:
      +key = cleanup_key(item)
      cleanup_plans_go(
        rest,
        cleanup_remove(key, slots),
        cleanup_plan(cleanup_find(key, slots, None{}), key, acc)
      )

def cleanup_plans(planned: List<&2, Planned>, slots: List<&2, Slot>) -> List<&2, CleanupAction>:
  cleanup_plans_go(planned, slots, Nil{})

def cleanup_revision(
  revision: Maybe<&2, Nat>,
  rest: List<&2, CleanupAction>
) -> List<&2, CleanupAction>:
  match revision:
    case None{}: rest
    case Some{handle}: ReleaseCleanupRevision{handle} <> rest

def cleanup_command(state: State, reason: Termination, +cursor: CleanupCursor) -> Step:
  match cursor:
    case CleanupDone{}: Stopped{reason}
    case CleanupAwait{_, action, _}: await_command(
      state,
      Cleaning{cursor, reason},
      PerformCleanup{action}
    )

def cleanup_values(
  state: State,
  +slots: List<&2, Slot>,
  +planned: List<&2, Planned>,
  +revision: Maybe<&2, Nat>,
  reason: Termination
) -> Step:
  await_command(
    state,
    Cleaned{slots, planned, revision, reason},
    Cleanup{cleanup_revision(revision, cleanup_plans(planned, slots))}
  )

def cleanup(+state: State, +phase: Phase, reason: Termination) -> Step:
  cleanup_values(state, held_slots(phase), held_plans(phase), held_revision(phase), reason)

def observation_incomplete(state: State) -> Bool:
  match state:
    case State{_, _, _, incomplete, _, _}: incomplete

def ready_observation(+state: State, ready: List<&2, Outcome>) -> Step:
  match ready:
    case Nil{}: await_command(
      state,
      EmptyAnalytics{},
      ReportEmptyAnalytics{observation_incomplete(state)}
    )
    case +ready: await_command(state, ReadyObserved{ready}, ObserveReady{ready})

def delivery_refused(state: State) -> Bool:
  match state:
    case State{_, _, _, _, refused, _}: refused

def mark_delivery_refused(state: State) -> State:
  match state:
    case State{invocation, next, bound, incomplete, _, phase}:
      State{invocation, next, bound, incomplete, True{}, phase}

def refuse_delivery(state: State, rest: List<&2, Outcome>, accepted: List<&2, Outcome>) -> Step:
  await_command(
    mark_delivery_refused(state),
    DeliverabilityRefused{rest, accepted},
    ReportDeliverabilityCapacity{}
  )

def admission_next(state: State, rest: List<&2, Outcome>, +ready: List<&2, Outcome>) -> Step:
  match rest:
    case Nil{}: ready_observation(state, reverse(ready, Nil{}))
    case +outcome <> rest: await_command(
      state,
      Admitting{outcome, rest, ready},
      Offer{outcome, True{}}
    )

def delivering_next(state: State, rest: List<&2, Outcome>, accepted: List<&2, Outcome>) -> Step:
  match rest:
    case Nil{}: inside(state, Routes{reverse(accepted, Nil{}), Nil{}})
    case +outcome <> rest: await_command(
      state,
      Delivering{outcome, rest, accepted},
      Offer{outcome, outcome_fits(outcome)}
    )

def routing_next(state: State, rest: List<&2, Outcome>, +planned: List<&2, Planned>) -> Step:
  match rest:
    case Nil{}: await_command(
      state,
      PlansObserved{reverse_plans(planned, Nil{})},
      ObservePlans{reverse_plans(planned, Nil{})}
    )
    case +outcome <> rest: await_command(
      state,
      Routing{outcome, rest, planned},
      LookupReuse{outcome}
    )

def routed(
  state: State,
  +item: Planned,
  +rest: List<&2, Outcome>,
  +planned: List<&2, Planned>
) -> Step:
  match item:
    case Planned{_, _, CachedEntry{}}: await_command(
      state,
      CachedRead{item, rest, planned},
      ReadCached{item}
    )
    case Planned{_, _, JoinedPending{}}: await_command(
      state,
      PendingRead{item, rest, planned},
      ReadPending{item}
    )
    case _: inside(state, Routes{rest, item <> planned})

def cached_route(evaluation: Nat, findings: Nat) -> Route:
  match findings:
    case 0n: CachedClear{}
    case _: CachedFinding{evaluation}

def cached_item(item: Planned, evaluation: Nat, findings: Nat) -> Planned:
  match item:
    case Planned{outcome, key, _}: Planned{outcome, key, cached_route(evaluation, findings)}

def owner_barrier(yes: Bool, state: State, +planned: List<&2, Planned>) -> Step:
  match yes:
    case True{}: await_command(state, OwnerChecked{planned}, OwnerBarrier{})
    case False{}: await_command(state, LiveChecked{planned}, CheckActive{})

def reuse_analytics(
  state: State,
  +planned: List<&2, Planned>,
  remaining: List<&2, Planned>
) -> Step:
  match remaining:
    case Nil{}: owner_barrier(any_owner(planned), state, planned)
    case Planned{_, _, Owner{}} <> rest: reuse_analytics(state, planned, rest)
    case +item <> rest: await_command(
      state,
      PlansAnalytics{planned, rest},
      RecordReuseAnalytics{item}
    )

def joined_barrier(
  yes: Bool,
  state: State,
  planned: List<&2, Planned>,
  retained: List<&2, Planned>,
  slots: List<&2, Maybe<&2, Slot>>
) -> Step:
  match yes:
    case True{}: await_command(state, JoinedChecked{planned, retained, slots}, JoinedBarrier{})
    case False{}: inside(state, NextUnit{planned, retained, slots})

def reuse_next(state: State, remaining: List<&2, Planned>, continuation: Phase) -> Step:
  match remaining:
    case Nil{}: inside(state, continuation)
    case +item <> rest:
      match item:
        case Planned{_, _, CachedClear{}}: await_command(
          state,
          ReuseAwait{item, ClearRegistered{}, ReuseNext{rest, continuation}},
          RegisterClear{item}
        )
        case Planned{_, _, JoinedAdvice{}}: await_command(
          state,
          ReuseAwait{item, AdviceRead{}, ReuseNext{rest, continuation}},
          ReadLiveAdvice{item}
        )
        case Planned{_, _, JoinedPending{}}: await_command(
          state,
          ReuseAwait{item, AdviceRead{}, ReuseNext{rest, continuation}},
          ReadLiveAdvice{item}
        )
        case Planned{_, _, JoinedClaimed{}}: await_command(
          state,
          ReuseAwait{item, AdviceRead{}, ReuseNext{rest, continuation}},
          ReadLiveAdvice{item}
        )
        case _: inside(state, ReuseNext{rest, continuation})

def advance_phase(state: State, phase: Phase) -> Step:
  match phase:
    case Begin{outcomes}: await_command(state, Begin{outcomes}, CheckActive{})
    case Admit{rest, ready}: admission_next(state, rest, ready)
    case Deliver{rest, accepted}: delivering_next(state, rest, accepted)
    case Routes{rest, planned}: routing_next(state, rest, planned)
    case ReuseNext{remaining, continuation}: reuse_next(state, remaining, continuation)
    case ReuseObserved{+planned, retained, slots}: joined_barrier(
      any_claimed(planned),
      state,
      planned,
      retained,
      slots
    )
    case NextUnit{_, Nil{}, Nil{}}: Finished{}
    case NextUnit{planned, +items, +slots}: await_command(
      state,
      UnitChecked{planned, items, slots},
      CheckActive{}
    )
    case _: Rejected{}

def advance(+state: State) -> Step:
  match state:
    case State{_, _, _, _, _, phase}: advance_phase(state, phase)

def initial(
  invocation: Nat,
  round_bound: Bool,
  +outcomes: List<&2, Outcome>,
  incomplete: Bool
) -> Step:
  await_command(
    State{invocation, 0n, round_bound, incomplete, False{}, PreparedObserved{outcomes}},
    PreparedObserved{outcomes},
    ObservePreparation{}
  )

def accept_outcome(
  accepted: Bool,
  +outcome: Outcome,
  +ready: List<&2, Outcome>
) -> List<&2, Outcome>:
  match accepted:
    case True{}: Bool.pick(List<&2, Outcome>, outcome_ready(outcome), outcome <> ready, ready)
    case False{}: ready

def unit_next(
  state: State,
  planned: List<&2, Planned>,
  items: List<&2, Planned>,
  slots: List<&2, Maybe<&2, Slot>>
) -> Step:
  match items slots:
    case +item <> rest None{} <> slots:
      await_command(state, CapacityReported{NextUnit{planned, rest, slots}}, ReportCapacity{item})
    case _ <> rest Some{+slot} <> slots:
      await_command(
        state,
        RevisionRegistered{slot, NextUnit{planned, rest, slots}},
        RegisterRevision{slot}
      )
    case _ _: Rejected{}

def unit_observed(
  state: State,
  +slot: Slot,
  +revision: Nat,
  +work: Maybe<&2, Nat>,
  continuation: Phase
) -> Step:
  match slot:
    case Slot{Planned{_, _, CachedFinding{_}}, _, _}:
      await_command(
        state,
        CachedSettled{slot, revision, work, CachedStarted{}, continuation},
        StartCachedReview{slot}
      )
    case Slot{Planned{_, _, Owner{}}, _, _}:
      await_command(
        state,
        OwnerAttached{slot, revision, work, continuation},
        AttachOwner{slot, revision, work}
      )
    case _: Rejected{}

def round_bound(state: State) -> Bool:
  match state:
    case State{_, _, bound, _, _, _}: bound

def missing_work(
  bound: Bool,
  state: State,
  +slot: Slot,
  +revision: Nat,
  continuation: Phase
) -> Step:
  match bound:
    case True{}: await_command(state, Released{continuation}, ReleaseUnspawned{slot, revision})
    case False{}: await_command(
      state,
      UnitObserved{slot, revision, None{}, continuation},
      ObserveUnit{slot, revision, None{}}
    )

def work_registered(
  +state: State,
  +slot: Slot,
  +revision: Nat,
  token: Maybe<&2, Nat>,
  continuation: Phase
) -> Step:
  match token:
    case None{}: missing_work(round_bound(state), state, slot, revision, continuation)
    case Some{+work}: await_command(
      state,
      UnitObserved{slot, revision, Some{work}, continuation},
      ObserveUnit{slot, revision, Some{work}}
    )

def assign_slot(item: Planned, allocation: Maybe<&2, Allocation>) -> Maybe<&2, Slot>:
  match allocation:
    case None{}: None{}
    case Some{Allocation{operation, reservation}}: Some{Slot{item, operation, reservation}}

def prepend_slot(
  slot: Maybe<&2, Slot>,
  remaining: Maybe<&2, List<&2, Maybe<&2, Slot>>>
) -> Maybe<&2, List<&2, Maybe<&2, Slot>>>:
  match remaining:
    case None{}: None{}
    case Some{rest}: Some{slot <> rest}

def assign_slots(
  items: List<&2, Planned>,
  allocations: List<&2, Maybe<&2, Allocation>>
) -> Maybe<&2, List<&2, Maybe<&2, Slot>>>:
  match items allocations:
    case Nil{} Nil{}: Some{Nil{}}
    case item <> items allocation <> allocations: prepend_slot(
      assign_slot(item, allocation),
      assign_slots(items, allocations)
    )
    case _ _: None{}

def report_delivery_notice(state: State, refused: Bool, continuation: Phase) -> Step:
  match refused:
    case True{}: await_command(
      state,
      DeliverabilityNoticed{continuation},
      ReportDeliverabilityNotice{}
    )
    case False{}: inside(state, continuation)

def reserved_reply(
  +state: State,
  +planned: List<&2, Planned>,
  retained: List<&2, Planned>,
  slots: Maybe<&2, List<&2, Maybe<&2, Slot>>>
) -> Step:
  match slots:
    case Some{slots}: report_delivery_notice(
      state,
      delivery_refused(state),
      ReuseNext{planned, ReuseObserved{planned, retained, slots}}
    )
    case None{}: Rejected{}

def absent_join(state: State, +item: Planned, continuation: Phase) -> Step:
  match item:
    case Planned{_, _, JoinedClaimed{}}: await_command(
      state,
      ReuseAwait{item, JoinedAppended{}, continuation},
      AppendJoined{item, None{}}
    )
    case _: await_command(
      state,
      ReuseAwait{item, ActivityRecorded{}, continuation},
      RecordReuseActivity{item, UnavailableActivity{}}
    )

def resume_reuse(
  state: State,
  +item: Planned,
  stage: ReuseStage,
  continuation: Phase,
  response: Response
) -> Step:
  match stage response:
    case ClearRegistered{} Revision{+revision}: await_command(
      state,
      ReuseAwait{item, ClearReleased{revision}, continuation},
      ReleaseClear{revision}
    )
    case ClearReleased{_} Ack{}: await_command(
      state,
      ReuseAwait{item, ActivityRecorded{}, continuation},
      RecordReuseActivity{item, ClearActivity{}}
    )
    case AdviceRead{} AdviceOwner{Some{+advice}}: await_command(
      state,
      ReuseAwait{item, AdvicePublished{advice}, continuation},
      PublishJoinedAdvice{advice}
    )
    case AdviceRead{} AdviceOwner{None{}}: await_command(
      state,
      ReuseAwait{item, JoinedPendingRead{}, continuation},
      ReadJoinedPending{item}
    )
    case AdvicePublished{+advice} Published{+publication}: await_command(
      state,
      ReuseAwait{item, JoinedRecorded{advice}, continuation},
      RecordJoinedOutcomes{advice, publication}
    )
    case JoinedRecorded{advice} Ack{}: await_command(
      state,
      ReuseAwait{item, AdviceCurrent{}, continuation},
      ReadCurrentAdvice{advice}
    )
    case AdviceCurrent{} FindingCount{findings}: await_command(
      state,
      ReuseAwait{item, ActivityRecorded{}, continuation},
      RecordReuseActivity{item, FindingsActivity{findings}}
    )
    case JoinedPendingRead{} JoinOwner{Some{+owner}}: await_command(
      state,
      ReuseAwait{item, JoinedAppended{}, continuation},
      AppendJoined{item, Some{owner}}
    )
    case JoinedPendingRead{} JoinOwner{None{}}: absent_join(state, item, continuation)
    case JoinedAppended{} Ack{}: await_command(
      state,
      ReuseAwait{item, ExpectedRemembered{}, continuation},
      RememberExpected{item}
    )
    case ActivityRecorded{} Ack{}: inside(state, continuation)
    case ExpectedRemembered{} Ack{}: inside(state, continuation)
    case _ _: Rejected{}

def cached_next(
  state: State,
  slot: Slot,
  revision: Nat,
  work: Maybe<&2, Nat>,
  continuation: Phase,
  stage: CachedStage,
  command: Command
) -> Step:
  await_command(state, CachedSettled{slot, revision, work, stage, continuation}, command)

def resume_cached(
  +state: State,
  +slot: Slot,
  +revision: Nat,
  +work: Maybe<&2, Nat>,
  stage: CachedStage,
  +continuation: Phase,
  response: Response
) -> Step:
  match stage response:
    case CachedStarted{} ReviewAccepted{True{}}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedCompleted{},
      CompleteCachedReview{slot}
    )
    case CachedCompleted{} ReviewAccepted{True{}}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedActivity{},
      RecordCachedActivity{slot}
    )
    case CachedActivity{} Ack{}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedActive{},
      CheckCachedActive{slot, revision, work}
    )
    case CachedActive{} Active{True{}}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedExisting{},
      ReadCachedAdvice{slot}
    )
    case CachedActive{} Active{False{}}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedRetired{},
      RetireCachedWork{slot, revision, work}
    )
    case CachedExisting{} AdviceOwner{Some{+advice}}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedPublished{advice},
      PublishJoinedAdvice{advice}
    )
    case CachedPublished{advice} Published{publication}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedRecorded{},
      RecordJoinedOutcomes{advice, publication}
    )
    case CachedRecorded{} Ack{}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedRetired{},
      RetireCachedWork{slot, revision, work}
    )
    case CachedRetired{} Ack{}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedReleased{},
      ReleaseCachedUnit{slot, revision, work}
    )
    case CachedReleased{} Ack{}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedFinalized{},
      FinalizeCachedUnit{slot, revision, work}
    )
    case CachedExisting{} AdviceOwner{None{}}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedInserted{},
      InsertCachedAdvice{slot, revision, work}
    )
    case CachedInserted{} AdviceInserted{+tail}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedInspected{tail},
      ObserveRetainedAdvice{tail}
    )
    case CachedInspected{tail} Defect{token}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedPreserving{DefectFailure{token}},
      PreserveAdviceTail{tail}
    )
    case CachedInspected{tail} Failed{token}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedPreserving{TechnicalFailure{token}},
      PreserveAdviceTail{tail}
    )
    case CachedInspected{tail} Cancelled{token}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedPreserving{CancelledReason{token}},
      PreserveAdviceTail{tail}
    )
    case CachedPreserving{+reason} Ack{}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedFailureFinalized{reason},
      FinalizeCachedUnit{slot, revision, work}
    )
    case CachedFailureFinalized{+reason} Ack{}: cleanup(
      state,
      CachedSettled{slot, revision, work, CachedFailureFinalized{reason}, continuation},
      reason
    )
    case CachedInspected{tail} Ack{}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedTailAwaited{},
      AwaitAdviceTail{tail}
    )
    case CachedTailAwaited{} Ack{}: cached_next(
      state,
      slot,
      revision,
      work,
      continuation,
      CachedFinalized{},
      FinalizeCachedUnit{slot, revision, work}
    )
    case CachedFinalized{} Ack{}: inside(state, detached(continuation, slot))
    case _ Cancelled{token}: cleanup(
      state,
      CachedSettled{slot, revision, work, stage, continuation},
      CancelledReason{token}
    )
    case _ Defect{token}: cleanup(
      state,
      CachedSettled{slot, revision, work, stage, continuation},
      DefectFailure{token}
    )
    case _ Failed{token}: cleanup(
      state,
      CachedSettled{slot, revision, work, stage, continuation},
      TechnicalFailure{token}
    )
    case _ ReviewAccepted{False{}}: cleanup(
      state,
      CachedSettled{slot, revision, work, stage, continuation},
      TechnicalFailure{0n}
    )
    case _ _: Rejected{}

def resume_phase(+state: State, +phase: Phase, response: Response) -> Step:
  match phase response:
    case PreparedObserved{outcomes} Ack{}: inside(state, Begin{outcomes})
    case InactiveWorkspace{_} Ack{}: cleanup(state, phase, Inactive{})
    case Begin{outcomes} Active{True{}}: inside(state, Admit{outcomes, Nil{}})
    case Begin{_} Active{False{}}: await_command(
      state,
      InactiveWorkspace{Nil{}},
      ReleaseWorkspace{}
    )
    case Admitting{outcome, rest, ready} Offered{accepted}: inside(
      state,
      Admit{rest, accept_outcome(accepted, outcome, ready)}
    )
    case EmptyAnalytics{} Ack{}: await_command(
      state,
      EmptyActivity{},
      ReportEmptyActivity{observation_incomplete(state)}
    )
    case EmptyActivity{} Ack{}: await_command(state, ReadyObserved{Nil{}}, ObserveReady{Nil{}})
    case ReadyObserved{ready} Ack{}: inside(state, Deliver{ready, Nil{}})
    case Delivering{outcome, rest, accepted} Offered{True{}}: inside(
      state, Deliver{rest, outcome <> accepted}
    )
    case Delivering{_, rest, accepted} Offered{False{}}: refuse_delivery(state, rest, accepted)
    case DeliverabilityRefused{rest, accepted} Ack{}: inside(state, Deliver{rest, accepted})
    case DeliverabilityNoticed{continuation} Ack{}: inside(state, continuation)
    case Routing{outcome, rest, planned} Routed{key, route}: routed(
      state,
      Planned{outcome, key, route},
      rest,
      planned
    )
    case CachedRead{item, rest, planned} CachedFacts{evaluation, findings}: inside(
      state,
      Routes{rest, cached_item(item, evaluation, findings) <> planned}
    )
    case PendingRead{+item, rest, planned} PendingOwner{+owner}: await_command(
      state,
      PendingRestored{item, rest, planned},
      RestorePending{item, owner}
    )
    case PendingRestored{item, rest, planned} Ack{}: inside(state, Routes{rest, item <> planned})
    case PlansObserved{+planned} Ack{}: reuse_analytics(state, planned, planned)
    case PlansAnalytics{+planned, remaining} Ack{}: reuse_analytics(state, planned, remaining)
    case OwnerChecked{planned} Ack{}: await_command(state, LiveChecked{planned}, CheckActive{})
    case LiveChecked{+planned} Active{True{}}:
      await_command(
        state,
        ReservedUnits{planned, retained(planned)},
        CompletePreparation{retained(planned)}
      )
    case LiveChecked{planned} Active{False{}}: await_command(
      state,
      InactiveWorkspace{planned},
      ReleaseWorkspace{}
    )
    case ReservedUnits{planned, +retained} Reserved{allocations}:
      reserved_reply(state, planned, retained, assign_slots(retained, allocations))
    case ReuseAwait{_, _, _} Defect{token}: cleanup(state, phase, DefectFailure{token})
    case ReuseAwait{_, _, _} Failed{token}: cleanup(state, phase, TechnicalFailure{token})
    case ReuseAwait{_, _, _} Cancelled{token}: cleanup(state, phase, CancelledReason{token})
    case ReuseAwait{item, stage, continuation} +response: resume_reuse(
      state,
      item,
      stage,
      continuation,
      response
    )
    case JoinedChecked{planned, retained, slots} Ack{}: inside(
      state,
      NextUnit{planned, retained, slots}
    )
    case UnitChecked{planned, items, slots} Active{True{}}: unit_next(state, planned, items, slots)
    case UnitChecked{_, _, _} Active{False{}}: cleanup(state, phase, Inactive{})
    case RevisionRegistered{+slot, continuation} Revision{+revision}:
      await_command(
        state,
        WorkRegistered{slot, revision, continuation},
        RegisterWork{slot, revision}
      )
    case WorkRegistered{slot, revision, continuation} Work{token}: work_registered(
      state,
      slot,
      revision,
      token,
      continuation
    )
    case UnitObserved{slot, revision, work, continuation} Ack{}: unit_observed(
      state,
      slot,
      revision,
      work,
      continuation
    )
    case OwnerAttached{+slot, +revision, +work, continuation} Attached{True{}}:
      await_command(
        state,
        UnitEnqueued{slot, revision, work, continuation},
        Enqueue{slot, revision, work}
      )
    case OwnerAttached{_, _, _, _} Attached{False{}}: cleanup(state, phase, TechnicalFailure{0n})
    case UnitEnqueued{slot, _, _, continuation} Queued{True{}}: inside(
      state,
      detached(continuation, slot)
    )
    case UnitEnqueued{+slot, revision, work, continuation} Queued{False{}}:
      await_command(
        state,
        EnqueueReleased{slot_item(slot), detached(continuation, slot)},
        ReleaseAttached{slot, revision, work}
      )
    case EnqueueReleased{item, continuation} Ack{}: await_command(
      state,
      CapacityReported{continuation},
      ReportCapacity{item}
    )
    case CachedSettled{slot, revision, work, stage, continuation} response: resume_cached(
      state,
      slot,
      revision,
      work,
      stage,
      continuation,
      response
    )
    case Released{continuation} Ack{}: inside(state, continuation)
    case CapacityReported{continuation} Ack{}: inside(state, continuation)
    case Cleaned{_, _, _, reason} CleanupInventory{facts}: cleanup_command(
      state,
      reason,
      cleanup_initial(RetryCleanup{}, facts)
    )
    case Cleaning{cursor, reason} Ack{}: cleanup_command(
      state,
      reason,
      cleanup_reply(cursor, True{})
    )
    case Cleaning{cursor, reason} _: cleanup_command(state, reason, cleanup_reply(cursor, False{}))
    case Cleaned{slots, planned, revision, reason} _: cleanup_values(
      state,
      slots,
      planned,
      revision,
      reason
    )
    case _ Cancelled{token}: cleanup(state, phase, CancelledReason{token})
    case _ Defect{token}: cleanup(state, phase, DefectFailure{token})
    case _ Failed{token}: cleanup(state, phase, TechnicalFailure{token})
    case _ _: Rejected{}

def correlated(ok: Bool, state: State, phase: Phase, response: Response) -> Step:
  match ok:
    case True{}: resume_phase(state, phase, response)
    case False{}: Rejected{}

def resume_state(ok: Bool, +state: State, response: Response) -> Step:
  match state:
    case State{_, _, _, _, _, phase}: correlated(ok, state, phase, response)

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Await{+state, Request{invocation, id, _}} Reply{other, other_id, response}:
      resume_state(Bool.and(Nat.is_eq(invocation, other), Nat.is_eq(id, other_id)), state, response)
    case _ _: Rejected{}

def retained_observation_initial() -> RetainedObservationStep:
  RetainedObservationAwait{RetainedReadReceipt{}}

def retained_observation_resume(step: RetainedObservationStep,
  response: RetainedObservationResponse) -> RetainedObservationStep:
  match step response:
    case RetainedObservationAwait{RetainedReadReceipt{}} RetainedObservationFlag{value}:
      Bool.pick(
        RetainedObservationStep,
        value,
        RetainedObservationAwait{RetainedCheckEnabled{}},
        RetainedObservationAwait{RetainedComplete{}}
      )
    case RetainedObservationAwait{RetainedCheckEnabled{}} RetainedObservationFlag{value}:
      Bool.pick(
        RetainedObservationStep,
        value,
        RetainedObservationAwait{RetainedPrepareBase{}},
        RetainedObservationAwait{RetainedComplete{}}
      )
    case RetainedObservationAwait{RetainedPrepareBase{}} RetainedObservationAck{}:
      RetainedObservationAwait{RetainedReadEvaluation{}}
    case RetainedObservationAwait{RetainedReadEvaluation{}} RetainedObservationFlag{value}:
      Bool.pick(
        RetainedObservationStep,
        value,
        RetainedObservationAwait{RetainedAttachEvaluation{}},
        RetainedObservationAwait{RetainedOffer{}}
      )
    case RetainedObservationAwait{RetainedAttachEvaluation{}} RetainedObservationAck{}:
      RetainedObservationAwait{RetainedOffer{}}
    case RetainedObservationAwait{RetainedOffer{}} RetainedObservationAck{}:
      RetainedObservationAwait{RetainedComplete{}}
    case RetainedObservationAwait{RetainedComplete{}} RetainedObservationAck{}:
      RetainedObservationDone{}
    case _ _: RetainedObservationRejected{}

# Exact old host allowance: even a settled step is rejected when fuel is zero.
def settle(remaining: Nat, step: Step) -> Maybe<&2, Step>:
  match remaining:
    case 0n: None{}
    case 1n++rest:
      match step:
        case Internal{state}: settle(rest, advance(state))
        case _: Some{step}

def initial_settled(
  invocation: Nat,
  round_bound: Bool,
  outcomes: List<&2, Outcome>,
  incomplete: Bool
) -> Maybe<&2, Step>:
  settle(10000n, initial(invocation, round_bound, outcomes, incomplete))

def resume_settled(step: Step, reply: Reply) -> Maybe<&2, Step>:
  settle(10000n, resume(step, reply))
