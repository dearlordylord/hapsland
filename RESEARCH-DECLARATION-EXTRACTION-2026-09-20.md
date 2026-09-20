# Declaration extraction and bounded referenced context

**Date:** 2026-09-20

**Status:** advisory research; this report is not a product specification or an architecture decision

**Canonical scope:** tools and reusable APIs for mapping an edited TypeScript range to a type-shape
artifact and assembling bounded referenced type/schema context

**Constraint correction:** the target is TypeScript 7 and later. An earlier revision treated the
TypeScript 5.9 JavaScript Compiler API as a conditional semantic dependency. That assessment is
withdrawn. TypeScript 7.0 is the native Go port, ships no supported programmatic API, and routes its
editor integration through a native LSP server. Legacy Compiler API and ts-morph evidence is
retained only to explain patterns and incompatibility; it is not a target-runtime solution.

## 1. Research brief

### Question and current assumptions

Which existing tools can reliably:

1. map an added or edited line/range to each enclosing semantic declaration;
2. recognize initial TypeScript interfaces/type aliases, Zod schema definitions, and Effect Schema
   definitions;
3. resolve local references through imports and aliases without losing source identity;
4. traverse those references with explicit depth, node, character, time, and package boundaries;
5. identify whether the resulting artifact materially changed; and
6. leave missing evidence visible rather than inviting an uncertain Jev verdict?

The target artifact is one declaration plus the minimum related declarations needed to judge the
values it admits. The filename remains context. A caller may also provide domain free text, such as a
ubiquitous-language file; extraction only attaches that supplied text and does not discover domain
intent. An uncertain violation remains unreported. Jev has a small useful context window, so an
unbounded whole-program graph is not a valid solution.

Only added or directly changed declarations are initial review targets. Automatically finding an
unchanged declaration whose dependency changed is deferred by
[`EXTRACTION-DEFERRED-WORK.md`](./EXTRACTION-DEFERRED-WORK.md), unless later tooling evidence shows a
deterministic, reliable, low-effort method. This does not defer collecting unchanged referenced
declarations as context for a directly changed root.

This pass investigates reusable analyzers. It does not implement a prototype, select production
architecture, broaden agent-host integration, or make a paid Jev call.

### Representative workflows

| ID | Workflow | Required observation |
|---|---|---|
| W1 | A changed line is inside one interface/type declaration | Return that declaration once, with an exact current-source range |
| W2 | One edit intersects several declarations | Return each affected declaration separately; do not produce one file verdict |
| W3 | A declaration refers to local/imported aliases | Include a bounded, cycle-safe definition closure with aliases and source locations preserved |
| W4 | A `const` initializer defines a Zod or Effect schema | Recognize it by resolved framework provenance and expression shape, not by variable spelling alone |
| W5 | A schema uses a helper, transform, refinement, lazy edge, or unsupported construct | Preserve source and mark incomplete interpretation; do not silently flatten it to a wider type |
| W6 | Formatting, comments, imports, or context collected for a directly changed root differ | Distinguish raw edits from a change to the review projection and its evidence closure; do not use this to select unchanged dependents |
| W7 | Another language is added later | Reuse the artifact/graph/budget contract while replacing language-specific syntax and semantics |

### Evidence that would change the candidate assessments

- A syntax parser that documents compiler-accurate import/alias/type resolution would strengthen it
  from a syntax frontend to a semantic-closure candidate.
- A language-neutral protocol that guarantees declaration containment, complete outbound type edges,
  fresh unsaved-buffer state, and stable symbol identity would strengthen LSP/SCIP from optional
  integration to a core dependency candidate.
- A safe static Zod/Effect source interpreter with documented coverage of helpers, aliases,
  refinements, recursion, and versioned semantics would reduce the need for framework-specific
  conservative recognition.
- A released, documented TypeScript 7+ programmatic API with supported source/symbol/alias traversal
  would reopen direct compiler embedding. Current source shows feasibility, not a supported contract.
- A prototype showing that a source parser plus TypeScript 7 native LSP cannot resolve representative
  local/imported references from current buffers would reject that composed route.

### Discovery and stopping condition

Discovery used official documentation and project-owned source for TypeScript 7.0.2, its native LSP
and internal API work, the legacy Compiler/Language Service APIs, ts-morph, Tree-sitter, ast-grep,
LSP 3.18, SCIP, Zod 4, and Effect 4 Schema. Queries
covered range-to-node lookup, symbols/aliases/definitions, incremental changes, structural queries,
schema ASTs/JSON Schema conversion, and language-neutral indexes. One follow-up pass checked
cross-language semantic protocols and framework-specific limits. The second pass produced no new
candidate class, so the bounded stopping condition was met. This is not an ecosystem-completeness
claim.

## 2. Candidate inventory

| Candidate / component use | Class | Include or exclude | Advisory classification |
|---|---|---|---|
| TypeScript 7.0.2 native LSP | Native semantic service | Include: the released TS7 process advertises incremental sync, document symbols, selection ranges, definitions, type definitions, and references | **DEPEND ON**, conditional only for the semantic-navigation role; extraction conformance is unproven |
| TypeScript 7 internal/future out-of-process API | Experimental semantic service | Include as feasibility evidence: released source contains an undocumented `--api`, and current main expands it | **REJECT** as a current supported dependency; revisit after a released, documented contract |
| TypeScript 5/6 JavaScript Compiler/Language Service APIs | Legacy compiler/service | Include only as migration evidence and a fixture oracle | **REJECT** as the TypeScript 7+ semantic foundation |
| ts-morph 28 | Legacy compiler wrapper | Include only for navigation-contract lessons | **REJECT** as a TypeScript 7+ solution; **BORROW** ergonomics only |
| Tree-sitter core plus TypeScript grammar | Incremental syntax frontend | Include: robust range-to-node, changed ranges, queries, and realistic multi-language reuse | **DEPEND ON**, conditional candidate for the source-syntax role in a parser-plus-LSP prototype |
| ast-grep | Structural query tool | Include: declarative Tree-sitter patterns, range-bearing JSON output, and rule tests | **BORROW** recognizer/query fixture patterns; **REJECT** it as the semantic reference-closure engine |
| LSP 3.18 plus language servers | Language-neutral semantic adapter | Include: document symbols, selection ranges, definitions, type definitions, and references | **OPTIONAL INTEGRATION** for languages whose compiler is impractical to embed |
| SCIP plus language-specific indexers | Language-neutral semantic index | Include: stable serialized occurrences/symbols and multi-language indexers | **OPTIONAL INTEGRATION** for repositories with a fresh index; unsuitable as the sole realtime edit source |
| Zod 4 core / JSON Schema APIs | Runtime schema model | Include as framework evidence and fixture oracle | **BORROW** traversal, cycle, reuse, and “unrepresentable” concepts; do not execute user modules for extraction |
| Effect 4 Schema AST / interpreters | Runtime schema model | Include as framework evidence and fixture oracle | **BORROW** AST, annotation, and interpreter concepts; do not execute user modules for extraction |

Serious exclusions: Babel, Oxc, and the ESTree family remain viable syntax-parser alternatives for a
prototype, but none owns TypeScript 7's type checker or module-resolution semantics; they add no
materially different candidate class beyond Tree-sitter for this question. Regex/text search is
excluded because nested ranges, aliases, and comments/strings make it unable to establish declaration
identity. JSON Schema alone is excluded as the canonical artifact because both Zod and Effect
document schema features or transformations that do not map losslessly to JSON Schema (E14, E16).

## 3. Evidence ledger

All web sources were accessed 2026-09-20. `DOC`, `SRC`, and `META` are source classes;
`DOCUMENTED`, `SOURCE-INSPECTED`, `INFERRED`, and `UNKNOWN` are verification states. No behavior was
runtime-tested in this pass.

| ID | Exact proposition | Evidence | Class / state | Limitation |
|---|---|---|---|---|
| E01 | TypeScript 7.0 is the native Go port. The official release says 7.0 ships no API, expects a new/different API in 7.1, and makes the native LSP the editor integration surface. | [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), “Running Side-by-Side” and “Editor Experience” | DOC / DOCUMENTED | This invalidates the legacy JavaScript Compiler API as the assumed TS7 integration contract. |
| E02 | The released 7.0.2 executable source accepts `--lsp --stdio`; the release source labels the language service in progress/nearly complete and the API not ready. | [7.0.2 command entry](https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/cmd/tsgo/main.go); [LSP launcher](https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/cmd/tsgo/lsp.go); [7.0.2 README](https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/README.md) | SRC / SOURCE-INSPECTED | The command was not launched in this pass; “nearly all features” is a project status, not extraction conformance. |
| E03 | The 7.0.2 native server registers incremental open/change synchronization and advertises document symbols, selection ranges, definition, type-definition, and references providers. | [7.0.2 native LSP server](https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/internal/lsp/server.go) | SRC / SOURCE-INSPECTED | These are position/location APIs. Source does not establish a complete outbound type/schema graph or stable artifact identity. |
| E04 | The 7.0.2 source contains an undocumented `--api` process with internal snapshot, source, symbol, alias, type, and referenced-symbol methods. | [7.0.2 API launcher](https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/cmd/tsgo/api.go); [internal protocol](https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/internal/api/proto.go) | SRC / SOURCE-INSPECTED | E01 and the release README explicitly say no ready API. Internal source proves feasibility, not supported use or stability. |
| E05 | Current TypeScript main has expanded the out-of-process API, including snapshots, source files, symbol/alias/type queries, referenced-symbol methods, JSON-RPC/MessagePack transport, and external-code control. | [API methods at `f29aeb9`](https://github.com/microsoft/TypeScript/blob/f29aeb9f825d96feea27841f3f7342dbf0df68a8/tsc/internal/api/proto.go); [API launcher](https://github.com/microsoft/TypeScript/blob/f29aeb9f825d96feea27841f3f7342dbf0df68a8/tsc/cmd/tsc/api.go); [server](https://github.com/microsoft/TypeScript/blob/f29aeb9f825d96feea27841f3f7342dbf0df68a8/tsc/internal/api/server.go) | SRC / SOURCE-INSPECTED | Main is unreleased, the implementation remains under `internal`, and no stable public contract was found. |
| E06 | A TypeScript maintainer said the Go API would be exposed after the repository move, possibly before 7.1; earlier comments favored an out-of-process/IPC surface to avoid exposing internals. | [typescript-go discussion #481](https://github.com/microsoft/typescript-go/discussions/481), maintainer replies dated 2025-03-11 and 2026-07-28/29 | ISSUE / DOCUMENTED | A plan and source-in-progress are not a released compatibility guarantee. |
| E07 | The legacy TypeScript 5/6 Compiler API exposes AST, symbols, aliases, and module resolution, but its own guide warns that TypeScript 7.1 has a completely different API. | [Compiler API guide](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API); [5.9.3 public declarations](https://github.com/microsoft/TypeScript/blob/v5.9.3/lib/typescript.d.ts#L6176-L6282) | DOC + SRC / SOURCE-INSPECTED | Useful as conceptual and fixture evidence only under the TS7+ constraint. |
| E08 | ts-morph exposes project loading, definitions/references, source paths, and text spans; refreshed child nodes are forgotten. | [Adding source files](https://ts-morph.com/setup/adding-source-files); [finding references](https://ts-morph.com/navigation/finding-references); [source-file refresh](https://ts-morph.com/details/source-files#refresh-from-file-system) | DOC / DOCUMENTED | These APIs wrap the legacy JavaScript Compiler API, not the TS7 native semantic service. |
| E09 | ts-morph 28.0.0 is MIT-licensed and its breaking release targets TypeScript 6.0. | [ts-morph repository](https://github.com/dsherret/ts-morph); [28.0.0 release](https://github.com/dsherret/ts-morph/releases/tag/28.0.0) | META / DOCUMENTED | It is not evidence of TypeScript 7 native compatibility. |
| E10 | Tree-sitter produces range-bearing concrete syntax nodes, incrementally reparses edited trees, and is designed to remain useful with syntax errors. | [Tree-sitter introduction](https://tree-sitter.github.io/tree-sitter/); [getting started](https://tree-sitter.github.io/tree-sitter/using-parsers/1-getting-started.html) | DOC / DOCUMENTED | It is a syntax tree, not a TypeScript symbol/type graph. |
| E11 | Tree-sitter can return the smallest node spanning a byte range; edited old/new trees can report changed ranges. | [Node `descendantForIndex`](https://tree-sitter.github.io/node-tree-sitter/interfaces/SyntaxNode.html#descendantForIndex); [incremental editing](https://tree-sitter.github.io/tree-sitter/using-parsers/3-advanced-parsing.html); [Tree changed ranges](https://tree-sitter.github.io/java-tree-sitter/io/github/treesitter/jtreesitter/Tree.html#getChangedRanges(io.github.treesitter.jtreesitter.Tree)) | DOC / DOCUMENTED | Bindings differ; stored nodes must be edited or reacquired after changes. |
| E12 | Tree-sitter queries and ast-grep match syntax structures; ast-grep JSON results carry file, byte, line, and column ranges. | [Tree-sitter queries](https://tree-sitter.github.io/tree-sitter/using-parsers/queries/index.html); [ast-grep tooling overview](https://github.com/ast-grep/ast-grep.github.io/blob/main/website/guide/tooling-overview.md); [ast-grep README](https://github.com/ast-grep/ast-grep/blob/main/README.md) | DOC + SRC / DOCUMENTED | Structural matching does not establish import provenance or semantic alias identity. |
| E13 | LSP document symbols may provide a hierarchy and enclosing/selection ranges; definition, type-definition, references, and selection-range requests are separate optional capabilities. | [Document symbols](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/language/documentSymbol.md); [definition](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/language/definition.md); [type definition](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/language/typeDefinition.md); [references](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/language/references.md); [selection range](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/language/selectionRange.md) | DOC / DOCUMENTED | Servers advertise capabilities independently; the protocol does not define a complete outbound type-reference graph or stable symbol ID. |
| E14 | Zod 4 core documents `_zod.def` as a JSON-serializable complete schema definition with a discriminator for tool traversal. | [Zod Core internals](https://zod.dev/packages/core#internals) | DOC / DOCUMENTED | This is a runtime object. Obtaining it from arbitrary source normally executes/evaluates project code. |
| E15 | Zod JSON Schema conversion has explicit cycle/reuse policies and declares transforms, custom schemas, dates, maps, sets, and other constructs unrepresentable rather than soundly flattening them. | [Zod JSON Schema](https://zod.dev/json-schema) | DOC / DOCUMENTED | JSON Schema is useful as an oracle/projection only when conversion is representable. |
| E16 | Effect 4 schemas expose an AST; nodes carry annotations, and interpreters can intercept AST nodes. Class schemas expose identifiers/fields and store annotations in the AST. | [Effect Schema annotations](https://effect.website/docs/v4/schema/annotations); [class schemas](https://effect.website/docs/v4/schema/classes); [formatter AST interception](https://effect.website/docs/v4/schema/formatter#intercepting-ast-nodes) | DOC / DOCUMENTED | As with Zod, obtaining a constructed schema can execute project initialization and version-specific code. |
| E17 | SCIP is a language-agnostic serialized index of range occurrences and symbols used for definitions/references; official/project indexers exist for TypeScript, Java-family languages, Rust, C/C++, Python, Ruby, C#/VB, Dart, and PHP. | [SCIP README](https://github.com/scip-code/scip/blob/main/README.md); [SCIP protocol schema](https://github.com/scip-code/scip/blob/main/scip.proto) | DOC + SRC / SOURCE-INSPECTED | Index generation is an additional build/indexing step and may lag unsaved or just-written source. |
| E18 | Sourcegraph explicitly distinguishes syntax/search navigation from compile-time precise navigation. | [Sourcegraph code navigation](https://sourcegraph.com/docs/code-navigation) | DOC / DOCUMENTED | Establishes the semantic/syntactic boundary, not suitability for this product. |
| E19 | No inspected candidate documents a complete, framework-aware, bounded `edited range -> enclosing artifact -> outbound declaration closure` operation. | E01–E18 | DOC / INFERRED | A composed implementation remains necessary unless a later candidate disproves this. |

## 4. Candidate cards

### 4.1 TypeScript 7.0.2 native LSP

**Identity and role.** TypeScript 7 is a native Go implementation. The stable 7.0.2 binary accepts
`--lsp --stdio`, synchronizes incrementally, and advertises the standard semantic requests relevant
to this research (E01–E03). Candidate use: semantic navigation behind a separate source parser.

**Plausible extraction composition.** A parser maps changed bytes to a declaration and enumerates the
identifier/member-access positions that form outbound type or schema edges. An LSP client opens the
same current buffer, then requests `textDocument/definition` or `typeDefinition` at those positions.
Returned locations can be read and parsed, queued with a visited set, and bounded by the product.
`documentSymbol` or `selectionRange` may help with ordinary named declarations, but the source parser
still owns exact extraction and schema-expression recognition because a Zod/Effect `const` may appear
only as a generic variable symbol.

This route is **feasible from documented protocol plus source-inspected server capabilities**, not
demonstrated support for the workflow. LSP returns locations rather than a stable symbol graph. It
does not promise that every syntactic reference has a definition, expose TypeScript declaration
merging as one identity, distinguish an alias hop from its target, or identify schema-valued
expressions. Repeated position queries may resolve imports and aliases in representative cases, but
that must be measured. Multiple definition locations should be preserved rather than arbitrarily
choosing one.

**Failure and trust.** The client must keep `didOpen`/`didChange` versions synchronized and reject
stale responses. Missing capability, `null`/multiple locations, diagnostics, timeout, server exit, or
budget exhaustion produces explicit partial/unresolved context. The released launcher can invoke
`npm` for typings and the server may read project files (E02); the prototype must record process,
network, plugin, and file-read behavior before making an egress claim.

**Classification: `DEPEND ON` (conditional) for semantic navigation only.** It is the released TS7
editor-integration surface with the closest fit. It is not classified as a complete extractor.

### 4.2 TypeScript internal API, legacy Compiler API, and ts-morph

**Native internal API.** Stable 7.0.2 source contains an internal `--api` process with many operations
that would directly help: snapshots, source files, symbol/type lookup, alias resolution, references,
and printing (E04). Current main expands that surface (E05), and maintainers intend to expose an API
(E06). This is strong feasibility evidence for a future lower-friction solution.

It is not a usable contract for this pass. The official release says 7.0 ships no API, the release
README marks API “not ready,” the Go packages are under `internal`, and current main is unreleased.
Reverse-engineering the hidden wire protocol would bind the product to an explicitly unsupported
surface immediately before a planned different API.

**Legacy JavaScript API and ts-morph.** The old API demonstrates useful navigation concepts, and
ts-morph packages them ergonomically (E07–E09). They do not interrogate the native TS7 program.
Running TypeScript 6 side-by-side is officially offered for utilities that still need old
programmatic access (E01), but it can disagree with TS7 syntax, defaults, module resolution, and type
behavior. It therefore cannot establish TS7 semantic truth for this product.

**Classification:** `REJECT` the internal API as a current supported dependency; revisit after a
released contract. `REJECT` legacy Compiler API/ts-morph as the TS7 semantic foundation, while
`BORROW` their navigation ergonomics and fixture shapes.

### 4.3 Tree-sitter and ast-grep

**Identity and role.** Tree-sitter is an incremental concrete-syntax parser with upstream grammars
for many languages. It gives exact byte/point ranges, smallest-containing nodes, changed ranges,
queries, and useful error-tolerant trees (E10–E12). ast-grep packages Tree-sitter matching into
declarative rules, tests, and range-bearing JSON output.

**Fit.** Both are strong for `changed bytes -> candidate syntax declarations`, especially while a
file is incomplete. Queries can recognize `type_alias_declaration`, `interface_declaration`, and
variable/class expression shapes without regex. The same artifact envelope and budget contract can
be reused with another grammar. Exact grammar coverage for TypeScript 7 syntax remains untested.

**Limit.** Neither core tool resolves a TypeScript identifier through namespace imports, renamed
imports, re-exports, path mappings, declaration merging, or the value/type namespaces. A pattern such
as `z.object(...)` cannot prove that `z` came from Zod, and a renamed wrapper cannot be recognized by
spelling. E18 independently confirms the gap between syntactic and compile-time navigation.

**Classification:** Tree-sitter is a conditional `DEPEND ON` candidate for the source-syntax half of
the initial parser-plus-LSP prototype, pending grammar and fixture gates. ast-grep is `BORROW` for
recognizer patterns and fixtures, and `REJECT` for the semantic closure role.

### 4.4 LSP 3.18

**Identity and role.** LSP is a language-neutral client/server contract. `DocumentSymbol` can provide
hierarchical enclosing ranges; selection-range results form containing parents; definition,
type-definition, and references map positions to locations (E13).

**Fit.** The TypeScript 7 native server is the concrete initial instance. Other language servers can
locate document symbols and issue definition/type-definition requests for identifiers in extracted
source. This remains realistic later-language reuse, with per-server conformance required.

**Limit.** Every relevant feature is separately negotiated. Document symbols may be a flat
`SymbolInformation[]`; the spec says its locations cannot reconstruct hierarchy. Definitions are
locations, not a guaranteed complete outbound type graph. Server-specific symbol kinds, stale
document synchronization, startup, configuration, cancellation, and missing capabilities must all be
handled. The protocol does not provide a portable schema-framework recognizer.

**Classification: `OPTIONAL INTEGRATION`.** It is a portability seam, not evidence for one universal
extractor with identical coverage.

### 4.5 SCIP

**Identity and role.** SCIP serializes language-agnostic range occurrences and semantic symbols, and
has multiple compiler-backed indexers (E17).

**Fit.** An existing fresh index can cheaply map occurrences to definitions and gives a better common
semantic graph than inventing one from LSP responses. It is suitable for repository-scale batch
analysis and could supply fallback cross-language definitions.

**Limit.** Index creation is separate from the edit loop. The inspected sources do not establish
incremental unsaved-buffer updates or framework-specific schema declarations. Requiring every target
repository to build an index would add toolchain and freshness failure modes before the TypeScript
experiment has justified them.

**Classification: `OPTIONAL INTEGRATION` for pre-indexed repositories.**

### 4.6 Zod and Effect Schema runtime models

**Identity and role.** Zod 4 explicitly documents its internal `def` as a traversable,
JSON-serializable schema model. Effect 4 exposes schema ASTs, annotations, and interpreters (E14–E16).
These are strong statements of each framework's actual schema concepts.

**Recognition boundary.** Static source recognition should enumerate provenance-bearing identifier
positions, ask the native LSP for definitions, then apply a conservative set of expression forms:

- Zod: variable declarations whose initializer originates in known Zod schema constructors or
  combinators; follow namespace/named import aliases and schema-valued local identifiers.
- Effect: schema-valued variable declarations built from `effect/Schema`, pipe/combinator calls, and
  classes extending resolved `Schema.Class`/related schema bases.
- For both: preserve the entire defining declaration's source; add outbound schema-value edges for
  referenced local definitions; record helper calls, callbacks, refinements, transforms, and unknown
  wrappers as opaque source rather than claiming a decoded shape.

TypeScript navigation alone is insufficient. Zod distinguishes input/output and documents
constructs that JSON Schema cannot represent. Effect schemas likewise describe encoding/decoding and
can contain declarations/interpreter annotations. Conversely, syntax alone cannot prove framework
provenance. The recognizer therefore needs semantic definition locations plus framework-specific
expression rules. Whether the native LSP resolves every namespace member, named import, re-export,
and local wrapper needed for this proof is unknown until the fixture spike.

Runtime traversal is useful as an offline fixture oracle for schema expressions that a controlled
test constructs. Production extraction should not import/evaluate an arbitrary edited module merely
to obtain `_zod.def` or `.ast`: module initialization is executable code, may need environment or
network access, and can observe secrets. None of the inspected framework docs establishes safe
source-only evaluation.

**Classification: `BORROW` the runtime AST concepts and explicit loss markers.**

## 5. Proposed reusable extraction contract

This is a candidate prototype contract, not a settled requirement.

```ts
type Artifact = {
  identity: {
    language: string
    path: string
    kind: "type-alias" | "interface" | "zod-schema" | "effect-schema"
    name: string
    container?: string
  }
  range: { start: number; end: number }
  source: string
  context: Array<{
    identity: string
    range: { path: string; start: number; end: number }
    source: string
    reason: "type-reference" | "schema-reference" | "merged-declaration"
    depth: number
  }>
  completeness: {
    status: "complete-within-policy" | "partial" | "unresolved"
    omitted: Array<{ identity?: string; reason: string }>
  }
  fingerprint: string
}
```

The graph walk should have independent caps for declarations, depth, total source characters, files,
external packages, and elapsed time. A deterministic queue makes truncation reproducible. Candidate
priority is: same-symbol merged parts; direct local schema/type definitions; direct imported project
definitions; then deeper project definitions. Standard-library and external-package nodes terminate
unless explicitly admitted. Each omitted edge remains named with a reason.

This queue follows outbound references only to assemble context for the directly changed root. It
does not use incoming `references` results to select unchanged dependents for additional reviews;
that separate coverage feature remains deferred under `EXTRACTION-DEFERRED-WORK.md`.

For Jev, send the root source, selected context declarations with path/name/reason labels, filename,
and the manually supplied domain text if present. Do not synthesize domain intent. If required edges
are unresolved or truncated such that the invalid state cannot be grounded, the downstream policy
should suppress the finding rather than convert uncertainty into a violation.

## 6. Material-change detection

No inspected tool supplies the product-specific answer to “did the admitted type shape materially
change?” Tree-sitter changed ranges and LSP document synchronization only identify text or buffer
changes. A candidate two-stage policy is therefore inferred from E02–E03 and E10–E13:

1. **Trigger mapping:** map old and new edit ranges to eligible declarations. Use the old tree for
   deletions and the new tree for additions; union the identities so deletion of an entire declaration
   remains observable. An edit intersecting three declarations yields three candidates.
2. **Review-projection fingerprint:** hash a deterministic projection containing declaration kind,
   name/container, semantic syntax tokens, documentation evidence chosen by policy, resolved edge
   identities, same-symbol merged parts, and the bounded closure's own fingerprints. Whitespace-only
   edits can then be ignored while an import retarget, referenced declaration change, optional marker,
   literal, union member, refinement, or schema combinator retriggers review.

There are two distinct hashes worth retaining: a source hash for exact snapshot attribution and a
review-projection hash for deduplication. Comments cannot be discarded automatically: a comment may
be the only supplied statement that a field combination is invalid. Whether all comments, JSDoc only,
or external domain text participate is a specification question.

Do not use hover/type display text or generated JSON Schema as the only materiality test. Either can
erase alias identity, source-level optionality intent, encoded/decoded distinctions, transforms, or
unrepresentable constructs (E03, E15–E16). Legacy/internal `typeToString` is not part of the supported
TypeScript 7.0 surface in any case (E01, E04).

## 7. Capability matrix

`D` = documented, `S` = source-inspected, `I` = inferred composition, `U` = unknown, `N` = not supplied.
Claim IDs give exact scope.

| Candidate | Range -> enclosing declaration | Imports / aliases | Outbound semantic closure | Cycles / budgets | Schema recognition | Incremental/material change | Cross-language |
|---|---|---|---|---|---|---|---|
| TypeScript 7 native LSP | Document/selection ranges S E03; exact declaration extraction N | Position-to-definition S E03; alias-hop detail U | Definition locations S E03; complete graph N | Product-owned I | N; product recognizer I with E14/E16 | Incremental document sync S E03; materiality N | Protocol reusable D E13; behavior server-specific |
| TypeScript 7 internal/future API | Source/snapshot methods S E04/E05 | Symbol/alias methods S E04/E05 | Referenced-symbol methods S E04/E05 | Product-owned I | N | Snapshot methods S E04/E05; materiality N | N |
| Legacy TS API / ts-morph | Documented for TS5/6 E07/E08 | Documented for TS5/6 E07/E08 | Documented for TS5/6 E07/E08 | Product-owned I | Product-owned I | Legacy incremental/refresh D E08 | N; **not TS7 semantic evidence** |
| Tree-sitter | D E10/E11 | N | N | Query bounds D; graph N | Syntax patterns D E12 | D changed ranges E11; semantics N | D E10 |
| ast-grep | D E12 | N | N | Rule/query bounds D | Syntactic patterns D | Range output D; semantics N | D through grammars |
| LSP | D E13 | Server-specific U | Definition locations D; completeness U | Client-owned I | Server-specific U | Synced docs D; materiality N | D protocol; variable servers |
| SCIP | D occurrences E17 | Indexer-specific D | D symbols/definitions E17 | Consumer-owned I | Indexer-specific U | Freshness U | D E17 |
| Zod runtime AST | N for source | Runtime object links D | Runtime traversal D E14 | D conversion policy E15 | D E14 | Runtime identity/materiality N | N |
| Effect runtime AST | N for source | Runtime object links D | Runtime traversal D E16 | Interpreter-owned D | D E16 | Runtime identity/materiality N | N |

## 8. Decision matrix and dependency gates

| Component and intended use | Classification | Reason |
|---|---|---|
| TypeScript 7 native LSP for semantic navigation | **DEPEND ON**, conditional | It is the released native editor surface and advertises the needed position-to-location requests; extraction completeness remains unproven |
| TypeScript 7 internal/future API | **REJECT** for current dependency | Released source calls the API not ready, current work is internal/unreleased, and no supported compatibility contract exists |
| Legacy TypeScript Compiler/Language Service API as TS7 semantics | **REJECT** | It operates a different TS5/6 implementation and can disagree with TS7 |
| ts-morph as TS7 semantic wrapper | **REJECT**; **BORROW** ergonomics | Its current major targets TS6; its navigation shapes remain useful design examples only |
| Tree-sitter as TypeScript source-syntax frontend | **DEPEND ON**, conditional candidate | It supplies tolerant exact ranges and changed-range support; TS7 grammar coverage and composed workflow remain unproven |
| ast-grep recognizer patterns/test style | **BORROW** | Declarative, testable syntax matching is reusable |
| ast-grep as semantic closure engine | **REJECT** | Cannot prove alias/import/type identity |
| Other LSP language-server adapters | **OPTIONAL INTEGRATION** | Practical later-language portability with negotiated, server-specific completeness |
| SCIP index consumption | **OPTIONAL INTEGRATION** | Useful common semantic graph where a fresh index already exists |
| Zod/Effect runtime AST design as recognizer oracle | **BORROW** | Captures framework semantics and loss markers without making runtime evaluation the extractor |
| Importing/evaluating edited project modules to obtain schema objects | **REJECT** | Executes user code and adds environment/side-effect/version risks not justified by extraction |

The following gates apply to the two conditional dependencies as a composed candidate. Passing one
component's gate does not establish the parser-plus-LSP workflow. Mandatory gates are license,
API/version compatibility, representative workflow conformance, degradation, and privacy/trust.

| Gate | Status | Evidence / unresolved condition | Resolving experiment |
|---|---|---|---|
| License compatibility | PASS for upstream source; packaging review remains | TypeScript is [Apache-2.0](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) and Tree-sitter is [MIT](https://github.com/tree-sitter/tree-sitter/blob/master/LICENSE); exact binary, grammar, and binding artifacts were not selected | Confirm binary, grammar, binding, and notice obligations for the exact pinned artifacts |
| Protocol / grammar compatibility | UNRESOLVED | TS7.0.2 advertises relevant LSP capabilities (E02–E03), but LSP does not guarantee extraction completeness; TS7 grammar coverage was not tested (E10–E13) | Pin server, parser binding, and grammar versions; run fixtures on that cohort and one planned upgrade |
| W1–W5 workflow conformance | UNRESOLVED | E02–E03 and E10–E13 expose primitives, not their composed behavior | Run a labeled corpus covering overlapping edits, aliases/re-exports, merged/recursive types, Zod, and Effect |
| Privacy / trust boundary | UNRESOLVED | The native launcher may invoke npm for typings and reads project files; parser behavior is local, but process/network/plugin/file access was not audited (E02) | Disable or control acquisition/plugins where possible; trace files, subprocesses, and network; assert no module evaluation |
| Parse/config/crash degradation | UNRESOLVED | Incremental sync and error-tolerant parsing exist, but stale responses, malformed edits, broken config, and server failure are unmeasured | Exercise half-written source, missing config, unresolved imports, cancellation, timeout, and server crash; require partial metadata |
| Maintenance/release health | PASS with version review | Both projects are maintained; TS7's programmatic API direction is explicitly in transition (E01, E06) | Reassess each pinned upgrade and replace LSP composition only if a released API passes the same fixtures |
| Integration/ongoing cost | UNRESOLVED | One parser walk may generate many positional LSP requests; startup, latency, and memory are unknown | Measure cold/warm startup, edit update, request count, latency, memory, and context quality on representative repositories |
| Replacement/exit cost | UNRESOLVED | The proposed artifact contract isolates results, but no second frontend has implemented it | Prove a small alternate frontend against the same fixture/result contract before claiming low exit cost |

## 9. Synthesis and disconfirmation

### Convergent patterns

1. **Ranges locate; semantic locations connect.** Tree-sitter can own exact declaration ranges;
   TypeScript 7 LSP can map selected identifier positions to definition locations. Neither surface
   supplies durable artifact identity, so the product must reconcile locations to parsed declarations
   (E03, E10–E13).
2. **Syntax and semantics are separate layers.** Tree-sitter/ast-grep offer structural selection;
   native LSP, other language servers, or SCIP can supply definition locations, with different
   completeness and freshness guarantees (E10–E13, E17–E18).
3. **Framework schemas need explicit loss handling.** Zod calls unsupported JSON Schema conversions
   unrepresentable; Effect exposes transformations/declarations through its AST and interpreters
   (E15–E16). A static extractor should preserve opaque source rather than widen silently.
4. **Stable product identity must be owned above analyzer objects.** ts-morph nodes are forgotten on
   refresh; Tree-sitter nodes need editing/reacquisition; LSP returns locations rather than durable
   IDs (E08, E11, E13).
5. **Bounded traversal is policy, not a parser feature.** Every semantic substrate needs a
   product-owned visited set, priority queue, budget, omissions, and completeness state.

### Existing-solution baseline

No single inspected solution satisfies the full workflow (E19). TypeScript 7.0 provides no supported
programmatic API. Its native LSP exposes useful positional navigation, while Tree-sitter/ast-grep
cover syntax and change localization but not aliases. The plausible initial experiment is therefore a
source parser plus the native LSP: parse declarations and reference positions, resolve those positions
to locations, parse the destinations, and bound the resulting queue. This is a feasibility inference,
not demonstrated workflow support. Schema recognition, alias hops, merging, completeness, and durable
identity remain product-owned or unresolved. The future internal API could eventually replace parts of
the composition, but it is not a current dependency contract (E01–E06).

### Strongest case against the parser-plus-native-LSP route

Position-by-position RPC may be too chatty and too lossy to reconstruct TypeScript identity. The LSP
contract does not expose alias chains or a complete outbound type graph, and it may return null or
multiple locations for merged, synthetic, incomplete, or schema-heavy code (E03, E13). The route
should be rejected if representative fixtures cannot deterministically recover imports, re-exports,
recursive/merged declarations, and schema references within the latency and request budgets. A
released, documented native API that passes the same fixtures would also supersede this composition.
No runtime evidence resolves either condition yet.

## 10. Specification and prototype handoff

| ID | Advisory implication | Evidence / counterevidence | Next decision or check | Disposition |
|---|---|---|---|---|
| H1 | Separate artifact identity, current range, exact source hash, and review-projection hash | E03/E08/E11/E13; no candidate stable-ID contract | Specify identity fields; test rename/move/format edits | Both |
| H2 | One changed range may trigger several declarations; preserve every location when native LSP returns multiple definitions | E03/E13; merged-declaration behavior unknown | Fixture two interface constituents, aliases, and overloads; record null/single/multiple results | Both |
| H3 | Use parser-enumerated outbound references plus native-LSP definition locations for minimum context | E03/E10–E13/E17; completeness unmeasured | Compare accuracy and request cost with 0/1/2-hop closures | Prototype |
| H4 | Every traversal returns completeness and omitted-edge reasons under hard budgets | E15 and E19 support explicit loss; exact budgets unknown | Sweep nodes/depth/chars/time against Jev quality and latency | Both |
| H5 | Attempt schema constructor provenance through native-LSP definition locations, then apply framework-specific source recognition | E03/E13–E16 versus E12 limitation | Aliased namespace/named imports, re-exports, wrappers, null/multiple locations, and false-positive fixtures | Prototype |
| H6 | Never execute edited modules merely to extract runtime Zod/Effect ASTs | E14/E16 plus executable-module inference; controlled fixture oracle remains useful | Specify no-evaluation boundary and verify read/process/network trace | Specification |
| H7 | Preserve transforms/refinements/helpers as source and mark unsupported interpretation | E15/E16 | Fixture each opaque construct; ensure no widened “complete” projection | Both |
| H8 | A finding requires grounding in complete-enough evidence; partial/unresolved context defaults to no finding | Current product assumption; E15/E19 | Define minimum evidence per rule and suppression telemetry | Specification |
| H9 | Reuse one artifact/graph/budget contract across future language frontends | E10/E13/E17; parity varies | Implement only after TypeScript prototype establishes needed contract | Defer until prototype |
| H10 | Keep manually supplied domain text and filename separate from extracted semantic context | Research brief; no tool discovers domain intent | Define request fields and precedence without inference | Specification |
| H11 | Do not add incoming-dependency selection for unchanged review targets in the initial extraction scope | `EXTRACTION-DEFERRED-WORK.md`; LSP references exist but deterministic low-effort conformance is unproven (E03/E13) | Revisit only if the chosen tool makes it reliable and low effort | Deferred |

## 11. Unresolved questions

1. Is the unit of review an edited declaration constituent, a merged TypeScript symbol, or both as
   root plus mandatory context?
2. Which comments participate in materiality: JSDoc, all comments inside the declaration, immediately
   leading comments, or only separately supplied domain text?
3. What context budgets preserve Jev accuracy: direct references only, depth two, or an adaptive
   priority based on source size and edge kind?
4. Do external package declarations ever enter source context, or are package/name/version plus an
   unresolved edge sufficient?
5. How should generic instantiations be shown: original generic declaration plus type arguments,
   checker-expanded type, or both within budget?
6. Which Zod/Effect versions and combinators define initial recognizer coverage, and what source form
   is required before a wrapper/helper can be called a schema definition?
7. How does the native TypeScript 7 LSP behave for renamed/namespace imports, re-exports, path
   mappings, declaration merging, overloads, and references in half-written schema expressions?
8. Can one native LSP process meet edit-loop startup, synchronization, positional-request, and memory
   budgets in monorepos and broken intermediate states? No timing evidence exists in this report.
9. What precise completeness threshold is sufficient for each type-design rule? “Partial” cannot be a
   single undifferentiated boolean if some omitted edges are irrelevant.

## 12. Limitations and primary-source index

- This was documentation and source inspection only. No candidate was installed, executed, benchmarked,
  or tested against fixtures.
- No paid Jev request or agent-host run occurred.
- TypeScript 7.0.2 native-LSP and internal-API source was inspected but not launched. The official
  release provides no supported programmatic API; internal and current-main API work establishes
  feasibility only.
- Framework recognition coverage is inferred from documented runtime schema models; arbitrary helper
  functions and metaprogramming remain unresolved.
- Cross-language review sampled Tree-sitter, LSP, and SCIP as three materially different seams. It did
  not audit each language server/indexer or every parser ecosystem.
- Package maintenance metadata is point-in-time and not proof of runtime behavior.

Primary sources: [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/),
[TypeScript 7.0.2 native source](https://github.com/microsoft/typescript-go/tree/typescript/v7.0.2),
[current native API source at `f29aeb9`](https://github.com/microsoft/TypeScript/tree/f29aeb9f825d96feea27841f3f7342dbf0df68a8/tsc/internal/api),
[native API discussion](https://github.com/microsoft/typescript-go/discussions/481),
[legacy TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API),
[ts-morph docs](https://ts-morph.com/),
[Tree-sitter docs](https://tree-sitter.github.io/tree-sitter/),
[ast-grep repository](https://github.com/ast-grep/ast-grep),
[LSP 3.18 specification sources](https://github.com/microsoft/language-server-protocol/tree/gh-pages/_specifications/lsp/3.18),
[SCIP](https://github.com/scip-code/scip),
[Zod Core](https://zod.dev/packages/core),
[Zod JSON Schema](https://zod.dev/json-schema), and
[Effect 4 Schema](https://effect.website/docs/v4/schema/introduction).
