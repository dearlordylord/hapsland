/**
 * E36 — rule 7 (a type admits what its own name forbids) and a first look at
 * rule 8 (a signature that does not say what it touches).
 *
 * r7 is the widening half of primitive obsession: not "is this a bare primitive"
 * (r6) but "does the declared type admit values the field's own name rules out".
 * The two are orthogonal — `sku: Sku` satisfies r6 and still fails r7 if `Sku`
 * is an unrefined string.
 *
 * r8 asks a different kind of artifact: a callable's declaration rather than a
 * data shape. It is measured on the same cells, so the plain data shapes double
 * as its false side — if r8 fires on `Loan`, it is not a rule about signatures.
 *
 *   bun run src/r7probe.ts
 */
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { decide, Live, probability } from "./jev-decision.ts";

// ── r7, wording A: the field read against its own name ──────────────────────
const R7_A = probability(
  {
    question:
      "Does `artifact` declare a field or parameter whose own name states what it holds, while its declared type still admits values that name rules out?",
    focus:
      "Breadth is not the finding. A type is right to be broad where the domain really accepts anything: free text, a note, a comment. The finding is a name that makes a claim — a count, a price, a duration, a URL, a file extension, a code, a percentage — carried by a type that admits values contradicting the claim: the empty string where a code is meant, a negative or fractional value where a count is meant, any text at all where one of a few spellings is meant. The notation in use must be able to say it: a refinement, a constraint, a narrower type, a union of the values actually allowed.",
  },
  {
    true: {
      what: "A field's name states what it holds, and its declared type admits values that contradict the name",
      examples: [
        "a field named for a code or an identifier typed as text, so the empty string is admissible",
        "a count or a quantity typed as a general number, so negative and fractional values are admissible",
        "a field named for a link typed as text, so any text at all is a link",
        "a field named for one of a few known values typed as text, so any spelling is admissible",
        "a monetary amount typed as a floating-point number, so fractions of the smallest unit are admissible",
      ],
    },
    false: {
      what: "Each field's declared type admits only what its name claims, or the name claims nothing more than the type already says",
      examples: [
        "a code is a type refined to reject the empty string",
        "a count is a type refined to whole numbers not below zero",
        "a set of known values is a union of exactly those values",
        "a column carries a constraint stating the values it accepts",
        "free text such as a title or a body is typed as text, because any text is genuinely allowed",
      ],
    },
  },
);

// ── r7, wording B: the same, framed as what the shape admits ────────────────
const R7_B = probability(
  {
    question:
      "Can `artifact` be given a value that satisfies its declared types and still means nothing in the domain of `artifact.domain` — a value its own field names say is not allowed?",
    focus:
      "Every type admits values a program would reject somewhere; that is not the finding. The finding is a value admitted by the declaration itself that the field's name already forbids — an empty identifier, a negative count, a price with fractions of the smallest unit, a link that is not a link, a spelling outside a fixed set — where the notation in use could have ruled it out with a refinement, a constraint or a narrower type. A field whose name promises nothing beyond its type is not a finding.",
  },
  {
    true: {
      what: "A value satisfying every declared type in the shape is still nonsense by the field names' own claims",
      examples: [
        "a field named for a code or an identifier typed as text, so the empty string is admissible",
        "a count or a quantity typed as a general number, so negative and fractional values are admissible",
        "a field named for a link typed as text, so any text at all is a link",
        "a field named for one of a few known values typed as text, so any spelling is admissible",
        "a monetary amount typed as a floating-point number, so fractions of the smallest unit are admissible",
      ],
    },
    false: {
      what: "Anything the declaration admits is a value the domain accepts",
      examples: [
        "a code is a type refined to reject the empty string",
        "a count is a type refined to whole numbers not below zero",
        "a set of known values is a union of exactly those values",
        "a column carries a constraint stating the values it accepts",
        "free text such as a title or a body is typed as text, because any text is genuinely allowed",
      ],
    },
  },
);

// ── r8: what a callable touches, absent from its declaration ────────────────
const R8 = probability(
  {
    question:
      "Does `artifact` declare a callable whose body reaches for a resource or a change of state that its own parameters and return type do not mention?",
    focus:
      "Doing work is not the finding, and neither is a shape that declares no callable at all — a record of fields has nothing to reach for. The finding is a declaration that reads as a function of its arguments while the body reads a clock, a filesystem, a network, a device, a global or an enclosing object, or writes to one. A callable that takes what it touches as an argument, or states the effect in its return type, is not a finding, however much work it does.",
  },
  {
    true: {
      what: "A callable's parameters and return type do not account for something its body reads or writes",
      examples: [
        "a function taking a path and returning text while its body uploads to remote storage",
        "a function whose result depends on the current time, with no time among its parameters",
        "a method that reads or mutates the object it hangs off while its parameters mention none of it",
        "a function that selects a device or an accelerator its declaration never names",
        "a procedure that leaves the object it was called on in a different state, returning nothing that says so",
      ],
    },
    false: {
      what: "Everything a callable reaches for appears in its declaration, or the artifact declares no callable",
      examples: [
        "a function receives the client, the clock or the writer it uses as a parameter",
        "a function's return type states the effect it performs and the resources it needs",
        "a pure function of its arguments, returning a value computed from them alone",
        "a record or a table of fields, which calls nothing",
      ],
    },
  },
);

const QUESTIONS = { r7a: R7_A, r7b: R7_B, r8: R8 };

type Kind = "r7-fault" | "r7-clean" | "r8-fault" | "r8-clean" | "both" | "quiet";
type Case = { label: string; domain: string; kind: Kind; source: string };

const CASES: Case[] = [
  // ── r7 faults ────────────────────────────────────────────────────────────
  {
    label: "boundary primitives (PR#1)",
    domain: "complete-the-look.ts",
    kind: "r7-fault",
    source: `export type RecItem = {
  sku: string;
  url: string;
  title: string;
  brand: string;
  image: { url: string; alt: string };
  price: { amount: number; currency: string; formatted: string };
};

export type RecsResponse = { items: RecItem[] };`,
  },
  {
    label: "float seconds, int retries",
    domain: "transcribe-options.ts",
    kind: "r7-fault",
    source: `export type TranscribeOptions = {
  minSegmentDurationSeconds: number;
  maxRetries: number;
  outputFormat: string;
};`,
  },
  {
    label: "extension claimed by a name",
    domain: "upload-handler.py",
    kind: "r7-fault",
    source: `@dataclass
class Upload:
    audio_filename: str
    audio_extension: str
    size_bytes: int
    sample_rate_hz: int`,
  },
  {
    label: "DDL without constraints",
    domain: "catalog.sql",
    kind: "r7-fault",
    source: `CREATE TABLE catalog_item(
  sku TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  stock_count INTEGER NOT NULL
);`,
  },

  // ── r7 clean ─────────────────────────────────────────────────────────────
  {
    label: "the same boundary, refined",
    domain: "complete-the-look.ts",
    kind: "r7-clean",
    source: `const Currency = Schema.Literals(["USD", "EUR", "GBP"]);

export const RecItem = Schema.Struct({
  sku: Schema.NonEmptyString.pipe(Schema.brand("Sku")),
  url: HttpUrl,
  title: Schema.String,
  brand: Schema.NonEmptyString,
  price: Schema.Struct({
    amountCents: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
    currency: Currency,
  }),
});`,
  },
  {
    label: "DDL with constraints",
    domain: "catalog.sql",
    kind: "r7-clean",
    source: `CREATE TABLE catalog_item(
  sku TEXT PRIMARY KEY CHECK (length(sku) > 0),
  url TEXT NOT NULL CHECK (url LIKE 'https://%'),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('USD','EUR','GBP')),
  stock_count INTEGER NOT NULL CHECK (stock_count >= 0)
);`,
  },
  {
    label: "free text",
    domain: "note.ts",
    kind: "quiet",
    source: `export type Note = {
  id: NoteId;
  title: string;
  body: string;
  createdAt: Instant;
};`,
  },
  {
    label: "tagged union, nothing shared",
    domain: "pointer-command.ts",
    kind: "quiet",
    source: `export type PointerCommand =
  | { readonly kind: "down"; readonly at: Point }
  | { readonly kind: "move"; readonly to: Point }
  | { readonly kind: "up" };`,
  },
  {
    label: "branded but unrefined",
    domain: "library-loan.ts",
    kind: "r7-fault",
    source: `export type LoanId = string & Brand.Brand<"LoanId">;
export type MemberId = string & Brand.Brand<"MemberId">;

export type Loan = {
  loanId: LoanId;
  memberId: MemberId;
  renewalCount: number;
  dueInDays: number;
};`,
  },

  // ── r8 faults ────────────────────────────────────────────────────────────
  {
    label: "hidden gpu and bucket",
    domain: "parakeet-transcriber.py",
    kind: "r8-fault",
    source: `def transcribe(audio_path: str) -> str:
    model = AsrModel.from_pretrained(MODEL_NAME).to("cuda")
    text = model.transcribe(audio_path)
    boto3.client("s3").put_object(
        Bucket=settings.TRANSCRIPT_BUCKET, Key=f"{uuid.uuid4()}.txt", Body=text
    )
    return text`,
  },
  {
    label: "the same, dependencies named",
    domain: "parakeet-transcriber.py",
    kind: "r8-clean",
    source: `def transcribe(
    audio_path: str,
    model: AsrModel,
    put_transcript: Callable[[str], None],
) -> str:
    text = model.transcribe(audio_path)
    put_transcript(text)
    return text`,
  },
  {
    label: "method ignoring self",
    domain: "markup-client.py",
    kind: "r8-fault",
    source: `class HulyClient:
    def to_markup(self, text: str) -> Markup:
        return Markup(markdown_to_markup(text))`,
  },
  {
    label: "two-phase construction",
    domain: "segmenter.py",
    kind: "r8-fault",
    source: `class Segmenter:
    def __init__(self, audio_path: str) -> None:
        self.audio_path = audio_path
        self.segments = []

    def prepare(self) -> None:
        self.audio = load_audio(self.audio_path)
        self.segments = detect_speech(self.audio)

    def batch(self, max_duration: int) -> list[Segment]:
        return batch_segments(self.segments, max_duration)`,
  },
  {
    label: "implicit clock",
    domain: "session-expiry.ts",
    kind: "r8-fault",
    source: `export const isExpired = (session: Session): boolean =>
  Date.now() > session.issuedAtMs + SESSION_TTL_MS;`,
  },
  {
    label: "pure function of arguments",
    domain: "session-expiry.ts",
    kind: "r8-clean",
    source: `export const isExpired = (session: Session, now: Instant): boolean =>
  Instant.after(now, Instant.add(session.issuedAt, SESSION_TTL));`,
  },


  // ── r8 on declarations without bodies: interfaces and schemas ────────────
  {
    label: "iface — methods, effects unstated",
    domain: "loan-repository.ts",
    kind: "r8-fault",
    source: `export interface LoanRepository {
  findById(loanId: LoanId): Promise<Loan | null>;
  save(loan: Loan): Promise<void>;
  renew(loanId: LoanId, extraDays: Days): Promise<Loan>;
}`,
  },
  {
    label: "iface — effects in the return type",
    domain: "loan-repository.ts",
    kind: "r8-clean",
    source: `export interface LoanRepository {
  readonly findById: (loanId: LoanId) => Effect.Effect<Option<Loan>, DbError, Database>;
  readonly save: (loan: Loan) => Effect.Effect<void, DbError, Database>;
  readonly renew: (loanId: LoanId, extraDays: Days) => Effect.Effect<Loan, DbError | Expired, Database | Clock>;
}`,
  },
  {
    label: "iface — pure data operations",
    domain: "loan-math.ts",
    kind: "r8-clean",
    source: `export interface LoanMath {
  readonly dueDate: (issuedAt: Instant, term: Days) => Instant;
  readonly isOverdue: (due: Instant, now: Instant) => boolean;
  readonly fee: (overdueBy: Days, rate: FeePerDay) => Money;
}`,
  },
  {
    label: "schema with a declared effect field",
    domain: "job.ts",
    kind: "quiet",
    source: `export const Job = Schema.Struct({
  id: JobId,
  submittedAt: Schema.Instant,
  attempts: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
  status: Schema.Literals(["queued", "running", "done"]),
});`,
  },
  // ── both faults at once, to see whether they separate ────────────────────
  {
    label: "both — hidden clock and bare count",
    domain: "quota.ts",
    kind: "both",
    source: `export const remainingQuota = (userId: string): number => {
  const used = quotaStore.get(userId) ?? 0;
  return DAILY_LIMIT - used;
};`,
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
          r7a: answers.r7a.probability,
          r7b: answers.r7b.probability,
          r8: answers.r8.probability,
        };
      }),
    { concurrency: 4 },
  );
  process.stderr.write("\n");

  const mark = (v: number) => (v > 0.7 ? "*" : v < 0.3 ? " " : "?");
  console.log(" r7a    r7b     r8    kind        artifact");
  for (const c of CASES) {
    const mine = results.filter((r) => r.c.label === c.label);
    const avg = (f: (r: (typeof mine)[number]) => number) =>
      mine.reduce((s, r) => s + f(r), 0) / mine.length;
    const a = avg((r) => r.r7a);
    const b = avg((r) => r.r7b);
    const e = avg((r) => r.r8);
    console.log(
      `${mark(a)}${a.toFixed(3)} ${mark(b)}${b.toFixed(3)} ${mark(e)}${e.toFixed(3)}  ` +
        `${c.kind.padEnd(10)}  ${c.label}`,
    );
  }
});

Effect.runPromise(
  program.pipe(Effect.provide(Live)),
);
