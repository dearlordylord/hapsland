import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { adaptClaudeDirectEvent, adaptCodexDirectEvent } from "./adapter.ts";
import { adaptOpenCodeDirectEvent } from "../hosts/opencode/adapter.ts";
import { prepareObservation } from "./pipeline.ts";
import { addEvent, updateEvent, makeGitFixture, put } from "./test-fixtures.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "../rules/targets.ts";

const cases = [
  { name: "type", contract: TYPE_INPUT_CONTRACT,
    before: "export interface Item { value: string }",
    after: "export interface Item { value: number }", selected: "Item",
    sibling: "export interface Unchanged { count: number }" },
  { name: "function", contract: FUNCTION_INPUT_CONTRACT,
    before: "export function processOrder() { return 1; }",
    after: "export function processOrder() { return 2; }", selected: "processOrder",
    sibling: "export function unchanged() { return 3; }" },
] as const;

describe("Unicode attribution across supported runtime adapters", () => {
  for (const host of ["codex", "claude", "opencode"] as const) {
    for (const operation of ["add", "update"] as const) {
      for (const sample of cases) {
        it.each(["// 注文を処理する\n", "/* 注文😀 */ "])(
          `${host} ${operation} checks ${sample.name} attribution with Unicode prefix %j`,
          async (prefix) => {
            const root = await makeGitFixture();
            try {
              const path = join(root, "type.ts");
              const original = `${prefix}${sample.before}\n${sample.sibling}\n// 後😀\n`;
              const content = original.replace(sample.before, sample.after);
              await put(root, "type.ts", content);
              const observation = host === "codex"
                ? await Effect.runPromise(adaptCodexDirectEvent(operation === "add"
                    ? addEvent(root)
                    : updateEvent(root, "type.ts", [prefix.includes("\n") ? sample.after : prefix + sample.after])))
                : host === "claude"
                  ? await Effect.runPromise(adaptClaudeDirectEvent({
                      hook_event_name: "PostToolUse", cwd: root, session_id: "session", tool_use_id: "tool",
                      tool_name: operation === "add" ? "Write" : "Edit",
                      tool_input: operation === "add"
                        ? { file_path: path, content }
                        : { file_path: path, old_string: sample.before, new_string: sample.after, replace_all: false },
                      tool_response: operation === "add"
                        ? { filePath: path, content, originalFile: null, userModified: false }
                        : { filePath: path, oldString: sample.before, newString: sample.after,
                            originalFile: original, replaceAll: false, userModified: false },
                    }))
                  : await Effect.runPromise(adaptOpenCodeDirectEvent({
                      cwd: root,
                      input: { tool: operation === "add" ? "write" : "edit", sessionID: "session", callID: "tool",
                        args: operation === "add" ? { filePath: path, content }
                          : { filePath: path, oldString: sample.before, newString: sample.after, replaceAll: false } },
                      output: { title: "Edited", output: "Applied", metadata: { exists: false, diff: "fixture" } },
                    }));
              if (host === "opencode" && operation === "update" && !prefix.includes("\n")) {
                // Its unique whole-line evidence cannot verify this partial-line replacement.
                expect(observation).toBeUndefined();
                return;
              }
              expect(observation).toBeDefined();
              if (observation === undefined) throw new Error("missing observation");
              const prepared = await Effect.runPromise(prepareObservation(observation, {
                controlledWriter: true, advicee: observation.advicee, inputContract: sample.contract,
                settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
              }));
              const names = prepared.outcomes.flatMap(outcome =>
                outcome.status === "ready" ? [outcome.prepared.input.declaration.name] : []);
              // OpenCode supplies no exact Update span. Codex's whole-line span
              // also remains ambiguous when it starts in a leading comment.
              expect(names).toEqual(operation === "update" && (host === "opencode" || (host === "codex" && !prefix.includes("\n"))) ? []
                : operation === "add" ? [sample.selected, sample.name === "type" ? "Unchanged" : "unchanged"]
                  : [sample.selected]);
            } finally {
              await rm(root, { recursive: true, force: true });
            }
          },
        );
      }
    }
  }
});
