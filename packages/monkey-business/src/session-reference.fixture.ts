/** Independent pre-port oracle, imported only by session-port.test.ts. Never use in production. */
import { validateSizeFacts } from "./sizes.ts"
import type { JevRequestOutcome } from "../../../src/canonical/adapter.ts"

export type AdviceResponse = "ignore" | "noAction" | "promptRepair" | "delayedRepair"
export interface SessionConfig {
  readonly seed?: number
  readonly agent?: string
  readonly editIntervalMs?: number
  readonly variationMs?: number
  readonly editsPerTask?: number
  readonly taskPauseMs?: number
  readonly adviceResponse?: AdviceResponse
  readonly repairDelayMs?: number
  readonly bytes?: number
  readonly unitBytes?: readonly number[]
}
export type SessionControl =
  | { readonly kind: "sizes"; readonly reservationBytes: number; readonly reviewUnitBytes: readonly number[] }
  | { readonly kind: "editPace"; readonly intervalMs: number }
  | { readonly kind: "burst"; readonly count: number }
  | { readonly kind: "suspendArrivals"; readonly suspended: boolean }
export type SessionInput = {
  readonly at: number
  readonly generation: number
  readonly agent: string
  readonly recurring: boolean
} & (
  | { readonly kind: "task"; readonly task: number }
  | {
      readonly kind: "edit"
      readonly bytes: number
      readonly unitBytes: readonly number[]
      readonly revision: number
      readonly repair?: boolean
      readonly outcome?: JevRequestOutcome
    }
  | { readonly kind: "finish" }
)
const integer = (value: number, name: string, minimum = 0, maximum = 1_000_000_000): number => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} must be an integer in [${minimum}, ${maximum}]`)
  return value
}
/** Per-agent xorshift32 stream; rendering and other agents never consume it. */
export class SessionGenerator {
  private random: number
  private interval: number
  private readonly variation: number
  private readonly edits: number
  private readonly pause: number
  private readonly response: AdviceResponse
  private readonly repairDelay: number
  private bytes: number
  private units: readonly number[]
  private readonly agent: string
  private generation = 0
  private suspended = false
  private phase: "task" | "edit" | "finish" = "task"
  private task = 0
  private edit = 0
  private revision = 0
  private pendingPhase: typeof this.phase = "task"
  private pendingEdit = 0
  private pendingTask = 0
  constructor(config: SessionConfig = {}) {
    this.agent = config.agent ?? "agent-1"
    if (!this.agent.length) throw new RangeError("agent must be nonempty")
    let hash = integer(config.seed ?? 1, "seed", 0, 0xffffffff) >>> 0
    for (const character of this.agent) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
    this.random = hash || 1
    this.interval = integer(config.editIntervalMs ?? 100, "editIntervalMs", 1)
    this.variation = integer(config.variationMs ?? 15, "variationMs")
    this.edits = integer(config.editsPerTask ?? 5, "editsPerTask", 1, 1024)
    this.pause = integer(config.taskPauseMs ?? 500, "taskPauseMs")
    this.response = config.adviceResponse ?? "ignore"
    if (!["ignore", "noAction", "promptRepair", "delayedRepair"].includes(this.response))
      throw new RangeError("invalid adviceResponse")
    this.repairDelay = integer(config.repairDelayMs ?? 300, "repairDelayMs")
    this.bytes = integer(config.bytes ?? 100, "bytes", 1)
    this.units = [...(config.unitBytes ?? [this.bytes])]
    if (!this.units.length || this.units.length > 1024) throw new RangeError("unitBytes requires 1..1024 units")
    this.units.forEach((value) => integer(value, "unitBytes", 1))
  }
  valid(input: { readonly generation?: number; readonly recurring?: boolean }): boolean {
    return input.recurring !== true || input.generation === this.generation
  }
  private delay(): number {
    let state = this.random
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    this.random = state >>> 0
    return Math.max(1, this.interval + (this.random % (2 * this.variation + 1)) - this.variation)
  }
  private fresh(at: number, repair = false, recurring = false): SessionInput {
    return {
      at,
      generation: this.generation,
      agent: this.agent,
      recurring,
      kind: "edit",
      bytes: this.bytes,
      unitBytes: [...this.units],
      revision: ++this.revision,
      ...(repair ? { repair: true } : {})
    }
  }
  next(now: number): SessionInput[] {
    integer(now, "now", 0, Number.MAX_SAFE_INTEGER)
    if (this.suspended) return []
    this.pendingPhase = this.phase
    this.pendingEdit = this.edit
    this.pendingTask = this.task
    if (this.phase === "task") {
      this.phase = "edit"
      this.edit = 0
      return [
        {
          at: now + (this.task ? this.pause : 0),
          generation: this.generation,
          agent: this.agent,
          recurring: true,
          kind: "task",
          task: ++this.task
        }
      ]
    }
    if (this.phase === "edit") {
      if (++this.edit >= this.edits) this.phase = "finish"
      return [this.fresh(now + this.delay(), false, true)]
    }
    this.phase = "task"
    return [{ at: now + this.delay(), generation: this.generation, agent: this.agent, recurring: true, kind: "finish" }]
  }
  apply(control: SessionControl, now: number): SessionInput[] {
    integer(now, "now", 0, Number.MAX_SAFE_INTEGER)
    if (control.kind === "sizes") {
      const facts = validateSizeFacts({
        sourceBytes: 0,
        evidenceTreeBytes: 0,
        encodedOutputBytes: 0,
        reservationBytes: control.reservationBytes,
        reviewUnitBytes: control.reviewUnitBytes
      })
      this.bytes = facts.reservationBytes
      this.units = facts.reviewUnitBytes
      return []
    }
    if (control.kind === "burst") {
      integer(control.count, "count", 1, 1024)
      return Array.from({ length: control.count }, () => this.fresh(now))
    }
    if (control.kind === "editPace") this.interval = integer(control.intervalMs, "intervalMs", 1)
    else if (control.kind === "suspendArrivals") {
      if (typeof control.suspended !== "boolean") throw new TypeError("suspended must be boolean")
      this.suspended = control.suspended
    } else throw new TypeError("unsupported session control")
    ++this.generation
    this.phase = this.pendingPhase
    this.edit = this.pendingEdit
    this.task = this.pendingTask
    return this.next(now)
  }
  onFinish(now: number, continuation: boolean): SessionInput[] {
    if (typeof continuation !== "boolean") throw new TypeError("continuation must be boolean")
    if (continuation) {
      this.phase = "edit"
      this.edit = 0
    } else this.phase = "task"
    return this.next(now)
  }
  onAdvice(now: number): SessionInput[] {
    integer(now, "now", 0, Number.MAX_SAFE_INTEGER)
    if (this.response === "ignore" || this.response === "noAction") return []
    return [this.fresh(now + (this.response === "delayedRepair" ? this.repairDelay : 1), true)]
  }
}
