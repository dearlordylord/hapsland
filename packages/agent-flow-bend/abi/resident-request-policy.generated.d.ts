export declare const residentRequestNeedsSweep: (operation: string) => boolean
export declare const residentRequestUnsupported: (operation: string, direct: boolean, observed: boolean) => boolean
export declare const residentRequestNeedsSnapshot: (operation: string, matched: boolean) => boolean
export declare const bindResidentRequestLifetime: <A>(materializers: {
  readonly continue: () => A
  readonly ready: () => A
  readonly obsolete: () => A
  readonly editLost: () => A
}) => (operation: string, matched: boolean, active: boolean, edit: boolean) => A
