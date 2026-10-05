import { createHash } from "node:crypto"

const script = `
const list = document.querySelector('#edits');
const detail = document.querySelector('#detail');
const files = document.querySelector('#files');
const input = document.querySelector('#input');
const source = document.querySelector('#source');
const results = document.querySelector('#results');
const routes = document.querySelector('#routes');
const handoffs = document.querySelector('#handoffs');
const handoffSummary = document.querySelector('#handoff-summary');
const handoffEdits = document.querySelector('#handoff-edits');
const handoffExact = document.querySelector('#handoff-exact');
const handoffOutputStatus = document.querySelector('#handoff-output-status');
const handoffCopy = document.querySelector('#handoff-copy');
const handoffCopyStatus = document.querySelector('#handoff-copy-status');
const allHandoffs = document.querySelector('#all-handoffs');
let selectedHandoff = null, showAllHandoffs = false, exactOutputText = null;
const writerLabels = { ready: 'Advice ready', authorized: 'Authorized', 'write-started': 'Write started', written: 'Output written', acknowledged: 'Resident acknowledged', 'failed-before-write': 'Failed before write', uncertain: 'Uncertain output' };
const status = document.querySelector('#status');
const exact = document.querySelector('#exact');
const copy = document.querySelector('#copy');
const copyStatus = document.querySelector('#copy-status');
let exactText = null, exactRecord = null, exactOutputRecord = null;
const recording = document.querySelector('#recording');
const pause = document.querySelector('#pause');
const filter = document.querySelector('#filter');
let paused = false, current = null, pending = null, selected = null;
const identityFilters = [
  { element: document.querySelector('#resident-filter'), field: record => record.source.id, label: record => record.source.endpoint + ' · ' + record.source.lifetime },
  { element: document.querySelector('#root-filter'), field: record => record.scope.root, label: record => record.scope.root },
  { element: document.querySelector('#runtime-filter'), field: record => record.scope.runtime, label: record => record.scope.runtime || 'Runtime unavailable' },
  { element: document.querySelector('#session-filter'), field: record => record.scope.sessionId, label: record => record.scope.sessionId || 'Session unavailable' },
  { element: document.querySelector('#child-filter'), field: record => record.scope.subagentId, label: record => record.scope.subagentId || 'Main session (no child scope)' }
];
function matchesIdentity(record) { return identityFilters.every(item => !item.element.value || item.element.value === JSON.stringify(item.field(record))); }
function updateFilters(snapshot) {
  for (const [index, item] of identityFilters.entries()) {
    const choices = new Map();
    for (const record of snapshot.records) if (record.correlation.receiptId) choices.set(JSON.stringify(item.field(record)), item.label(record));
    if (index === 0) for (const entry of snapshot.sources || []) choices.set(JSON.stringify(entry.source.id), entry.source.endpoint + ' · ' + entry.source.lifetime);
    const selectedValue = item.element.value;
    if (selectedValue && !choices.has(selectedValue)) choices.set(selectedValue, 'Selected identity unavailable · ' + selectedValue);
    const options = Array.from(choices).sort((a,b) => a[1].localeCompare(b[1]));
    const signature = JSON.stringify(options);
    if (item.element.dataset.options === signature) continue;
    item.element.dataset.options = signature;
    const all = document.createElement('option'); all.value = ''; all.textContent = 'All'; item.element.replaceChildren(all);
    for (const [value, label] of options) { const option = document.createElement('option'); option.value = value; option.textContent = label; item.element.append(option); }
    item.element.value = selectedValue;
  }
}
const key = record => record.source.id + ':' + record.correlation.receiptId;
function preserveText(element, text) {
  if (element.textContent === text) return;
  const position = element.scrollTop; element.textContent = text; element.scrollTop = position;
}
function renderHandoffs(snapshot, records, evaluationIds, fates) {
  const origins = new Set(evaluationIds);
  for (const record of records) if (record.fact.kind === 'evaluation-route' && record.fact.original.status === 'linked') origins.add(record.fact.original.evaluationId);
  const sources = new Set(records.map(record => record.source.id));
  const findings = new Set(fates.flatMap(record => record.fact.payload.status === 'available' ? record.fact.payload.findingIds : []));
  const groups = new Map();
  for (const record of snapshot.records) {
    if (record.fact.kind !== 'writer-evidence') continue;
    const id = record.source.id + ':' + (record.correlation.batchId || 'unbound-' + record.sequence) + ':' + (record.correlation.attemptId || 'unbound-' + record.sequence);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(record);
  }
  const visible = new Map(Array.from(groups).filter(([, group]) => matchesIdentity(group[0]) && (showAllHandoffs || !selected || group.some(record => sources.has(record.source.id) && (record.fact.evaluations.some(item => item.evaluationId && origins.has(item.evaluationId)) || record.fact.findingIds.some(id => findings.has(id)))))));
  const active = document.activeElement?.dataset.handoff;
  const activeEdit = document.activeElement?.dataset.handoffEdit;
  const position = handoffs.scrollTop;
  handoffs.replaceChildren();
  let index = 0;
  for (const [id, group] of visible) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.handoff = id;
    button.textContent = 'Handoff ' + (++index) + ' · ' + (group[0].fact.noticeOnly ? 'Notice-only' : group[0].fact.findingIds.length + ' finding(s)') + ' · ' + Array.from(new Set(group.map(record => writerLabels[record.fact.state]))).join(', ');
    button.setAttribute('aria-pressed', String(id === selectedHandoff));
    button.addEventListener('click', () => { selectedHandoff = id; render(current); });
    const item = document.createElement('li'); item.append(button); handoffs.append(item);
    if (id === active) button.focus({ preventScroll: true });
  }
  if (!visible.size) handoffs.textContent = 'No retained handoff evidence in this view. Capture may be disabled, pending, lost, expired or evicted.';
  handoffs.scrollTop = position;
  const group = visible.get(selectedHandoff);
  handoffEdits.replaceChildren();
  exactOutputText = null; exactOutputRecord = null;
  let outputText = 'Select a handoff to inspect its captured output.';
  let outputStatus = 'Writer observations do not establish model visibility, reading, agreement or repair.';
  if (group) {
    const first = group[0];
    preserveText(handoffSummary, JSON.stringify({ source: first.source, batchId: first.correlation.batchId || null, attemptId: first.correlation.attemptId || null, scope: first.scope, recipient: first.fact.recipient, noticeOnly: first.fact.noticeOnly, findingIds: first.fact.findingIds, evaluations: first.fact.evaluations, events: group.map(record => ({ capturedAt: record.capturedAt, state: record.fact.state })) }, null, 2));
    const linked = new Set();
    for (const item of first.fact.evaluations) {
      const original = item.evaluationId ? snapshot.records.find(record => record.source.id === first.source.id && record.correlation.evaluationId === item.evaluationId && record.correlation.receiptId && (record.fact.kind === 'unit-prepared' || record.fact.kind === 'model-input')) : null;
      if (!original) continue;
      const identity = key(original); if (linked.has(identity)) continue; linked.add(identity);
      const button = document.createElement('button'); button.type = 'button'; button.dataset.handoffEdit = identity;
      button.textContent = 'Inspect batch edit · ' + (original.fact.kind === 'unit-prepared' ? original.fact.path : 'Original evaluation');
      button.addEventListener('click', () => { selected = identity; render(current); }); handoffEdits.append(button);
      if (identity === activeEdit) button.focus({ preventScroll: true });
    }
    if (!linked.size) handoffEdits.textContent = first.fact.noticeOnly ? 'Notice-only output has no captured finding membership.' : 'Original edit links are unavailable in retained history.';
    const output = group.findLast(record => record.fact.output.status === 'available');
    if (output) {
      exactOutputRecord = output;
      try {
        exactOutputText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(atob(output.fact.output.encoded), character => character.charCodeAt(0)));
        outputText = exactOutputText; outputStatus = 'Exact output captured with ' + writerLabels[output.fact.state] + '.';
      } catch { outputText = 'Retained output is not valid UTF-8; text copy is unavailable.'; }
    } else {
      const missing = group.findLast(record => record.fact.output.reason === 'oversized') || group[group.length - 1];
      outputText = 'Exact output unavailable: ' + missing.fact.output.reason + '.';
    }
    if (group.some(record => record.fact.state === 'written') && !group.some(record => record.fact.state === 'acknowledged')) outputStatus += ' Resident acknowledgement is not retained; written evidence remains recorded.';
  } else preserveText(handoffSummary, selectedHandoff ? 'Selected handoff is unavailable in this view.' : 'Select a handoff to inspect its recipient, batch and attempt.');
  handoffCopy.disabled = exactOutputText === null;
  if (handoffExact.textContent !== outputText) handoffCopyStatus.textContent = '';
  preserveText(handoffExact, outputText); preserveText(handoffOutputStatus, outputStatus);
}
function render(snapshot) {
  if (snapshot.status === 'unavailable') { status.textContent = 'History temporarily unavailable'; return; }
  current = snapshot;
  updateFilters(snapshot);
  status.textContent = snapshot.discovery ? snapshot.discovery.connected + ' connected / ' + snapshot.discovery.known + ' known source(s) · ' + snapshot.discovery.omitted + ' source(s) omitted by the discovery bound · ' + (snapshot.truncated ? 'Older rows omitted by the view limit' : 'Retained history') : 'Source discovery unavailable';
  preserveText(document.querySelector('#sources'), JSON.stringify(snapshot.sources || [], null, 2));
  preserveText(document.querySelector('#current-recording'), JSON.stringify(snapshot.recording || { status: 'unavailable' }, null, 2));
  preserveText(document.querySelector('#losses'), JSON.stringify(snapshot.losses || [], null, 2));
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
    const searchable = label + ' · ' + first.source.endpoint + ' · ' + first.source.lifetime + ' · ' + (first.scope.sessionId || '') + ' · ' + (first.scope.subagentId || '');
    if (!matchesIdentity(first) || !searchable.toLowerCase().includes(filter.value.toLowerCase())) continue;
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.key = identity; button.textContent = label;
    button.setAttribute('aria-pressed', String(identity === selected));
    button.addEventListener('click', () => { selected = identity; selectedHandoff = null; render(current); });
    const item = document.createElement('li'); item.append(button); list.append(item);
    if (identity === active) button.focus({ preventScroll: true });
  }
  list.scrollTop = scroll;
  const visibleRows = list.querySelectorAll('button');
  document.querySelector('#visible-count').textContent = visibleRows.length + ' visible edit(s) / ' + rows.size + ' retained edit(s)';
  document.querySelector('#selection-status').textContent = selected && !Array.from(visibleRows).some(button => button.dataset.key === selected) ? rows.has(selected) ? 'Selected edit is outside current filters; its retained evidence remains open.' : 'Selected edit is no longer retained.' : '';
  if (!visibleRows.length) list.textContent = 'No retained edits match these filters.';
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
        link.addEventListener('click', () => { selected = key(original); selectedHandoff = null; render(current); }); item.append(document.createElement('br'), link);
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
  const evaluationIds = new Set(records.map(record => record.correlation.evaluationId).filter(Boolean));
  const adviceIds = new Set(records.filter(record => record.fact.kind === 'finding-fate').map(record => record.fact.adviceId).filter(Boolean));
  const sourceIds = new Set(records.map(record => record.source.id));
  const fates = snapshot.records.filter(record => record.fact.kind === 'finding-fate' && sourceIds.has(record.source.id) && (evaluationIds.has(record.correlation.evaluationId) || adviceIds.has(record.fact.adviceId)));
  renderHandoffs(snapshot, records, evaluationIds, fates);
  const resultText = [
    'Frozen questions and policy:', policyText || 'No retained policy.',
    '\\nValidated backend answers:', JSON.stringify(records.filter(record => record.fact.kind === 'validated-answers').map(record => ({ unitId: record.correlation.unitId, answers: record.fact.answers })), null, 2),
    '\\nInterpreted findings:', JSON.stringify(records.filter(record => record.fact.kind === 'interpreted-findings').map(record => ({ unitId: record.correlation.unitId, payload: record.fact.payload })), null, 2),
    '\\nObserved finding fates (independent of submission):', JSON.stringify(fates.map(record => ({ capturedAt: record.capturedAt, ...record.fact })), null, 2),
    '\\nObserved outcomes:', ...records.filter(record => record.fact.kind === 'evaluation-outcome').map(record => record.correlation.unitId + ' · ' + record.fact.outcome)
  ].join('\\n');
  preserveText(results, selected ? resultText : 'Select an edit to inspect results.');
  exactRecord = rows.get(selected)?.find(record => record.fact.kind === 'transport-invoked') || null;
  const transport = exactRecord?.fact;
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
async function retrieveExact(record) {
  const response = await fetch(new URL('payload/' + record.source.id + '/' + record.sequence, location.href));
  if (!response.ok) throw new Error('history-unavailable');
  const payload = await response.json();
  if (payload.sourceId !== record.source.id || payload.sequence !== record.sequence) throw new Error('identity-mismatch');
  if (payload.status !== 'available') throw new Error(payload.reason || 'history-unavailable');
  const original = record.fact.kind === 'writer-evidence' ? record.fact.output : record.fact.payload;
  if (original.status !== 'available' || payload.sha256 !== original.sha256 || payload.byteLength !== original.byteLength || payload.encoded !== original.encoded) throw new Error('identity-mismatch');
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(atob(payload.encoded), character => character.charCodeAt(0)));
}
function sameRecord(a, b) { return a && b && a.source.id === b.source.id && a.sequence === b.sequence; }
copy.addEventListener('click', async () => {
  const record = exactRecord, selection = selected;
  if (exactText === null || !record) return;
  copyStatus.textContent = 'Retrieving selected request';
  try {
    const text = await retrieveExact(record);
    if (selected !== selection || !sameRecord(record, exactRecord)) return;
    await navigator.clipboard.writeText(text);
    if (selected === selection && sameRecord(record, exactRecord)) copyStatus.textContent = 'Exact request copied';
  } catch (error) {
    if (selected === selection && sameRecord(record, exactRecord)) copyStatus.textContent = 'Selected request could not be copied: ' + error.message + '. The preview is previously captured history.';
  }
});
handoffCopy.addEventListener('click', async () => {
  const record = exactOutputRecord, selection = selectedHandoff;
  if (exactOutputText === null || !record) return;
  handoffCopyStatus.textContent = 'Retrieving selected output';
  try {
    const text = await retrieveExact(record);
    if (selectedHandoff !== selection || !sameRecord(record, exactOutputRecord)) return;
    await navigator.clipboard.writeText(text);
    if (selectedHandoff === selection && sameRecord(record, exactOutputRecord)) handoffCopyStatus.textContent = 'Exact output copied';
  } catch (error) {
    if (selectedHandoff === selection && sameRecord(record, exactOutputRecord)) handoffCopyStatus.textContent = 'Selected output could not be copied: ' + error.message + '. The preview is previously captured history.';
  }
});
allHandoffs.addEventListener('click', () => { showAllHandoffs = !showAllHandoffs; allHandoffs.setAttribute('aria-pressed', String(showAllHandoffs)); if (current) render(current); });
pause.addEventListener('click', () => {
  paused = !paused; pause.textContent = paused ? 'Resume' : 'Pause'; pause.setAttribute('aria-pressed', String(paused));
  if (!paused && pending) { render(pending); pending = null; }
});
filter.addEventListener('input', () => { if (current) render(current); });
for (const item of identityFilters) item.element.addEventListener('change', () => { if (current) render(current); });
document.querySelector('#clear-filters').addEventListener('click', () => { filter.value = ''; for (const item of identityFilters) item.element.value = ''; if (current) render(current); });
let feed = null, latestCursor = null, gapNotice = '', received = null;
const historyStatus = document.querySelector('#history-status');
function connect() {
  feed?.close();
  const url = new URL('events', location.href);
  if (latestCursor) url.searchParams.set('cursor', latestCursor);
  historyStatus.textContent = latestCursor ? 'Reconnecting from the last received position.' : 'Connecting to retained history.';
  const connection = new EventSource(url); feed = connection;
  const receive = event => {
    if (feed !== connection) return;
    let snapshot = JSON.parse(event.data);
    if (snapshot.status !== 'unavailable') {
      if (event.type === 'increment') {
        const retained = new Set((snapshot.retained || []).flatMap(source => source.sequences.map(sequence => source.sourceId + ':' + sequence)));
        const records = new Map((received?.records || []).map(record => [record.source.id + ':' + record.sequence, record]));
        for (const record of snapshot.records || []) records.set(record.source.id + ':' + record.sequence, record);
        snapshot = { ...snapshot, records: [...records].filter(([identity]) => retained.has(identity)).map(([, record]) => record).sort((left, right) => left.capturedAt - right.capturedAt || left.source.id.localeCompare(right.source.id) || left.sequence - right.sequence) };
      }
      received = snapshot;
    }
    if (snapshot.watermark) latestCursor = snapshot.watermark.cursor;
    if (snapshot.status === 'unavailable') historyStatus.textContent = 'History unavailable; keeping the last received position. Coverage is limited to retained observations.';
    else {
      const gaps = snapshot.replay?.gaps || [];
      if (gaps.length) {
        const messages = { 'invalid-cursor': 'Saved position could not be used', 'cursor-anchor-not-retained': 'Saved source position is no longer retained', 'source-limit': 'Some source positions exceed the recovery bound', 'view-limit': 'Older rows exceed the current view bound', 'expired': 'Retained records expired', 'capacity-evicted': 'Allocated storage capacity evicted retained records' };
        gapNotice = ' Known history gaps: ' + gaps.length + ' · ' + Array.from(new Set(gaps.map(gap => messages[gap.reason] || 'History loss'))).join('; ') + '. A fresh retained snapshot is shown on resume.';
      }
      const knownLosses = snapshot.losses || [];
      const knownLossText = (knownLosses.some(loss => loss.reason === 'expired') ? ' Known record expiry is retained.' : '') + (knownLosses.some(loss => loss.reason === 'capacity-evicted') ? ' Known capacity eviction is retained.' : '');
      historyStatus.textContent = (snapshot.replay?.state === 'resumed' ? 'Recovered retained history.' : 'Fresh retained snapshot.') + gapNotice + knownLossText + ' Coverage is limited to retained observations; silent capture failures may be unknown.';
    }
    if (paused) {
      pending = snapshot;
      const positions = new Map((current?.watermark?.sources || []).map(position => [position.sourceId, position.sequence]));
      const newer = (snapshot.records || []).filter(record => record.sequence > (positions.get(record.source.id) || 0)).length;
      status.textContent = 'Paused · ' + newer + ' newer retained event(s) available on resume';
    } else render(snapshot);
  };
  connection.addEventListener('snapshot', receive);
  connection.addEventListener('increment', receive);
  connection.onerror = () => { if (feed === connection) status.textContent = 'Disconnected; reconnecting from the last received position'; };
}
document.querySelector('#reconnect').addEventListener('click', connect);
connect();
window.addEventListener('pagehide', () => feed?.close());

`
const style = `body{font:16px system-ui;margin:0;padding:1rem;color:#e6e9ef;background:#11151d}h1{font-size:1.5rem}button{max-width:100%;white-space:normal;overflow-wrap:anywhere}button,input,select{font:inherit;padding:.6rem;color:inherit;background:#202837;border:1px solid #63718a;border-radius:.3rem}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #a9c6ff}.identity-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));gap:.5rem}label{display:block}select{display:block;width:100%;min-width:0;max-width:100%}main{display:grid;grid-template-columns:minmax(16rem,1fr) minmax(0,2fr);gap:1rem}ul{padding:0;list-style:none;max-height:70vh;overflow:auto}li{margin:.4rem 0}li button{width:100%;text-align:left;overflow-wrap:anywhere}[aria-pressed=true]{border-color:#a9c6ff}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:1rem;background:#1a2230;max-height:70vh;overflow:auto}label{display:block;margin:.7rem 0}input{max-width:90%}@media(max-width:650px){main{display:block}}`
const hash = (value: string) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`
export const inspectionPagePolicy = `default-src 'none'; script-src ${hash(script)}; style-src ${hash(style)}; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`
export const inspectionPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hapsland inspection</title><style>${style}</style><body><h1>Hapsland inspection</h1><p>Opening this view does not enable recording.</p><p id="status" role="status">Connecting to retained history</p><button id="pause" type="button" aria-pressed="false">Pause</button><button id="reconnect" type="button">Reconnect</button><p id="history-status" role="status">Coverage is limited to retained observations; silent capture failures may be unknown.</p><label>Filter project, runtime or path <input id="filter" type="search"></label><fieldset class="identity-filters"><legend>Filter retained history</legend><label>Resident <select id="resident-filter"><option value="">All</option></select></label><label>Working root / project <select id="root-filter"><option value="">All</option></select></label><label>Agent runtime <select id="runtime-filter"><option value="">All</option></select></label><label>Session <select id="session-filter"><option value="">All</option></select></label><label>Child scope <select id="child-filter"><option value="">All</option></select></label><button id="clear-filters" type="button">Clear filters</button></fieldset><section aria-label="Current recording state"><h2>Current recording observations</h2><p>Reported by live residents for the displayed snapshot; paused displays retain that observation. Configuration changes take effect when the resident next receives an edit. Unreachable sources have unknown current recording state.</p><pre id="current-recording">Current recording observation pending</pre></section><section aria-label="Recording evidence"><h2>Retained recording state observations</h2><p>Historical observations are separate from live resident state; missing observations do not prove continuous recording.</p><pre id="recording">No retained recording-state evidence</pre></section><section aria-label="Source health"><h2>Discovered sources</h2><p>Only the standard endpoint and retained authorized registrations are probed; unknown endpoints are outside this view. Connection health is an observation, not terminal review evidence. Across sources, timestamps provide presentation order only.</p><pre id="sources">Source discovery pending</pre></section><section aria-label="Known history loss"><h2>Known expiry and capacity eviction</h2><p>Source-free markers name exact removed source/sequence identities. Markers share the storage cap and may expire or be unavailable; absent markers do not establish complete history.</p><pre id="losses">No loss observations received</pre></section><main><section aria-label="Captured edits"><p id="visible-count" role="status"></p><ul id="edits"></ul></section><section aria-label="Selected evidence"><p id="selection-status" role="status"></p><h2>Files</h2><pre id="files">Select an edit to inspect file provenance.</pre><h2>Exact HTTP request body</h2><p>Captured at transport invocation; this does not establish remote receipt.</p><button id="copy" type="button" disabled>Copy exact request</button><span id="copy-status" role="status"></span><pre id="exact">Select an edit to inspect its exact request.</pre><h2>Captured model input (structured)</h2><pre id="input">No retained model input.</pre><h2>Included source from captured model input</h2><pre id="source">No retained included source.</pre><h2>Per-unit evaluation routes</h2><div id="routes">No retained evaluation routes.</div><h2>Results</h2><pre id="results">Select an edit to inspect results.</pre><h2>Recorded handoffs</h2><p>Writer observations do not establish model visibility, reading, agreement or repair. Handoffs are linked to the selected edit unless all handoffs are shown.</p><button id="all-handoffs" type="button" aria-pressed="false">Show all handoffs</button><ul id="handoffs"></ul><pre id="handoff-summary">Select a handoff to inspect its recipient, batch and attempt.</pre><div id="handoff-edits"></div><p id="handoff-output-status"></p><button id="handoff-copy" type="button" disabled>Copy exact output</button><span id="handoff-copy-status" role="status"></span><pre id="handoff-exact">Select a handoff to inspect its captured output.</pre><h2>Timeline and captured evidence</h2><pre id="detail">Select an edit to inspect its captured evidence.</pre></section></main><script>${script}</script></body></html>`
