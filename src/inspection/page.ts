import { createHash } from "node:crypto"

const script = `
const list = document.querySelector('#edits');
const detail = document.querySelector('#detail');
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
export const inspectionPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hapsland inspection</title><style>${style}</style><body><h1>Hapsland inspection</h1><p>Opening this view does not enable recording.</p><p id="status" role="status">Connecting to retained history</p><button id="pause" type="button" aria-pressed="false">Pause</button><label>Filter project, runtime or path <input id="filter" type="search"></label><section aria-label="Recording evidence"><h2>Recording state observations</h2><p>Historical observations; current resident recording state is not verified.</p><pre id="recording">No retained recording-state evidence</pre></section><main><section aria-label="Captured edits"><ul id="edits"></ul></section><section aria-label="Selected evidence"><h2>Exact HTTP request body</h2><p>Captured at transport invocation; this does not establish remote receipt.</p><button id="copy" type="button" disabled>Copy exact request</button><span id="copy-status" role="status"></span><pre id="exact">Select an edit to inspect its exact request.</pre><h2>Captured evidence</h2><pre id="detail">Select an edit to inspect its captured evidence.</pre></section></main><script>${script}</script></body></html>`
