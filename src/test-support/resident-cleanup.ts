import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "../../scripts/test-harness/process.mjs";

const fixtureOwnerPid = (path: string): number | undefined => {
  try {
    const { pid } = JSON.parse(readFileSync(path, "utf8")) as { pid: number };
    return Number.isInteger(pid) && pid > 1 && pid !== process.pid ? pid : undefined;
  } catch { return undefined; }
};
const linuxFixtureProcess = (pid: number, main: string, directory: string) => {
  const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
  return args.length === 4 && args[3] === "" && realpathSync(args[1]!) === realpathSync(main) && realpathSync(args[2]!) === realpathSync(directory);
};
const fixtureProcessRunning = (pid: number, main: string, directory: string): boolean => {
  try {
    if (process.platform === "linux") return linuxFixtureProcess(pid, main, directory);
    const command = execFileSync("ps", ["-ww", "-p", String(pid), "-o", "command="], { encoding: "utf8", timeout: 1_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return [main, realpathSync(main)].some(entry =>
      [directory, realpathSync(directory)].some(root => command.endsWith(`node ${entry} ${root}`)));
  } catch { return false; }
};
const signalFixtureProcess = (pid: number, signal: NodeJS.Signals) => {
  try { process.kill(pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
};
const waitForFixtureExit = async (pid: number, main: string, directory: string) => {
  const deadline = Date.now() + 3_000;
  while (fixtureProcessRunning(pid, main, directory) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
const stopFixtureProcess = async (pid: number, main: string, directory: string) => {
  if (!fixtureProcessRunning(pid, main, directory)) return;
  signalFixtureProcess(pid, "SIGTERM");
  await waitForFixtureExit(pid, main, directory);
  if (!fixtureProcessRunning(pid, main, directory)) return;
  signalFixtureProcess(pid, "SIGKILL");
  await waitForFixtureExit(pid, main, directory);
  if (fixtureProcessRunning(pid, main, directory)) throw new Error("Fixture resident did not terminate");
};
// Only fixture metadata whose live process matches both this main and directory
// may be signalled. Include bootstrap ownership before the endpoint exists.
export const stopFixtureResident = async (directory: string, main: string) => {
  const pids = new Set([fixtureOwnerPid(join(directory, "owner.json")), fixtureOwnerPid(join(directory, "owner.lock", "owner.json"))]);
  for (const pid of pids) if (pid !== undefined) await stopFixtureProcess(pid, main, directory);
};
