# Bend support findings

**Purpose:** Record Bend-specific assumptions, counterexamples, and validation for reuse when adding source languages.
**Status:** Maintained advisory findings and validation index.
**Authority:** Implementation/validation evidence and product-specification advisory material. The [active review contract](type-function-review-proposal.md#branch-contracts) owns requirements; this report does not establish new ones.
**Expected use:** Review the bounded Bend addition and reuse its lessons alongside the [language-support guide](adding-language-support.md).
**Lifecycle:** Update after changes to Bend syntax, Base leaf assumptions, source extraction, or validation. Review whenever compiler/parser upgrades or new counterexamples affect the declared scope; consolidate superseded advice into the active guide and contract.

## Scope and source evidence

This change adds explicit top-level Bend 2 datatypes to the existing type-shape
v1 pipeline. The concrete kind is `datatype`. It uses a small TypeScript surface
extractor, requiring no new dependency, native grammar binary, or Bend executable
in the installed product. Runtime extraction never executes edited source,
fetches packages, or executes imports. The shared resolver captures selected
relative `.bend` supporting files through leading explicit alias imports,
including transitive references. Functions, laws, proofs, hub/bare/absolute
imports, and dependent/computed types are deferred. The active contract states the exact
header, constructor, indentation, parameter, and type-expression profile.

Local primary sources inspected:

- Bend checkout `/workspace/bend/bend`, commit
  `1adb0a61916b95de79d3541537462d0bf625f9d3`: `bend2/bend.ts`, especially
  `book_load` (lines 952–1015: leading imports, plain paths, unique aliases),
  `parse_reso` (1667–1679: first dotted segment resolution), `parse_fresh`
  (2419–2426: local binding conflicts), `parse_book`, and grammar comments; also
  `bend2/base.bend` and `bend guide`.
- `bend-idea` checkout `/workspace/formal-proofs/bend-idea`, commit
  `67659f5fd5faf03e0fe00cd3d87217f2ece783c7`: its
  `BendSurfaceParser.scala` and declaration/constructor boundaries. This is a
  tolerant editor parser, not evidence of compiler validity.
- Installed `bend 2.0.34`, used only for synthetic offline fixture checks.
  The installed compiler is a separate validation tool; the source checkout
  identity is not asserted to identify its installed bytes.

The extraction is independently implemented. Neither local project becomes a
product dependency, and no compiler source is vendored. The compiler's import
loader establishes that the literal `import Base` selects its bundled prelude;
Bend modules share datatype/def/law bindings, while constructors have their own
namespace. Documentation and source inspection establish these design facts;
only the fixture checks below establish observed compiler behavior.

## Assumptions and counterexamples

The supported profile treats a short, explicit set of Base names as leaves only
when `import Base` appears before declarations. It does not project Base source
or establish the installed user's compiler version. `List`, `Maybe`, `Result`,
and `Array` are composite supporting evidence, not free wrappers. Applications
still traverse their type arguments and same-file declarations. Future expansion
must explicitly decide how imported library evidence is captured and refreshed.

Explicit relative alias imports now supply selected repository source rather
than free builtin assumptions. `R.Receipt` preserves its written reference
identity and resolves the target name `Receipt` in the imported file. The
compiler uses the first dotted segment as the alias; a longest-suffix or global
text-name search would manufacture bindings. Duplicate aliases and local
binding/constructor conflicts reject the file; parameter and earlier-field
shadowing retain omissions. Independent review also found `import Base` plus
an alias `Word` and reference `Word.Nil`: both Base and the aliased module can
bind the written name. The extractor now refuses closure for aliases matching
the inspected Base type/def/law/constructor namespace prefixes in either import
order; those qualified references cannot trigger an imported capture. A bare
builtin spelling that is an alias is not erased as a leaf. This name-only
refusal set is tied to the source revision above and requires review on Base
profile changes; it does not claim support for arbitrary compiler versions.
Hub, bare, absolute, and cross-language imports
cannot supply evidence. This scope intentionally narrows the compiler's loader.

Traversal uses the existing file/read/work/depth/tree ceilings. Selection,
containment, exclusions, Git-ignore, and symlink checks occur before supporting
source reads. Stable supporting captures are reused across changed roots,
static evidence cycles terminate, and source or import-binding changes invalidate prepared
evidence. Terminating static reference traversal does not establish compiler
loadability of import cycles. Importing a datatype does not turn it into an
edited root.

Bend types can be terms. `Word(32n)`, quantity-dependent `Kind(a)`, dependent
field references, equalities, and binder-bearing function types cannot be made
complete by extracting capitalized words. Unsupported syntax produces omitted
edges; closure-dependent rules do not run. Root-only custom rules may accept
marked partial evidence. Malformed headers, strings in any non-comment source,
and unknown top-level forms reject the file conservatively. These restrictions
are useful first boundaries, not broad Bend language coverage.

Independent review found a competing-name counterexample: a `type T` followed
by `def T` or `law T` initially collapsed into a set and allowed complete
supporting evidence for `T`. The implementation now rejects this ambiguity in
both declaration orders. A qualified `def T.show` retains its full binding name
and does not conflict with bare `T`. This generalizes beyond Bend: collect
binding identities and conflicts before deciding a named edge is resolved.

Surface extraction does not validate application arity, type kinds, termination,
compiler acceptance, laws, or proofs. “Complete” refers to the selected evidence
profile required by the rule, not proof of semantic correctness.

## Validation and limits

[Extraction tests](../src/direct-event/bend-analyzer.test.ts) cover same-file
closure, parameters, Base assumptions and shadowing, exact source/ranges,
ambiguous names, unsupported syntax, cycles, and shared declaration/reference
budgets. [Pipeline tests](../src/direct-event/bend-pipeline.test.ts) cover Add and
Update attribution, provider rendering and dispatch, omission gates, supporting
source freshness, relative/transitive aliases in generic payloads, cycles,
read-once sharing, source and import-binding invalidation, graph ceilings, and
refusal to read excluded, ignored, symlinked, outside-root or cross-language
targets.

The following live, compiler, and package records predate the cross-file
amendment. They remain evidence for their original same-file fixtures and
revision; they do not establish new cross-file live or installed-platform
validation.
Ordinary tests remain deterministic and offline.

The [pre-execution declaration](../evidence/bend-support/paired-declaration-1.json)
and [live record](../evidence/bend-support/paired-designs.json) cover six Jev
requests through Effect DecisionModel and the production analyzer/renderer.
Three independent-status/optional-payload payment fixtures scored
`0.82`, `0.82`, `0.81`; three constructor-separated fixtures scored `0.06`
each, meeting the declared `0.7` threshold contrast. All six transport responses
were HTTP 200. Retained evidence contains hashes, probabilities, contract states,
and timings; no credentials, raw backend material, or source-bearing responses.
The runnable script preserves the original declaration and refuses to overwrite
an existing attempt. This demonstrates one synthetic contrast, not general
accuracy across Bend or every Noul rule.

The [compiler record](../evidence/bend-support/compiler-fixtures.json) records
`bend <synthetic-fixture> --check-only`: both declarations and three valid
constructor examples were accepted; three forbidden constructor arities were
rejected. No proof-coverage or kernel-verdict claim follows from these checks.
The product does not run this compiler command on users' files.

[Linux arm64 package conformance](../evidence/bend-support/package-linux.json)
checks a clean production installation, actual packaged Bend extraction and
same-file payload expansion, package doctor, and the existing controlled host
lifecycle. [macOS arm64 package conformance](https://github.com/dearlordylord/hapsland/actions/runs/36814156108)
also passed at code commit `68f358a1fc4614ee794ce3fe8a7f587fdd06665c`,
including the installed Bend payload check and packaged setup journeys. No
Bend-native model acknowledgement, unprompted repair experiment, or normal host
trust is claimed here. The Rust parent PR's native evidence remains evidence
for that parent revision.

Reproduce the local compiler checks with
`node scripts/check-bend-support-fixtures.mjs`. A new paid experiment needs a
new attempt declaration and record paths before running
`node scripts/run-bend-jev-pairs.mjs --execute-paid`; ordinary invocation cannot
send requests. Run package conformance with
`node scripts/run-clean-package-conformance.mjs` using the repository's pinned
Node runtime.

The cross-file amendment has separate [split-file live evidence](../evidence/cross-file-support/paired-designs-1.json)
and a [preexecution declaration](../evidence/cross-file-support/declaration-1.json).
Eight bounded requests used actual observation preparation and rendering: Rust
bad probabilities 0.87/0.84 versus good 0.06/0.06; Bend bad 0.78/0.79 versus good
0.07/0.06, with a 0.7 threshold. All four synthetic fixtures passed compiler
checks. Supporting-file mutation invalidated each preparation; restoration made
it current again. [Linux installed-package evidence](../evidence/cross-file-support/linux-package.json)
separately verifies Rust and Bend cross-file preparation in production-only
installations. These results establish these cases, not general review accuracy
or native-agent response to cross-file advice. The declared request cap was
respected and no source-bearing responses were retained.
