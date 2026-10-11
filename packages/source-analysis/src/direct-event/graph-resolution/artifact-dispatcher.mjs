// Closed export dispatch only. Source-bearing artifact states stay behind handles.
// Prefix mode preserves immutable states for cloned probes. Operational mode
// consumes artifact handles; owned-artifact-driver binds their outer lifecycle
// to Canonical. Production resident preparation integration remains open.
export function createArtifactMachine({composition,parent,python,retainPrefixes=true}) {
 const handles=new Map();let next=1n
 const save=(invocation,artifact,state)=>{const id=next++;handles.set(id,{invocation,artifact,state});return {$:'ArtifactProtocol.StateHandle',invocation,id}}
 const load=(handle,artifact)=>{const stored=handles.get(handle.id);if(!stored||stored.invocation!==handle.invocation||stored.artifact!==artifact)throw new Error('Invalid artifact handle');if(!retainPrefixes)handles.delete(handle.id);return stored.state}
 const pump=initial=>{
  let step=initial
  for(let count=0;count<10000;count++) {
   if(step.$==='ParentCall') {
    const command=step.command;let raw
    switch(command.$) {
     case 'Initial': raw=parent.initial(command.input);break
     case 'ResumeParent': raw=parent.resume(load(command.handle,'parent'),command.event);break
     case 'Execute': raw=parent.execute(command.action);break
     default: throw new Error('Unknown parent dispatch tag '+command.$)
    }
    const handle=save(step.context.invocation,'parent',raw)
    try{step=composition.receive_parent(step,handle,raw)}finally{if(!retainPrefixes&&step.owner?.handle?.id!==handle.id)handles.delete(handle.id)}
    continue
   }
   if(step.$==='PythonCall') {
    const command=step.command;let raw
    switch(command.$) {
     case 'BeginPython': raw=python.begin(command.command);break
     case 'ResumePython': raw=python.resume(load(command.handle,'python'),command.reply);break
     default: throw new Error('Unknown Python dispatch tag '+command.$)
    }
    const handle=save(step.context.invocation,'python',raw)
    try{step=composition.receive_python(step,handle,python.view(raw))}finally{if(!retainPrefixes&&step.owner?.handle?.id!==handle.id)handles.delete(handle.id)}
    continue
   }
   if(step.$==='Service'||step.$==='Terminal') return step
   throw new Error('Unknown composition dispatch tag '+step.$)
  }
  throw new Error('Artifact dispatch did not settle')
 }
 return {initial:input=>pump(composition.initial(input)),resume:(step,event)=>pump(composition.resume(step,event)),view:composition.view,dispose:()=>handles.clear(),disposeInvocation:invocation=>{for(const [id,value] of handles)if(value.invocation===invocation)handles.delete(id)},get retainedHandles(){return handles.size}}
}
