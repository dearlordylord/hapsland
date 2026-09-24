import net from 'node:net';
import { appendFileSync, readFileSync } from 'node:fs';

const enteredAt = Date.now();
const eventsPath = process.env.HAPSLAND_PROBE_EVENTS;
const socketPath = process.env.HAPSLAND_PROBE_SOCKET;
const log = (kind, fields = {}) => appendFileSync(eventsPath, `${JSON.stringify({kind,at:Date.now(),...fields})}\n`);
log('hook-entry');
const input = JSON.parse(readFileSync(0, 'utf8'));
const event = input.hook_event_name;
const recipient = `${input.session_id ?? ''}:${input.agent_id ?? 'root'}:${input.cwd ?? ''}`;
const request = (payload, deadline) => new Promise((resolve) => {
  const connection = net.createConnection(socketPath);
  let buffer = '', settled = false;
  const finish = (value) => {if(settled)return;settled=true;connection.destroy();resolve(value);};
  connection.setTimeout(Math.max(1,deadline-Date.now()),()=>finish(undefined));
  connection.on('connect',()=>connection.write(`${JSON.stringify(payload)}\n`));
  connection.on('data',(chunk)=>{buffer+=chunk;if(buffer.includes('\n')){try{finish(JSON.parse(buffer.slice(0,buffer.indexOf('\n'))));}catch{finish(undefined);}}});
  connection.on('error',()=>finish(undefined));
  connection.on('close',()=>finish(undefined));
});
const output = async (value) => new Promise((resolve) => process.stdout.write(JSON.stringify(value), resolve));

if (event === 'PostToolUse') {
  if (input.tool_name === 'apply_patch' && typeof input.tool_input?.command === 'string' && /^\+.*BAD/m.test(input.tool_input.command) && input.tool_input.command.includes('synthetic.ts')) {
    log('edit-hook-entry', {recipient});
    const result = await request({op:'admit',recipient,units:Number(process.env.HAPSLAND_PROBE_UNITS ?? '1'),delayMs:Number(process.env.HAPSLAND_PROBE_DELAY_MS ?? '0'),failure:process.env.HAPSLAND_PROBE_FAILURE === '1'},enteredAt+2000);
    log('edit-hook-return', {admitted:result?.admitted??0,elapsedMs:Date.now()-enteredAt});
  }
  process.exit(0);
}

if (event === 'Stop') {
  log('stop-entry', {recipient,stopHookActive:input.stop_hook_active===true});
  if (input.stop_hook_active !== true) {
    const result = await request({op:'collect',recipient,deadline:enteredAt+4500},enteredAt+4700);
    let currentBad = false;
    try { currentBad = readFileSync(`${input.cwd}/synthetic.ts`,'utf8').includes('"BAD"'); } catch {}
    if (result?.findings > 0 && currentBad) {
      await output({decision:'block',reason:'Synthetic review finding: change the value in synthetic.ts from BAD to GOOD before finishing.'});
      log('host-submission', {recipient,findings:result.findings});
    }
    log('stop-return', {elapsedMs:Date.now()-enteredAt,findings:result?.findings??0,unavailable:result?.unavailable??0,submitted:Boolean(result?.findings>0&&currentBad)});
  } else {
    log('stop-return', {elapsedMs:Date.now()-enteredAt,submitted:false,continuationCapped:true});
  }
  process.exit(0);
}
if (event === 'SessionEnd') log('session-end');
