import type * as HttpClient from "effect/http/HttpClient";
import { liveLayer as jevLiveLayer } from "../jev-decision.ts";
import type { ReviewSettings } from "../runtime/review-config.ts";
import { liveLayer as cloudflareLiveLayer } from "./cloudflare.ts";

export const reviewDecisionModelLayer = (
  settings: ReviewSettings,
  httpClient?: HttpClient.HttpClient,
) => settings.backend === "jev"
  ? jevLiveLayer({ apiUrl: settings.apiBase, credentialEnvVar: settings.credentialEnvVar,
      ...(httpClient === undefined ? {} : { httpClient }) })
  : cloudflareLiveLayer({ identity: settings.providerIdentity,
      credentialEnvVar: settings.credentialEnvVar,
      ...(httpClient === undefined ? {} : { httpClient }) });
