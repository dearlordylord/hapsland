// Source metadata only; derive package-directory size risks without reading or executing extra source.
import fs from 'node:fs';import path from 'node:path';
const resultPath=process.argv[2],result=JSON.parse(fs.readFileSync(resultPath,'utf8'));
for(const repo of result.repositorySummary){
 const sample=result.records.filter(r=>r.repo===repo.repo),sha=sample[0].commit;
 const tree=await (await fetch(`https://api.github.com/repos/${repo.repo}/git/trees/${sha}?recursive=1`,{headers:{'User-Agent':'Hapsland-language-research'}})).json();if(tree.truncated||!tree.tree)throw new Error('Incomplete tree');
 const files=tree.tree.filter(x=>x.type==='blob'&&x.path.endsWith('.go')&&!('/'+x.path).includes('/vendor/')).map(x=>x.path),dirs={};
 for(const p of files){const d=path.posix.dirname(p);dirs[d]??={all:0,nonTest:0};dirs[d].all++;if(!p.endsWith('_test.go'))dirs[d].nonTest++;}
 const prod=sample.filter(x=>!x.test&&!x.generated);const roots=x=>x.roots.types+x.roots.functions+x.roots.methods;
 repo.directoryAuthority={frameDirectories:Object.keys(dirs).length,directoriesOver8All:Object.values(dirs).filter(x=>x.all>8).length,directoriesOver8NonTest:Object.values(dirs).filter(x=>x.nonTest>8).length,sampledProductionFilesInNonTestDirsOver8:prod.filter(x=>dirs[path.posix.dirname(x.path)].nonTest>8).length,sampledProductionRootsInNonTestDirsOver8:prod.filter(x=>dirs[path.posix.dirname(x.path)].nonTest>8).reduce((n,x)=>n+roots(x),0),maxNonTestFilesInDirectory:Math.max(...Object.values(dirs).map(x=>x.nonTest))};
}
fs.writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.repositorySummary.map(x=>({repo:x.repo,...x.directoryAuthority})),null,2));
