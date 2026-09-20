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

export type DefinitionResponse = {
  result: LspLocation | LspLocationLink | Array<LspLocation | LspLocationLink> | null;
  error?: string;
  elapsedMs: number;
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

  private constructor(
    child: ChildProcessWithoutNullStreams,
    timeoutMs: number,
  ) {
    this.child = child;
    this.timeoutMs = timeoutMs;
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
    child.on("error", (error) => {
      this.closeError = error;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      this.rejectClosed(error);
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
      if (this.closeError) this.rejectClosed(this.closeError);
      else this.resolveClosed();
    });
  }

  static async start(workspaceRoot: string, timeoutMs = 2_000) {
    const tsc = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../node_modules/typescript/bin/tsc",
    );
    const child = spawn(process.execPath, [tsc, "--lsp", "--stdio"], {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new NativeLspClient(child, timeoutMs);
    await client.initialize(workspaceRoot);
    return client;
  }

  get serverVersion() {
    return { ...this.serverInfo };
  }

  get stderr() {
    return this.stderrChunks.join("").slice(0, 2_000);
  }

  private write(message: JsonRpcMessage) {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
    this.child.stdin.write(header + body);
  }

  private request(method: string, params: unknown | typeof noParams = noParams) {
    const id = this.nextId++;
    increment(this.counts.clientRequests, method);
    if (method === "textDocument/definition") {
      increment(this.counts.positionalRequests, method);
    }
    this.write(
      params === noParams
        ? { jsonrpc: "2.0", id, method }
        : { jsonrpc: "2.0", id, method, params },
    );
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
    });
  }

  private notify(method: string, params: unknown | typeof noParams = noParams) {
    increment(this.counts.notifications, method);
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
    // Let the server consume didOpen notifications before the first positional
    // request. This is a protocol event, not a fixed sleep: a zero-delay turn
    // is enough for the native process to read the pipe.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  async definition(uri: string, position: LspPosition): Promise<DefinitionResponse> {
    const started = performance.now();
    try {
      const result = await this.request("textDocument/definition", {
        textDocument: { uri },
        position,
      });
      return { result: (result ?? null) as DefinitionResponse["result"], elapsedMs: performance.now() - started };
    } catch (error) {
      return {
        result: null,
        error: sanitizeError(error),
        elapsedMs: performance.now() - started,
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
    this.stopping = true;
    try {
      // LSP requires shutdown to be a request with no parameters. In
      // particular, do not serialize `params: null` here.
      await this.request("shutdown");
    } catch (error) {
      this.diagnostics.push({ method: "shutdown", message: sanitizeError(error) });
    }
    // LSP requires exit to be a notification with no parameters.
    this.notify("exit");
    this.child.stdin.end();
    const fallback = setTimeout(() => {
      if (!this.child.killed) this.child.kill();
    }, Math.min(this.timeoutMs, 250));
    try {
      await Promise.race([
        this.closed,
        new Promise<void>((resolve) => setTimeout(resolve, this.timeoutMs)),
      ]);
    } finally {
      clearTimeout(fallback);
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
