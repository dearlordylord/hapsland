import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {withDirectEntry} from '/workspace/typescript/hapsland-bend-selection-ui/evidence/bend-strangler/local-graph-direct-entry.mjs'
const temp=mkdtempSync('/tmp/hapsland-direct-entry-negative-')
try{
 const path=temp+'/core.mjs';execFileSync('bend',['evidence/bend-strangler/local-graph-representation-prototypes/nat-route/core.bend','-o',path],{timeout:5000});writeFileSync(path,withDirectEntry(readFileSync(path,'utf8')));const {directPlan}=await import(pathToFileURL(path));
 const dn=()=>({$:'Own.DNil'}),args=[{$:'Facts',kind_aware:false,declarations:dn(),imports:dn(),supporting:dn()},4,{$:'Label',key:1,type_key:2,function_key:3},{$:'AnyKind'},dn(),{$:'Budget',limits:{$:'LocalLimits',work:128,depth:4,targets:16},targets_by_path:dn(),max_targets:0,work:0,graph_work:0,max_depth:0},0];assert.equal(directPlan(...args).$,'MissingRoot');
 const cases=[['inherited-constructor',a=>a[0]={$:'__proto__'}],['inherited-tag',a=>{const x=a[0];delete x.$;a[0]=Object.assign(Object.create({$:'Facts'}),x)}],['inherited-requiredfield',a=>{const x=a[0],imports=x.imports;delete x.imports;x.extra=0;a[0]=Object.assign(Object.create({imports}),x)}],['wrongbool',a=>a[0].kind_aware=1],['negativeNat',a=>a[6]=-1],['fractionalNat',a=>a[6]=.5],['unsafeNat',a=>a[6]=281474976710656],['uint32overflow',a=>a[1]=4294967296],['unknownvariant',a=>a[3].$='Unknown'],['missingfield',a=>delete a[0].imports]];
 for(const [,change]of cases){const malformed=structuredClone(args);change(malformed);assert.throws(()=>directPlan(...malformed),TypeError)}
 const record={at:new Date().toISOString(),cases:cases.map(([name])=>name),allRejected:true,validMissingRoot:true};writeFileSync('evidence/bend-strangler/local-graph-direct-entry-negative-check.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temp,{recursive:true,force:true})}
