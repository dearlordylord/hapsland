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

Every record has stable fixture names, root/context identities, navigation outcomes,
omission reasons, requested and observed caps, cold/warm latency-presence labels, and
positional request counts. The full local command record contains scalar cold and warm
measurements:

```sh
npm run --silent experiment:extract -- \
  --fixture experiments/declaration-extraction/fixtures/representative \
  --edit interface
```

The harness reads fixture source and starts exactly one native `tsc --lsp --stdio`
child process. It does not import fixture modules or make network API calls; synthetic
marker observations and the `observations` fields record that boundary. The evidence
is not an OS-wide process, socket, or filesystem audit: a host-level tracer was not
installed, so those residual observations remain a limitation in the verdict.
