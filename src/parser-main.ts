#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { analyzeTypeFile } from "./direct-event/analyzer.ts";

type ParserInput = { readonly path?: unknown; readonly source?: unknown };

let input: ParserInput;
try {
  input = JSON.parse(readFileSync(0, "utf8")) as ParserInput;
} catch {
  process.stderr.write("parser input must be JSON\n");
  process.exitCode = 2;
  input = {};
}

if (process.exitCode === undefined) {
  if (typeof input.path !== "string" || typeof input.source !== "string") {
    process.stderr.write("parser input requires string path and source fields\n");
    process.exitCode = 2;
  } else {
    const result = analyzeTypeFile(input.path, input.source);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}
