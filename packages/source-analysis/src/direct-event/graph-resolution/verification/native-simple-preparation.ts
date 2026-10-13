import { extname, dirname, join, normalize } from "node:path"
import * as Effect from "effect/Effect"
import { inspectTypeScript, inspectTypeScriptFunctions } from "../../languages/typescript.ts"
import { bendAdapter } from "../../languages/bend/adapter.ts"
import type { NativeLanguageAdapter } from "./native-language-contract.ts"
const extensions = [".ts", ".tsx", ".mts", ".cts"]
const inspectBend = bendAdapter.inspect
const bendImportCandidates = (from: string, imported: string): ReadonlyArray<string> =>
  /^(?:\.\/|\.\.\/)/u.test(imported) && extname(imported).toLowerCase() === ".bend"
    ? [normalize(join(dirname(from), imported))]
    : []

export const prepareNativeTypeScriptGraph: NativeLanguageAdapter["prepareGraph"] = (_path, _capture, _host, limits) =>
  Effect.succeed({
    dependencies: [],
    limits,
    session: {
      inspect: (path, source, branch) =>
        branch === "function" ? inspectTypeScriptFunctions(path, source) : inspectTypeScript(path, source),
      importCandidates: (from, importPath) => {
        const base = normalize(join(dirname(from), importPath))
        const extension = extname(base).toLowerCase()
        return extension === ""
          ? extensions.map((candidate) => `${base}${candidate}`)
          : extension === ".js"
            ? [base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx"]
            : extension === ".mjs"
              ? [base.slice(0, -4) + ".mts"]
              : extension === ".cjs"
                ? [base.slice(0, -4) + ".cts"]
                : extensions.includes(extension)
                  ? [base]
                  : []
      }
    }
  })
export const prepareNativeBendGraph: NativeLanguageAdapter["prepareGraph"] = (_path, _capture, _host, limits) =>
  Effect.succeed({
    session: {
      inspect: (path, source, branch) => (branch === "type" ? inspectBend(path, source) : undefined),
      importCandidates: bendImportCandidates
    },
    dependencies: [],
    limits
  })
