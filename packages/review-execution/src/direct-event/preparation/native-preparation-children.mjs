import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
import {isBundledArtifact,languageForPath} from '@hapsland/source-analysis/direct-event/languages/registry'
import {bundledArtifactDomain} from '@hapsland/source-artifacts/direct-event/artifact-model'
import {freezeInput,freezeRules,semanticIdentity} from '@hapsland/review-definition/direct-event/model'
import {applicableRules} from '../../policy/rules.ts'
import {providerIdentity} from '@hapsland/review-definition/review-providers/catalog'
import {effectiveReviewBackend} from '@hapsland/runtime-inputs/configuration/resolve'
import {DEFAULT_REVIEW_BACKEND} from '@hapsland/runtime-environment/runtime/backend'
import {TYPE_INPUT_CONTRACT,FUNCTION_INPUT_CONTRACT} from '@hapsland/review-definition/rules/targets'
// Explicit temporary Hapsland policy child, not independently maintained parser
// facts. Extract the current private source owner; do not copy its algorithm or
// add a production export solely to make this prototype callable.
const source=await readFile(new URL('../pipeline.ts',import.meta.url),'utf8')
const section=(start,end)=>{
 const first=source.indexOf('const '+start+' ='),last=source.indexOf('const '+end+' =')
 if(first<0||last<=first)throw new Error('Native preparation owner moved: '+start)
 return source.slice(first,last)
}
const code=[section('unitHasOmissions','preparedBelongsTo'),section('current','currentPolicy'),section('currentRules','currentInputContract'),section('preparationCapabilities','captureCandidateRoot'),section('candidateRootLocation','hasVerifiedClaudeSpan')].join('\n')
const dependencies={isBundledArtifact,bundledArtifactDomain,languageForPath,freezeInput,freezeRules,semanticIdentity,applicableRules,providerIdentity,effectiveReviewBackend,DEFAULT_REVIEW_BACKEND,TYPE_INPUT_CONTRACT,FUNCTION_INPUT_CONTRACT}
export const nativePrepareReadyUnits=new Function(...Object.keys(dependencies),stripTypeScriptTypes(code,{mode:'transform'})+'\nreturn prepareReadyUnits;')(...Object.values(dependencies))
