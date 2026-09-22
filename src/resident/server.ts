import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { randomUUID } from "node:crypto";
import { access, chmod, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
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
import {
  prepareResidentDirectory,
  residentPaths,
  verifyRemovableSocket,
  type ResidentPaths,
} from "./paths.ts";
import {
  DELIVERY_LEASE_MS,
  MAX_IPC_CONNECTIONS,
  MAX_IPC_FRAME_BYTES,
  decodeResidentRequest,
  type ResidentDispatchContext,
  type ResidentRequest,
  type ResidentResponse,
} from "./protocol.ts";
import { CapacityLedger, encodedBytesWithin, type CapacityReservation } from "./capacity.ts";
import { DispatchCycles } from "./dispatch.ts";

const BACKEND_CONCURRENCY = 2;
/** Includes bounded capture/extraction workspace and a promised retained outcome. */
export const CAPTURE_EXTRACTION_RESERVATION_BYTES = 64 * 1024;
export const MAX_RETAINED_OUTCOME_BYTES = 16 * 1024;
const RESERVATION_OVERHEAD_BYTES = 1024;

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
  readonly reservation: CapacityReservation;
  readonly dispatch: ResidentDispatchContext;
};

type Advice = Omit<Job, "dispatch"> & {
  readonly findings: ReadonlyArray<Finding>;
  readonly encodedBytes: number;
  delivery?: {
    readonly token: string;
    leaseUntil: number;
    acknowledged: boolean;
  };
};

const recipientPartition = (root: string, recipient: DirectRecipient) => canonicalValue({
  root,
  host: recipient.host,
  hostVersion: recipient.hostVersion,
  sessionId: recipient.sessionId,
  agentId: recipient.agentId,
});

const decodeControlledOptions = (
  value: ResidentDispatchContext["controlled"],
): ControlledDecisionModelOptions | undefined => {
  if (value === null) return undefined;
  try {
    return Schema.decodeUnknownSync(ResidentControlledOptions, { onExcessProperty: "error" })(value);
  } catch {
    return undefined;
  }
};

export class ResidentServer {
  readonly lifetime = randomUUID();
  readonly #advice: Array<Advice> = [];
  readonly #ledger = new CapacityLedger();
  readonly #dispatcher: DispatchCycles<string, Job>;
  readonly #now: () => number;
  #server: Server | undefined;
  #connections = 0;
  #closed = false;
  readonly paths: ResidentPaths;

  constructor(paths: ResidentPaths = residentPaths(), now: () => number = () => performance.now()) {
    this.paths = paths;
    this.#now = now;
    this.#dispatcher = new DispatchCycles(BACKEND_CONCURRENCY, async ({ value }) => {
      await this.#evaluate(value);
    });
  }

  stats(): Extract<ResidentResponse, { status: "stats" }> {
    const dispatch = this.#dispatcher.snapshot();
    const capacity = this.#ledger.snapshot();
    return {
      status: "stats",
      queued: dispatch.queued,
      running: dispatch.running,
      pendingAdvice: this.#advice.length,
      retainedBytes: capacity.bytes,
    };
  }

  admit(observation: DirectObservation, dispatch: ResidentDispatchContext): ResidentResponse {
    if (this.#closed) return { status: "rejected-capacity" };
    const partition = recipientPartition(observation.root, observation.recipient);
    const inputBytes = Buffer.byteLength(canonicalValue({ observation, dispatch }), "utf8");
    const reservation = this.#ledger.reserve(
      partition,
      inputBytes + CAPTURE_EXTRACTION_RESERVATION_BYTES + MAX_RETAINED_OUTCOME_BYTES + RESERVATION_OVERHEAD_BYTES,
    );
    if (reservation === undefined) return { status: "rejected-capacity" };
    const job = {
      observation,
      partition,
      reservation,
      dispatch,
    };
    if (!this.#dispatcher.enqueue(partition, job)) {
      this.#ledger.release(reservation);
      return { status: "rejected-capacity" };
    }
    const acceptedPath = process.env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH;
    if (acceptedPath !== undefined) void writeFile(acceptedPath, "accepted\n").catch(() => undefined);
    return { status: "accepted" };
  }

  async collect(
    root: string,
    recipient: DirectRecipient,
    dispatch: ResidentDispatchContext,
  ): Promise<ResidentResponse> {
    const partition = recipientPartition(root, recipient);
    const now = this.#now();
    for (const item of this.#advice) {
      if (item.delivery !== undefined && item.delivery.leaseUntil <= now) delete item.delivery;
    }
    const index = this.#advice.findIndex((item) => item.partition === partition && item.delivery === undefined);
    if (index < 0) return { status: "empty" };
    const advice = this.#advice[index];
    if (advice === undefined) return { status: "empty" };
    const token = randomUUID();
    advice.delivery = { token, leaseUntil: Number.POSITIVE_INFINITY, acknowledged: false };
    const valid = await this.#revalidate(advice, dispatch);
    if (!valid) {
      this.#advice.splice(index, 1);
      this.#ledger.release(advice.reservation);
      return { status: "empty" };
    }
    advice.delivery.leaseUntil = this.#now() + DELIVERY_LEASE_MS;
    return { status: "advice", token, output: toCodexDirectEventOutput(advice.findings) };
  }

  acknowledge(token: string): ResidentResponse {
    const advice = this.#advice.find((item) => item.delivery?.token === token);
    if (advice?.delivery === undefined) return { status: "empty" };
    if (advice.delivery.leaseUntil <= this.#now()) {
      delete advice.delivery;
      return { status: "empty" };
    }
    advice.delivery.acknowledged = true;
    return { status: "acknowledged" };
  }

  finalize(token: string): ResidentResponse {
    const index = this.#advice.findIndex((item) => {
      if (item.delivery?.token !== token || !item.delivery.acknowledged) return false;
      if (item.delivery.leaseUntil <= this.#now()) {
        delete item.delivery;
        return false;
      }
      return true;
    });
    if (index < 0) return { status: "empty" };
    const [advice] = this.#advice.splice(index, 1);
    if (advice !== undefined) this.#ledger.release(advice.reservation);
    return { status: "finalized" };
  }

  releaseDelivery(token: string): void {
    const advice = this.#advice.find((item) => item.delivery?.token === token);
    if (advice !== undefined && advice.delivery?.acknowledged === false) delete advice.delivery;
  }

  whenIdle(): Promise<void> {
    return this.#dispatcher.whenIdle();
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
      const userConfigPath = job.dispatch.userConfigPath ?? undefined;
      const controlled = decodeControlledOptions(job.dispatch.controlled);
      const result = await Effect.runPromise(Effect.gen(function* () {
        const settings = yield* loadReviewSettings(
          job.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        if (job.dispatch.controlled !== null && controlled === undefined) return undefined;
        if (controlled === undefined && job.dispatch.credential?.name !== settings.credentialEnvVar) return undefined;
        const credentialProvider = job.dispatch.credential === null
          ? undefined
          : ConfigProvider.layer(ConfigProvider.fromUnknown({
              [job.dispatch.credential.name]: job.dispatch.credential.value,
            }));
        if (controlled === undefined && credentialProvider === undefined) return undefined;
        const decisionModel = controlled === undefined
          ? jevDecisionModelLiveLayer({
              apiUrl: settings.apiBase,
              credentialEnvVar: settings.credentialEnvVar,
            })
          : controlledDecisionModelLayer(controlled);
        const consent = yield* Consent.Service;
        const review = reviewObservation(job.observation, {
          controlledWriter: true,
          recipient: job.observation.recipient,
          consent,
          settings,
        }).pipe(Effect.provide(decisionModel));
        return yield* (credentialProvider === undefined
          ? review
          : review.pipe(Effect.provide(credentialProvider)));
      }).pipe(Effect.provide(Consent.layer({ statePath: job.dispatch.statePath }))));
      if (result?.status === "ready") {
        const encodedBytes = encodedBytesWithin(
          result.output,
          Math.min(MAX_RETAINED_OUTCOME_BYTES, MAX_IPC_FRAME_BYTES - 1024),
        );
        if (!this.#closed && encodedBytes !== undefined) {
          this.#advice.push({
            observation: job.observation,
            partition: job.partition,
            reservation: job.reservation,
            findings: result.findings,
            encodedBytes,
          });
          return;
        }
      }
    } catch (cause) {
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error(cause);
      // Operational notices are owned by the later accounting slice. This
      // resident fails closed and releases its reservation.
    }
    this.#ledger.release(job.reservation);
  }

  async #revalidate(advice: Advice, dispatch: ResidentDispatchContext): Promise<boolean> {
    try {
      const userConfigPath = dispatch.userConfigPath ?? undefined;
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
      }).pipe(Effect.provide(Consent.layer({ statePath: dispatch.statePath }))));
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
      return this.admit(request.observation, request.dispatch);
    }
    if (request.operation === "collect") return this.collect(request.root, request.recipient, request.dispatch);
    if (request.operation === "acknowledge") return this.acknowledge(request.token);
    if (request.operation === "finalize") return this.finalize(request.token);
    if (request.operation === "stats") return this.stats();
    if (request.operation === "shutdown") {
      setTimeout(() => void this.close(), 10);
      return { status: "acknowledged" };
    }
    return { status: "unsupported" };
  }

  async #responseGate(operation: ResidentRequest["operation"]): Promise<void> {
    const variable = operation === "collect"
      ? "REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH"
      : operation === "acknowledge"
        ? "REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH"
        : undefined;
    const gate = variable === undefined ? undefined : process.env[variable];
    if (gate === undefined) return;
    try {
      await access(`${gate}.enabled`);
    } catch {
      return;
    }
    await writeFile(`${gate}.entered`, "entered\n");
    while (true) {
      try {
        await access(`${gate}.release`);
        return;
      } catch {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    }
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
      // Stop pulling transport bytes as soon as the single bounded frame is
      // complete. Recipient and observation decoding happens only afterward.
      socket.pause();
      const request = decodeResidentRequest(encoded.slice(0, newline));
      if (request === undefined) {
        socket.end(`${JSON.stringify({ status: "unsupported" })}\n`);
        return;
      }
      void this.handle(request).then(async (response) => {
        await this.#responseGate(request.operation);
        if (socket.destroyed) {
          if (response.status === "advice") this.releaseDelivery(response.token);
          return;
        }
        socket.end(`${JSON.stringify(response)}\n`, () => {
          if (socket.errored !== null && response.status === "advice") this.releaseDelivery(response.token);
        });
      }).catch(() => {
        if (!socket.destroyed) socket.end(`${JSON.stringify({ status: "unsupported" })}\n`);
      });
    });
  }

  async listen(): Promise<void> {
    if (process.platform !== "linux") throw new Error("resident profile supports Linux only");
    await prepareResidentDirectory(this.paths);
    // This process is launched under the live kernel lock. A socket pathname
    // alone is never treated as ownership evidence.
    await verifyRemovableSocket(this.paths);
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
    this.#closed = true;
    for (const job of this.#dispatcher.close()) this.#ledger.release(job.reservation);
    for (const advice of this.#advice.splice(0)) this.#ledger.release(advice.reservation);
    // Running work may be interrupted by process exit or finish later. Clear
    // its logical ownership now; its eventual terminal release is idempotent.
    this.#ledger.clear();
    const server = this.#server;
    if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(this.paths.socket, { force: true });
    await rm(this.paths.owner, { force: true });
  }
}
