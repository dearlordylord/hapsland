import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { cases } from '../../../../../scripts/abide-large-declaration-fixtures.mjs';
const ts = createRequire(import.meta.url)('/tmp/hapsland-quality-scorer/node_modules/typescript');
const root = path.resolve('evidence/abide-large-declarations-current');
const dir = path.join(root, 'attachment-manifest/native');
const dest = path.join(root, 'manual/probes/attachment-manifest');
const digest = x => crypto.createHash('sha256').update(x).digest('hex');
const scores = JSON.parse(fs.readFileSync(path.join(dir,'blind-scores.json'),'utf8')).scores;
const opts = { strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,skipLibCheck:true,types:[] };
const base = {displayLabel:'Documents',subject:'Monthly update',bodyText:'Contents',tags:['operations'],category:'internal',locale:'en',showPreview:true,layout:'compact',showSender:false,footerText:'End',description:'Shared attachments'};
function program(sourceDir, file, text){
 const host=ts.createCompilerHost(opts),oldRead=host.readFile.bind(host),oldExists=host.fileExists.bind(host);
 host.readFile=p=>p===file?text:oldRead(p);host.fileExists=p=>p===file||oldExists(p);
 return ts.createProgram([path.join(sourceDir,'subject.ts'),file],opts,host);
}
let probeCount=0;const rows=[];
for(const score of scores){
 const sourceDir=path.join(dir,'blind',score.blindId),src=fs.readFileSync(path.join(sourceDir,'subject.ts'),'utf8');
 assert.equal(digest(src),score.sourceDigest);assert.equal(digest(fs.existsSync(path.join(sourceDir,'support.ts'))?fs.readFileSync(path.join(sourceDir,'support.ts')):''),score.supportingDigest);
 const fixture=cases.find(c=>c.id===score.caseId);assert(fixture?.candidateId==='attachment-manifest');
 const sf=ts.createSourceFile('original.ts',fixture.after,ts.ScriptTarget.ES2022,true);
 const original=sf.statements.find(ts.isInterfaceDeclaration);
 const fields=original.members.filter(m=>m.name.getText(sf)!=='attachmentCount');
 const expectations=fields.map(m=>m.getText(sf)).join('\n');
 const sourceAst=ts.createSourceFile('subject.ts',src,ts.ScriptTarget.ES2022,true);
 assert(sourceAst.statements.every(s=>ts.isInterfaceDeclaration(s)), 'Unknown actual code requires source review before execution');
 const decl=sourceAst.statements.find(s=>ts.isInterfaceDeclaration(s)&&s.name.text==='CaseState');assert(decl);
 const hasCount=decl.members.some(m=>m.name.getText(sourceAst)==='attachmentCount');
 const per=path.join(dest,score.blindId);fs.mkdirSync(per,{recursive:true});const checks=[];
 function probe(label,body,expectedAccepted=true,expectedLength=null){
  const virtual=path.join(sourceDir,'__manual_probe.ts');const text='import type { CaseState } from "./subject";\n'+body;
  const ds=ts.getPreEmitDiagnostics(program(sourceDir,virtual,text)).filter(d=>d.category===ts.DiagnosticCategory.Error);
  const accepted=!ds.length;const outfile=path.join(per,label+'.ts');
  fs.writeFileSync(outfile,text.replace('./subject',path.relative(per,path.join(sourceDir,'subject')).split(path.sep).join('/')));
  const check={label,expectedAccepted,accepted,passed:accepted===expectedAccepted,diagnosticCodes:[...new Set(ds.map(d=>d.code))],probe:path.relative(root,outfile),typescriptVersion:ts.version};
  if(expectedLength!==null&&accepted){
   const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
   const context={exports:{}};vm.runInNewContext(js,context,{timeout:1000});
   check.observedAttachmentLength=context.exports.actualLength;check.expectedAttachmentLength=expectedLength;check.passed&&=context.exports.actualLength===expectedLength;
   check.executionScope='Independent badge-length computation over accepted public attachments; no product implementation or I/O executed.';
  }
  checks.push(check);probeCount++;return check;
 }
 probe('all-independent-fields',`type Expected = {\n${expectations}\n};\ndeclare const actual: CaseState;\nconst forward: Expected = actual;\ndeclare const expected: Expected;\nconst backward: Pick<CaseState, keyof Expected> = expected;\n`);
 const relevantBase=Object.fromEntries(fields.filter(m=>m.name.getText(sf)!=='attachments').map(m=>[m.name.getText(sf),base[m.name.getText(sf)]]));
 const attachmentSets=[[],[{filename:'report.pdf',mediaType:'application/pdf'}],[{filename:'unusual 🧾.pdf',mediaType:'application/pdf'},{filename:'diagram.png',mediaType:'image/png'}]];
 for(let n=0;n<3;n++){
  const value={...relevantBase,attachments:attachmentSets[n],...(hasCount?{attachmentCount:n}:{})};
  probe('valid-'+n,`const value = ${JSON.stringify(value)} as const;\nconst state: CaseState = value;\nexport const actualLength = state.attachments.length;\n`,true,n);
 }
 if(hasCount)for(const [n,count] of [[0,2],[1,0]]){
  const value={...relevantBase,attachments:attachmentSets[n],attachmentCount:count};
  probe('contradiction-'+n,`const value = ${JSON.stringify(value)} as const;\nconst state: CaseState = value;\n`,true);
 }
 let status;
 if(!score.compiles||!score.presentationRename)status='unassessed';
 else if(checks.some(c=>!c.passed))status=fixture.gold?'unassessed':'new-domain-restriction';
 else status=hasCount?(fixture.gold?'remaining':'new-domain-restriction'):(fixture.gold?'repaired':'clean-preserved');
 rows.push({blindId:score.blindId,caseId:score.caseId,sourceDigest:score.sourceDigest,supportingDigest:score.supportingDigest,status,
 rationale:hasCount?'A separately settable numeric attachmentCount remains. Both empty attachments with count two and one attachment with count zero are accepted, so the same fact can contradict itself. All independent fields and valid attachment examples remain available.':'Attachments retain arbitrary filenames and both media types; the redundant count is absent. The actual array length remains available and yields zero, one and two for independent accepted examples. Every original independent field is required with its original admitted type, and the presentation rename is present.',
 sourceClass:'RUN',verificationState:'RUNTIME-TESTED',checks,
 limitations:'Finite public-contract compiler witnesses plus independent array-length execution and source inspection. No actual application badge renderer exists in these interface-only fixtures; runtime probes establish derivation availability, not UI rendering behavior.'});
}
const output={version:1,blinded:true,rows};const outfile=path.join(root,'manual/attachment-manifest.json');fs.writeFileSync(outfile,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({rows:rows.length,probeCount,statuses:rows.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{})}));
