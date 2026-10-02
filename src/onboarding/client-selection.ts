import { emitKeypressEvents } from "node:readline";

export type SetupClient = "claude" | "codex";
export type ClientChoice = {
  readonly host: SetupClient;
  readonly name: string;
  readonly status: "installed" | "not installed" | "needs attention" | "unavailable";
};

/** Selection controls which profiles to set up; it never removes existing registrations. */
export const selectSetupClients = (choices: ReadonlyArray<ClientChoice>): Promise<ReadonlyArray<SetupClient>> => {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return Promise.reject(new Error("Client selection needs a terminal. Use hapsland setup claude or hapsland setup codex, or --setup JSON for automation."));
  return new Promise((resolve, reject) => {
    const selected = new Set(choices.filter(choice => choice.status === "installed").map(choice => choice.host));
    let cursor = 0;
    let renderedLines = 0;
    const wasRaw = process.stdin.isRaw;
    const render = () => {
      if (renderedLines > 0) process.stderr.write(`\x1b[${renderedLines}A\x1b[J`);
      const lines = [
        "Choose clients to set up",
        "Arrows: move · Space: toggle · Enter: continue · Esc: cancel",
        ...choices.map((choice, index) => `${index === cursor ? ">" : " "} [${selected.has(choice.host) ? "x" : " "}] ${choice.name} — ${choice.status}`),
        "Unchecking a client keeps its existing installation.",
      ];
      renderedLines = lines.length;
      process.stderr.write(lines.join("\n") + "\n");
    };
    const cleanup = () => {
      process.stdin.off("keypress", onKey);
      process.stdin.off("error", onError);
      process.stdin.off("end", onEnd);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
    };
    const finish = (hosts: ReadonlyArray<SetupClient>) => { cleanup(); resolve(hosts); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onEnd = () => onError(new Error("Terminal input ended before client selection completed"));
    const onKey = (_value: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") { process.exitCode = 130; finish([]); return; }
      if (key.name === "escape") { finish([]); return; }
      if (key.name === "return") { finish(choices.filter(choice => selected.has(choice.host)).map(choice => choice.host)); return; }
      if (key.name === "up") cursor = (cursor + choices.length - 1) % choices.length;
      else if (key.name === "down") cursor = (cursor + 1) % choices.length;
      else if (key.name === "space") {
        const choice = choices[cursor];
        if (choice !== undefined) {
          if (selected.has(choice.host)) selected.delete(choice.host);
          else selected.add(choice.host);
        }
      } else return;
      render();
    };
    emitKeypressEvents(process.stdin);
    process.stdin.on("keypress", onKey);
    process.stdin.on("error", onError);
    process.stdin.on("end", onEnd);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    render();
  });
};
