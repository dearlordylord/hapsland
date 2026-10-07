# Hapsland and Abide

**Purpose:** Explain Hapsland's relationship to Abide, architectural differences, joint operation and the measured comparisons.
**Status:** Maintained comparison documentation.
**Authority:** Maintained explanatory documentation; product contracts own behavior and linked research establishes only its measured evidence.
**Expected use:** Understand why Hapsland is a separate product, how the tools can work together, and where to inspect comparison methodology and results.
**Lifecycle:** Update when review inputs, access boundaries, hook integration or the current studies change. Review joint-operation claims when either tool or agent runtime changes; replace superseded findings and keep requirements in their contract owners.

This comparison concerns review inputs and data boundaries. Rule origins, loading mechanisms, and easily added configuration features do not justify a separate product. Abide observations refer to version 0.0.7 and upstream commit `533a3d25d5d537bf9005f2f48ce5b18837fd5c74`; Hapsland observations have the implementation and validation limits recorded in the research below.

| Architectural question | Hapsland | Abide |
| --- | --- | --- |
| **What is reviewed?** | A changed declaration, such as a type or function, in its current state. | A code change: the diff of an individual edit or the agent's entire turn. |
| **How is context collected?** | Related definitions are collected within file permissions and budgets. Each rule's evidence requirements are checked against the collected context. | Review receives a diff. Rules requiring the rest of the repository can be marked `deferred`, meaning they are not checked; they do not automatically run later. |
| **Does review receive the user's task?** | Currently, the task text is not sent. Review uses code and related definitions. | Review may receive up to 600 characters of the latest suitable user task alongside the diff, if that text can be obtained. |
| **How can users restrict file access?** | Configured exclusions are checked before Hapsland reads the declaration or supporting files. | There are built-in filename exclusions. A rule's configurable file scope limits that rule's review inputs; it is not a general prohibition on local reading or storage. |
| **What is stored on disk?** | Collected review code and pending advice remain in memory. Hapsland's activity history does not contain source code. | Whole-turn review uses Git snapshots. Local session state can retain original source from affected files and the user task. |

## Credential lookup in setup and hooks

This targeted credential comparison was source-inspected on 2026-10-04 against
Abide 0.0.8, commit `a4c33c5e0f8fe5a8fa30c1757c6d54598da073ac`; it updates only
the credential scope, not the 0.0.7 native observations below. No Abide credential
flow or provider request was executed for this investigation.

Abide's [shared credential resolver](https://github.com/coldteadotai/abide/blob/a4c33c5e0f8fe5a8fa30c1757c6d54598da073ac/packages/cli/src/lib/credentials.ts#L28-L109)
searches process environment, repository `.env.local`, repository `.env`, then
`~/.abide/.env`, choosing the first source with a nonempty supported key.
[Init](https://github.com/coldteadotai/abide/blob/a4c33c5e0f8fe5a8fa30c1757c6d54598da073ac/packages/cli/src/commands/init.ts#L49-L55)
and [session-start hooks](https://github.com/coldteadotai/abide/blob/a4c33c5e0f8fe5a8fa30c1757c6d54598da073ac/packages/cli/src/hooks/sessionStart.ts#L64-L76)
use that resolver; edit and stop hooks do too. A new hook process reads the file
sources itself rather than depending on environment injected during installation.
The reader extracts supported credential fields without loading the whole file
into process environment. Login writes an owner-only file; it does not use a
native credential store. These are SRC / SOURCE-INSPECTED claims.

Hapsland setup, status and hook dispatch now share [credential input lookup](../packages/runtime-inputs/src/credentials/input.ts).
They read the selected key from process environment, repository `.env.local`,
repository `.env`, then the user Hapsland configuration directory's `.env`.
The native saved-key resolver remains the fallback for the default reference.
Dev-install no longer injects checkout dotenv into its child environment. The
fresh-process regression exercises file lookup with no inherited key; native
agent delivery and provider validity remain separate checks.

The advisory classification is **BORROW** for a shared resolver whose persistent
sources are read by both setup and runtime. This does not adopt Abide's storage
format, key names or precedence as Hapsland requirements. Abide's
[init self-test](https://github.com/coldteadotai/abide/blob/a4c33c5e0f8fe5a8fa30c1757c6d54598da073ac/packages/cli/src/commands/init.ts#L16-L29)
inherits installer environment and checks only exit status, while the
[hook runner](https://github.com/coldteadotai/abide/blob/a4c33c5e0f8fe5a8fa30c1757c6d54598da073ac/packages/cli/src/lib/hookRunner.ts#L25-L51)
also exits successfully after a missing-key notice or handled error. That test is
**REJECT** as proof of credential availability in a separately launched agent.
The proposed Hapsland acceptance check is a fresh hook process resolving the
configured persistent source without a key injected by the installer; native
agent execution and provider validity remain separate checks.

## Running both tools together

Hapsland and Abide can operate alongside each other in Codex CLI and Claude Code. Keep both tools' hook registrations; each reviewer retains its own rules and configuration. A finding from one tool does not replace the other tool's review.

The selected source-checkout trials with Abide 0.0.7, Codex CLI 0.155.1 and Claude Code 2.1.218 observed delivery from both tools, independent reviewer failures, and preservation of registrations across installation/uninstallation in both orders. Thirteen of fourteen native attempts demonstrated their declared checks; one incomplete attempt is retained separately. Four installer cells passed. These observations concern the declared source-checkout setup, rather than a newly validated installed Hapsland release or every hook ordering.

File exclusions are independent. In the tested exclusion cases, Hapsland made no review request while Abide still reviewed the synthetic file. Configure access and review scope for both tools separately. See the [coexistence investigation](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-ADVISORY-2026-10-02-ABIDE-COEXISTENCE.md) and its [native evidence index](https://github.com/dearlordylord/hapsland-research/blob/master/evidence/native-coexistence/index.json).

## Measured review and repair

The [study navigation](review-studies.md) connects the comparisons to readable code examples. The [large-declaration study](abide-large-declaration-study.md) covers six realistic synthetic domains, compact and larger layouts, valid controls, independent repair checks and the [declared methodology](abide-large-declaration-study.md#methodology). The [contextual and rule-coverage study](abide-contextual-review-study.md) explains the separate matrices across the nine rules.

These studies distinguish detection, feedback delivery, agent repair and preservation of valid behavior. Their input populations and repetitions differ, so their counts must not be combined into a general product ranking. They show selected workflow differences and counterexamples; they do not establish that Hapsland is universally better or that declaration size alone causes a difference.

## Why a separate product?

Hapsland develops a coordinated review process: select a declaration, authorize access to related files, collect sufficient context, and review that code. The boundaries for reading, transmitting, and retaining data are requirements of that process.

Such a mode could be implemented in Abide. The rationale for a separate product is independent development and ownership of this set of requirements, rather than a technical impossibility of contributing them upstream. This comparison does not establish that Hapsland produces more accurate advice.

The current omission of task text is an input and data-sharing choice, not an inherent technical limitation. Hapsland's settings govern Hapsland; they do not restrict the agent runtime or Abide.

## Coexistence and evidence

Joint operation was observed in the tested Claude Code and Codex scenarios. Those observations do not establish compatibility across arbitrary versions, platforms, or installed profiles. Abide's access and storage behavior must be considered independently when using both products.

The underlying advisory research separates product approaches, technical details, and real-agent coexistence:

- [Approaches and requirements](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-ADVISORY-2026-10-02-ABIDE-APPROACHES.md).
- [Technical comparison](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-ADVISORY-2026-10-02-ABIDE-TECHNICAL.md).
- [Coexistence investigation](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-ADVISORY-2026-10-02-ABIDE-COEXISTENCE.md) and [retained native evidence](https://github.com/dearlordylord/hapsland-research/blob/master/evidence/native-coexistence/index.json).
- [Quality pilot](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-ADVISORY-2026-10-02-ABIDE-QUALITY-RESULTS.md), [detection results](https://github.com/dearlordylord/hapsland-research/blob/master/evidence/abide-quality/summary.json), and [blindly scored native repairs](https://github.com/dearlordylord/hapsland-research/blob/master/evidence/abide-quality-native/repair-comparison.json). The [fresh unrestricted contextual campaign](https://github.com/dearlordylord/hapsland-research/blob/master/evidence/abide-contextual-confirmation/comparison.json) found 12/12 Hapsland repairs, 1/12 Abide-arm repairs and 0/12 no-review repairs on four new duplicate-encoding cases repeated three times. Hapsland also produced false warnings on all six clean observations; independent facts were preserved under the cooperative agent policy. These selected studies establish conditional workflow differences, not general advice-quality superiority.
