export type BindingPlan = "NoAction" | "Mark" | "Bind" | "MarkMark" | "MarkBind"
export declare const bindingUnsupportedAssignment: (identifier: boolean, bound: boolean, pattern: boolean) => boolean
export declare const bindingActions: (uncertain: boolean, mutation: boolean, unsupported: boolean, binding: boolean, identifier: boolean) => BindingPlan
export declare const bindingInitialArguments: (lexical: boolean) => boolean
export declare const bindingUncertain: (uncertain: boolean) => boolean
export declare const bindingMutation: (mutation: boolean, unsupported: boolean) => boolean
export declare const bindingNeedsName: (binding: boolean) => boolean
export declare const bindingIdentifier: (identifier: boolean) => boolean
export declare const bindUnsupportedAssignment: <N extends { readonly type: string; readonly text: string }>(uncertainAssignmentSyntax: ReadonlySet<string>) => (target: N | null | undefined, boundFunctions: ReadonlySet<string>) => boolean
export declare const bindFunctionBinding: <N extends { readonly type: string; readonly text: string; readonly namedChildren: readonly (N | null)[] }, S extends { localBindings: Set<string> }>(uncertainScopeSyntax: ReadonlySet<string>, mutationSyntax: ReadonlySet<string>, bindingSyntax: ReadonlySet<string>, unsupportedAssignmentTarget: (target: N | null | undefined, boundFunctions: ReadonlySet<string>) => boolean, markUncertainBinding: (child: N, scope: S) => void) => (child: N, scope: S, boundFunctions: ReadonlySet<string>) => void
