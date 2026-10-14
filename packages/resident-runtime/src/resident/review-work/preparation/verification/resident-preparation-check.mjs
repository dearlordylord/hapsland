import { createGraphMachine } from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
import assert from "node:assert/strict"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, lstat, rm, readdir, readlink } from "node:fs/promises"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Cause from "effect/Cause"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { resolveGraphUnit as __resolveGraphUnit } from "@hapsland/source-analysis/testing/native-graph"
import {
  eligibleNamedPath as __eligibleNamedPath,
  DEFAULT_DIRECT_FILE_POLICY
} from "@hapsland/native-observation/direct-event/selection"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { performGraphServiceEffect } from "@hapsland/source-analysis/direct-event/graph-resolution"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import {
  hostNatural,
  productValue as __productValue,
  fromProductValue,
  list,
  unlist
} from "@hapsland/source-artifacts/direct-event/value/codec"
import { createBendResolver as __createBendResolver } from "../../../../../../source-analysis/src/direct-event/graph-resolution/consumer.ts"
import { createOwnedArtifactDriver } from "../../composition/owned-artifact-driver.mjs"
import * as Ref from "effect/Ref"
import { initialCanonical, projectCanonical as __projectCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { residentTransaction } from "../../../state/resident/transaction.ts"
import { residentCapacity } from "../../../state/resident/capacity.ts"
import { residentRuntime } from "../../../state/resident/runtime.ts"
import { providerTransaction } from "../../../state/resolver-custody/resident-provider-permit.mjs"
import { retireRound as __retireRound } from "../../../state/capacity/rounds.ts"
import { completePreparation } from "../../../state/capacity/preparation.ts"
import { createResidentOwnerTransaction } from "../../../state/resolver-custody/resident-owner-transaction.mjs"
import { createAdviceTailMachine, createPostPreparationMachine } from "../post-preparation-dispatcher.mjs"
import {
  inspectGraphFile as __inspectGraphFile,
  combinedAnalyzerMaterializationPreflight as __combinedAnalyzerMaterializationPreflight,
  analyzeTypeFile as __analyzeTypeFile
} from "@hapsland/source-analysis/direct-event/analyzer"
import { resize as __resize } from "../../../state/capacity/reservations.ts"
import { analyzeFunctionFile as __analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"
import { analysisWorkspaceBytes as __analysisWorkspaceBytes } from "../../../work-ownership/workspace.ts"
import { configuredRules, advicee } from "./preparation-fixtures.mjs"
import { nativePostPreparationSource } from "./native-post-preparation-child.mjs"
import { consumeRetainedPreparation } from "./retention-consumer.mjs"
import { createVerificationPreparationForeign as createPreparationForeign } from "./preparation-foreign-reference.mjs"
import { prepareObservation } from "@hapsland/review-execution/direct-event/pipeline"
import {
  TYPE_INPUT_CONTRACT,
  FUNCTION_INPUT_CONTRACT as __FUNCTION_INPUT_CONTRACT
} from "@hapsland/review-definition/rules/targets"
const twoDeclarations = {
  path: "root.py",
  source: "from leaf import Foo\nclass Root:\n first: Foo\nclass Second:\n second: Foo\n",
  contracts: [{ $: "PreparationSelection.TypeContract" }],
  expected: { selected: 2n, units: 2 }
}
const oneDeclaration = {
  path: "single.py",
  source: "from leaf import Foo\nclass Root:\n first: Foo\n",
  contracts: [{ $: "PreparationSelection.TypeContract" }],
  expected: { selected: 1n, units: 1 }
}
const mixedContracts = {
  path: "mixed.ts",
  source: "export interface Foo { value: string }\nexport function run(value: Foo): Foo { return value }\n",
  contracts: [{ $: "PreparationSelection.TypeContract" }, { $: "PreparationSelection.FunctionContract" }],
  expected: { selected: 2n, units: 2 }
}
// Expectations describe each physical input independently of observed output.
const scenario = (
  name,
  fixture,
  { expected = fixture.expected, compareNative = false, retentionMode = name } = {}
) => ({ name, fixture, expected, compareNative, retentionMode })
const multiCandidate = { ...twoDeclarations, candidates: ["root.py", "leaf.py"], expected: { selected: 3n, units: 3 } }
const languageRoots = [
  [
    "go",
    {
      path: "root.go",
      source: "package fixture\ntype Root struct { Value string }\n",
      files: { "go.mod": "module example.test/fixture\ngo 1.27\n" }
    }
  ],
  ["rust", { path: "root.rs", source: "pub struct Root { pub value: String }\n" }],
  ["bend", { path: "root.bend", source: "type Root is Data:\n  Root{}\n" }]
].map(([language, fixture]) =>
  scenario(
    "retention-owned-" + language + "-success",
    { ...fixture, contracts: [{ $: "PreparationSelection.TypeContract" }], expected: { selected: 1n, units: 1 } },
    { compareNative: true, retentionMode: "retention-owned-success" }
  )
)
const scenarios = [
  ...languageRoots,
  scenario("dependency-then-candidate", multiCandidate, { compareNative: true }),
  scenario(
    "normalized-repeat-candidate",
    { ...twoDeclarations, candidates: ["root.py", "./root.py"], expected: { selected: 4n, units: 4 } },
    { compareNative: true }
  ),
  scenario(
    "denied-second-candidate",
    { ...twoDeclarations, candidates: ["root.py", "absent.py"], observationStatus: "incomplete" },
    { compareNative: true }
  ),
  scenario("two-roots", twoDeclarations, { compareNative: true }),
  scenario("rules-replaced-after-capture", twoDeclarations, { compareNative: true }),
  scenario("unused-rules-getter", twoDeclarations, { expected: { selected: 0n, units: 0 } }),
  scenario("first-refused", twoDeclarations, { expected: { selected: 2n, units: 1 } }),
  scenario("parent-cancel-between-reads", twoDeclarations),
  scenario("parent-cancel-late-success", twoDeclarations),
  scenario("parent-cancel-late-rejection", twoDeclarations),
  scenario("parent-cancel-finalization-gate", twoDeclarations),
  scenario("resize-refused", twoDeclarations, { expected: { selected: 0n, units: 0 } }),
  scenario("mixed-contracts", mixedContracts, { compareNative: true }),
  scenario("retention-success", twoDeclarations),
  scenario("retention-before-flow", twoDeclarations),
  scenario("retention-owner-claimed", twoDeclarations),
  scenario("retention-after-revision", twoDeclarations),
  scenario("retention-fault-owner-claimed", twoDeclarations),
  scenario("retention-fault-after-revision", twoDeclarations),
  scenario("retention-cached-clear", twoDeclarations),
  scenario("retention-joined-claimed", twoDeclarations),
  scenario("retention-joined-pending", twoDeclarations),
  scenario("retention-owned-success", twoDeclarations),
  scenario("retention-owned-cached-clear", twoDeclarations),
  scenario("retention-owned-joined-claimed", twoDeclarations),
  scenario("retention-owned-after-revision", twoDeclarations),
  scenario("retention-owned-fault-after-revision", twoDeclarations),
  scenario("retention-owned-before-flow", twoDeclarations),
  scenario("retention-owned-before-enqueue", twoDeclarations),
  scenario("retention-owned-after-enqueue-ack", twoDeclarations),
  scenario("retention-owned-after-queue-commit", twoDeclarations),
  scenario("retention-owned-fault-after-queue-commit", twoDeclarations),
  scenario("retention-owned-fault-after-enqueue-ack", twoDeclarations),
  scenario("retention-owned-preinstall-cancel", twoDeclarations),
  scenario("retention-owned-constructor-fault", twoDeclarations),
  scenario("retention-owned-duplicate-active", twoDeclarations),
  scenario("retention-owned-joined-pending", twoDeclarations),
  scenario("retention-owned-joined-pending-restore-fault", twoDeclarations),
  scenario("retention-owned-fault-reuse-claim", twoDeclarations),
  scenario("retention-owned-fault-clear-register", twoDeclarations),
  scenario("retention-owned-fault-clear-release", twoDeclarations),
  scenario("retention-owned-fault-joined-append", twoDeclarations),
  scenario("retention-owned-fault-clear-shared-release", twoDeclarations),
  scenario("retention-owned-fault-clear-cleanup-receipt", twoDeclarations),
  scenario("retention-cached-finding", twoDeclarations),
  scenario("retention-owned-cached-finding", twoDeclarations),
  scenario("retention-cached-finding-standalone", twoDeclarations),
  scenario("retention-owned-cached-finding-standalone", twoDeclarations),
  scenario("retention-owned-cached-finding-standalone-cutoff", twoDeclarations),
  scenario("retention-owned-cached-finding-standalone-insert-ack", twoDeclarations),
  scenario("retention-owned-cached-finding-standalone-inspection", twoDeclarations),
  scenario("retention-cached-finding-standalone-inspection-single", oneDeclaration),
  scenario("retention-owned-cached-finding-standalone-inspection-single", oneDeclaration),
  scenario("retention-owned-cached-finding-standalone-barrier", twoDeclarations),
  scenario("retention-cached-finding-standalone-barrier-mixed", oneDeclaration),
  scenario("retention-owned-cached-finding-standalone-barrier-mixed", oneDeclaration),
  scenario("retention-cached-finding-standalone-barrier-mixed-remove-ack", oneDeclaration),
  scenario("retention-owned-cached-finding-standalone-barrier-mixed-remove-ack", oneDeclaration),
  scenario("retention-cached-finding-standalone-barrier-mixed-remove-before", oneDeclaration),
  scenario("retention-owned-cached-finding-standalone-barrier-mixed-remove-before", oneDeclaration),
  scenario("retention-cached-finding-standalone-inactive", twoDeclarations),
  scenario("retention-owned-cached-finding-standalone-inactive", twoDeclarations),
  scenario("retention-cached-finding-standalone-shared", twoDeclarations),
  scenario("retention-owned-cached-finding-standalone-shared", twoDeclarations)
]
const selectedScenarios = scenarios.filter(
  (item) => !process.env.HAPSLAND_POSTFLOW_CASE || item.name === process.env.HAPSLAND_POSTFLOW_CASE
)
assert.ok(selectedScenarios.length, "Unknown preparation scenario: " + process.env.HAPSLAND_POSTFLOW_CASE)
const temp = await mkdtemp("/tmp/hapsland-owned-root-")
try {
  const root = join(temp, "fixture")
  await mkdir(root)
  execFileSync("git", ["init", "-q", root], { timeout: 5000 })
  for (const fixture of new Set(selectedScenarios.map((item) => item.fixture))) {
    await writeFile(join(root, fixture.path), fixture.source)
    for (const [path, source] of Object.entries(fixture.files ?? {})) await writeFile(join(root, path), source)
  }
  await writeFile(join(root, "leaf.py"), "class Foo:\n value: str\n")
  const a = await lstat(root),
    b = await lstat(join(root, ".git"))
  const rootIdentity = {
    rootDevice: String(a.dev),
    rootInode: String(a.ino),
    gitDirectory: join(root, ".git"),
    gitDevice: String(b.dev),
    gitInode: String(b.ino)
  }
  const _c = (name, fields = {}) => ({ $: "../../../packages/agent-flow-bend/Canonical." + name, ...fields }),
    scope = { $: "Scope", partition: 1n, lifetime: 1n, round: 1n, preparation: 2n }
  const initial = () => {
    const run = Effect.runSync,
      limits = { globalItems: 100, globalBytes: 100000000, partitionItems: 16, partitionBytes: 100000000 }
    const ref = run(
      Ref.make({
        residentLifetime: "physical",
        limits,
        canonical: initialCanonical(limits),
        resolverCustody: owner.initial_custody(),
        reservations: new Map(),
        partitionIds: new Map(),
        partitionIdentityBytes: 0,
        roundIds: new Map(),
        requestRounds: new Map(),
        collectionTokens: new Map(),
        nextCollectionToken: 1,
        nextPartitionId: 1,
        minimumFreshStart: 0,
        records: { runtime: { peakLedgerBytes: 0 }, marker: 0 }
      })
    )
    const transaction = residentTransaction(ref, "physical"),
      capacity = residentCapacity(transaction)
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent"))
    const observation = run(capacity.admitObservation("agent", round))
    assert.equal(run(capacity.observation("agent", observation, "startObservation", round)), true)
    const preparation = run(capacity.beginObservedPreparation("agent", observation, 1000, round))
    assert.equal(preparation.status, "admitted")
    assert.equal(preparation.operation, 2)
    let attachedDriver
    const bridge = createResidentOwnerTransaction({
      owner,
      transaction,
      validateAdviceInput: (origin, handle) => attachedDriver?.validateAdviceInput(origin, handle) === true,
      onActions: (actions) =>
        Effect.sync(() => {
          if (actions.length && !attachedDriver) throw new Error("Unbound resident action consumer")
          attachedDriver?.acceptActions(actions)
        })
    })
    return {
      postCore,
      control: bridge.control,
      bridge,
      transaction,
      runtime: residentRuntime(providerTransaction(transaction, bridge)),
      preparation,
      round,
      partition,
      attachDriver: (driver) => {
        attachedDriver = driver
      }
    }
  }
  const none = { $: "None" },
    _some = (value) => ({ $: "Some", value })
  const _location = (value) => ({
    $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Location",
    start: {
      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
      line: BigInt(value.start.line),
      column: BigInt(value.start.column)
    },
    end: {
      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
      line: BigInt(value.end.line),
      column: BigInt(value.end.column)
    }
  })
  const postCore = (
      await import(
        new URL("../../../../../dist/resident/review-work/preparation/post-preparation-core.js", import.meta.url)
      )
    ).default,
    postMachine = createPostPreparationMachine(postCore),
    tailMachine = createAdviceTailMachine(postCore)
  let cases = 0,
    requests = 0,
    postRequests = 0
  for (const testCase of selectedScenarios) {
    const { name: mode, fixture, expected, compareNative } = testCase
    if (process.env.HAPSLAND_POSTFLOW_TRACE) console.error(JSON.stringify({ scenario: mode, phase: "start" }))
    const owned = mode.startsWith("retention-owned-"),
      postSessions = new Map(),
      currentPath = fixture.path,
      candidatePaths = fixture.candidates ?? [currentPath]
    const connection = {
        ...initial(),
        preparationObservation: {
          root,
          rootIdentity,
          advicee: advicee(),
          candidates: candidatePaths.map((path) => ({ operation: "add", path }))
        }
      },
      registry = createNativeSessionRegistry(),
      cache = new Map(),
      _rootCaptures = new Map(),
      _selections = new Map()
    let cancelled = false,
      roots = 0,
      physicalLateSuccess = 0,
      acceptedAtFinalizationCancel,
      captureReads = 0,
      betweenReads = 0
    const performGraphRequest = (request, options) => {
      const session = registry.get(hostNatural(request.invocation))
      if (!session) throw new TypeError("Unknown graph service invocation")
      return performGraphServiceEffect(session, request, options)
    }
    const context = {
      root,
      rootIdentity,
      policy: DEFAULT_DIRECT_FILE_POLICY,
      branch: "type",
      limits: GRAPH_LIMIT_CEILINGS,
      now: () => 0,
      captureCache: cache,
      ...(mode === "parent-cancel-between-reads"
        ? {
            captureHooks: {
              sourceRead() {
                captureReads++
              },
              betweenReads: () =>
                Effect.sync(() => {
                  betweenReads++
                  cancelled = true
                  driver.cancel(parentInvocation)
                }).pipe(Effect.andThen(Effect.never))
            }
          }
        : {}),
      captureSource: (...args) =>
        captureStable(...args).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              if (cancelled && result.status === "captured") physicalLateSuccess++
              if (mode === "rules-replaced-after-capture" && result.status === "captured")
                context.rules = configuredRules
            })
          ),
          Effect.flatMap((result) =>
            mode === "parent-cancel-late-rejection" && cancelled
              ? Effect.fail(new Error("injected native late capture failure"))
              : Effect.succeed(result)
          )
        )
    }
    if (mode === "rules-replaced-after-capture") context.rules = []
    if (mode === "unused-rules-getter")
      Object.defineProperty(context, "rules", {
        get() {
          throw new Error("Unused rules must not be read before finalization")
        }
      })
    const _snapshotCaptures = () =>
      list(
        [...cache].map(([path, capture], index) => ({
          $: "Capture",
          path,
          handle: BigInt(index + 1),
          text: capture.text,
          content_hash: capture.contentHash,
          bytes: BigInt(capture.byteLength)
        }))
      )
    let duplicateChecked = false,
      reuseFaultInjected = false,
      originalCleanupFailure = false
    const driver = createOwnedArtifactDriver({
      owner,
      control: connection.control,
      scope,
      machine: createGraphMachine(),
      registry,
      hooks: {
        beforeInstall: ({ invocation }) => {
          if (mode === "retention-owned-preinstall-cancel" && postSessions.has(Number(invocation)))
            driver.cancel(invocation)
        }
      },
      selectMachine: (input, session) => {
        if ("finalization" in input) return session.machine
        if (input.postPreparation && mode === "retention-owned-constructor-fault")
          throw new Error("injected post machine construction failure")
        return input.preparation
          ? preparationForeign.machine
          : input.postPreparation
            ? postMachine
            : input.adviceTail
              ? tailMachine
              : undefined
      },
      foreign: ([request], options) =>
        Effect.gen(function* () {
          requests++
          if (postSessions.has(Number(request.invocation))) {
            postRequests++
            const postSession = postSessions.get(Number(request.invocation))
            if (mode === "retention-owned-duplicate-active" && !duplicateChecked) {
              duplicateChecked = true
              const before = Effect.runSync(connection.transaction.read),
                resources = driver.resources
              const rejected = yield* Effect.exit(
                driver.driveHandoffEffect(connection.owned.receipt, postSession, () => postSession.input)
              )
              assert.equal(rejected._tag, "Failure")
              assert.match(String(Cause.squash(rejected.cause)), /Session already owned/)
              assert.strictEqual(Effect.runSync(connection.transaction.read), before)
              assert.deepEqual(driver.resources, resources)
            }
            const faultCommand = {
              "retention-owned-fault-reuse-claim": "LookupReuse",
              "retention-owned-fault-clear-register": "RegisterClear",
              "retention-owned-fault-clear-release": "ReleaseClear",
              "retention-owned-fault-joined-append": "AppendJoined",
              "retention-owned-fault-clear-shared-release": "ReleaseClear"
            }[mode]
            if (
              mode === "retention-owned-cached-finding-standalone-cutoff" ||
              mode === "retention-owned-cached-finding-standalone-insert-ack"
            )
              return yield* postSession.performEffect(request, {
                ...options,
                afterCommit: (command) => {
                  if (command.$ === "InsertCachedAdvice" && !reuseFaultInjected) {
                    reuseFaultInjected = true
                    if (mode.endsWith("-cutoff")) driver.cancel(request.invocation)
                    else throw new Error("injected cached insert acknowledgement loss")
                  }
                }
              })
            if (mode === "retention-owned-fault-clear-cleanup-receipt")
              return yield* postSession.performEffect(request, {
                ...options,
                beforeCommand: (command) => {
                  if (command.$ === "ReleaseClear" && !originalCleanupFailure) {
                    originalCleanupFailure = true
                    throw new Error("injected original clear release failure")
                  }
                },
                afterCommit: (command, publication) => {
                  if (
                    command.$ === "PerformCleanup" &&
                    publication.releasedAcquisition !== undefined &&
                    !reuseFaultInjected
                  ) {
                    reuseFaultInjected = true
                    throw new Error("injected cleanup release action sink failure")
                  }
                }
              })
            if (faultCommand)
              return yield* postSession.performEffect(request, {
                ...options,
                afterCommit: (command) => {
                  if (!reuseFaultInjected && command.$ === faultCommand) {
                    reuseFaultInjected = true
                    throw new Error("injected reuse commit acknowledgement loss")
                  }
                }
              })
            return yield* postSession.performEffect(
              request,
              mode === "retention-owned-joined-pending-restore-fault"
                ? {
                    ...options,
                    afterPendingRestore: () => {
                      throw new Error("injected pending restore acknowledgement loss")
                    }
                  }
                : options
            )
          }
          const adviceSession = registry.get(Number(request.invocation))
          if (adviceSession?.input?.adviceTail) {
            postRequests++
            return yield* adviceSession.performEffect(request, options)
          }
          if (request.operation) {
            if (
              ["parent-cancel-late-success", "parent-cancel-late-rejection"].includes(mode) &&
              !cancelled &&
              request.operation.$ === "Types.CaptureSource"
            ) {
              // Start real native IO before cancellation, as the former eager
              // Promise fixture did. This child intentionally ignores the lease
              // signal so Canonical must discard its eventual success/rejection.
              const pending = yield* Effect.forkChild(performGraphRequest(request, { ...options, signal: undefined }), {
                startImmediately: true
              })
              cancelled = true
              driver.cancel(parentInvocation)
              const reply = yield* Fiber.join(pending)
              if (mode === "parent-cancel-late-rejection") throw new Error("late capture provider fault")
              return reply
            }
            return yield* performGraphRequest(request, options)
          }
          return yield* preparationForeign.performEffect(request, options)
        })
    })
    // One action sink and one resource dispatcher for both parent and resolver.
    const preparationForeign = createPreparationForeign({
      connection:
        mode === "parent-cancel-finalization-gate"
          ? {
              ...connection,
              bridge: {
                ...connection.bridge,
                canonical: (event) =>
                  connection.bridge.canonical(event).pipe(
                    Effect.tap(() =>
                      Effect.sync(() => {
                        if (!cancelled) {
                          acceptedAtFinalizationCancel = driver.stats.accepted
                          driver.cancel(parentInvocation)
                          cancelled = true
                        }
                      })
                    )
                  )
              }
            }
          : connection,
      owner,
      driver,
      root,
      rootIdentity,
      context,
      cache,
      settings: { rules: configuredRules },
      mode: mode === "unused-rules-getter" ? "resize-refused" : mode,
      onRoot: () => {
        roots++
      }
    })
    connection.attachDriver(driver)
    const parentInvocation = owned ? driver.allocatePreparationInvocation() : driver.allocateInvocation()
    const session = { invocation: parentInvocation, revoke() {}, close() {} }
    const limits = {
      $: "../../../../agent-flow-bend/ImportGraph.Limits",
      version: 1n,
      ...Object.fromEntries(
        Object.entries(GRAPH_LIMIT_CEILINGS).map(([key, value]) => [
          {
            sourceBytes: "source_bytes",
            treeBytes: "tree_bytes",
            readBytes: "read_bytes",
            outgoingEdges: "outgoing_edges"
          }[key] ?? key,
          BigInt(value)
        ])
      )
    }
    const preparationInput = {
      $: "Input",
      candidates: list(
        candidatePaths.map((path) => ({
          $: "Candidate",
          path,
          operation: { $: "CandidateAdd" },
          added_lines: list([])
        }))
      ),
      contracts: list(fixture.contracts),
      limits,
      frozen: none,
      line: none,
      verified: none,
      native_patch: none,
      advicee_host: "codex",
      before_analyze: true
    }
    let outcome = await Effect.runPromise(
      driver.driveEffect(session, { invocation: BigInt(parentInvocation), preparation: preparationInput })
    )
    if (owned) {
      const receipt = outcome
      outcome = driver.handoffResult(receipt)
      connection.owned = {
        driver,
        receipt,
        postSessions,
        startPreparation: async (preparation) => {
          connection.preparation = preparation
          const invocation = driver.allocatePreparationInvocation({
            ...scope,
            preparation: BigInt(preparation.operation)
          })
          const sourceSession = { invocation, revoke() {}, close() {} }
          const nextReceipt = await Effect.runPromise(
            driver.driveEffect(sourceSession, { invocation: BigInt(invocation), preparation: preparationInput })
          )
          const result = driver.handoffResult(nextReceipt)
          connection.owned.receipt = nextReceipt
          return result.preparation
        }
      }
    }
    if (mode.startsWith("parent-cancel")) {
      assert.ok(outcome.failure)
      if (mode === "parent-cancel-between-reads") {
        assert.equal(cancelled, true)
        assert.equal(captureReads, 1)
        assert.equal(betweenReads, 1)
        assert.equal(cache.size, 0)
        assert.equal(roots, 0)
        assert.equal(physicalLateSuccess, 0)
        assert.equal(driver.stats.accepted, 0)
      } else if (mode === "parent-cancel-finalization-gate") {
        assert.equal(cancelled, true)
        assert.equal(roots, 2)
        assert.equal(physicalLateSuccess, 0)
        assert.equal(driver.stats.accepted, acceptedAtFinalizationCancel)
      } else {
        assert.equal(roots, 1)
        assert.equal(physicalLateSuccess, 1)
        assert.equal(driver.stats.accepted, 0)
      }
    } else {
      assert.ok(outcome.preparation)
      assert.equal(outcome.preparation.selected, expected.selected, mode + " selected declarations")
      assert.equal(unlist(outcome.preparation.units).length, expected.units, mode + " prepared units")
      if (compareNative) {
        const expected = await Effect.runPromise(
          prepareObservation(
            {
              root,
              rootIdentity,
              advicee: advicee(),
              candidates: candidatePaths.map((path) => ({ operation: "add", path }))
            },
            {
              settings: { rules: configuredRules },
              policy: DEFAULT_DIRECT_FILE_POLICY,
              ...(fixture.contracts.length === 1 ? { inputContract: TYPE_INPUT_CONTRACT } : {})
            }
          )
        )
        assert.equal(expected.observation.status, fixture.observationStatus ?? "complete", mode + " native status")
        assert.deepEqual(preparationForeign.decode(outcome.preparation, advicee()), expected)
        assert.deepEqual(
          unlist(outcome.preparation.units).map(fromProductValue),
          expected.observation.status === "complete" ? expected.observation.changeSet.units : expected.observation.units
        )
        const actualReady = unlist(outcome.preparation.outcomes)
          .filter((value) => value.$ === "OutcomeReady")
          .map((value) => fromProductValue(value.prepared))
        assert.ok(actualReady.length > 0, "actual prepared input is produced")
        assert.deepEqual(
          actualReady,
          expected.outcomes
            .filter((value) => value.status === "ready")
            .map(({ prepared }) => {
              const { advicee: _ignored, ...source } = prepared
              return source
            })
        )
      }
      if (mode.startsWith("retention-")) {
        await consumeRetainedPreparation(
          connection,
          outcome.preparation,
          root,
          rootIdentity,
          testCase.retentionMode,
          preparationForeign.decode
        )
      } else {
        // Only complete preparation terminal converts capacity; child terminal does not.
        const completed = Effect.runSync(
          connection.bridge.native((draft, records) => [
            completePreparation(
              draft,
              "agent",
              connection.preparation.operation,
              connection.preparation.reservation,
              unlist(outcome.preparation.units).map(() => 100),
              connection.round
            ),
            records
          ])
        ).value
        assert.equal(completed.length, unlist(outcome.preparation.units).length)
      }
    }
    if (mode === "retention-owned-duplicate-active") assert.equal(duplicateChecked, true)
    if (mode.includes("-fault-reuse-") || mode.includes("-fault-clear-") || mode.includes("-fault-joined-"))
      assert.equal(reuseFaultInjected, true)
    assert.equal(driver.stats.providerStarts, driver.stats.providerCleanups)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assert.equal(registry.size, 0)
    assert.equal(registry.pendingCleanup, 0)
    const rootFds = await Promise.all(
      (await readdir("/proc/self/fd")).map((fd) => readlink("/proc/self/fd/" + fd).catch(() => ""))
    )
    assert.equal(rootFds.filter((path) => path === root || path.startsWith(root + "/")).length, 0)
    cases++
    if (process.env.HAPSLAND_POSTFLOW_TRACE) console.error(JSON.stringify({ scenario: mode, phase: "passed" }))
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests,
      postRequests,
      nativePostPreparationSource,
      scope:
        "actual resident transaction, capacity resize/completion, emitted preparation progression and nested split resolver with native Go/Rust/Bend/Python/TypeScript IO and full native preparation differential for successful branches; parent cancellation/late success/rejection and first semantic refusal; actual native preflight/workspace sizing bindings and whole Bend finalization through the same resident Canonical gate; actual post-preparation admission/planning, revision/claims/spawn/enqueue and three post-acceptance cancellation barriers plus owner-claim and pre-spawn exceptions with guaranteed cleanup; native policy deletion, source-free Canonical progression and production adoption remain open"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
