/**
 * scan.ts for files the walker does not reach: the paths are given, the text goes in
 * verbatim, the ranking is the same. `bun run src/scan-files.ts <file>...`
 *
 * The E0 questions name no language — they ask what a shape admits and what a callable
 * reaches for — so a Bend, SQL or Haskell file is as readable as a TypeScript one. The
 * rung is still computed by `levelOf`, which sees no `Schema.Struct` here and reads 2
 * (typed), the rung every rule but r1/r2/r4 was measured from.
 */
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { basename } from "node:path";

import { E0, NOUL_KEYS, band, levelOf, LEVEL_NAME, measured } from "./questions.ts";
import { decide, Live } from "./jev-decision.ts";

const tokens = (text: string) => Math.ceil(text.length / 4);
const MAX_TOKENS = 8_000;

const scoreOne = (file: string, text: string) =>
  Effect.gen(function* () {
    const { answers } = yield* decide({
      state: { artifact: { domain: basename(file), source: text } },
      decisions: E0,
    }).pipe(Effect.retry({ times: 4, schedule: Schedule.exponential(2000) }));

    const nouls: Record<string, number> = {};
    for (const key of NOUL_KEYS) {
      nouls[key] = answers[key].probability;
    }
    process.stderr.write(".");
    const applicable = NOUL_KEYS.filter((k) => measured(k, text));
    return {
      file: basename(file),
      level: levelOf(text),
      worst: applicable.length === 0 ? 0 : Math.max(...applicable.map((k) => nouls[k]!)),
      nouls,
    };
  });

const program = Effect.gen(function* () {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error("usage: bun run src/scan-files.ts <file>...");
    return;
  }

  const picked: { file: string; text: string }[] = [];
  for (const file of paths) {
    const text = yield* Effect.promise(() => Bun.file(file).text());
    if (tokens(text) > MAX_TOKENS) {
      console.error(`skipped as oversized (${tokens(text)} tokens): ${file}`);
      continue;
    }
    picked.push({ file, text });
  }

  const scored = yield* Effect.forEach(picked, (c) => scoreOne(c.file, c.text), {
    concurrency: 8,
  });
  process.stderr.write("\n");

  const ranked = [...scored].sort((a, b) => b.worst - a.worst);

  console.log("\nrank  worst   r1    r2    r3    r4    r5    r6    r7    r8    r9   rung    file");
  ranked.forEach((r, i) => {
    const n = (k: string) => r.nouls[k]!.toFixed(2);
    console.log(
      `${String(i + 1).padStart(4)}   ${r.worst.toFixed(2)}  ` +
        `${n("r1_inferred_case")}  ${n("r2_meaningless_combinations")}  ` +
        `${n("r3_split_correlations")}  ${n("r4_duplicate_encoding")}  ${n("r5_absence_confusion")}  ` +
        `${n("r6_bare_domain_value")}  ${n("r7_name_wider_than_type")}  ` +
        `${n("r8_name_claims_resource")}  ${n("r9_body_reaches_undeclared")}  ` +
        `${r.level} ${LEVEL_NAME[r.level].padEnd(6)} ` +
        r.file,
    );
  });

  const flags = (k: string) => ranked.filter((r) => band(r.nouls[k]!) === "violation").length;
  console.log(
    `\n${ranked.filter((r) => r.worst > 0.7).length} of ${ranked.length} with a rule in the violation band. ` +
      NOUL_KEYS.map((k) => `${k.slice(0, 2)} flags ${flags(k)}`).join(", ") +
      ".",
  );
  console.log("Order is the finding; the bands are not calibrated (§8).");
});

Effect.runPromise(program.pipe(Effect.provide(Live)));
