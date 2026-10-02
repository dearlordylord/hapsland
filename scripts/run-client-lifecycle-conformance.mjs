// Offline regression for the public multi-client lifecycle. Uses isolated homes and a local registry fixture.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const checkout = process.cwd();
const root = mkdtempSync(join(tmpdir(), 'hapsland-lifecycle-smoke-'));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const env = { ...process.env, HOME: root, TYPESAFE_API_KEY: 'offline-fixture-key', REVIEW_USER_CONFIG_PATH: join(root, 'review.jsonc'), REVIEW_STATE_PATH: join(root, 'state'), PATH: `${root}:${process.env.PATH}` };
delete env.REVIEW_INSTALL_ENTRYPOINT; delete env.REVIEW_INSTALL_RUNTIME; delete env.HAPSLAND_ACTIVE_DISPATCH;
const repository = join(root, 'repository'); mkdirSync(repository); execFileSync('git', ['init', '--quiet', repository]);
const claudeHome = join(root, '.claude'); const codexHome = join(root, '.codex');
writeFileSync(join(root, 'claude'), "#!/bin/sh\nprintf '2.1.218\\n'\n", { mode: 0o700 });
writeFileSync(join(root, 'codex'), "#!/bin/sh\nprintf 'codex-cli 0.155.1\\n'\n", { mode: 0o700 });
writeFileSync(join(root, 'npm'), `#!${process.execPath}
const fs=require('node:fs'); const path=require('node:path');
const args=process.argv.slice(2);
if(args[0]==='view'){process.stdout.write('"0.1.0"');process.exit(0);}
if(args[0]!=='install') throw Error('unexpected npm operation');
const prefix=args[args.indexOf('--prefix')+1]; const pkg=path.join(prefix,'lib/node_modules/@hapsland/hapsland');
fs.mkdirSync(pkg,{recursive:true}); fs.cpSync(${JSON.stringify(join(checkout, 'dist'))},path.join(pkg,'dist'),{recursive:true});
for(const name of ['package.json','package-runtime.json'])fs.copyFileSync(path.join(${JSON.stringify(checkout)},name),path.join(pkg,name));
fs.symlinkSync(${JSON.stringify(join(checkout, 'node_modules'))},path.join(pkg,'node_modules'),'dir');
fs.symlinkSync(${JSON.stringify(join(checkout, 'native'))},path.join(pkg,'native'),'dir');
fs.mkdirSync(path.join(prefix,'bin'));
for(const [name,entry] of [['hapsland','cli.js'],['hapsland-doctor','package-doctor.js']]){
const q=s=>"'"+s.replaceAll("'","'\\\\''")+"'";
fs.writeFileSync(path.join(prefix,'bin',name),'#!/bin/sh\\nexec '+q(${JSON.stringify(process.execPath)})+' '+q(path.join(pkg,'dist',entry))+' "$@"\\n',{mode:0o700});
}
`, { mode: 0o700 });
const terminal = async args => {
  const command = [process.execPath, join(checkout, 'src/cli.ts'), ...args].map(quote).join(' ');
  const child = spawn('script', ['-qfec', command, '/dev/null'], { env, cwd: repository, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; let sent = 0;
  child.stdout.on('data', chunk => {
    output += chunk;
    const count = output.match(/\[y\/N\]/g)?.length ?? 0;
    if (count > sent) { sent = count; child.stdin.write('y\n'); }
  });
  child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error(output.slice(-1500)));},45000);
    child.on('error',reject); child.on('close',code=>{clearTimeout(timer);resolve(code);});
  });
  assert(!output.includes('offline-fixture-key'));
  return { code, output, confirmations: sent };
};
try {
  for (const host of ['claude', 'codex']) assert.equal((await terminal(['setup', host])).code, 0);
  const originalClaude = readFileSync(join(claudeHome, 'settings.json'), 'utf8');
  assert(originalClaude.includes(join(checkout, 'src/cli.ts')));
  env.REVIEW_INSTALL_FAIL_AFTER_WRITES = '1';
  const interrupted = await terminal(['update','codex']);
  assert.notEqual(interrupted.code,0,interrupted.output);
  assert(interrupted.output.includes('hapsland repair codex'),interrupted.output);
  delete env.REVIEW_INSTALL_FAIL_AFTER_WRITES;
  const resumed = await terminal(['repair','codex']); assert.equal(resumed.code,0,resumed.output);
  const update = await terminal(['update']); assert.equal(update.code, 0, update.output); assert.equal(update.confirmations, 1);
  const updatedClaude = readFileSync(join(claudeHome, 'settings.json'), 'utf8'); assert.notEqual(updatedClaude, originalClaude);
  const active = JSON.parse(readFileSync(join(root, '.local/share/hapsland/active.json'), 'utf8'));
  assert(active.entrypoint.includes('/candidates/snapshot-'));
  const repeated = await terminal(['update']); assert.equal(repeated.code, 0, repeated.output); assert.equal(repeated.confirmations, 0);
  assert(repeated.output.includes('claude: already current')); assert(repeated.output.includes('codex: already current'));
  assert.equal(readdirSync(join(root, '.local/share/hapsland/candidates')).filter(name=>name.startsWith('snapshot-')).length, 1);
  const setup = await terminal(['setup','claude']); assert.equal(setup.code,0,setup.output); assert.equal(setup.confirmations,0);
  assert.equal(readFileSync(join(claudeHome, 'settings.json'), 'utf8'), updatedClaude);
  const doctor = await terminal(['doctor']); assert(doctor.output.includes('configuration-ownership: ready'),doctor.output); assert(!doctor.output.includes('installation damaged'),doctor.output);
  for(const [home,file] of [[claudeHome,'settings.json'],[codexHome,'hooks.json']]){
    const path=join(home,file); const settings=JSON.parse(readFileSync(path,'utf8')); delete settings.hooks.Stop; settings.userSetting='preserved'; writeFileSync(path,JSON.stringify(settings));
  }
  const repair=await terminal(['repair']); assert.equal(repair.code,0,repair.output);
  for(const [home,file] of [[claudeHome,'settings.json'],[codexHome,'hooks.json']]){const value=JSON.parse(readFileSync(join(home,file),'utf8'));assert.equal(value.userSetting,'preserved');assert.equal(value.hooks.Stop.length,1);}
  rmSync(active.entrypoint);
  const fallback = await terminal(['reinstall']); assert.equal(fallback.code,0,fallback.output);
  assert(fallback.output.includes('reinstalling from the package in PATH'),fallback.output);
  assert.equal(JSON.parse(readFileSync(join(root, '.local/share/hapsland/active.json'), 'utf8')).entrypoint,join(checkout,'src/cli.ts'));
  for(const [home,file] of [[claudeHome,'settings.json'],[codexHome,'hooks.json']]) assert.equal(JSON.parse(readFileSync(join(home,file),'utf8')).userSetting,'preserved');
  const removal=await terminal(['uninstall']);assert.equal(removal.code,0,removal.output);
  console.log('PASS: ordinary registry update twice, one snapshot, no repeated approval, active CLI dispatch, no setup rollback, partial update resumed through public repair, both-client doctor/repair/reinstall/uninstall, missing active-package recovery, settings preserved; offline fixture only.');
} finally { rmSync(root,{recursive:true,force:true}); }
