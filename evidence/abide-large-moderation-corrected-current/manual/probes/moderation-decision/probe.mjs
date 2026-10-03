// Blinded semantic probe. Run only after inspecting every approved source.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const ts=createRequire(import.meta.url)('/tmp/hapsland-quality-scorer/node_modules/typescript');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const directory=path.dirname(import.meta.filename);
const native=path.resolve(directory,'../../../moderation-decision/native');
const approvals=JSON.parse(fs.readFileSync(path.join(directory,'inspected.json')));
const scores=JSON.parse(fs.readFileSync(path.join(native,'blind-scores.json'))).scores;
assert.equal(scores.length,12); assert.equal(approvals.rows.length,12);
const compilerOptions={strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,skipLibCheck:true,types:[]};
const inputs=[
 {rawText:'  Hello  ',blockedTerms:[],maximumLength:20,status:'accepted'},
 {rawText:'   ',blockedTerms:[''],maximumLength:0,status:'empty'},
 {rawText:' BAD ',blockedTerms:['bad'],maximumLength:20,status:'blocked'},
 {rawText:' BAD ',blockedTerms:['bad'],maximumLength:2,status:'too-long'},
 {rawText:'abc',blockedTerms:[],maximumLength:3,status:'accepted'},
 {rawText:'abcd',blockedTerms:['a'],maximumLength:3,status:'too-long'},
 {rawText:'  ZaY  ',blockedTerms:['zAy'],maximumLength:20,status:'blocked'},
 {rawText:'other foo',blockedTerms:['FOO'],maximumLength:20,status:'blocked'},
 {rawText:'untouched',blockedTerms:['ZZ'],maximumLength:20,status:'accepted'},
 {rawText:'',blockedTerms:[],maximumLength:0,status:'empty'},
 {rawText:'  Grüße  ',blockedTerms:['GRÜ'],maximumLength:20,status:'blocked'},
 {rawText:' abc ',blockedTerms:[],maximumLength:3,status:'accepted'},
 {rawText:'   ',blockedTerms:[''],maximumLength:-1,status:'empty'},
];
const results=[];
for(const score of scores){
 const approval=approvals.rows.find(x=>x.blindId===score.blindId); assert(approval);
 const dir=path.join(native,'blind',score.blindId),source=fs.readFileSync(path.join(dir,'subject.ts'),'utf8'),support=fs.readFileSync(path.join(dir,'support.ts'),'utf8');
 assert.equal(hash(source),score.sourceDigest);assert.equal(hash(support),score.supportingDigest);
 assert.equal(approval.sourceDigest,score.sourceDigest);assert.equal(approval.supportingDigest,score.supportingDigest);
 if(approval.safeToExecute!==true){
  results.push({blindId:score.blindId,caseId:score.caseId,sourceDigest:score.sourceDigest,supportingDigest:score.supportingDigest,skipped:true,reason:approval.reason??'Unrecognized or uninspected runtime shape; no execution or repair credit',cases:[]});
  continue;
 }
 const typeProbe=`import { CaseState } from "./subject.js";
type FrozenInput = { submissionId:string; rawText:string; blockedTerms:readonly string[]; maximumLength:number };
type FrozenDecision = { description:string; submissionId:string; normalizedText:string; status:"empty"|"too-long"|"blocked"|"accepted" };
declare const input:FrozenInput; declare const label:string;
declare const writer:{append:(entry:string)=>void}; declare const callback:(entry:string)=>void;
const output:FrozenDecision = CaseState(label,input${approval.explicitDependency?', '+(approval.argumentShape==='callback'?'callback':'writer'):''});`;
 const probeFile=path.join(dir,'__independent_contract_probe.ts'),host=ts.createCompilerHost(compilerOptions);
 const read=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.readFile=p=>p===probeFile?typeProbe:read(p);host.fileExists=p=>p===probeFile||exists(p);
 const program=ts.createProgram([path.join(dir,'subject.ts'),probeFile],compilerOptions,host);
 const compilerErrors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
 fs.writeFileSync(path.join(directory,score.blindId+'.ts'),typeProbe+'\n',{flag:'wx'});
 const transpile=x=>ts.transpileModule(x,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const supportModule={exports:{}},subjectModule={exports:{}};
 const context=vm.createContext({supportModule,subjectModule},{codeGeneration:{strings:false,wasm:false}});
 new vm.Script(`(function(exports,module){${transpile(support)}\n})(supportModule.exports,supportModule);`).runInContext(context,{timeout:1000});
 const requireModule=name=>{assert(['./support','./support.js'].includes(name),'External imports denied');return supportModule.exports;};
 context.requireModule=requireModule;
 new vm.Script(`(function(exports,module,require){${transpile(source)}\n})(subjectModule.exports,subjectModule,requireModule);`).runInContext(context,{timeout:1000});
 const cases=[];
 for(let pass=0;pass<2;pass++)for(const [index,test] of inputs.entries()){
  const input={submissionId:`submission-${pass}-${index}`,rawText:test.rawText,blockedTerms:test.blockedTerms,maximumLength:test.maximumLength};
  const label=`  Decision ${pass}-${index}  `,expected={description:label.trim(),submissionId:input.submissionId,normalizedText:input.rawText.trim(),status:test.status};
  context.input=input;context.label=label;context.spyEntries=[];
  if(Array.isArray(supportModule.exports.auditEntries))supportModule.exports.auditEntries.length=0;
  context.callback=entry=>context.spyEntries.push(entry);
  context.writer={append:context.callback};
  const args=approval.argumentShape==='callback'?'label,input,callback':'label,input,writer';
  let error=null;
  try{new vm.Script(`result=subjectModule.exports.CaseState(${args});`).runInContext(context,{timeout:1000});}catch(e){error=String(e.message);}
  const serialized=error?undefined:JSON.stringify(context.result);
  const result=serialized===undefined?null:JSON.parse(serialized);
  const fieldsPreserved=!error&&Object.entries(expected).every(([key,value])=>result?.[key]===value);
  const expectedAudit=`${input.submissionId}:${test.status}:${input.rawText}`;
  const spyEntries=[...context.spyEntries],hiddenEntries=Array.isArray(supportModule.exports.auditEntries)?[...supportModule.exports.auditEntries]:[];
  const allEntries=[...spyEntries,...hiddenEntries];
  cases.push({label:`sample-${index}-writer-${pass}`,input,expected,result,error,fieldsPreserved,
   expectedAudit,spyEntries,hiddenEntries,auditPreserved:allEntries.length===1&&allEntries[0]===expectedAudit,
   explicitWriterUsed:spyEntries.length===1&&spyEntries[0]===expectedAudit&&hiddenEntries.length===0});
 }
 results.push({blindId:score.blindId,caseId:score.caseId,sourceDigest:score.sourceDigest,supportingDigest:score.supportingDigest,
  compilerContractPassed:compilerErrors.length===0,compilerDiagnosticCodes:[...new Set(compilerErrors.map(d=>d.code))],
  cases,allFieldsPreserved:cases.every(x=>x.fieldsPreserved),allAuditsPreserved:cases.every(x=>x.auditPreserved),explicitWriterUsed:cases.every(x=>x.explicitWriterUsed)});
}
fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify({version:1,blinded:true,typescriptVersion:ts.version,artifactCount:results.length,invocations:results.reduce((n,r)=>n+r.cases.length,0),results},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({artifacts:results.length,invocations:results.reduce((n,r)=>n+r.cases.length,0)}));
