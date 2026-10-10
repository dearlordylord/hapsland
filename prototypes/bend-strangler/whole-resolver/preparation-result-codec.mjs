import {fromProductValue,unlist,hostNatural} from './service-session.mjs'
const optional=value=>{if(value.$==='None')return undefined;if(value.$==='Some')return value.value;throw new TypeError('Malformed preparation Maybe')}
const diagnostic=value=>{
 switch(value.$) {
  case 'ProviderDiagnostic':return fromProductValue(value.value)
  case 'CaptureBudget':return {stage:'capture',code:'capture-budget-limit',args:{resource:value.resource,used:hostNatural(value.used),requested:hostNatural(value.requested),limit:hostNatural(value.limit)}}
  case 'MaterializationRefused':return {stage:'preparation',code:'preparation-resource-refused',args:{phase:'materialization',requestedBytes:hostNatural(value.requested),constraint:value.constraint}}
  case 'PreparationPanic':return {stage:'preparation',code:'panic',args:{boundary:'review-preparation'}}
  default:throw new TypeError('Unknown preparation diagnostic')
 }
}
// Closed nominal ABI projection. Selection, merging and completeness are Bend
// results; this adapter does not re-run preparation or calculate semantic identity.
export function decodePreparationResult(result,advicee) {
 if(result.$!=='PreparationResult'||typeof result.complete!=='boolean')throw new TypeError('Malformed preparation result')
 const paths=unlist(result.paths).map(path=>{
  if(path.$==='Incomplete') {
   const reason=optional(path.reason),rawDiagnostic=optional(path.diagnostic)
   return {status:'incomplete',path:path.path,...(reason===undefined?{}:{reason}),...(rawDiagnostic===undefined?{}:{diagnostic:diagnostic(rawDiagnostic)})}
  }
  if(path.$!=='Observed')throw new TypeError('Unknown preparation path')
  const operation={CandidateAdd:'add',CandidateUpdate:'update'}[path.operation.$]
  if(operation===undefined)throw new TypeError('Invalid observed operation')
  const failures=unlist(path.failures).map(failure=>({root:optional(failure.root),reason:failure.reason}))
  return {status:'observed',path:path.path,snapshot:{path:path.path,operation,sourceHash:path.content_hash},units:unlist(path.units).map(fromProductValue),analysis:failures.length?{status:'incomplete',failures}:{status:'complete'}}
 })
 const units=unlist(result.units).map(fromProductValue)
 const observation=result.complete?{status:'complete',changeSet:{status:'complete',changes:paths.map(path=>{if(path.status!=='observed')throw new TypeError('Malformed complete preparation path');return path.snapshot}),units},outcomes:paths}:{status:'incomplete',outcomes:paths,units}
 const outcomes=unlist(result.outcomes).map(outcome=>{
  if(outcome.$==='OutcomeSkipped')return {status:'skipped',path:outcome.path}
  if(outcome.$!=='OutcomeReady')throw new TypeError('Unknown preparation outcome')
  const prepared=fromProductValue(outcome.prepared)
  return {status:'ready',path:outcome.path,prepared:advicee===undefined?prepared:{...prepared,advicee}}
 })
 return {observation,outcomes}
}
