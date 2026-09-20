import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";

export type LspPosition = { line: number; character: number };
export type LspRange = { start: LspPosition; end: LspPosition };
export type LspLocation = { uri: string; range: LspRange };
export type LspLocationLink = {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange: LspRange;
  originSelectionRange?: LspRange;
};

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export type NativeLspFault = "nonresponding" | "crash" | "stale-document";

export type NativeLspPhaseTimingsMs = {
  processStartup: number;
  initialize: number;
  openDispatch: number;
};

export type DefinitionResponse = {
  result: LspLocation | LspLocationLink | Array<LspLocation | LspLocationLink> | null;
  error?: string;
  elapsedMs: number;
  timedOut?: boolean;
};

export type LspDocument = {
  uri: string;
  languageId: "typescript";
  version: number;
  text: string;
};

export type NativeLspCounts = {
  clientRequests: Record<string, number>;
  serverRequests: Record<string, number>;
  notifications: Record<string, number>;
  positionalRequests: Record<string, number>;
};

const noParams = Symbol("no-params");

const increment = (record: Record<string, number>, key: string) => {
  record[key] = (record[key] ?? 0) + 1;
};

const isResponse = (message: JsonRpcMessage) =>
  message.id !== undefined &&
  (Object.prototype.hasOwnProperty.call(message, "result") ||
    Object.prototype.hasOwnProperty.call(message, "error"));

const fileUri = (path: string) => pathToFileURL(path).href;

const sanitizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Minimal native-LSP client used only by this disposable experiment.
 *
 * The client deliberately implements the protocol boundary instead of importing
 * a legacy TypeScript server API. TypeScript 7's released seam is `tsc --lsp`.
 */
export class NativeLspClient {
  readonly counts: NativeLspCounts = {
    clientRequests: {},
    serverRequests: {},
    notifications: {},
    positionalRequests: {},
  };

  readonly diagnostics: Array<{ method: string; message: string }> = [];

  private readonly child: ChildProcessWithoutNullStreams;
  private readonly timeoutMs: number;
  private readonly nonResponding: boolean;
  private readonly crash: boolean;
  private readonly phaseTimings: NativeLspPhaseTimingsMs = {
    processStartup: 0,
    initialize: 0,
    openDispatch: 0,
  };
  private readonly spawnReady: Promise<number>;
  private crashed = false;
  private staleDocumentSent = false;
  private controlledCancellationSent = false;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly serverInfo: { name?: string; version?: string } = {};
  private readonly stderrChunks: string[] = [];
  private nextId = 1;
  private input = Buffer.alloc(0);
  private closed: Promise<void>;
  private resolveClosed!: () => void;
  private rejectClosed!: (error: Error) => void;
  private closeError: Error | undefined;
  private stopping = false;
  private stopPromise: Promise<void> | undefined;

  private constructor(
    child: ChildProcessWithoutNullStreams,
    timeoutMs: number,
    options: { nonResponding?: boolean; crash?: boolean } = {},
    processStartupStarted = performance.now(),
  ) {
    this.child = child;
    this.timeoutMs = timeoutMs;
    this.nonResponding = options.nonResponding === true;
    this.crash = options.crash === true;
    this.spawnReady = new Promise<number>((resolve, reject) => {
      child.once("spawn", () => resolve(performance.now() - processStartupStarted));
      child.once("error", reject);
    });
    this.closed = new Promise<void>((resolve, reject) => {
      this.resolveClosed = resolve;
      this.rejectClosed = reject;
    });
    child.stdout.on("data", (chunk: Buffer | string) => {
      this.input = Buffer.concat([this.input, Buffer.from(chunk)]);
      this.readMessages();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.stderrChunks.push(Buffer.from(chunk).toString("utf8"));
    });
    child.stdin.on("error", (error) => {
      // A controlled server crash closes stdin while the server may still
      // have queued callbacks. Keep EPIPE as sanitized subprocess evidence
      // instead of letting the experiment process terminate on an unhandled
      // stream error.
      this.closeError = error;
      this.diagnostics.push({ method: "stdin", message: sanitizeError(error) });
    });
    child.on("error", (error) => {
      this.closeError = error;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      // `closed` is a teardown signal; the concrete failure is retained in
      // `closeError` and surfaced by the request/diagnostic paths. Resolving
      // here avoids an unhandled rejection when a controlled crash happens
      // before the caller reaches stop().
      this.resolveClosed();
    });
    child.on("close", (code, signal) => {
      if (code !== 0 && !this.closeError && !this.stopping) {
        this.closeError = new Error(
          `TypeScript LSP exited with ${signal ?? `code ${String(code)}`}`,
        );
      }
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(this.closeError ?? new Error("TypeScript LSP closed"));
      }
      this.pending.clear();
      this.resolveClosed();
    });
  }

  static async start(
    workspaceRoot: string,
    timeoutMs = 2_000,
    options: { nonResponding?: boolean; crash?: boolean } = {},
  ) {
    const tsc = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../node_modules/typescript/bin/tsc",
    );
    const processStartupStarted = performance.now();
    const child = spawn(process.execPath, [tsc, "--lsp", "--stdio"], {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new NativeLspClient(child, timeoutMs, options, processStartupStarted);
    try {
      client.phaseTimings.processStartup = await client.waitForSpawn();
      const initializeStarted = performance.now();
      await client.initialize(workspaceRoot);
      client.phaseTimings.initialize = performance.now() - initializeStarted;
      return client;
    } catch (error) {
      await client.stop();
      throw error;
    }
  }

  get serverVersion() {
    return { ...this.serverInfo };
  }

  get phaseTimingsMs(): NativeLspPhaseTimingsMs {
    return { ...this.phaseTimings };
  }

  private async waitForSpawn() {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.spawnReady,
        new Promise<number>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("TypeScript LSP process spawn timed out")), this.timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  get stderr() {
    return this.stderrChunks.join("").slice(0, 2_000);
  }

  private write(message: JsonRpcMessage) {
    if (this.child.stdin.destroyed || this.child.stdin.writableEnded) return;
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
    this.child.stdin.write(header + body);
  }

  private request(
    method: string,
    params: unknown | typeof noParams = noParams,
    requestTimeoutMs = this.timeoutMs,
  ) {
    const id = this.nextId++;
    increment(this.counts.clientRequests, method);
    if (method === "textDocument/definition") {
      increment(this.counts.positionalRequests, method);
    }
    const message = params === noParams
      ? { jsonrpc: "2.0" as const, id, method }
      : { jsonrpc: "2.0" as const, id, method, params };
    const pending = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.notify("$/cancelRequest", { id });
        reject(new Error(`${method} timed out after ${requestTimeoutMs}ms`));
      }, Math.max(0, Number.isFinite(requestTimeoutMs) ? requestTimeoutMs : 0));
      this.pending.set(id, { method, resolve, reject, timer });
      try {
        this.write(message);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
    return pending;
  }

  private notify(method: string, params: unknown | typeof noParams = noParams) {
    increment(this.counts.notifications, method);
    if (this.child.stdin.destroyed || this.child.stdin.writableEnded) return;
    this.write(
      params === noParams
        ? { jsonrpc: "2.0", method }
        : { jsonrpc: "2.0", method, params },
    );
  }

  private sendServerResponse(id: number, result: unknown) {
    this.write({ jsonrpc: "2.0", id, result });
  }

  private handleServerRequest(message: JsonRpcMessage) {
    const method = message.method ?? "<missing-method>";
    increment(this.counts.serverRequests, method);
    if (message.id === undefined) return;

    // TypeScript's native server dynamically registers capabilities. A client
    // that drops this request leaves the server waiting and makes later
    // definition requests appear to hang.
    if (
      method === "client/registerCapability" ||
      method === "client/unregisterCapability"
    ) {
      this.sendServerResponse(message.id, null);
      return;
    }

    // The native server may ask for configuration while a workspace is opened.
    // This experiment has no settings to provide, so return one null per item.
    if (method === "workspace/configuration") {
      const items = Array.isArray((message.params as { items?: unknown[] } | undefined)?.items)
        ? ((message.params as { items: unknown[] }).items ?? [])
        : [];
      this.sendServerResponse(message.id, items.map(() => null));
      return;
    }

    // Respond to unknown requests so a server extension cannot deadlock the
    // bounded experiment. The request is recorded as unexpected evidence.
    this.diagnostics.push({ method, message: "unhandled server request" });
    this.sendServerResponse(message.id, null);
  }

  private handleMessage(message: JsonRpcMessage) {
    if (isResponse(message)) {
      const pending = this.pending.get(message.id as number);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id as number);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (message.method) this.handleServerRequest(message);
  }

  private readMessages() {
    while (true) {
      const headerEnd = this.input.indexOf(Buffer.from("\r\n\r\n"));
      if (headerEnd < 0) return;
      const header = this.input.subarray(0, headerEnd).toString("ascii");
      const match = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.input = this.input.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.input.length < bodyStart + length) return;
      const body = this.input.subarray(bodyStart, bodyStart + length).toString("utf8");
      this.input = this.input.subarray(bodyStart + length);
      try {
        this.handleMessage(JSON.parse(body) as JsonRpcMessage);
      } catch (error) {
        this.diagnostics.push({ method: "<parse>", message: sanitizeError(error) });
      }
    }
  }

  private async initialize(workspaceRoot: string) {
    const result = (await this.request("initialize", {
      processId: process.pid,
      clientInfo: { name: "declaration-extraction-experiment", version: "1" },
      rootUri: fileUri(workspaceRoot),
      rootPath: workspaceRoot,
      capabilities: {
        workspace: { configuration: true, workspaceFolders: true },
        textDocument: { definition: { linkSupport: true } },
        window: { workDoneProgress: true },
      },
      workspaceFolders: [{ uri: fileUri(workspaceRoot), name: "fixture" }],
    })) as { serverInfo?: { name?: string; version?: string } } | undefined;
    if (result?.serverInfo) Object.assign(this.serverInfo, result.serverInfo);
    // Unlike shutdown/exit, the native server validates initialized params as
    // an object. Keep the empty object on this notification; only the two LSP
    // lifecycle messages above deliberately omit params.
    this.notify("initialized", {});
  }

  async open(documents: LspDocument[]) {
    const started = performance.now();
    for (const document of documents) {
      this.notify("textDocument/didOpen", {
        textDocument: {
          uri: document.uri,
          languageId: document.languageId,
          version: document.version,
          text: document.text,
        },
      });
    }
    // Give the native process one event-loop turn after writing didOpen before
    // the first positional request. This measures client-side dispatch only;
    // it is not a server-processing barrier, and server work may be included
    // in the cold extraction timing.
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.phaseTimings.openDispatch = performance.now() - started;
  }

  /**
   * Deliberately send a full-content change after didOpen. This is an offline
   * stale-document seam: callers can submit an older buffer/version while the
   * parser side continues to use the current fixture source. The native server
   * response remains evidence, not a production ordering/version contract.
   */
  async sendStaleDocument(document: LspDocument, version = 0) {
    this.staleDocumentSent = true;
    this.notify("textDocument/didChange", {
      textDocument: { uri: document.uri, version },
      contentChanges: [{ text: document.text }],
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  get faultEvidence() {
    return {
      crashTriggered: this.crashed,
      staleDocumentSent: this.staleDocumentSent,
      clientResponseSuppression: this.nonResponding,
      clientCancelNotificationSent: this.controlledCancellationSent,
      serverCancellationAcknowledged: null,
    };
  }

  async definition(
    uri: string,
    position: LspPosition,
    deadline?: number,
  ): Promise<DefinitionResponse> {
    const started = performance.now();
    if (this.closeError || this.child.killed || this.child.stdin.destroyed) {
      return {
        result: null,
        error: this.closeError ? sanitizeError(this.closeError) : "TypeScript LSP is closed",
        elapsedMs: performance.now() - started,
      };
    }
    const remaining = deadline === undefined
      ? this.timeoutMs
      : Math.min(this.timeoutMs, deadline - started);
    if (remaining <= 0) {
      return {
        result: null,
        error: "elapsed-time deadline exceeded",
        elapsedMs: performance.now() - started,
        timedOut: true,
      };
    }
    if (this.nonResponding) {
      increment(this.counts.clientRequests, "textDocument/definition");
      increment(this.counts.positionalRequests, "textDocument/definition");
      // Keep the request on the wire, then deterministically cancel it at the
      // elapsed deadline. We intentionally do not retain a pending resolver;
      // any late server response is ignored as a stale response.
      const id = this.nextId++;
      this.write({
        jsonrpc: "2.0",
        id,
        method: "textDocument/definition",
        params: { textDocument: { uri }, position },
      });
      // Add a small deterministic margin so the traversal observes its
      // elapsed deadline before trying a second edge. This keeps cold/warm
      // cancellation counts stable while remaining bounded by the caller's
      // timeout plus the margin.
      await new Promise<void>((resolve) => setTimeout(resolve, remaining + 2));
      this.controlledCancellationSent = true;
      this.notify("$/cancelRequest", { id });
      return {
        result: null,
        error: "controlled nonresponding client deadline exceeded",
        elapsedMs: performance.now() - started,
        timedOut: true,
      };
    }
    if (this.crash && !this.crashed) {
      this.crashed = true;
      // Kill the selected native server process only after initialization and
      // document dispatch. This makes the crash a subprocess fault,
      // not a fixture-load failure, while keeping the test deterministic.
      this.child.kill("SIGKILL");
      return {
        result: null,
        error: "controlled TypeScript LSP server crash",
        elapsedMs: performance.now() - started,
      };
    }
    try {
      const result = await this.request("textDocument/definition", {
        textDocument: { uri },
        position,
      }, remaining);
      return { result: (result ?? null) as DefinitionResponse["result"], elapsedMs: performance.now() - started };
    } catch (error) {
      return {
        result: null,
        error: sanitizeError(error),
        elapsedMs: performance.now() - started,
        timedOut: performance.now() - started >= remaining,
      };
    }
  }

  snapshotCounts(): NativeLspCounts {
    return {
      clientRequests: { ...this.counts.clientRequests },
      serverRequests: { ...this.counts.serverRequests },
      notifications: { ...this.counts.notifications },
      positionalRequests: { ...this.counts.positionalRequests },
    };
  }

  async stop() {
    if (!this.stopPromise) this.stopPromise = this.stopInternal();
    return this.stopPromise;
  }

  private async stopInternal() {
    this.stopping = true;
    // The native server can leave shutdown queued behind a long-running
    // project update after a burst of definition requests.  Teardown is a
    // bounded cleanup path: waiting for the normal request timeout here makes
    // every cold/warm extraction pay the full two-second timeout before the
    // existing kill fallback even starts.
    const shutdownTimeoutMs = Math.min(this.timeoutMs, 250);
    try {
      // LSP requires shutdown to be a request with no parameters. In
      // particular, do not serialize `params: null` here.
      await this.request("shutdown", noParams, shutdownTimeoutMs);
    } catch (error) {
      this.diagnostics.push({ method: "shutdown", message: sanitizeError(error) });
    }
    // LSP requires exit to be a notification with no parameters.
    this.notify("exit");
    this.child.stdin.end();
    const fallback = setTimeout(() => {
      if (!this.child.killed) this.child.kill();
    }, Math.min(this.timeoutMs, 250));
    let closeTimeout: NodeJS.Timeout | undefined;
    try {
      const closeDeadline = new Promise<void>((resolve) => {
        closeTimeout = setTimeout(resolve, this.timeoutMs);
      });
      await Promise.race([
        this.closed,
        closeDeadline,
      ]);
    } catch (error) {
      this.diagnostics.push({ method: "close", message: sanitizeError(error) });
    } finally {
      clearTimeout(fallback);
      if (closeTimeout) clearTimeout(closeTimeout);
    }
  }
}

export const uriToPath = (uri: string) => {
  try {
    return fileURLToPath(uri);
  } catch {
    return uri;
  }
};

export const pathToUri = (path: string) => pathToFileURL(path).href;

export const relativePath = (workspaceRoot: string, path: string) => {
  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value === "" ? "." : value;
};
