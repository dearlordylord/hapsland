import type { profileFields } from "./client-command.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { formatCompatibility, formatProposal } from "./client-lifecycle.ts";
import type { SetupClient } from "./client-selection.ts";
import type { SetupRequest, runSetup } from "./setup.ts";
import type { execFileClosedStdin } from "./host-process.ts";

type SetupResult = Effect.Success<ReturnType<typeof runSetup>>;
type SetupStage = SetupResult["stages"][number];
export interface PilotOptions {
  readonly terminal: boolean;
  readonly host: SetupClient;
  readonly fields: ReturnType<typeof profileFields>;
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
}
export interface PilotPorts {
  readonly run: (request: SetupRequest, credentialEntered: () => void) => Effect.Effect<SetupResult, unknown>;
  readonly activate: Effect.Effect<void, unknown>;
  readonly doctor: Effect.Effect<Effect.Success<ReturnType<typeof execFileClosedStdin>>, unknown>;
  readonly confirm: (question: string) => Effect.Effect<boolean, unknown>;
  readonly write: (text: string) => void;
  readonly exitCode: (code: number) => void;
}
type PilotFrame = { readonly options: PilotOptions; readonly ports: PilotPorts; readonly hostName: string };
const setupStage = (result: SetupResult, name: SetupStage["stage"]): SetupStage | undefined =>
  result.stages.find((item) => item.stage === name);
const stageSummary = (result: SetupResult, name: SetupStage["stage"]): string =>
  setupStage(result, name)?.summary ?? "unavailable";
const stageStatus = (result: SetupResult, name: SetupStage["stage"]): string => setupStage(result, name)?.status ?? "";
const setupAction = (result: SetupResult, code: string) => result.actions.find((item) => item.code === code);
const writeSetupActions = (result: SetupResult, ports: PilotPorts): void => {
  for (const action of result.actions) ports.write(`Next: ${action.action}.\n`);
};
const compatibilitySetupReady = (frame: PilotFrame, result: SetupResult): boolean => {
  frame.ports.write(`Compatibility: ${stageSummary(result, "compatibility")}.\n`);
  for (const line of formatCompatibility(setupStage(result, "compatibility")?.observed)) frame.ports.write(`${line}\n`);
  if (stageStatus(result, "compatibility") === "complete") return true;
  frame.ports.write(`${result.actions[0]?.action ?? `Use a declared ${frame.hostName} profile.`}\n`);
  frame.ports.exitCode(3);
  return false;
};
const installationSetupReady = (frame: PilotFrame, result: SetupResult): boolean => {
  if (["complete", "pending", "partial"].includes(stageStatus(result, "installation"))) return true;
  frame.ports.write(`Installation: ${stageSummary(result, "installation")}.\n`);
  writeSetupActions(result, frame.ports);
  frame.ports.exitCode(result.status === "partial" ? 5 : 4);
  return false;
};
const installationStageProposal = (result: SetupResult): unknown => {
  const observed = setupStage(result, "installation")?.observed;
  return typeof observed === "object" && observed !== null && "proposal" in observed ? observed.proposal : undefined;
};
const approveSetupInstallation = Effect.fn("Pilot.approveInstallation")(function* (
  frame: PilotFrame,
  result: SetupResult,
  request: SetupRequest,
) {
  const action = setupAction(result, "approve-installation") ?? setupAction(result, "resume-installation");
  if (action === undefined) return request;
  frame.ports.write(`Installation preview:\n${formatProposal(installationStageProposal(result)).join("\n")}\n`);
  if (!(yield* frame.ports.confirm(`Install these entries in the selected ${frame.hostName} profile?`))) {
    frame.ports.write(`Installation was not changed. Run hapsland setup ${frame.options.host} to resume.\n`);
    return undefined;
  }
  const digest = action.authorization?.installProposalDigest;
  if (digest === undefined) return yield* Effect.fail(new Error("installation preview omitted its approval digest"));
  return { ...request, installProposalDigest: digest };
});
const setupCredentialComplete = (result: SetupResult): boolean =>
  stageStatus(result, "installation") === "complete" && stageStatus(result, "credential") === "complete";
const reportSetupCredential = (frame: PilotFrame, result: SetupResult, entered: boolean): boolean => {
  if (entered && stageStatus(result, "credential") === "complete")
    frame.ports.write(`Jev key saved in ${frame.options.platform === "darwin" ? "Keychain" : "Secret Service"}.\n`);
  frame.ports.write(`Credential: ${stageSummary(result, "credential")}. No paid verification or review was sent.\n`);
  if (setupCredentialComplete(result)) return true;
  writeSetupActions(result, frame.ports);
  frame.ports.exitCode(result.status === "partial" ? 5 : 6);
  return false;
};
const reportSetupRepository = (frame: PilotFrame, result: SetupResult): boolean => {
  frame.ports.write(`Repository: ${stageSummary(result, "repository")}.\n`);
  if (stageStatus(result, "repository") === "complete") return true;
  writeSetupActions(result, frame.ports);
  frame.ports.exitCode(6);
  return false;
};
const SetupDiagnosis = Schema.Struct({
  status: Schema.String,
  nextSteps: Schema.optionalKey(Schema.Array(Schema.Struct({ action: Schema.String }))),
  checks: Schema.optionalKey(Schema.Array(Schema.Struct({ stage: Schema.String, status: Schema.String }))),
});
const decodeSetupDiagnosis = Effect.fn("Pilot.decodeDiagnosis")(function* (stdout: string) {
  const parsed = yield* Effect.try(() => JSON.parse(stdout));
  return yield* Schema.decodeUnknownEffect(SetupDiagnosis)(parsed);
});
const writeSetupDiagnosis = (frame: PilotFrame, diagnosis: typeof SetupDiagnosis.Type): void => {
  frame.ports.write(`Offline readiness: ${diagnosis.status}.\n`);
  for (const next of diagnosis.nextSteps ?? []) frame.ports.write(`Next: ${next.action}.\n`);
  for (const check of diagnosis.checks ?? []) {
    if (check.status !== "ready") frame.ports.write(`${check.stage}: ${check.status}.\n`);
  }
  frame.ports.write(
    `After native ${frame.hostName} repository and hook trust, make an ordinary supported edit and inspect review activity.\n`,
  );
};
const diagnoseSetup = Effect.fn("Pilot.diagnose")(function* (frame: PilotFrame) {
  const doctor = yield* frame.ports.doctor;
  if (!doctor.succeeded) {
    frame.ports.write(
      `Readiness check could not complete. Run hapsland setup ${frame.options.host} again or hapsland doctor ${frame.options.host}.\n`,
    );
    frame.ports.exitCode(6);
    return;
  }
  const result = yield* decodeSetupDiagnosis(doctor.stdout).pipe(Effect.result);
  if (result._tag === "Failure") {
    frame.ports.write(
      `Readiness result was unreadable. Rerun hapsland setup ${frame.options.host} or hapsland doctor ${frame.options.host}.\n`,
    );
    frame.ports.exitCode(6);
    return;
  }
  writeSetupDiagnosis(frame, result.success);
});
const runApprovedSetup = Effect.fn("Pilot.runApproved")(function* (
  frame: PilotFrame,
  request: SetupRequest,
  entered: () => void,
  credentialWasEntered: () => boolean,
) {
  const result = yield* frame.ports.run({ ...request, interactive: true }, entered);
  frame.ports.write(`Installation: ${stageSummary(result, "installation")}.\n`);
  if (["complete", "partial"].includes(stageStatus(result, "installation"))) yield* frame.ports.activate;
  if (!reportSetupCredential(frame, result, credentialWasEntered())) return;
  if (!reportSetupRepository(frame, result)) return;
  yield* diagnoseSetup(frame);
});
export const runPilotSetup = Effect.fn("Pilot.run")(function* (options: PilotOptions, ports: PilotPorts) {
  if (!options.terminal) {
    ports.write(
      "Guided setup needs a terminal. Run hapsland --pilot there, or use hapsland --setup with a versioned JSON request.\n",
    );
    ports.exitCode(6);
    return;
  }
  const frame: PilotFrame = { options, ports, hostName: options.host === "claude" ? "Claude Code" : "Codex" };
  const request: SetupRequest = {
    version: 1,
    operation: "setup",
    ...options.fields,
    scope: { cwd: options.cwd, review: "enabled" },
    credential: "saved",
  };
  let credentialEntered = false;
  const entered = () => {
    credentialEntered = true;
  };
  ports.write(
    `${frame.hostName} review integration setup. Selected profile hooks apply across repositories according to file settings. No Jev call is made during setup.\n`,
  );
  const result = yield* ports.run(request, entered);
  if (!compatibilitySetupReady(frame, result)) return;
  if (!installationSetupReady(frame, result)) return;
  const approved = yield* approveSetupInstallation(frame, result, request);
  if (approved === undefined) return;
  yield* runApprovedSetup(frame, approved, entered, () => credentialEntered);
});
