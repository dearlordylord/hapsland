import { accessSync, constants, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeTypeFile } from "../direct-event/analyzer.ts";
import { inspectResident } from "../resident/client.ts";
import {
  previewCodexInstallation,
  inspectCodexInstallation,
  type InstallationRequest,
  type InstallationResult,
} from "./codex-installation.ts";

export type DoctorCheckStatus = "ready" | "missing" | "conflict" | "unsupported" | "unknown";
export type DoctorCheck = {
  readonly stage: string;
  readonly status: DoctorCheckStatus;
  readonly observed: unknown;
  readonly action?: string;
};

const object = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;

const readable = (path: string): boolean => {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const diagnoseInstalledIntegration = async (options: {
  readonly installation: InstallationRequest;
  readonly repository: DoctorCheck;
  readonly credential: DoctorCheck;
}): Promise<{
  readonly version: 1;
  readonly operation: "doctor";
  readonly status: "ready" | "not-ready" | "unknown";
  readonly offline: true;
  readonly readOnly: true;
  readonly providerCalls: 0;
  readonly checks: ReadonlyArray<DoctorCheck>;
  readonly nextSteps: ReadonlyArray<{ readonly stage: string; readonly action: string }>;
}> => {
  const checks: Array<DoctorCheck> = [];
  const declarationPath = join(packageRoot, "package-runtime.json");
  const declaration = readable(declarationPath)
    ? object(JSON.parse(readFileSync(declarationPath, "utf8")))
    : undefined;
  checks.push(declaration === undefined
    ? { stage: "package", status: "missing", observed: "package-runtime.json unavailable", action: "reinstall the released package" }
    : { stage: "package", status: "ready", observed: { declaration: "package-runtime.json", packageRoot } });

  try {
    const parser = analyzeTypeFile("doctor.ts", "export interface DoctorProbe { ready: boolean }");
    checks.push(parser.status === "analyzed"
      ? { stage: "parser", status: "ready", observed: "loaded-and-analyzed" }
      : { stage: "parser", status: "unsupported", observed: parser.status, action: "reinstall the package for this exact OS and architecture" });
  } catch {
    checks.push({ stage: "parser", status: "missing", observed: "load-failed", action: "reinstall the package with lifecycle scripts enabled" });
  }

  const preview = previewCodexInstallation(options.installation) as InstallationResult;
  const previewRecord = object(preview) ?? {};
  const host = object(previewRecord.host);
  const compatibility = object(host?.compatibility);
  const runtime = object(compatibility?.runtime);
  const codex = object(compatibility?.codex);
  checks.push(runtime?.supported === true
    ? { stage: "runtime", status: "ready", observed: runtime.checks ?? "supported" }
    : { stage: "runtime", status: "unsupported", observed: runtime?.checks ?? "unavailable", action: "install the exact declared Node runtime and packaged resident entrypoint" });
  checks.push(codex?.supported === true
    ? { stage: "host", status: "ready", observed: { adapter: "codex", home: host?.home, version: codex.observed } }
    : { stage: "host", status: "unsupported", observed: codex?.observed ?? "unavailable", action: "select a Codex home and install Codex CLI 0.155.1" });

  const inspection = object(inspectCodexInstallation(options.installation)) ?? {};
  if (inspection.status === "conflict") {
    checks.push({
      stage: "configuration-ownership",
      status: "conflict",
      observed: object(inspection.error)?.message ?? "configuration conflict",
      action: "reconcile the reported malformed, duplicate, or locally modified owned entry, then rerun doctor",
    });
  } else if (inspection.status === "partial") {
    checks.push({
      stage: "configuration-ownership",
      status: "conflict",
      observed: inspection.recovery ?? "partial mutation journal",
      action: "resume the journaled operation with its original proposal digest",
    });
  } else if (inspection.installed === true) {
    checks.push({ stage: "configuration-ownership", status: "ready", observed: "owned hook and feature match the installation record" });
  } else {
    checks.push({
      stage: "configuration-ownership",
      status: "missing",
      observed: "integration is not installed in the selected Codex home",
      action: "preview and install the integration for the selected Codex home",
    });
  }

  const resident = await inspectResident();
  checks.push(resident.available
    ? { stage: "resident", status: "ready", observed: { lifetime: resident.lifetime, pid: resident.pid } }
    : { stage: "resident", status: "unknown", observed: "not-running-or-unreachable", action: "start or restart Codex so the installed hook can launch the resident" });
  checks.push({
    stage: "host-trust",
    status: "unknown",
    observed: "Codex does not expose an offline trust query for this integration",
    action: "start Codex normally in the repository and complete any native trust or hook review prompt",
  });
  checks.push(options.credential, options.repository);

  const nextSteps = checks.flatMap((check) =>
    check.status === "ready" || check.action === undefined
      ? []
      : [{ stage: check.stage, action: check.action }]);
  const hasFailure = checks.some((check) =>
    check.status === "missing" || check.status === "conflict" || check.status === "unsupported");
  const hasUnknown = checks.some((check) => check.status === "unknown");
  return {
    version: 1,
    operation: "doctor",
    status: hasFailure ? "not-ready" : hasUnknown ? "unknown" : "ready",
    offline: true,
    readOnly: true,
    providerCalls: 0,
    checks,
    nextSteps,
  };
};
