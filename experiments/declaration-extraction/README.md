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
tool/runtime versions, cold/warm timings, positional request counts, native-server
request evidence, and a module-initialization marker observation. Source files are
read as text only; no fixture module is imported or evaluated.

The deterministic `--fault nonresponding` option is used by the offline tests to
prove that an in-flight positional request is cancelled at the remaining elapsed
budget; ordinary extraction always uses the native server.

The fixture's target module has erased type-only imports and one real `node:fs`
import so the positive-control test can evaluate a copied module under Node 24.
Extraction itself sets a unique marker token and reports `modulesImported: true`,
`false`, or `null` (indeterminate when a pre-existing marker prevents attribution).

Run deterministic offline black-box tests with:

```sh
npm run test:extract
```
