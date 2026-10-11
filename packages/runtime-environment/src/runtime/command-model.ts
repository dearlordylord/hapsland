export interface RuntimeCommand {
  readonly executable: string
  readonly args: ReadonlyArray<string>
}
export type PackageRole = "cli" | "doctor" | "hook" | "parser" | "resident"
