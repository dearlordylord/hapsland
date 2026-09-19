import * as Schema from "effect/Schema";

export class SnapshotError extends Schema.TaggedError<SnapshotError>()(
  "SnapshotError",
  {
    path: Schema.String,
    reason: Schema.String,
  },
) {}

export class BackendError extends Schema.TaggedError<BackendError>()(
  "BackendError",
  {
    reason: Schema.String,
    retryable: Schema.Boolean,
  },
) {}

export class AssessmentError extends Schema.TaggedError<AssessmentError>()(
  "AssessmentError",
  {
    reason: Schema.String,
  },
) {}

export class ProtocolError extends Schema.TaggedError<ProtocolError>()(
  "ProtocolError",
  {
    reason: Schema.String,
  },
) {}
