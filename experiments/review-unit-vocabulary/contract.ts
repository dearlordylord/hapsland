declare const DomainBrand: unique symbol;

type Brand<Value, Name extends string> = Value & {
  readonly [DomainBrand]: Name;
};

type NonEmptyArray<Value> = readonly [Value, ...Value[]];

type ArtifactId = Brand<string, "ArtifactId">;
type ChangeSetId = Brand<string, "ChangeSetId">;
type CheckpointId = Brand<string, "CheckpointId">;
type HostEventId = Brand<string, "HostEventId">;
type InputContractId = Brand<string, "InputContractId">;
type InputContractVersion = Brand<number, "InputContractVersion">;
type ModelId = Brand<string, "ModelId">;
type ObservationId = Brand<string, "ObservationId">;
type PositiveDurationMilliseconds = Brand<number, "PositiveDurationMilliseconds">;
type RepositoryPath = Brand<string, "RepositoryPath">;
type RenderedReviewPayload = Brand<string, "RenderedReviewPayload">;
type RendererFingerprint = Brand<string, "RendererFingerprint">;
type ReviewProjectionFingerprint = Brand<string, "ReviewProjectionFingerprint">;
type ReviewWorkItemId = Brand<string, "ReviewWorkItemId">;
type RuleDefinitionFingerprint = Brand<string, "RuleDefinitionFingerprint">;
type RuleId = Brand<string, "RuleId">;
type RuleSetFingerprint = Brand<string, "RuleSetFingerprint">;
type NonEmptyAdviceMessage = Brand<string, "NonEmptyAdviceMessage">;
type NonEmptyDomainText = Brand<string, "NonEmptyDomainText">;
type NonEmptySourceText = Brand<string, "NonEmptySourceText">;
type SourceFingerprint = Brand<string, "SourceFingerprint">;
type SourceSpan = Brand<string, "SourceSpan">;
type SymbolName = Brand<string, "SymbolName">;
type WorktreeId = Brand<string, "WorktreeId">;
type RetryCount = Brand<number, "RetryCount">;
type RetainedByteCount = Brand<number, "RetainedByteCount">;

type CapturedSource = Readonly<{
  text: NonEmptySourceText;
  fingerprint: SourceFingerprint;
}>;

type SourceLocation = Readonly<{
  path: RepositoryPath;
  span: SourceSpan;
}>;

type Artifact = Readonly<{
  kind: "typeShape";
  id: ArtifactId;
  language: "typescript";
  declarationKind: "interface" | "typeAlias" | "zodSchema" | "effectSchema";
  location: SourceLocation;
  source: CapturedSource;
}>;

type ReferenceSite = Readonly<{
  symbol: SymbolName;
  span: SourceSpan;
}>;

type OmittedTarget =
  | Readonly<{ kind: "known"; artifactId: ArtifactId }>
  | Readonly<{ kind: "unresolved"; symbol: SymbolName }>;

type OmissionReason =
  | "artifactLimit"
  | "depthLimit"
  | "externalPolicy"
  | "fileLimit"
  | "sourceLimit"
  | "timeLimit"
  | "unsupported"
  | "unresolved";

type ArtifactReference =
  | Readonly<{
      kind: "expanded";
      site: ReferenceSite;
      node: ReviewNode;
    }>
  | Readonly<{
      kind: "included";
      site: ReferenceSite;
      target: ArtifactId;
    }>
  | Readonly<{
      kind: "omitted";
      site: ReferenceSite;
      target: OmittedTarget;
      reason: OmissionReason;
    }>;

type ReviewNode = Readonly<{
  artifact: Artifact;
  references: readonly ArtifactReference[];
}>;

type DomainEvidence =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "supplied"; text: NonEmptyDomainText }>;

type ReviewUnit = Readonly<{
  root: ReviewNode;
  domain: DomainEvidence;
  projectionFingerprint: ReviewProjectionFingerprint;
}>;

type SourceSnapshot = Readonly<{
  path: RepositoryPath;
  source: CapturedSource;
}>;

type FileChange =
  | Readonly<{ kind: "added"; after: SourceSnapshot }>
  | Readonly<{
      kind: "modified";
      before: SourceFingerprint;
      after: SourceSnapshot;
    }>
  | Readonly<{
      kind: "deleted";
      path: RepositoryPath;
      before: SourceFingerprint;
    }>;

type ChangeObservation =
  | Readonly<{
      kind: "directEdit";
      id: ObservationId;
      worktree: WorktreeId;
      event: HostEventId;
      paths: NonEmptyArray<RepositoryPath>;
    }>
  | Readonly<{
      kind: "checkpoint";
      id: ObservationId;
      worktree: WorktreeId;
      checkpoint: CheckpointId;
    }>;

type ChangeSet = Readonly<{
  id: ChangeSetId;
  observation: ObservationId;
  changes: readonly FileChange[];
}>;

type ObservationResult =
  | Readonly<{ status: "complete"; changeSet: ChangeSet }>
  | Readonly<{
      status: "skipped";
      observation: ObservationId;
      reason: "missingConsent" | "unsupportedRepository";
    }>
  | Readonly<{
      status: "incomplete";
      observation: ObservationId;
      reason: "readFailure" | "scanBudget" | "unstableSource";
      retryable: boolean;
    }>;

type RuleSnapshot = Readonly<{
  id: RuleId;
  definitionFingerprint: RuleDefinitionFingerprint;
}>;

type RuleSetSnapshot = Readonly<{
  fingerprint: RuleSetFingerprint;
  rules: NonEmptyArray<RuleSnapshot>;
}>;

type InputContractSnapshot = Readonly<{
  id: InputContractId;
  version: InputContractVersion;
  rendererFingerprint: RendererFingerprint;
}>;

type ReviewWorkItem = Readonly<{
  id: ReviewWorkItemId;
  observation: ObservationId;
  changeSet: ChangeSetId;
  unit: ReviewUnit;
  rules: RuleSetSnapshot;
  inputContract: InputContractSnapshot;
}>;

type ReviewInput = Readonly<{
  contract: InputContractSnapshot;
  projection: ReviewProjectionFingerprint;
  payload: RenderedReviewPayload;
}>;

type Probability = Brand<number, "Probability">;

type RuleAnswer = Readonly<{
  rule: RuleId;
  probability: Probability;
}>;

type BackendResponse = Readonly<{
  answers: NonEmptyArray<RuleAnswer>;
  backend: Readonly<{
    id: "jev";
    model: ModelId;
    durationMilliseconds: PositiveDurationMilliseconds;
    retries: RetryCount;
  }>;
}>;

type Advice = Readonly<{
  rule: RuleId;
  probability: Probability;
  message: NonEmptyAdviceMessage;
}>;

type ReviewCorrelation = Readonly<{
  workItem: ReviewWorkItemId;
  projection: ReviewProjectionFingerprint;
}>;

type ReviewResult =
  | (ReviewCorrelation &
      Readonly<{
        status: "reviewed";
        answers: NonEmptyArray<RuleAnswer>;
        advice: readonly Advice[];
      }>)
  | (ReviewCorrelation &
      Readonly<{
        status: "unavailable";
        reason:
          | "backendUnavailable"
          | "invalidResponse"
          | "missingCredentials"
          | "reviewTimeout"
          | "staleSource";
        retryable: boolean;
      }>);

type AdviceBatch = Readonly<{
  observation: ObservationId;
  results: NonEmptyArray<ReviewResult>;
}>;

type QueueLimit = "items" | "retainedBytes";

type QueueAdmission =
  | Readonly<{ status: "accepted" }>
  | Readonly<{ status: "full"; limit: QueueLimit }>;

type SizedReviewWorkItem = Readonly<{
  item: ReviewWorkItem;
  retainedBytes: RetainedByteCount;
}>;

type SizedReviewResult = Readonly<{
  result: ReviewResult;
  retainedBytes: RetainedByteCount;
}>;

// Smart constructors enforce what structural TypeScript cannot: each source
// matches its fingerprint; a ChangeSet is created only after stable capture;
// every artifact is expanded exactly once; included targets resolve within the
// unit; omitted references carry no source; projection/work-item fingerprints
// are canonical; rule answers match the frozen rule set; result correlation
// matches the originating work item; and each AdviceBatch contains results for
// one observation with unique work-item identities.
