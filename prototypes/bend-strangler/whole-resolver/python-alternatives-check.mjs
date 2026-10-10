import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFile,mkdtemp,mkdir,writeFile,symlink,lstat,rm} from 'node:fs/promises'
import {join,dirname,normalize,isAbsolute,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createServiceSession,unlist} from './service-session.mjs'
const t=(name,fields={})=>({$:'Types.'+name,...fields}),s=(name,fields={})=>({$:'python-module/Session.'+name,...fields})
const temp=await mkdtemp('/tmp/hapsland-python-alternatives-')
try{
 const emitted=join(temp,'child.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'PythonModule.bend'),'-o',emitted],{timeout:5000});const {default:child}=await import(pathToFileURL(emitted))
 const native=await readFile(join(import.meta.dirname,'../../../packages/source-analysis/src/direct-event/languages/python-module-context.ts'),'utf8')
 // Current production algorithm, retaining its generator/short circuit structure.
 const body=native.slice(native.indexOf('    const candidates ='),native.indexOf('    const packageParents ='))
  .replace('const candidates = Effect.fn("Python.moduleAlternatives")(function* (base: string)', 'const candidates = function* (base)')
  .replace('const found: string[]', 'const found').replace(/\}\)\s*$/, '}')
 const makeReference=Function('within','normalize','stat','selectedByDirectFilePolicy','policyFor','isAvailable',body.replaceAll('!available','!isAvailable()')+'\nreturn candidates')
 const fixtures=[
  {name:'none',files:[],expected:[]},
  {name:'module-source',files:['pkg.py'],expected:['pkg.py']},
  {name:'module-stub',files:['pkg.pyi'],expected:['pkg.pyi']},
  {name:'source-precedence',files:['pkg.py','pkg.pyi'],expected:['pkg.py']},
  {name:'package-source',files:['pkg/__init__.py','pkg/__init__.pyi'],expected:['pkg/__init__.py']},
  {name:'package-stub',files:['pkg/__init__.pyi'],expected:['pkg/__init__.pyi']},
  {name:'ambiguous',files:['pkg.py','pkg.pyi','pkg/__init__.py','pkg/__init__.pyi'],expected:['pkg.py','pkg/__init__.py']},
  {name:'mixed-ambiguous',files:['pkg.pyi','pkg/__init__.py'],expected:['pkg.pyi','pkg/__init__.py']},
  {name:'nonfile-source',files:['pkg.pyi'],directory:'pkg.py'},
  {name:'nonfile-stub',files:[],directory:'pkg.pyi'},
  {name:'later-refusal',files:['pkg.py'],excluded:'pkg/__init__.py'},
  {name:'excluded-stub',files:['pkg.pyi','pkg/__init__.py'],excluded:'pkg.pyi',expected:['pkg/__init__.py']},
  {name:'excluded-source',files:['pkg.pyi'],excluded:'pkg.py'},
  {name:'symlink-source',files:['actual.py'],link:['actual.py','pkg.py']},
  {name:'absent-ancestor',files:[],base:'missing/pkg',expected:[]},
  {name:'non-directory-ancestor',files:['parent'],base:'parent/pkg'},
  {name:'escape',files:[],base:'../pkg'},
  {name:'maximum-depth',files:[],base:'a/b/pkg',depth:1,expected:[]},
  {name:'beyond-depth',files:[],base:'a/b/c/pkg',depth:1},
  {name:'expired',files:[],expired:true},
  {name:'work-cut',files:['pkg.py'],work:1}
 ]
 let requests=0
 for(const [index,fixture] of fixtures.entries()){
  const root=join(temp,String(index));await mkdir(root)
  for(const path of fixture.files){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),'class Item: pass')}
  if(fixture.directory)await mkdir(join(root,fixture.directory))
  if(fixture.link)await symlink(...fixture.link.map((path,i)=>i?join(root,path):path))
  let available=true,work=0,started=false;const membership=new Map(),expectedEvents=[],actualEvents=[],cap=fixture.work??40,depth=fixture.depth??4
  const within=path=>!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep),selected=path=>path!==fixture.excluded
  const permit=()=>{if(!available)return false;expectedEvents.push('clock');return !fixture.expired&&work<=cap}
  async function observe(path){
   if(membership.has(path))return membership.get(path)
   if(!within(path)||!permit()||work>=cap){available=false;return undefined}
   work++;expectedEvents.push('probe:'+path)
   let status;try{status=await lstat(join(root,path))}catch(error){if(error.code!=='ENOENT')available=false}
   if(status?.isSymbolicLink())available=false;membership.set(path,status);return status
  }
  function* stat(path){
   if(!within(path)){available=false;return undefined}
   expectedEvents.push('select:'+path);if(!selected(path)){available=false;return undefined}
   const ancestors=[];let directory=dirname(path)
   while(directory!=='.'){if(ancestors.length>depth+1){available=false;return undefined}ancestors.push(directory);directory=dirname(directory)}
   for(const ancestor of ancestors.reverse()){const status=yield observe(ancestor);if(!available||!status)return undefined;if(!status.isDirectory()){available=false;return undefined}}
   return yield observe(path)
  }
  const reference=makeReference(within,normalize,stat,path=>{expectedEvents.push('select:'+path);return selected(path)},()=>undefined,()=>available)
  const generator=reference(fixture.base??'pkg');let iteration=generator.next();while(!iteration.done)iteration=generator.next(await iteration.value)
  assert.deepEqual(iteration.value,fixture.expected,fixture.name+' native fixture')
  const io=createServiceSession({invocation:index+1,root,now:()=>{if(started)actualEvents.push('clock');return fixture.expired&&started?5000:0},selectContextPath:path=>{actualEvents.push('select:'+path);return selected(path)}})
  try{
   const clock=(await io.perform(t('Request',{invocation:index+1,id:0,operation:t('StartClock')}))).outcome.clock;started=true
   const session=child.initial_session('root.py',100n,BigInt(depth),s('Remaining',{files:s('Nonnegative',{value:10n}),read_bytes:s('Nonnegative',{value:10000n}),work:s('Nonnegative',{value:BigInt(cap)})}))
   let step=child.alternatives(session,fixture.base??'pkg',clock,sep,BigInt(index+1),1n)
   while(step.$.endsWith('.Await')){requests++;if(step.request.operation.$==='Types.ReadPathMembership')actualEvents.push('probe:'+step.request.operation.path);step=child.resume_alternatives(step,await io.perform(step.request))}
   assert.equal(step.$,'python-module/AlternativesMachine.Returned',fixture.name)
   assert.deepEqual(step.paths.$==='Some'?unlist(step.paths.value):undefined,iteration.value,fixture.name)
   assert.equal(step.session.available,available,fixture.name);assert.equal(step.session.work,BigInt(work),fixture.name)
   assert.deepEqual(unlist(step.session.membership).map(row=>row.path),[...membership.keys()],fixture.name)
   assert.deepEqual(actualEvents,expectedEvents,fixture.name)
  } finally {await io.close()}
 }
 console.log(JSON.stringify({status:'PASS',cases:fixtures.length,requests,scope:'complete moduleAlternatives current native algorithm; physical membership, injected fixed context selection; not full GraphSession'}))
}finally{await rm(temp,{recursive:true,force:true})}
