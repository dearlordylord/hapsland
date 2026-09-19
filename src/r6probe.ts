/**
 * E35 — rule 6 against the storage/logic distinction.
 *
 * A primitive is how a value is written down. Where a shape's job is storage or
 * transport — a table, a row, a wire message, a memory layout — a column typed
 * for its encoding is not a claim about meaning, and the rule should not fire.
 * Where the shape carries domain logic, it is.
 *
 * Two wordings, measured together: the rule as E34 left it, and the same with one
 * exonerating sentence in `focus`. Cells are storage shapes that must go quiet,
 * logic shapes that must fire, logic shapes that must stay quiet, and one trap —
 * a logic signature in a file named for persistence — to show which way it fails.
 *
 *   bun run src/r6probe.ts
 */
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { decide, Live, probability } from "./jev-decision.ts";

const QUESTION =
  "Does `artifact` carry something the domain of `artifact.domain` treats as its own kind of thing as a bare primitive, so that any value of that primitive would fit where it belongs?";

const FOCUS_BASE =
  "A field typed `string` or `number` is not the finding; most fields bottom out in primitives and most of them should. The finding is a value with a meaning of its own in the domain — an identity, a locator, a revision, a quantity whose unit matters, a member of a fixed set — represented so that nothing distinguishes it from any other value of the same primitive.";

const STORAGE_CLAUSE =
  " A shape whose subject is how values are stored or transmitted — a table, a column, a row, a wire message, a memory layout — states an encoding rather than a meaning, and a primitive is the right thing to find there.";

const CRITERIA = {
  true: {
    what: "Something the domain names as its own kind of thing is written as a bare primitive, so a value meaning something else entirely fits where it belongs",
    examples: [
      "two identifiers for different kinds of thing both typed plain `string`, so either fits wherever the other is expected",
      "a pair of bare strings returned together, told apart only by their position",
      "a duration carried as a bare number, with nothing saying whether it counts seconds or milliseconds",
      "a display name standing in for the identity of the thing it names, both being strings",
      "a fixed set of roles carried as `string`, so any spelling at all is admissible",
    ],
  },
  false: {
    what: "Each thing the domain names has a type of its own, and a bare primitive appears only where any value of it would genuinely do",
    examples: [
      "identifiers for two kinds of thing are distinct branded types over string",
      "a duration is a type that carries its unit rather than a loose number",
      "a fixed set of values is a literal union derived from one declared list",
      "free text such as a title or a note is typed `string`, because the domain really does accept any text there",
    ],
  },
} as const;


const QUESTION_KIMI =
  "Does `artifact` carry something the domain of `artifact.domain` treats as its own kind of thing as a bare primitive, in a shape where the domain's own distinctions are made — not a shape whose subject is how a value is written down or carried — so that any value of that primitive would fit where the thing belongs?";

const FOCUS_KIMI =
  "A field typed `string` or `number` is not the finding; most fields bottom out in primitives and most of them should. The finding is a value with a meaning of its own in the domain — an identity, a locator, a revision, a quantity whose unit matters, a member of a fixed set — represented so that nothing distinguishes it from any other value of the same primitive, in a shape that speaks the domain's own vocabulary. A shape whose subject is how values are stored or transmitted — a table or column definition, a row type mirroring one, a wire message, a memory layout — makes no domain distinctions: its primitives state an encoding, so the finding has nothing to be about. A shape that runs the domain's logic speaks the domain's vocabulary whatever its file is named.";

const CRITERIA_KIMI = {
  true: {
    what: "Something the domain names as its own kind of thing is written as a bare primitive in a shape where the domain's own distinctions live, so a value meaning something else entirely fits where it belongs",
    examples: CRITERIA.true.examples,
  },
  false: {
    what: "Each thing the domain names has a type of its own, or the bare primitives sit in a shape that only states how values are written down or carried, or the primitive is free text the domain genuinely accepts",
    examples: [
      ...CRITERIA.false.examples,
      "a table definition whose TEXT and INTEGER columns state how rows are stored",
      "a wire message whose string fields state how the values are carried between systems",
    ],
  },
} as const;

const QUESTIONS = {
  plain: probability({ question: QUESTION, focus: FOCUS_BASE }, CRITERIA),
  scoped: probability({ question: QUESTION, focus: FOCUS_BASE + STORAGE_CLAUSE }, CRITERIA),
  kimi: probability({ question: QUESTION_KIMI, focus: FOCUS_KIMI }, CRITERIA_KIMI),
};

type Kind = "storage" | "logic-fault" | "logic-clean" | "trap";
type Case = { label: string; domain: string; kind: Kind; source: string };

const CASES: Case[] = [
  // ── Storage. Must go quiet under the clause. ──────────────────────────────
  {
    label: "SQLAlchemy consent table",
    domain: "meeting_consent.py",
    kind: "storage",
    source: `meeting_consent = sa.Table(
    "meeting_consent",
    metadata,
    sa.Column("id", sa.String, primary_key=True),
    sa.Column(
        "meeting_id",
        sa.String,
        sa.ForeignKey("meeting.id", ondelete="CASCADE"),
        nullable=False,
    ),
    sa.Column("user_id", sa.String),
    sa.Column("consent_given", sa.Boolean, nullable=False),
    sa.Column("consent_timestamp", sa.DateTime(timezone=True), nullable=False),
)`,
  },
  {
    label: "sqlite DDL",
    domain: "artifact-index.sql",
    kind: "storage",
    source: `CREATE TABLE artifacts(
  sha256 TEXT PRIMARY KEY,
  byteLength INTEGER NOT NULL,
  mediaType TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE
);
CREATE TABLE runs(
  id INTEGER PRIMARY KEY,
  scenarioId TEXT,
  gitSha TEXT,
  startedAt TEXT,
  transcriptSha256 TEXT
);`,
  },
  {
    label: "wire message",
    domain: "recs-response.proto",
    kind: "storage",
    source: `message RecItem {
  string sku = 1;
  string url = 2;
  string title = 3;
  int64 price_cents = 4;
  string currency = 5;
}

message RecsResponse {
  repeated RecItem items = 1;
}`,
  },
  {
    label: "packed memory layout",
    domain: "frame-header.ts",
    kind: "storage",
    source: `/** Wire layout, little-endian, 16 bytes. Offsets are fixed by the protocol. */
export type FrameHeader = {
  magic: number;
  version: number;
  flags: number;
  payloadLength: number;
};`,
  },
  {
    label: "row type, no library in sight",
    domain: "artifact-index-row.ts",
    kind: "storage",
    source: `export type ArtifactRow = {
  sha256: string;
  byteLength: number;
  mediaType: string;
  path: string;
};`,
  },

  // ── Logic with the fault. Must keep firing under the clause. ──────────────
  {
    label: "loan, bare primitives",
    domain: "library-loan.ts",
    kind: "logic-fault",
    source: `export type Loan = {
  loanId: string;
  memberId: string;
  isbn: string;
  branchCode: string;
  dueIn: number;
  renewals: number;
};`,
  },
  {
    label: "display name as identity",
    domain: "game-api-types.ts",
    kind: "logic-fault",
    source: `export type PlayerName = string;

export interface GameResponse {
  field: Field;
  currentPlayer: PlayerName;
  possibleCoords: PossibleCoords;
  gameId: GameId;
}`,
  },
  {
    label: "two bare strings by position",
    domain: "parakeet-transcriber.py",
    kind: "logic-fault",
    source: `def transcribe(audio_path: str) -> tuple[str, str]:
    unique_filename = f"{uuid.uuid4()}.{audio_suffix}"
    return unique_filename, audio_suffix`,
  },

  // ── Logic without it. Must stay quiet under both. ─────────────────────────
  {
    label: "loan, things named",
    domain: "library-loan.ts",
    kind: "logic-clean",
    source: `export type Loan = {
  loanId: LoanId;
  memberId: MemberId;
  isbn: Isbn;
  branchCode: BranchCode;
  dueIn: Days;
  renewals: RenewalCount;
};`,
  },
  {
    label: "free text",
    domain: "note.ts",
    kind: "logic-clean",
    source: `export type Note = {
  id: NoteId;
  title: string;
  body: string;
  createdAt: Instant;
};`,
  },

  // ── The trap: domain logic under a name that says persistence. ────────────
  {
    label: "trap — logic in a repository file",
    domain: "loan-repository.ts",
    kind: "trap",
    source: `export const renewLoan = (
  loanId: string,
  memberId: string,
  extraDays: number,
): Promise<void> => { ... };

export const transferLoan = (
  loanId: string,
  fromBranch: string,
  toBranch: string,
): Promise<void> => { ... };`,
  },
];

const REPEATS = 3;

const program = Effect.gen(function* () {
  const results = yield* Effect.forEach(
    CASES.flatMap((c) => Array.from({ length: REPEATS }, () => c)),
    (c) =>
      Effect.gen(function* () {
        const { answers } = yield* decide({
          state: { artifact: { domain: c.domain, source: c.source } },
          decisions: QUESTIONS,
        }).pipe(Effect.retry({ times: 4, schedule: Schedule.exponential(2000) }));
        process.stderr.write(".");
        return {
          c,
          plain: answers.plain.probability,
          scoped: answers.scoped.probability,
          kimi: answers.kimi.probability,
        };
      }),
    { concurrency: 4 },
  );
  process.stderr.write("\n");

  console.log("plain  scoped   kimi      Δ   kind          artifact");
  for (const c of CASES) {
    const mine = results.filter((r) => r.c.label === c.label);
    const avg = (f: (r: (typeof mine)[number]) => number) =>
      mine.reduce((s, r) => s + f(r), 0) / mine.length;
    const p = avg((r) => r.plain);
    const s = avg((r) => r.scoped);
    const k = avg((r) => r.kimi);
    console.log(
      `${p.toFixed(3)}  ${s.toFixed(3)}  ${k.toFixed(3)}  ${(k - p >= 0 ? "+" : "") + (k - p).toFixed(2)}   ` +
        `${c.kind.padEnd(12)}  ${c.label}`,
    );
  }
});

Effect.runPromise(
  program.pipe(Effect.provide(Live)),
);
