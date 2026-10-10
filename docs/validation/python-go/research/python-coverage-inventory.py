"""Read pinned public source archives; never import or execute surveyed projects.
Replay pinned corpus: python3 python-coverage-inventory.py python-coverage-inventory.json > /tmp/python-coverage-replay.json
Without argument discovers HEAD once; retained JSON supplies exact replay pins.
The declared corpus is purposive, not a population sample. Python 3.11 AST errors stay counted.
"""
import ast, collections, concurrent.futures, hashlib, io, json, platform, sys, tarfile, urllib.request
PINNED = {r['repo']: r['commit'] for r in json.load(open(sys.argv[1]))['repos']} if len(sys.argv)>1 else {}
REPOS=[('pydantic/pydantic-ai','AI framework'),('openai/openai-agents-python','AI framework'),('langchain-ai/langgraph','AI framework'),('khoj-ai/khoj','AI application'),('fastapi/full-stack-fastapi-template','backend application template'),('BerriAI/litellm','AI gateway')]
def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Hapsland-research'}),timeout=60).read()
def inventory(entry):
    repo,stratum=entry
    sha=PINNED.get(repo) or json.loads(fetch('https://api.github.com/repos/'+repo+'/commits?per_page=1'))[0]['sha']
    data=fetch('https://codeload.github.com/'+repo+'/tar.gz/'+sha)
    files=[]; totals=collections.Counter(); imports=collections.Counter()
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
        for member in archive:
            path='/'.join(member.name.split('/')[1:]); parts=path.split('/')
            if not member.isfile() or not path.endswith(('.py','.pyi')): continue
            if any(x in {'tests','test','docs','examples','benchmarks','.venv','venv','migrations','node_modules'} for x in parts) or parts[-1].startswith('test_'): continue
            raw=archive.extractfile(member).read(); counts=collections.Counter(); counts['files']=1
            if path.endswith('/__init__.py'): counts['init_files']=1
            if path.endswith('.pyi'): counts['stub_files']=1
            try: tree=ast.parse(raw,filename=path)
            except (SyntaxError,UnicodeError) as e:
                files.append({'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'parse_error':str(e)}); totals['files']+=1; totals['parse_errors']+=1; continue
            def visit(node,parent=None):
                if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
                    counts['functions']+=1; counts['methods' if isinstance(parent,ast.ClassDef) else 'other_functions']+=1
                    if isinstance(node,ast.AsyncFunctionDef): counts['async_functions']+=1
                    if node.decorator_list: counts['decorated_functions']+=1
                    args=node.args.posonlyargs+node.args.args+node.args.kwonlyargs
                    if node.returns or any(a.annotation for a in args): counts['annotated_functions']+=1
                if isinstance(node,ast.ClassDef):
                    counts['classes']+=1
                    if any(isinstance(n,ast.AnnAssign) for n in node.body): counts['classes_with_annotated_fields']+=1
                    bases=[ast.unparse(n).split('.')[-1].split('[')[0] for n in node.bases]
                    for label in ['BaseModel','TypedDict','Protocol','Enum','NamedTuple']:
                        if label in bases: counts['syntactic_'+label+'_classes']+=1
                    if any('dataclass' in ast.unparse(d) for d in node.decorator_list): counts['syntactic_dataclass_classes']+=1
                if isinstance(node,ast.Import):
                    counts['import_statements']+=1
                    for a in node.names: imports[a.name.split('.')[0]]+=1; counts['import_aliases']+=bool(a.asname)
                if isinstance(node,ast.ImportFrom):
                    counts['from_statements']+=1; counts['relative_from_statements']+=bool(node.level)
                    if node.module: imports[node.module.split('.')[0]]+=1
                    counts['wildcard_statements']+=any(a.name=='*' for a in node.names)
                    counts['import_aliases']+=sum(bool(a.asname) for a in node.names)
                    if path.endswith('/__init__.py'): counts['init_from_statements']+=1
                if isinstance(node,ast.If) and 'TYPE_CHECKING' in ast.unparse(node.test): counts['type_checking_guards']+=1
                if isinstance(node,ast.AnnAssign): counts['annotated_assignments']+=1
                if isinstance(node,ast.Call) and ast.unparse(node.func) in {'__import__','importlib.import_module','import_module'}: counts['syntactic_dynamic_import_calls']+=1
                for child in ast.iter_child_nodes(node): visit(child,node)
            visit(tree)
            totals.update(counts); files.append({'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'counts':dict(counts)})
    return {'repo':repo,'stratum':stratum,'commit':sha,'archive_sha256':hashlib.sha256(data).hexdigest(),'counts':dict(totals),'import_roots':imports.most_common(35),'files':sorted(files,key=lambda f:f['path'])}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: result=list(pool.map(inventory,REPOS))
PREFIXES={'pydantic/pydantic-ai':('pydantic_ai_slim/','pydantic_evals/','pydantic_graph/','src/','clai/clai/'),'openai/openai-agents-python':('src/agents/',),'langchain-ai/langgraph':('libs/',),'khoj-ai/khoj':('src/khoj/',),'fastapi/full-stack-fastapi-template':('backend/app/',),'BerriAI/litellm':('litellm/','enterprise/litellm_enterprise/')}
for r in result:
    files=[f for f in r['files'] if f['path'].startswith(PREFIXES[r['repo']]) and '/alembic/' not in f['path']]
    counts=collections.Counter()
    for f in files: counts.update(f.get('counts', {'files':1,'parse_errors':1}))
    r['focused_subsample']={'include_prefixes':PREFIXES[r['repo']],'exclude_contains':['/alembic/'],'counts':dict(counts),'files':[f['path'] for f in files]}

print(json.dumps({'date':'2026-10-09','python':platform.python_version(),'source_class':'RUN','verification_state':'RUNTIME-TESTED','proposition':'Read-only AST inventory counts at pinned source commits, not adapter or semantic coverage','selection':'Six purposively chosen AI frameworks/applications/gateway/backend template; production-like .py/.pyi files; excludes named tests/docs/examples/benchmarks/migrations directories and test_ files; remaining utility/generated files can be present','limitations':['Not representative usage or edit frequency','AST 3.11 failures remain in file denominator','Syntactic base/decorator names can be aliases or shadowed; counts are not resolved model identities','No project code executed; no Hapsland extraction/binding tested'],'repos':result},indent=2))
