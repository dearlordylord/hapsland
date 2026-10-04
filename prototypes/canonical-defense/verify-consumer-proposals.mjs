// Candidate-law gate; creates no project dependency and never alters accepted laws.
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(fileURLToPath(import.meta.url));
const project = mkdtempSync(join(root, 'consumer-falsify-'));
const pin = 'github:nohzafk/bend-falsify#a50873f068c8ee81dd005f97f645717c7b7ca011';
function execute(args) {
  const result = spawnSync(process.env.BUN ?? 'bun', ['x', pin, ...args], { cwd: project, stdio: 'inherit', env: { ...process.env, PATH: process.env.BUN ? `${dirname(process.env.BUN)}:${process.env.PATH}` : process.env.PATH } });
  if (result.status !== 0) throw new Error(`bend-falsify failed: ${result.status ?? result.error}`);
}
try {
  for (const name of readdirSync(root).filter((name) => name.endsWith('.bend'))) {
    const text = readFileSync(join(root, name), 'utf8').replaceAll('../../packages/', '../../../packages/');
    writeFileSync(join(project, name), text);
  }
  const witnesses = readFileSync(join(project, 'ConsumerLiterals.bend'), 'utf8');
  writeFileSync(join(project, 'ConsumerLiterals.bend'), witnesses.slice(0, witnesses.indexOf('law retained_damage')));
  const source = readFileSync(join(project, 'DefenseHost.bend'), 'utf8');
  writeFileSync(join(project, 'core.bend'), source);
  writeFileSync(join(project, 'LAWS.bend'), readFileSync(join(project, 'ConsumerLAWS.bend'), 'utf8').replace('./DefenseHost.bend as H', './core.bend as H\nimport ./ConsumerLiterals.bend as Literal'));
  const proof = readFileSync(join(project, 'ConsumerPROOF.bend'), 'utf8')
    .replace('./ConsumerLAWS.bend as Laws', './LAWS.bend as Laws')
    .replace('def Laws.damage_', '# ---- damage preserves engine ----\ndef Laws.damage_')
    .replace('def Laws.pointer_', '# ---- pointer preserves engine ----\ndef Laws.pointer_');
  writeFileSync(join(project, 'PROOF.bend'), proof);
  const damage = source.split('\n').find((line) => line.includes('M.World{core, t, p, l, c, g, M.sub(h,'));
  const pointer = source.slice(source.indexOf('def move(')).split('\n').find((line) => line.includes('M.World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, auto, x, y,'));
  if (!damage || !pointer) throw new Error('Consumer mutant source changed; inspect the intended law-specific mutation.');
  writeFileSync(join(project, 'mutants.json'), JSON.stringify([
    { law: 'damage_preserves_engine', section: 'damage preserves engine', from: damage, to: damage.replace('M.World{core,', 'M.World{[Run.invalid(Consumer.boxed(core))],') , why: 'combat invalidates the retained engine', at: { world: 'Literal.world()' }, failsIn: 'Laws.damage_preserves_engine' },
    { law: 'pointer_preserves_engine', section: 'pointer preserves engine', from: pointer, to: pointer.replace('M.World{core,', 'M.World{[Run.invalid(Consumer.boxed(core))],') , why: 'pointer movement invalidates the retained engine', at: { world: 'Literal.world()', x: '100', y: '200' }, failsIn: 'Laws.pointer_preserves_engine' },
  ], null, 2));
  writeFileSync(join(project, 'spec.json'), JSON.stringify({ imports: ['./core.bend as H', './DefenseModel.bend as M', './ConsumerLiterals.bend as Literal', '../../../packages/monkey-business-bend/NativeRunTypes.bend as T'], instances: [
    { name: 'damage_retained', claim: '{M.engine(H.damage(Literal.world())) == Literal.state() : T.State}' },
    { name: 'pointer_retained', claim: '{M.engine(H.move(Literal.world(),100,200)) == Literal.state() : T.State}' },
    { name: 'pointer_corner', claim: '{M.engine(H.move(Literal.world(),0,4294967295)) == Literal.state() : T.State}' },
  ] }, null, 2));
  execute(['spec.json', '--each']);
  execute(['mutants', '.']);
} finally { rmSync(project, { recursive: true, force: true }); }
