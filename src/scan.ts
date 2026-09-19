/**
 * Ranked worklist: send each file of a directory to Jev verbatim and sort by its
 * worst rule.
 *
 *   bun run scan <dir> [--limit N]
 *
 * The whole idea is that freeform type text goes in and a verdict comes out, so
 * there is no extractor here: a file is an artifact, its text is `source`, and
 * nothing reads it on the way. A file holding several schemas gets one verdict
 * covering all of them, and that costs precision as well as granularity: a
 * declaration reading 0.83 alone reads 0.44 when it sits fourth of seven, and 0.40
 * when it comes last (E25). The ranking is worth reading; a per-file number is not
 * the number the rules were measured on.
 *
 * Why a ranking and not a threshold: the 0.30/0.70 bands are inherited, not
 * fitted, so an absolute verdict claims an accuracy nothing has measured. An
 * order does not — on declared types the rules separate the fixture's bad shape
 * from its good one by 0.61 (r2) and 0.47 (r5), with the file name as the only
 * description of the subject matter (E16).
 */
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import { E0, NOUL_KEYS, band, levelOf, LEVEL_NAME, measured } from "./questions.ts";
import { decide, Live } from "./jev-decision.ts";

// Dot-directories are vendored or generated: a scan of a real repo that does not skip
// them spends its whole budget on third-party code, which ranks but is not the subject.
const SKIP = /node_modules|\.test\.|\.spec\.|\/dist\/|\/coverage\/|\/\.[^/]+\//;

/** Rough token count, to stay inside the 32k state budget (§7). */
const tokens = (text: string) => Math.ceil(text.length / 4);
const MAX_TOKENS = 8_000;

const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (SKIP.test(path)) continue;
    if (e.isDirectory()) out.push(...(await walk(path)));
    else if (e.name.endsWith(".ts")) out.push(path);
  }
  return out;
};

/** A file counts as a shape to judge if it declares one at all. */
const declaresAShape = (text: string) =>
  /Schema\.Struct|Schema\.Union|z\.object|z\.discriminatedUnion|^(export )?type \w+ = \{/m.test(
    text,
  );

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

type Candidate = { readonly file: string; readonly text: string };

const scoreOne = (root: string, c: Candidate) =>
  Effect.gen(function* () {
    const { answers } = yield* decide({
      state: {
        // The state is the text plus the file it came from (§2).
        artifact: { domain: basename(c.file), source: c.text },
      },
      decisions: E0,
      // A long scan meets a transient 503 sooner or later; without this one failure
      // ends the run and discards every file already paid for.
    }).pipe(Effect.retry({ times: 4, schedule: Schedule.exponential(2000) }));

    const nouls: Record<string, number> = {};
    for (const key of NOUL_KEYS) {
      nouls[key] = answers[key].probability;
    }
    process.stderr.write(".");
    // Ranking key: the worst rule. A violation is reportable when one bad value can be
    // named, so a mean would bury one dirty rule under a clean one (§4).
    // Only rules the text reaches the rung for can rank it: a rule read below its
    // floor returns a number, and E6 shows such a number can point the wrong way.
    const applicable = NOUL_KEYS.filter((k) => measured(k, c.text));
    return {
      file: relative(root, c.file),
      level: levelOf(c.text),
      worst: applicable.length === 0 ? 0 : Math.max(...applicable.map((k) => nouls[k]!)),
      nouls,
    };
  });

const program = Effect.gen(function* () {
  const root = process.argv[2];
  if (root === undefined || root.startsWith("--")) {
    console.error('usage: bun run scan <dir> [--limit N]');
    return;
  }
  const limit = Number(arg("--limit") ?? 30);

  const files = yield* Effect.promise(() => walk(root));
  const candidates: Candidate[] = [];
  let oversized = 0;
  for (const file of files) {
    const text = yield* Effect.promise(() => Bun.file(file).text());
    if (!declaresAShape(text)) continue;
    if (tokens(text) > MAX_TOKENS) {
      oversized++;
      continue;
    }
    candidates.push({ file, text });
  }

  const picked = candidates.slice(0, limit);
  console.error(
    `${files.length} files, ${candidates.length} declare shapes` +
      (oversized > 0 ? ` (${oversized} skipped as oversized)` : "") +
      `, scoring ${picked.length}`,
  );
  console.error("state is source + file name (E15)");

  const scored = yield* Effect.forEach(picked, (c) => scoreOne(root, c), {
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
      `r1 flags ${flags("r1_inferred_case")}, r3 flags ${flags("r3_split_correlations")}, ` +
      `r4 flags ${flags("r4_duplicate_encoding")}, ` +
      `r2 flags ${flags("r2_meaningless_combinations")}, r5 flags ${flags("r5_absence_confusion")}, ` +
      `r6 flags ${flags("r6_bare_domain_value")}, r7 flags ${flags("r7_name_wider_than_type")}, ` +
      `r8 flags ${flags("r8_name_claims_resource")}, r9 flags ${flags("r9_body_reaches_undeclared")}.`,
  );
  console.log("Order is the finding; the bands are not calibrated (§8).");
});

Effect.runPromise(program.pipe(Effect.provide(Live)));
