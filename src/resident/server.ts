import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { canonicalValue, type DirectObservation, type DirectRecipient } from "../direct-event/model.ts";
import {
  revalidateFindings,
  reviewObservation,
  toCodexDirectEventOutput,
  type Finding,
} from "../direct-event/pipeline.ts";
import { liveLayer as jevDecisionModelLiveLayer } from "../jev-decision.ts";
import { Consent } from "../runtime/consent.ts";
import { loadReviewSettings } from "../runtime/review-config.ts";
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions,
} from "../test-support/controlled-decision-model.ts";
import { residentPaths, type ResidentPaths } from "./paths.ts";
import {
  MAX_IPC_CONNECTIONS,
  MAX_IPC_FRAME_BYTES,
  decodeResidentRequest,
  type ResidentRequest,
  type ResidentResponse,
} from "./protocol.ts";

const MAX_RETAINED_ITEMS = 64;
const MAX_RETAINED_BYTES = 4 * 1024 * 1024;
const ITEM_RESERVATION_BYTES = 64 * 1024;
const BACKEND_CONCURRENCY = 2;

const ResidentControlledOptions = Schema.Struct({
  answers: Schema.optionalKey(Schema.Record(
    Schema.String,
    Schema.Union([
      Schema.Struct({ _tag: Schema.Literal("Probability"), probability: Schema.Number }),
      Schema.Struct({
        _tag: Schema.Literal("Classify"),
        label: Schema.String,
        probabilities: Schema.Record(Schema.String, Schema.Number),
        confidence: Schema.optionalKey(Schema.Number),
      }),
      Schema.Struct({
        _tag: Schema.Literal("Rate"),
        rating: Schema.Number,
        probabilities: Schema.Record(Schema.String, Schema.Number),
        confidence: Schema.optionalKey(Schema.Number),
      }),
    ]),
  )),
  delayMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  failure: Schema.optionalKey(Schema.String),
  capturePath: Schema.optionalKey(Schema.String),
});

type Job = {
  readonly observation: DirectObservation;
  readonly partition: string;
  readonly reservation: number;
};

type Advice = Job & {
  readonly findings: ReadonlyArray<Finding>;
  readonly encodedBytes: number;
  token?: string;
};

const recipientPartition = (root: string, recipient: DirectRecipient) => canonicalValue({
  root,
  host: recipient.host,
  hostVersion: recipient.hostVersion,
  sessionId: recipient.sessionId,
  agentId: recipient.agentId,
});

const parseControlledOptions = (): ControlledDecisionModelOptions | undefined => {
  if (!process.argv.includes("--controlled") && process.env.REVIEW_RESIDENT_CONTROLLED !== "1") {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(process.env.REVIEW_CONTROL_JSON ?? "{}");
    return Schema.decodeUnknownSync(ResidentControlledOptions, { onExcessProperty: "error" })(value);
  } catch {
    return {};
  }
};

export class ResidentServer {
  readonly lifetime = randomUUID();
  readonly #queue: Array<Job> = [];
  readonly #advice: Array<Advice> = [];
  readonly #controlled = parseControlledOptions();
  readonly #statePath = process.env.REVIEW_STATE_PATH ?? process.env.REVIEW_CONSENT_FILE ??
    join(homedir(), ".config", "realtime-review-tool", "consent");
  readonly #userConfigPath = process.env.REVIEW_USER_CONFIG_PATH;
  #running = 0;
  #retainedBytes = 0;
  #server: Server | undefined;
  #connections = 0;
  readonly paths: ResidentPaths;

  constructor(paths: ResidentPaths = residentPaths()) {
    this.paths = paths;
  }

  stats(): Extract<ResidentResponse, { status: "stats" }> {
    return {
      status: "stats",
      queued: this.#queue.length,
      running: this.#running,
      pendingAdvice: this.#advice.length,
      retainedBytes: this.#retainedBytes,
    };
  }

  admit(observation: DirectObservation): ResidentResponse {
    const items = this.#queue.length + this.#running + this.#advice.length;
    if (
      items >= MAX_RETAINED_ITEMS ||
      this.#retainedBytes + ITEM_RESERVATION_BYTES > MAX_RETAINED_BYTES
    ) return { status: "rejected-capacity" };
    this.#retainedBytes += ITEM_RESERVATION_BYTES;
    this.#queue.push({
      observation,
      partition: recipientPartition(observation.root, observation.recipient),
      reservation: ITEM_RESERVATION_BYTES,
    });
    this.#pump();
    return { status: "accepted" };
  }

  async collect(root: string, recipient: DirectRecipient): Promise<ResidentResponse> {
    const partition = recipientPartition(root, recipient);
    const index = this.#advice.findIndex((item) => item.partition === partition && item.token === undefined);
    if (index < 0) return { status: "empty" };
    const advice = this.#advice[index];
    if (advice === undefined) return { status: "empty" };
    const valid = await this.#revalidate(advice);
    if (!valid) {
      this.#advice.splice(index, 1);
      this.#retainedBytes -= advice.reservation;
      return { status: "empty" };
    }
    const token = randomUUID();
    advice.token = token;
    return { status: "advice", token, output: toCodexDirectEventOutput(advice.findings) };
  }

  acknowledge(token: string): ResidentResponse {
    const index = this.#advice.findIndex((item) => item.token === token);
    if (index < 0) return { status: "empty" };
    const [advice] = this.#advice.splice(index, 1);
    if (advice !== undefined) this.#retainedBytes -= advice.reservation;
    return { status: "acknowledged" };
  }

  #pump(): void {
    while (this.#running < BACKEND_CONCURRENCY) {
      const job = this.#queue.shift();
      if (job === undefined) return;
      this.#running += 1;
      void this.#evaluate(job).finally(() => {
        this.#running -= 1;
        this.#pump();
      });
    }
  }

  async #evaluate(job: Job): Promise<void> {
    try {
      const backendGatePath = process.env.REVIEW_RESIDENT_BACKEND_GATE_PATH;
      if (backendGatePath !== undefined) {
        while (true) {
          try {
            await access(backendGatePath);
            break;
          } catch {
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
          }
        }
      }
      const userConfigPath = this.#userConfigPath;
      const controlled = this.#controlled;
      const result = await Effect.runPromise(Effect.gen(function* () {
        const settings = yield* loadReviewSettings(
          job.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        if (controlled === undefined) {
          const credential = yield* Config.option(Config.String(settings.credentialEnvVar));
          if (Option.isNone(credential) || credential.value.length === 0) return undefined;
        }
        const decisionModel = controlled === undefined
          ? jevDecisionModelLiveLayer({
              apiUrl: settings.apiBase,
              credentialEnvVar: settings.credentialEnvVar,
            })
          : controlledDecisionModelLayer(controlled);
        const consent = yield* Consent.Service;
        return yield* reviewObservation(job.observation, {
          controlledWriter: true,
          recipient: job.observation.recipient,
          consent,
          settings,
        }).pipe(Effect.provide(decisionModel));
      }).pipe(Effect.provide(Consent.layer({ statePath: this.#statePath }))));
      if (result?.status === "ready") {
        const encodedBytes = Buffer.byteLength(JSON.stringify(result.output), "utf8");
        if (encodedBytes <= MAX_IPC_FRAME_BYTES - 1024) {
          this.#advice.push({ ...job, findings: result.findings, encodedBytes });
          return;
        }
      }
    } catch (cause) {
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error(cause);
      // Operational notices are owned by the later accounting slice. This
      // resident fails closed and releases its reservation.
    }
    this.#retainedBytes -= job.reservation;
  }

  async #revalidate(advice: Advice): Promise<boolean> {
    try {
      const userConfigPath = this.#userConfigPath;
      return await Effect.runPromise(Effect.gen(function* () {
        const settings = yield* loadReviewSettings(
          advice.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        const consent = yield* Consent.Service;
        return yield* revalidateFindings(advice.observation, advice.findings, {
          controlledWriter: true,
          recipient: advice.observation.recipient,
          consent,
          settings,
        });
      }).pipe(Effect.provide(Consent.layer({ statePath: this.#statePath }))));
    } catch {
      return false;
    }
  }

  async handle(request: ResidentRequest): Promise<ResidentResponse> {
    if (request.operation === "hello") {
      return { status: "ready", lifetime: this.lifetime, pid: process.pid };
    }
    if (request.lifetime !== this.lifetime) return { status: "obsolete-lifetime" };
    if (request.operation === "admit") {
      const response = this.admit(request.observation);
      const delayMs = Number(process.env.REVIEW_RESIDENT_ADMISSION_RESPONSE_DELAY_MS ?? "0");
      if (Number.isFinite(delayMs) && delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(delayMs, 10_000)));
      }
      return response;
    }
    if (request.operation === "collect") return this.collect(request.root, request.recipient);
    if (request.operation === "acknowledge") return this.acknowledge(request.token);
    if (request.operation === "stats") return this.stats();
    if (request.operation === "shutdown") {
      setTimeout(() => void this.close(), 10);
      return { status: "acknowledged" };
    }
    return { status: "unsupported" };
  }

  #accept(socket: Socket): void {
    if (this.#connections >= MAX_IPC_CONNECTIONS) {
      socket.end(`${JSON.stringify({ status: "rejected-capacity" })}\n`);
      return;
    }
    this.#connections += 1;
    let bytes = 0;
    let encoded = "";
    let handled = false;
    socket.setTimeout(1_500, () => socket.destroy());
    socket.once("close", () => { this.#connections -= 1; });
    socket.on("error", () => undefined);
    socket.on("data", (chunk: Buffer) => {
      if (handled) return;
      bytes += chunk.byteLength;
      if (bytes > MAX_IPC_FRAME_BYTES) {
        handled = true;
        socket.end(`${JSON.stringify({ status: "rejected-capacity" })}\n`);
        return;
      }
      encoded += chunk.toString("utf8");
      const newline = encoded.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      const request = decodeResidentRequest(encoded.slice(0, newline));
      if (request === undefined) {
        socket.end(`${JSON.stringify({ status: "unsupported" })}\n`);
        return;
      }
      void this.handle(request).then((response) => {
        if (!socket.destroyed) socket.end(`${JSON.stringify(response)}\n`);
      }).catch(() => {
        if (!socket.destroyed) socket.end(`${JSON.stringify({ status: "unsupported" })}\n`);
      });
    });
  }

  async listen(): Promise<void> {
    if (process.platform !== "linux") throw new Error("resident profile supports Linux only");
    await mkdir(this.paths.directory, { recursive: true, mode: 0o700 });
    await chmod(this.paths.directory, 0o700);
    // This process is launched under the live kernel lock. A socket pathname
    // alone is never treated as ownership evidence.
    await rm(this.paths.socket, { force: true });
    const server = createServer((socket) => this.#accept(socket));
    server.maxConnections = MAX_IPC_CONNECTIONS;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.paths.socket, resolve);
    });
    this.#server = server;
    await chmod(this.paths.socket, 0o600);
    await writeFile(
      this.paths.owner,
      `${JSON.stringify({ pid: process.pid, lifetime: this.lifetime })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }

  async close(): Promise<void> {
    const server = this.#server;
    if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(this.paths.socket, { force: true });
    await rm(this.paths.owner, { force: true });
  }
}
