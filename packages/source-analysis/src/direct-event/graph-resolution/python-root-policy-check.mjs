import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {join,normalize,isAbsolute,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import {parse} from 'smol-toml'
import {tomlValue} from './frontend-codec.mjs'
import {createServiceSession} from './service-session.mjs'
const temp=await mkdtemp('/tmp/hapsland-python-root-policy-')
try {
 const emitted=join(temp,'child.mjs')
 execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'PythonModule.bend'),'-o',emitted],{timeout:5000})
 const {default:child}=await import(pathToFileURL(emitted))
 // Execute the current production function itself after erasing only its annotations.
 const native=await readFile(join(import.meta.dirname,'../languages/python-module-context.ts'),'utf8')
 const fragment=native.slice(native.indexOf('const staticRoot ='),native.indexOf('\ntype Remaining'))
  .replace('(source: string): string | undefined','(source)').replace('where[0] as string','where[0]')
 const record=value=>typeof value==='object'&&value!==null&&!Array.isArray(value)?value:undefined
 const within=path=>!isAbsolute(path)&&path!=='..'&&!path.startsWith(`..${sep}`)
 const reference=Function('parse','record','normalize','within','sep',fragment+'\nreturn staticRoot')(parse,record,normalize,within,sep)
 const fixtures=['','[project]\nname="x"','[tool.poetry]','tool.hatch=false','tool.pdm="x"','tool=1979-05-27T07:32:00Z',
  'tool.setuptools.package-dir=1979-05-27T07:32:00Z','tool.setuptools.package-dir=[]','tool.setuptools.package-dir={}',
  'tool.setuptools.package-dir={""="src","other"="lib"}', 'tool.setuptools.package-dir={"named"="src"}',
  'tool.setuptools.packages.find.where=[]','tool.setuptools.packages.find.where=["src","lib"]',
  'tool.setuptools.packages.find.where=[false]','tool.setuptools.packages.find.where="src"']
 const paths=['.','src','src/','./src','src/../lib','../src','/src','a/b/c/d','a/b/c/d/e','','..','a//b','a/../../../b']
 for(const path of paths){
  fixtures.push(`tool.setuptools.packages.find.where=[${JSON.stringify(path)}]`)
  fixtures.push(`tool.setuptools.package-dir={""=${JSON.stringify(path)}}`)
  fixtures.push(`tool.setuptools.packages.find.where=[${JSON.stringify(path)}]\ntool.setuptools.package-dir={""=${JSON.stringify(path)}}`)
  fixtures.push(`tool.setuptools.packages.find.where=[${JSON.stringify(path)}]\ntool.setuptools.package-dir={""="other"}`)
 }
 let effects=0
 for(const [index,source] of fixtures.entries()){
  const expected=reference(source),io=createServiceSession({invocation:index+1,root:temp})
  let step=child.declared_root(tomlValue(parse(source)),sep,BigInt(index+1),0n)
  while(step.$.endsWith('.Await')){effects++;step=child.resume_declared_root(step,await io.perform(step.request))}
  assert.equal(step.$,'python-module/RootPolicyMachine.Returned',source)
  assert.equal(step.root.$==='Some'?step.root.value:undefined,expected,source)
  await io.close()
 }
 console.log(JSON.stringify({status:'PASS',cases:fixtures.length,pathEffects:effects,scope:'exact current production staticRoot over raw native TOML; excludes absoluteRoots and composed resolver'}))
} finally {await rm(temp,{recursive:true,force:true})}
