import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
import * as Effect from 'effect/Effect'
import {recordActivity} from '@hapsland/activity-observation/activity/status'
import {MAX_IPC_FRAME_BYTES} from '@hapsland/resident-transport/resident/protocol'
import {residentUnitWorstOutcomeBytes,residentUnitReservationBytes} from '../../../packages/resident-runtime/src/resident/work-ownership/reservation.ts'
import {withinWork} from '../../../packages/resident-runtime/src/resident/work-ownership/cancellation.ts'
import {ResidentAdapterError} from '../../../packages/resident-runtime/src/resident/adapter-error.ts'
import {planPreparedUnits} from '../../../packages/resident-runtime/src/resident/review-work/preparation/planning.ts'
import {observePlannedEvaluation,recordReuseObservation,retainPreparedUnit} from '../../../packages/resident-runtime/src/resident/review-work/preparation/retention.ts'
// Explicit temporary TS child. Exercise the entire current admission/planning/
// completion/retention sequence from its actual source, without copying policy.
const source=await readFile(new URL('../../../packages/resident-runtime/src/resident/review-work/preparation/capture.ts',import.meta.url),'utf8')
const start=source.indexOf('    context.deps.residentInspection.observePreparation(context.job, prepared)'),terminal='    return yield* retainPreparedUnits()',end=source.indexOf(terminal,start)
if(start<0||end<start)throw new Error('Native post-preparation owner moved')
const body=stripTypeScriptTypes('function* child(context, prepared, preparation, pathObservation, analyticsEnabled) {\nconst workspace=preparation.reservation;\n'+source.slice(start,end+terminal.length)+'\n}',{mode:'transform'})
const dependencies={Effect,recordActivity,MAX_IPC_FRAME_BYTES,residentUnitWorstOutcomeBytes,residentUnitReservationBytes,withinWork,ResidentAdapterError,planPreparedUnits,observePlannedEvaluation,recordReuseObservation,retainPreparedUnit}
const child=new Function(...Object.keys(dependencies),body+'\nreturn child;')(...Object.values(dependencies))
export const nativePostPreparation=(...args)=>Effect.gen(()=>child(...args))
