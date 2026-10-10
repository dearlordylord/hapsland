import {list} from '../service-session.mjs'

// Exact native node identity is projected to call-local stable row IDs.
// All data here is parser syntax; no binding, authority or import decision.
export function projectPythonSyntax(rootNode){
  const rows=[],ids=new Map(),fieldNames=['name','alias','module_name','left','right','definition','condition','consequence','alternative','function','parameters','body','superclasses','value','type','type_parameters','argument','arguments','object','attribute']
  function project(node){
   const known=ids.get(node.id)
   if(known!==undefined)return known
   const id=rows.length;ids.set(node.id,id);rows.push(null)
   const children=node.namedChildren.map(project)
   const fields=[]
   for(const name of fieldNames){
    const child=node.childForFieldName(name)
    if(child!==null)fields.push({$:'Types.SyntaxField',name,child:project(child)})
   }
   rows[id]={$:'Types.PythonSyntaxNode',id,kind:node.type,text:node.text,start:node.startIndex,end:node.endIndex,children:list(children),fields:list(fields)}
   return id
  }
  const root=project(rootNode)
  return {$:'Types.PythonSyntax',has_error:rootNode.hasError,root,nodes:list(rows)}
}
