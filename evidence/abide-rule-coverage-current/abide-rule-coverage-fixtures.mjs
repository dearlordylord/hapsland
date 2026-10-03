// Synthetic rule-coverage candidates. No live results are implied.
// Domain prose is public; witness metadata belongs only to independent scoring.
const specs = [
  {
    "family": "inferred-case",
    "ruleId": "r1_inferred_case",
    "id": "retention-action",
    "domain": "An archive action either keeps a document until a specified date or removes it immediately. The action must say which operation it represents.",
    "before": "export interface CaseState {\n  /** An archive action either keeps a document until a date or removes it immediately. */\n  label: string;\n  action: { kind: \"remove\" } | { kind: \"keep\"; until: \"2026-10-01\" | \"2026-11-01\" };\n}\n",
    "after": "export interface CaseState {\n  /** An archive action either keeps a document until a date or removes it immediately. */\n  label: string;\n  until?: \"2026-10-01\" | \"2026-11-01\";\n}\n",
    "witness": "{ label: \"archive\", until: undefined }",
    "validWitnesses": [
      "{ label: \"keep\", until: \"2026-11-01\" }"
    ],
    "gold": true,
    "support": {},
    "observable": null
  },
  {
    "family": "inferred-case",
    "ruleId": "r1_inferred_case",
    "id": "render-destination",
    "domain": "Rendering either returns bytes to the caller or writes to an output destination. An absent destination silently chooses a different operation.",
    "before": "import type { RenderOptions } from \"./support\";\nexport interface CaseState {\n  /** Rendering either returns bytes to the caller or writes bytes to a destination. */\n  label: string;\n  output: { kind: \"return\" } | { kind: \"write\"; destination: string };\n}\n",
    "after": "import type { RenderOptions } from \"./support\";\nexport interface CaseState {\n  /** Rendering either returns bytes to the caller or writes bytes to a destination. */\n  label: string;\n  output: RenderOptions;\n}\n",
    "witness": "{ label: \"render\", output: {} }",
    "validWitnesses": [
      "{ label: \"disk\", output: { destination: \"output.bin\" } }"
    ],
    "gold": true,
    "support": {
      "support.ts": "export interface RenderOptions { destination?: string; }\n"
    },
    "observable": null
  },
  {
    "family": "inferred-case",
    "ruleId": "r1_inferred_case",
    "id": "clean-profile-attributes",
    "domain": "A profile has one meaning. Biography and preferred pronouns are independent optional attributes, never alternative operations.",
    "before": "export interface CaseState {\n  /** A profile has one meaning. Biography and preferred pronouns are independent optional attributes, never alternative operations. */\n  label: string;\n  biography?: string;\n}\n",
    "after": "export interface CaseState {\n  /** A profile has one meaning. Biography and preferred pronouns are independent optional attributes, never alternative operations. */\n  label: string;\n  biography?: string;\n  pronouns?: string;\n}\n",
    "witness": "{ label: \"profile\", biography: \"writer\" }",
    "validWitnesses": [
      "{ label: \"profile\" }",
      "{ label: \"profile\", biography: \"writer\", pronouns: \"they/them\" }"
    ],
    "gold": false,
    "support": {},
    "observable": null
  },
  {
    "family": "meaningless-combinations",
    "ruleId": "r2_meaningless_combinations",
    "id": "cache-retention",
    "domain": "Disabled caching stores nothing; a retention duration applies only when caching is enabled.",
    "before": "export interface CaseState {\n  /** Disabled caching stores nothing; a retention duration applies only when caching is enabled. */\n  label: string;\n  cache: { enabled: false; retainMinutes?: never } | { enabled: true; retainMinutes: 5 | 30 };\n}\n",
    "after": "export interface CaseState {\n  /** Disabled caching stores nothing; a retention duration applies only when caching is enabled. */\n  label: string;\n  cacheEnabled: boolean;\n  retainMinutes: 5 | 30;\n}\n",
    "witness": "{ label: \"cache\", cacheEnabled: false, retainMinutes: 30 }",
    "validWitnesses": [
      "{ label: \"cache\", cacheEnabled: true, retainMinutes: 5 }"
    ],
    "gold": true,
    "support": {},
    "observable": null
  },
  {
    "family": "meaningless-combinations",
    "ruleId": "r2_meaningless_combinations",
    "id": "document-signature",
    "domain": "A draft cannot have a signing certificate; a signed document must have one.",
    "before": "import type { SigningState } from \"./support\";\nexport interface CaseState {\n  /** A draft cannot have a signing certificate; a signed document must have one. */\n  label: string;\n  document: { state: \"draft\"; certificate?: never } | { state: \"signed\"; certificate: \"alice\" | \"bob\" };\n}\n",
    "after": "import type { SigningState } from \"./support\";\nexport interface CaseState {\n  /** A draft cannot have a signing certificate; a signed document must have one. */\n  label: string;\n  document: SigningState;\n}\n",
    "witness": "{ label: \"draft\", document: { state: \"draft\", certificate: \"alice\" } }",
    "validWitnesses": [
      "{ label: \"draft\", document: { state: \"draft\" } }",
      "{ label: \"signed\", document: { state: \"signed\", certificate: \"bob\" } }"
    ],
    "gold": true,
    "support": {
      "support.ts": "export interface SigningState { state: \"draft\" | \"signed\"; certificate?: \"alice\" | \"bob\"; }\n"
    },
    "observable": null
  },
  {
    "family": "meaningless-combinations",
    "ruleId": "r2_meaningless_combinations",
    "id": "clean-cache-variant",
    "domain": "Disabled caching carries no retention; enabled caching carries a retention duration.",
    "before": "export interface CaseState {\n  /** Disabled caching carries no retention; enabled caching carries a retention duration. */\n  label: string;\n  cache: { enabled: false; retainMinutes?: never } | { enabled: true; retainMinutes: 5 | 30 };\n}\n",
    "after": "export interface CaseState {\n  /** Disabled caching carries no retention; enabled caching carries a retention duration. */\n  label: string;\n  cache: { enabled: false; retainMinutes?: never } | { enabled: true; retainMinutes: 5 | 30 };\n  note?: string;\n}\n",
    "witness": "{ label: \"off\", cache: { enabled: false } }",
    "validWitnesses": [
      "{ label: \"on\", cache: { enabled: true, retainMinutes: 30 } }"
    ],
    "gold": false,
    "support": {},
    "observable": null
  },
  {
    "family": "split-correlations",
    "ruleId": "r3_split_correlations",
    "id": "color-channels",
    "domain": "An optional RGB color must supply all three channels. A lone red channel is not a color.",
    "before": "export interface CaseState {\n  /** An optional RGB color must supply all three channels. A lone red channel is not a color. */\n  label: string;\n  color?: { red: number; green: number; blue: number };\n}\n",
    "after": "export interface CaseState {\n  /** An optional RGB color must supply all three channels. A lone red channel is not a color. */\n  label: string;\n  red?: number;\n  green?: number;\n  blue?: number;\n}\n",
    "witness": "{ label: \"paint\", red: 255 }",
    "validWitnesses": [
      "{ label: \"plain\" }",
      "{ label: \"white\", red: 255, green: 255, blue: 255 }"
    ],
    "gold": true,
    "support": {},
    "observable": null
  },
  {
    "family": "split-correlations",
    "ruleId": "r3_split_correlations",
    "id": "calibration-pair",
    "domain": "An optional calibration pairs a raw sensor reading with its reference reading. Neither half is a usable calibration.",
    "before": "import type { Calibration } from \"./support\";\nexport interface CaseState {\n  /** An optional calibration pairs a raw sensor reading with its reference reading. Neither half is a usable calibration. */\n  label: string;\n  calibration?: { raw: number; reference: number };\n}\n",
    "after": "import type { Calibration } from \"./support\";\nexport interface CaseState {\n  /** An optional calibration pairs a raw sensor reading with its reference reading. Neither half is a usable calibration. */\n  label: string;\n  calibration?: Calibration;\n}\n",
    "witness": "{ label: \"sensor\", calibration: { reference: 20 } }",
    "validWitnesses": [
      "{ label: \"none\" }",
      "{ label: \"sensor\", calibration: { raw: 19.4, reference: 20 } }"
    ],
    "gold": true,
    "support": {
      "support.ts": "export interface Calibration { raw?: number; reference?: number; }\n"
    },
    "observable": null
  },
  {
    "family": "split-correlations",
    "ruleId": "r3_split_correlations",
    "id": "clean-independent-measurements",
    "domain": "Room temperature and humidity are independently available measurements; either remains meaningful without the other.",
    "before": "export interface CaseState {\n  /** Room temperature and humidity are independently available measurements; either remains meaningful without the other. */\n  label: string;\n  temperatureCelsius?: number;\n}\n",
    "after": "export interface CaseState {\n  /** Room temperature and humidity are independently available measurements; either remains meaningful without the other. */\n  label: string;\n  temperatureCelsius?: number;\n  humidityPercent?: number;\n}\n",
    "witness": "{ label: \"room\", temperatureCelsius: 21 }",
    "validWitnesses": [
      "{ label: \"room\", humidityPercent: 50 }",
      "{ label: \"room\" }"
    ],
    "gold": false,
    "support": {},
    "observable": null
  },
  {
    "family": "absence-confusion",
    "ruleId": "r5_absence_confusion",
    "id": "muted-topics",
    "domain": "The muted topics set is always known. Both omission and an empty array mean no muted topics.",
    "before": "export interface CaseState {\n  /** The muted topics set is always known. Both omission and an empty array mean no muted topics. */\n  label: string;\n  mutedTopics: string[];\n}\n",
    "after": "export interface CaseState {\n  /** The muted topics set is always known. Both omission and an empty array mean no muted topics. */\n  label: string;\n  mutedTopics?: string[];\n}\n",
    "witness": "{ label: \"reader\" }",
    "validWitnesses": [
      "{ label: \"reader\", mutedTopics: [] }"
    ],
    "gold": true,
    "support": {},
    "observable": null
  },
  {
    "family": "absence-confusion",
    "ruleId": "r5_absence_confusion",
    "id": "required-recipients",
    "domain": "A notification batch must contain at least one recipient; empty batches have no domain meaning.",
    "before": "import type { RecipientList } from \"./support\";\nexport interface CaseState {\n  /** A notification batch must contain at least one recipient; empty batches have no domain meaning. */\n  label: string;\n  recipients: [string, ...string[]];\n}\n",
    "after": "import type { RecipientList } from \"./support\";\nexport interface CaseState {\n  /** A notification batch must contain at least one recipient; empty batches have no domain meaning. */\n  label: string;\n  recipients: RecipientList;\n}\n",
    "witness": "{ label: \"batch\", recipients: [] }",
    "validWitnesses": [
      "{ label: \"batch\", recipients: [\"alice\"] }"
    ],
    "gold": true,
    "support": {
      "support.ts": "export type RecipientList = string[];\n"
    },
    "observable": null
  },
  {
    "family": "absence-confusion",
    "ruleId": "r5_absence_confusion",
    "id": "clean-known-empty-set",
    "domain": "The muted topics set is always known; an empty required array is the single representation of no muted topics.",
    "before": "export interface CaseState {\n  /** The muted topics set is always known; an empty required array is the single representation of no muted topics. */\n  label: string;\n  mutedTopics: string[];\n}\n",
    "after": "export interface CaseState {\n  /** The muted topics set is always known; an empty required array is the single representation of no muted topics. */\n  label: string;\n  mutedTopics: string[];\n  note?: string;\n}\n",
    "witness": "{ label: \"reader\", mutedTopics: [] }",
    "validWitnesses": [
      "{ label: \"reader\", mutedTopics: [\"sports\"] }"
    ],
    "gold": false,
    "support": {},
    "observable": null
  },
  {
    "family": "bare-domain-value",
    "ruleId": "r6_bare_domain_value",
    "id": "seat-class",
    "domain": "The booking domain recognizes exactly standard and accessible seat classes; arbitrary text is not a class.",
    "before": "export interface CaseState {\n  /** The booking domain recognizes exactly standard and accessible seat classes; arbitrary text is not a class. */\n  label: string;\n  seatClass: \"standard\" | \"accessible\";\n}\n",
    "after": "export interface CaseState {\n  /** The booking domain recognizes exactly standard and accessible seat classes; arbitrary text is not a class. */\n  label: string;\n  seatClass: string;\n}\n",
    "witness": "{ label: \"seat\", seatClass: \"banana\" }",
    "validWitnesses": [
      "{ label: \"seat\", seatClass: \"standard\" }",
      "{ label: \"seat\", seatClass: \"accessible\" }"
    ],
    "gold": true,
    "support": {},
    "observable": null
  },
  {
    "family": "bare-domain-value",
    "ruleId": "r6_bare_domain_value",
    "id": "account-project-identities",
    "domain": "A project belongs to an account. Account identities and project identities cannot be substituted for one another.",
    "before": "import type { AccountId, ProjectId } from \"./support\";\nexport interface CaseState {\n  /** A project belongs to an account. Account identities and project identities cannot be substituted for one another. */\n  label: string;\n  account: string & { readonly account: unique symbol };\n  project: string & { readonly project: unique symbol };\n}\n",
    "after": "import type { AccountId, ProjectId } from \"./support\";\nexport interface CaseState {\n  /** A project belongs to an account. Account identities and project identities cannot be substituted for one another. */\n  label: string;\n  account: AccountId;\n  project: ProjectId;\n}\n",
    "witness": "{ label: \"project\", account: \"project:7\", project: \"account:2\" }",
    "validWitnesses": [
      "{ label: \"project\", account: \"account:2\", project: \"project:7\" }"
    ],
    "gold": true,
    "support": {
      "support.ts": "export type AccountId = string;\nexport type ProjectId = string;\n"
    },
    "observable": null
  },
  {
    "family": "bare-domain-value",
    "ruleId": "r6_bare_domain_value",
    "id": "clean-free-form-description",
    "domain": "Descriptions and notes are free text; the domain accepts arbitrary strings for both.",
    "before": "export interface CaseState {\n  /** Descriptions and notes are free text; the domain accepts arbitrary strings for both. */\n  label: string;\n  description: string;\n}\n",
    "after": "export interface CaseState {\n  /** Descriptions and notes are free text; the domain accepts arbitrary strings for both. */\n  label: string;\n  description: string;\n  note?: string;\n}\n",
    "witness": "{ label: \"entry\", description: \"anything\" }",
    "validWitnesses": [
      "{ label: \"entry\", description: \"\", note: \"any text\" }"
    ],
    "gold": false,
    "support": {},
    "observable": null
  },
  {
    "family": "name-wider-than-type",
    "ruleId": "r7_name_wider_than_type",
    "id": "worker-count",
    "domain": "An enabled small worker pool has exactly one, two or four workers. Its count cannot be negative or fractional.",
    "before": "export interface CaseState {\n  /** An enabled small worker pool has exactly one, two or four workers. Its count cannot be negative or fractional. */\n  label: string;\n  workerCount: 1 | 2 | 4;\n}\n",
    "after": "export interface CaseState {\n  /** An enabled small worker pool has exactly one, two or four workers. Its count cannot be negative or fractional. */\n  label: string;\n  workerCount: number;\n}\n",
    "witness": "{ label: \"pool\", workerCount: -1.5 }",
    "validWitnesses": [
      "{ label: \"pool\", workerCount: 1 }",
      "{ label: \"pool\", workerCount: 4 }"
    ],
    "gold": true,
    "support": {},
    "observable": null
  },
  {
    "family": "name-wider-than-type",
    "ruleId": "r7_name_wider_than_type",
    "id": "http-endpoint",
    "domain": "An endpoint address must start with the HTTP or HTTPS scheme. This example checks that prefix only, not full URL validity.",
    "before": "export interface CaseState {\n  /** An endpoint address must start with the HTTP or HTTPS scheme. This example checks that prefix only, not full URL validity. */\n  label: string;\n  endpointUrl: `https://${string}` | `http://${string}`;\n}\n",
    "after": "export interface CaseState {\n  /** An endpoint address must start with the HTTP or HTTPS scheme. This example checks that prefix only, not full URL validity. */\n  label: string;\n  endpointUrl: string;\n}\n",
    "witness": "{ label: \"api\", endpointUrl: \"ask someone\" }",
    "validWitnesses": [
      "{ label: \"api\", endpointUrl: \"https://example.invalid/api\" }"
    ],
    "gold": true,
    "support": {},
    "observable": null
  },
  {
    "family": "name-wider-than-type",
    "ruleId": "r7_name_wider_than_type",
    "id": "clean-worker-count",
    "domain": "An enabled small worker pool has exactly one, two or four workers, as encoded by its literal union.",
    "before": "export interface CaseState {\n  /** An enabled small worker pool has exactly one, two or four workers, as encoded by its literal union. */\n  label: string;\n  workerCount: 1 | 2 | 4;\n}\n",
    "after": "export interface CaseState {\n  /** An enabled small worker pool has exactly one, two or four workers, as encoded by its literal union. */\n  label: string;\n  workerCount: 1 | 2 | 4;\n  note?: string;\n}\n",
    "witness": "{ label: \"pool\", workerCount: 2 }",
    "validWitnesses": [
      "{ label: \"pool\", workerCount: 1 }",
      "{ label: \"pool\", workerCount: 4 }"
    ],
    "gold": false,
    "support": {},
    "observable": null
  },
  {
    "family": "name-claims-resource",
    "ruleId": "r8_name_claims_resource",
    "id": "publish-bulletin",
    "domain": "Publishing a bulletin writes to a publication channel. The public callable must name that channel in its declaration.",
    "before": "export interface CaseState {\n  /** Publishing a bulletin writes its text to a publication channel. */\n  label: string;\n  publishBulletin: (channel: { publish: (text: string) => void }, text: string) => void;\n}\n",
    "after": "export interface CaseState {\n  /** Publishing a bulletin writes its text to a publication channel. */\n  label: string;\n  publishBulletin: (text: string) => void;\n}\n",
    "witness": null,
    "validWitnesses": [],
    "gold": true,
    "support": {},
    "observable": "The publishBulletin signature names text only; the name promises a write but no channel or effect requirement appears."
  },
  {
    "family": "name-claims-resource",
    "ruleId": "r8_name_claims_resource",
    "id": "load-preview",
    "domain": "Loading a preview reads from a preview store. The public callable must name that store in its declaration.",
    "before": "import type { LoadPreview } from \"./support\";\nexport interface CaseState {\n  /** Loading a preview reads preview text from a preview store. */\n  label: string;\n  loadPreview: (store: { read: () => string }) => string;\n}\n",
    "after": "import type { LoadPreview } from \"./support\";\nexport interface CaseState {\n  /** Loading a preview reads preview text from a preview store. */\n  label: string;\n  loadPreview: LoadPreview;\n}\n",
    "witness": null,
    "validWitnesses": [],
    "gold": true,
    "support": {
      "support.ts": "export type LoadPreview = () => string;\n"
    },
    "observable": "The loadPreview signature names no source although loading a preview is a resource read."
  },
  {
    "family": "name-claims-resource",
    "ruleId": "r8_name_claims_resource",
    "id": "clean-explicit-channel",
    "domain": "Publishing a bulletin writes through the explicit channel argument.",
    "before": "export interface CaseState {\n  /** Publishing a bulletin writes its text through the supplied channel. */\n  label: string;\n  publishBulletin: (channel: { publish: (text: string) => void }, text: string) => void;\n}\n",
    "after": "export interface CaseState {\n  /** Publishing a bulletin writes its text through the supplied channel. */\n  label: string;\n  publishBulletin: (channel: { publish: (text: string) => void }, text: string) => void;\n  note?: string;\n}\n",
    "witness": null,
    "validWitnesses": [],
    "gold": false,
    "support": {},
    "observable": "The resource is explicit in the channel parameter; a resource verb is not by itself a defect."
  },
  {
    "family": "body-reaches-undeclared",
    "ruleId": "r9_body_reaches_undeclared",
    "id": "clock-sensitive-expiry",
    "domain": "Expiry checking compares a deadline to the clock. Its signature must expose the time dependency.",
    "before": "import { currentTime } from \"./support\";\nexport function CaseState(label: string, deadline: number, now: number): boolean {\n  /** Expiry checking compares a deadline against the current clock reading. */\n  void label;\n  return deadline <= now;\n}\n",
    "after": "import { currentTime } from \"./support\";\nexport function CaseState(label: string, deadline: number): boolean {\n  /** Expiry checking compares a deadline against the current clock reading. */\n  void label;\n  return deadline <= currentTime();\n}\n",
    "witness": null,
    "validWitnesses": [],
    "gold": true,
    "support": {
      "support.ts": "export function currentTime(): number { return Date.now(); }\n"
    },
    "observable": "For identical arguments the result changes as the clock advances; currentTime reads Date.now in support.ts."
  },
  {
    "family": "body-reaches-undeclared",
    "ruleId": "r9_body_reaches_undeclared",
    "id": "hidden-audit-write",
    "domain": "Summarizing text also records an audit entry. A writer must be supplied explicitly when the function mutates audit state.",
    "before": "import { recordAudit } from \"./support\";\nexport function CaseState(label: string, text: string, audit: { record: (text: string) => void }): string {\n  /** Summarizing text records an audit entry and returns trimmed text. */\n  void label;\n  audit.record(text);\n  return text.trim();\n}\n",
    "after": "import { recordAudit } from \"./support\";\nexport function CaseState(label: string, text: string): string {\n  /** Summarizing text records an audit entry and returns trimmed text. */\n  void label;\n  recordAudit(text);\n  return text.trim();\n}\n",
    "witness": null,
    "validWitnesses": [],
    "gold": true,
    "support": {
      "support.ts": "export const auditEntries: string[] = [];\nexport function recordAudit(text: string): void { auditEntries.push(text); }\n"
    },
    "observable": "Calling CaseState(\"demo\", \" hello \") adds an entry to auditEntries despite no writer or state in the signature."
  },
  {
    "family": "body-reaches-undeclared",
    "ruleId": "r9_body_reaches_undeclared",
    "id": "clean-explicit-time",
    "domain": "Expiry checking takes the observation time as an argument and reads no clock.",
    "before": "export function CaseState(label: string, deadline: number, now: number): boolean {\n  /** Expiry checking compares a deadline against the supplied observation time. */\n  void label;\n  return deadline <= now;\n}\n",
    "after": "export function CaseState(label: string, deadline: number, now: number): boolean {\n  /** Expiry checking compares a deadline against the supplied observation time. */\n  void label;\n  const expired = deadline <= now;\n  return expired;\n}\n",
    "witness": null,
    "validWitnesses": [],
    "gold": false,
    "support": {},
    "observable": "Identical deadline and now arguments give the same result; all time dependence is explicit."
  }
];
export const cases = specs.map(spec => ({
  id: spec.id, ruleId: spec.ruleId, category: spec.gold ? 'rule-violation' : 'clean-control',
  filename: 'subject.ts', declarationName: 'CaseState', inputContract: spec.ruleId === 'r9_body_reaches_undeclared' ? 'direct-event/function/v1' : 'direct-event/type-shape/v1', before: spec.before, after: spec.after,
  support: spec.support, excludedPaths: [], gold: spec.gold, rationale: spec.domain,
  readme: `# Domain\n\n${spec.domain}\n\nlabel is presentation text. Preserve the public domain and its independent facts.\n`,
  prompt: 'Make the requested public-declaration edit while preserving the documented domain.',
  probe: { strategy: spec.observable ? 'declaration-and-runtime-observation' : 'typescript-witness',
    invalidWitness: spec.gold ? spec.witness : null, validWitnesses: spec.validWitnesses,
    observation: spec.observable, domain: spec.domain },
}));
export const tasks = cases.map(fixture => ({
  id: `coverage-${fixture.id}`, caseId: fixture.id, ruleId: fixture.ruleId,
  filename: fixture.filename, declarationName: fixture.declarationName, inputContract: fixture.inputContract, initial: fixture.after,
  support: fixture.support, excludedPaths: [], readme: fixture.readme, gold: fixture.gold,
  prompt: 'Rename label to displayLabel in subject.ts using apply_patch; preserve the public domain and run typecheck and tests.',
  probe: { ...fixture.probe, requireExport: 'CaseState', requireRenamedField: 'displayLabel' },
}));
