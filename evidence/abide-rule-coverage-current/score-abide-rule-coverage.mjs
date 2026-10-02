// Anonymous finite-contract oracle. Does not read reviewer/candidate ledgers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
const ts = createRequire(import.meta.url)('/tmp/hapsland-quality-scorer/node_modules/typescript');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const options = { strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,skipLibCheck:true,types:[] };
function programFor(dir, probe='') {
  const file=path.join(dir,'__independent_probe.ts'),host=ts.createCompilerHost(options);
  const read=host.readFile.bind(host),exists=host.fileExists.bind(host);
  host.readFile=p=>p===file?probe:read(p);host.fileExists=p=>p===file||exists(p);
  return ts.createProgram([path.join(dir,'subject.ts'),file],options,host);
}
const errors = p => ts.getPreEmitDiagnostics(p).filter(d=>d.category===ts.DiagnosticCategory.Error);
// The oracle contracts are frozen separately from actor prompts and source files.
function contract(fixture,branches,checker) {
  const manual={manual:'Requires predeclared blinded semantic/manual adjudication. Arbitrary case tags, nominal constructors, DI and Effect return requirements cannot be established by assignment witnesses alone; no automated repair credit.'};
  if(['r1_inferred_case','r8_name_claims_resource','r9_body_reaches_undeclared'].includes(fixture.ruleId)&&fixture.gold||['r8_name_claims_resource','r9_body_reaches_undeclared'].includes(fixture.ruleId)||fixture.id==='account-project-identities') return manual;
  const has=k=>branches.some(b=>checker.getPropertyOfType(b,k));
  const values={
    'cache-retention':has('cache')?[[{cache:{enabled:false}},true],[{cache:{enabled:true,retainMinutes:5}},true],[{cache:{enabled:true,retainMinutes:30}},true],[{cache:{enabled:false,retainMinutes:30}},false]]:[[{cacheEnabled:true,retainMinutes:5},true],[{cacheEnabled:true,retainMinutes:30},true],[{cacheEnabled:false,retainMinutes:30},false]],
    'document-signature':has('document')?[[{document:{state:'draft'}},true],[{document:{state:'signed',certificate:'alice'}},true],[{document:{state:'signed',certificate:'bob'}},true],[{document:{state:'draft',certificate:'alice'}},false],[{document:{state:'signed'}},false]]:[[{state:'draft'},true],[{state:'signed',certificate:'alice'},true],[{state:'signed',certificate:'bob'},true],[{state:'draft',certificate:'alice'},false],[{state:'signed'},false]],
    'color-channels':has('color')?[[{},true],[{color:{red:0,green:1,blue:2}},true],[{color:{red:255}},false]]:[[{},true],[{red:0,green:1,blue:2},true],[{red:255},false],[{green:1,blue:2},false]],
    'calibration-pair':has('calibration')?[[{},true],[{calibration:{raw:19.4,reference:20}},true],[{calibration:{reference:20}},false]]:[[{},true],[{raw:19.4,reference:20},true],[{reference:20},false],[{raw:19.4},false]],
    'muted-topics':[[{mutedTopics:[]},true],[{mutedTopics:['sports']},true],[{},false]],
    'required-recipients':[[{recipients:['alice']},true],[{recipients:['alice','bob']},true],[{recipients:[]},false]],
    'seat-class':[[{seatClass:'standard'},true],[{seatClass:'accessible'},true],[{seatClass:'banana'},false]],
    'worker-count':[[{workerCount:1},true],[{workerCount:2},true],[{workerCount:4},true],[{workerCount:-1.5},false],[{workerCount:0},false]],
    'clean-profile-attributes':[[{},true],[{biography:'writer'},true],[{pronouns:'they/them'},true],[{biography:'writer',pronouns:'they/them'},true]],
    'clean-independent-measurements':[[{},true],[{temperatureCelsius:21},true],[{humidityPercent:50},true],[{temperatureCelsius:21,humidityPercent:50},true]],
    'clean-free-form-description':[[{description:''},true],[{description:'anything'},true],[{description:'anything',note:'any text'},true]],
    'clean-cache-variant':[[{cache:{enabled:false}},true],[{cache:{enabled:true,retainMinutes:5}},true],[{cache:{enabled:true,retainMinutes:30}},true]],
    'clean-worker-count':[[{workerCount:1},true],[{workerCount:2},true],[{workerCount:4},true]],
    'clean-known-empty-set':[[{mutedTopics:[]},true],[{mutedTopics:['sports']},true]],
    'http-endpoint':[[{endpointUrl:'http://example.invalid'},true],[{endpointUrl:'https://example.invalid/api'},true],[{endpointUrl:'ask someone'},false]],
  };
  const probes=[];
  if(values[fixture.id]) for(const [value,accepted] of values[fixture.id]) {
    // Preserve mutable tuple/array semantics, while retaining literal scalar types.
    const fields=Object.entries({displayLabel:'demo',...value,...(!fixture.gold&&['clean-cache-variant','clean-worker-count','clean-known-empty-set'].includes(fixture.id)?{note:'independent note'}:{})}).map(([k,v])=>`${k}: ${JSON.stringify(v)}${Array.isArray(v)?' as '+(v.length?'[string, ...string[]]':'[]'):' as const'}`).join(', ');
    probes.push({label:JSON.stringify(value),accepted,code:`import type { CaseState } from "./subject.js"; const witness = {${fields}}; const checked: CaseState = witness;`});
  } else if(!fixture.gold) for(const [index,value] of [fixture.probe.validWitnesses,...(fixture.probe.invalidWitness?[fixture.probe.invalidWitness]:[])].flat().entries()) probes.push({label:`independent-valid-${index}`,accepted:true,code:`import type { CaseState } from "./subject.js"; const witness = ${value.replace(/\blabel:/g,'displayLabel:')}; const checked: CaseState = witness;`});
  return {probes};
}
function publicShape(fixture,branches,checker) {
  const has=k=>branches.some(b=>checker.getPropertyOfType(b,k));
  const obligations={
    'cache-retention':has('cache')?['cache.enabled','cache.retainMinutes']:['cacheEnabled','retainMinutes'],
    'document-signature':has('document')?['document.state','document.certificate']:['state','certificate'],
    'color-channels':has('color')?['color.red','color.green','color.blue']:['red','green','blue'],
    'calibration-pair':has('calibration')?['calibration.raw','calibration.reference']:['raw','reference'],
    'muted-topics':['mutedTopics'],'required-recipients':['recipients'],'seat-class':['seatClass'],
    'worker-count':['workerCount'],'http-endpoint':['endpointUrl'],
    'clean-profile-attributes':['biography','pronouns'],
    'clean-cache-variant':['cache.enabled','cache.retainMinutes','note'],
    'clean-independent-measurements':['temperatureCelsius','humidityPercent'],
    'clean-known-empty-set':['mutedTopics','note'],
    'clean-free-form-description':['description','note'],
    'clean-worker-count':['workerCount','note'],
  };
  function symbolsAt(parts,types=branches) {
    const symbols=types.flatMap(t=>{const u=checker.getNonNullableType(t);return (u.isUnion()?u.types:[u]).map(b=>checker.getPropertyOfType(b,parts[0])).filter(Boolean)});
    if(parts.length===1) return symbols;
    return symbolsAt(parts.slice(1),symbols.map(sym=>checker.getTypeOfSymbolAtLocation(sym,sym.valueDeclaration??sym.declarations[0])));
  }
  const checks=(obligations[fixture.id]??[]).map(key=>{
    const symbols=symbolsAt(key.split('.'));
    const optionalExpected=!fixture.gold&&['biography','pronouns','temperatureCelsius','humidityPercent','note'].includes(key);
    const expectedPrimitive=fixture.gold&&['color-channels','calibration-pair'].includes(fixture.id)?'number':!fixture.gold&&['biography','pronouns','description','note'].includes(key)?'string':!fixture.gold&&['temperatureCelsius','humidityPercent'].includes(key)?'number':!fixture.gold&&key==='mutedTopics'?'string[]':null;
    const typePreserved=!expectedPrimitive||symbols.every(sym=>checker.typeToString(checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(sym,sym.valueDeclaration??sym.declarations[0])))===expectedPrimitive);
    return {path:key,present:symbols.length>0,optionalExpected:!fixture.gold?optionalExpected:null,optional:symbols.length>0&&symbols.every(sym=>!!(sym.flags&ts.SymbolFlags.Optional)),typePreserved,passed:symbols.length>0&&typePreserved&&(fixture.gold||optionalExpected===symbols.every(sym=>!!(sym.flags&ts.SymbolFlags.Optional)))};
  });
  const requiredRoots=obligations[fixture.id]?.map(key=>key.split('.')[0]).filter(key=>!['color','calibration','red','green','blue','raw','reference','biography','pronouns','temperatureCelsius','humidityPercent','note'].includes(key))??[];
  // State-bearing roots must remain required; optional component grouping may vary.
  for(const key of new Set(requiredRoots)) {
    const required=branches.length>0&&branches.every(b=>{const sym=checker.getPropertyOfType(b,key);return sym&&!(sym.flags&ts.SymbolFlags.Optional)});
    // A retention field is intentionally absent on the disabled branch in a flat discriminated repair.
    if(fixture.id==='muted-topics') continue;
    if(key==='retainMinutes'&&fixture.id==='cache-retention'||key==='certificate'&&fixture.id==='document-signature') continue;
    checks.push({path:key,requiredExpected:true,passed:required});
  }
  return {known:checks.every(c=>c.passed),checks};
}
export async function score(dir,blindId) {
  const {cases}=await import('./abide-rule-coverage-fixtures.mjs');
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'task.json'))), fixture=cases.find(c=>meta.caseId!==undefined?c.id===meta.caseId:meta.id===`coverage-${c.id}`);
  assert(fixture,'Unknown anonymous case');
  const p=programFor(dir),es=errors(p),checks=[];
  const checker=p.getTypeChecker(),sf=p.getSourceFile(path.join(dir,'subject.ts')),mod=checker.getSymbolAtLocation(sf);
  const exports=mod?checker.getExportsOfModule(mod):[];
  const state=exports.find(s=>s.name==='CaseState');
  const t=state&&checker.getDeclaredTypeOfSymbol(state),branches=t?(t.isUnion()?t.types:[t]):[];
  const callable=exports.find(s=>s.name==='CaseState'&&(s.flags&ts.SymbolFlags.Function));
  const callableRename=callable&&checker.getTypeOfSymbolAtLocation(callable,sf).getCallSignatures().every(sig=>sig.parameters.some(s=>s.name==='displayLabel')&&!sig.parameters.some(s=>s.name==='label'));
  const renamed=callableRename||branches.length>0&&branches.every(b=>{const s=checker.getPropertyOfType(b,'displayLabel');return s&&!(s.flags&ts.SymbolFlags.Optional)&&!checker.getPropertyOfType(b,'label')});
  const oracle=contract(fixture,branches,checker),shape=publicShape(fixture,branches,checker);
  let status='unassessed',validFailures=0,invalidAccepted=0;
  if(!es.length&&renamed&&shape.known&&oracle?.probes?.length) {
    for(const probe of oracle.probes) {
      const diagnostics=errors(programFor(dir,probe.code)),accepted=diagnostics.length===0;
      const structuralError=diagnostics.some(d=>[2307,2305,2304,2694].includes(d.code));
      checks.push({label:probe.label,expected:probe.accepted,accepted,passed:accepted===probe.accepted&&!structuralError,structuralError,diagnosticCodes:[...new Set(diagnostics.map(d=>d.code))]});
      if(probe.accepted&&!accepted)validFailures++;
      if(!probe.accepted&&accepted)invalidAccepted++;
    }
    const missingShape=checks.some(c=>c.structuralError);
    status=missingShape?'unassessed':validFailures?(fixture.gold?'unassessed':'new-domain-restriction'):fixture.gold?(invalidAccepted?'remaining':'repaired'):'clean-preserved';
  } else if(!es.length&&renamed&&oracle?.manual) status='manual-adjudication-required';
  return {blindId,caseId:fixture.id,ruleId:fixture.ruleId,sourceDigest:hash(fs.readFileSync(path.join(dir,'subject.ts'))),supportingDigest:hash(fs.existsSync(path.join(dir,'support.ts'))?fs.readFileSync(path.join(dir,'support.ts')):''),compiles:!es.length,presentationRename:renamed,publicShape:shape,underlyingGold:fixture.gold,status,validFailures,invalidAccepted,checks,limitations:oracle?.manual??'Finite semantic assignment witnesses; unknown exports/shapes are unassessed. Rejected valid cases never receive repair credit. No reviewer wording or superficial source-string credit.'};
}
const arg=name=>process.argv.find(x=>x.startsWith(name+'='))?.slice(name.length+1);
if(process.argv.includes('--score')) {
  const root=path.resolve(arg('--blind-root')),output=path.resolve(arg('--output')),expected=Number(arg('--expected-count')??24);
  const dirs=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
  assert.equal(dirs.length,expected,'Refuse partial scoring');assert(!fs.existsSync(output),'Never overwrite frozen scores');
  const scores=[];for(const id of dirs)scores.push(await score(path.join(root,id),id));
  fs.writeFileSync(output,JSON.stringify({version:1,blinded:true,scorerDigest:hash(fs.readFileSync(import.meta.filename)),fixtureDigest:hash(fs.readFileSync(new URL('./abide-rule-coverage-fixtures.mjs',import.meta.url))),typescriptVersion:ts.version,scores},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({scored:scores.length,output}));
} else if(process.argv.includes('--self-check')) {
  const {cases}=await import('./abide-rule-coverage-fixtures.mjs'),dir=fs.mkdtempSync(path.join(tmpdir(),'coverage-oracle-'));let assertions=0;
  try {
    for(const fixture of cases) {
      fs.writeFileSync(path.join(dir,'support.ts'),fixture.support['support.ts']??'');fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify({caseId:fixture.id}));
      fs.writeFileSync(path.join(dir,'subject.ts'),fixture.after.replace(/\blabel\b/g,'displayLabel'));
      const initial=await score(dir,'initial');
      assert.equal(initial.status,['r1_inferred_case','r6_bare_domain_value','r8_name_claims_resource','r9_body_reaches_undeclared'].includes(fixture.ruleId)&&fixture.gold&&fixture.id!=='seat-class'?'manual-adjudication-required':fixture.ruleId==='r8_name_claims_resource'||fixture.ruleId==='r9_body_reaches_undeclared'?'manual-adjudication-required':fixture.gold?'remaining':'clean-preserved',fixture.id);assertions++;
      if(fixture.gold&&initial.status==='remaining') {
        fs.writeFileSync(path.join(dir,'subject.ts'),fixture.before.replace(/\blabel\b/g,'displayLabel').replace('{ enabled: false }','{ enabled: false; retainMinutes?: never }').replace('{ state: "draft" }','{ state: "draft"; certificate?: never }'));
        assert.equal((await score(dir,'repaired')).status,'repaired',fixture.id);assertions++;
        const repaired=fs.readFileSync(path.join(dir,'subject.ts'),'utf8');
        fs.writeFileSync(path.join(dir,'subject.ts'),repaired.replace('displayLabel: string','displayLabel: never'));
        assert.equal((await score(dir,'domain-destroyed')).status,'unassessed',fixture.id);assertions++;
      }
      if(!fixture.gold&&initial.status==='clean-preserved') {
        const key={'clean-profile-attributes':'pronouns','clean-cache-variant':'note','clean-independent-measurements':'humidityPercent','clean-known-empty-set':'note','clean-free-form-description':'note','clean-worker-count':'note'}[fixture.id];
        const source=fixture.after.replace(/\blabel\b/g,'displayLabel');
        const deleted=source.replace(new RegExp('^\\s+'+key+'\\??:[^\\n]+\\n','m'),'');
        assert.notEqual(deleted,source,'Deletion mutant must change source');
        fs.writeFileSync(path.join(dir,'subject.ts'),deleted);
        assert.equal((await score(dir,'independent-fact-deleted')).status,'unassessed',fixture.id);assertions++;
      }
      if(initial.status!=='manual-adjudication-required') {
        fs.writeFileSync(path.join(dir,'subject.ts'),'export interface CaseState { displayLabel: string }');
        assert.equal((await score(dir,'all-facts-deleted')).status,'unassessed',fixture.id);assertions++;
      }
    }
    const cleanWorker=cases.find(c=>c.id==='clean-worker-count');
    fs.writeFileSync(path.join(dir,'support.ts'),cleanWorker.support['support.ts']??'');
    fs.writeFileSync(path.join(dir,'subject.ts'),cleanWorker.after.replace(/\blabel\b/g,'displayLabel'));
    fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify({id:'coverage-clean-worker-count',filename:'subject.ts',probe:{requireExport:'CaseState'}}));
    const actualTaskFormat=await score(dir,'exact-clean-worker-task');
    assert.equal(actualTaskFormat.caseId,'clean-worker-count');assertions++;
    assert.equal(actualTaskFormat.underlyingGold,false);assertions++;
    assert.equal(actualTaskFormat.status,'clean-preserved');assertions++;
    fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify({id:'arbitrary-prefix-clean-worker-count'}));
    await assert.rejects(()=>score(dir,'ambiguous-task'),/Unknown anonymous case/);assertions++;
    console.log(JSON.stringify({selfCheckPassed:true,assertions,typescriptVersion:ts.version,manualCases:cases.filter(c=>(c.ruleId==='r1_inferred_case'&&c.gold)||['r8_name_claims_resource','r9_body_reaches_undeclared'].includes(c.ruleId)||c.id==='account-project-identities').map(c=>c.id)}));
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
}
