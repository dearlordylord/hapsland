/**
 * E33 — the rules against shapes a human reviewer actually objected to.
 *
 * Every artifact below is code from a pull request, with the reviewer's own
 * comment recorded beside it. Where the review changed the code, both halves are
 * here: `*_asProposed` is what the PR carried, `*_asMerged` what landed.
 *
 *   bun run src/prcheck.ts
 */
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

import { E0, NOUL_KEYS, band, levelOf, LEVEL_NAME, measured } from "./questions.ts";
import { decide, Live } from "./jev-decision.ts";

type Case = {
  readonly label: string;
  readonly domain: string;
  readonly source: string;
  /** What the reviewer said, and which rule it sounds like. Never sent. */
  readonly objection: string;
  readonly expect: string;
};

const CASES: Case[] = [
  // ── GreyhavenHQ/reflector#470 — nullable columns on a consent row ──────────
  {
    label: "consent, as proposed",
    domain: "meeting_consent.py",
    source: `meeting_consent = sa.Table(
    "meeting_consent",
    metadata,
    sa.Column("id", sa.String, primary_key=True),
    sa.Column(
        "meeting_id",
        sa.String,
        sa.ForeignKey("meeting.id", ondelete="CASCADE"),
        nullable=True,
    ),
    sa.Column("user_id", sa.String, nullable=True),
    sa.Column("consent_given", sa.Boolean, nullable=True),
    sa.Column("consent_timestamp", sa.DateTime(timezone=True), nullable=True),
)`,
    objection:
      "meeting consent without a meeting id — can that be possible? and consent_given = null: consent is either given or not; no consent at all means no row",
    expect: "r5, maybe r2",
  },
  {
    label: "consent, as merged",
    domain: "meeting_consent.py",
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
    objection: "the shape the reviewer asked for",
    expect: "clear",
  },

  // ── Monadical-SAS/stacker-scaffold-node#8 — two optional names, one meant ──
  {
    label: "redirect, two optional names",
    domain: "use-redirect-to-game.ts",
    source: `export const useRedirectToGame = () =>
  useCallback(
    (gameId: GameId, playerOneName?: PlayerName, playerTwoName?: PlayerName) => {
      if (playerOneName !== undefined) {
        router.push(\`/game/\${gameId}/\${playerOneName}\`);
      } else if (playerTwoName !== undefined) {
        fetch("/api/game/setPlayerTwo", {
          method: "POST",
          body: JSON.stringify({ playerTwo: playerTwoName, gameId }),
        });
      }
    },
    [router],
  );`,
    objection:
      "would player two be able to join again? would this mean player two's name can be changed but player one's cannot?",
    expect: "r1 — which of two operations this is, recoverable only from which name is present",
  },

  // ── stacker-scaffold-node#8 — state the caller restates ───────────────────
  {
    label: "move, caller supplies turn and mode",
    domain: "game-context.tsx",
    source: `const move = useCallback(
  (coords: Coords, currentPlayer: Player, gameType: GameType) => {
    setIsMoving(true);
    setMoveError(undefined);
    const playerTurn = gameType === "automatic" ? currentPlayer : player;
    fetch("/api/game/move", {
      body: JSON.stringify({ coords, player: playerTurn, gameId: id }),
    });
  },
  [id, player],
);`,
    objection:
      "during one game the game type can be changed between turns; and a player can move out of their order — this notation lets me call it with either player at the same state",
    expect: "r4 — both facts are already held elsewhere, so a second copy can disagree",
  },

  // ── stacker-scaffold-node#7 — two ways to say no name ─────────────────────
  {
    label: "player name, empty or absent",
    domain: "home.tsx",
    source: `type PlayerForm = {
  playerForExistingGame?: PlayerName | "";
  playerForNewGame?: PlayerName | "";
};

const handleRedirect = (form: PlayerForm) => {
  if (form.playerForExistingGame === "" || form.playerForExistingGame === undefined) {
    return;
  }
  redirectToGame(idOfExistingGame as GameId, undefined, form.playerForExistingGame);
};`,
    objection: "note: these are never undefined",
    expect: "r5 — empty string and absent are two encodings of one state",
  },

  // ── stacker-scaffold-node#4 — a display name used as identity ─────────────
  {
    label: "display name as identity",
    domain: "game-api-types.ts",
    source: `export type PlayerName = string;

export interface GameResponse {
  field: Field;
  currentPlayer: PlayerName;
  possibleCoords: PossibleCoords;
  gameId: GameId;
}`,
    objection: "a bit cleaner from a data perspective would be to leave it 1/2, or an enum, here",
    expect: "nothing in the set — candidate for a new rule",
  },

  // ── GreyhavenHQ/reflector#540 — a pair of bare floats ─────────────────────
  {
    label: "speech segments as bare tuples",
    domain: "parakeet-transcriber.py",
    source: `def batch_speech_segments(
    segments: Generator[tuple[float, float]], max_duration: int
) -> Generator[tuple[float, float]]:
    ...


def transcribe(audio_path: str) -> tuple[str, str]:
    unique_filename = f"{uuid.uuid4()}.{audio_suffix}"
    ...`,
    objection:
      "not clear what tuple[str, str] is — have to read the function. alias it to tuple[ParakeetUniqFilename, AudioFileExtension], a NewType, to signify it is not a string any more",
    expect: "r3 on the float pair — candidate for a new rule on the string pair",
  },

  // ── dearlordylord/complete-the-look-pr#1 — primitives at a boundary ───────
  {
    label: "boundary primitives",
    domain: "complete-the-look.ts",
    source: `export type RecItem = {
  sku: string;
  url: string;
  title: string;
  brand: string;
  image: { url: string; alt: string };
  price: { amount: number; currency: string; formatted: string };
};

export type RecsResponse = { items: RecItem[] };`,
    objection:
      "every boundary type lies about what values are legal: sku admits '', url admits javascript:, price.amount admits negatives, NaN and fractional cents, brand admits ''",
    expect: "r4 on amount/formatted — candidate for a new rule on the rest",
  },
];

const run = (c: Case) =>
  Effect.gen(function* () {
    const { answers } = yield* decide({
      state: { artifact: { domain: c.domain, source: c.source } },
      decisions: E0,
    }).pipe(Effect.retry({ times: 4, schedule: Schedule.exponential(2000) }));
    const nouls: Record<string, number> = {};
    for (const k of NOUL_KEYS) nouls[k] = answers[k].probability;
    process.stderr.write(".");
    return { c, nouls, level: levelOf(c.source) };
  });

const REPEATS = 3;

const program = Effect.gen(function* () {
  const results = yield* Effect.forEach(
    CASES.flatMap((c) => Array.from({ length: REPEATS }, () => c)),
    run,
    { concurrency: 4 },
  );
  process.stderr.write("\n");

  console.log("  r1    r2    r3    r4    r6    r7    r5   rung    artifact");
  for (const c of CASES) {
    const mine = results.filter((r) => r.c.label === c.label);
    const mean = (k: string) => mine.reduce((s, r) => s + r.nouls[k]!, 0) / mine.length;
    const cell = (k: string) => {
      const v = mean(k);
      const s = v.toFixed(2);
      return measured(k, c.source) ? (band(v) === "violation" ? `*${s}` : ` ${s}`) : ` --- `;
    };
    console.log(
      `${cell("r1_inferred_case")} ${cell("r2_meaningless_combinations")} ` +
        `${cell("r3_split_correlations")} ${cell("r4_duplicate_encoding")} ` +
        `${cell("r6_bare_domain_value")} ${cell("r7_name_wider_than_type")} ` +
        `${cell("r5_absence_confusion")}   ${mine[0]!.level} ${LEVEL_NAME[mine[0]!.level].padEnd(6)} ${c.label}`,
    );
    console.log(`                                              said: ${c.objection}`);
    console.log(`                                              want: ${c.expect}\n`);
  }
});

Effect.runPromise(
  program.pipe(Effect.provide(Live)),
);
