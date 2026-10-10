import { inspectionFavicon, inspectionProductIcon } from "./brand.ts"
import { createHash } from "node:crypto"

export const defaultInspectionFilters = Object.freeze({ search: "", hideUnreviewed: true, identity: "", outcome: "" })

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
const outcomeFilter = document.querySelector('#outcome-filter');
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
  outcomeFilter.value = defaultFilters.outcome;
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
  if (!messages.length) handoffs.append(requestElement('li', 'No retained resident message for this edit.', 'list-empty'));
  const findingIds = new Set(messages.flatMap(message => message.fact.findingIds));
  const panelSummary = document.querySelector('#handoff-panel-summary');
  panelSummary.replaceChildren(document.createTextNode('To agent · '));
  const findingBadge = document.createElement('span');
  findingBadge.className = 'edit-badge badge-' + (messages.length ? findingIds.size ? 'findings' : 'clear' : 'muted');
  findingBadge.textContent = messages.length ? 'Findings · ' + findingIds.size : 'Agent message not captured';
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
  if (tag === 'pre') element.tabIndex = 0;
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
    'path-observation-unavailable': 'Filesystem or Git observation unavailable',
    'constant-only-demand-gap': 'Constant-only edits need follow-up review; no unchanged type was selected',
    'function-analysis-unavailable': 'Function extraction is unavailable under the supported syntax and binding profile',
    'function-overload': 'Overload group excluded; its implementation is not review evidence',
    'unsupported-callable': 'Callable form is outside the supported named const-arrow and Effect wrapper profile',
    'no-supported-function-root': 'No supported top-level named function or const callable was found'
  };
  return labels[reason] || reason;
}
function diagnosticContext(fact, receipt) {
  const candidate = receipt?.fact.candidates.find(item => item.position === fact.candidatePosition);
  const source = fact.path;
  const paths = candidate && source && candidate.path !== source
    ? 'Edited: ' + candidate.path + ' · Capture source: ' + source
    : source || candidate?.path || '';
  const ownership = fact.candidatePosition !== undefined && !candidate ? 'Original candidate unavailable' : '';
  return [paths, fact.declaration, ownership].filter(Boolean).join(' · ');
}
function diagnosticLabel(diagnostic) {
  const args = diagnostic.args;
  const labels = {
    'file-extension': 'Unsupported extension', 'edit-policy-unavailable': 'Pre-edit selection policy unavailable',
    'capture-size-limit': 'Source exceeds capture limit', 'capture-budget-limit': 'Capture budget exhausted',
    'capture-unavailable': 'Capture unavailable', 'capture-unstable': 'Source changed during capture',
    'capture-validation-failed': 'Capture validation refused', 'preparation-resource-refused': 'Preparation capacity refused',
    'preparation-unavailable': 'Preparation unavailable', 'attribution-unavailable': 'Native edit attribution unavailable',
    'review-input-invalid': 'Review input could not be built', 'review-input-limit': 'Review input exceeds its size limit',
    'dispatch-unavailable': 'Review dispatch unavailable', 'unsupported-operation': 'Operation outside the supported review profile'
  };
  const label = diagnostic.code === 'panic' ? 'Unexpected failure at ' + args.boundary : labels[diagnostic.code] || omissionLabel(diagnostic.code);
  let details = '';
  if (diagnostic.code === 'file-extension') details = args.extension || '(no extension)';
  else if (diagnostic.code === 'capture-size-limit') details = args.observedBytes + ' bytes observed; limit ' + args.limitBytes + ' bytes';
  else if (diagnostic.code === 'review-input-limit') details = args.observedBytes + ' bytes observed; limit ' + args.limitBytes + ' bytes';
  else if (diagnostic.code === 'review-input-invalid') details = ({
    'root-invalid': 'Root declaration does not match the selected review contract',
    'supporting-artifact-invalid': 'Supporting declaration identity is invalid',
    'duplicate-expanded-target': 'The same supporting declaration was expanded more than once',
    'included-target-unavailable': 'A reference points to supporting evidence that was not included',
    'projection-invalid': 'The evidence graph does not match the review input contract',
    'request-invalid': 'The assembled provider request is invalid'
  })[args.reason] || args.reason;
  else if (diagnostic.code === 'capture-budget-limit') details = args.resource + ': used ' + args.used + ', requested ' + args.requested + ', limit ' + args.limit;
  else if (diagnostic.code === 'preparation-resource-refused') details = args.phase + ': requested ' + args.requestedBytes + ' bytes' + (args.constraint ? '; constraint ' + args.constraint : '');
  else if (args.reason !== undefined) details = args.reason === 'unknown' ? 'precise cause not observed' : args.reason;
  else if (args.checkpoint !== undefined) details = args.checkpoint;
  return diagnostic.stage + ' · ' + label + (details ? ' · ' + details : '') + ' [' + diagnostic.code + ']';
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
  const badges = [{ text: 'Model calls · ' + calls, tone: calls ? 'decision' : 'muted', title: 'Recorded model invocations; HTTP retries are counted separately.' }];
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
function matchesOutcome(records, outcome) {
  if (!outcome) return true;
  const badges = editReviewBadges(records);
  return badges.some(badge => outcome === 'findings' ? badge.tone === 'findings' :
    outcome === 'failed' ? badge.tone === 'failed' :
    outcome === 'pending' ? badge.text === 'Review pending' :
    outcome === 'clear' ? badge.tone === 'clear' : false);
}
let renderedFindings = null;
function renderFindings(records) {
  const signature = JSON.stringify(records.filter(record => ['interpreted-findings', 'transport-invoked'].includes(record.fact.kind)).map(record => [record.source.id, record.sequence, record.correlation.evaluationId, record.fact.kind === 'interpreted-findings' ? record.fact.payload : null]));
  if (signature === renderedFindings) return;
  renderedFindings = signature;
  const target = document.querySelector('#finding-summary');
  const focused = document.activeElement?.dataset.finding;
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
      const invocation = records.find(candidate => record.correlation.evaluationId && candidate.fact.kind === 'transport-invoked' && candidate.source.id === record.source.id && candidate.correlation.evaluationId === record.correlation.evaluationId);
      if (invocation) {
        const button = requestElement('button', 'Inspect reviewed code'); button.type = 'button';
        button.dataset.finding = JSON.stringify([record.source.id, record.sequence, finding.semanticIdentity, finding.ruleId]);
        button.setAttribute('aria-label', 'Inspect reviewed code for ' + finding.declaration + ' · ' + finding.ruleId);
        button.addEventListener('click', () => {
          requestReceipt = selected; selectedRequest = invocation.source.id + ':' + invocation.sequence; render(current);
          const panel = document.querySelector('#panel-request'); panel.open = true;
          panel.querySelector('summary').focus({ preventScroll: true }); panel.scrollIntoView({ block: 'start' });
        });
        item.append(document.createElement('br'), button);
        if (focused === button.dataset.finding) button.focus({ preventScroll: true });
      }
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
  const advancedCount = identityFilters.filter(item => ['session-filter', 'child-filter', 'resident-filter'].includes(item.element.id) && item.element.value).length;
  document.querySelector('#advanced-filter-summary').textContent = 'Session, child & resident' + (advancedCount ? ' · ' + advancedCount + ' active' : '');
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
  let hiddenCount = 0, totalHidden = 0;
  const showHiddenGroup = () => {
    if (!hiddenCount) return;
    const marker = document.createElement('li'); marker.className = 'hidden-edits muted';
    marker.textContent = hiddenCount + ' edits without retained request attempts'; list.append(marker); hiddenCount = 0;
  };
  for (const [identity, records] of Array.from(rows).reverse()) {
    const received = records.find(record => record.fact.kind === 'edit-received');
    const first = received || records[0];
    const label = first.scope.root + ' · ' + (first.scope.runtime || 'runtime unavailable') + ' · ' + (received ? received.fact.candidates.map(item => item.path).join(', ') : 'Receipt data unavailable');
    const searchable = label + ' · ' + first.source.endpoint + ' · ' + first.source.lifetime + ' · ' + (first.scope.sessionId || '') + ' · ' + (first.scope.subagentId || '');
    if (!matchesIdentity(first) || !searchable.toLowerCase().includes(filter.value.toLowerCase())) continue;
    if (!matchesOutcome(records, outcomeFilter.value)) continue;
    if (hideUnreviewed.checked && !records.some(record => record.fact.kind === 'transport-invoked')) { hiddenCount += 1; totalHidden += 1; continue; }
    showHiddenGroup();
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.key = identity;
    if (!records.some(record => record.fact.kind === 'transport-invoked')) button.classList.add('edit-unreviewed');
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
  document.querySelector('#show-unreviewed').hidden = !totalHidden;
  document.querySelector('#show-unreviewed').textContent = 'Show ' + totalHidden + ' edits without requests';
  document.querySelector('#recover-filters').hidden = visibleRows.length > 0 || rows.size === 0;
  renderRequestTotals(snapshot, new Set(Array.from(visibleRows).map(button => button.dataset.key)));
  document.querySelector('#selection-status').textContent = selected && !Array.from(visibleRows).some(button => button.dataset.key === selected) ? rows.has(selected) ? 'Selected edit is outside current filters; its retained evidence remains open.' : 'Selected edit is no longer retained.' : '';
  if (!visibleRows.length && !list.childElementCount) list.append(requestElement('li', rows.size ? 'No retained edits match these filters.' : 'No retained edits yet.', 'list-empty'));
  const records = rows.get(selected) || [];
  document.querySelector('#edit-content').hidden = !records.length;
  document.querySelector('#edit-empty').hidden = records.length > 0;
  document.querySelector('#empty-title').textContent = selected && !rows.has(selected) ? 'This edit is no longer retained' : rows.size ? 'Choose an edit to inspect' : 'Waiting for recorded edits';
  document.querySelector('#empty-description').textContent = selected && !rows.has(selected) ? 'Its history has expired or is unavailable. Choose another retained edit to continue.' : rows.size ? 'Read the review outcome, inspect the exact code and request, then compare the message prepared for your agent.' : 'Opening this dashboard does not enable recording or start a resident.';
  document.querySelector('#recording-guide').hidden = rows.size > 0;
  const selectedBadges = document.querySelector('#selected-badges'); selectedBadges.replaceChildren();
  for (const badge of editReviewBadges(records)) {
    const element = requestElement('span', badge.text, 'edit-badge badge-' + badge.tone);
    if (badge.title) element.title = badge.title; selectedBadges.append(element);
  }
  const receipt = records.find(record => record.fact.kind === 'edit-received');
  document.querySelector('#edit-title').textContent = receipt ? receipt.fact.candidates.map(item => item.path).join(', ') : 'Captured edit';
  const round = records.find(record => record.fact.kind === 'round-membership');
  document.querySelector('#edit-context').textContent = records.length ? records[0].scope.root + ' · ' + (records[0].scope.runtime || 'Runtime unavailable') + ' · ' + new Date(records[0].capturedAt).toLocaleString() + (round ? ' · Round ' + round.fact.roundId : '') : '';
  renderFindings(records);
  const activeRoute = document.activeElement?.dataset.route;
  routes.replaceChildren();

  for (const candidate of receipt?.fact.candidates || []) {
    const item = requestElement('p');
    const selection = candidate.selection;
    item.textContent = candidate.path + ' · ' + (selection.status === 'selected' ? 'Selected for capture' :
      selection.status === 'not-evaluated' ? 'Selection not evaluated' : diagnosticLabel(selection.diagnostic));
    routes.append(item);
  }
  for (const record of records.filter(record => record.fact.kind === 'diagnostic')) {
    const context = diagnosticContext(record.fact, receipt);
    const item = requestElement('p', (context ? context + ' · ' : '') + diagnosticLabel(record.fact.diagnostic)); routes.append(item);
  }
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
  if (!invocations.length) requestList.append(requestElement('li', 'No captured HTTP attempt. Model input alone does not establish dispatch.', 'list-empty'));
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
outcomeFilter.addEventListener('change', () => { if (current) render(current); });
filter.addEventListener('input', () => { if (current) render(current); });
for (const item of identityFilters) item.element.addEventListener('change', () => { if (current) render(current); });
document.querySelector('#clear-filters').addEventListener('click', resetFilters);
document.querySelector('#recover-filters').addEventListener('click', () => {
  resetFilters(); hideUnreviewed.checked = false; if (current) render(current); filter.focus();
});
document.querySelector('#show-unreviewed').addEventListener('click', () => {
  hideUnreviewed.checked = false; if (current) render(current);
});
for (const button of document.querySelectorAll('[data-panel]')) button.addEventListener('click', () => {
  const panel = document.getElementById(button.dataset.panel); panel.open = true;
  panel.querySelector('summary').focus({ preventScroll: true }); panel.scrollIntoView({ block: 'start' });
});
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
      if (!received) document.querySelector('#empty-title').textContent = 'Loading retained history…';
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
:root {
  color-scheme: dark;
  --canvas: oklch(18% .015 255);
  --surface: oklch(22% .018 255);
  --raised: oklch(27% .024 255);
  --ink: oklch(94% .008 255);
  --muted: oklch(74% .025 255);
  --line: oklch(36% .025 255);
  --accent: oklch(80% .10 250);
  --space: clamp(1rem, .7rem + 1vw, 1.75rem);
  scrollbar-gutter: stable;
  overflow-wrap: break-word;
  text-wrap: pretty;
  -webkit-text-size-adjust: 100%;
}
*, *::before, *::after { box-sizing: border-box; }
body { font: .875rem/1.6 system-ui, sans-serif; margin: 0; min-block-size: 100svh; color: var(--ink); background: var(--canvas); }
.skip-link { position: fixed; inset-block-start: .75rem; inset-inline-start: var(--space); z-index: 10; transform: translateY(-200%); padding-block: .65rem; padding-inline: 1rem; background: var(--ink); color: var(--canvas); border-radius: .5rem; }
.skip-link:focus { transform: none; }
.skip-link:active { background: var(--accent); }
h1, h2, h3, h4, p { margin-block: 0 .75rem; }
h1, h2, h3, h4 { text-wrap: balance; }
h1 { font-size: 1.15rem; display: flex; align-items: center; gap: .75rem; margin: 0; }
h2 { font-size: 1.35rem; letter-spacing: -.02em; }
h3 { font-size: 1rem; } h4 { font-size: .9rem; font-weight: 600; }
.brand-icon { display: block; flex: none; }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding-block: 1.15rem; padding-inline: var(--space); border-block-end: 1px solid var(--line); background: var(--surface); }
header p { margin: 0; }
.header-actions { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; font-size: .8rem; color: var(--muted); }
#status { color: var(--ink); }
#recording-summary { padding-block: .3rem; padding-inline: .65rem; border: 1px solid var(--line); border-radius: 999px; }
.toolbar { display: flex; flex-wrap: wrap; gap: var(--space); align-items: start; padding: var(--space); border-block-end: 1px solid var(--line); background: var(--surface); }
.search { flex: 1 1 15rem; }
.search input { inline-size: 100%; }
#filter-panel { flex: 999 1 36rem; min-inline-size: min(100%, 50%); }
.identity-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: .85rem; align-items: end; }
label { display: block; font-size: .8rem; font-weight: 600; color: var(--muted); }
label :is(input, select) { margin-block-start: .35rem; }
button, input, select { font: inherit; padding-block: .65rem; padding-inline: .8rem; color: var(--ink); background: var(--raised); border: 1px solid var(--line); border-radius: .55rem; max-inline-size: 100%; min-block-size: 44px; }
input, select { font-size: 1rem; font-weight: 400; }
select { font-weight: 400; display: block; inline-size: 100%; min-inline-size: 0; }
input[type=checkbox] { accent-color: var(--accent); min-block-size: auto; inline-size: 1.1rem; block-size: 1.1rem; flex: none; margin: 0; }
button, summary, a { touch-action: manipulation; }
button { cursor: pointer; white-space: normal; overflow-wrap: anywhere; user-select: none; }
button:disabled { opacity: .45; cursor: default; }
:where(button, input, select, summary, a, pre):focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
button:not(:disabled):active, summary:active { background: color-mix(in oklch, var(--accent) 22%, var(--surface)); }
.advanced-filters { grid-column: 1 / -1; }
.advanced-filters summary { font-size: .8rem; color: var(--muted); }
.advanced-filters .identity-filters { padding-block: .5rem; }
.checkbox-filter { grid-column: 1 / -1; display: flex; align-items: center; gap: .6rem; min-block-size: 44px; }
main { container-type: inline-size; display: flex; flex-wrap: wrap; max-inline-size: 100rem; margin-inline: auto; }
.edit-list { flex: 1 1 21rem; padding: var(--space); border-inline-end: 1px solid var(--line); }
#selected-evidence { flex: 999 1 0; min-inline-size: 60%; padding: var(--space); }
small, .muted { color: var(--muted); } small { display: block; }
.edit-list > .muted { font-size: .8rem; }
#visible-count { font-weight: 700; color: var(--ink); }
ul { padding: 0; list-style: none; margin: 0; overflow: auto; }
#edits { max-block-size: 70svh; scrollbar-gutter: stable; overscroll-behavior: contain; padding: .25rem; }
li { margin-block: .45rem; }
li button { inline-size: 100%; text-align: start; padding: .9rem; background: var(--surface); }
li button strong { display: block; font-weight: 600; }
[aria-pressed=true] { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 16%, var(--surface)); box-shadow: inset 3px 0 var(--accent); }
pre { font: .8125rem/1.75 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; padding: 1rem; background: var(--canvas); border: 1px solid var(--line); max-block-size: 55svh; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; border-radius: .55rem; tab-size: 2; }
details { min-inline-size: 0; }
summary { cursor: pointer; font-weight: 600; padding-block: .85rem; padding-inline: .25rem; min-block-size: 44px; border-radius: .35rem; }
details details { margin-block: .5rem; }
#edit-content > details { border: 1px solid var(--line); border-radius: .75rem; margin-block-start: .8rem; padding-inline: 1rem; background: var(--surface); }
#edit-content > details[open] { padding-block-end: 1rem; }
#review { padding-block: .5rem 1rem; }
#routes p, #finding-summary p, .request-question, .observation-list li, .file-group li { padding-block: .65rem; padding-inline: .85rem; background: var(--raised); border-radius: .45rem; }
#finding-summary button { margin-block-start: .75rem; font-size: .8rem; }
#request-view { margin-block-start: 1rem; overflow-wrap: anywhere; }
#request-view h3 { margin-block-start: 1.25rem; }
.request-question { margin-block: .5rem; }
.captured-text { white-space: pre-wrap; }
.observation-list { padding: 0; list-style: none; }
.observation-list time { display: inline-block; color: var(--muted); margin-inline-end: .7rem; font-variant-numeric: tabular-nums; }
.observation-list p { margin-block: .25rem 0; }
.file-group { margin-block: .8rem; overflow-wrap: anywhere; }
.file-group h3 { margin-block-end: .35rem; }
.file-group small { margin-block-start: .1rem; }
#handoff-recipient { overflow-wrap: anywhere; margin-block-start: .75rem; }
#request-view dl { margin: 0; } #request-view dt { font-weight: 600; } #request-view dd { margin-block: 0 .75rem; margin-inline: 0; }
#request-view pre { margin-block-start: .4rem; }
#edit-context { overflow-wrap: anywhere; }
.hidden-edits { font-size: .75rem; text-align: center; padding-block: .4rem; padding-inline: .5rem; border-block: 1px dashed var(--line); }
.edit-unreviewed { color: var(--muted); border-style: dashed; }
.edit-badges { display: flex; gap: .4rem; flex-wrap: wrap; margin-block-start: .65rem; }
.edit-badge { font-size: .75rem; line-height: 1.5; padding-block: .2rem; padding-inline: .55rem; border-radius: 999px; background: var(--raised); color: var(--muted); font-variant-numeric: tabular-nums; }
.badge-decision { background: oklch(31% .045 85); color: oklch(89% .12 85); }
.badge-findings { background: oklch(31% .045 40); color: oklch(85% .10 40); }
.badge-clear { background: oklch(29% .04 155); color: oklch(84% .10 155); }
.badge-failed { background: oklch(30% .055 15); color: oklch(84% .10 15); }
.empty { padding: clamp(1.25rem, 4vw, 3rem); color: var(--muted); text-align: center; border: 1px dashed var(--line); border-radius: .75rem; }
.outcome-filter { margin-block-start: 1rem; }
.evidence-navigation { display: flex; flex-wrap: wrap; gap: .5rem; margin-block: 1.1rem 1.5rem; }
.evidence-navigation button { font-size: .8rem; background: var(--surface); }
.list-recovery { display: flex; flex-wrap: wrap; gap: .5rem; margin-block-end: .75rem; }
.list-recovery button { font-size: .8rem; }
.empty p { max-inline-size: 42rem; margin-inline: auto; }
.empty ol { text-align: start; max-inline-size: 36rem; margin: 1.5rem auto; padding-inline-start: 1.5rem; }
.empty li { padding-inline-start: .4rem; margin-block: .75rem; }
.empty code { color: var(--ink); overflow-wrap: anywhere; }
.empty a { display: inline-block; color: var(--accent); min-block-size: 44px; padding-block: .75rem; }
#selected-badges .edit-badge { font-size: .8rem; }
#review { scroll-margin-block-start: 1rem; }
#edit-content > details { scroll-margin-block-start: 1rem; }
[hidden] { display: none !important; } #selection-status:empty { display: none; }
@media (hover: hover) and (pointer: fine) {
  button:not(:disabled):hover { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 10%, var(--surface)); }
  summary:hover { color: var(--accent); }
}
@media (prefers-reduced-motion: no-preference) {
  button { transition: background-color 150ms ease-out, border-color 150ms ease-out; }
}
@container (width < 54rem) {
  .edit-list { border-inline-end: 0; border-block-end: 1px solid var(--line); }
  #edits { max-block-size: 32svh; }
  #selected-evidence { min-inline-size: 100%; }
}
@media (max-width: 650px) {
  .header-actions { inline-size: 100%; }
}
`

const hash = (value: string) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`
export const inspectionPagePolicy = `default-src 'none'; script-src ${hash(script)}; style-src ${hash(style)}; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`
export const inspectionPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Hapsland inspection</title><link rel="icon" type="image/svg+xml" href="${inspectionFavicon}"><style>${style}</style><body>
<a class="skip-link" href="#selected-evidence">Skip to selected evidence</a>
<header><h1><img class="brand-icon" src="${inspectionProductIcon}" alt="" width="32" height="32">Hapsland inspection</h1><div class="header-actions"><p id="status" role="status">Connecting…</p><span id="recording-summary">Recording: Unknown</span></div></header>
<div class="toolbar"><div class="search"><label>Search edits<input id="filter" type="search" placeholder="Path, project or runtime"></label><label class="outcome-filter">Recorded result<select id="outcome-filter"><option value="">All results</option><option value="findings">Findings recorded</option><option value="failed">Review failed</option><option value="pending">Review pending</option><option value="clear">Completed · no findings recorded</option></select></label></div><div id="filter-panel"><div class="identity-filters"><label>Project<span id="root-filter-count" class="muted"> · 0</span><select id="root-filter"><option value="">All</option></select></label><label>Runtime<span id="runtime-filter-count" class="muted"> · 0</span><select id="runtime-filter"><option value="">All</option></select></label><details class="advanced-filters"><summary id="advanced-filter-summary">Session, child &amp; resident</summary><div class="identity-filters"><label>Session<span id="session-filter-count" class="muted"> · 0</span><select id="session-filter"><option value="">All</option></select></label><label>Child<span id="child-filter-count" class="muted"> · 0</span><select id="child-filter"><option value="">All</option></select></label><label>Resident<span id="resident-filter-count" class="muted"> · 0</span><select id="resident-filter"><option value="">All</option></select></label></div></details><label class="checkbox-filter"><input id="hide-unreviewed" type="checkbox"${defaultInspectionFilters.hideUnreviewed ? " checked" : ""}>Hide edits without retained requests</label><button id="clear-filters" type="button">Clear filters</button></div></div></div>
<main><section class="edit-list" aria-label="Captured edits"><p id="visible-count" class="muted" role="status"></p><p id="call-summary" class="muted"></p><div class="list-recovery"><button id="show-unreviewed" type="button" hidden>Show edits without requests</button><button id="recover-filters" type="button" hidden>Show all retained edits</button></div><p class="muted">Last captured event: <time id="last-event">No retained events</time><br>Last received edit: <time id="last-edit">No retained events</time><small>Across all retained activity, including hidden edits.</small></p><ul id="edits"></ul></section><section id="selected-evidence" tabindex="-1" aria-label="Selected evidence"><p id="selection-status" role="status"></p><div id="edit-empty" class="empty"><h2 id="empty-title">Connecting to local history</h2><p id="empty-description">Retained edits will appear here when history is available.</p><div id="recording-guide" hidden><ol><li>Merge <code>"sessionInspection": true</code> into your repository’s <code>.hapsland.jsonc</code>, preserving existing settings.</li><li>Make a new supported edit through your installed agent integration.</li><li>Select the captured edit here to inspect its review.</li></ol><p class="muted">Recording contains source and review messages. Earlier edits are not backfilled.</p><a href="https://github.com/dearlordylord/hapsland/blob/master/docs/status.md#opt-in-local-inspection" target="_blank" rel="noreferrer">Recording and inspection guide ↗</a></div></div><div id="edit-content" hidden><h2 id="edit-title"></h2><p id="edit-context" class="muted"></p><div id="selected-badges" class="edit-badges" aria-label="Recorded review summary"></div><nav class="evidence-navigation" aria-label="Inspect selected edit"><button type="button" data-panel="panel-request">Code &amp; request</button><button type="button" data-panel="panel-files">File selection</button><button type="button" data-panel="panel-handoffs">Message to agent</button><button type="button" data-panel="panel-evidence">Answers &amp; history</button></nav><section id="review"><h3>Recorded review</h3><div id="routes"></div><div id="finding-summary"></div></section>
<details id="panel-request"><summary id="request-panel-summary">Request</summary><p class="muted">Captured HTTP attempts do not confirm remote receipt.</p><ul id="requests"></ul><div id="request-view"></div><details id="request-raw"><summary>JSON</summary><pre tabindex="0" id="exact"></pre></details><details><summary>Request metadata</summary><pre tabindex="0" id="request-metadata"></pre></details><details><summary>Model input</summary><pre tabindex="0" id="input"></pre></details></details>
<details id="panel-files"><summary>Files</summary><div id="files"></div><details><summary>Included source</summary><pre tabindex="0" id="source"></pre></details></details>
<details id="panel-handoffs" open><summary id="handoff-panel-summary">To agent</summary><p id="handoff-note" class="muted" hidden>The resident message before runtime formatting. Preparation does not confirm agent receipt.</p><ul id="handoffs"></ul><p id="handoff-recipient" class="muted" hidden></p><div id="handoff-edits"></div><p id="handoff-output-status"></p><pre tabindex="0" id="handoff-message" hidden></pre><details id="handoff-metadata" hidden><summary>Message metadata</summary><pre tabindex="0" id="handoff-summary"></pre></details></details>
<details id="panel-evidence"><summary>Debug</summary><details id="finding-history-panel" hidden><summary id="finding-history-title">Finding history</summary><p class="muted">Finding status changes.</p><ol id="finding-history" class="observation-list"></ol></details><details><summary>Answers &amp; rules</summary><pre tabindex="0" id="results"></pre></details><details><summary>Raw</summary><pre tabindex="0" id="detail"></pre></details></details></div></section></main>
<script>${script}</script></body></html>`
