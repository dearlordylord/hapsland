// Frozen native algorithm oracle from be28d4e4; offline validation only.
// Pure numeric budget predicate is independent of generated Bend admission.
const permitLocalGraphFacts = (limits, work, depth, targets, graphWork) => depth <= limits.depth && targets <= limits.outgoingEdges && work + graphWork <= limits.work;
const factKey = (file, name, expected) => file.kindAware ? `${expected ?? "function"}:${name}` : name;
const declarationFor = (file, name, expected) => file.declarations.get(factKey(file, name, expected));
const correctKind = (artifact, expected) => expected === undefined || (expected === "function" ? artifact.kind === "function" : artifact.kind !== "function");
const _bytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");
const omittedReference = (symbol, reason, targetSymbol = symbol) => ({
  kind: "omitted",
  site: {
    symbol
  },
  target: {
    kind: "unresolved",
    symbol: targetSymbol
  },
  reason
});
const localReferenceTargetKey = (path, name, local, imported) => {
  if (local !== undefined) return local.artifact.id;
  return imported === undefined ? name : `${path}\0${imported.path}\0${imported.name}`;
};
const ambiguousLocalReference = (local, imported, expectedKind) => {
  if (local === undefined) return false;
  return imported !== undefined || !correctKind(local.artifact, expectedKind);
};
const expandLocalReference = (frame, reference, local) => {
  if (frame.visited.has(local.artifact.id)) {
    frame.node.references.push({
      kind: "included",
      site: {
        symbol: reference.name
      },
      target: local.artifact.id
    });
    return;
  }
  frame.visited.add(local.artifact.id);
  const child = buildLocal(frame.file, frame.path, reference.name, frame.visited, frame.budget, frame.depth + 1, reference.expectedKind);
  if (child === undefined) {
    frame.visited.delete(local.artifact.id);
    frame.node.references.push(omittedReference(reference.name, "unresolved"));
    return;
  }
  frame.node.references.push({
    kind: "expanded",
    site: {
      symbol: reference.name
    },
    node: child.node
  });
  frame.pending.push(...child.pending);
};
const queueImportedReference = (frame, reference, imported) => {
  if (imported === undefined) {
    frame.node.references.push(omittedReference(reference.name, "unresolved"));
    return;
  }
  if (reference.expectedKind === "function" && imported.typeOnly === true) {
    frame.node.references.push(omittedReference(reference.name, "unsupported"));
    return;
  }
  const index = frame.node.references.length;
  frame.node.references.push(omittedReference(reference.name, "unavailable"));
  frame.pending.push({
    owner: frame.node,
    index,
    from: frame.path,
    symbol: reference.name,
    importPath: imported.path,
    name: imported.name,
    depth: frame.depth,
    ...(reference.expectedKind === undefined ? {} : {
      expectedKind: reference.expectedKind
    })
  });
};
const validBundledDeclaration = (declaration, reference) => declaration !== undefined && declaration.artifact.origin?.kind === "bundled" && declaration.artifact.id === reference.targetId && correctKind(declaration.artifact, reference.expectedKind);
const materializeBundledReference = (frame, reference, targetId) => {
  const {
    budget,
    fileTargets
  } = frame;
  const declaration = frame.file.supportingDeclarations?.get(targetId);
  if (!validBundledDeclaration(declaration, reference)) {
    frame.node.references.push(omittedReference(reference.name, "unsupported"));
    return;
  }
  fileTargets.add(declaration.artifact.id);
  budget.maxTargetsInFile = Math.max(budget.maxTargetsInFile, fileTargets.size);
  if (frame.visited.has(declaration.artifact.id)) budget.work += 1;
  if (!permitLocalGraphFacts(budget.limits, budget.work, budget.maxDepth, fileTargets.size, budget.graphWork)) {
    frame.node.references.push(omittedReference(reference.name, "reference-limit"));
    return;
  }
  if (frame.visited.has(declaration.artifact.id)) {
    frame.node.references.push({
      kind: "included",
      site: {
        symbol: reference.name
      },
      target: declaration.artifact.id
    });
  } else {
    const index = frame.node.references.length;
    frame.node.references.push(omittedReference(reference.name, "unavailable"));
    frame.pending.push({
      owner: frame.node,
      index,
      from: frame.path,
      symbol: reference.name,
      importPath: "",
      name: reference.name,
      depth: frame.depth,
      bundled: {
        declaration,
        file: frame.file
      },
      ...(reference.expectedKind === undefined ? {} : {
        expectedKind: reference.expectedKind
      })
    });
  }
};
const materializeLocalReference = (frame, reference) => {
  const {
    budget,
    fileTargets
  } = frame;
  budget.maxDepth = Math.max(budget.maxDepth, frame.depth + 1);
  if (reference.kind === "unsupported") {
    frame.node.references.push(omittedReference(reference.name, "unsupported"));
    return;
  }
  if (reference.targetId !== undefined) {
    materializeBundledReference(frame, reference, reference.targetId);
    return;
  }
  const local = declarationFor(frame.file, reference.name, reference.expectedKind);
  const imported = frame.file.imports.get(reference.name);
  fileTargets.add(localReferenceTargetKey(frame.path, reference.name, local, imported));
  budget.maxTargetsInFile = Math.max(budget.maxTargetsInFile, fileTargets.size);
  if (ambiguousLocalReference(local, imported, reference.expectedKind)) {
    frame.node.references.push(omittedReference(reference.name, "unsupported"));
    return;
  }
  if (local !== undefined) budget.work += 1;
  // Bend owns effective local-work, depth and per-file target ceilings.
  if (!permitLocalGraphFacts(budget.limits, budget.work, budget.maxDepth, fileTargets.size, budget.graphWork)) {
    frame.node.references.push(omittedReference(reference.name, "reference-limit"));
    return;
  }
  if (local !== undefined) expandLocalReference(frame, reference, local);else queueImportedReference(frame, reference, imported);
};
/** Materialize bounded supporting evidence without turning imports into edited roots. */
const buildLocal = (file, path, name, visited, budget, depth, expectedKind = undefined) => {
  const declaration = declarationFor(file, name, expectedKind);
  if (declaration === undefined) return undefined;
  visited.add(declaration.artifact.id);
  const node = {
    artifact: declaration.artifact,
    references: []
  };
  const pending = [];
  const fileTargets = budget.targetsByPath.get(path) ?? new Set();
  budget.targetsByPath.set(path, fileTargets);
  const frame = {
    file,
    path,
    visited,
    budget,
    depth,
    node,
    pending,
    fileTargets
  };
  for (const reference of declaration.references) materializeLocalReference(frame, reference);
  return {
    node,
    pending
  };
};
export { buildLocal };
