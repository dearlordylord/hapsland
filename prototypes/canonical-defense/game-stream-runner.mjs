import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync, statSync, existsSync, mkdirSync } from "node:fs";
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
function checked(command, args, timeout) {
  const result = spawnSync(command,args,{encoding:"utf8",timeout,killSignal:"SIGKILL",maxBuffer:LIMIT,
    env:{...process.env,BEND_NO_TELEMETRY:"1"}});
  if(result.error || result.status !== 0) throw new Error(`${command}: ${result.error?.code ?? result.status}: ${result.stderr}`);
  return result.stdout;
}
function stream(command,args,directory,label,executionTimeoutMs) {
  return new Promise((accept,reject)=>{
    const child=spawn(command,args,{detached:true,stdio:["ignore","pipe","pipe"],env:{...process.env,BEND_NO_TELEMETRY:"1"}});
    let pending=Buffer.alloc(0),stderr="",failure,totalBytes=0;const files=[];const started=performance.now();
    const stop=error=>{if(!failure){failure=error;try{process.kill(-child.pid,"SIGKILL");}catch(error){if(error.code!=="ESRCH")failure=error;}}};
    const timer=setTimeout(()=>stop(new Error(`${label} execution exceeded ${executionTimeoutMs}ms`)),executionTimeoutMs);
    child.stdout.on("data",data=>{
      if(failure)return;
      pending=Buffer.concat([pending,data]);
      for(;;){const end=pending.indexOf(10);if(end<0)break;
        if(end>LIMIT){stop(new Error(`${label} batch exceeds 16MiB`));return;}
        const line=pending.subarray(0,end);pending=pending.subarray(end+1);
        try{if(!line.length)throw new Error("empty batch");JSON.parse(line.toString("utf8"));
          if(files.length>=145)throw new Error("unexpected extra game batch");
          const file=join(directory,`${label}-${files.length}.json`);writeFileSync(file,line);files.push(file);totalBytes+=line.length;
        }catch(error){stop(error);return;}}
      if(pending.length>LIMIT)stop(new Error(`${label} batch exceeds 16MiB`));
    });
    child.stderr.on("data",data=>{stderr+=data.toString();if(Buffer.byteLength(stderr)>65536)stop(new Error(`${label} stderr bound`));});
    child.on("error",stop);
    child.on("close",code=>{clearTimeout(timer);if(failure){failure.message+=` (batches=${files.length}, bytes=${totalBytes}, pendingBytes=${pending.length}, elapsedMs=${Math.round(performance.now()-started)})`;reject(failure);}else if(code!==0)reject(new Error(`${label} exit ${code}: ${stderr}`));else if(pending.length||!files.length)reject(new Error(`${label} incomplete batch stream`));else accept(files);});
  });
}
// Failed scoped compiler output is diagnostic evidence, never an artifact cache.
function retainCompilerFailure(directory,phase,completed,sources,tools,timeouts,error) {
  const failureFile=process.env.HAPSLAND_TEST_FAILURES_FILE;
  if(!failureFile||!['C emission','clang compilation'].includes(phase))return;
  const outputs=join(dirname(failureFile),"workload-outputs");mkdirSync(outputs,{recursive:true});
  const retained=mkdtempSync(join(outputs,`game-compiler-failure-${process.pid}-`));
  const source=join(directory,"game.c");let c=null;
  if(existsSync(source)){
    const bytes=readFileSync(source),path=join(retained,"game.c");writeFileSync(path,bytes);
    c={path,bytes:bytes.length,sha256:digest(bytes)};
  }
  const receipt=join(retained,"receipt.json");
  writeFileSync(receipt,JSON.stringify({lane:"game-compiler-failure",phase,completed,sources,tools,timeouts,c,
    failure:{name:error.name,message:error.message},
    purpose:"Captured offline compiler evidence; manual source/tool validation required before resume; no automatic reuse or acceptance"},null,2)+"\n");
  console.log(`Retained offline game compiler failure: ${receipt}`);
}
/** One fresh compiler artifact per backend; bounded individual lossless batches. */
export async function createGameStreams(fixture,ownerSources,{executionTimeoutMs=5000,emissionTimeoutMs=30000,clangTimeoutMs=30000}={}) {
  if(executionTimeoutMs!==5000 && executionTimeoutMs!==15000 && executionTimeoutMs!==30000)throw new Error("unsupported game diagnostic execution allowance");
  if(!Number.isSafeInteger(emissionTimeoutMs)||emissionTimeoutMs<=0||emissionTimeoutMs>45000)throw new RangeError("invalid game C emission allowance");
  if(!Number.isSafeInteger(clangTimeoutMs)||clangTimeoutMs<=0||clangTimeoutMs>90000)throw new RangeError("invalid game clang allowance");
  const root=realpathSync(fileURLToPath(new URL("../../",import.meta.url)));
  const bendFile=realpathSync(checked("which",["bend"],5000).trim());
  const bendLayout=bendSourceLayout(bendFile);
  const sources=sourceRecords(fileURLToPath(fixture),ownerSources,root,bendLayout.root,bendLayout.directory);
  const tools=[{file:bendFile,expected:hash(bendFile)}];
  const clangFile=realpathSync(checked("which",["clang"],5000).trim());
  tools.push({file:clangFile,expected:hash(clangFile)});
  const verify=()=>{for(const source of [...sources,...tools])if(hash(source.file)!==source.expected)throw new Error(`game source/tool changed: ${source.file}`);};
  verify();
  const directory=mkdtempSync(join(tmpdir(),"hapsland-game-stream-"));
  let phase="C emission";const completed=[];
  try{
    const c=join(directory,"game.c"),binary=join(directory,"game"),js=join(directory,"game.cjs");
    checked(tools[0].file,[fileURLToPath(fixture),"-o",c],emissionTimeoutMs);completed.push("C emission");verify();
    const cHash=hash(c);phase="clang compilation";checked(tools[1].file,["-O0","-Wno-unused-value",c,"-o",binary,"-lm","-pthread"],clangTimeoutMs);completed.push("clang compilation");verify();
    const binaryHash=hash(binary);phase="native execution";const native=await stream(binary,[],directory,"native",executionTimeoutMs);verify();
    if(hash(c)!==cHash||hash(binary)!==binaryHash)throw new Error("native artifact changed");
    phase="JS emission";checked(tools[0].file,[fileURLToPath(fixture),"-o",js],30000);verify();
    const jsHash=hash(js);const emitted=await stream(process.execPath,[js],directory,"emitted",executionTimeoutMs);verify();
    if(hash(js)!==jsHash)throw new Error("emitted artifact changed");
    return{native,emitted,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
  }catch(error){
    try{retainCompilerFailure(directory,phase,completed,sources,tools,
      {emission:emissionTimeoutMs,clang:clangTimeoutMs,execution:executionTimeoutMs,jsEmission:30000},error);}
    catch{try{console.error("Offline game compiler failure evidence could not be retained");}catch{}}
    rmSync(directory,{recursive:true,force:true});throw error;
  }
}
