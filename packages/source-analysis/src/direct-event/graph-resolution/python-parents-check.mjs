import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm,symlink} from 'node:fs/promises'
import {join,dirname,relative,isAbsolute,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createServiceSession,unlist} from './service-session.mjs'
import {parsePythonSyntax} from './frontends.mjs'
import {Parser,Python} from '../../../dist/direct-event/languages/native-parser.js'
import {projectPythonSyntax} from './python-module/syntax-projection.mjs'
const t=(name,fields={})=>({$:'Types.'+name,...fields}),s=(name,fields={})=>({$:'python-module/Session.'+name,...fields})
const temp=await mkdtemp('/tmp/hapsland-python-parents-')
try{
 const emitted=join(temp,'child.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'PythonModule.bend'),'-o',emitted],{timeout:5000});const {default:child}=await import(pathToFileURL(emitted))
 const native=await readFile(join(import.meta.dirname,'../languages/python-module-context.ts'),'utf8')
 const body=native.slice(native.indexOf('    const packageParents ='),native.indexOf('    const moduleTarget ='))
  .replace('const packageParents = Effect.fn("Python.packageParents")(function* (path: string, root: string)', 'const packageParents = function* (path, root)')
  .replace('const directories: string[]', 'const directories').replace(/\}\)\s*$/, '}').replaceAll('!available','!isAvailable()')
 const referenceFactory=Function('dirname','relative','within','limits','join','stat','readAuthority','staticPackageAuthority','isAvailable',body+'\nreturn packageParents')
 const fixtures=[
  {name:'root-direct',path:'leaf.py',files:{},valid:true},
  {name:'one-parent',files:{'pkg/__init__.py':''},valid:true},
  {name:'stub-parent',files:{'pkg/__init__.pyi':'from .foo import Foo'},valid:true},
  {name:'source-precedence',files:{'pkg/__init__.py':'','pkg/__init__.pyi':'run()'},valid:true},
  {name:'ordered-parents',path:'pkg/sub/leaf.py',files:{'pkg/__init__.py':'','pkg/sub/__init__.py':''},valid:true},
  {name:'invalid-outer',path:'pkg/sub/leaf.py',files:{'pkg/__init__.py':'run()','pkg/sub/__init__.py':''},valid:false},
  {name:'invalid-inner',path:'pkg/sub/leaf.py',files:{'pkg/__init__.py':'','pkg/sub/__init__.py':'run()'},valid:false},
  {name:'missing-parent',files:{},valid:false},
  {name:'nonfile-source',files:{'pkg/__init__.pyi':''},directory:'pkg/__init__.py',valid:false},
  {name:'excluded-source',files:{'pkg/__init__.pyi':''},excluded:'pkg/__init__.py',valid:false},
  {name:'parent-symlink',files:{'other/__init__.py':''},link:['other','pkg'],valid:false},
  {name:'declared-root',root:'src',path:'src/pkg/leaf.py',files:{'src/pkg/__init__.py':''},valid:true},
  {name:'outside-root',root:'src',path:'pkg/leaf.py',files:{'pkg/__init__.py':''},valid:false},
  {name:'depth-boundary',path:'pkg/sub/leaf.py',depth:2,files:{'pkg/__init__.py':'','pkg/sub/__init__.py':''},valid:true},
  {name:'depth-overflow',path:'pkg/sub/leaf.py',depth:1,files:{'pkg/__init__.py':'','pkg/sub/__init__.py':''},valid:false},
  {name:'metadata-executable',files:{'pkg/__init__.py':'from .foo import *'},valid:false},
  {name:'typed-static-parent',files:{'pkg/__init__.py':'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n from .foo import Foo\n'},valid:true}
 ]
 let requests=0
 for(const [index,fixture] of fixtures.entries()){
  const root=join(temp,String(index));await mkdir(root)
  for(const [path,text] of Object.entries(fixture.files)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text)}
  if(fixture.directory)await mkdir(join(root,fixture.directory))
  if(fixture.link)await symlink(fixture.link[0],join(root,fixture.link[1]))
  let available=true,work=0,started=false;const membership=new Map(),authority=new Map(),deps=[],expected=[],actual=[],depth=fixture.depth??4
  const within=path=>!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep),selected=path=>path!==fixture.excluded
  const permit=()=>{if(!available)return false;expected.push('clock');return work<=40}
  function* observe(path){if(membership.has(path))return membership.get(path);if(!within(path)||!permit()||work>=40){available=false;return undefined}work++;expected.push('probe:'+path);let status;try{status=yield lstat(join(root,path))}catch(error){if(error.code!=='ENOENT')available=false}if(status?.isSymbolicLink())available=false;membership.set(path,status);return status}
  function* stat(path){if(!within(path)){available=false;return undefined}expected.push('select:'+path);if(!selected(path)){available=false;return undefined}const dirs=[];let directory=dirname(path);while(directory!=='.'){if(dirs.length>depth+1){available=false;return undefined}dirs.push(directory);directory=dirname(directory)}for(const dir of dirs.reverse()){const status=yield* observe(dir);if(!available||!status)return undefined;if(!status.isDirectory()){available=false;return undefined}}return yield* observe(path)}
  function* readAuthority(path){if(authority.has(path))return authority.get(path);if(!permit())return undefined;expected.push('access:'+path);expected.push('capture:'+path);const text=yield readFile(join(root,path),'utf8');const capture={text,byteLength:Buffer.byteLength(text)};if(!permit())return undefined;authority.set(path,capture);deps.push(path);return capture}
  // Parser engines are reused; policy is independently evaluated by the exact
  // production authority consumer above, while this reference isolates chronology.
  const staticPackageAuthority=text=>{expected.push('parse');const parser=new Parser();try{parser.setLanguage(Python);return child.static_package_authority(projectPythonSyntax(parser.parse(text).rootNode))}finally{parser.reset()}}
  const reference=referenceFactory(dirname,relative,within,{depth},join,stat,readAuthority,staticPackageAuthority,()=>available)
  const gen=reference(fixture.path??'pkg/leaf.py',fixture.root??'.');let it=gen.next();while(!it.done){try{it=gen.next(await it.value)}catch(error){it=gen.throw(error)}}assert.equal(it.value,fixture.valid,fixture.name+' fixture')
  const io=createServiceSession({invocation:index+1,root,now:()=>{if(started)actual.push('clock');return 0},selectContextPath:path=>{actual.push('select:'+path);return selected(path)},access:async path=>{actual.push('access:'+path);return{relativePath:path}},capture:async selection=>{actual.push('capture:'+selection.relativePath);const text=await readFile(join(root,selection.relativePath),'utf8');return{status:'available',capture:{text,byteLength:Buffer.byteLength(text)}}},parsePythonSyntax:text=>{actual.push('parse');return parsePythonSyntax(text)}})
  try{
   const clock=(await io.perform(t('Request',{invocation:index+1,id:0,operation:t('StartClock')}))).outcome.clock,cache=(await io.perform(t('Request',{invocation:index+1,id:1,operation:t('CreateInvocationCache')}))).outcome.cache;started=true
   const state=child.initial_session('root.py',1024n,BigInt(depth),s('Remaining',{files:s('Nonnegative',{value:10n}),read_bytes:s('Nonnegative',{value:10000n}),work:s('Nonnegative',{value:40n})}))
   let step=child.package_parents(state,fixture.path??'pkg/leaf.py',fixture.root??'.',clock,cache,sep,BigInt(index+1),2n)
   while(step.$.endsWith('.Await')){requests++;if(step.request.operation.$==='Types.ReadPathMembership')actual.push('probe:'+step.request.operation.path);step=child.resume_parents(step,await io.perform(step.request))}
   assert.equal(step.$,'python-module/PackageParentsMachine.Returned',fixture.name);assert.equal(step.valid,it.value,fixture.name)
   assert.deepEqual(actual,expected,fixture.name+' ordered effects');assert.equal(step.session.available,available,fixture.name);assert.equal(step.session.work,BigInt(work),fixture.name)
   assert.deepEqual(unlist(step.session.membership).map(row=>row.path),[...membership.keys()],fixture.name);assert.deepEqual(unlist(step.session.dependencies),deps,fixture.name)
   assert.deepEqual(unlist(step.session.authority).map(row=>[row.path,Number(row.bytes)]),[...authority].map(([path,capture])=>[path,capture.byteLength]),fixture.name)
  }finally{await io.close()}
 }
 console.log(JSON.stringify({status:'PASS',cases:fixtures.length,requests,scope:'exact native packageParents chronology + physical membership/native syntax; capture adapter readFile and authority reused qualified candidate; not independent policy equivalence or GraphSession acceptance'}))
}finally{await rm(temp,{recursive:true,force:true})}
