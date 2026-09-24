import { analyzeTypeFile } from '../../../src/direct-event/analyzer.ts';

const cases = [
  ['leading jsdoc', '/** SECRET_LEADING */\nexport interface A { x: string }'],
  ['inner comment', 'interface A { /* SECRET_INNER */ x: string }'],
  ['literal', 'interface A { token: "SECRET_LITERAL"; key: 42 }'],
  ['computed literal', 'interface A { ["SECRET_KEY"]: string }'],
  ['method param default', 'interface A { fn(x: "SECRET_PARAM"): void }'],
  ['export statement adjacent', 'export /** SECRET_EXPORT */ interface A { x: string }'],
  ['nested declaration', 'namespace N { export interface A { x: string } }'],
  ['interface default extension', 'interface A extends B { x: string }\ninterface B { y: number }'],
  ['unrelated source', 'const SECRET_UNRELATED = "s"; interface A { x: string }'],
  ['reference with comment', 'interface A { b: B }\n/** SECRET_B */ interface B { /* SECRET_IN_B */ x: string }'],
  ['template literal', 'type A = `SECRET_TEMPLATE_${string}`'],
  ['type alias object', 'type A = { x: "SECRET_ALIAS" }'],
];

for (const [label, source] of cases) {
  const result = analyzeTypeFile('fixture.ts', source);
  const units = result.status === 'analyzed' ? result.units.map(u => ({
    status: u.status,
    root: (u.status === 'ready' ? u.unit.root.artifact : u.root).name,
    source: (u.status === 'ready' ? u.unit.root.artifact : u.root).source,
    evidence: u.unit.root.references,
  })) : result;
  console.log(JSON.stringify({ label, units }));
}
