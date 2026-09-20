# TypeScript declaration-extraction experiment

This is a disposable, fixture-driven black-box experiment. It is intentionally
outside `src/` and is not part of the product review path. It composes the pinned
Tree-sitter TypeScript grammar for syntax/ranges with TypeScript 7's released native
language server (`tsc --lsp --stdio`) for positional definition navigation.

Run the documented command directly from the repository root (the direct Node
invocation keeps stdout to one JSON record):

```sh
node experiments/declaration-extraction/extract.ts \
  --fixture experiments/declaration-extraction/fixtures/representative \
  --edit interface
```

The package-script equivalent is `npm run --silent experiment:extract -- ...`.

The command writes exactly one JSON record to stdout and keeps diagnostics on the
record's sanitized `lsp` fields. `--edit alias` selects the second identified edit
in the representative fixture. An inline edit is also accepted:

```sh
node experiments/declaration-extraction/extract.ts \
  --fixture experiments/declaration-extraction/fixtures/representative \
  --edit src/target.ts:7:1-7:30
```

Traversal is bounded by six independently configurable caps. Values may be supplied
as JSON or with a `--max-*` flag:

```sh
node experiments/declaration-extraction/extract.ts \
  --fixture experiments/declaration-extraction/fixtures/representative \
  --edit interface \
  --caps '{"declarations":4,"depth":1,"sourceCharacters":500,"files":3,"externalPackages":1,"elapsedMs":2000}'
```

The JSON record contains the actual before/after diff, exact byte/line/UTF-16 ranges,
the before/after root-selection sets, selected context declarations, syntactic edges,
explicit null/multiple/external/unresolved results, omissions and completeness, exact
tool/runtime versions, phase timings for process startup, initialize, open dispatch,
cold extraction, and warm extraction, positional request counts, native-server request
evidence, and a module-initialization marker observation. The open-dispatch timing is
only a client-side event-loop turn after `didOpen`; native-server processing is not
barrier-measured and may be included in cold extraction. Source files are read as text
only; no fixture module is imported or evaluated.

The deterministic `--fault nonresponding` option suppresses a positional response in
the client and emits a `$/cancelRequest` notification at the elapsed budget. It does
not prove that the native server observed or honoured cancellation; that field remains
explicitly unobserved. Ordinary extraction always uses the native server.

The offline fault seams also expose `--fault crash` (kill the initialized native
server) and `--fault stale-document` (send an older full-buffer `didChange` after
`didOpen`). Their records identify the injected nature of the observation. A crash is
reported as navigation failure and a stale response is not treated as a correctness
guarantee.

The fixture's target module has erased type-only imports and one real `node:fs`
import so the positive-control test can evaluate a copied module under Node 24.
Extraction itself sets a unique marker token and reports `modulesImported: true`,
`false`, or `null` (indeterminate when a pre-existing marker prevents attribution).

The independent framework fixtures exercise the same record and traversal seam:

```sh
node experiments/declaration-extraction/extract.ts \
  --fixture experiments/declaration-extraction/fixtures/zod \
  --edit 'src/target.ts:0:0-32:0'

node experiments/declaration-extraction/extract.ts \
  --fixture experiments/declaration-extraction/fixtures/effect \
  --edit 'src/target.ts:0:0-34:0'
```

Const candidates are identified from Tree-sitter expression shape, then their
constructor position is resolved through the native TypeScript 7 language server.
Only a definition in the real `zod` package or an `effect/Schema` declaration gets
framework identity. Project wrappers, null/multiple/external locations, and
unsupported transformations/declarations remain explicit unresolved or partial
evidence with the exact expression source retained opaquely. Ordinary object
values with similarly named members are not candidates. Framework versions are
reported as `zod@4.6.5` and `effect@4.0.0-rc.116` in the record.

Run deterministic offline black-box tests with:

```sh
npm run test:extract
```

Generate the checked-in source-free corpus summary and verdict inputs with:

```sh
npm run --silent experiment:extract:evidence
```

Degradation fixtures live under `fixtures/malformed-half-written`,
`fixtures/missing-config`, `fixtures/unresolved-import`, and `fixtures/cycles`.
`fixtures/evolution` records formatting, rename, import-retargeting, multiple roots,
move, deletion, and generic-reference controls. See [`VERDICT.md`](./VERDICT.md) for
the criterion-by-criterion limitations and follow-ups.
