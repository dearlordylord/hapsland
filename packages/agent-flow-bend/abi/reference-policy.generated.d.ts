export declare const referenceCallPlan: (call: boolean, callee: boolean, identifier: boolean, uncertain: boolean, local: boolean) => "named-function" | "unsupported" | undefined
export declare const referenceIgnoredValue: (self: boolean, parent: boolean, declaration: boolean, first: boolean) => boolean
export declare const referenceValuePlan: (local: boolean, known: boolean, uncertain: boolean) => "named-function" | "unsupported" | undefined
export declare const referenceDeclaredType: (intrinsic: boolean, imported: boolean) => boolean
export declare const referenceReadonlyIntrinsic: (name: boolean, bound: boolean, generic: boolean, first: boolean, one: boolean) => boolean
export declare const referenceTypePlan: (unsupported: boolean, identifier: boolean, own: boolean, context: boolean, parameter: boolean, readonly: boolean, declared: boolean) => "named-type" | "unsupported" | undefined
export declare const referenceCallNeedsCallee: (call: boolean) => boolean
export declare const referenceCallNeedsScope: (identifier: boolean) => boolean
export declare const referenceCallNeedsLocal: (uncertain: boolean) => boolean
export declare const referenceCallSupported: (local: boolean) => boolean
export declare const referenceCallFinish: (supported: boolean) => "named-function" | "unsupported"
export declare const referenceIgnoreSelf: (self: boolean) => boolean
export declare const referenceIgnoreMissingParent: () => boolean
export declare const referenceIgnoreNeedsFirst: (declaration: boolean) => boolean
export declare const referenceIgnoreFirst: (first: boolean) => boolean
export declare const bindReferenceDeclaredType: (intrinsicTypes: ReadonlySet<string>) => (name: string, importedNames: ReadonlySet<string>) => boolean
export declare const referenceNativeValuePlan: (child: {readonly text: string}, scope: {readonly localBindings: ReadonlySet<string>; readonly uncertainBinding: boolean}, valueFunctions: ReadonlySet<string>) => "named-function" | "unsupported" | undefined
export declare const bindReferenceTypePlan: <N extends {readonly type: string; readonly text: string}>(unsupportedTypes: ReadonlySet<string>, namedTypeContext: (child: N) => boolean, intrinsicReadonly: (child: N, importedNames: ReadonlySet<string>) => boolean, declaredTypeName: (name: string, importedNames: ReadonlySet<string>) => boolean) => (child: N, ownName: string, parameters: ReadonlySet<string>, importedNames: ReadonlySet<string>) => "named-type" | "unsupported" | undefined
export declare const bindReferenceReadonly: <N extends { readonly type: string; readonly text: string; readonly namedChildren: readonly (N | null)[]; readonly parent?: N | null | undefined }>(sameSyntaxNode: (left: N | null | undefined, right: N) => boolean) => (node: N, boundTypes: ReadonlySet<string>) => boolean
