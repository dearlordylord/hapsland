import {inspectTypeScript,inspectTypeScriptFunctions} from '../../../packages/source-analysis/dist/direct-event/languages/typescript.js'
import {inspectRust,inspectRustModules} from '../../../packages/source-analysis/dist/direct-event/languages/rust.js'
import {pythonAdapter} from '../../../packages/source-analysis/dist/direct-event/languages/python.js'
import {bendAdapter} from '../../../packages/source-analysis/dist/direct-event/languages/bend/adapter.js'
import {parse} from 'smol-toml'
import {sourceFacts,tomlValue} from './frontend-codec.mjs'
import {unlist} from './service-session.mjs'
import {projectPythonSyntax} from './python-module/syntax-projection.mjs'
const tag=name=>'Types.'+name
const optional=value=>{if(value?.$==='None')return undefined;if(value?.$==='Some')return value.value;throw new Error('invalid optional context')}
function branch(value){if(value?.$===tag('TypeBranch'))return 'type';if(value?.$===tag('FunctionBranch'))return 'function';throw new Error('invalid branch context')}
function rustContext(value){
 if(value?.$!==tag('RustContext'))throw new Error('invalid Rust context')
 const result={}
 for(const [field,target]of [['crate_root','rustCrateRoot'],['external_module','rustExternalModule']]){const flag=optional(value[field]);if(flag!==undefined){if(typeof flag!=='boolean')throw new Error('invalid Rust flag');result[target]=flag}}
 const modules=optional(value.modules)
 if(modules!==undefined){const entries=unlist(modules).map(field=>{if(field?.$!==tag('OrderedField')||typeof field.key!=='string'||typeof field.value!=='string')throw new Error('invalid Rust module context');return[field.key,field.value]});if(new Set(entries.map(x=>x[0])).size!==entries.length)throw new Error('duplicate Rust module context');result.rustCrateModules=new Map(entries)}
 return result
}
// Named independent single-source application frontends. No file reads,
// candidate selection, graph budget or traversal is performed in this adapter.
export function inspectSourceFrontend(path,source,context){
 let facts
 switch(context?.$){
  case tag('TypeScriptContext'):facts=branch(context.branch)==='function'?inspectTypeScriptFunctions(path,source):inspectTypeScript(path,source);break
  case tag('RustSourceContext'):facts=branch(context.branch)==='function'?undefined:inspectRust(path,source,rustContext(context.context));break
  case tag('PythonSourceContext'):facts=branch(context.branch)==='function'?undefined:pythonAdapter.inspect(path,source);break
  case tag('BendSourceContext'):facts=branch(context.branch)==='function'?undefined:bendAdapter.inspect(path,source);break
  default:throw new Error('invalid frontend context')
 }
 return facts===undefined?undefined:sourceFacts(facts)
}
export function parseCargoSyntax(source){let syntax;try{syntax=parse(source)}catch{return undefined}return tomlValue(syntax)}
export const inspectRustModuleSyntax=inspectRustModules

// Native-parser syntax projection only. No module-scope/binding/import policy.
export async function parsePythonSyntax(source){
 const {Parser,Python}=await import('../../../packages/source-analysis/dist/direct-event/languages/native-parser.js')
 const parser=new Parser()
 // The pinned native Node binding exposes reset, not tree/parser delete. Native
 // objects stay call-local; the returned projection contains no engine handles.
 try {
  parser.setLanguage(Python)
  const tree=parser.parse(source)
  return projectPythonSyntax(tree.rootNode)
 } finally {parser.reset()}
}
