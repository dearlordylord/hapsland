import type { ExecFileOptionsWithStringEncoding } from 'node:child_process';

export const spawnSync: typeof import('node:child_process').spawnSync;
export const execFileSync: typeof import('node:child_process').execFileSync;
export function execFileAsync(command: string, args?: readonly string[], options?: ExecFileOptionsWithStringEncoding):
  Promise<{ stdout: string; stderr: string }>;
export class TestProcessTimeoutError extends Error {
  constructor(command: string, args: readonly string[], timeoutMs: number, pid?: number);
  readonly code: 'TEST_PROCESS_TIMEOUT';
  readonly phase: 'child execution';
  readonly child: string;
  readonly timeoutMs: number;
  readonly pid: number | undefined;
}
