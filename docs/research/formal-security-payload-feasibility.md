# Payload authorization feasibility for Hapsland

Status: advisory investigation, 2026-09-24. This describes the current direct-event TypeScript profile and a candidate verification contract; it is not an adopted product specification or a proof of arbitrary TypeScript behavior. Source baseline: `b4af0533ba3fdf2689fdc15b2b745134e16c9caf`. The [current investigation state](FORMAL-SECURITY-INVESTIGATION.md) owns the combined direction.

## Finding

An enforceable **declaration-span** guarantee is feasible now: for an eligible file, every source-text value sent to Jev should equal the raw text of the selected interface or type alias, or of a distinct same-file declaration reachable by the analyzer's named-reference graph. The complete outgoing request also includes the repository-relative path, fixed contract metadata, selected rule IDs, and rule question/criteria text. It must be checked as a whole. This guarantee allows comments and literal values *inside* an authorized declaration. A stronger claim that only interface structure leaves the process would require a new extraction/normalization design.

The existing analyzer supplies raw `sourceNode.text`, where the node is an `interface_declaration`, `type_alias_declaration`, or its enclosing `export_statement` [analyzer.ts](../../src/direct-event/analyzer.ts#L78) [analyzer.ts](../../src/direct-event/analyzer.ts#L145). The path-to-capture gate, analysis, selection, and frozen review input are in [pipeline.ts](../../src/direct-event/pipeline.ts#L197). The `DecisionModel` input is constructed in [pipeline.ts](../../src/direct-event/pipeline.ts#L335); the TypeSafe provider then adds `{model, state, questions}` and serializes it as the `/systemone` JSON body [TypeSafeDecisionModel.ts](../../node_modules/@effect/ai-typesafe/src/TypeSafeDecisionModel.ts#L45) [TypeSafeClient.ts](../../node_modules/@effect/ai-typesafe/src/TypeSafeClient.ts#L98). The installed provider source is a local dependency observation for the pinned `4.0.0-rc.116` cohort, not a claim about future releases.

## Current extraction behavior

| Surface | Observed implementation behavior | Security implication |
| --- | --- | --- |
| File kind and size | `.ts`, `.tsx`, `.mts`, `.cts`; capture accepts at most 32,768 UTF-8 bytes; parse error and any import syntax reject the whole file [capture.ts](../../src/direct-event/capture.ts#L12) [analyzer.ts](../../src/direct-event/analyzer.ts#L127). | Bounds the input file, not the expanded wire body. Imports cannot pull cross-file source into this profile. |
| Root kinds | All interface and type-alias syntax nodes are collected anywhere in the parse tree; at most 64; duplicate names reject the file [analyzer.ts](../../src/direct-event/analyzer.ts#L139). | “Same-file named types” is more accurate than “top-level declarations.” Namespace nesting is not represented in artifact IDs. |
| Root selection | Add considers every analyzed declaration; Update chooses roots whose declaration source contains an exact trimmed added line, while ambiguous lines mark incomplete [pipeline.ts](../../src/direct-event/pipeline.ts#L167). | A one-line change in a declaration can select the entire declaration. Reference evidence can include unchanged declarations. |
| Declaration text | The raw declaration or enclosing `export_statement` text is used verbatim and hashed [analyzer.ts](../../src/direct-event/analyzer.ts#L151). | Internal comments, JSDoc within the span, string/numeric/template literals, and export-statement text can leave. Leading comments outside the span usually do not. |
| References | Traversal collects `type_identifier` names, omits the declaration name and its own type parameters, and treats nested qualified identifiers, type queries, and computed property names as unsupported [analyzer.ts](../../src/direct-event/analyzer.ts#L90). | References are syntactic and name-based, not a TypeScript type-checker resolution. Built-in primitives do not create named edges. |
| Closure and failure | The graph expands same-file names; repeated targets become `included` edges, terminating cycles. More than 16 distinct referenced names makes that unit unsupported; unresolved/unsupported references also make it unsupported [analyzer.ts](../../src/direct-event/analyzer.ts#L171). Only ready units are sent [pipeline.ts](../../src/direct-event/pipeline.ts#L264). | No current whole-file fallback was found. A different ready unit can still be sent when another unit fails. |
| Evidence encoding | The root source is `state.artifact.source`; references, expanded artifacts, their `source` and `sourceHash`, IDs, site symbols, and edge kinds are nested under `state.evidence` [model.ts](../../src/direct-event/model.ts#L65) [pipeline.ts](../../src/direct-event/pipeline.ts#L335). | Source may appear beyond `state.artifact.source`, and names, hashes, paths, and rule text are metadata egress. |

The file parser scans declarations throughout the syntax tree and then indexes them by unqualified name [analyzer.ts](../../src/direct-event/analyzer.ts#L135) [analyzer.ts](../../src/direct-event/analyzer.ts#L215). A namespace-local declaration can therefore be represented without its namespace wrapper. This is a semantic limitation and needs either a narrower supported profile or scope-aware extraction before a claim about correct TypeScript reference resolution.

## Bounded offline probe

Environment: Linux checkout at the baseline commit above, Node `v24.20.0`, installed `tree-sitter@0.25.1` and `tree-sitter-typescript@0.23.2`. The original execution used `node --experimental-strip-types --input-type=module` with an inline import of `./src/direct-event/analyzer.ts`. Its exact twelve-case body is retained as [payload-feasibility-probe.mjs](fixtures/payload-feasibility-probe.mjs). The retained replay used the equivalent command below from repository root and exited 0:

```sh
node --experimental-strip-types docs/research/fixtures/payload-feasibility-probe.mjs > docs/research/fixtures/payload-feasibility-probe-output.jsonl
```

The complete observed JSONL is [payload-feasibility-probe-output.jsonl](fixtures/payload-feasibility-probe-output.jsonl). Expected classifications were set from the source-inspected analyzer behavior before comparing the output; the table reports every case in the exact fixture order. `source` and `evidence` values are fully preserved in the JSONL. The command used no network or credentials and read no files outside the checkout.

| Case and exact synthetic fixture | Expected | Observed |
| --- | --- | --- |
| `/** SECRET_LEADING */\nexport interface A { x: string }` | Ready; leading JSDoc absent | Ready; source is `export interface A { x: string }` |
| `interface A { /* SECRET_INNER */ x: string }` | Ready; inner comment present | Ready; source includes `SECRET_INNER` |
| `interface A { token: "SECRET_LITERAL"; key: 42 }` | Ready; literals present | Ready; source includes both literals |
| `interface A { ["SECRET_KEY"]: string }` | Unsupported computed key | Unsupported; omitted `unsupported` edge |
| `interface A { fn(x: "SECRET_PARAM"): void }` | Ready; parameter literal present | Ready; source includes `SECRET_PARAM` |
| `export /** SECRET_EXPORT */ interface A { x: string }` | Ready; export-span comment present | Ready; source includes `SECRET_EXPORT` |
| `namespace N { export interface A { x: string } }` | Ready; namespace wrapper absent | Ready; source is `export interface A { x: string }` |
| `interface A extends B { x: string }\ninterface B { y: number }` | Ready A and B; A expands B | Ready A and B; A evidence has expanded B |
| `const SECRET_UNRELATED = "s"; interface A { x: string }` | Ready; const absent | Ready; source is `interface A { x: string }` |
| `interface A { b: B }\n/** SECRET_B */ interface B { /* SECRET_IN_B */ x: string }` | Ready A and B; A evidence includes inner B comment, not leading B JSDoc | Ready A and B; expanded B source includes `SECRET_IN_B` only |
| `type A = \`SECRET_TEMPLATE_${string}\`` | Ready; template literal present | Ready; source includes `SECRET_TEMPLATE_` |
| `type A = { x: "SECRET_ALIAS" }` | Ready; string literal present | Ready; source includes `SECRET_ALIAS` |

Source class **RUN**, verification state **RUNTIME-TESTED** for these exact synthetic analyzer inputs only. These results do not establish wire behavior or completeness over TypeScript syntax. Existing tests separately source-inspect reference cycles, import rejection, and limits [analyzer.test.ts](../../src/direct-event/analyzer.test.ts#L56).

## Candidate payload contract

Treat the following as a proposed first gate for the direct-event TypeScript profile:

1. **Authorized capture and root:** The file passes current path/consent policy at the defined dispatch point. The selected root is an `interface_declaration` or `type_alias_declaration` in the captured, stable file; Update root selection is tied to the host edit evidence. If analysis of that root is incomplete, send no request for it.
2. **Exact source provenance:** Every `source` field in the outgoing state is exactly one captured byte span for the selected root or one unique same-file declaration reachable through named-reference edges. The root span may include its enclosing `export_statement`. No source-bearing field may contain a byte from outside those spans except explicitly authorized metadata or rule text. This is a proposed gate, not a property recorded by production today: production retains text strings and hashes, but does not retain source byte offsets. Add a mapping of file identity, capture hash, declaration kind/name, byte start/end, and referenced edge for review; hashes alone do not prove containment.
3. **Closure integrity:** Every expanded evidence artifact is reachable from the root; no unrelated declaration appears. Included edges point to a previously reached artifact; cycles terminate. An unresolved, unsupported, imported, or over-limit root is rejected, never broadened to whole-file source. Bounds remain 64 declarations and 16 distinct referenced names unless the profile changes.
4. **Wire allowlist:** Decode the actual serialized `/systemone` body and require exact keys `model`, `state`, `questions`; `state` must have exactly `artifact`, `evidence`, and `inputContract` with their declared subshapes. `artifact.domain` is the eligible relative path. `questions` contains exactly the enabled applicable rule IDs, each with `type: "noul"`, instructions and criteria equal to the frozen authorized rule definitions. Unexpected keys, extra source, or rule text from an unauthorized pack fail the gate. The destination URL, method, redirects, and headers need a separate transport check.
5. **Limits of the guarantee:** Authorized declarations may contain comments, literal strings, and secrets. The gate proves provenance and payload shape for exercised cases, not secret absence, harmlessness of rule text, or semantic equivalence to TypeScript's compiler.

This contract is feasible as a conformance experiment with synthetic source and an offline HTTP client. A permanent production gate would benefit from explicit span/provenance records; the current `SyntaxNode` wrapper carries `text` but no `startIndex`/`endIndex` [analyzer.ts](../../src/direct-event/analyzer.ts#L18). The separate legacy `ReviewBackend` path constructs a simpler `artifact` payload [review-backend.ts](../../src/ports/review-backend.ts#L59); claims about all Hapsland egress must inventory every reachable path and supported profile.

### Independent observation strategy

Use hand-authored fixtures with unique synthetic markers and a manifest of allowed byte ranges/edges. Construct expected ranges from the fixture's explicit marker delimiters or independently reviewed offsets, rather than calling `analyzeTypeFile`, `readyTypeUnits`, or `preparedProviderInput` to compute the expected result. Call the production adaptation → capture → preparation → `evaluatePrepared` path. Intercept the actual `HttpClient` request under `TypeSafeClient`/`TypeSafeDecisionModel`, decode the captured JSON, and compare both exact structure and authorized marker set. The repository already demonstrates an offline request-body seam in [jev-decision.test.ts](../../src/jev-decision.test.ts#L110); its current integrated direct-event test observes the `DecisionModel` state before provider serialization [pipeline.test.ts](../../src/direct-event/pipeline.test.ts#L122). Combining these seams avoids using a fake `DecisionModel` as evidence for the wire body.

The oracle must compare complete JSON structure, not only assert that a forbidden marker is absent. Marker absence alone misses unmarked leaks; source-span equality alone misses source copied into question text or new fields. A manually enumerated expected JSON schema and authorized fixture text provide an independent check. Corpus examples should cover leading/inner/export comments, literal values, aliases, cycles, imported/qualified/unresolved names, namespace nesting, duplicate declarations, 64/65 declarations, 16/17 references, and a root unrelated to the changed line.

Deliberate mutations that must make the gate red: append whole-file text to `artifact.source`; insert an unrelated declaration under `evidence`; add a new source-bearing JSON property; encode captured patch lines in `questions`; relax an unresolved-reference rejection; or make the provider client transmit a second request. The last mutation requires observing request count and every body at the HTTP seam, not merely comparing the first request.

## Feasibility and unresolved decisions

The narrow “raw declaration and same-file reference spans” guarantee can be tested immediately. Removing comments, JSDoc, literal values, or type-level template text requires a deliberate payload transformation and a decision about review quality. Their removal cannot be asserted from today's code. Exact scope resolution for namespace nesting and generic/shadowed names requires either profile restrictions or a semantic resolver. A gate that checks only abstract Quint fragment IDs cannot catch parser or serializer leakage; concrete fixtures and HTTP observation are needed alongside model traces.

Decide whether configured rule text is an authorized egress source even when project-local rules can contain source-like text [schema.ts](../../src/rules/schema.ts#L40). Decide whether namespace-nested declarations are in the supported profile. Decide whether comments/literals remain authorized declaration content or whether Hapsland should generate a reduced type signature. Also decide whether a changed exclusion should revoke a queued payload before dispatch; this is covered by the parallel access investigation.

Evidence classification: source citations above are **SRC/SOURCE-INSPECTED** unless the bounded probe explicitly marks **RUN/RUNTIME-TESTED**. The proposed contract and its ability to catch mutations are **INFERRED** until implemented and executed. Backend retention after HTTP receipt is **UNKNOWN** and outside this local payload gate. This is a targeted Hapsland component investigation, not comparative selection of a new dependency; the existing Tree-sitter and TypeSafe dependencies are used as installed components, with no new adoption decision made here.
