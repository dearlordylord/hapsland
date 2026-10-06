import { Option, Schema } from "effect"
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const BudgetState = Schema.Struct({
  version: Schema.Literal(1),
  root: Schema.String.check(Schema.isPattern(/^\//)),
  expiresAt: NonNegativeInteger,
  sourceByteBudget: NonNegativeInteger,
  providerCallBudget: NonNegativeInteger,
  usedSourceBytes: NonNegativeInteger,
  usedProviderCalls: NonNegativeInteger
})
interface BudgetState extends Schema.Schema.Type<typeof BudgetState> {}

const decode = (value: unknown): BudgetState | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(BudgetState)(value))

export const writeDemoBudget = (
  path: string,
  options: {
    readonly root: string
    readonly expiresAt: number
    readonly sourceByteBudget: number
    readonly providerCallBudget: number
  }
): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify({ version: 1, ...options, usedSourceBytes: 0, usedProviderCalls: 0 })}\n`, {
    mode: 0o600
  })
}

/** Creates a fresh live-demo budget without replacing an existing authority. */
export const initializeDemoBudget = (
  path: string,
  options: {
    readonly root: string
    readonly expiresAt: number
    readonly sourceByteBudget: number
    readonly providerCallBudget: number
  }
): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, `${JSON.stringify({ version: 1, ...options, usedSourceBytes: 0, usedProviderCalls: 0 })}\n`, {
    mode: 0o600,
    flag: "wx"
  })
}

/** Atomically reserves one paid call before provider dispatch. Contention fails closed. */
export const claimDemoBudget = (path: string, root: string, sourceBytes: number, now = Date.now()): void => {
  const lock = `${path}.lock`
  mkdirSync(lock, { mode: 0o700 })
  try {
    const state = decode(JSON.parse(readFileSync(path, "utf8")))
    if (
      state === undefined ||
      state.root !== root ||
      now > state.expiresAt ||
      !Number.isSafeInteger(sourceBytes) ||
      sourceBytes < 0 ||
      state.usedProviderCalls >= state.providerCallBudget ||
      state.usedSourceBytes + sourceBytes > state.sourceByteBudget
    ) {
      throw new Error("demo provider budget is unavailable or exhausted")
    }
    const next: BudgetState = {
      ...state,
      usedSourceBytes: state.usedSourceBytes + sourceBytes,
      usedProviderCalls: state.usedProviderCalls + 1
    }
    const temporary = `${path}.${process.pid}.tmp`
    try {
      writeFileSync(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 })
      renameSync(temporary, path)
    } finally {
      rmSync(temporary, { force: true })
    }
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

export const readDemoBudgetUsage = (
  path: string
): { readonly sourceBytes: number; readonly providerCalls: number } | undefined => {
  try {
    const state = decode(JSON.parse(readFileSync(path, "utf8")))
    return state === undefined
      ? undefined
      : { sourceBytes: state.usedSourceBytes, providerCalls: state.usedProviderCalls }
  } catch {
    return undefined
  }
}

export * as DemoBudget from "./demo-budget.ts"
