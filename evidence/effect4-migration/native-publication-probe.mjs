// Reproduce native publication ownership in isolated scratch copies.
// Synthetic parser inputs only; no production artifacts are overwritten.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
const root=resolve(process.argv[2] ?? '.');
const { copyNativeArtifact } = await import(pathToFileURL(join(root, 'scripts/native-artifact.mjs')).href);
const bindings=[['tree-sitter','tree_sitter_runtime_binding.node'],['tree-sitter-typescript','tree_sitter_typescript_binding.node'],['tree-sitter-rust','tree_sitter_rust_binding.node']];
const childCode=`const {join}=require('node:path');const root=process.argv[1];const Parser=require(join(root,'node_modules/tree-sitter'));const TS=require(join(root,'node_modules/tree-sitter-typescript'));const Rust=require(join(root,'node_modules/tree-sitter-rust'));const parser=new Parser();let stopped=false,batches=0;process.on('message',message=>{if(message==='start'){process.send({phase:'parsing'});const batch=()=>{if(stopped){process.send({phase:'complete',batches});process.exit(0);return;}for(let n=0;n<32;n++){parser.setLanguage(TS.typescript);if(parser.parse('type Probe = number').rootNode.hasError)process.exit(2);parser.setLanguage(Rust);if(parser.parse('struct Probe { value: Option<String> }').rootNode.hasError)process.exit(3);}batches++;setImmediate(batch);};batch();}else if(message==='stop')stopped=true;});process.send({phase:'ready'});`;
const results=[];
for(const mode of ['overwrite','atomic']){
 const scratch=mkdtempSync(join(tmpdir(),'hapsland-native-copy-probe-'));
 try{
  const artifacts=bindings.map(([name,file])=>{const source=resolve(root,'native/prebuilt',`${process.platform}-${process.arch}`,name,'build/Release',file),output=join(scratch,name,'build/Release',file);mkdirSync(dirname(output),{recursive:true});copyFileSync(source,output);return{source,output};});
  const child=spawn('sh',['-c','ulimit -c 0; exec "$@"','hapsland-native-probe',process.execPath,'-e',childCode,root],{env:{...process.env,TREE_SITTER_PREBUILD:join(scratch,'tree-sitter'),TREE_SITTER_TYPESCRIPT_PREBUILD:join(scratch,'tree-sitter-typescript'),TREE_SITTER_RUST_PREBUILD:join(scratch,'tree-sitter-rust')},stdio:['ignore','ignore','ignore','ipc']});
  const deadline=setTimeout(()=>child.kill('SIGKILL'),10000);deadline.unref();
  let complete;child.on('message',message=>{if(message.phase==='complete')complete=message;});
  const exited=once(child,'exit');
  const waitMessage=()=>Promise.race([once(child,'message'),exited.then(()=>{throw new Error('native probe terminated before handshake');})]);
  await waitMessage();const parsing=waitMessage();child.send('start');await parsing;
  for(let iteration=0;iteration<32;iteration++)for(const{source,output}of artifacts)(mode==='atomic'?copyNativeArtifact:copyFileSync)(source,output);
  if(child.connected)child.send('stop',()=>{});
  const [code,signal]=await exited;clearTimeout(deadline);
  results.push({mode,code,signal,completed:complete!==undefined,batches:complete?.batches??null});
 }finally{rmSync(scratch,{recursive:true,force:true});}
}
console.log(JSON.stringify({purpose:'Isolated native library publication probe; synthetic parser inputs only',authority:'Implementation diagnostic evidence; no cross-platform support claim',environment:{node:process.version,platform:process.platform,arch:process.arch},copiesPerBinding:32,results,limitation:'Scratch clones of installed native bindings only; reproduced overwrite crash mechanism does not attribute every historical crash or timeout.'},null,2));
