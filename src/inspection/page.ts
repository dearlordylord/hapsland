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
const handoffOutputStatus = document.querySelector('#handoff-output-status');
const allHandoffs = document.querySelector('#all-handoffs');
let selectedHandoff = null, showAllHandoffs = false;

const status = document.querySelector('#status');
const exact = document.querySelector('#exact');
const copy = document.querySelector('#copy');
const copyStatus = document.querySelector('#copy-status');
let exactText = null, exactRecord = null, selectedRequest = null, requestReceipt = null;
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
const fateReasons = {
  'pending-advice': 'Awaiting advice collection',
  'revalidated-current': 'Revalidated as current',
  'resident-stale': 'Marked stale by resident',
  'retention-expired': 'Retention expired',
  'settlement-ignored': 'Settlement ignored',
  'collection-suppression': 'Suppressed during collection',
  'publication-retired': 'Publication retired',
  'delivery-finalized': 'Delivery finalized',
  'credential-invalid': 'Credential invalid',
  'round-closed': 'Round closed',
  'resident-disposed': 'Resident disposed',
  'retention-failed': 'Retention failed'
};
function renderFindingHistory(fates, records) {
  const states = new Map();
  const changes = fates.filter(record => {
    const fact = record.fact;
    const members = fact.payload.status === 'available' ? [...fact.payload.findingIds].sort() : [fact.payload.reason];
    const identity = JSON.stringify([record.source.id, record.correlation.evaluationId || fact.adviceId, members]);
    const state = fact.fate + ':' + fact.reason;
    if (states.get(identity) === state) return false;
    states.set(identity, state); return true;
  });
  document.querySelector('#finding-history-panel').hidden = !changes.length;
  document.querySelector('#finding-history-title').textContent = 'Finding state changes · ' + changes.length;
  const history = document.querySelector('#finding-history'); history.replaceChildren();
  for (const record of changes) {
    const unit = records.find(item => item.source.id === record.source.id && item.fact.kind === 'unit-prepared' && item.correlation.evaluationId && item.correlation.evaluationId === record.correlation.evaluationId);
    const item = requestElement('li');
    const fact = record.fact;
    const state = fact.fate.charAt(0).toUpperCase() + fact.fate.slice(1);
    const members = fact.payload.status === 'available' ? fact.payload.findingIds.length + ' finding(s)' : 'Finding membership unavailable: ' + fact.payload.reason;
    item.append(requestElement('time', new Date(record.capturedAt).toLocaleTimeString()), requestElement('strong', (unit ? unit.fact.declaration + ' · ' : '') + state), requestElement('p', (fateReasons[fact.reason] || fact.reason) + ' · ' + members));
    history.append(item);
  }
}
function renderHandoffs(snapshot, records, evaluationIds, fates) {
  const origins = new Set(evaluationIds);
  for (const record of records) if (record.fact.kind === 'evaluation-route' && record.fact.original.status === 'linked') origins.add(record.fact.original.evaluationId);
  const sources = new Set(records.map(record => record.source.id));
  const findings = new Set(fates.flatMap(record => record.fact.payload.status === 'available' ? record.fact.payload.findingIds : []));
  const messages = snapshot.records.filter(record => record.fact.kind === 'agent-message' && matchesIdentity(record) && (showAllHandoffs || !selected || (sources.has(record.source.id) && (record.fact.evaluations.some(item => item.evaluationId && origins.has(item.evaluationId)) || record.fact.findingIds.some(id => findings.has(id))))));
  const identity = record => record.source.id + ':' + record.sequence;
  if (!messages.some(record => identity(record) === selectedHandoff)) selectedHandoff = messages.length ? identity(messages[0]) : null;
  const position = handoffs.scrollTop;
  const focused = document.activeElement?.dataset.handoff;
  handoffs.replaceChildren();
  for (const [index, record] of messages.entries()) {
    const button = requestElement('button', 'Message ' + (index + 1) + ' · ' + new Date(record.capturedAt).toLocaleTimeString() + ' · ' + record.fact.findingIds.length + ' finding(s)');
    button.type = 'button'; button.dataset.handoff = identity(record);
    button.setAttribute('aria-pressed', String(identity(record) === selectedHandoff));
    button.addEventListener('click', () => { selectedHandoff = identity(record); render(current); });
    const item = requestElement('li'); item.append(button); handoffs.append(item);
    if (focused === identity(record)) button.focus({ preventScroll: true });
  }
  handoffs.scrollTop = position;
  if (!messages.length) handoffs.textContent = 'No retained resident message for this edit.';
  document.querySelector('#handoff-panel-summary').textContent = 'To agent · ' + (messages.length || 'not captured');
  const record = messages.find(item => identity(item) === selectedHandoff);
  const messageText = record?.fact.message.status === 'available' ? record.fact.message.text : null;
  const recipient = document.querySelector('#handoff-recipient'); recipient.hidden = !record;
  preserveText(recipient, record ? (record.scope.runtime || 'Runtime unavailable') + ' · ' + (record.fact.recipient.turnId || 'Turn unavailable') : '');
  preserveText(handoffSummary, record ? JSON.stringify({ source: record.source, scope: record.scope, batchId: record.correlation.batchId, recipient: record.fact.recipient, evaluations: record.fact.evaluations, findingIds: record.fact.findingIds }, null, 2) : '');
  handoffEdits.replaceChildren();
  const linkedEdits = new Set();
  for (const evaluation of record?.fact.evaluations || []) {
    const original = snapshot.records.find(item => item.source.id === record.source.id && item.fact.kind === 'unit-prepared' && item.correlation.evaluationId === evaluation.evaluationId);
    if (!original || linkedEdits.has(key(original))) continue;
    const editIdentity = key(original); linkedEdits.add(editIdentity);
    const receipt = snapshot.records.find(item => item.fact.kind === 'edit-received' && key(item) === editIdentity);
    const paths = receipt ? receipt.fact.candidates.map(item => item.path).join(', ') : original.fact.path;
    const button = requestElement('button', 'Open source edit · ' + paths); button.type = 'button';
    button.addEventListener('click', () => {
      selected = editIdentity; render(current);
      const panel = document.querySelector('#panel-files'); panel.open = true;
      panel.querySelector('summary').focus({ preventScroll: true });
      panel.scrollIntoView({ block: 'start' });
    }); handoffEdits.append(button);
  }
  const message = document.querySelector('#handoff-message');
  preserveText(message, messageText ?? (record ? 'Message unavailable: ' + record.fact.message.reason : ''));
  message.hidden = !record;
  preserveText(handoffOutputStatus, record ? 'Prepared by the resident for the agent. Native output and agent receipt are not captured.' : '');
}
function renderRequestTotals(snapshot, visibleReceipts) {
  const unique = new Map(snapshot.records.map(record => [record.source.id + ':' + record.sequence, record]));
  const records = Array.from(unique.values());
  const policies = records.filter(record => record.fact.kind === 'unit-policy');
  const totals = {
    modelInvocations: { live: 0, controlled: 0, unknown: 0 },
    httpAttempts: { live: 0, controlled: 0, unknown: 0 }
  };
  for (const record of records) {
    if (!visibleReceipts.has(key(record))) continue;
    const counts = record.fact.kind === 'model-input' ? totals.modelInvocations : record.fact.kind === 'transport-invoked' ? totals.httpAttempts : null;
    if (!counts) continue;
    const policy = policies.find(candidate => candidate.source.id === record.source.id && (
      record.correlation.unitId ? candidate.correlation.unitId === record.correlation.unitId :
      record.correlation.evaluationId && candidate.correlation.evaluationId === record.correlation.evaluationId
    ));
    counts[policy?.fact.activity || 'unknown'] += 1;
  }
  preserveText(document.querySelector('#request-totals'), JSON.stringify(totals, null, 2));
  const counts = Object.entries(totals).map(([kind, activity]) => (kind === 'modelInvocations' ? 'Model invocations: ' : 'HTTP attempts: ') + Object.entries(activity).filter(([, count]) => count).map(([name, count]) => count + ' ' + name).join(', '));
  document.querySelector('#call-summary').textContent = counts.map(text => text.endsWith(': ') ? text + '0 captured' : text).join(' · ');
}
// Presentation of the captured TypeSafe SystemOneRequest and RenderedCandidateReviewInput.
// Never fill missing wire fields from policy, model-input records or current configuration.
const objectValue = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const codeArtifact = value => objectValue(value) && ['kind', 'name', 'domain', 'source'].every(key => typeof value[key] === 'string');
function classifierRequest(value) {
  if (!objectValue(value) || typeof value.model !== 'string' || !objectValue(value.questions) || !objectValue(value.state)) return false;
  if (!Object.values(value.questions).every(question => objectValue(question) && question.type === 'noul' && typeof question.instructions === 'string' && (question.criteria === undefined || (objectValue(question.criteria) && typeof question.criteria.false === 'string' && typeof question.criteria.true === 'string')))) return false;
  const state = value.state;
  if (!codeArtifact(state.artifact) || !objectValue(state.evidence) || !objectValue(state.inputContract)) return false;
  const evidence = state.evidence;
  return typeof state.inputContract.id === 'string' && typeof state.inputContract.completeness === 'string' && typeof evidence.rootId === 'string' && Array.isArray(evidence.nodes) && evidence.nodes.every(node => codeArtifact(node) && typeof node.id === 'string') && Array.isArray(evidence.edges) && evidence.edges.every(edge => objectValue(edge) && typeof edge.from === 'string' && typeof edge.symbol === 'string' && (edge.kind === 'omitted' ? typeof edge.reason === 'string' : ['expanded', 'included'].includes(edge.kind) && typeof edge.to === 'string'));
}
function requestElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function requestDisclosure(label) {
  const element = document.createElement('details');
  element.append(requestElement('summary', label));
  return element;
}
function appendRequestCode(parent, artifact) {
  parent.append(requestElement('h4', artifact.name + ' · ' + artifact.domain));
  const block = requestElement('pre'); block.append(requestElement('code', artifact.source)); parent.append(block);
}
let renderedRequestView = null;
function renderRequestView(text, unavailable, identity) {
  const signature = JSON.stringify([identity, text, unavailable]);
  if (renderedRequestView === signature) return;
  renderedRequestView = signature;
  const view = document.querySelector('#request-view'); view.replaceChildren();
  if (text === null) { view.append(requestElement('p', unavailable, 'muted')); return; }
  let request;
  try { request = JSON.parse(text); }
  catch { view.append(requestElement('p', 'Captured body is not JSON. Open Exact JSON to inspect it.', 'muted')); return; }
  if (!classifierRequest(request)) {
    view.append(requestElement('p', 'No structured view for this captured request. Open Exact JSON.', 'muted')); return;
  }
  const state = request.state;
  view.append(requestElement('p', request.model + ' · ' + state.inputContract.completeness, 'muted'));
  const questions = Object.entries(request.questions);
  const questionList = requestElement('section'); questionList.id = 'request-questions';
  questionList.append(requestElement('h3', 'Questions · ' + questions.length)); view.append(questionList);
  for (const [id, question] of questions) {
    const section = requestDisclosure(id.replace(/[_-]+/g, ' ')); section.className = 'request-question';
    section.append(requestElement('p', id, 'muted'), requestElement('p', question.instructions, 'captured-text'));
    if (question.criteria) {
      const criteria = requestDisclosure('Criteria');
      const definitions = requestElement('dl');
      for (const answer of ['false', 'true']) definitions.append(requestElement('dt', answer === 'false' ? 'False' : 'True'), requestElement('dd', question.criteria[answer], 'captured-text'));
      criteria.append(definitions); section.append(criteria);
    }
    questionList.append(section);
  }
  const artifact = requestElement('section'); artifact.id = 'request-artifact';
  artifact.append(requestElement('h3', 'Code under review'));
  appendRequestCode(artifact, state.artifact); view.insertBefore(artifact, questionList);
  const evidence = state.evidence;
  const omissions = evidence.edges.filter(edge => edge.kind === 'omitted');
  if (evidence.nodes.length || evidence.edges.length) {
    const context = requestDisclosure('Supporting context · ' + evidence.nodes.length + ' declarations' + (omissions.length ? ' · ' + omissions.length + ' omitted references' : ''));
    context.id = 'request-context';
    const labels = new Map([[evidence.rootId, state.artifact.name + ' · ' + state.artifact.domain], ...evidence.nodes.map(node => [node.id, node.name + ' · ' + node.domain])]);
    for (const node of evidence.nodes) {
      const declaration = requestDisclosure(node.name + ' · ' + node.domain);
      const block = requestElement('pre'); block.append(requestElement('code', node.source)); declaration.append(block); context.append(declaration);
    }
    if (omissions.length) {
      context.append(requestElement('h4', 'Omitted references'));
      for (const edge of omissions) context.append(requestElement('p', edge.symbol + ' · ' + edge.reason + ' · from ' + (labels.get(edge.from) || edge.from)));
    }
    const included = evidence.edges.filter(edge => edge.kind !== 'omitted');
    if (included.length) {
      const references = requestDisclosure('References · ' + included.length);
      for (const edge of included) references.append(requestElement('p', (labels.get(edge.from) || edge.from) + ' → ' + edge.symbol + ' → ' + (labels.get(edge.to) || edge.to) + ' · ' + edge.kind));
      context.append(references);
    }
    view.append(context);
  }
}
let renderedFiles = null;
function renderFiles(records, inputs, artifacts) {
  const omittedReferences = inputs.flatMap(item => {
    const evidence = item.input?.evidence;
    if (!Array.isArray(evidence?.edges)) return [];
    return evidence.edges.filter(edge => edge.kind === 'omitted').map(edge => {
      const owner = edge.from === evidence.rootId ? item.input.artifact : (Array.isArray(evidence.nodes) ? evidence.nodes.find(node => node.id === edge.from) : undefined);
      return [edge.symbol, 'Reference · ' + edge.reason + (owner ? ' · from ' + owner.name + ' in ' + owner.domain : '')];
    });
  });
  const groups = [
    ['Edited:', records.filter(record => record.fact.kind === 'edit-received').flatMap(record => record.fact.candidates.map(item => [item.path, item.operation]))],
    ['Prepared declarations:', records.filter(record => record.fact.kind === 'unit-prepared').map(record => [record.fact.path, record.fact.declaration + ' · ' + record.fact.completeness])],
    ['Physically read:', records.filter(record => record.fact.kind === 'preparation-read').map(record => [record.fact.path, ''])],
    ['Skipped:', records.filter(record => record.fact.kind === 'preparation-skipped').map(record => [record.fact.path, ''])],
    ['Omitted:', [...records.filter(record => record.fact.kind === 'preparation-omission').map(record => [record.fact.path, (record.fact.declaration ? record.fact.declaration + ' · ' : '') + omissionLabel(record.fact.reason) + (omissionLabel(record.fact.reason) === record.fact.reason ? '' : ' (' + record.fact.reason + ')')]), ...omittedReferences]],
    ['Unavailable:', records.filter(record => record.fact.kind === 'model-input' && record.fact.payload.status !== 'available').map(record => ['Model input', record.fact.payload.reason])]
  ];
  const signature = JSON.stringify([selected, groups, artifacts]);
  if (renderedFiles === signature) return;
  renderedFiles = signature;
  files.replaceChildren();
  if (artifacts.length) {
    const section = requestElement('section', undefined, 'file-group');
    section.append(requestElement('h3', 'Included in model input:'));
    const list = requestElement('ul');
    const seen = new Set();
    for (const artifact of artifacts) {
      const identity = JSON.stringify([artifact.domain, artifact.name, artifact.source]);
      if (seen.has(identity)) continue; seen.add(identity);
      const row = requestElement('li');
      row.append(requestElement('span', artifact.domain), requestElement('small', artifact.name), requestElement('pre', artifact.source));
      list.append(row);
    }
    section.append(list);
    files.append(section);
  }
  for (const [label, entries] of groups) {
    if (!entries.length) continue;
    const section = requestElement('section', undefined, 'file-group');
    section.append(requestElement('h3', label));
    const list = requestElement('ul');
    const seen = new Set();
    for (const [path, observation] of entries) {
      const identity = JSON.stringify([path, observation]); if (seen.has(identity)) continue; seen.add(identity);
      const row = requestElement('li'); row.append(requestElement('span', path));
      if (observation) row.append(requestElement('small', observation));
      list.append(row);
    }
    section.append(list); files.append(section);
  }
  if (!files.childNodes.length) files.append(requestElement('p', 'No captured file provenance.', 'muted'));
}
function renderRecording(snapshot) {
  const observations = snapshot.recording?.sources || [];
  const roots = observations.flatMap(item => item.roots);
  const incomplete = !observations.length || snapshot.recording?.omittedSources || observations.some(item => item.status !== 'observed' || item.omittedRoots) || roots.some(root => root.state === 'unavailable');
  const states = new Set(roots.map(item => item.state));
  const label = incomplete || !roots.length ? 'Unknown' : states.size > 1 ? 'Mixed' : states.has('enabled') ? 'On' : 'Off';
  document.querySelector('#recording-summary').textContent = (paused ? 'Recording at pause: ' : 'Recording: ') + label;
  document.querySelector('#recording-roots').textContent = observations.flatMap(item => item.roots.length ? item.roots.map(root => root.root + ' · ' + root.state) : [item.sourceId + ' · current state unavailable']).join('\\n') || 'Current recording state unavailable.';
}
function omissionLabel(reason) {
  const labels = {
    'ineligible': 'Eligibility refused; exact reason was not captured',
    'not-included': 'Not matched by includes',
    'empty-includes': 'Includes is empty',
    'excluded': 'Matched an exclusion',
    'git-ignored': 'Ignored by repository .gitignore',
    'language-not-enabled': 'Language is not enabled',
    'repository-boundary': 'Outside the repository',
    'sensitive': 'Protected sensitive path',
    'generated-or-vendor': 'Protected generated or vendor path',
    'file-extension': 'Unsupported file extension',
    'git-administrative-path': 'Git administrative path',
    'unsafe-file-kind': 'Symlink or non-regular file',
    'path-observation-unavailable': 'Filesystem or Git observation unavailable'
  };
  return labels[reason] || reason;
}
function renderFindings(records) {
  const target = document.querySelector('#finding-summary');
  target.replaceChildren();
  for (const record of records.filter(item => item.fact.kind === 'interpreted-findings')) {
    if (record.fact.payload.status !== 'available') {
      const item = document.createElement('p'); item.textContent = 'Findings unavailable: ' + record.fact.payload.reason; target.append(item);
      continue;
    }
    for (const finding of record.fact.payload.findings) {
      const item = document.createElement('p');
      const heading = document.createElement('strong'); heading.textContent = finding.declaration + ' · ' + finding.ruleId;
      item.append(heading, document.createElement('br'), document.createTextNode(finding.message)); target.append(item);
    }
  }
}
function render(snapshot) {
  if (snapshot.status === 'unavailable') { status.textContent = 'History temporarily unavailable'; renderRecording({}); return; }
  current = snapshot;
  updateFilters(snapshot);
  renderRecording(snapshot);
  document.querySelector('#history-warning').textContent = gapNotice || (snapshot.losses || []).length || (snapshot.replay?.gaps || []).length ? 'Known history gaps · see Recording & history' : '';
  const filterCount = identityFilters.filter(item => item.element.value).length;
  document.querySelector('#filter-summary').textContent = 'Filters' + (filterCount ? ' · ' + filterCount : '');
  status.textContent = snapshot.discovery ? snapshot.discovery.connected + '/' + snapshot.discovery.known + ' sources connected' + (snapshot.discovery.omitted ? ' · ' + snapshot.discovery.omitted + ' omitted' : '') + (snapshot.truncated ? ' · older history omitted' : '') : 'Source discovery unavailable';
  preserveText(document.querySelector('#sources'), JSON.stringify(snapshot.sources || [], null, 2));
  preserveText(document.querySelector('#current-recording'), JSON.stringify(snapshot.recording || { status: 'unavailable' }, null, 2));
  preserveText(document.querySelector('#losses'), JSON.stringify(snapshot.losses || [], null, 2));
  const states = snapshot.records.filter(record => record.fact.kind === 'recording-state');
  const recordingText = states.length ? states.map(record => new Date(record.capturedAt).toISOString() + ' · ' + record.scope.root + ' · ' + record.source.lifetime + ' · ' + record.fact.state).join('\\n') : 'No retained recording-state evidence';
  if (recording.textContent !== recordingText) recording.textContent = recordingText;
  const periods = [], last = new Map();
  for (const record of [...states].sort((left, right) => left.source.id.localeCompare(right.source.id) || left.sequence - right.sequence)) {
    const identity = JSON.stringify([record.source.id, record.scope.root]);
    const previous = last.get(identity);
    if (previous?.state === record.fact.state && previous.consentEpoch === record.consentEpoch) continue;
    const transition = { sequence: record.sequence, capturedAt: record.capturedAt, state: record.fact.state };
    if (previous) previous.nextObservedTransition = transition;
    const period = { sourceId: record.source.id, sourceLifetime: record.source.lifetime, root: record.scope.root, state: record.fact.state, consentEpoch: record.consentEpoch, observedStart: { sequence: record.sequence, capturedAt: record.capturedAt }, nextObservedTransition: null };
    periods.push(period); last.set(identity, period);
  }
  periods.sort((left, right) => left.observedStart.capturedAt - right.observedStart.capturedAt || left.sourceId.localeCompare(right.sourceId) || left.observedStart.sequence - right.observedStart.sequence);
  preserveText(document.querySelector('#recording-periods'), JSON.stringify(periods, null, 2));

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
  for (const [identity, records] of Array.from(rows).reverse()) {
    const received = records.find(record => record.fact.kind === 'edit-received');
    const first = received || records[0];
    const label = first.scope.root + ' · ' + (first.scope.runtime || 'runtime unavailable') + ' · ' + (received ? received.fact.candidates.map(item => item.path).join(', ') : 'Receipt data unavailable');
    const searchable = label + ' · ' + first.source.endpoint + ' · ' + first.source.lifetime + ' · ' + (first.scope.sessionId || '') + ' · ' + (first.scope.subagentId || '');
    if (!matchesIdentity(first) || !searchable.toLowerCase().includes(filter.value.toLowerCase())) continue;
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.key = identity;
    const pathLabel = document.createElement('strong'); pathLabel.textContent = received ? received.fact.candidates.map(item => item.path).join(', ') : 'Edit paths unavailable';
    const contextLabel = document.createElement('small'); contextLabel.textContent = (first.scope.runtime || 'Runtime unavailable') + ' · ' + new Date(first.capturedAt).toLocaleTimeString();
    button.append(pathLabel, contextLabel);
    button.setAttribute('aria-pressed', String(identity === selected));
    button.addEventListener('click', () => { selected = identity; selectedHandoff = null; render(current); });
    const item = document.createElement('li'); item.append(button); list.append(item);
    if (identity === active) button.focus({ preventScroll: true });
  }
  list.scrollTop = scroll;
  const visibleRows = list.querySelectorAll('button');
  document.querySelector('#visible-count').textContent = visibleRows.length + ' of ' + rows.size + ' edits';
  renderRequestTotals(snapshot, new Set(Array.from(visibleRows).map(button => button.dataset.key)));
  document.querySelector('#selection-status').textContent = selected && !Array.from(visibleRows).some(button => button.dataset.key === selected) ? rows.has(selected) ? 'Selected edit is outside current filters; its retained evidence remains open.' : 'Selected edit is no longer retained.' : '';
  if (!visibleRows.length) list.textContent = 'No retained edits match these filters.';
  const records = rows.get(selected) || [];
  document.querySelector('#edit-content').hidden = !records.length;
  document.querySelector('#edit-empty').hidden = records.length > 0;
  document.querySelector('#edit-empty').textContent = 'Select an edit';
  const receipt = records.find(record => record.fact.kind === 'edit-received');
  document.querySelector('#edit-title').textContent = receipt ? receipt.fact.candidates.map(item => item.path).join(', ') : 'Captured edit';
  document.querySelector('#edit-context').textContent = records.length ? records[0].scope.root + ' · ' + (records[0].scope.runtime || 'Runtime unavailable') + ' · ' + new Date(records[0].capturedAt).toLocaleString() : '';
  renderFindings(records);
  const activeRoute = document.activeElement?.dataset.route;
  routes.replaceChildren();

  const routeRecords = records.filter(record => record.fact.kind === 'evaluation-route');
  const skippedRecords = records.filter(record => record.fact.kind === 'preparation-skipped');
  const omissionRecords = records.filter(record => record.fact.kind === 'preparation-omission');
  if (routeRecords.length && (skippedRecords.length || omissionRecords.length)) {
    const summary = document.createElement('p');
    summary.textContent = 'Mixed outcomes · ' + routeRecords.length + ' evaluated · ' + skippedRecords.length + ' skipped · ' + omissionRecords.length + ' omitted';
    routes.append(summary);
  }

  for (const record of records.filter(record => record.fact.kind === 'evaluation-route')) {
    const fact = record.fact;
    const original = fact.original.status === 'linked' ? snapshot.records.find(candidate => candidate.source.id === record.source.id && candidate.correlation.evaluationId === fact.original.evaluationId && candidate.correlation.receiptId && (candidate.fact.kind === 'model-input' || candidate.fact.kind === 'transport-invoked' || candidate.fact.kind === 'unit-prepared')) : null;
    const outcomes = original ? snapshot.records.filter(candidate => candidate.source.id === record.source.id && candidate.correlation.evaluationId === fact.original.evaluationId && candidate.fact.kind === 'evaluation-outcome').map(candidate => candidate.fact.outcome) : [];
    const item = document.createElement('p');
    item.textContent = (receipt?.fact.candidates.length === 1 && receipt.fact.candidates[0].path === fact.path ? '' : fact.path + ' · ') + fact.declaration + ' · ' + (outcomes.length ? outcomes.join(', ') : 'Outcome unavailable') + ' · ' + fact.route;
    if (fact.route !== 'fresh') {
      if (original?.correlation.receiptId) {
        const link = document.createElement('button'); link.type = 'button'; link.textContent = 'Inspect original evaluation';
        link.dataset.route = record.source.id + ':' + record.sequence;
        link.addEventListener('click', () => {
          selected = key(original); requestReceipt = selected;
          const invocation = snapshot.records.find(candidate => candidate.source.id === original.source.id && candidate.correlation.evaluationId === fact.original.evaluationId && candidate.fact.kind === 'transport-invoked');
          selectedRequest = invocation ? invocation.source.id + ':' + invocation.sequence : 'evaluation:' + original.source.id + ':' + fact.original.evaluationId;
          selectedHandoff = null; render(current);
          document.querySelector('#panel-request').open = true;
          Array.from(document.querySelectorAll('#requests button')).find(button => button.dataset.request === selectedRequest)?.focus({ preventScroll: true });
        }); item.append(document.createElement('br'), link);
      } else item.append(document.createTextNode(' · Original evaluation unavailable.'));
    }
    routes.append(item);
  }
  for (const record of [...skippedRecords.filter(item => !omissionRecords.some(omission => omission.fact.path === item.fact.path)), ...omissionRecords]) {
    const item = document.createElement('p'); item.textContent = record.fact.path + ' · ' + (record.fact.kind === 'preparation-skipped' ? 'Skipped' : 'Omitted · ' + omissionLabel(record.fact.reason)); routes.append(item);
  }
  for (const record of records.filter(item => item.fact.kind === 'evaluation-outcome')) {
    const unit = records.find(item => item.fact.kind === 'unit-prepared' && item.correlation.unitId === record.correlation.unitId);
    if (routeRecords.some(item => item.fact.original.status === 'linked' && item.fact.original.evaluationId === record.correlation.evaluationId)) continue;
    const item = document.createElement('p'); item.textContent = (unit?.fact.declaration || record.correlation.unitId || 'Evaluation') + ' · ' + record.fact.outcome; routes.append(item);
  }
  if (!routes.childNodes.length) routes.textContent = 'No captured review outcome.';
  if (activeRoute) Array.from(routes.querySelectorAll('button')).find(button => button.dataset.route === activeRoute)?.focus({ preventScroll: true });
  const inputs = records.filter(record => record.fact.kind === 'model-input' && record.fact.payload.status === 'available').map(record => ({ unitId: record.correlation.unitId, input: JSON.parse(record.fact.payload.encoded) }));
  const artifacts = inputs.flatMap(item => [item.input?.artifact, ...(Array.isArray(item.input?.evidence?.nodes) ? item.input.evidence.nodes : [])]).filter(item => item && typeof item.domain === 'string' && typeof item.source === 'string');
  renderFiles(records, inputs, artifacts);
  preserveText(input, inputs.length ? JSON.stringify(inputs, null, 2) : 'No retained model input; original input is unavailable.');
  preserveText(source, artifacts.length ? artifacts.map(item => item.domain + ' · ' + item.name + '\\n' + item.source).join('\\n\\n') : 'No retained included source.');
  const policies = records.filter(record => record.fact.kind === 'unit-policy');
  const policyText = policies.map(record => {
    const fact = record.fact;
    const heading = record.correlation.unitId + ' · ' + fact.activity + ' · ' + fact.provider + '/' + fact.model;
    if (fact.payload.status !== 'available') return heading + '\\nPolicy unavailable: ' + fact.payload.reason;
    return heading + '\\nInterpretation: ' + fact.interpretation + '\\n' + fact.payload.rules.map(rule => rule.ruleId + ' (' + rule.source + ')\\nQuestion: ' + rule.question + '\\nFalse criteria: ' + rule.criteria.false + '\\nTrue criteria: ' + rule.criteria.true + '\\nEffective threshold: ' + rule.threshold + '\\nConfigured message: ' + rule.message).join('\\n\\n');
  }).join('\\n\\n');
  const evaluationIds = new Set(records.map(record => record.correlation.evaluationId).filter(Boolean));
  const adviceIds = new Set(records.filter(record => record.fact.kind === 'finding-fate').map(record => record.fact.adviceId).filter(Boolean));
  const sourceIds = new Set(records.map(record => record.source.id));
  const fates = snapshot.records.filter(record => record.fact.kind === 'finding-fate' && sourceIds.has(record.source.id) && (evaluationIds.has(record.correlation.evaluationId) || adviceIds.has(record.fact.adviceId)));
  renderHandoffs(snapshot, records, evaluationIds, fates);
  renderFindingHistory(fates, records);
  const resultText = [
    'Frozen questions and policy:', policyText || 'No retained policy.',
    '\\nValidated backend answers:', JSON.stringify(records.filter(record => record.fact.kind === 'validated-answers').map(record => ({ unitId: record.correlation.unitId, answers: record.fact.answers })), null, 2),
    '\\nInterpreted findings:', JSON.stringify(records.filter(record => record.fact.kind === 'interpreted-findings').map(record => ({ unitId: record.correlation.unitId, payload: record.fact.payload })), null, 2),
    '\\nObserved finding fates (independent of submission):', JSON.stringify(fates.map(record => ({ capturedAt: record.capturedAt, ...record.fact })), null, 2),
    '\\nObserved outcomes:', ...records.filter(record => record.fact.kind === 'evaluation-outcome').map(record => record.correlation.unitId + ' · ' + record.fact.outcome)
  ].join('\\n');
  preserveText(results, selected ? resultText : 'Select an edit to inspect results.');
  if (requestReceipt !== selected) { requestReceipt = selected; selectedRequest = null; }
  const invocations = records.filter(record => record.fact.kind === 'transport-invoked');
  document.querySelector('#request-panel-summary').textContent = 'To Jev · ' + invocations.length + ' request(s)';
  const requestKey = record => record.source.id + ':' + record.sequence;
  if (selectedRequest === null && invocations.length) selectedRequest = requestKey(invocations[0]);
  const requestList = document.querySelector('#requests');
  const activeRequest = document.activeElement?.dataset.request;
  const requestPosition = requestList.scrollTop;
  requestList.replaceChildren();
  for (const record of invocations) {
    const unit = records.find(candidate => candidate.fact.kind === 'unit-prepared' && candidate.correlation.unitId === record.correlation.unitId);
    const button = document.createElement('button'); button.type = 'button'; button.dataset.request = requestKey(record);
    button.textContent = (unit?.fact.declaration || 'Unit unavailable') + ' · ' + (record.fact.payload.status === 'available' ? record.fact.payload.byteLength.toLocaleString() + ' bytes' : 'Body unavailable: ' + record.fact.payload.reason) + ' · ' + new Date(record.capturedAt).toLocaleTimeString();
    button.setAttribute('aria-pressed', String(selectedRequest === requestKey(record)));
    button.addEventListener('click', () => { selectedRequest = requestKey(record); render(current); });
    const item = document.createElement('li'); item.append(button); requestList.append(item);
    if (activeRequest === requestKey(record)) button.focus({ preventScroll: true });
  }
  requestList.scrollTop = requestPosition;
  if (!invocations.length) requestList.textContent = 'No captured HTTP attempt. Model input alone does not establish dispatch.';
  const previousRequest = exactRecord;
  exactRecord = invocations.find(record => requestKey(record) === selectedRequest) || null;
  if (!sameRecord(previousRequest, exactRecord)) copyStatus.textContent = '';
  const unit = exactRecord ? records.find(record => record.fact.kind === 'unit-prepared' && record.correlation.unitId === exactRecord.correlation.unitId) : null;
  const policy = exactRecord ? records.find(record => record.fact.kind === 'unit-policy' && record.correlation.unitId === exactRecord.correlation.unitId) : null;
  const payload = exactRecord?.fact.payload;
  preserveText(document.querySelector('#request-metadata'), exactRecord ? JSON.stringify({ sourceId: exactRecord.source.id, sequence: exactRecord.sequence, ...exactRecord.correlation, declaration: unit?.fact.declaration || null, activity: policy?.fact.activity || 'unavailable', payload: payload.status === 'available' ? { status: payload.status, byteLength: payload.byteLength, sha256: payload.sha256 } : payload }, null, 2) : selectedRequest ? 'Selected request or evaluation has no retained transport evidence. Choose another captured invocation to inspect its bytes.' : 'Select an edit with retained transport evidence.');
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
  else if (selectedRequest) requestText = 'Selected transport bytes are unavailable and cannot be reconstructed.';
  renderRequestView(exactText, requestText, exactRecord ? requestKey(exactRecord) : selectedRequest);
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
  const original = record.fact.payload;
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
allHandoffs.addEventListener('click', () => { showAllHandoffs = !showAllHandoffs; allHandoffs.setAttribute('aria-pressed', String(showAllHandoffs)); allHandoffs.textContent = showAllHandoffs ? 'Show linked messages' : 'Show all messages'; if (current) render(current); });
pause.addEventListener('click', () => {
  paused = !paused; pause.textContent = paused ? 'Resume updates' : 'Pause updates'; pause.setAttribute('aria-pressed', String(paused));
  if (current) renderRecording(current);
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
    if (snapshot.status === 'unavailable') {
      historyStatus.textContent = received ? 'History temporarily unavailable; keeping the displayed history and retrying.' : 'Loading retained history; temporarily unavailable, retrying automatically.';
      if (!paused) status.textContent = received ? 'History temporarily unavailable · retrying' : 'Loading history · retrying';
      if (!received) document.querySelector('#edit-empty').textContent = 'Loading retained history…';
      return;
    }
    else {
      const gaps = snapshot.replay?.gaps || [];
      if (gaps.length) {
        const messages = { 'invalid-cursor': 'Saved position could not be used', 'cursor-anchor-not-retained': 'Saved source position is no longer retained', 'source-limit': 'Some source positions exceed the recovery bound', 'view-limit': 'Older rows exceed the current view bound', 'expired': 'Retained records expired', 'capacity-evicted': 'Allocated storage capacity evicted retained records' };
        gapNotice = ' Known history gaps: ' + gaps.length + ' · ' + Array.from(new Set(gaps.map(gap => messages[gap.reason] || 'History loss'))).join('; ') + '. A fresh retained snapshot is shown on resume.';
      }
      const knownLosses = snapshot.losses || [];
      const warnings = [gapNotice ? 'History gaps' : '', knownLosses.some(loss => loss.reason === 'expired') ? 'Expired records' : '', knownLosses.some(loss => loss.reason === 'capacity-evicted') ? 'Capacity eviction' : ''].filter(Boolean);
      document.querySelector('#history-warning').textContent = warnings.join(' · ');
      const knownLossText = (knownLosses.some(loss => loss.reason === 'expired') ? ' Known record expiry is retained.' : '') + (knownLosses.some(loss => loss.reason === 'capacity-evicted') ? ' Known capacity eviction is retained.' : '');
      historyStatus.textContent = (snapshot.replay?.state === 'resumed' ? 'Recovered retained history.' : 'Retained history.') + gapNotice + knownLossText;
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
  connection.onerror = () => { if (feed === connection) { status.textContent = 'Disconnected · reconnecting'; if (!paused) renderRecording({}); } };
}
document.querySelector('#reconnect').addEventListener('click', connect);
connect();
window.addEventListener('pagehide', () => feed?.close());

`
const style = `
*{box-sizing:border-box}body{font:14px/1.5 system-ui;margin:0;color:#e6e9ef;background:#11151d}header,.toolbar,.history{padding:1rem 1.5rem;border-bottom:1px solid #303949}header{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}h1,h2,h3,h4,p{margin:0 0 .75rem}h1{font-size:1.1rem}h2{font-size:1.2rem}h3{font-size:.95rem}h4{font-size:.85rem;font-weight:600}#request-view{margin-top:1rem;overflow-wrap:anywhere}#request-view h3{margin-top:1.25rem}.request-question{padding:.25rem .8rem;background:#1a2230;border-radius:.4rem;margin:.5rem 0}.captured-text{white-space:pre-wrap}.observation-list{padding:0;list-style:none}.observation-list li{padding:.6rem .8rem;background:#1a2230;border-radius:.4rem}.observation-list time{display:inline-block;color:#a9b5c7;margin-right:.7rem}.observation-list p{margin:.25rem 0 0}.file-group{margin:.8rem 0;overflow-wrap:anywhere}.file-group h3{margin-bottom:.35rem}.file-group li{padding:.4rem .7rem;background:#1a2230;border-radius:.3rem}.file-group small{margin-top:.1rem}#handoff-recipient{overflow-wrap:anywhere;margin-top:.75rem}#request-view dl{margin:0}#request-view dt{font-weight:600}#request-view dd{margin:0 0 .75rem}#request-view pre{margin-top:.4rem}button,input,select{font:inherit;padding:.5rem .7rem;color:inherit;background:#202837;border:1px solid #63718a;border-radius:.4rem;max-width:100%}button{cursor:pointer;white-space:normal;overflow-wrap:anywhere}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #a9c6ff;outline-offset:2px}small,.muted{color:#a9b5c7}small{display:block}header p{margin:0}.header-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}.toolbar{display:flex;gap:1rem;align-items:flex-start;flex-wrap:wrap}.search{flex:1;min-width:12rem}.search input{width:100%}.identity-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:.75rem;margin-top:.75rem}label{display:block}select{display:block;width:100%;min-width:0}#filter-panel{flex:1;min-width:10rem}main{display:grid;grid-template-columns:minmax(14rem,1fr) minmax(0,2.5fr);max-width:1500px;margin:auto}.edit-list{padding:1rem;border-right:1px solid #303949}#selected-evidence{padding:1.5rem;min-width:0}ul{padding:0;list-style:none;margin:0;overflow:auto}#edits{max-height:75vh}li{margin:.35rem 0}li button{width:100%;text-align:left;overflow-wrap:anywhere;padding:.75rem}li button strong{display:block;font-weight:500}[aria-pressed=true]{border-color:#a9c6ff;background:#293c58}pre{font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;padding:.8rem;background:#1a2230;max-height:55vh;overflow:auto;border-radius:.4rem}details{min-width:0}summary{cursor:pointer;font-weight:600;padding:.65rem 0}details details{margin:.5rem 0}#edit-content>details{border-top:1px solid #303949;padding:.25rem 0}#review{padding:.5rem 0 1rem}#routes p,#finding-summary p{padding:.65rem .8rem;background:#1a2230;border-radius:.4rem}#edit-context,#recording-roots{overflow-wrap:anywhere}#recording-roots{white-space:pre-wrap}.history{max-width:1500px;margin:auto}.history-heading{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}.empty{padding:3rem 0;color:#a9b5c7}[hidden]{display:none!important}.history-warning{margin:0;padding:.5rem 1.5rem;color:#ffd28d}#history-status:empty,#history-warning:empty,#selection-status:empty{display:none}@media(max-width:650px){header,.toolbar,.history{padding:1rem}main{display:block}.edit-list{border-right:0;border-bottom:1px solid #303949}#edits{max-height:32vh}#selected-evidence{padding:1rem}.toolbar{display:block}#filter-panel{margin-top:.5rem}.header-actions{width:100%}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
`
const hash = (value: string) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`
export const inspectionPagePolicy = `default-src 'none'; script-src ${hash(script)}; style-src ${hash(style)}; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`
export const inspectionPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hapsland inspection</title><style>${style}</style><body>
<header><h1>Hapsland inspection</h1><div class="header-actions"><p id="status" role="status">Connecting…</p><span id="recording-summary">Recording: Unknown</span><button id="pause" type="button" aria-pressed="false">Pause updates</button><button id="reconnect" type="button">Reconnect</button></div></header>
<p id="history-warning" class="history-warning" role="status"></p>
<div class="toolbar"><label class="search">Search edits<input id="filter" type="search" placeholder="Path, project or runtime"></label><details id="filter-panel"><summary id="filter-summary">Filters</summary><div class="identity-filters"><label>Project<select id="root-filter"><option value="">All</option></select></label><label>Runtime<select id="runtime-filter"><option value="">All</option></select></label><label>Session<select id="session-filter"><option value="">All</option></select></label><label>Child<select id="child-filter"><option value="">All</option></select></label><label>Resident<select id="resident-filter"><option value="">All</option></select></label><button id="clear-filters" type="button">Clear filters</button></div></details></div>
<main><section class="edit-list" aria-label="Captured edits"><p id="visible-count" class="muted" role="status"></p><p id="call-summary" class="muted"></p><ul id="edits"></ul></section><section id="selected-evidence" aria-label="Selected evidence"><p id="selection-status" role="status"></p><p id="edit-empty" class="empty">Select an edit</p><div id="edit-content" hidden><h2 id="edit-title"></h2><p id="edit-context" class="muted"></p><section id="review"><h3>Review</h3><div id="routes"></div><div id="finding-summary"></div><details id="finding-history-panel" hidden><summary id="finding-history-title">Finding history</summary><p class="muted">Recorded finding states; separate from writer observations.</p><ol id="finding-history" class="observation-list"></ol></details></section>
<details id="panel-request"><summary id="request-panel-summary">Request</summary><p class="muted">Captured HTTP attempts do not confirm remote receipt.</p><ul id="requests"></ul><button id="copy" type="button" disabled>Copy exact request</button><span id="copy-status" role="status"></span><div id="request-view"></div><details id="request-raw"><summary>Exact JSON</summary><pre id="exact"></pre></details><details><summary>Request metadata</summary><pre id="request-metadata"></pre></details><details><summary>Model input</summary><pre id="input"></pre></details></details>
<details id="panel-files"><summary>Files</summary><div id="files"></div><details><summary>Included source</summary><pre id="source"></pre></details></details>
<details id="panel-handoffs" open><summary id="handoff-panel-summary">To agent</summary><p class="muted">The resident message before runtime formatting. Preparation does not confirm agent receipt.</p><button id="all-handoffs" type="button" aria-pressed="false">Show all messages</button><ul id="handoffs"></ul><p id="handoff-recipient" class="muted" hidden></p><div id="handoff-edits"></div><p id="handoff-output-status"></p><pre id="handoff-message" hidden></pre><details><summary>Message metadata</summary><pre id="handoff-summary"></pre></details></details>
<details id="panel-evidence"><summary>Evidence</summary><details><summary>Answers &amp; rules</summary><pre id="results"></pre></details><details><summary>Captured event records</summary><pre id="detail"></pre></details></details></div></section></main>
<section class="history"><div class="history-heading"><span class="muted">Captured history only</span></div><details id="history-panel"><summary>Recording &amp; history</summary><p id="history-status" role="status"></p><p class="muted">Only retained observations are shown; missing records do not prove inactivity. This view does not change recording.</p><h3>Current recording observations</h3><p id="recording-roots"></p><p class="muted">Configuration changes apply on the next edit. Pausing preserves the displayed observation; unreachable sources are unknown.</p><p class="muted">Call counts follow the edit filters. Model invocations and HTTP attempts are counted separately; missing capture can undercount both.</p><details><summary>Recording history</summary><p class="muted">Observed transitions do not establish continuous capture or current recording state.</p><pre id="recording"></pre><details><summary>Observed periods</summary><pre id="recording-periods"></pre></details></details><details><summary>Sources &amp; history gaps</summary><p class="muted">Only known endpoints are probed. Timestamps order the view, not events across sources. Loss markers can also expire.</p><pre id="sources"></pre><pre id="losses"></pre></details><details><summary>Recording &amp; call metadata</summary><pre id="current-recording"></pre><pre id="request-totals"></pre></details></details></section><script>${script}</script></body></html>`
