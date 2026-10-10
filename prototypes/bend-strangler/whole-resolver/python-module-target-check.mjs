import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm,symlink} from 'node:fs/promises'
import {join,dirname,relative,isAbsolute,sep,normalize} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createServiceSession,unlist} from './service-session.mjs'
import {parsePythonSyntax} from './frontends.mjs'
import {Parser,Python} from '../../../packages/source-analysis/dist/direct-event/languages/native-parser.js'
import {projectPythonSyntax} from './python-module/syntax-projection.mjs'
const t=(name,fields={})=>({$:'Types.'+name,...fields}),s=(name,fields={})=>({$:'python-module/Session.'+name,...fields})
const temp=await mkdtemp('/tmp/hapsland-python-parents-')
try{
 const emitted=join(temp,'child.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'PythonModule.bend'),'-o',emitted],{timeout:5000});const {default:child}=await import(pathToFileURL(emitted))
 const native=await readFile(join(import.meta.dirname,'../../../packages/source-analysis/src/direct-event/languages/python-module-context.ts'),'utf8')
 const body=native.slice(native.indexOf('    const candidates ='),native.indexOf('    const resolveImport:'))
  .replaceAll(/Effect.fn\("Python\.(?:moduleAlternatives|packageParents|moduleTarget)"\)\(function\*/g,'(function*')
  .replaceAll('!available','!isAvailable()')
 const js=execFileSync('bun',['-e','process.stdout.write(new Bun.Transpiler({loader:"ts"}).transformSync(await Bun.stdin.text()))'],{input:body,encoding:'utf8',timeout:5000})
 const referenceFactory=Function('dirname','relative','within','limits','join','normalize','sep','stat','readAuthority','staticPackageAuthority','isAvailable','absoluteRoots','rootPath','host','selectedByDirectFilePolicy','policyFor',js+'\nreturn moduleTarget')
 const fixtures=[
  {name:'ordinary-absolute',import:'foo',files:{'foo.py':''},target:'foo.py'},
  {name:'source-before-stub',import:'foo',files:{'foo.py':'','foo.pyi':''},target:'foo.py'},
  {name:'stub-only',import:'foo',files:{'foo.pyi':''},target:'foo.pyi'},
  {name:'package',import:'foo',files:{'foo/__init__.py':''},target:'foo/__init__.py'},
  {name:'module-package-ambiguity',import:'foo',files:{'foo.py':'','foo/__init__.py':''}},
  {name:'roots-ambiguity',import:'foo',files:{'foo.py':'','src/foo.py':''}},
  {name:'later-root-refusal',import:'foo',excluded:'src/foo.py',files:{'foo.py':''}},
  {name:'relative-member',from:'pkg/use.py',import:'.foo',files:{'pkg/__init__.py':'','pkg/foo.py':''},target:'pkg/foo.py'},
  {name:'relative-package',from:'pkg/use.py',import:'.',files:{'pkg/__init__.py':''},target:'pkg/__init__.py'},
  {name:'relative-stub',from:'pkg/use.py',import:'.',files:{'pkg/__init__.pyi':''},target:'pkg/__init__.pyi'},
  {name:'relative-source-nonfile',from:'pkg/use.py',import:'.',directory:'pkg/__init__.py',files:{'pkg/__init__.pyi':''}},
  {name:'root-boundary',import:'.',files:{}},
  {name:'relative-ascent',from:'pkg/sub/use.py',import:'..foo',files:{'pkg/__init__.py':'','pkg/sub/__init__.py':'','pkg/foo.py':''},target:'pkg/foo.py'},
  {name:'src-original-root',rootPath:'src/pkg/use.py',from:'src/pkg/use.py',import:'.foo',files:{'src/pkg/__init__.py':'','src/pkg/foo.py':''},target:'src/pkg/foo.py'},
  {name:'declared-fallback',from:'lib/pkg/use.py',roots:['.','src','lib'],import:'.foo',files:{'lib/pkg/__init__.py':'','lib/pkg/foo.py':''},target:'lib/pkg/foo.py'},
  {name:'original-root-retained',rootPath:'root.py',from:'src/pkg/use.py',import:'.foo',files:{'src/pkg/__init__.py':'','src/pkg/foo.py':''},target:'src/pkg/foo.py'},
  {name:'unicode',import:'删除',files:{'删除.py':''},target:'删除.py'},
  {name:'bad-grammar',import:'foo..bar',files:{}},
  {name:'empty',import:'',files:{}},
  {name:'depth-overflow',depth:1,import:'foo.bar.baz',files:{}},
  {name:'missing',import:'foo',files:{}}
 ]
 const list=values=>values.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
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
  const reference=referenceFactory(dirname,relative,within,{depth},join,normalize,sep,stat,readAuthority,staticPackageAuthority,()=>available,function*(){return fixture.roots??[".","src"]},fixture.rootPath??"root.py",{selectContextPath: function*(path){return selected(path)?{relativePath:path}:undefined}},path=>{expected.push("select:"+path);return selected(path)},()=>undefined)
  const gen=reference(fixture.from??'root.py',fixture.import);let it=gen.next();while(!it.done){try{it=gen.next(await it.value)}catch(error){it=gen.throw(error)}}assert.equal(it.value,fixture.target,fixture.name+' fixture')
  const io=createServiceSession({invocation:index+1,root,now:()=>{if(started)actual.push('clock');return 0},selectContextPath:path=>{actual.push('select:'+path);return selected(path)},access:async path=>{actual.push('access:'+path);return{relativePath:path}},capture:async selection=>{actual.push('capture:'+selection.relativePath);const text=await readFile(join(root,selection.relativePath),'utf8');return{status:'available',capture:{text,byteLength:Buffer.byteLength(text)}}},parsePythonSyntax:text=>{actual.push('parse');return parsePythonSyntax(text)}})
  try{
   const clock=(await io.perform(t('Request',{invocation:index+1,id:0,operation:t('StartClock')}))).outcome.clock,cache=(await io.perform(t('Request',{invocation:index+1,id:1,operation:t('CreateInvocationCache')}))).outcome.cache;started=true
   const initial=child.initial_session('root.py',1024n,BigInt(depth),s('Remaining',{files:s('Nonnegative',{value:10n}),read_bytes:s('Nonnegative',{value:10000n}),work:s('Nonnegative',{value:40n})}))
   const state=child.cached_roots(initial,list(fixture.roots??['.','src']))
   let step=child.module_target(state,fixture.from??'root.py',fixture.import,fixture.rootPath??'root.py',clock,cache,sep,BigInt(index+1),2n)
   while(step.$.endsWith('.Await')){requests++;if(step.request.operation.$==='Types.ReadPathMembership')actual.push('probe:'+step.request.operation.path);step=child.resume_target(step,await io.perform(step.request))}
   assert.equal(step.$,'python-module/ModuleTargetMachine.Returned',fixture.name);assert.equal(step.path.$==='None'?undefined:step.path.value,it.value,fixture.name)
   assert.deepEqual(actual,expected,fixture.name+' ordered effects');assert.equal(step.session.available,available,fixture.name);assert.equal(step.session.work,BigInt(work),fixture.name)
   assert.deepEqual(unlist(step.session.membership).map(row=>row.path),[...membership.keys()],fixture.name);assert.deepEqual(unlist(step.session.dependencies),deps,fixture.name)
   assert.deepEqual(unlist(step.session.authority).map(row=>[row.path,Number(row.bytes)]),[...authority].map(([path,capture])=>[path,capture.byteLength]),fixture.name)
  }finally{await io.close()}
 }
 console.log(JSON.stringify({status:'PASS',cases:fixtures.length,requests,scope:'whole moduleTarget/native ordered effects with cached roots and physical membership/syntax; injected capture and selection; not full GraphSession/Canonical acceptance'}))
}finally{await rm(temp,{recursive:true,force:true})}
