import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { renderOpenCodePlugin } from "./plugin.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it("adds bounded CLI advice only to the triggering edit tool output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hapsland-opencode-plugin-"));
  dirs.push(dir);
  const cli = join(dir, "cli.mjs");
  const plugin = join(dir, "plugin.mjs");
  writeFileSync(cli, "process.stdout.write('Review finding for this edit')\n");
  writeFileSync(plugin, renderOpenCodePlugin(process.execPath, cli));
  const module = await import(pathToFileURL(plugin).href) as { HapslandPlugin: (context: unknown) => Promise<Record<string, (input: unknown, output: Record<string, unknown>) => Promise<void>>> };
  const hooks = await module.HapslandPlugin({ directory: dir });
  const output = { title: "Edited", output: "Applied", metadata: {} };
  await hooks["tool.execute.after"]?.({ tool: "edit", sessionID: "s", callID: "c", args: { filePath: "x.ts" } }, output);
  expect(output.output).toContain("Applied\n\nReview finding for this edit");
  const other = { title: "Read", output: "Read result", metadata: {} };
  await hooks["tool.execute.after"]?.({ tool: "read", sessionID: "s", callID: "d", args: { filePath: "x.ts" } }, other);
  expect(other.output).toBe("Read result");
});
