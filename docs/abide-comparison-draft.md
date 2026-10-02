# Hapsland and Abide: comparison draft

**Purpose:** Draft a README-facing comparison of the products' main architectural choices and requirements.
**Status:** Editorial draft, not an accepted public comparison.
**Authority:** Design proposal informed by advisory research; not a product contract or a general compatibility claim.
**Expected use:** Review the comparison and rationale before adopting them in public documentation.
**Lifecycle:** When this comparison is accepted for publication, consolidate the approved text into README.md or a maintained comparison page, update inbound links, and delete this draft. Move any adopted product requirement to its existing contract owner. Recheck claims against the compared implementations before publication.

This comparison concerns review inputs and data boundaries. Rule origins, loading mechanisms, and easily added configuration features do not justify a separate product. Abide observations refer to version 0.0.7 and upstream commit `533a3d25d5d537bf9005f2f48ce5b18837fd5c74`; Hapsland observations have the implementation and validation limits recorded in the research below.

| Architectural question | Hapsland | Abide |
| --- | --- | --- |
| **What is reviewed?** | A changed declaration, such as a type or function, in its current state. | A code change: the diff of an individual edit or the agent's entire turn. |
| **How is context collected?** | Related definitions are collected within file permissions and budgets. Each rule's evidence requirements are checked against the collected context. | Review receives a diff. Rules requiring the rest of the repository can be marked `deferred`, meaning they are not checked; they do not automatically run later. |
| **Does review receive the user's task?** | Currently, the task text is not sent. Review uses code and related definitions. | Review may receive up to 600 characters of the latest suitable user task alongside the diff, if that text can be obtained. |
| **How can users restrict file access?** | Configured exclusions are checked before Hapsland reads the declaration or supporting files. | There are built-in filename exclusions. A rule's configurable file scope limits that rule's review inputs; it is not a general prohibition on local reading or storage. |
| **What is stored on disk?** | Collected review code and pending advice remain in memory. Hapsland's activity history does not contain source code. | Whole-turn review uses Git snapshots. Local session state can retain original source from affected files and the user task. |

## Why a separate product?

Hapsland develops a coordinated review process: select a declaration, authorize access to related files, collect sufficient context, and review that code. The boundaries for reading, transmitting, and retaining data are requirements of that process.

Such a mode could be implemented in Abide. The rationale for a separate product is independent development and ownership of this set of requirements, rather than a technical impossibility of contributing them upstream. This comparison does not establish that Hapsland produces more accurate advice.

The current omission of task text is an input and data-sharing choice, not an inherent technical limitation. Hapsland's settings govern Hapsland; they do not restrict the agent runtime or Abide.

## Coexistence and evidence

Joint operation was observed in the tested Claude Code and Codex scenarios. Those observations do not establish compatibility across arbitrary versions, platforms, or installed profiles. Abide's access and storage behavior must be considered independently when using both products.

The underlying advisory research separates product approaches, technical details, and real-agent coexistence:

- [Approaches and requirements](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-ADVISORY-2026-10-02-ABIDE-APPROACHES.md).
- [Technical comparison](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-ADVISORY-2026-10-02-ABIDE-TECHNICAL.md).
- [Coexistence investigation](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-ADVISORY-2026-10-02-ABIDE-COEXISTENCE.md) and [retained native evidence](../evidence/native-coexistence/index.json).
- [Quality pilot](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-ADVISORY-2026-10-02-ABIDE-QUALITY-RESULTS.md), [detection results](../evidence/abide-quality/summary.json), and [blindly scored native repairs](../evidence/abide-quality-native/repair-comparison.json). This selected synthetic pilot found different detection strengths, but no repair advantage for Hapsland over Abide in the tested Codex sessions.
