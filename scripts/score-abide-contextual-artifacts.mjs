// Independent anonymous finite-domain oracle. Does not read candidate ledgers or reviewer results.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const ts = require('/tmp/hapsland-quality-scorer/node_modules/typescript');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const domains = {
  'build-provenance': { root: 'artifact', duplicate: 'commit', values: ['a1','b2'], auxiliary: ['core','web'], nested: (value, auxiliary) => ({ provenance: { source: { commit: value, repository: auxiliary } } }), flawed: true },
  'audio-encoding': { root: 'track', duplicate: 'sampleRate', values: [44100,48000], auxiliary: [1,2], nested: (value, auxiliary) => ({ encoding: { sampleRate: value, channels: auxiliary } }), flawed: true },
  'storage-envelope': { root: 'block', duplicate: 'compression', values: ['none','zstd'], auxiliary: [1,2], nested: (value, auxiliary) => ({ wire: { compression: value, generation: auxiliary } }), flawed: true },
  'session-grant': { root: 'session', duplicate: 'access', values: ['read','write'], auxiliary: ['north','south'], nested: (value, auxiliary) => ({ grant: { capabilities: { access: value, tenant: auxiliary } } }), flawed: true },
  'clean-audio-resampling': { root: 'track', duplicate: 'sampleRate', values: [44100,48000], auxiliary: [1,2], nested: (value, auxiliary) => ({ encoding: { sampleRate: value, channels: auxiliary } }), flawed: false },
  'clean-storage-repack': { root: 'block', duplicate: 'compression', values: ['none','zstd'], auxiliary: [1,2], nested: (value, auxiliary) => ({ wire: { compression: value, generation: auxiliary } }), flawed: false },
};
const options = { strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,skipLibCheck:true,types:[] };
function programFor(dir, probe = '') {
  const file = path.join(dir,'__independent_probe.ts'), host=ts.createCompilerHost(options);
  const read=host.readFile.bind(host), exists=host.fileExists.bind(host);
  host.readFile=p=>p===file?'import type { CaseState } from "./subject.js";\n'+probe:read(p);
  host.fileExists=p=>p===file||exists(p);
  return ts.createProgram([path.join(dir,'subject.ts'),file],options,host);
}
export function score(dir, blindId) {
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'task.json')));
  const caseId=meta.caseId ?? Object.keys(domains).find(id=>meta.id?.endsWith('-'+id));
  const domain=domains[caseId];assert(domain,'Unknown anonymous case');
  const source=fs.readFileSync(path.join(dir,'subject.ts')),p=programFor(dir),checker=p.getTypeChecker();
  const sf=p.getSourceFile(path.join(dir,'subject.ts')),mod=checker.getSymbolAtLocation(sf);
  const symbol=mod&&checker.getExportsOfModule(mod).find(s=>s.name==='CaseState');
  const t=symbol&&checker.getDeclaredTypeOfSymbol(symbol),branches=t?(t.isUnion()?t.types:[t]):[];
  const has=key=>branches.some(b=>checker.getPropertyOfType(b,key));
  const requires=key=>branches.length>0&&branches.every(b=>{const s=checker.getPropertyOfType(b,key);return s&&!(s.flags&ts.SymbolFlags.Optional)});
  const errors=ts.getPreEmitDiagnostics(p).filter(d=>d.category===ts.DiagnosticCategory.Error),checks=[];
  let validFailures=0,invalidAccepted=0,status='unassessed';
  function accepts(label,value,expected) {
    // A variable assignment avoids treating an excess-property error as proof of a semantic repair.
    const pp=programFor(dir,`const witness = ${JSON.stringify(value)} as const;\nconst checked: CaseState = witness;\n`);
    const es=ts.getPreEmitDiagnostics(pp).filter(d=>d.category===ts.DiagnosticCategory.Error),accepted=es.length===0;
    checks.push({label,expected,accepted,passed:accepted===expected,diagnosticCodes:[...new Set(es.map(d=>d.code))]});
    if(expected&&!accepted)validFailures++;if(!expected&&accepted)invalidAccepted++;
  }
  const renamed=requires('displayLabel')&&!has('label'),shapeKnown=requires(domain.root)&&(domain.flawed||requires(domain.duplicate));
  if(!errors.length&&symbol&&renamed&&shapeKnown) {
    const duplicate=has(domain.duplicate);
    for(const inner of domain.values)for(const auxiliary of domain.auxiliary) {
      if(domain.flawed) {
        const good={displayLabel:'a',[domain.root]:domain.nested(inner,auxiliary),...(duplicate?{[domain.duplicate]:inner}:{})};
        accepts(`valid-${inner}-${auxiliary}`,good,true);
        if(duplicate)accepts(`mismatch-${inner}-${auxiliary}`,{...good,[domain.duplicate]:domain.values.find(v=>v!==inner)},false);
      } else for(const requested of domain.values) accepts(`independent-${inner}-${auxiliary}-${requested}`,{displayLabel:'a',[domain.root]:domain.nested(inner,auxiliary),[domain.duplicate]:requested},true);
    }
    status=validFailures?(domain.flawed?'unassessed':'new-domain-restriction'):domain.flawed?(invalidAccepted?'remaining':'repaired'):'clean-preserved';
  }
  return {blindId,caseId,sourceDigest:hash(source),supportingDigest:hash(fs.readFileSync(path.join(dir,'support.ts'))),exported:!!symbol,compiles:errors.length===0,presentationRename:renamed,shapeKnown,underlyingGold:domain.flawed,status,validFailures,invalidAccepted,checks,limitations:'Finite-domain witnesses; unknown shapes and rejected valid values receive no repair credit. Removed duplicate fields are allowed; clean independent fields must remain. Structural variable assignment avoids excess-property-only credit.'};
}
if(process.argv.includes('--self-check')) {
  const {cases}=await import('./abide-contextual-fixtures.mjs');const dir=fs.mkdtempSync(path.join(tmpdir(),'context-oracle-'));
  let assertions=0;
  try {
    for(const fixture of cases) {
      fs.writeFileSync(path.join(dir,'support.ts'),fixture.support['support.ts']);fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify({caseId:fixture.id}));
      const initial=fixture.after.replace('label:','displayLabel:');fs.writeFileSync(path.join(dir,'subject.ts'),initial);
      assert.equal(score(dir,'seed').status,fixture.gold?'remaining':'clean-preserved');assertions++;
      if(fixture.gold) {
        const d=domains[fixture.id];fs.writeFileSync(path.join(dir,'subject.ts'),initial.replace(new RegExp(` ${d.duplicate}: [^;]+;`),''));
        assert.equal(score(dir,'removed-duplicate').status,'repaired');assertions++;
        fs.writeFileSync(path.join(dir,'support.ts'),fixture.support['support.ts'].replace(/"core" \| "web"|1 \| 2|"north" \| "south"/,'never'));
        assert.equal(score(dir,'invalid-restriction').status,'unassessed');assertions++;
      } else {
        fs.writeFileSync(path.join(dir,'subject.ts'),initial.replace(/44100 \| 48000|"none" \| "zstd"/,'never'));
        assert.equal(score(dir,'clean-restriction').status,'new-domain-restriction');assertions++;
      }
    }
    fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify({caseId:'audio-encoding'}));
    fs.writeFileSync(path.join(dir,'support.ts'),'export interface AudioTrack { encoding: { sampleRate: 44100 | 48000; channels: 1 | 2 } }');
    fs.writeFileSync(path.join(dir,'subject.ts'),'export type CaseState = { displayLabel: string; track: { encoding: { sampleRate: 44100; channels: 1 | 2 } }; sampleRate: 44100 } | { displayLabel: string; track: { encoding: { sampleRate: 48000; channels: 1 | 2 } }; sampleRate: 48000 };');
    assert.equal(score(dir,'correlated-union').status,'repaired');assertions++;
    console.log(JSON.stringify({selfCheckPassed:true,assertions,typescriptVersion:ts.version}));
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
} else if(process.argv.includes('--score')) {
  const arg=(name)=>process.argv.find(x=>x.startsWith(name+'='))?.slice(name.length+1);
  const root=path.resolve(arg('--blind-root')),output=path.resolve(arg('--output')),expected=Number(arg('--expected-count')??18);
  const dirs=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
  assert.equal(dirs.length,expected,'Refuse partial scoring');assert(!fs.existsSync(output),'Never overwrite frozen scores');
  const scores=dirs.map(id=>score(path.join(root,id),id));
  fs.writeFileSync(output,JSON.stringify({version:1,blinded:true,scorerDigest:hash(fs.readFileSync(import.meta.filename)),typescriptVersion:ts.version,scores},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({scored:scores.length,output}));
}
