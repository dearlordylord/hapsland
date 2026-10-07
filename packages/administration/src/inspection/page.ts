import { inspectionFavicon, inspectionProductIcon } from "./brand.ts"
import { createHash } from "node:crypto"

export const defaultInspectionFilters = Object.freeze({ search: "", hideUnreviewed: true, identity: "" })

const script = `
const defaultFilters = ${JSON.stringify(defaultInspectionFilters)};
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
let selectedHandoff = null;

const status = document.querySelector('#status');
const exact = document.querySelector('#exact');
let exactText = null, exactRecord = null, selectedRequest = null, requestReceipt = null;
const filter = document.querySelector('#filter');
const hideUnreviewed = document.querySelector('#hide-unreviewed');
let current = null, selected = null;
const identityFilters = [
  { element: document.querySelector('#resident-filter'), field: record => record.source.endpoint, label: record => record.source.endpoint },
  { element: document.querySelector('#root-filter'), field: record => record.scope.root, label: record => record.scope.root },
  { element: document.querySelector('#runtime-filter'), field: record => record.scope.runtime, label: record => record.scope.runtime || 'Runtime unavailable' },
  { element: document.querySelector('#session-filter'), field: record => record.scope.sessionId, label: record => record.scope.sessionId || 'Session unavailable' },
  { element: document.querySelector('#child-filter'), field: record => record.scope.subagentId, label: record => record.scope.subagentId || 'Main session (no child scope)' }
];
function resetFilters() {
  filter.value = defaultFilters.search;
  hideUnreviewed.checked = defaultFilters.hideUnreviewed;
  for (const item of identityFilters) item.element.value = defaultFilters.identity;
  if (current) render(current);
}
function matchesIdentity(record) { return identityFilters.every(item => !item.element.value || item.element.value === JSON.stringify(item.field(record))); }
function updateFilters(snapshot) {
  for (const [index, item] of identityFilters.entries()) {
    const choices = new Map();
    for (const record of snapshot.records) if (record.correlation.receiptId) choices.set(JSON.stringify(item.field(record)), item.label(record));
    if (index === 0) for (const entry of snapshot.sources || []) choices.set(JSON.stringify(entry.source.endpoint), entry.source.endpoint);
    const selectedValue = item.element.value;
    if (selectedValue && !choices.has(selectedValue)) choices.set(selectedValue, 'Selected identity unavailable · ' + selectedValue);
    const options = Array.from(choices).sort((a,b) => a[1].localeCompare(b[1]));
    document.querySelector('#' + item.element.id + '-count').textContent = ' · ' + options.length;
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
  const findingNames = Promise.all(records.flatMap(record => record.fact.kind === 'interpreted-findings' && record.fact.payload.status === 'available' ? record.fact.payload.findings.map(async finding => {
    const bytes = new TextEncoder().encode(JSON.stringify([finding.semanticIdentity, finding.ruleId]));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return [record.source.id + ':' + id, finding];
  }) : [])).then(entries => new Map(entries));
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
    if (fact.payload.status === 'available') {
      const names = requestElement('ul'); item.append(names);
      for (const id of fact.payload.findingIds) {
        const label = requestElement('li', 'Finding ' + id.slice(0, 12)); names.append(label);
        findingNames.then(index => {
          const finding = index.get(record.source.id + ':' + id);
          if (finding) label.textContent = finding.ruleId + ' · ' + finding.declaration + ' · ' + finding.message;
        }).catch(() => {});
      }
    }
    history.append(item);
  }
}
function renderHandoffs(snapshot, records, evaluationIds, fates) {
  const origins = new Set(evaluationIds);
  for (const record of records) if (record.fact.kind === 'evaluation-route' && record.fact.original.status === 'linked') origins.add(record.fact.original.evaluationId);
  const sources = new Set(records.map(record => record.source.id));
  const findings = new Set(fates.flatMap(record => record.fact.payload.status === 'available' ? record.fact.payload.findingIds : []));
  const messages = snapshot.records.filter(record => record.fact.kind === 'agent-message' && matchesIdentity(record) && (!selected || (sources.has(record.source.id) && (record.fact.evaluations.some(item => item.evaluationId && origins.has(item.evaluationId)) || record.fact.findingIds.some(id => findings.has(id))))));
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
  const findingIds = new Set(messages.flatMap(message => message.fact.findingIds));
  const panelSummary = document.querySelector('#handoff-panel-summary');
  panelSummary.replaceChildren(document.createTextNode('To agent · '));
  const findingBadge = document.createElement('span');
  findingBadge.className = 'edit-badge badge-' + (messages.length ? findingIds.size ? 'findings' : 'clear' : 'muted');
  findingBadge.textContent = messages.length ? 'Findings · ' + findingIds.size : 'Findings not captured';
  panelSummary.append(findingBadge);
  const record = messages.find(item => identity(item) === selectedHandoff);
  document.querySelector('#handoff-metadata').hidden = !record;
  document.querySelector('#handoff-note').hidden = !record;
  handoffEdits.hidden = !record;
  handoffOutputStatus.hidden = !record;
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
    ['Skipped:', [...records.filter(record => record.fact.kind === 'preparation-skipped').map(record => [record.fact.path, '']), ...records.filter(record => record.fact.kind === 'round-membership').flatMap(record => record.fact.skippedPaths.map(path => [path, 'Another working root is pinned · ' + record.fact.roundId]))]],
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
  document.querySelector('#recording-summary').textContent = 'Recording: ' + label;
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
function editReviewBadges(records) {
  const unique = Array.from(new Map(records.map(record => [record.source.id + ':' + record.sequence, record])).values());
  const calls = unique.filter(record => record.fact.kind === 'model-input').length;
  const outcomes = unique.filter(record => record.fact.kind === 'evaluation-outcome');
  const failed = outcomes.some(record => !['clear', 'findings'].includes(record.fact.outcome));
  const completed = outcomes.filter(record => ['clear', 'findings'].includes(record.fact.outcome)).length;
  const findings = unique.filter(record => record.fact.kind === 'interpreted-findings');
  const count = findings.reduce((sum, record) => sum + (record.fact.payload.status === 'available' ? record.fact.payload.findings.length : 0), 0);
  const missing = findings.some(record => record.fact.payload.status !== 'available') || outcomes.some(record => record.fact.outcome === 'findings') && !count;
  const settled = completed > 0 && completed >= calls && !failed && !missing;
  const badges = [{ text: 'Decision · ' + calls, tone: calls ? 'decision' : 'muted', title: 'Captured DecisionModel calls; HTTP retries are counted separately.' }];
  if (unique.some(record => record.fact.kind === 'edit-admission' && record.fact.outcome === 'skipped-other-root'))
    badges.push({ text: 'Skipped · another working root', tone: 'muted' });
  if (count) badges.push({ text: 'Findings · ' + count, tone: 'findings' });
  else if (settled) badges.push({ text: 'Findings · 0', tone: 'clear' });
  if (failed) badges.push({ text: 'Review failed', tone: 'failed' });
  else if (missing) badges.push({ text: 'Findings unavailable', tone: 'muted' });
  else if (calls > completed) badges.push({ text: 'Review pending', tone: 'muted' });
  else if (!completed && !count) badges.push({ text: unique.some(record => record.fact.kind === 'evaluation-route' && record.fact.route !== 'fresh') ? 'Reused review' : 'Not reviewed', tone: 'muted' });
  return badges;
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
function renderActivity(records) {
  let latestEvent = null, latestEdit = null;
  for (const record of records) {
    if (latestEvent === null || record.capturedAt > latestEvent) latestEvent = record.capturedAt;
    if (record.fact.kind === 'edit-received' && (latestEdit === null || record.capturedAt > latestEdit)) latestEdit = record.capturedAt;
  }
  for (const [id, timestamp] of [['last-event', latestEvent], ['last-edit', latestEdit]]) {
    const element = document.querySelector('#' + id);
    element.textContent = timestamp === null ? 'No retained events' : new Date(timestamp).toLocaleString();
    if (timestamp === null) element.removeAttribute('datetime');
    else element.setAttribute('datetime', new Date(timestamp).toISOString());
  }
}
function render(snapshot) {
  if (snapshot.status === 'unavailable') { status.textContent = 'History temporarily unavailable'; renderRecording({}); return; }
  current = snapshot;
  renderActivity(snapshot.records);
  updateFilters(snapshot);
  renderRecording(snapshot);
  status.textContent = snapshot.discovery ? snapshot.discovery.connected + ' sources connected' + (snapshot.discovery.omitted ? ' · ' + snapshot.discovery.omitted + ' omitted' : '') : 'Source discovery unavailable';
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
  let hiddenCount = 0;
  const showHiddenGroup = () => {
    if (!hiddenCount) return;
    const marker = document.createElement('li'); marker.className = 'hidden-edits muted';
    marker.textContent = hiddenCount + ' edits without classifier calls'; list.append(marker); hiddenCount = 0;
  };
  for (const [identity, records] of Array.from(rows).reverse()) {
    const received = records.find(record => record.fact.kind === 'edit-received');
    const first = received || records[0];
    const label = first.scope.root + ' · ' + (first.scope.runtime || 'runtime unavailable') + ' · ' + (received ? received.fact.candidates.map(item => item.path).join(', ') : 'Receipt data unavailable');
    const searchable = label + ' · ' + first.source.endpoint + ' · ' + first.source.lifetime + ' · ' + (first.scope.sessionId || '') + ' · ' + (first.scope.subagentId || '');
    if (!matchesIdentity(first) || !searchable.toLowerCase().includes(filter.value.toLowerCase())) continue;
    if (hideUnreviewed.checked && !records.some(record => record.fact.kind === 'model-input')) { hiddenCount += 1; continue; }
    showHiddenGroup();
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.key = identity;
    if (!records.some(record => record.fact.kind === 'model-input')) button.classList.add('edit-unreviewed');
    const pathLabel = document.createElement('strong'); pathLabel.textContent = received ? received.fact.candidates.map(item => item.path).join(', ') : 'Edit paths unavailable';
    const contextLabel = document.createElement('small'); contextLabel.textContent = (first.scope.runtime || 'Runtime unavailable') + ' · ' + new Date(first.capturedAt).toLocaleTimeString();
    const badges = document.createElement('span'); badges.className = 'edit-badges';
    for (const badge of editReviewBadges(records).slice(1).filter(badge => badge.text !== 'Not reviewed')) {
      const element = document.createElement('span'); element.className = 'edit-badge badge-' + badge.tone;
      element.textContent = badge.text; if (badge.title) element.title = badge.title;
      badges.append(element);
    }
    button.append(pathLabel, contextLabel, badges);
    button.setAttribute('aria-pressed', String(identity === selected));
    button.addEventListener('click', () => { selected = identity; selectedHandoff = null; render(current); });
    const item = document.createElement('li'); item.append(button); list.append(item);
    if (identity === active) button.focus({ preventScroll: true });
  }
  showHiddenGroup();
  list.scrollTop = scroll;
  const visibleRows = list.querySelectorAll('button');
  document.querySelector('#visible-count').textContent = visibleRows.length + ' of ' + rows.size + ' edits';
  renderRequestTotals(snapshot, new Set(Array.from(visibleRows).map(button => button.dataset.key)));
  document.querySelector('#selection-status').textContent = selected && !Array.from(visibleRows).some(button => button.dataset.key === selected) ? rows.has(selected) ? 'Selected edit is outside current filters; its retained evidence remains open.' : 'Selected edit is no longer retained.' : '';
  if (!visibleRows.length && !list.childElementCount) list.textContent = 'No retained edits match these filters.';
  const records = rows.get(selected) || [];
  document.querySelector('#edit-content').hidden = !records.length;
  document.querySelector('#edit-empty').hidden = records.length > 0;
  document.querySelector('#edit-empty').textContent = 'Select an edit';
  const receipt = records.find(record => record.fact.kind === 'edit-received');
  document.querySelector('#edit-title').textContent = receipt ? receipt.fact.candidates.map(item => item.path).join(', ') : 'Captured edit';
  const round = records.find(record => record.fact.kind === 'round-membership');
  document.querySelector('#edit-context').textContent = records.length ? records[0].scope.root + ' · ' + (records[0].scope.runtime || 'Runtime unavailable') + ' · ' + new Date(records[0].capturedAt).toLocaleString() + (round ? ' · Round ' + round.fact.roundId : '') : '';
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
    item.textContent = (receipt?.fact.candidates.length === 1 && receipt.fact.candidates[0].path === fact.path ? '' : fact.path + ' · ') + fact.declaration + ' · ' + (outcomes.length ? outcomes.join(', ') : 'Outcome unavailable') + (fact.route === 'fresh' ? '' : ' · ' + fact.route);
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
  document.querySelector('#request-panel-summary').textContent = 'To Classifier · ' + invocations.length + ' request(s)';
  const requestKey = record => record.source.id + ':' + record.sequence;
  if (selectedRequest === null && invocations.length) selectedRequest = requestKey(invocations[0]);
  const requestList = document.querySelector('#requests');
  const activeRequest = document.activeElement?.dataset.request;
  const requestPosition = requestList.scrollTop;
  requestList.replaceChildren();
  for (const record of invocations) {
    const unit = records.find(candidate => candidate.fact.kind === 'unit-prepared' && candidate.correlation.unitId === record.correlation.unitId);
    const button = document.createElement('button'); button.type = 'button'; button.dataset.request = requestKey(record);
    button.textContent = (unit?.fact.declaration || 'Unit unavailable') + ' · ' + (record.fact.payload.status === 'available' ? (record.fact.payload.byteLength / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' kB' : 'Body unavailable: ' + record.fact.payload.reason) + ' · ' + new Date(record.capturedAt).toLocaleTimeString();
    button.setAttribute('aria-pressed', String(selectedRequest === requestKey(record)));
    button.addEventListener('click', () => { selectedRequest = requestKey(record); render(current); });
    const item = document.createElement('li'); item.append(button); requestList.append(item);
    if (activeRequest === requestKey(record)) button.focus({ preventScroll: true });
  }
  requestList.scrollTop = requestPosition;
  if (!invocations.length) requestList.textContent = 'No captured HTTP attempt. Model input alone does not establish dispatch.';
  exactRecord = invocations.find(record => requestKey(record) === selectedRequest) || null;
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
    } catch { requestText = 'Retained body is not valid UTF-8; text preview is unavailable'; }
  } else if (transport) requestText = 'Request body unavailable: ' + transport.payload.reason;
  else if (selectedRequest) requestText = 'Selected transport bytes are unavailable and cannot be reconstructed.';
  renderRequestView(exactText, requestText, exactRecord ? requestKey(exactRecord) : selectedRequest);
  if (exact.textContent !== requestText) { const position = exact.scrollTop; exact.textContent = requestText; exact.scrollTop = position; }
  const detailText = selected ? (rows.has(selected) ? JSON.stringify(rows.get(selected), null, 2) : 'Selected receipt is no longer retained') : 'Select an edit to inspect its captured evidence.';
  if (detail.textContent !== detailText) { const position = detail.scrollTop; detail.textContent = detailText; detail.scrollTop = position; }
}
hideUnreviewed.addEventListener('change', () => { if (current) render(current); });
filter.addEventListener('input', () => { if (current) render(current); });
for (const item of identityFilters) item.element.addEventListener('change', () => { if (current) render(current); });
document.querySelector('#clear-filters').addEventListener('click', resetFilters);
let feed = null, latestCursor = null, received = null;
function connect() {
  feed?.close();
  const url = new URL('events', location.href);
  if (latestCursor) url.searchParams.set('cursor', latestCursor);
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
      status.textContent = received ? 'History temporarily unavailable · retrying' : 'Loading history · retrying';
      if (!received) document.querySelector('#edit-empty').textContent = 'Loading retained history…';
      return;
    }
    render(snapshot);
  };
  connection.addEventListener('snapshot', receive);
  connection.addEventListener('increment', receive);
  connection.onerror = () => { if (feed === connection) { status.textContent = 'Disconnected · reconnecting'; renderRecording({}); } };
}
resetFilters();
connect();
window.addEventListener('pagehide', () => feed?.close());

`
const style = `
*{box-sizing:border-box}body{font:14px/1.5 system-ui;margin:0;color:#e6e9ef;background:#11151d}header,.toolbar{padding:1rem 1.5rem;border-bottom:1px solid #303949}header{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}h1,h2,h3,h4,p{margin:0 0 .75rem}h1{font-size:1.1rem;display:flex;align-items:center;gap:.65rem}.brand-icon{display:block;flex:none}h2{font-size:1.2rem}h3{font-size:.95rem}h4{font-size:.85rem;font-weight:600}#request-view{margin-top:1rem;overflow-wrap:anywhere}#request-view h3{margin-top:1.25rem}.request-question{padding:.25rem .8rem;background:#1a2230;border-radius:.4rem;margin:.5rem 0}.captured-text{white-space:pre-wrap}.observation-list{padding:0;list-style:none}.observation-list li{padding:.6rem .8rem;background:#1a2230;border-radius:.4rem}.observation-list time{display:inline-block;color:#a9b5c7;margin-right:.7rem}.observation-list p{margin:.25rem 0 0}.file-group{margin:.8rem 0;overflow-wrap:anywhere}.file-group h3{margin-bottom:.35rem}.file-group li{padding:.4rem .7rem;background:#1a2230;border-radius:.3rem}.file-group small{margin-top:.1rem}#handoff-recipient{overflow-wrap:anywhere;margin-top:.75rem}#request-view dl{margin:0}#request-view dt{font-weight:600}#request-view dd{margin:0 0 .75rem}#request-view pre{margin-top:.4rem}button,input,select{font:inherit;padding:.5rem .7rem;color:inherit;background:#202837;border:1px solid #63718a;border-radius:.4rem;max-width:100%}button{cursor:pointer;white-space:normal;overflow-wrap:anywhere}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #a9c6ff;outline-offset:2px}small,.muted{color:#a9b5c7}small{display:block}header p{margin:0}.header-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}.toolbar{display:flex;gap:1rem;align-items:flex-start;flex-wrap:wrap}.search{flex:1;min-width:12rem}.search input{width:100%}.identity-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:.75rem}label{display:block}select{display:block;width:100%;min-width:0}#filter-panel{flex:1;min-width:10rem}main{display:grid;grid-template-columns:minmax(14rem,1fr) minmax(0,2.5fr);max-width:1500px;margin:auto}.edit-list{padding:1rem;border-right:1px solid #303949}#selected-evidence{padding:1.5rem;min-width:0}ul{padding:0;list-style:none;margin:0;overflow:auto}#edits{max-height:75vh}li{margin:.35rem 0}li button{width:100%;text-align:left;overflow-wrap:anywhere;padding:.75rem}li button strong{display:block;font-weight:500}[aria-pressed=true]{border-color:#a9c6ff;background:#293c58}pre{font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;padding:.8rem;background:#1a2230;max-height:55vh;overflow:auto;border-radius:.4rem}details{min-width:0}summary{cursor:pointer;font-weight:600;padding:.65rem 0}details details{margin:.5rem 0}#edit-content>details{border-top:1px solid #303949;padding:.25rem 0}#review{padding:.5rem 0 1rem}#routes p,#finding-summary p{padding:.65rem .8rem;background:#1a2230;border-radius:.4rem}#edit-context{overflow-wrap:anywhere}.hidden-edits{font-size:12px;text-align:center;padding:.3rem .5rem;border-top:1px dashed #394250;border-bottom:1px dashed #394250}.checkbox-filter{display:flex;align-items:center;gap:.5rem}.checkbox-filter input{width:auto}.edit-unreviewed{background:#191e27;color:#919aa8;border-color:#394250}.edit-unreviewed small{color:#818b9b}.edit-unreviewed[aria-pressed=true]{background:#242c38;border-color:#8995a8}.edit-badges{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem}.edit-badge{font-size:12px;line-height:1.4;padding:.2rem .5rem;border-radius:999px;background:#283140;color:#b6c0d0}.badge-decision{background:#493d1a;color:#ffe08a}.badge-findings{background:#4b2c23;color:#ffb095}.badge-clear{background:#193d2e;color:#96e3b5}.badge-failed{background:#48232b;color:#ffa4af}.empty{padding:3rem 0;color:#a9b5c7}[hidden]{display:none!important}#selection-status:empty{display:none}@media(max-width:650px){header,.toolbar{padding:1rem}main{display:block}.edit-list{border-right:0;border-bottom:1px solid #303949}#edits{max-height:32vh}#selected-evidence{padding:1rem}.toolbar{display:block}#filter-panel{margin-top:.5rem}.header-actions{width:100%}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
`
const hash = (value: string) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`
export const inspectionPagePolicy = `default-src 'none'; script-src ${hash(script)}; style-src ${hash(style)}; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`
export const inspectionPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hapsland inspection</title><link rel="icon" type="image/svg+xml" href="${inspectionFavicon}"><style>${style}</style><body>
<header><h1><img class="brand-icon" src="${inspectionProductIcon}" alt="" width="32" height="32">Hapsland inspection</h1><div class="header-actions"><p id="status" role="status">Connecting…</p><span id="recording-summary">Recording: Unknown</span></div></header>
<div class="toolbar"><label class="search">Search edits<input id="filter" type="search" placeholder="Path, project or runtime"></label><div id="filter-panel"><div class="identity-filters"><label>Project<span id="root-filter-count" class="muted"> · 0</span><select id="root-filter"><option value="">All</option></select></label><label>Runtime<span id="runtime-filter-count" class="muted"> · 0</span><select id="runtime-filter"><option value="">All</option></select></label><label>Session<span id="session-filter-count" class="muted"> · 0</span><select id="session-filter"><option value="">All</option></select></label><label>Child<span id="child-filter-count" class="muted"> · 0</span><select id="child-filter"><option value="">All</option></select></label><label>Resident<span id="resident-filter-count" class="muted"> · 0</span><select id="resident-filter"><option value="">All</option></select></label><label class="checkbox-filter"><input id="hide-unreviewed" type="checkbox"${defaultInspectionFilters.hideUnreviewed ? " checked" : ""}>Hide edits without classifier calls</label><button id="clear-filters" type="button">Clear filters</button></div></div></div>
<main><section class="edit-list" aria-label="Captured edits"><p id="visible-count" class="muted" role="status"></p><p id="call-summary" class="muted"></p><p class="muted">Last captured event: <time id="last-event">No retained events</time><br>Last received edit: <time id="last-edit">No retained events</time><small>Across all retained activity, including hidden edits.</small></p><ul id="edits"></ul></section><section id="selected-evidence" aria-label="Selected evidence"><p id="selection-status" role="status"></p><p id="edit-empty" class="empty">Select an edit</p><div id="edit-content" hidden><h2 id="edit-title"></h2><p id="edit-context" class="muted"></p><section id="review"><h3>Review</h3><div id="routes"></div><div id="finding-summary"></div></section>
<details id="panel-request"><summary id="request-panel-summary">Request</summary><p class="muted">Captured HTTP attempts do not confirm remote receipt.</p><ul id="requests"></ul><div id="request-view"></div><details id="request-raw"><summary>JSON</summary><pre id="exact"></pre></details><details><summary>Request metadata</summary><pre id="request-metadata"></pre></details><details><summary>Model input</summary><pre id="input"></pre></details></details>
<details id="panel-files"><summary>Files</summary><div id="files"></div><details><summary>Included source</summary><pre id="source"></pre></details></details>
<details id="panel-handoffs" open><summary id="handoff-panel-summary">To agent</summary><p id="handoff-note" class="muted" hidden>The resident message before runtime formatting. Preparation does not confirm agent receipt.</p><ul id="handoffs"></ul><p id="handoff-recipient" class="muted" hidden></p><div id="handoff-edits"></div><p id="handoff-output-status"></p><pre id="handoff-message" hidden></pre><details id="handoff-metadata" hidden><summary>Message metadata</summary><pre id="handoff-summary"></pre></details></details>
<details id="panel-evidence"><summary>Debug</summary><details id="finding-history-panel" hidden><summary id="finding-history-title">Finding history</summary><p class="muted">Finding status changes.</p><ol id="finding-history" class="observation-list"></ol></details><details><summary>Answers &amp; rules</summary><pre id="results"></pre></details><details><summary>Raw</summary><pre id="detail"></pre></details></details></div></section></main>
<script>${script}</script></body></html>`
