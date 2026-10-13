import type { NativeIoPorts } from "../../verification/native-io-ports.ts"
import { lstat } from "node:fs/promises"
import { dirname, join, normalize, sep } from "node:path"
import * as Effect from "effect/Effect"
import { parse } from "smol-toml"
import { captureStable, type StableCapture } from "@hapsland/native-observation/direct-event/capture"
import {
  contextDirectFilePolicy,
  eligibleNamedPath,
  selectedByDirectFilePolicy
} from "@hapsland/native-observation/direct-event/selection"
import { observationCaptureBudgetRefusal, observeCaptureDiagnostic } from "../../../capture-budget.ts"
import type { LanguageAdapter } from "../../../languages/contracts.ts"
import { createPythonModuleResolution, within } from "./native-module-resolution.ts"
import type { GraphSession, NativeLanguageAdapter } from "../../verification/native-language-contract.ts"

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
export const staticRoot = (source: string): string | undefined => {
  try {
    const data = parse(source)
    const tool = record(data.tool)
    const setuptools = record(tool?.setuptools)
    const mapping = record(setuptools?.["package-dir"])
    // Only one literal package-dir mapping is adopted. Other loader/root authorities are unavailable.
    if (tool?.poetry !== undefined || tool?.hatch !== undefined || tool?.pdm !== undefined) return undefined
    const find = record(record(setuptools?.packages)?.find)
    const where = find?.where
    if (where !== undefined && (!Array.isArray(where) || where.length !== 1 || typeof where[0] !== "string"))
      return undefined
    const discovered = Array.isArray(where) ? normalize(where[0] as string) : undefined
    if (discovered !== undefined && (!within(discovered) || discovered.split(sep).length > 4)) return undefined
    if (mapping === undefined) return discovered ?? "."
    const entries = Object.entries(mapping)
    if (entries.length !== 1 || entries[0]?.[0] !== "" || typeof entries[0]?.[1] !== "string") return undefined
    const path = normalize(entries[0][1])
    return within(path) && path.split(sep).length <= 4 && (discovered === undefined || discovered === path)
      ? path
      : undefined
  } catch {
    return undefined
  }
}

type Remaining = { readonly files: number; readonly readBytes: number; readonly work: number }
type Membership = {
  readonly path: string
  readonly signature: string
  readonly status: Awaited<ReturnType<typeof lstat>> | undefined
}
const signature = (status: Awaited<ReturnType<typeof lstat>> | undefined): string =>
  status === undefined
    ? "absent"
    : [status.mode, status.dev, status.ino, status.size, status.mtimeMs, status.ctimeMs].join(":")

/** Construct one bounded language session; parsing remains owned by the adapter. */
export const createPythonGraphPreparation = (
  inspectPython: LanguageAdapter["inspect"],
  staticPackageAuthority: (source: string) => boolean,
  hasPackageBinding: (source: string, name: string) => boolean,
  staticModuleAuthority: (source: string) => boolean,
  ports?: NativeIoPorts
): NativeLanguageAdapter["prepareGraph"] =>
  Effect.fn("Python.prepareGraph")(function* (rootPath, rootCapture, host, limits, expired) {
    if (expired() || limits.files < 1 || limits.work < 1) return undefined
    const readStatus = ports?.readStatus ?? lstat
    const selectPath = ports?.selectPath ?? eligibleNamedPath
    const captures = host.captureCache ?? new Map<string, StableCapture>()
    ports?.cacheCreated?.(captures, host.captureCache === undefined ? "private" : "caller")
    captures.set(rootPath, rootCapture)
    ports?.cacheStore?.(host.captureCache === undefined ? "private" : "caller", rootPath, rootCapture)
    const dependencies: string[] = []
    const authority = new Map<string, StableCapture>()
    const failedCaptures = new Set<string>()
    const canonicalCaptures = new Set([rootPath])
    const membership = new Map<string, Membership>()
    let work = 0
    let available = true
    let remaining: Remaining = {
      files: limits.files - 1,
      readBytes: limits.readBytes - rootCapture.byteLength,
      work: limits.work
    }
    const usage = () => ({
      files: authority.size + failedCaptures.size,
      readBytes:
        [...authority.values()].reduce((n, item) => n + item.byteLength, 0) + failedCaptures.size * limits.sourceBytes,
      work
    })
    const permit = (reserveFiles = 0, reserveBytes = 0): boolean => {
      const spent = usage()
      return (
        available &&
        !expired() &&
        spent.files + reserveFiles <= remaining.files &&
        spent.readBytes + reserveBytes <= remaining.readBytes &&
        spent.work <= remaining.work
      )
    }
    const policyFor = (_path: string) => contextDirectFilePolicy(host.policy)
    const observePath = Effect.fn("Python.observeMembership")(function* (path: string, refresh = false) {
      const known = membership.get(path)
      if (known !== undefined && !refresh) return known.status
      if (!within(path) || !permit() || work >= remaining.work) {
        available = false
        return undefined
      }
      work++
      const result = yield* Effect.promise(async () => {
        try {
          return { ok: true, status: await readStatus(join(host.root, path)) }
        } catch (error) {
          return { ok: (error as NodeJS.ErrnoException).code === "ENOENT", status: undefined }
        }
      })
      if (!result.ok || result.status?.isSymbolicLink()) available = false
      const current = signature(result.status)
      if (known !== undefined && known.signature !== current) available = false
      membership.set(path, { path, signature: current, status: result.status })
      return result.status
    })
    const stat = Effect.fn("Python.bindingMembership")(function* (path: string) {
      if (!within(path) || !selectedByDirectFilePolicy(path, policyFor(path))) {
        available = false
        return undefined
      }
      // Never follow an ancestor symlink even for negative membership probes.
      const ancestors: string[] = []
      let directory = dirname(path)
      while (directory !== ".") {
        if (ancestors.length > limits.depth + 1) {
          available = false
          return undefined
        }
        ancestors.push(directory)
        directory = dirname(directory)
      }
      for (const ancestor of ancestors.reverse()) {
        const status = yield* observePath(ancestor)
        if (!available) return undefined
        if (status === undefined) return undefined
        if (!status.isDirectory()) {
          available = false
          return undefined
        }
      }
      return yield* observePath(path)
    })
    const readAuthority = Effect.fn("Python.captureAuthority")(function* (path: string) {
      const known = authority.get(path)
      if (known !== undefined) return known
      if (failedCaptures.has(path)) return undefined
      // Every full-file reservation consumes the same source/read/file limits as graph evidence.
      const cached = captures.get(path)
      if (canonicalCaptures.has(path)) return permit() ? cached : undefined
      if (!permit(1, cached?.byteLength ?? limits.sourceBytes)) return undefined
      const selected = yield* selectPath(host.root, path, policyFor(path), host.rootIdentity)
      if (selected === undefined) return undefined
      const refusal = observationCaptureBudgetRefusal(captures, path, limits.sourceBytes)
      if (refusal !== undefined) {
        observeCaptureDiagnostic(host, path, refusal)
        return undefined
      }
      let capture = cached
      if (capture === undefined) {
        failedCaptures.add(path)
        const result = yield* (host.captureSource ?? captureStable)(
          host.root,
          selected,
          host.captureHooks,
          host.rootIdentity,
          limits.sourceBytes
        )
        if (result.status === "unavailable") {
          observeCaptureDiagnostic(host, path, result.diagnostic)
          return undefined
        }
        capture = result.capture
        failedCaptures.delete(path)
        captures.set(path, capture)
        ports?.cacheStore?.(host.captureCache === undefined ? "private" : "caller", path, capture)
      }
      if (capture.byteLength > limits.sourceBytes || !permit(1, capture.byteLength)) return undefined
      authority.set(path, capture)
      if (!dependencies.includes(path)) dependencies.push(path)
      return capture
    })
    let roots: readonly string[] | undefined
    let rootsAttempted = false
    const absoluteRoots = Effect.fn("Python.importRoots")(function* () {
      if (rootsAttempted) return roots
      rootsAttempted = true
      // Root metadata is not exempt from includes, exclusions, language policy or Git containment.
      const metadata = "pyproject.toml"
      const status = yield* stat(metadata)
      if (!available) return undefined
      let selectedRoots: readonly string[] = [".", "src"]
      if (status !== undefined) {
        if (!status.isFile()) return undefined
        const capture = yield* readAuthority(metadata)
        const declared = capture === undefined ? undefined : staticRoot(capture.text)
        if (declared === undefined) return undefined
        selectedRoots = [...new Set([".", "src", declared])]
      }
      // setup.py and setup.cfg may establish conflicting/custom roots; no execution or inference.
      for (const alternative of ["setup.py", "setup.cfg"]) {
        const status = yield* stat(alternative)
        if (!available || status !== undefined) return undefined
      }
      roots = selectedRoots
      return roots
    })
    const { resolveImport } = createPythonModuleResolution({
      rootPath,
      limits,
      stat,
      readAuthority,
      isSelected: (path) => selectedByDirectFilePolicy(path, policyFor(path)),
      isAvailable: () => available,
      absoluteRoots,
      staticPackageAuthority,
      inspectPython,
      hasPackageBinding,
      permit,
      setRemaining: (budget) => {
        remaining = budget
      },
      transferAuthority: (target) => {
        authority.delete(target)
        canonicalCaptures.add(target)
      }
    })
    const validateAuthority: NonNullable<GraphSession["validateAuthority"]> = Effect.fn("Python.revalidateMembership")(
      function* (budget) {
        remaining = budget
        for (const fact of [...membership.values()]) {
          const current = yield* observePath(fact.path, true)
          if (!available || signature(current) !== fact.signature) return false
        }
        return permit()
      }
    )
    return {
      dependencies,
      limits,
      session: {
        inspect: (path, source, branch) =>
          branch === "type" && (path === rootPath || staticModuleAuthority(source))
            ? inspectPython(path, source)
            : undefined,
        importCandidates: () => [],
        resolveImport,
        authorityUsage: usage,
        validateAuthority
      }
    }
  })
