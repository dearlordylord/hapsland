import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync, statSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const LIMIT = 16 * 1024 * 1024;
const digest = value => createHash("sha256").update(value).digest("hex");
const hash = file => digest(readFileSync(file));
const within = (directory,file) => {
  const path=relative(directory,file);
  return path==="" || (path!==".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};
const variants = file => extname(file) ? [file] : [file,`${file}.bend`,join(file,"index.bend")];
function bendImports(file,source) {
  return source.toString("utf8").split(/\r?\n/).flatMap((line,index)=>{
    if(!/^\s*import\b/.test(line))return[];
    const match=/^\s*import\s+(?:"([^"]+)"|'([^']+)'|([^\s#]+))(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*(?:#.*)?$/.exec(line);
    if(!match)throw new Error(`unresolvable Bend import syntax at ${file}:${index+1}`);
    return[{specifier:match[1]??match[2]??match[3],line:index+1}];
  });
}
function resolveBendImport(specifier,importer,line,root,bendRoot,bendDirectory) {
  let candidates;
  if(specifier==="Base")candidates=[join(bendDirectory,"base.bend")];
  else if(isAbsolute(specifier)) {
    const target=resolve(specifier);
    if(!within(root,target)&&!within(bendRoot,target))throw new Error(`Bend import escapes source roots at ${importer}:${line}: ${specifier}`);
    candidates=variants(target);
  } else if(specifier.startsWith("./")||specifier.startsWith("../")) {
    const target=resolve(dirname(importer),specifier);
    const allowed=within(bendRoot,importer)?bendRoot:root;
    if(!within(allowed,target))throw new Error(`Bend import escapes source root at ${importer}:${line}: ${specifier}`);
    candidates=variants(target);
  } else {
    candidates=[...variants(resolve(dirname(importer),specifier)),...variants(resolve(root,specifier)),...variants(resolve(bendRoot,specifier))];
  }
  const found=new Set();
  for(const candidate of candidates){
    try{
      const file=realpathSync(candidate);
      if(!statSync(file).isFile())continue;
      if(!within(root,file)&&!within(bendRoot,file))throw new Error(`Bend import escapes source roots at ${importer}:${line}: ${specifier}`);
      found.add(file);
    }catch(error){if(error.code!=="ENOENT"&&error.code!=="ENOTDIR")throw error;}
  }
  if(found.size!==1)throw new Error(`${found.size?"ambiguous":"unresolvable"} Bend import at ${importer}:${line}: ${specifier}`);
  return [...found][0];
}
function bendSourceClosure(fixture,root,bendRoot,bendDirectory) {
  const sources=new Map();
  const visit=(candidate,importer="game fixture",specifier="fixture")=>{
    let file;
    try{file=realpathSync(candidate);}catch(error){throw new Error(`unresolvable Bend source ${specifier} from ${importer}: ${candidate}`,{cause:error});}
    if(!within(root,file)&&!within(bendRoot,file))throw new Error(`Bend source escapes source roots: ${file}`);
    if(sources.has(file))return;
    let source;
    try{source=readFileSync(file);}catch(error){throw new Error(`unreadable Bend source ${specifier} from ${importer}: ${file}`,{cause:error});}
    sources.set(file,{file,expected:digest(source)});
    for(const entry of bendImports(file,source))
      visit(resolveBendImport(entry.specifier,file,entry.line,root,bendRoot,bendDirectory),file,entry.specifier);
  };
  visit(fixture);
  return [...sources.values()];
}
function bendSourceLayout(executable) {
  const file=realpathSync(executable), binDirectory=dirname(file);
  if(basename(binDirectory)!=="bin")throw new Error(`unsupported Bend compiler source layout: ${file}`);
  const root=realpathSync(resolve(binDirectory,".."));
  let directory,base,effects;
  try{
    directory=realpathSync(join(root,"bend2"));
    base=realpathSync(join(directory,"base.bend"));
    effects=realpathSync(join(directory,"effs"));
  }catch(error){
    throw new Error(`unsupported Bend compiler source layout for ${file}: expected ${join(root,"bend2")}/base.bend and effs`,{cause:error});
  }
  if(!within(root,directory)||!statSync(directory).isDirectory()||!within(directory,base)||!statSync(base).isFile()||!within(directory,effects)||!statSync(effects).isDirectory())
    throw new Error(`unsupported Bend compiler Base/effects source layout for ${file}: ${directory}`);
  return {root,directory};
}
function sourceRecords(fixture,ownerSources,root,bendRoot,bendDirectory) {
  const sources=new Map();
  const add=(candidate,expected,label,projectOnly=false)=>{
    let file;
    try{file=realpathSync(candidate);}catch(error){throw new Error(`missing ${label}: ${candidate}`,{cause:error});}
    if(!within(root,file)&&(!within(bendRoot,file)||projectOnly))throw new Error(`${label} is outside its source root: ${file}`);
    const actual=hash(file);
    if(expected!==undefined&&actual!==expected)throw new Error(`game source changed: ${file}`);
    const prior=sources.get(file);
    if(prior&&prior.expected!==actual)throw new Error(`conflicting game source hashes: ${file}`);
    sources.set(file,{file,expected:prior?.expected??expected??actual});
  };
  for(const owner of ownerSources){
    if(typeof owner.path!=="string"||typeof owner.sha256!=="string")throw new Error("invalid game codec owner source");
    add(resolve(root,owner.path),owner.sha256,"game codec owner source",true);
  }
  for(const source of bendSourceClosure(fixture,root,bendRoot,bendDirectory))add(source.file,source.expected,"Bend import source");
  return [...sources.values()];
}
// A zero C phase cap is available only inside the maintained finite supervisor.
function ownedDeadline(deadline,root) {
  if(deadline===undefined)return null;
  if(!Number.isSafeInteger(deadline)||deadline<=Date.now()||deadline>Date.now()+380000)
    throw new Error("Invalid game overall deadline");
  // createRun validates the parent once. Here check only its factual handoff:
  // runStage supplies these coordinates and its narrowed absolute deadline.
  const supervisor=JSON.parse(process.env.HAPSLAND_GAME_SUPERVISOR_CONTEXT??"null");
  const stage=JSON.parse(process.env.HAPSLAND_CHECK_CONTEXT??"null");
  if(!supervisor||!stage||supervisor.root!==root||stage.root!==root||
      !["id","pid","token"].every(key=>supervisor[key]===stage[key])||
      ! /^[a-zA-Z0-9_-]+$/.test(stage.id)||typeof stage.token!=="string"||!stage.token||
      !Number.isSafeInteger(supervisor.deadline)||deadline>supervisor.deadline||stage.deadline!==deadline)
    throw new Error("Missing finite game supervisor handoff");
  return deadline;
}
function phaseAllowance(cap,deadline) {
  if(deadline===null)return cap;
  const remaining=deadline-Date.now();
  if(remaining<=0)throw new Error("Game overall deadline exhausted");
  return cap===0?remaining:Math.min(cap,remaining);
}
function checked(command, args, timeout) {
  const result = spawnSync(command,args,{encoding:"utf8",timeout,killSignal:"SIGKILL",maxBuffer:LIMIT,
    env:{...process.env,BEND_NO_TELEMETRY:"1"}});
  if(result.error || result.status !== 0) throw new Error(`${command}: ${result.error?.code ?? result.status}: ${result.stderr}`);
  return result.stdout;
}
export function streamGameBatches(command,args,directory,label,executionTimeoutMs,supervised=false) {
  return new Promise((accept,reject)=>{
    const child=spawn(command,args,{detached:!supervised,stdio:["ignore","pipe","pipe"],env:{...process.env,BEND_NO_TELEMETRY:"1"}});
    let pending=[],pendingBytes=0,stderr="",failure,totalBytes=0;const files=[];const started=performance.now();
    const stop=error=>{if(!failure){failure=error;try{if(supervised)child.kill("SIGKILL");else process.kill(-child.pid,"SIGKILL");}catch(error){if(error.code!=="ESRCH")failure=error;}}};
    const timer=setTimeout(()=>stop(new Error(`${label} execution exceeded ${executionTimeoutMs}ms`)),executionTimeoutMs);
    child.stdout.on("data",data=>{
      if(failure)return;
      let start=0;
      for(;;){const end=data.indexOf(10,start);if(end<0)break;
        const part=data.subarray(start,end);const length=pendingBytes+part.length;
        if(length>LIMIT){stop(new Error(`${label} batch exceeds 16MiB`));return;}
        const line=pendingBytes?Buffer.concat([...pending,part],length):part;
        pending=[];pendingBytes=0;start=end+1;
        try{if(!line.length)throw new Error("empty batch");JSON.parse(line.toString("utf8"));
          if(files.length>=145)throw new Error("unexpected extra game batch");
          const file=join(directory,`${label}-${files.length}.json`);writeFileSync(file,line);files.push(file);totalBytes+=line.length;
        }catch(error){stop(error);return;}}
      if(start<data.length){const part=data.subarray(start);pending.push(part);pendingBytes+=part.length;}
      if(pendingBytes>LIMIT)stop(new Error(`${label} batch exceeds 16MiB`));
    });
    child.stderr.on("data",data=>{stderr+=data.toString();if(Buffer.byteLength(stderr)>65536)stop(new Error(`${label} stderr bound`));});
    child.on("error",stop);
    child.on("close",code=>{clearTimeout(timer);if(failure){failure.message+=` (batches=${files.length}, bytes=${totalBytes}, pendingBytes=${pendingBytes}, elapsedMs=${Math.round(performance.now()-started)})`;reject(failure);}else if(code!==0)reject(new Error(`${label} exit ${code}: ${stderr}`));else if(pendingBytes||!files.length)reject(new Error(`${label} incomplete batch stream`));else accept(files);});
  });
}
// Failed scoped compiler output is diagnostic evidence, never an artifact cache.
function retainCompilerFailure(directory,fixture,phase,completed,sources,tools,timeouts,error) {
  const failureFile=process.env.HAPSLAND_TEST_FAILURES_FILE;
  if(!failureFile)return;
  const outputs=join(dirname(failureFile),"workload-outputs");mkdirSync(outputs,{recursive:true});
  const retained=mkdtempSync(join(outputs,`game-compiler-failure-${process.pid}-`));
  const source=join(directory,"game.c");let c=null;
  if(existsSync(source)){
    const bytes=readFileSync(source),path=join(retained,"game.c");writeFileSync(path,bytes);
    c={path,bytes:bytes.length,sha256:digest(bytes)};
  }
  let binary=null;
  const executable=join(directory,"game");
  if(completed.includes("clang compilation")&&existsSync(executable)){
    const bytes=readFileSync(executable),path=join(retained,"game"),mode=statSync(executable).mode&0o777;
    writeFileSync(path,bytes);chmodSync(path,mode);
    binary={path,bytes:bytes.length,sha256:digest(bytes),mode};
  }
  const receipt=join(retained,"receipt.json");
  writeFileSync(receipt,JSON.stringify({lane:"game-compiler-failure",fixture,phase,completed,sources,tools,timeouts,c,binary,
    failure:{name:error.name,message:error.message},
    purpose:"Captured offline compiler evidence; manual source/tool validation required before resume; no automatic reuse or acceptance"},null,2)+"\n");
  console.log(`Retained offline game compiler failure: ${receipt}`);
}
function resumeArtifact(artifact,executable=false) {
  if(!artifact||typeof artifact.path!=="string")throw new Error("Invalid game resume artifact");
  const bytes=readFileSync(artifact.path);
  if(bytes.length!==artifact.bytes||digest(bytes)!==artifact.sha256)throw new Error("Game resume artifact bytes changed");
  if(executable&&(!Number.isInteger(artifact.mode)||(artifact.mode&0o111)===0||(statSync(artifact.path).mode&0o777)!==artifact.mode))
    throw new Error("Game resume binary mode changed");
  return bytes;
}
function compilerReceipt(path,fixture,sources,tools) {
  const receipt=JSON.parse(readFileSync(path,"utf8"));
  if(receipt.lane!=="game-compiler-failure"||receipt.fixture!==fixture||!Array.isArray(receipt.completed)||!receipt.completed.includes("C emission"))
    throw new Error("Invalid game compiler resume receipt");
  if(!isDeepStrictEqual(receipt.sources,sources)||!isDeepStrictEqual(receipt.tools,tools))
    throw new Error("Game resume source/compiler identity changed");
  resumeArtifact(receipt.c);
  if(receipt.binary){
    if(!receipt.completed.includes("clang compilation"))throw new Error("Invalid game binary resume receipt");
    resumeArtifact(receipt.binary,true);
  }
  return receipt;
}
/** One fresh compiler artifact per backend; bounded individual lossless batches. */
export async function createGameStreams(fixture,ownerSources,{executionTimeoutMs=5000,emissionTimeoutMs=30000,clangTimeoutMs=30000,resumeCompilerReceipt,overallDeadlineMs}={}) {
  if(executionTimeoutMs!==5000 && executionTimeoutMs!==15000 && executionTimeoutMs!==30000 && executionTimeoutMs!==180000)throw new Error("unsupported finite game execution allowance");
  if(!Number.isSafeInteger(emissionTimeoutMs)||emissionTimeoutMs<0||emissionTimeoutMs>120000)throw new RangeError("invalid game C emission allowance");
  if(!Number.isSafeInteger(clangTimeoutMs)||clangTimeoutMs<=0||clangTimeoutMs>120000)throw new RangeError("invalid game clang allowance");
  if(resumeCompilerReceipt!==undefined&&(typeof resumeCompilerReceipt!=="string"||!resumeCompilerReceipt))throw new Error("Invalid game resume receipt path");
  const root=realpathSync(fileURLToPath(new URL("../../",import.meta.url)));
  const deadline=ownedDeadline(overallDeadlineMs,root);
  if(emissionTimeoutMs===0&&deadline===null)throw new Error("Zero game C allowance requires a finite owned overall deadline");
  const bendFile=realpathSync(checked("which",["bend"],phaseAllowance(5000,deadline)).trim());
  const bendLayout=bendSourceLayout(bendFile);
  const sources=sourceRecords(fileURLToPath(fixture),ownerSources,root,bendLayout.root,bendLayout.directory);
  const tools=[{file:bendFile,expected:hash(bendFile)}];
  const clangFile=realpathSync(checked("which",["clang"],phaseAllowance(5000,deadline)).trim());
  tools.push({file:clangFile,expected:hash(clangFile)});
  const verify=()=>{for(const source of [...sources,...tools])if(hash(source.file)!==source.expected)throw new Error(`game source/tool changed: ${source.file}`);};
  verify();
  const fixturePath=realpathSync(fileURLToPath(fixture));
  const resume=resumeCompilerReceipt===undefined?null:compilerReceipt(resumeCompilerReceipt,fixturePath,sources,tools);
  const directory=mkdtempSync(join(tmpdir(),"hapsland-game-stream-"));
  let phase="C emission";const completed=[];
  const timeouts={emission:emissionTimeoutMs,clang:clangTimeoutMs,execution:executionTimeoutMs,jsEmission:30000,
    ...(deadline===null?{}:{overallDeadlineMs:deadline,overallBudgetMs:380000})};
  try{
    const c=join(directory,"game.c"),binary=join(directory,"game"),js=join(directory,"game.cjs");
    if(resume)writeFileSync(c,resumeArtifact(resume.c));
    else {
      timeouts.actualCEmissionAllowanceMs=phaseAllowance(emissionTimeoutMs,deadline);
      checked(tools[0].file,[fileURLToPath(fixture),"-o",c],timeouts.actualCEmissionAllowanceMs);
    }
    completed.push("C emission");verify();
    const cHash=hash(c);phase="clang compilation";
    if(resume?.binary){writeFileSync(binary,resumeArtifact(resume.binary,true));chmodSync(binary,resume.binary.mode);}
    else checked(tools[1].file,["-O0","-Wno-unused-value",c,"-o",binary,"-lm","-pthread"],phaseAllowance(clangTimeoutMs,deadline));
    completed.push("clang compilation");verify();
    const binaryHash=hash(binary);phase="native execution";const native=await streamGameBatches(binary,[],directory,"native",phaseAllowance(executionTimeoutMs,deadline),deadline!==null);completed.push("native execution");verify();
    if(hash(c)!==cHash||hash(binary)!==binaryHash)throw new Error("native artifact changed");
    phase="JS emission";checked(tools[0].file,[fileURLToPath(fixture),"-o",js],phaseAllowance(30000,deadline));completed.push("JS emission");verify();
    const jsHash=hash(js);phase="JS execution";const emitted=await streamGameBatches(process.execPath,[js],directory,"emitted",phaseAllowance(executionTimeoutMs,deadline),deadline!==null);verify();
    if(hash(js)!==jsHash)throw new Error("emitted artifact changed");
    return{native,emitted,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
  }catch(error){
    try{retainCompilerFailure(directory,fixturePath,phase,completed,sources,tools,
      timeouts,error);}
    catch{try{console.error("Offline game compiler failure evidence could not be retained");}catch{}}
    rmSync(directory,{recursive:true,force:true});throw error;
  }
}
