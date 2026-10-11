import assert from 'node:assert/strict'
import {mkdtemp,writeFile,symlink,rm,lstat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServiceSession,unlist} from './service-session.mjs'
import {parsePythonSyntax} from './frontends.mjs'
import {projectPythonSyntax} from './python-module/syntax-projection.mjs'
import {Parser,Python} from '../../../dist/direct-event/languages/native-parser.js'
import {selectedByDirectFilePolicy,contextDirectFilePolicy,DEFAULT_DIRECT_FILE_POLICY} from '../../../../native-observation/dist/direct-event/selection.js'
const t=(name,fields={})=>({$:'Types.'+name,...fields})
const root=await mkdtemp(join(tmpdir(),'hapsland-python-physical-'))
let id=0
const policy=contextDirectFilePolicy(DEFAULT_DIRECT_FILE_POLICY)
const session=createServiceSession({invocation:731,root,parsePythonSyntax,selectContextPath:path=>selectedByDirectFilePolicy(path,policy),access:async path=>({relativePath:path})})
const request=async(name,fields={})=>(await session.perform(t('Request',{invocation:731,id:id++,operation:t(name,fields)}))).outcome
try{
 await writeFile(join(root,'root.py'),'class Root: pass\n');await symlink('root.py',join(root,'link.py'))
 const present=(await request('ReadPathMembership',{path:'root.py'})).membership
 assert.equal(present.$,'Types.MembershipPresent');assert.equal(present.is_file,true);assert.equal(present.is_directory,false);assert.equal(present.is_symlink,false)
 const status=await lstat(join(root,'root.py'));assert.equal(present.signature,[status.mode,status.dev,status.ino,status.size,status.mtimeMs,status.ctimeMs].join(':'))
 assert.equal((await request('ReadPathMembership',{path:'absent.py'})).membership.$,'Types.MembershipAbsent')
 assert.equal((await request('ReadPathMembership',{path:'root.py/child'})).membership.$,'Types.MembershipFailed')
 assert.equal((await request('ReadPathMembership',{path:'link.py'})).membership.is_symlink,true)
 assert.equal((await request('ReadPathMembership',{path:'.'})).membership.is_directory,true)
 for(const path of ['root.py','root.pyi','pyproject.toml','setup.cfg','.git/x.py','../x.py'])assert.equal((await request('SelectContextPath',{path})).selected,selectedByDirectFilePolicy(path,policy))
 const source='from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from .child import Child as Alias\nclass Root:\n    value: Alias\n'
 const capture=session.registerCapture({text:source,byteLength:Buffer.byteLength(source)})
 const syntax=(await request('ParsePythonSyntax',{capture})).syntax
 assert.equal(syntax.has_error,false)
 const rows=unlist(syntax.nodes),byId=new Map(rows.map(row=>[row.id,row]))
 assert.equal(byId.get(syntax.root).kind,'module');assert.equal(byId.get(syntax.root).text,source)
 for(const row of rows){for(const child of unlist(row.children))assert.ok(byId.has(child));for(const field of unlist(row.fields))assert.ok(byId.has(field.child));assert.equal(row.text,source.slice(row.start,row.end))}
 const conditional=rows.find(row=>row.kind==='if_statement')
 assert.equal(byId.get(unlist(conditional.fields).find(field=>field.name==='condition').child).text,'TYPE_CHECKING')
 for(const text of ['A','_','𐐀','\u0301','\ud800','.','1']){
  const characters=unlist((await request('ReadIdentifierCharacters',{text})).characters)
  assert.deepEqual(characters.map(({text,id_start,id_continue})=>({text,id_start,id_continue})),Array.from(text,text=>({text,id_start:/^\p{ID_Start}$/u.test(text),id_continue:/^\p{ID_Continue}$/u.test(text)})))
 }
 const malformed=session.registerCapture({text:'class :',byteLength:7});assert.equal((await request('ParsePythonSyntax',{capture:malformed})).syntax.has_error,true)
 const identitySources=[
  'f = lambda x: x + 1\n',
  'class C:\n    @decorator()\n    def f(self, x=call()):\n        return forbidden()\n',
  'match value:\n    case [a, *b]: pass\n    case {"x": x, **rest}: pass\n',
  'from . import child as alias\nif TYPE_CHECKING:\n    from .child import Child\n',
  'class :\n', 'f = lambda :\n', 'x: list["Missing"] = value\n',
  'def f[T](x: T) -> T:\n    return x\n'
 ]
 const fieldNames=['name','alias','module_name','left','right','definition','condition','consequence','alternative','function','parameters','body','superclasses','value','type','type_parameters','argument','arguments','object','attribute']
 for(const source of identitySources){
  const parser=new Parser()
  try{
   parser.setLanguage(Python);const tree=parser.parse(source),projection=projectPythonSyntax(tree.rootNode),rows=new Map(unlist(projection.nodes).map(row=>[row.id,row])),identities=new Map()
   function check(node,id){
    const known=identities.get(node.id)
    if(known!==undefined){assert.equal(id,known);return}
    identities.set(node.id,id);const row=rows.get(id)
    assert.ok(row);assert.deepEqual([row.kind,row.start,row.end,row.text],[node.type,node.startIndex,node.endIndex,node.text])
    const children=unlist(row.children);assert.equal(children.length,node.namedChildren.length)
    node.namedChildren.forEach((child,index)=>check(child,children[index]))
    const expected=fieldNames.filter(name=>node.childForFieldName(name)!==null),actual=unlist(row.fields)
    assert.deepEqual(actual.map(field=>field.name),expected)
    for(const field of actual)check(node.childForFieldName(field.name),field.child)
   }
   check(tree.rootNode,projection.root);assert.equal(identities.size,rows.size)
  }finally{parser.reset()}
 }
 console.log(JSON.stringify({runtime:process.version,requests:id,physicalMembership:true,nonENOENTNotAbsent:true,symlinkFact:true,exactSignatures:true,contextSelection:true,rawNativeSyntax:true,nativeIdentityFixtures:identitySources.length,unicodeProperties:true,scope:'Python physical ABI only; module policy and complete machine not yet qualified'}))
}finally{session.close();await rm(root,{recursive:true,force:true})}
