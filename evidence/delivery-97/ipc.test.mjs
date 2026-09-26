import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=mkdtempSync(join(tmpdir(),'hapsland-97-ipc-test-'));
const socket=join(root,'service.sock'),events=join(root,'events.jsonl');
const service=resolve(fileURLToPath(new URL('./ipc-service.mjs',import.meta.url)));
const child=spawn(process.execPath,[service],{env:{...process.env,HAPSLAND_PROBE_SOCKET:socket,HAPSLAND_PROBE_EVENTS:events},stdio:'ignore'});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const rpc=(payload)=>new Promise((resolvePromise,reject)=>{
  const connection=net.createConnection(socket);let data='';
  connection.on('connect',()=>connection.write(`${JSON.stringify(payload)}\n`));
  connection.on('data',chunk=>data+=chunk);
  connection.on('error',reject);
  connection.on('end',()=>resolvePromise(JSON.parse(data)));
});
try {
  for(let i=0;i<100&&!existsSync(socket);i++)await sleep(20);
  assert.ok(existsSync(socket));
  assert.equal((await rpc({op:'admit',advicee:'child-a:root',units:1,delayMs:100})).admitted,1);
  await sleep(140);
  assert.equal((await rpc({op:'collect',advicee:'child-b:root',deadline:Date.now()+100})).findings,0);
  assert.equal((await rpc({op:'collect',advicee:'child-a:root',deadline:Date.now()+100})).findings,1);
  assert.equal((await rpc({op:'collect',advicee:'child-a:root',deadline:Date.now()+100})).findings,0);
  assert.equal((await rpc({op:'admit',advicee:'multi:root',units:2,delayMs:100})).admitted,2);
  await sleep(160);
  assert.equal((await rpc({op:'collect',advicee:'multi:root',deadline:Date.now()+100})).findings,2);
  assert.equal((await rpc({op:'admit',advicee:'failure:root',units:1,delayMs:100,failure:true})).admitted,1);
  await sleep(120);
  const unavailable=await rpc({op:'collect',advicee:'failure:root',deadline:Date.now()+100});
  assert.equal(unavailable.findings,0);assert.equal(unavailable.unavailable,1);
  assert.equal((await rpc({op:'admit',advicee:'late:root',units:1,delayMs:400})).admitted,1);
  assert.equal((await rpc({op:'collect',advicee:'late:root',deadline:Date.now()+120})).findings,0);
  await sleep(450);
  assert.equal((await rpc({op:'collect',advicee:'late:root',deadline:Date.now()+100})).findings,1);
  process.stdout.write('IPC advicee isolation, once-only collection, multi-unit, failure, and post-timeout retention: pass\n');
} finally {child.kill('SIGTERM');await new Promise(r=>child.once('close',r));rmSync(root,{recursive:true,force:true});}
