import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {unlist} from './service-session.mjs'
import {projectPythonSyntax} from './python-module/syntax-projection.mjs'
import {Parser,Python,descendants,sameSyntaxNode} from '../../../dist/direct-event/languages/native-parser.js'
const temp=await mkdtemp('/tmp/hapsland-python-authority-')
try{
 const emitted=join(temp,'child.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'PythonModule.bend'),'-o',emitted],{timeout:5000});const {default:child}=await import(pathToFileURL(emitted))
 const source=await readFile(join(import.meta.dirname,'../languages/python.ts'),'utf8')
 const fragments=source.slice(source.indexOf('const assignment ='),source.indexOf('const primitives ='))+source.slice(source.indexOf('const staticTypeBlock ='),source.indexOf('const importedReference ='))
 const js=execFileSync('bun',['-e','process.stdout.write(new Bun.Transpiler({loader:"ts"}).transformSync(await Bun.stdin.text()))'],{input:fragments,encoding:'utf8',timeout:5000})
 const native=Function('Parser','Python','descendants','sameSyntaxNode',js.replace('export const pythonImports','const pythonImports')+'\nreturn {pythonImports,staticPackageAuthority,moduleScope,unavailableImportNamespace,unknownEvaluatedCall}')(Parser,Python,descendants,sameSyntaxNode)
 const fixtures=[
  '', 'class C: pass\n', 'class :\n', 'from .foo import Foo\n', 'import foo.bar\n', 'import foo.bar as Alias\n',
  'from . import foo as Alias\n', 'from dataclasses import dataclass\nfrom .foo import Foo\n',
  'from .foo import Foo\nFoo = 1\n', 'from .foo import Foo\nfrom .bar import Foo\n',
  'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n from .foo import Foo\n',
  'import typing as t\nif t.TYPE_CHECKING:\n from .foo import Foo\n',
  'from typing import TYPE_CHECKING\nTYPE_CHECKING = False\nif TYPE_CHECKING:\n from .foo import Foo\n',
  'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n from .foo import Foo\nelse:\n from .bar import Foo\n',
  'if flag:\n from .foo import Foo\n', 'for item in items:\n pass\n', 'while flag:\n pass\n',
  'try:\n pass\nexcept Exception:\n pass\n', 'with manager:\n pass\n', 'x=1\n', '(x := 1)\n',
  'a, b = values\n', 'x[0]=1\n', 'x.attr=1\n', 'del x\n',
  'def f():\n run()\n', 'def f(x=run()):\n pass\n', 'f = lambda: run()\n', 'f = lambda x=run(): x\n',
  'class C:\n run()\n', 'class C(metaclass=M):\n pass\n',
  'from dataclasses import dataclass\n@dataclass\nclass C:\n x: int\n',
  'from dataclasses import dataclass\n@dataclass()\nclass C:\n x: int\n',
  'class C:\n @classmethod\n def f(cls):\n  run()\n',
  'class C:\n @staticmethod\n def f():\n  run()\n',
  'class C:\n @property\n def f(self):\n  run()\n',
  'classmethod = custom\nclass C:\n @classmethod\n def f(cls): pass\n',
  'class C:\n @classmethod\n def f(cls): pass\n classmethod = custom\n',
  'from pydantic import Field\nclass C:\n x = Field()\n Field = custom\n',
  'from pydantic import Field\nclass C:\n x = Field()\n',
  'from pydantic import Field\ndef f():\n Field=custom\n return Field()\n',
  'from pydantic import Field\nf=lambda x=Field(): Field()\n',
  'from .foo import *\n', 'def f():\n from .foo import *\n',
  '__path__=[]\n', 'def __getattr__(name): pass\n', 'def f():\n __path__=[]\n',
  'import foo\nfoo.bar=1\n', 'import foo\nfoo[0]=1\n', 'import foo\ndel foo.bar\n',
  'import foo\nfoo=object\nfoo.bar=1\n', 'import foo\nclass C:\n foo.bar=1\n',
  'import typing as t\nlocal = 1\ndel local.x, t.x\n',
  'import typing as t\nlocal = 1\nlocal.x, t.x = values\n',
  'import typing as t\nlocal = 1\nlocal[0], t.x = values\n',
  'import foo\ndef f():\n foo.bar=1\n', 'import foo\nf=lambda: (foo.bar := 1)\n',
  'type Alias[T] = list[T]\n', 'from .foo import Foo as 删除\n',
  'import sys\nsys.path.append("x")\n', 'import importlib\nimportlib.import_module("x")\n',
  'exec("pass")\n', 'from pydantic import Field\nx = Field(default_factory=call())\n',
  'from dataclasses import field\nclass C:\n x=field(default_factory=lambda: run())\n',
  'from pydantic import Field\nclass C:\n def f(self, x=Field()): pass\n Field=custom\n',
  'import pkg.child\nfrom .foo import Foo\n', 'from __future__ import annotations\n'
 ]
 let rows=0
 for(const text of fixtures){const parser=new Parser();try{
  parser.setLanguage(Python);const root=parser.parse(text).rootNode,syntax=projectPythonSyntax(root);rows+=unlist(syntax.nodes).length
  const nativeScope=native.moduleScope(root),scope=child.module_scope(syntax)
  assert.equal(child.unknown_evaluated(syntax,scope),native.unknownEvaluatedCall(root,nativeScope.bindings,new Set(nativeScope.facts.map(f=>f.name))),text+' unknown call')
  assert.equal(child.unavailable_namespace(syntax,scope),native.unavailableImportNamespace(root,nativeScope.bindings),text+' namespace')
  const expected=native.pythonImports(text),result=child.python_imports(syntax)
  assert.deepEqual(result.$==='None'?undefined:unlist(result.value).map(row=>[row.key,{path:row.path,name:row.name,module:row.module,prefix:row.prefix}]),expected===undefined?undefined:[...expected],text+' imports')
  assert.equal(child.static_package_authority(syntax),native.staticPackageAuthority(text),text+' package authority')
  for(const name of ['Foo','foo','__path__','C','删除'])assert.equal(child.has_package_binding(syntax,name),nativeScope.facts.some(f=>f.name===name),text+' binding '+name)
 }finally{parser.reset()}}
 const dynamic=name=>/^(?:sys\.(?:path|meta_path|path_hooks|modules)(?:[.[]|$)|importlib\.|builtins\.(?:__import__|exec|eval|setattr|delattr))/u.test(name)||/^(?:__import__|exec|eval|globals|locals|setattr|delattr)(?:$|\()/u.test(name)
 let boundaries=0
 for(const prefix of ['sys.path','sys.meta_path','sys.path_hooks','sys.modules','importlib.','builtins.__import__','builtins.exec','builtins.eval','builtins.setattr','builtins.delattr','__import__','exec','eval','globals','locals','setattr','delattr','other'])for(const suffix of ['','.child','[0]','(','evil','_x','\n','()']){const name=prefix+suffix;assert.equal(child.dynamic_call(name),dynamic(name),name);boundaries++}
 console.log(JSON.stringify({status:'PASS',cases:fixtures.length,nativeRows:rows,regexBoundaries:boundaries,scope:'whole native namespace/pythonImports/staticPackageAuthority/hasPackageBinding policies over raw physical syntax; not GraphSession/Canonical acceptance'}))
}finally{await rm(temp,{recursive:true,force:true})}
