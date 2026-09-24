/** Local OpenCode 1.x plugin body. Its only persistent state is OpenCode's owned plugin file. */
export const renderOpenCodePlugin = (runtime: string, entrypoint: string): string => `// Hapsland owned OpenCode 1.14.44 plugin; edits to this file require reconciliation.
import { spawnSync } from "node:child_process";

export const HapslandPlugin = async ({ directory }) => ({
  "tool.execute.after": async (input, output) => {
    if (input?.tool !== "edit" && input?.tool !== "write") return;
    if (!input?.sessionID || !input?.callID || !input?.args?.filePath) return;
    try {
      const event = JSON.stringify({ input, output, cwd: directory });
      if (Buffer.byteLength(event, "utf8") > 262144) return;
      const result = spawnSync(${JSON.stringify(runtime)}, [${JSON.stringify(entrypoint)}, "--opencode-hook", "--controlled-writer", "--review-tool-owned=opencode-v1"], {
        input: event,
        encoding: "utf8", timeout: 4500, maxBuffer: 262144, windowsHide: true,
      });
      if (result.status !== 0 || result.error || !result.stdout?.trim()) return;
      output.output += "\\n\\n" + result.stdout.trim();
    } catch { /* completed edit is preserved when review delivery is unavailable */ }
  },
});
`;
