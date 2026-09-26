import net from 'node:net';
import { appendFileSync, unlinkSync } from 'node:fs';

const socketPath = process.env.HAPSLAND_PROBE_SOCKET;
const eventsPath = process.env.HAPSLAND_PROBE_EVENTS;
const log = (kind, fields = {}) => appendFileSync(eventsPath, `${JSON.stringify({kind, at: Date.now(), ...fields})}\n`);
const partitions = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reply = (connection, value) => { connection.end(`${JSON.stringify(value)}\n`); };

const handle = async (connection, request) => {
  if (!request || typeof request.advicee !== 'string') return reply(connection, {ok:false});
  const {advicee} = request;
  if (request.op === 'admit') {
    if (partitions.has(advicee)) return reply(connection, {ok:true, joined:true});
    const units = [];
    const count = Math.max(1, Math.min(4, Number(request.units) || 1));
    const delay = Math.max(0, Math.min(30000, Number(request.delayMs) || 0));
    const failure = request.failure === true;
    for (let id = 1; id <= count; id++) {
      const unit = {id, status:'pending'};
      units.push(unit);
      setTimeout(() => {
        unit.status = failure ? 'unavailable' : 'finding';
        log('backend-complete', {unit:id, outcome:unit.status, advicee});
      }, delay + (id - 1) * 30);
    }
    partitions.set(advicee, {units, submitted:false});
    log('review-admitted', {units:count, advicee});
    return reply(connection, {ok:true, admitted:count});
  }
  if (request.op === 'collect') {
    log('ipc-collect-entry', {advicee});
    const deadline = Math.min(Date.now() + 4800, Number(request.deadline) || Date.now());
    const partition = partitions.get(advicee);
    if (!partition || partition.submitted) return reply(connection, {ok:true, findings:0, unavailable:0});
    while (Date.now() < deadline - 80 && partition.units.every((unit) => unit.status === 'pending')) await sleep(20);
    const findings = partition.units.filter((unit) => unit.status === 'finding').length;
    const unavailable = partition.units.filter((unit) => unit.status === 'unavailable').length;
    if (findings > 0) partition.submitted = true;
    log('ipc-collect-result', {advicee, findings, unavailable});
    return reply(connection, {ok:true, findings, unavailable});
  }
  return reply(connection, {ok:false});
};

try { unlinkSync(socketPath); } catch {}
const server = net.createServer((connection) => {
  let buffer = '';
  connection.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > 8192) {connection.destroy();return;}
    const newline = buffer.indexOf('\n');
    if (newline < 0) return;
    const line = buffer.slice(0,newline);
    buffer = '';
    try { void handle(connection,JSON.parse(line)); } catch {reply(connection,{ok:false});}
  });
});
server.listen(socketPath, () => log('service-ready'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
