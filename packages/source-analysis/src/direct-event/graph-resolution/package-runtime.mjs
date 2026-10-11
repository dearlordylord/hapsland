import assert from 'node:assert/strict'
import {parse} from '@babel/parser'
import {readFileSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'

// Packaging experiment: retain the compiler's resolve expression verbatim.
// Unknown export layouts fail closed; no implementation or converter is edited.
export function packageRuntime(sourcePath,outputPath){
 const source=readFileSync(sourcePath,'utf8'),ast=parse(source,{sourceType:'module'})
 const exports=ast.program.body.filter(node=>node.type.startsWith('Export'))
 assert.equal(exports.length,1)
 const declaration=exports[0]
 assert.equal(declaration.type,'ExportDefaultDeclaration')
 assert.equal(declaration.declaration.type,'ObjectExpression')
 const properties=declaration.declaration.properties
 assert.ok(properties.every(node=>node.type==='ObjectProperty'&&!node.computed&&node.key.type==='StringLiteral'))
 const selected=properties.filter(node=>node.key.value==='resolve')
 assert.equal(selected.length,1)
 assert.equal(selected[0].value.type,'CallExpression')
 assert.equal(selected[0].value.callee.name,'run_lib')
 assert.deepEqual([...source.matchAll(/io_eff\("([^"]+)",/g)].map(match=>match[1]),['perform'])
 assert.ok(!source.includes('cli(process.argv.slice(1))'))
 const entry=outputPath+'.entry.mjs'
 writeFileSync(entry,source.slice(0,declaration.start)+'export default {'+source.slice(selected[0].start,selected[0].end)+'};'+source.slice(declaration.end)+'\nexport const handlers=Object.freeze({perform:$0eff.perform});\n')
 const builder=outputPath+'.build.mjs'
 writeFileSync(builder,`import assert from 'node:assert/strict'; assert.equal(Bun.version,'1.3.14'); const result=await Bun.build({entrypoints:[${JSON.stringify(entry)}],target:'node',format:'esm',minify:{whitespace:false,syntax:false,identifiers:false,keepNames:true},ignoreDCEAnnotations:true}); assert.ok(result.success,JSON.stringify(result.logs)); assert.equal(result.outputs.length,1); await Bun.write(${JSON.stringify(outputPath)},result.outputs[0]);`)
 execFileSync(join(import.meta.dirname,'../../../../../node_modules/bun/bin/bun.exe'),[builder],{timeout:10000})
 return {originalBytes:Buffer.byteLength(source),packagedBytes:Buffer.byteLength(readFileSync(outputPath))}
}
