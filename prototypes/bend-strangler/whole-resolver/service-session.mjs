import * as path from 'node:path'
import {lstat} from 'node:fs/promises'

export function hostNatural(value) {
 if(typeof value==='bigint'){if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('unsafe host natural');return Number(value)}
 if(!Number.isSafeInteger(value)||value<0)throw new Error('unsafe host natural');return value
}
const tag = name => 'Types.' + name
const tagged = (name, fields = {}) => ({$:tag(name),...fields})
export const nil = () => ({$:'Nil'})
export const list = items => items.reduceRight((tail,head)=>({$:'Con',head,tail}),nil())
export function unlist(value) {
  const result=[]
  while(value?.$==='Con'){result.push(value.head);value=value.tail}
  if(value?.$!=='Nil')throw new Error('invalid list')
  return result
}
const tuple=(key,value)=>tagged('OrderedField',{key,value})
export function binary64(value) {
  const bytes=new DataView(new ArrayBuffer(8));bytes.setFloat64(0,value,false)
  return tagged('Binary64',{high:bytes.getUint32(0,false),low:bytes.getUint32(4,false)})
}
export function fromBinary64(bits) {
  if(bits?.$!==tag('Binary64')||![bits.high,bits.low].every(x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff))throw new Error('invalid binary64')
  const bytes=new DataView(new ArrayBuffer(8));bytes.setUint32(0,bits.high,false);bytes.setUint32(4,bits.low,false);return bytes.getFloat64(0,false)
}
export function productValue(value) {
  if(value===null)return tagged('ProductNull')
  if(typeof value==='boolean')return tagged('ProductBool',{value})
  if(typeof value==='number')return tagged('ProductNumber',{bits:binary64(value)})
  if(typeof value==='string')return tagged('ProductText',{value})
  if(Array.isArray(value))return tagged('ProductArray',{items:list(value.map(productValue))})
  if(value!==null&&typeof value==='object')return tagged('ProductObject',{fields:list(Object.entries(value).map(([key,item])=>tuple(key,productValue(item))))})
  throw new Error('unsupported product encoding')
}
// Boundary conversion only. Validate the whole spine first, preserving the
// previous decoder's malformed-list precedence before decoding any element.
function validateList(value){
 while(value?.$==='Con')value=value.tail
 if(value?.$!=='Nil')throw new Error('invalid list')
}
export function fromProductValue(value){
 switch(value?.$){
 case 'Types.ProductNull':return null
 case 'Types.ProductBool':if(typeof value.value!=='boolean')throw new Error('invalid bool');return value.value
 case 'Types.ProductNumber':return fromBinary64(value.bits)
 case 'Types.ProductText':if(typeof value.value!=='string')throw new Error('invalid text');return value.value
 case 'Types.ProductArray':{
  validateList(value.items);const result=[]
  for(let item=value.items;item.$==='Con';item=item.tail)result.push(fromProductValue(item.head))
  return result
 }
 case 'Types.ProductObject':{
  validateList(value.fields);const result={}
  for(let item=value.fields;item.$==='Con';item=item.tail){
   const field=item.head
   if(field?.$!=='Types.OrderedField'||typeof field.key!=='string'||Object.hasOwn(result,field.key))throw new Error('invalid product fields')
   Object.defineProperty(result,field.key,{value:fromProductValue(field.value),enumerable:true,writable:true,configurable:true})
  }
  return result
 }
 default:throw new Error('unknown product value')
 }
}

// Independent service/session state only: native resources and caller-owned IO.
// No graph queues, budgets, dependency choices or result-tree construction.
function fromDiagnostic(value) {
 if(value?.$===tag('CaptureDiagnostic'))return fromProductValue(value.value)
 if(value?.$===tag('CaptureBudgetDiagnostic'))return {stage:'capture',code:'capture-budget-limit',args:{resource:value.resource,used:hostNatural(value.used),requested:hostNatural(value.requested),limit:hostNatural(value.limit)}}
 throw new Error('invalid capture diagnostic')
}
export function createServiceSession({invocation,root,now=()=>performance.now(),callerCache,access,capture,frontend,parseCargo,inspectRustModules,selectContextPath,parsePythonSyntax,diagnostic}={}) {
  if(!Number.isSafeInteger(invocation)||invocation<0)throw new Error('invalid invocation')
  const resources={ClockToken:new Map(),CaptureToken:new Map(),SelectionToken:new Map(),ExceptionToken:new Map(),CacheToken:new Map()}
  let next=1,closed=false,accepting=true
  const register=(kind,value)=>{if(closed||!accepting)throw new Error('closed service session');const id=next++;resources[kind].set(id,value);return tagged(kind,{invocation,id})}
  const lookup=(kind,token)=>{
    if(token?.$!==tag(kind)||hostNatural(token.invocation)!==invocation||!resources[kind].has(hostNatural(token.id)))throw new Error('invalid '+kind)
    return resources[kind].get(hostNatural(token.id))
  }
  const caller=callerCache===undefined?{$:'None'}:{$:'Some',value:register('CacheToken',callerCache)}
  const capturedResult=value=>tagged('CachePresent',{capture:register('CaptureToken',value),bytes:value.byteLength})
  async function perform(request,{signal}={}) {
    if(closed||!accepting||request?.$!==tag('Request')||hostNatural(request.invocation)!==invocation)throw new Error('invalid request owner')
    const id=hostNatural(request.id),op=request.operation
    let outcome
    try {
      switch(op?.$){
        case tag('StartClock'):outcome=tagged('ClockStarted',{clock:register('ClockToken',now())});break
        case tag('ReadClock'):outcome=tagged('ClockRead',{bits:binary64(now()-lookup('ClockToken',op.clock))});break
        case tag('PathDirname'):outcome=tagged('DirnameResult',{path:path.dirname(op.path)});break
        case tag('PathBasename'):outcome=tagged('BasenameResult',{name:path.basename(op.path,op.suffix.$==='Some'?op.suffix.value:undefined)});break
        case tag('ReadPathSeparator'):outcome=tagged('PathSeparatorResult',{separator:path.sep});break
        case tag('PathJoin'):outcome=tagged('JoinedResult',{path:path.join(...unlist(op.parts))});break
        case tag('PathNormalize'):outcome=tagged('NormalizedResult',{path:path.normalize(op.path)});break
        case tag('PathRelative'):outcome=tagged('RelativeResult',{path:path.relative(op.from,op.to)});break
        case tag('PathExtension'):outcome=tagged('ExtensionResult',{extension:path.extname(op.path)});break
        case tag('PathIsAbsolute'):outcome=tagged('AbsoluteResult',{absolute:path.isAbsolute(op.path)});break
        case tag('JoinedPathFacts'):{const normalized=path.normalize(path.join(path.dirname(op.from),op.leaf));outcome=tagged('JoinedPathFactsResult',{separator:path.sep,normalized,absolute:path.isAbsolute(normalized),extension:path.extname(normalized),leaf_extension:path.extname(op.leaf)});break}
        case tag('ReadFileStatus'):{const status=await lstat(path.join(root,op.path)).catch(()=>undefined);outcome=tagged('StatusResult',{status:tagged(status===undefined?'FileAbsent':status.isFile()?'ExistingFile':'ExistingOther')});break}
        case tag('ReadPathMembership'):{
          let membership
          try {
            const status=await lstat(path.join(root,op.path))
            membership=tagged('MembershipPresent',{is_file:status.isFile(),is_directory:status.isDirectory(),is_symlink:status.isSymbolicLink(),signature:[status.mode,status.dev,status.ino,status.size,status.mtimeMs,status.ctimeMs].join(':')})
          } catch(error) { membership=tagged(error?.code==='ENOENT'?'MembershipAbsent':'MembershipFailed') }
          outcome=tagged('MembershipResult',{membership});break
        }
        case tag('SelectContextPath'):outcome=tagged('ContextSelectionResult',{selected:await selectContextPath(op.path)});break
        case tag('ParsePythonSyntax'):{const source=lookup('CaptureToken',op.capture);outcome=tagged('PythonSyntaxResult',{syntax:await parsePythonSyntax(source.text)});break}
        case tag('ReadIdentifierCharacters'):outcome=tagged('IdentifierCharactersResult',{characters:list(Array.from(op.text,text=>tagged('IdentifierCharacter',{text,id_start:/^\p{ID_Start}$/u.test(text),id_continue:/^\p{ID_Continue}$/u.test(text)})))});break
        case tag('CreateInvocationCache'):outcome=tagged('InvocationCacheCreated',{cache:register('CacheToken',new Map())});break
        case tag('LookupCaptureCache'):{const cache=lookup('CacheToken',op.cache),value=cache.get(op.path);outcome=tagged('CacheResult',{outcome:value===undefined?tagged('CacheAbsent'):capturedResult(value)});break}
        case tag('SnapshotCaptureCache'):{const cache=lookup('CacheToken',op.cache);outcome=tagged('CacheSnapshot',{entries:list([...cache].map(([p,c])=>tagged('CaptureBytes',{path:p,bytes:c.byteLength})))});break}
        case tag('StoreCaptureCache'):
        case tag('InsertRootCaptureCache'):{lookup('CacheToken',op.cache).set(op.path,lookup('CaptureToken',op.capture));outcome=tagged(op.$===tag('StoreCaptureCache')?'CacheStored':'RootCacheInserted');break}
        case tag('AccessPath'):{const selected=await access(op.path,{signal});outcome=tagged('AccessResult',{outcome:selected===undefined?tagged('AccessDenied'):tagged('AccessAllowed',{selection:register('SelectionToken',selected),relative_path:selected.relativePath})});break}
        case tag('CaptureSource'):{const result=await capture(lookup('SelectionToken',op.selection),hostNatural(op.source_cap),{signal});outcome=tagged('CaptureResult',{outcome:result.status==='unavailable'?tagged('CaptureUnavailable',{diagnostic:tagged('CaptureDiagnostic',{value:productValue(result.diagnostic)})}):tagged('SourceCaptured',{capture:register('CaptureToken',result.capture),relative_path:lookup('SelectionToken',op.selection).relativePath,bytes:result.capture.byteLength})});break}
        case tag('InspectSource'):{const source=lookup('CaptureToken',op.capture);const facts=await frontend(op.path,source.text,op.context,{signal});outcome=tagged('FrontendResult',{outcome:facts===undefined?tagged('SourceUnsupported'):tagged('SourceInspected',{facts})});break}
        case tag('ParseCargo'):{const source=lookup('CaptureToken',op.capture);const syntax=await parseCargo(source.text);outcome=tagged('CargoResult',{outcome:syntax===undefined?tagged('CargoUnsupported'):tagged('CargoInspected',{syntax})});break}
        case tag('InspectRustModules'):{const source=lookup('CaptureToken',op.capture);const facts=await inspectRustModules(source.text);outcome=tagged('RustModulesResult',{outcome:facts===undefined?tagged('RustModulesUnsupported'):tagged('RustModulesInspected',{names:list(facts.names)})});break}
        case tag('ObserveDiagnostic'):try{diagnostic?.(op.path,fromDiagnostic(op.diagnostic))}catch{}outcome=tagged('DiagnosticObserved');break
        case tag('EncodeProduct'):outcome=tagged('ProductEncoded',{bytes:Buffer.byteLength(JSON.stringify(fromProductValue(op.value)),'utf8')});break
        case tag('EncodeSourceText'):outcome=tagged('SourceTextEncoded',{bytes:Buffer.byteLength(op.text,'utf8')});break
        default:throw new Error('unknown service operation')
      }
    }catch(error){if(closed||!accepting)throw error;outcome=tagged('ProviderRejected',{exception:register('ExceptionToken',error)})}
    return tagged('Reply',{invocation,id,outcome})
  }
  return Object.freeze({invocation,callerCache:caller,perform,registerCapture:value=>register('CaptureToken',value),exception:token=>lookup('ExceptionToken',token),cacheSnapshot:token=>[...lookup('CacheToken',token)],revoke(){accepting=false},close(){closed=true;accepting=false;for(const table of Object.values(resources))table.clear()}})
}

export function createServiceRegistry() {
 const sessions=new Map()
 const register=session=>{if(sessions.has(session.invocation))throw new Error('duplicate active invocation');sessions.set(session.invocation,session)}
 const remove=session=>{if(sessions.get(session.invocation)!==session)throw new Error('wrong registry owner');sessions.delete(session.invocation)}
 return Object.freeze({get:id=>sessions.get(id),get size(){return sessions.size},register,remove,async run(session,task){let registered=false;try{register(session);registered=true;return await task()}finally{if(registered){session.close();remove(session)}}}})
}
