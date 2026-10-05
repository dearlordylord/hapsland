import { relative } from "node:path"
import { beforeEach, expect, inject, onTestFailed, vi } from "vitest"
import { CLEANUP_TIMEOUT_MS } from "./policy.mjs"

declare module "vitest" {
  export interface ProvidedContext {
    harnessInventory: Array<{ path: string; kind: string; timeoutMs: number }>
  }
}

const file = relative(process.cwd(), expect.getState().testPath!).replaceAll("\\", "/")
const entry = inject("harnessInventory").find((entry) => entry.path === file)
if (entry === undefined) throw new Error(`Test harness inventory is missing ${file}`)
vi.setConfig({ testTimeout: entry.timeoutMs, hookTimeout: CLEANUP_TIMEOUT_MS })

beforeEach((context) => {
  onTestFailed(() => {
    for (const error of context.task.result?.errors ?? []) {
      if (/^(Test|Hook) timed out/u.test(error.message)) {
        error.message =
          `Test harness phase=${error.message.startsWith("Hook") ? "fixture/cleanup" : "test execution"}; ` +
          `class=${entry.kind}; file=${file}; test=${context.task.name}; ` +
          error.message
      }
    }
  })
})
