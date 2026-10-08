export interface UpdateJourneyCommand {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}
export interface UpdateJourneyPorts {
  readonly run: (
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number }
  ) => Promise<UpdateJourneyCommand>
  readonly parse: (result: UpdateJourneyCommand, label: string, expectedExit: number) => unknown
  readonly expect: (condition: boolean, message: string) => void
  readonly quote: (value: string) => string
}
export function installedResidentUpdateJourney(
  options: {
    cli: string
    archive: string
    temporary: string
    repository: string
    codexHome: string
    codexExecutable: string
    environment: NodeJS.ProcessEnv
  },
  ports: UpdateJourneyPorts
): Promise<void>
