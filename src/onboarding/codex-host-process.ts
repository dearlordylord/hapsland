import { execFile } from "node:child_process";

/** Codex treats an open piped stdin as additional prompt input, even with a prompt argument. */
export const execFileClosedStdin = (
  executable: string,
  args: ReadonlyArray<string>,
  options: { readonly env: NodeJS.ProcessEnv; readonly timeout: number; readonly maxBuffer: number },
): Promise<{ readonly stdout: string; readonly stderr: string }> => new Promise((resolve, reject) => {
  const child = execFile(executable, [...args], { ...options, encoding: "utf8" }, (cause, stdout, stderr) => {
    if (cause !== null) {
      Object.assign(cause, { stdout, stderr });
      reject(cause);
    } else resolve({ stdout, stderr });
  });
  child.stdin?.end();
});
