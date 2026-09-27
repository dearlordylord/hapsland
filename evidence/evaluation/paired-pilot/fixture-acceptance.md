# Paired evaluation fixture acceptance record

**Historical Stage 1 snapshot.** The owner later accepted this fixture for the
paired pilot. The acceptance and subsequent incomplete-pilot outcome are recorded
in the [paired pilot evidence index](README.md).

**State at Stage 1 recording:** proposed fixture; owner acceptance was pending and
no paired evaluation had started. The later acceptance is recorded above.

## Task and frozen artifact

The [prompt](prompt.md) asks for a TypeScript library that parses a line-oriented test-run format, formats valid documents, exposes typed records and a case-centered view, and supplies tests. It gives ordinary functional requirements and leaves the representation design to the tested agent. It does not mention Hapsland, Jev, review rules, or desired mistakes.

The completed pilot's source-only [tree](selected-tree) is the proposed fixture. It contains six source files, one example, a README, one test file, TypeScript configuration, and package metadata. Generated `dist/`, `node_modules/`, Git internals, and the Codex transcript were excluded. The tree is copied verbatim from the completed pilot; no repair was made during selection. The prompt and tree should be reviewed together before accepting Stage 2.

## Pilot declaration and selection process

| Item | Declared or observed value |
| --- | --- |
| Host | Codex CLI `0.156.1`, noninteractive `codex exec` |
| Tested model and reasoning | `gpt-6-luna`, `max` |
| Environment | Linux `aarch64`, Node `v24.20.0`, Git `2.39.5`; fresh temporary Git repository outside the Hapsland checkout |
| Isolation | `--ignore-user-config --ephemeral`; no Hapsland installation, hooks, or Jev backend in the pilot repository |
| Agent sandbox and approval | `danger-full-access` in the isolated temporary repository; approval `never` |
| Seed and repeats | No CLI seed control was available or set. One completed candidate generation; no repeated generations or prompt tuning after inspection. |

The first invocation used Codex's `workspace-write` sandbox, but the host could not create a `bwrap` namespace. Every attempted shell command failed before the agent could write files, so this was an environment failure, not a candidate tree. I stopped that invocation and reran the identical prompt with the same model and reasoning setting using the isolated repository and `danger-full-access` sandbox. The retry completed and produced the tree linked above. This is the only completed candidate. Host transcripts were not retained in the artifact.

The completed tree passes its own offline commands: `npm run typecheck` and `npm test` (six tests passed). Those tests establish that it is a usable nontrivial parser project; they do not clear the design errors below.

## Independent fixture review

I inspected the completed tree after the Codex run ended, without asking the tested agent to review or change it. The following concrete values are accepted by exported types but conflict with facts the parser and README treat as coupled:

| Root in `src/types.ts` | Supported rule | Concrete admitted state and consequence |
| --- | --- | --- |
| `EndRecord` | Rule 2, meaningful combinations | `{ type: "END", status: "pass", detail: "failure", ... }` and `{ type: "END", status: "fail", detail: "", ... }` typecheck. The parser explicitly rejects both, because detail belongs to failed cases only. |
| `TraceCase` | Rules 2 and 4, lifecycle and one representation | `begin: null` with a non-null `end` is constructible although the parser requires BEGIN before END. `caseId`, `suite`, `name`, and `lineNumber` are also stored beside `declaration`, allowing a case view that disagrees with its own CASE record. |
| `TraceTapeDocument` | Rule 4, one representation | `isValid: true` can coexist with a nonempty `diagnostics` array. `run`, `cases`, and `done` can disagree with `records`, so a consumer using the source-order view and one using the convenient view can see different runs. The parser computes these fields consistently, but the public boundary type admits disagreement. |

These are type-shape findings, not claims that the parser emits these bad values. They matter at the exported library boundary because callers can construct or transform these public values; `formatTraceTape` accepts a `TraceTapeDocument` and reads both its validity fields and `records`. The first two examples are especially direct, since parser validation demonstrates the intended domain restriction. The type file has no imports, and Hapsland's production analyzer reports `EndRecord`, `TraceCase`, and `TraceTapeDocument` as `ready` review units under the current same-file profile. `RunSummary` is unsupported because its `Record` reference lacks local evidence; it is not part of the selection rationale. I did not run Jev on the tree or claim that it would issue these findings.

## Acceptance gate at Stage 1 recording

At this stage, the owner was to inspect the prompt and selected tree and explicitly accept or reject this fixture. Stage 2 paired runs, rubric freezing, and Hapsland exposure waited for that decision. The source artifact is reviewable in this branch, and the type errors above make it eligible as a proposed fixture under issue #95's Stage 1 criterion.
