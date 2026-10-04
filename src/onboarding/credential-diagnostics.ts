import type { CredentialResolution } from "../credentials/secret-service.ts"
import type { DoctorCheck } from "./doctor.ts"

type CredentialReadiness = Pick<CredentialResolution, "status" | "source">
const needsInteraction = (status: CredentialReadiness["status"]): boolean =>
  status === "locked" || status === "interaction-required"
const credentialAction = (credential: CredentialReadiness, envVar: string): string | undefined => {
  if (credential.status === "present") return undefined
  if (credential.source === "environment")
    return `make ${envVar} available to the installed hook environment, then rerun doctor`
  if (needsInteraction(credential.status))
    return "run hapsland --login in a user terminal and unlock or approve native credential access; background hooks never prompt"
  switch (credential.status) {
    case "timed-out":
      return "repair or unlock the native credential store; its noninteractive lookup exceeded the 750 ms deadline"
    case "suspended":
      return "reconcile the suspended credential with hapsland --login or hapsland --logout before review"
    case "unavailable":
      return "reinstall an archive containing the native helper for this platform if it is missing, or restore native credential access; then rerun doctor"
    default:
      return "store a credential with hapsland --login, then rerun doctor"
  }
}
const credentialStatus = (status: CredentialReadiness["status"]): DoctorCheck["status"] => {
  if (status === "present") return "ready"
  return status === "invalid" || status === "suspended" ? "conflict" : "missing"
}
const hookAccessibility = (credential: CredentialReadiness) => {
  if (credential.source === "saved" && credential.status === "present")
    return "available-via-noninteractive-native-lookup"
  if (credential.source === "environment" && credential.status === "present")
    return "requires-host-environment-verification"
  return "unavailable"
}

export const credentialDiagnostic = (
  credential: CredentialReadiness,
  envVar: string,
  environmentPresent: boolean
): DoctorCheck => {
  const action = credentialAction(credential, envVar)
  return {
    stage: "credential-accessibility",
    status: credentialStatus(credential.status),
    observed: {
      inspectedContext: "doctor-process",
      configuredEnvironmentVariable: envVar,
      doctorProcessEnvironment: environmentPresent ? "present" : "absent",
      actualHookAccessibility: hookAccessibility(credential),
      savedCredentialAccessibility:
        credential.source === "saved" ? credential.status : "not-selected-environment-precedence",
      selectedSource: credential.source
    },
    ...(action === undefined ? {} : { action })
  }
}
