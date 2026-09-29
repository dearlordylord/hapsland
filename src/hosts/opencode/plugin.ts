/** OpenCode remains inactive until a pre-edit permit lifecycle is supported. */
export const renderOpenCodePlugin = (_runtime: string, _entrypoint: string): string => `// Hapsland OpenCode integration is inactive: pre-edit permits are not supported.
export const HapslandPlugin = async () => ({});
`;
