# Sanitized synthetic evidence

`records.jsonl` is a checked-in, source-free summary of the TypeScript, schema,
degradation, fault, identity, and budget-profile observations. It deliberately omits
absolute paths, environment details, exact declaration source, and variable timing
values. Hashes are SHA-256 over synthetic fixture declarations and are retained only to
make repeated-run identity checks visible.

Regenerate it deterministically with:

```sh
npm run --silent experiment:extract:evidence
```

Every record has stable fixture names and cases, root/context identities, navigation
outcomes, omission reasons, requested and observed caps, numeric phase-aware timing
buckets, and positional request counts. `timing-summary.json` groups the 30 cases into
repeated fixture classes and contains numeric sample counts, minimums, medians, maximums,
and bucket distributions by phase. The full local command record contains scalar
process-startup, initialize, open-dispatch, cold-extraction, and warm-extraction
measurements:

```sh
npm run --silent experiment:extract -- \
  --fixture experiments/declaration-extraction/fixtures/representative \
  --edit interface
```

The `openDispatch` timing covers the client-side event-loop turn after `didOpen` writes;
it is not a barrier for native-server processing. Server work may therefore be included
in cold extraction. The harness directly reads fixture source and directly spawns one native
`tsc --lsp --stdio` child process. It does not import fixture modules. Descendant
processes, plugins, filesystem writes, and network activity are explicitly null or
marked not instrumented; the evidence is not an OS-wide process, socket, or filesystem
audit. A host-level tracer was not installed, so those residual observations remain a
limitation in the verdict.
