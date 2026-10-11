function parser_request(source, configured) {
  const engine = globalThis.__hapslandWholeResolverProbeEngine;
  let parser;
  try {
    parser = new engine.Parser();
    // The second mode deliberately exercises an actual native engine setup failure.
    parser.setLanguage(configured ? engine.TypeScript.typescript : {});
    const tree = parser.parse(source);
    if (!tree) return { $: CID(EngineFailure) };
    const root = tree.rootNode;
    return { $: CID(Parsed), has_error: root.hasError, root_type: root.type,
      end_utf16: root.endIndex, named_children: root.namedChildCount };
  } catch {
    return { $: CID(EngineFailure) };
  } finally {
    parser?.reset();
    // No parser, tree, or syntax-node handle escapes the request. Native finalization is GC-owned.
  }
}
io_eff(CID(parser_request), parser_request);
