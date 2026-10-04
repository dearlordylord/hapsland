import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { execFileAsync, execFileSync, spawnSync, TestProcessTimeoutError } from './process.mjs';
import { DEFAULT_CHILD_TIMEOUT_MS, PROCESS_TEST_TIMEOUT_MS } from './policy.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'haps-harness-hang-'));
  roots.push(root);
  const ready = join(root, 'ready');
  return { ready, source: `import {writeFileSync} from 'node:fs'; process.on('SIGTERM',()=>{});
    writeFileSync(process.argv[1], String(process.pid)); setInterval(()=>{},1000);` };
};
const assertReaped = (pid: number) => {
  let failure: unknown;
  try { process.kill(pid, 0); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: 'ESRCH' });
};
const assertStopped = (error: TestProcessTimeoutError, ready: string) => {
  expect(error).toMatchObject({ code: 'TEST_PROCESS_TIMEOUT', phase: 'child execution', timeoutMs: 1_000 });
  expect(error.message).toContain('child=node inline fixture');
  const pid = Number(readFileSync(ready, 'utf8'));
  expect(error.pid).toBe(pid);
  assertReaped(pid);
};

it('preserves normal outputs and nonzero exits rather than converting assertion failures to success', async () => {
  const result = spawnSync(process.execPath, ['-e', "process.stdout.write('out');process.stderr.write('err');process.exitCode=7"], { encoding: 'utf8' });
  expect(result).toMatchObject({ status: 7, stdout: 'out', stderr: 'err' });
  expect(execFileSync(process.execPath, ['-e', "process.stdout.write('buffer')"])).toEqual(Buffer.from('buffer'));
  expect(execFileSync(process.execPath, ['-e', "process.stdout.write('text')"], { encoding: 'utf8' })).toBe('text');
  expect(await execFileAsync(process.execPath, ['-e', "process.stdout.write('async')"])).toEqual({ stdout: 'async', stderr: '' });
  await expect(execFileAsync(process.execPath, ['-e', 'process.exitCode=9'])).rejects.toMatchObject({ code: 9 });
  expect(() => spawnSync(process.execPath, [], { timeout: 0 })).toThrow(/child configuration/u);
  expect(() => spawnSync(process.execPath, [], { killSignal: 'SIGTERM' })).toThrow(/requires SIGKILL/u);
  await expect(execFileAsync(process.execPath, [], { killSignal: 'SIGTERM' })).rejects.toThrow(/requires SIGKILL/u);
  expect(DEFAULT_CHILD_TIMEOUT_MS).toBeLessThan(PROCESS_TEST_TIMEOUT_MS);
});

it('kills a deliberately hung synchronous child even when it ignores SIGTERM', () => {
  const { ready, source } = fixture();
  const started = performance.now();
  let failure: unknown;
  try { spawnSync(process.execPath, ['--input-type=module', '-e', source, ready], { timeout: 1_000, killSignal: undefined }); }
  catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(TestProcessTimeoutError);
  assertStopped(failure as TestProcessTimeoutError, ready);
  expect(performance.now() - started).toBeLessThan(11_000);
});

it('kills a deliberately hung asynchronous child and waits for its closed pipes before rejecting', async () => {
  const { ready, source } = fixture();
  const started = performance.now();
  const error = await execFileAsync(process.execPath, ['--input-type=module', '-e', source, ready], { timeout: 1_000 }).catch(error => error);
  expect(error).toBeInstanceOf(TestProcessTimeoutError);
  assertStopped(error, ready);
  expect(performance.now() - started).toBeLessThan(11_000);
});

it('bounds execFileSync fixtures and reaps their hung child', () => {
  const { ready, source } = fixture();
  const started = performance.now();
  expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', source, ready], { timeout: 1_000 }))
    .toThrow(TestProcessTimeoutError);
  const pid = Number(readFileSync(ready, 'utf8'));
  assertReaped(pid);
  expect(performance.now() - started).toBeLessThan(11_000);
});
