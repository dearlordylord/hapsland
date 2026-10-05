import { createHash } from "node:crypto"

const script = `
const list = document.querySelector('#edits');
const detail = document.querySelector('#detail');
const files = document.querySelector('#files');
const input = document.querySelector('#input');
const source = document.querySelector('#source');
const results = document.querySelector('#results');
const routes = document.querySelector('#routes');
const status = document.querySelector('#status');
const exact = document.querySelector('#exact');
const copy = document.querySelector('#copy');
const copyStatus = document.querySelector('#copy-status');
let exactText = null;
const recording = document.querySelector('#recording');
const pause = document.querySelector('#pause');
const filter = document.querySelector('#filter');
let paused = false, current = null, pending = null, selected = null;
const key = record => record.source.id + ':' + record.correlation.receiptId;
function preserveText(element, text) {
  if (element.textContent === text) return;
  const position = element.scrollTop; element.textContent = text; element.scrollTop = position;
}
function render(snapshot) {
  if (snapshot.status === 'unavailable') { status.textContent = 'History temporarily unavailable'; return; }
  current = snapshot;
  status.textContent = 'Standard endpoint only · ' + (snapshot.truncated ? 'Older rows omitted by the view limit' : 'Retained history');
  const states = snapshot.records.filter(record => record.fact.kind === 'recording-state');
  const recordingText = states.length ? states.map(record => new Date(record.capturedAt).toISOString() + ' · ' + record.scope.root + ' · ' + record.source.lifetime + ' · ' + record.fact.state).join('\\n') : 'No retained recording-state evidence';
  if (recording.textContent !== recordingText) recording.textContent = recordingText;
  const active = document.activeElement?.dataset.key;
  const scroll = list.scrollTop;
  const rows = new Map();
  for (const record of snapshot.records) {
    if (!record.correlation.receiptId) continue;
    const identity = key(record);
    if (!rows.has(identity)) rows.set(identity, []);
    rows.get(identity).push(record);
  }
  list.replaceChildren();
  for (const [identity, records] of rows) {
    const received = records.find(record => record.fact.kind === 'edit-received');
    const first = received || records[0];
    const label = first.scope.root + ' · ' + (first.scope.runtime || 'runtime unavailable') + ' · ' + (received ? received.fact.candidates.map(item => item.path).join(', ') : 'Receipt data unavailable');
    if (!label.toLowerCase().includes(filter.value.toLowerCase())) continue;
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.key = identity; button.textContent = label;
    button.setAttribute('aria-pressed', String(identity === selected));
    button.addEventListener('click', () => { selected = identity; render(current); });
    const item = document.createElement('li'); item.append(button); list.append(item);
    if (identity === active) button.focus({ preventScroll: true });
  }
  list.scrollTop = scroll;
  const records = rows.get(selected) || [];
  const activeRoute = document.activeElement?.dataset.route;
  routes.replaceChildren();

  const routeRecords = records.filter(record => record.fact.kind === 'evaluation-route');
  const skippedRecords = records.filter(record => record.fact.kind === 'preparation-skipped');
  const omissionRecords = records.filter(record => record.fact.kind === 'preparation-omission');
  if (routeRecords.length && (skippedRecords.length || omissionRecords.length)) {
    const summary = document.createElement('p');
    summary.textContent = 'Mixed recorded outcomes: ' + routeRecords.length + ' evaluation route(s), ' + skippedRecords.length + ' skipped path(s), ' + omissionRecords.length + ' preparation omission(s). Inspect each unit and path below.';
    routes.append(summary);
  }

  for (const record of records.filter(record => record.fact.kind === 'evaluation-route')) {
    const fact = record.fact;
    const original = fact.original.status === 'linked' ? snapshot.records.find(candidate => candidate.source.id === record.source.id && candidate.correlation.evaluationId === fact.original.evaluationId && candidate.fact.kind === 'model-input') : null;
    const outcomes = original ? snapshot.records.filter(candidate => candidate.source.id === record.source.id && candidate.correlation.evaluationId === fact.original.evaluationId && candidate.fact.kind === 'evaluation-outcome').map(candidate => candidate.fact.outcome) : [];
    const item = document.createElement('p');
    item.textContent = fact.path + ' · ' + fact.declaration + ' · ' + fact.route + ' · ' + (outcomes.length ? 'Recorded evaluation: ' + outcomes.join(', ') : 'Evaluation outcome not retained or pending');
    if (fact.route !== 'fresh') {
      if (original?.correlation.receiptId) {
        const link = document.createElement('button'); link.type = 'button'; link.textContent = 'Inspect original evaluation';
        link.dataset.route = record.source.id + ':' + record.sequence;
        link.addEventListener('click', () => { selected = key(original); render(current); }); item.append(document.createElement('br'), link);
      } else item.append(document.createTextNode(' · Original evaluation unavailable; capture may be disabled, lost, expired or evicted.'));
    }
    routes.append(item);
  }
  if (!routes.childNodes.length) routes.textContent = 'No retained evaluation routes.';
  if (activeRoute) Array.from(routes.querySelectorAll('button')).find(button => button.dataset.route === activeRoute)?.focus({ preventScroll: true });
  const inputs = records.filter(record => record.fact.kind === 'model-input' && record.fact.payload.status === 'available').map(record => ({ unitId: record.correlation.unitId, input: JSON.parse(record.fact.payload.encoded) }));
  const artifacts = inputs.flatMap(item => [item.input?.artifact, ...(Array.isArray(item.input?.evidence?.nodes) ? item.input.evidence.nodes : [])]).filter(item => item && typeof item.domain === 'string' && typeof item.source === 'string');
  const fileText = [
    'Observed edit paths:', ...records.filter(record => record.fact.kind === 'edit-received').flatMap(record => record.fact.candidates.map(item => item.operation + ' · ' + item.path)),
    '\\nSelected root declarations:', ...records.filter(record => record.fact.kind === 'unit-prepared').map(record => record.fact.path + ' · ' + record.fact.declaration + ' · ' + record.fact.completeness),
    '\\nRecorded physical preparation reads:', ...records.filter(record => record.fact.kind === 'preparation-read').map(record => record.fact.path),
    '\\nSource actually included in captured model input:', ...artifacts.map(item => item.domain + ' · ' + item.name),
    '\\nRecorded skipped preparation paths:', ...records.filter(record => record.fact.kind === 'preparation-skipped').map(record => record.fact.path),
    '\\nRecorded omissions:', ...records.filter(record => record.fact.kind === 'preparation-omission').map(record => record.fact.path + ' · ' + (record.fact.declaration || 'root unavailable') + ' · ' + record.fact.reason),
    ...inputs.flatMap(item => (Array.isArray(item.input?.evidence?.edges) ? item.input.evidence.edges : []).filter(edge => edge.kind === 'omitted').map(edge => edge.symbol + ' · ' + edge.reason))
  ].join('\\n');
  preserveText(files, selected ? fileText : 'Select an edit to inspect file provenance.');
  preserveText(input, inputs.length ? JSON.stringify(inputs, null, 2) : 'No retained model input; original input is unavailable.');
  preserveText(source, artifacts.length ? artifacts.map(item => item.domain + ' · ' + item.name + '\\n' + item.source).join('\\n\\n') : 'No retained included source.');
  const policies = records.filter(record => record.fact.kind === 'unit-policy');
  const policyText = policies.map(record => {
    const fact = record.fact;
    const heading = record.correlation.unitId + ' · ' + fact.activity + ' · ' + fact.provider + '/' + fact.model;
    if (fact.payload.status !== 'available') return heading + '\\nPolicy unavailable: ' + fact.payload.reason;
    return heading + '\\nInterpretation: ' + fact.interpretation + '\\n' + fact.payload.rules.map(rule => rule.ruleId + ' (' + rule.qualifiedId + ')\\nQuestion: ' + rule.question + '\\nFalse criteria: ' + rule.criteria.false + '\\nTrue criteria: ' + rule.criteria.true + '\\nEffective threshold: ' + rule.threshold + '\\nConfigured message: ' + rule.message).join('\\n\\n');
  }).join('\\n\\n');
  const resultText = [
    'Frozen questions and policy:', policyText || 'No retained policy.',
    '\\nValidated backend answers:', JSON.stringify(records.filter(record => record.fact.kind === 'validated-answers').map(record => ({ unitId: record.correlation.unitId, answers: record.fact.answers })), null, 2),
    '\\nInterpreted findings:', JSON.stringify(records.filter(record => record.fact.kind === 'interpreted-findings').map(record => ({ unitId: record.correlation.unitId, payload: record.fact.payload })), null, 2),
    '\\nObserved outcomes:', ...records.filter(record => record.fact.kind === 'evaluation-outcome').map(record => record.correlation.unitId + ' · ' + record.fact.outcome)
  ].join('\\n');
  preserveText(results, selected ? resultText : 'Select an edit to inspect results.');
  const transport = rows.get(selected)?.find(record => record.fact.kind === 'transport-invoked')?.fact;
  exactText = null;
  let requestText = selected ? 'No retained transport invocation for this receipt' : 'Select an edit to inspect its exact request.';
  if (transport?.payload.status === 'available') {
    try {
      const bytes = Uint8Array.from(atob(transport.payload.encoded), character => character.charCodeAt(0));
      exactText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      requestText = exactText;
    } catch { requestText = 'Retained body is not valid UTF-8; text copy is unavailable'; }
  } else if (transport) requestText = 'Request body unavailable: ' + transport.payload.reason;
  copy.disabled = exactText === null;
  if (exact.textContent !== requestText) { const position = exact.scrollTop; exact.textContent = requestText; exact.scrollTop = position; copyStatus.textContent = ''; }
  const detailText = selected ? (rows.has(selected) ? JSON.stringify(rows.get(selected), null, 2) : 'Selected receipt is no longer retained') : 'Select an edit to inspect its captured evidence.';
  if (detail.textContent !== detailText) { const position = detail.scrollTop; detail.textContent = detailText; detail.scrollTop = position; }
}
copy.addEventListener('click', async () => {
  if (exactText === null) return;
  try { await navigator.clipboard.writeText(exactText); copyStatus.textContent = 'Exact request copied'; }
  catch { copyStatus.textContent = 'Clipboard unavailable; select the request text to copy'; }
});
pause.addEventListener('click', () => {
  paused = !paused; pause.textContent = paused ? 'Resume' : 'Pause'; pause.setAttribute('aria-pressed', String(paused));
  if (!paused && pending) { render(pending); pending = null; }
});
filter.addEventListener('input', () => { if (current) render(current); });
const feed = new EventSource(new URL('events', location.href));
feed.addEventListener('snapshot', event => {
  const snapshot = JSON.parse(event.data);
  if (paused) { pending = snapshot; status.textContent = "Paused · latest snapshot available on resume"; } else render(snapshot);
});
feed.onerror = () => { status.textContent = 'Disconnected; reconnecting to retained history'; };
window.addEventListener('pagehide', () => feed.close());
`
const style = `body{font:16px system-ui;margin:0;padding:1rem;color:#e6e9ef;background:#11151d}h1{font-size:1.5rem}button,input{font:inherit;padding:.6rem;color:inherit;background:#202837;border:1px solid #63718a;border-radius:.3rem}button:focus-visible,input:focus-visible{outline:3px solid #a9c6ff}main{display:grid;grid-template-columns:minmax(16rem,1fr) minmax(0,2fr);gap:1rem}ul{padding:0;list-style:none;max-height:70vh;overflow:auto}li{margin:.4rem 0}li button{width:100%;text-align:left;overflow-wrap:anywhere}[aria-pressed=true]{border-color:#a9c6ff}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:1rem;background:#1a2230;max-height:70vh;overflow:auto}label{display:block;margin:.7rem 0}input{max-width:90%}@media(max-width:650px){main{display:block}}`
const hash = (value: string) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`
export const inspectionPagePolicy = `default-src 'none'; script-src ${hash(script)}; style-src ${hash(style)}; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`
export const inspectionPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hapsland inspection</title><style>${style}</style><body><h1>Hapsland inspection</h1><p>Opening this view does not enable recording.</p><p id="status" role="status">Connecting to retained history</p><button id="pause" type="button" aria-pressed="false">Pause</button><label>Filter project, runtime or path <input id="filter" type="search"></label><section aria-label="Recording evidence"><h2>Recording state observations</h2><p>Historical observations; current resident recording state is not verified.</p><pre id="recording">No retained recording-state evidence</pre></section><main><section aria-label="Captured edits"><ul id="edits"></ul></section><section aria-label="Selected evidence"><h2>Files</h2><pre id="files">Select an edit to inspect file provenance.</pre><h2>Exact HTTP request body</h2><p>Captured at transport invocation; this does not establish remote receipt.</p><button id="copy" type="button" disabled>Copy exact request</button><span id="copy-status" role="status"></span><pre id="exact">Select an edit to inspect its exact request.</pre><h2>Captured model input (structured)</h2><pre id="input">No retained model input.</pre><h2>Included source from captured model input</h2><pre id="source">No retained included source.</pre><h2>Per-unit evaluation routes</h2><div id="routes">No retained evaluation routes.</div><h2>Results</h2><pre id="results">Select an edit to inspect results.</pre><h2>Timeline and captured evidence</h2><pre id="detail">Select an edit to inspect its captured evidence.</pre></section></main><script>${script}</script></body></html>`
