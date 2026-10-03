import Base
import ./sharing-original-inputs.bend as Inputs
import ../FreshnessScenario.bend as Freshness

# Factual label interning and original-input retention only. Neither helper
# decides whether an admission, replacement, cache hit or membership is legal.
type Label is Data:
  Subject{value: String}
  RevisionInput{value: String}
  Prepared{namespace: Inputs.Namespace}
type Identity is Data:
  Identity{label: Label, id: Nat}
type Labels is Data:
  Labels{entries: List<&2,Identity>, next: Nat}
type Interned is Data:
  Interned{labels: Labels, id: Nat}
type Original is Data:
  Original{scope: Freshness.Scope, edit: Inputs.Edit}
type SourceCapture is Data:
  SourceCapture{labels: Labels, source: Freshness.Source}

# Compare the exact production namespace string, including its standalone and
# controlled sentinels. Comparing the two JSON object fields is equivalent to
# comparing their injective JSON spelling; no alternate namespace policy.
def work_text(value: Maybe<&2,String>) -> String:
  match value:
    case None{}: "standalone"
    case Some{text}: text

def credential_text(value: Maybe<&2,Nat>) -> String:
  match value:
    case None{}: "controlled"
    case Some{number}: Nat.show(number)

def namespace_text(partition: String, work: Maybe<&2,String>, credential: Maybe<&2,Nat>) -> String:
  String.concat([partition,SCon{Chr{0},"work:"},work_text(work),
    SCon{Chr{0},"credential-generation:"},credential_text(credential)])

def same_namespace(left: Inputs.Namespace, right: Inputs.Namespace) -> Bool:
  match left right:
    case Inputs.Namespace{p,w,c,i} Inputs.Namespace{other_p,other_w,other_c,other_i}:
      String.eq(namespace_text(p,w,c),namespace_text(other_p,other_w,other_c)) && String.eq(i,other_i)

def same(left: Label, right: Label) -> Bool:
  match left right:
    case Subject{a} Subject{b}: String.eq(a,b)
    case RevisionInput{a} RevisionInput{b}: String.eq(a,b)
    case Prepared{a} Prepared{b}: same_namespace(a,b)
    case _ _: False{}

def selected(equal: Bool, id: Nat, rest: Maybe<&2,Nat>) -> Maybe<&2,Nat>:
  match equal:
    case True{}: Some{id}
    case False{}: rest

def lookup(entries: List<&2,Identity>, +label: Label) -> Maybe<&2,Nat>:
  match entries:
    case []: None{}
    case Identity{other,id} <> tail: selected(same(label,other),id,lookup(tail,label))

def intern_found(found: Maybe<&2,Nat>, label: Label, labels: Labels) -> Interned:
  match found labels:
    case Some{id} labels: Interned{labels,id}
    case None{} Labels{entries,+next}: Interned{Labels{List.append(&2,Identity,entries,[Identity{label,next}]),Nat.add(next,1n)},next}

def intern(+labels: Labels, +label: Label) -> Interned:
  match labels:
    case Labels{+entries,_}: intern_found(lookup(entries,label),label,labels)

def source_input(subject: Nat, value: Interned) -> SourceCapture:
  match value:
    case Interned{labels,input}: SourceCapture{labels,Freshness.Source{subject,input}}

def source_subject(subject: Interned, input: String) -> SourceCapture:
  match subject:
    case Interned{labels,id}: source_input(id,intern(labels,RevisionInput{input}))

def source(labels: Labels, edit: Inputs.Edit) -> SourceCapture:
  match edit:
    case Inputs.Edit{_,_,_,_,subject,input,_}: source_subject(intern(labels,Subject{subject}),input)

def prepared(labels: Labels, edit: Inputs.Edit) -> Interned:
  match edit:
    case Inputs.Edit{_,_,_,_,_,_,namespace}: intern(labels,Prepared{namespace})

def original_found(equal: Bool, original: Original, rest: Maybe<&2,Original>) -> Maybe<&2,Original>:
  match equal:
    case True{}: Some{original}
    case False{}: rest

def original(entries: List<&2,Original>, +scope: Freshness.Scope) -> Maybe<&2,Original>:
  match entries:
    case []: None{}
    case Original{+owner,+edit} <> tail:
      original_found(Freshness.same(owner,scope),Original{owner,edit},original(tail,scope))
