# #132 canonical configuration and file admission evidence

Hapsland now derives effective include precedence, file selection, and review
admission through `Canonical.step` and `Configuration.bend`. TypeScript parses
settings, measures Git and physical path facts, matches globs, and resolves the
Jev credential. The canonical transition receives source-free booleans and
rank numbers; it does not receive source, paths, patterns, or secrets.

The direct-event pipeline, resident dispatch, and older CLI review path use
the same file-selection decision. The older installed path reloads file
settings before source read, Jev dispatch, and returning advice. Review of an otherwise eligible file is
admitted by default when Jev credentials are available. User excludes can
turn review off, and a project include cannot override a user exclude.
Protected and ignored paths remain excluded. Dispatch rechecks the current
physical root, settings, credential, and selection before Jev egress.

Setup, doctor, status, pilot, and first-review demonstration now describe and
exercise file settings instead of a separate repository grant. The legacy
`enable`, `enable-confirm`, and `disable` CLI operations return a read-only
`retired` result; saved grant files are left untouched. Doctor marks file
selection `missing` when effective settings select no files. Installer previews no
longer expose a separate source-egress authorization field. The documentation
and configuration schema describe the file-setting boundary.

The seven independent traces in
[`canonical-configuration-v1.json`](../conformance/canonical-configuration-v1.json)
cover precedence, default selection, exclusion, empty includes, protected
paths, and admission refusals. Offline fake Jev and filesystem fixtures cover
default review, user exclude-all, distinct working-tree settings, direct and
older entry points, and settings changes before read, dispatch, and advice.
The executable
boundary guard rejects return of grant calls in the product paths and checks
canonical call sites.

`npm run test:canonical` passed Bend proofs and 50 independent canonical
traces. The complete offline `npm test` run passed 65 files and 590 tests;
one file and two credential-gated tests were skipped.
`npm run conformance:direct-event` passed 19 files and 257 tests; its manifest maps
95 unique checks to 39 obligations in 12 groups. `npm run build`, `npm run conformance:setup-package`, and
`npm run conformance:package` passed. The setup package run covered seven
offline journeys with zero provider calls. The clean local package run used
Node v24.20.0 on Linux arm64 and exercised installation, update recovery,
controlled resident review, user file settings, and dispatch refusal after
exclude-all. It did not request a real host or live Jev run.

The historical installed-release evidence describes its earlier package and
is not evidence of this migration; the later installed validation milestone
is #136.
