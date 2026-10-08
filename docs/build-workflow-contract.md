# Source-build recovery contract

**Purpose:** Define the operational requirements for recovering source builds after failed or interrupted writers.
**Audience:** Contributors building from source, including coding agents; build and release maintainers.
**Status:** Accepted requirements for retained build custody; implementation and platform qualification remain separate.
**Authority:** Accepted internal build-workflow contract recording [#257](https://github.com/dearlordylord/hapsland/issues/257) and the owner's 2026-10-08 instruction to document its requirements here. This is not an end-user feature or a release-support declaration.
**Expected use:** Change build ownership or recovery, assess the implementation against the required outcomes, and distinguish requirements from recovery mechanics.
**Lifecycle:** Maintain through accepted changes to build ownership and recovery requirements. Review whenever writer lifetime, concurrent admission, retained records, or the recovery boundary changes; update operational instructions and evidence in their existing owners.

## Scope and operational goal

A failed source build must have a documented path back to a usable build checkout
without guessing which ownership records can be removed or interfering with
active writers. This applies to development installation and release preparation
that build from source. End users installing ready-made executables do not run
this recovery tooling.

Build custody is the ownership information retained for a build and its writers:
the build lock, lease, all registered process groups, and any admission records.
An exited supervisor alone is insufficient evidence that its children stopped.

## Required outcomes

1. **Explicit recovery.** Contributors must have an exact documented stopped-writer
   reconciliation procedure when retained custody prevents another build.
2. **Live-writer exclusion.** Recovery must establish that every recorded owner,
   group leader and process group has stopped. It must exclude concurrent build
   admission throughout inspection and reconciliation.
3. **Whole-custody reconciliation.** Recovery must handle the lock, lease and all
   registrations together. Removing one ownership marker must not permit a new
   build to mix its lease with stale registrations from the previous build.
4. **Preserved ambiguity and evidence.** Live or potentially reused identities,
   unreadable, incomplete or malformed records, and changing ownership must block
   recovery. Ambiguous records must remain available for investigation; safely
   reconciled records must be preserved together with the stopped-writer audit.
5. **Recoverable interruption.** A failed or interrupted recovery must leave the
   custody available for a safe retry or fully reconciled with its evidence
   preserved. It must not leave partially cleared ownership that prevents retry.
6. **Usable next build.** After successful reconciliation, the next build must
   acquire fresh ownership without stale-token registrations poisoning it.
7. **Useful failure diagnostics.** If both build work and its cleanup fail, the
   original build error and the cleanup error must remain observable.

## Verification and implementation boundary

The required regression uses a real failed child and recovery, then demonstrates
that stale registrations cannot poison the next build. Per the owner's timing
instruction, extended slow cases remain manual; quick ownership checks may run
automatically. Commands, timing classification and evidence limits belong to the
[testing matrix](testing-matrix.md#recovering-retained-build-custody).

Kernel locking, atomic archival, cache layout, `cc` and Node-API headers are
implementation choices and source-build prerequisites, not the required business
outcomes. Their current operational constraints belong to that recovery procedure.

The original incident's initial retention cause remains unconfirmed. The verified
recovery behavior does not establish that cause, repair the triggering source
compilation failure, or qualify an installation or platform release.
