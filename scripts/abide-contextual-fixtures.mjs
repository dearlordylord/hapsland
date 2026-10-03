// Fresh synthetic cases selected for the context-dependent duplicate-encoding workflow.
// Public declarations/domain prose are visible to every agent. Probe gold is never sent to agents.
const ruleId = 'r4_duplicate_encoding';
const specs = [
  {
    id: 'build-provenance', root: 'artifact', type: 'BuildArtifact', duplicate: 'commit', union: '"a1" | "b2"',
    support: 'export interface BuildArtifact { provenance: BuildProvenance; }\nexport interface BuildProvenance { source: SourceRevision; }\nexport interface SourceRevision { commit: "a1" | "b2"; repository: "core" | "web"; }\n',
    domain: 'The record describes one built artifact. The record commit denotes the source revision of that artifact. The repository remains an independent provenance fact.', gold: true,
  },
  {
    id: 'audio-encoding', root: 'track', type: 'AudioTrack', duplicate: 'sampleRate', union: '44100 | 48000',
    support: 'export interface AudioTrack { encoding: AudioEncoding; }\nexport interface AudioEncoding { sampleRate: 44100 | 48000; channels: 1 | 2; }\n',
    domain: 'The record describes one stored audio track. Its sampleRate is the native encoding rate of that track. Channels are independent; either channel count is valid at either rate.', gold: true,
  },
  {
    id: 'storage-envelope', root: 'block', type: 'StoredBlock', duplicate: 'compression', union: '"none" | "zstd"',
    support: 'export interface StoredBlock { wire: WireRepresentation; }\nexport interface WireRepresentation { compression: "none" | "zstd"; generation: 1 | 2; }\n',
    domain: 'The record describes one stored block. Its compression denotes the actual compression of that block on the wire. Generation is independent of compression.', gold: true,
  },
  {
    id: 'session-grant', root: 'session', type: 'Session', duplicate: 'access', union: '"read" | "write"',
    support: 'export interface Session { grant: Grant; }\nexport interface Grant { capabilities: AccessProfile; }\nexport interface AccessProfile { access: "read" | "write"; tenant: "north" | "south"; }\n',
    domain: 'The record describes one session grant. Its access denotes the access granted by that session. Tenant and access are independent facts.', gold: true,
  },
  {
    id: 'clean-audio-resampling', root: 'track', type: 'AudioTrack', duplicate: 'sampleRate', union: '44100 | 48000',
    comment: '/** Requested playback rate; resampling is allowed. */ ',
    support: 'export interface AudioTrack { encoding: AudioEncoding; }\nexport interface AudioEncoding { sampleRate: 44100 | 48000; channels: 1 | 2; }\n',
    domain: 'The record describes a stored audio track and a requested playback sampleRate. Resampling is allowed. Requested and native rates are independent; every combination with either channel count is valid.', gold: false,
  },
  {
    id: 'clean-storage-repack', root: 'block', type: 'StoredBlock', duplicate: 'compression', union: '"none" | "zstd"',
    comment: '/** Requested compression for a future repack; may differ from the stored block. */ ',
    support: 'export interface StoredBlock { wire: WireRepresentation; }\nexport interface WireRepresentation { compression: "none" | "zstd"; generation: 1 | 2; }\n',
    domain: 'The record describes a stored block and requested compression for a future repack. Stored and requested compression are independent; every combination at either generation is valid.', gold: false,
  },
];
export const cases = specs.map(spec => {
  const before = `import type { ${spec.type} } from "./support";\nexport interface CaseState { label: string; ${spec.root}: ${spec.type}; }\n`;
  const after = `import type { ${spec.type} } from "./support";\nexport interface CaseState { label: string; ${spec.root}: ${spec.type}; ${spec.comment ?? ''}${spec.duplicate}: ${spec.union}; }\n`;
  return { id: spec.id, category: spec.gold ? 'contextual-violation' : 'clean-control', ruleId,
    filename: 'subject.ts', declarationName: 'CaseState', before, after, support: { 'support.ts': spec.support },
    excludedPaths: [], gold: spec.gold, rationale: spec.domain, readme: `# Domain\n\n${spec.domain}\n\nCaseState is the public record. label is presentation text. Preserve all documented domain values and independent facts.\n`,
    prompt: 'Make the requested public-record edit while preserving the documented domain and independent facts.' };
});
export const tasks = cases.map((fixture, i) => ({
  id: `contextual-${i + 1}-${fixture.id}`, caseId: fixture.id, ruleId: fixture.ruleId,
  filename: fixture.filename, declarationName: fixture.declarationName, initial: fixture.after,
  support: fixture.support, excludedPaths: [], readme: fixture.readme, gold: fixture.gold,
  prompt: 'Rename label to displayLabel in subject.ts; preserve the public domain and run typecheck and tests.',
  probe: { strategy: 'independent-finite-domain-probes', requireExport: 'CaseState', requireRenamedField: 'displayLabel' },
}));
