// Source-only pinned inventory. No repository code is executed or built.
// Replay: TREE_SITTER_PREBUILD=/runtime-dir GO_COVERAGE_DEPS=/isolated/node_modules
// node docs/research/evidence/go-coverage-inventory.mjs manifest.json output.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.env.GO_COVERAGE_DEPS || process.cwd()+'/node_modules','package.json'));
const Parser=require('tree-sitter'), Go=require('tree-sitter-go');
const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const parser=new Parser();parser.setLanguage(Go);
const records=[];
for(const repo of manifest){
 for(const file of repo.files){
  const url=`https://raw.githubusercontent.com/${repo.repo}/${repo.commit}/${file.path}`;
  const body=file.local&&fs.existsSync(file.local)?fs.readFileSync(file.local):Buffer.from(await (await fetch(url)).arrayBuffer());
  if(crypto.createHash('sha256').update(body).digest('hex')!==file.sha256)throw new Error('Hash mismatch '+url);
  const text=body.toString('utf8'),tree=parser.parse(text),counts={},imports=[];
  function visit(n){counts[n.type]=(counts[n.type]||0)+1;if(n.type==='import_spec')imports.push({path:n.childForFieldName('path')?.text,name:n.childForFieldName('name')?.text||null});for(const c of n.namedChildren)visit(c);}
  visit(tree.rootNode);
  const roots={types:0,functions:0,methods:0};for(const n of tree.rootNode.namedChildren){if(n.type==='type_declaration')roots.types+=n.namedChildren.filter(c=>c.type==='type_spec'||c.type==='type_alias').length;if(n.type==='function_declaration')roots.functions++;if(n.type==='method_declaration')roots.methods++;}
  const errors=[];function errs(n){if(n.type==='ERROR'||n.isMissing)errors.push({type:n.type,row:n.startPosition.row+1});for(const c of n.namedChildren)errs(c);}errs(tree.rootNode);
  records.push({repo:repo.repo,commit:repo.commit,path:file.path,sha256:file.sha256,bytes:body.length,hasError:tree.rootNode.hasError,errors,generated:/Code generated .* DO NOT EDIT/.test(text),test:file.path.endsWith('_test.go'),buildConstraint:/^\/\/go:build /m.test(text),platformSuffix:/_(linux|windows|darwin|freebsd|amd64|arm64|386)(?:_test)?\.go$/.test(file.path),counts,imports,roots});
 }
}
const summary={files:records.length,parseErrors:records.filter(x=>x.hasError).length,tests:records.filter(x=>x.test).length,generated:records.filter(x=>x.generated).length,buildConstraints:records.filter(x=>x.buildConstraint).length,platformSuffix:records.filter(x=>x.platformSuffix).length,nodes:{},importSpecs:records.flatMap(x=>x.imports).length,namedImports:records.flatMap(x=>x.imports).filter(x=>x.name&&x.name!=='_'&&x.name!=='.').length,dotImports:records.flatMap(x=>x.imports).filter(x=>x.name==='.').length,blankImports:records.flatMap(x=>x.imports).filter(x=>x.name==='_').length};
for(const r of records)for(const [k,v]of Object.entries(r.counts))summary.nodes[k]=(summary.nodes[k]||0)+v;
const output={date:'2026-10-09',sourceClass:'RUN',verificationState:'RUNTIME-TESTED',scope:'Pinned source syntax inventory only; neither semantic binding nor Hapsland support nor edit coverage',environment:{node:process.version,platform:process.platform,arch:process.arch,runtime:require('tree-sitter/package.json').version,grammar:require('tree-sitter-go/package.json').version},summary,records};
fs.writeFileSync(process.argv[3],JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(summary));
