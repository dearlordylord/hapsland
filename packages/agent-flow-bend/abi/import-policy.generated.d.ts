export declare const importReady: (modulePresent: boolean, clausePresent: boolean) => boolean
export declare const importNamespaceAdmission: (localPresent: boolean, duplicate: boolean) => boolean
export declare const importSpecifierAdmission: (importedPresent: boolean, localPresent: boolean, duplicate: boolean) => boolean
export declare const importTypeOnly: (statementTypeOnly: boolean, specifierTypeOnly: boolean) => boolean
export declare const importNativeReady: (module: string | undefined, clause: unknown | undefined) => boolean
export declare const importNativeNamespaceAdmission: (local: string | undefined, imports: ReadonlyMap<string, unknown>) => boolean
export declare const importNativeSpecifierAdmission: (imported: string | undefined, local: string | undefined, imports: ReadonlyMap<string, unknown>) => boolean
export declare const importNativeTypeOnly: (node: {readonly text: string}, specifier: {readonly text: string}) => boolean
