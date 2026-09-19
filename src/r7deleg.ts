/**
 * E37 — two proposals from the outside review of E36, each against its own falsifier.
 *
 * (1) r7 with a "delegation" criterion on the false side: a field whose declared type
 *     is itself a name making the same claim has delegated the claim to that type's
 *     declaration, where the question applies instead. Predicted: LoanMath <= 0.25,
 *     every fault cell moves < 0.05. Falsified by LoanMath >= 0.40 or any fault < 0.75.
 *
 * (2) r8 asked of a callable's *name* rather than its body, so the contradiction sits
 *     inside the artifact and an interface can be judged. Predicted: the `Promise`
 *     repository 0.65-0.80, the `Effect` one <= 0.20. Falsified by the first < 0.50
 *     (the case is unrecoverable) or the second > 0.35 (it fires on declared effects).
 *
 *   bun run src/r7deleg.ts
 */
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { decide, Live, probability } from "./jev-decision.ts";

import { E0 } from "./questions.ts";

const r7 = E0.r7_name_wider_than_type;

const R7_DELEG = probability(
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
      what: "Each field's declared type admits only what its name claims, or the name claims nothing more than the type already says, or the claim is delegated: the declared type is itself a name stating the same claim the field's name makes, so this question applies to that type's declaration rather than here",
      examples: [
        "a code is a type refined to reject the empty string",
        "a count is a type refined to whole numbers not below zero",
        "a set of known values is a union of exactly those values",
        "a column carries a constraint stating the values it accepts",
        "free text such as a title or a body is typed as text, because any text is genuinely allowed",
        "a duration named `term` typed `Days`, a rate named `rate` typed `FeePerDay` — the type's own name carries the claim, and whether it is refined is settled where that type is declared",
      ],
    },
  },
);

const R8_NAME = probability(
  {
    question:
      "Does `artifact` declare a callable whose own name claims a read or a write of a resource — saving, fetching, finding, sending, deleting, renewing — that its parameters and return type do not mention?",
    focus:
      "A name that states only a computation claims nothing: computing, checking, formatting. The finding is a name that reaches past its arguments — a store it saves to, a source it finds in, a channel it sends over — while the declaration names no store, client, or channel among its parameters, and no requirements or error channel stating one in its return type.",
  },
  {
    true: {
      what: "A callable's name claims an effect on a resource its declaration never mentions",
      examples: [
        "`save(x): Promise<void>` — a write with no store in sight",
        "`findById(id): Promise<T | null>` — a read from an unnamed source",
        "`send(msg): void` — a transmission with no channel",
      ],
    },
    false: {
      what: "Each callable's declaration accounts for what its name claims, or no name claims a resource",
      examples: [
        "the store, client, or clock the name implies appears as a parameter",
        "the return type's requirements or error channel names the resource, as `Effect<T, E, Database>`",
        "the name claims only a computation over the arguments given",
      ],
    },
  },
);

const QUESTIONS = { r7, r7d: R7_DELEG, r8n: R8_NAME };

type Case = { label: string; domain: string; role: string; source: string };

const CASES: Case[] = [
  {
    label: "LoanMath, opaque named types",
    domain: "loan-math.ts",
    role: "r7 target",
    source: `export interface LoanMath {
  readonly dueDate: (issuedAt: Instant, term: Days) => Instant;
  readonly isOverdue: (due: Instant, now: Instant) => boolean;
  readonly fee: (overdueBy: Days, rate: FeePerDay) => Money;
}`,
  },
  {
    label: "RecItem bare",
    domain: "complete-the-look.ts",
    role: "r7 guard",
    source: `export type RecItem = {
  sku: string;
  url: string;
  title: string;
  brand: string;
  image: { url: string; alt: string };
  price: { amount: number; currency: string; formatted: string };
};`,
  },
  {
    label: "float seconds, int retries",
    domain: "transcribe-options.ts",
    role: "r7 guard",
    source: `export type TranscribeOptions = {
  minSegmentDurationSeconds: number;
  maxRetries: number;
  outputFormat: string;
};`,
  },
  {
    label: "DDL without constraints",
    domain: "catalog.sql",
    role: "r7 guard",
    source: `CREATE TABLE catalog_item(
  sku TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  stock_count INTEGER NOT NULL
);`,
  },
  {
    label: "branded but unrefined",
    domain: "library-loan.ts",
    role: "r7 guard",
    source: `export type LoanId = string & Brand.Brand<"LoanId">;
export type MemberId = string & Brand.Brand<"MemberId">;

export type Loan = {
  loanId: LoanId;
  memberId: MemberId;
  renewalCount: number;
  dueInDays: number;
};`,
  },
  {
    label: "the escape hatch: a well-named bare alias",
    domain: "catalog-types.ts",
    role: "r7 cost",
    source: `export type Sku = string;
export type PriceCents = number;

export type CatalogItem = {
  sku: Sku;
  priceCents: PriceCents;
};`,
  },
  {
    label: "iface — Promise, effects unstated",
    domain: "loan-repository.ts",
    role: "r8n target",
    source: `export interface LoanRepository {
  findById(loanId: LoanId): Promise<Loan | null>;
  save(loan: Loan): Promise<void>;
  renew(loanId: LoanId, extraDays: Days): Promise<Loan>;
}`,
  },
  {
    label: "iface — Effect, effects declared",
    domain: "loan-repository.ts",
    role: "r8n guard",
    source: `export interface LoanRepository {
  readonly findById: (loanId: LoanId) => Effect.Effect<Option<Loan>, DbError, Database>;
  readonly save: (loan: Loan) => Effect.Effect<void, DbError, Database>;
  readonly renew: (loanId: LoanId, extraDays: Days) => Effect.Effect<Loan, DbError | Expired, Database | Clock>;
}`,
  },
  {
    label: "iface — pure computation",
    domain: "loan-math.ts",
    role: "r8n guard",
    source: `export interface LoanMath {
  readonly dueDate: (issuedAt: Instant, term: Days) => Instant;
  readonly isOverdue: (due: Instant, now: Instant) => boolean;
  readonly fee: (overdueBy: Days, rate: FeePerDay) => Money;
}`,
  },
  {
    label: "plain data shape",
    domain: "note.ts",
    role: "r8n guard",
    source: `export type Note = {
  id: NoteId;
  title: string;
  body: string;
  createdAt: Instant;
};`,
  },
  {
    label: "body — hidden gpu and bucket",
    domain: "parakeet-transcriber.py",
    role: "body",
    source: `def transcribe(audio_path: str) -> str:
    model = AsrModel.from_pretrained(MODEL_NAME).to("cuda")
    text = model.transcribe(audio_path)
    boto3.client("s3").put_object(
        Bucket=settings.TRANSCRIPT_BUCKET, Key=f"{uuid.uuid4()}.txt", Body=text
    )
    return text`,
  },
  {
    label: "body — the same, dependencies named",
    domain: "parakeet-transcriber.py",
    role: "body",
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
    label: "body — implicit clock",
    domain: "session-expiry.ts",
    role: "body",
    source: `export const isExpired = (session: Session): boolean =>
  Date.now() > session.issuedAtMs + SESSION_TTL_MS;`,
  },
  {
    label: "body — pure function of arguments",
    domain: "session-expiry.ts",
    role: "body",
    source: `export const isExpired = (session: Session, now: Instant): boolean =>
  Instant.after(now, Instant.add(session.issuedAt, SESSION_TTL));`,
  },
];

const REPEATS = 3;

const program = Effect.gen(function* () {
  const rs = yield* Effect.forEach(
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
          r7: answers.r7.probability,
          r7d: answers.r7d.probability,
          r8n: answers.r8n.probability,
        };
      }),
    { concurrency: 4 },
  );
  process.stderr.write("\n");

  console.log("  r7    r7d      Δ    r8n   role        artifact");
  for (const c of CASES) {
    const mine = rs.filter((r) => r.c.label === c.label);
    const avg = (f: (r: (typeof mine)[number]) => number) =>
      mine.reduce((s, r) => s + f(r), 0) / mine.length;
    const a = avg((r) => r.r7);
    const b = avg((r) => r.r7d);
    const n = avg((r) => r.r8n);
    console.log(
      `${a.toFixed(3)} ${b.toFixed(3)}  ${(b - a >= 0 ? "+" : "") + (b - a).toFixed(2)}  ` +
        `${n.toFixed(3)}  ${c.role.padEnd(10)}  ${c.label}`,
    );
  }
});

Effect.runPromise(
  program.pipe(Effect.provide(Live)),
);
