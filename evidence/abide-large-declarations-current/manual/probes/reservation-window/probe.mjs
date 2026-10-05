// Run only after inspection of anonymous subject/support; no arm, reviewer or log inputs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('/tmp/hapsland-quality-scorer/node_modules/typescript');
const [dir, mode = 'clock-object', output] = process.argv.slice(2);
const source = fs.readFileSync(path.join(dir, 'subject.ts'), 'utf8');
const support = fs.existsSync(path.join(dir, 'support.ts')) ? fs.readFileSync(path.join(dir, 'support.ts'), 'utf8') : '';
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
let hiddenNow = 1000, clockCalls = 0, hiddenCalls = 0;
const context = vm.createContext({ Date: { now: () => { hiddenCalls++; return hiddenNow; } } }, { codeGeneration: { strings: false, wasm: false } });
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  if (!['subject', 'support'].includes(name)) throw Error('Forbidden module');
  const exports = {};
  cache.set(name, exports);
  context.__exports = exports;
  context.__require = dependency => { if (name !== 'subject' || dependency !== './support') throw Error('Forbidden import'); return load('support'); };
  const text = name === 'subject' ? source : support;
  const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext('(function(exports,require){' + code + '\n})(__exports,__require)', context, { timeout: 1000 });
  return exports;
}
const subject = load('subject');
const baseline = { reference: 'r-α/27', requestedSeats: 2, remainingSeats: 4, holdUntil: 100, temporarilyClosed: false };
const examples = [
  { name: 'before-deadline', time: 99, fields: {}, status: 'available' },
  { name: 'at-deadline', time: 100, fields: {}, status: 'expired' },
  { name: 'after-deadline', time: 101, fields: {}, status: 'expired' },
  { name: 'closed-dominates-expired-and-unavailable', time: 101, fields: { temporarilyClosed: true, requestedSeats: 9 }, status: 'closed' },
  { name: 'expired-dominates-unavailable', time: 101, fields: { requestedSeats: 9 }, status: 'expired' },
  { name: 'unavailable-before-deadline', time: 99, fields: { requestedSeats: 9 }, status: 'unavailable' },
  { name: 'exact-inventory-available', time: 99, fields: { requestedSeats: 4 }, status: 'available' },
  { name: 'arbitrary-reference-and-description', time: 99, fields: { reference: 'any reference: 空白' }, label: '  arbitrary presentation Ω  ', status: 'available' },
];
const checks = [];
for (const example of examples) {
  clockCalls = 0; hiddenCalls = 0;
  const request = { ...baseline, ...example.fields }, label = example.label ?? '  Demo reservation  ';
  const now = () => { clockCalls++; return example.time; };
  const dependency = mode === 'clock-object' ? { now } : mode === 'clock-function' ? now : example.time;
  if (mode === 'hidden') hiddenNow = example.time; else hiddenNow = 1000;
  context.__call = subject.CaseState;
  context.__args = mode === 'hidden' ? [label, request] : [label, request, dependency];
  const actual = vm.runInContext('__call(...__args)', context, { timeout: 1000 });
  const expected = { description: label.trim(), reference: request.reference, status: example.status,
    seatsAfterBooking: example.status === 'available' ? Math.max(0, request.remainingSeats - request.requestedSeats) : request.remainingSeats };
  checks.push({ label: example.name, expected, actual: JSON.parse(JSON.stringify(actual)),
    passed: Object.entries(expected).every(([key,value]) => actual?.[key] === value) });
  const expectedClockCalls = mode === 'observation-time' || mode === 'hidden' ? 0 : 1;
  checks.push({ label: example.name + '-resource-use', expected: { suppliedClockCalls: expectedClockCalls, hiddenClockCalls: mode === 'hidden' ? 1 : 0 },
    actual: { suppliedClockCalls: clockCalls, hiddenClockCalls: hiddenCalls },
    passed: clockCalls === expectedClockCalls && hiddenCalls === (mode === 'hidden' ? 1 : 0) });
}
const record = { version: 1, blinded: true, typescriptVersion: ts.version, sourceDigest: hash(source), supportingDigest: hash(support), mode,
  sourceClass: 'RUN', verificationState: 'RUNTIME-TESTED', checks };
if (output) fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else console.log(JSON.stringify(record));
