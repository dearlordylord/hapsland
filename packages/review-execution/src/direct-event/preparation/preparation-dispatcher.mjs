// Mechanical dispatch only: Bend chooses each contract, candidate and root.
// Canonical owns lifecycle through the same driver envelope as resolver children.
export function createPreparationMachine(core) {
 const pump=initial=>{
  let step=initial
  for(let count=0;count<10000;count++) {
   if(step.$!=='Internal')return step
   step=core.advance(step.state)
  }
  throw new Error('Preparation internal dispatch did not settle')
 }
 return {
  initial:input=>pump(core.initial(input.invocation,input.preparation)),
  resume:(step,event)=>{
   if(event.$!=='Types.ServiceReply')throw new Error('Invalid preparation reply envelope')
   return pump(core.resume(step,event.reply))
  },
  view:step=>{
   switch(step.$) {
    case 'Await':return {$:'Types.AwaitService',request:step.request}
    case 'Finished':return {$:'PreparationFinished',result:step.result}
    case 'Failed':return {$:'PreparationFailed',reason:step.reason}
    default:throw new Error('Unsettled preparation projection')
   }
  },
  accepted:projection=>{
   if(projection.$==='PreparationFinished')return {preparation:projection.result}
   if(projection.$==='PreparationFailed')return {failure:{reason:projection.reason}}
   throw new Error('Invalid accepted preparation projection')
  },
  disposeInvocation(){},
  get retainedHandles(){return 0}
 }
}
