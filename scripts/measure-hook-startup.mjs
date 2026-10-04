import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, ftruncateSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir, availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';

const declarationPath = process.argv[2];
if (!declarationPath) throw new Error('usage: node scripts/measure-hook-startup.mjs DECLARATION.json');
const declaration = JSON.parse(readFileSync(declarationPath, 'utf8'));
if (declaration.samples !== 15 || declaration.coldSamples !== 3 || declaration.variants.length !== 3 ||
    declaration.healthyResidentVariant !== 'bun' || !declaration.variants.some(variant => variant.name === 'bun'))
  throw new Error('declare three variants, fifteen healthy samples, three cold samples and the shared Bun resident');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), declaration, declarationSha256: hash(declarationPath), runnerSha256: hash(import.meta.filename),
  platform: process.platform, architecture: process.arch, availableParallelism: availableParallelism(),
  coverage: false, fileCache: 'uncontrolled OS cache; new client process for every sample',
  measurement: 'full before-command wall time; registration outcome retained even on failure', samples: [], retirements: [] };
let outputDescriptor;
const persist = () => {
  const encoded = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  let written = 0;
  while (written < encoded.length) written += writeSync(outputDescriptor, encoded, written, encoded.length - written, written);
  ftruncateSync(outputDescriptor, encoded.length);
};
const pause = () => new Promise(done => setTimeout(done, 20));
const installedCommands = prefix => {
  const root = realpathSync(join(prefix, 'node_modules/@hapsland/hapsland'));
  const runtimeDeclaration = JSON.parse(readFileSync(join(root, 'package-runtime.json'), 'utf8'));
  if (runtimeDeclaration.runtime.name === 'bun') {
    const directory = join(root, 'dist/bin', `${process.platform}-${process.arch}`);
    return { runtimeDeclaration, cli: { executable: realpathSync(join(directory, 'hapsland')), args: [] },
      resident: { executable: realpathSync(join(directory, 'hapsland-resident')), args: [] } };
  }
  if (runtimeDeclaration.runtime.name !== 'node') throw new Error('unsupported benchmark runtime');
  const runtimePackage = `node-${process.platform === 'darwin' ? 'bin-darwin' : process.platform}-${process.arch}`;
  const candidates = [join(root, 'node_modules', runtimePackage, 'bin/node'), join(prefix, 'node_modules', runtimePackage, 'bin/node')];
  const runtime = candidates.find(existsSync);
  if (!runtime) throw new Error('installed benchmark runtime missing');
  return { runtimeDeclaration, cli: { executable: realpathSync(runtime), args: [realpathSync(join(root, 'dist/cli.js'))] },
    resident: { executable: realpathSync(runtime), args: [realpathSync(join(root, 'dist/resident/main.js'))] } };
};
const fixtures = [];
const makeFixture = variant => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-startup-'));
  execFileSync('git', ['init', '--quiet', root], { timeout: 30_000 });
  const prefix = resolve(variant.prefix);
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    key !== 'NODE_V8_COVERAGE' && key !== 'NODE_OPTIONS' && !/^(?:REVIEW_|HAPSLAND_)/u.test(key)));
  const commands = installedCommands(prefix);
  const fixture = { variant: variant.name, prefix, root, commands, directory: join(root, 'runtime'),
    cli: join(prefix, 'node_modules/.bin/hapsland'), resident: join(prefix, 'node_modules/.bin/hapsland-resident'),
    env: { ...inherited, REVIEW_RESIDENT_DIR: join(root, 'runtime'), REVIEW_STATE_PATH: join(root, 'state'),
      REVIEW_ACTIVITY_PATH: join(root, 'activity'), REVIEW_USER_CONFIG_PATH: join(root, 'user.json') } };
  fixtures.push(fixture);
  return fixture;
};
const stats = fixture => new Promise((done, reject) => {
  const owner = JSON.parse(readFileSync(join(fixture.directory, 'owner.json'), 'utf8'));
  const socket = connect(join(fixture.directory, 'resident.sock'));
  let output = '';
  socket.setTimeout(1_000, () => socket.destroy(new Error('stats timeout')));
  socket.on('error', reject);
  socket.on('end', () => reject(new Error('stats ended without a complete response')));
  socket.on('close', () => reject(new Error('stats closed without a complete response')));
  socket.on('connect', () => socket.write(`${JSON.stringify({ version: 1, operation: 'stats', lifetime: owner.lifetime })}\n`));
  socket.on('data', data => {
    output += data;
    if (output.length > 262_144) { socket.destroy(new Error('stats exceeded bound')); return; }
    if (!output.includes('\n')) return;
    socket.end();
    try {
      const response = JSON.parse(output.slice(0, output.indexOf('\n')));
      if (response.status !== 'stats') reject(new Error('resident not ready'));
      else done();
    } catch { reject(new Error('invalid stats response')); }
  });
});
const ready = async fixture => {
  const deadline = performance.now() + 20_000;
  while (performance.now() < deadline) {
    try { await stats(fixture); return; } catch { await pause(); }
  }
  throw new Error('resident readiness failed');
};
const call = (fixture, operation, id) => new Promise(done => {
  const start = performance.now();
  const child = spawn(fixture.cli, ['--pi-hook'], { env: fixture.env, stdio: ['pipe', 'pipe', 'ignore'] });
  let output = '';
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 7_000);
  child.stdout.on('data', data => { output += data; if (output.length > 262_144) child.kill('SIGKILL'); });
  child.stdin.on('error', () => {});
  child.once('error', () => { clearTimeout(timer); done({ status: 'spawn-error', elapsedMs: performance.now() - start }); });
  child.once('close', code => {
    clearTimeout(timer);
    let status = 'invalid-response';
    try {
      const parsed = JSON.parse(output).status;
      if (['registered', 'incomplete', 'unavailable', 'retired'].includes(parsed)) status = parsed;
    } catch {}
    done({ status: timedOut ? 'timeout' : code === 0 ? status : 'process-failed', responseStatus: status,
      elapsedMs: performance.now() - start, exitCode: code });
  });
  child.stdin.end(JSON.stringify({ operation, cwd: fixture.root, session_id: 'startup-comparison',
    tool_use_id: id, host_version: '1.0.0', tool_name: 'edit' }));
});
// Pin both executable and exact entrypoint/directory arguments. A prefix argument
// alone is not evidence that an arbitrary live PID belongs to this fixture.
const observeProcess = (pid, fixture) => {
  try {
    const executable = realpathSync(`/proc/${pid}/exe`);
    const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    const expected = fixture.commands.resident;
    const argv = [...expected.args, fixture.directory];
    let argvExecutable;
    try { argvExecutable = realpathSync(args[0]); } catch {}
    const owned = executable === expected.executable && args.length === argv.length + 1 &&
      argvExecutable === expected.executable && argv.every((arg, index) => args[index + 1] === arg);
    return { pid, start, owned };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return undefined;
    throw new Error(`unable to establish resident ownership for PID ${pid}`);
  }
};
const fixtureProcesses = fixture => {
  const pids = new Set();
  if (fixture.child?.pid && fixture.child.exitCode === null && fixture.child.signalCode === null) pids.add(fixture.child.pid);
  // A cold resident publishes the lock before its socket-ready owner record.
  for (const path of [join(fixture.directory, 'owner.json'), join(fixture.directory, 'owner.lock/owner.json')]) {
    try {
      const owner = JSON.parse(readFileSync(path, 'utf8'));
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('invalid owner PID');
      pids.add(owner.pid);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('unable to read benchmark resident owner');
    }
  }
  // Also catch a detached cold launcher before either ownership file exists.
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/u.test(entry)) continue;
    try {
      const args = readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0');
      if (args.includes(fixture.directory)) pids.add(Number(entry));
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw new Error('unable to inspect pending benchmark processes');
    }
  }
  return [...pids].map(pid => observeProcess(pid, fixture)).filter(Boolean);
};
const waitForDeath = async (processIdentity, fixture, durationMs) => {
  const deadline = performance.now() + durationMs;
  while (performance.now() < deadline) {
    const current = observeProcess(processIdentity.pid, fixture);
    if (!current || current.start !== processIdentity.start) return true;
    if (!current.owned) throw new Error('resident ownership changed during cleanup');
    await pause();
  }
  return false;
};
const stopOwned = async (identity, fixture) => {
  const signal = name => {
    const current = observeProcess(identity.pid, fixture);
    if (!current || current.start !== identity.start) return;
    if (!current.owned) throw new Error('resident ownership changed before signal');
    try { process.kill(identity.pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  signal('SIGTERM');
  if (!await waitForDeath(identity, fixture, 3_000)) {
    signal('SIGKILL');
    if (!await waitForDeath(identity, fixture, 3_000)) throw new Error('resident did not terminate after kill');
  }
};
const terminate = async fixture => {
  // Wait for a directly spawned shell to exec the declared resident. Never
  // signal an unproven process or delete the directory while startup is pending.
  const deadline = performance.now() + 20_000;
  for (;;) {
    const processes = fixtureProcesses(fixture);
    if (processes.some(process => !process.owned)) {
      if (performance.now() >= deadline) throw new Error(`cleanup retained uncertain runtime ${fixture.root}`);
      await pause();
      continue;
    }
    for (const process of processes) await stopOwned(process, fixture);
    if (fixtureProcesses(fixture).length === 0) break;
    if (performance.now() >= deadline) throw new Error(`cleanup retained live runtime ${fixture.root}`);
  }
  if (fixture.child && fixture.child.exitCode === null && fixture.child.signalCode === null) {
    await Promise.race([fixture.childClosed, new Promise((_, reject) => setTimeout(() => reject(new Error('resident child did not close')), 3_000))]);
  }
  // Recheck after child-close: a startup descendant must not outlive its state.
  if (fixtureProcesses(fixture).length) throw new Error(`cleanup retained active runtime ${fixture.root}`);
  rmSync(fixture.root, { recursive: true, force: true });
};

if (process.platform !== 'linux') throw new Error('this timing/cleanup profile currently requires Linux');
report.variants = declaration.variants.map(variant => {
  const archiveSha256 = hash(variant.archive);
  if (archiveSha256 !== variant.archiveSha256) throw new Error('variant archive checksum mismatch');
  const commands = installedCommands(resolve(variant.prefix));
  return { name: variant.name, archiveSha256,
    launcherSha256: hash(join(variant.prefix, 'node_modules/.bin/hapsland')),
    runtimeDeclaration: commands.runtimeDeclaration,
    commands: Object.fromEntries(['cli', 'resident'].map(role => [role, {
      executableSha256: hash(commands[role].executable),
      ...(commands[role].args.length ? { entrypointSha256: hash(commands[role].args[0]) } : {}),
    }])) };
});
// Reserve a new artifact exclusively; rerunning a declaration cannot overwrite evidence.
outputDescriptor = openSync(resolve(declaration.output), 'wx', 0o600);
let failure;
try {
  persist();
  const shared = makeFixture(declaration.variants.find(variant => variant.name === declaration.healthyResidentVariant));
  if (shared.commands.runtimeDeclaration.runtime.name !== 'bun') throw new Error('shared healthy resident must use Bun');
  shared.child = spawn(shared.resident, [shared.directory], { env: shared.env, stdio: 'ignore' });
  shared.childClosed = new Promise(done => shared.child.once('close', done));
  shared.child.once('error', () => { shared.spawnFailed = true; });
  await ready(shared);
  const healthy = declaration.variants.map(variant => ({ ...shared, variant: variant.name,
    cli: join(resolve(variant.prefix), 'node_modules/.bin/hapsland') }));
  for (let index = 0; index < declaration.samples; index++) {
    for (const fixture of healthy) {
      const id = randomUUID();
      const result = await call(fixture, 'before', id);
      report.samples.push({ variant: fixture.variant, mode: 'healthy-resident', index, ...result });
      persist();
      const retired = await call(fixture, 'retire', id);
      report.retirements.push({ variant: fixture.variant, index, ...retired });
      persist();
      if (retired.status !== 'retired') throw new Error('permit retirement failed');
    }
  }
  await terminate(shared);
  fixtures.length = 0;
  for (let index = 0; index < declaration.coldSamples; index++) {
    for (const variant of declaration.variants) {
      const fixture = makeFixture(variant);
      report.samples.push({ variant: fixture.variant, mode: 'cold-resident', index,
        ...await call(fixture, 'before', randomUUID()) });
      persist();
      await ready(fixture);
      await terminate(fixture);
      fixtures.pop();
    }
  }
  report.completed = true;
} catch (error) {
  failure = error;
} finally {
  const cleanupErrors = [];
  for (const fixture of fixtures) {
    try { await terminate(fixture); } catch (error) { cleanupErrors.push(error); }
  }
  report.cleanup = { status: cleanupErrors.length ? 'incomplete' : 'complete', retainedFixtures: cleanupErrors.length };
  try { persist(); } finally { closeSync(outputDescriptor); }
  if (failure || cleanupErrors.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], 'benchmark or cleanup failed');
}

