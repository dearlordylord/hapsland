import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const LIMIT = 16 * 1024 * 1024;
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
function checked(command, args, timeout) {
  const result = spawnSync(command,args,{encoding:"utf8",timeout,maxBuffer:LIMIT,
    env:{...process.env,BEND_NO_TELEMETRY:"1"}});
  if(result.error || result.status !== 0) throw new Error(`${command}: ${result.error?.code ?? result.status}: ${result.stderr}`);
  return result.stdout;
}
function stream(command,args,directory,label) {
  return new Promise((accept,reject)=>{
    const child=spawn(command,args,{detached:true,stdio:["ignore","pipe","pipe"],env:{...process.env,BEND_NO_TELEMETRY:"1"}});
    let pending=Buffer.alloc(0),stderr="",failure;const files=[];
    const stop=error=>{if(!failure){failure=error;try{process.kill(-child.pid,"SIGKILL");}catch(error){if(error.code!=="ESRCH")failure=error;}}};
    const timer=setTimeout(()=>stop(new Error(`${label} execution exceeded 5000ms`)),5000);
    child.stdout.on("data",data=>{
      if(failure)return;
      pending=Buffer.concat([pending,data]);
      for(;;){const end=pending.indexOf(10);if(end<0)break;
        if(end>LIMIT){stop(new Error(`${label} batch exceeds 16MiB`));return;}
        const line=pending.subarray(0,end);pending=pending.subarray(end+1);
        try{if(!line.length)throw new Error("empty batch");JSON.parse(line.toString("utf8"));
          if(files.length>=145)throw new Error("unexpected extra game batch");
          const file=join(directory,`${label}-${files.length}.json`);writeFileSync(file,line);files.push(file);
        }catch(error){stop(error);return;}}
      if(pending.length>LIMIT)stop(new Error(`${label} batch exceeds 16MiB`));
    });
    child.stderr.on("data",data=>{stderr+=data.toString();if(Buffer.byteLength(stderr)>65536)stop(new Error(`${label} stderr bound`));});
    child.on("error",stop);
    child.on("close",code=>{clearTimeout(timer);if(failure)reject(failure);else if(code!==0)reject(new Error(`${label} exit ${code}: ${stderr}`));else if(pending.length||!files.length)reject(new Error(`${label} incomplete batch stream`));else accept(files);});
  });
}
/** One fresh compiler artifact per backend; bounded individual lossless batches. */
export async function createGameStreams(fixture,ownerSources) {
  const directory=mkdtempSync(join(tmpdir(),"hapsland-game-stream-"));
  const root=fileURLToPath(new URL("../../",import.meta.url));
  const sources=[...ownerSources.map(owner=>({file:resolve(root,owner.path),expected:owner.sha256})),
    {file:fileURLToPath(fixture),expected:hash(fileURLToPath(fixture))}];
  const tools=["bend","clang"].map(name=>{const file=realpathSync(checked("which",[name],5000).trim());return{file,expected:hash(file)};});
  const verify=()=>{for(const source of [...sources,...tools])if(hash(source.file)!==source.expected)throw new Error(`game source/tool changed: ${source.file}`);};
  try{
    verify();const c=join(directory,"game.c"),binary=join(directory,"game"),js=join(directory,"game.cjs");
    checked(tools[0].file,[fileURLToPath(fixture),"-o",c],30000);verify();
    const cHash=hash(c);checked(tools[1].file,["-O0","-Wno-unused-value",c,"-o",binary,"-lm","-pthread"],30000);verify();
    const binaryHash=hash(binary);const native=await stream(binary,[],directory,"native");verify();
    if(hash(c)!==cHash||hash(binary)!==binaryHash)throw new Error("native artifact changed");
    checked(tools[0].file,[fileURLToPath(fixture),"-o",js],30000);verify();
    const jsHash=hash(js);const emitted=await stream(process.execPath,[js],directory,"emitted");verify();
    if(hash(js)!==jsHash)throw new Error("emitted artifact changed");
    return{native,emitted,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
  }catch(error){rmSync(directory,{recursive:true,force:true});throw error;}
}
