# Sanitized synthetic evidence

`records.jsonl` is a checked-in, source-free summary of the representative, Zod, and
Effect Schema offline black-box observations. It deliberately omits absolute paths,
environment details, and variable timing values. Re-run
`npm run experiment:extract` against a fixture to obtain the full local record,
including exact declaration source and measured cold and warm timings.
