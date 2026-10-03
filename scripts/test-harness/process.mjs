import { execFile as nativeExecFile, execFileSync as nativeExecFileSync, spawnSync as nativeSpawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { DEFAULT_CHILD_TIMEOUT_MS } from './policy.mjs';

const childLabel = (command, args) => {
  const executable = basename(command);
  if (args.includes('-e') || args.includes('--eval')) return `${executable} inline fixture`;
  const script = args.find(argument => /\.(ts|mts|js|mjs)$/u.test(argument));
  return script === undefined ? executable : `${executable} ${basename(script)}`;
};

const childOptions = options => {
  const result = { ...options, killSignal: options?.killSignal ?? 'SIGKILL', timeout: options?.timeout ?? DEFAULT_CHILD_TIMEOUT_MS };
  if (!Number.isSafeInteger(result.timeout) || result.timeout <= 0)
    throw new RangeError('Test harness phase=child configuration: deadline must be a finite positive integer');
  return result;
};

export class TestProcessTimeoutError extends Error {
  constructor(command, args, timeoutMs, pid) {
    const label = childLabel(command, args);
    super(`Test harness phase=child execution; child=${label}; deadline=${timeoutMs}ms; pid=${pid ?? 'unavailable'}`);
    this.name = 'TestProcessTimeoutError';
    this.code = 'TEST_PROCESS_TIMEOUT';
    this.phase = 'child execution';
    this.child = label;
    this.timeoutMs = timeoutMs;
    this.pid = pid;
  }
}

const syncProcess = (native, argumentsList) => {
  const [command, second, third] = argumentsList;
  const hasArgs = Array.isArray(second);
  const args = hasArgs ? second : [];
  const options = childOptions(hasArgs ? third : second);
  let result;
  try { result = native(command, args, options); }
  catch (error) {
    if (error.code === 'ETIMEDOUT') throw new TestProcessTimeoutError(command, args, options.timeout, error.pid);
    throw error;
  }
  if (result?.error?.code === 'ETIMEDOUT')
    throw new TestProcessTimeoutError(command, args, options.timeout, result.pid);
  return result;
};

// Proxies preserve Node's overloads and return types. Nonzero exits and output
// stay unchanged; only a harness deadline violation becomes a phase-labelled error.
export const spawnSync = new Proxy(nativeSpawnSync, { apply: (native, _receiver, args) => syncProcess(native, args) });
export const execFileSync = new Proxy(nativeExecFileSync, { apply: (native, _receiver, args) => syncProcess(native, args) });

export const execFileAsync = (command, args = [], suppliedOptions = {}) => new Promise((resolve, reject) => {
  const options = childOptions(suppliedOptions);
  const child = nativeExecFile(command, args, { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
    if (error?.killed && error.code === null) {
      reject(new TestProcessTimeoutError(command, args, options.timeout, child.pid));
    } else if (error) reject(error);
    else resolve({ stdout, stderr });
  });
});
