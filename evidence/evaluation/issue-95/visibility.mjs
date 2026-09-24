// Conservative, source-free finding visibility and edit-after-advice summary.
export function summarizeVisibility(hooks, hostEvents, started) {
  const submitted = hooks.flatMap((hook) => (hook.findings ?? []).map((finding) => ({
    ...finding, submittedAtMs: hook.at - started,
  })));
  const acknowledgedRuleIds = [...new Set(submitted.flatMap((finding) =>
    hostEvents.some((event) => event.atMs > finding.submittedAtMs && event.mentionedRuleIds?.includes(finding.ruleId))
      ? [finding.ruleId] : []))];
  const findingVisibility = submitted.map((finding) => {
    const sameRule = submitted.filter((item) => item.ruleId === finding.ruleId).length;
    const explicitRuleReference = hostEvents.some((event) => event.atMs > finding.submittedAtMs &&
      event.mentionedRuleIds?.includes(finding.ruleId));
    return {
      path: finding.path,
      declaration: finding.declaration,
      ruleId: finding.ruleId,
      submittedAtMs: finding.submittedAtMs,
      status: explicitRuleReference && sameRule === 1 ? "specific-rule-acknowledged" : "unproven",
      ...(explicitRuleReference && sameRule > 1 ? { limitation: "same-rule-multiple-findings" } : {}),
    };
  });
  const exposureSnapshots = hooks.flatMap((hook) => (hook.exposure?.candidates ?? []).map((candidate) => ({
    ...candidate, atMs: hook.at - started,
  })));
  const exposureCounts = exposureSnapshots.reduce((counts, snapshot) => {
    counts[snapshot.status] = (counts[snapshot.status] ?? 0) + 1;
    for (const unit of snapshot.units ?? []) {
      const key = `unit-${unit.status}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, {});
  const editsAfterAdvice = submitted.flatMap((finding) => {
    const baseline = [...exposureSnapshots].reverse().find((snapshot) => snapshot.path === finding.path &&
      snapshot.atMs <= finding.submittedAtMs && snapshot.sourceHash !== undefined);
    const later = baseline && exposureSnapshots.find((snapshot) => snapshot.path === finding.path &&
      snapshot.atMs > finding.submittedAtMs && snapshot.sourceHash !== undefined &&
      snapshot.sourceHash !== baseline.sourceHash);
    return later ? [{ path: finding.path, declaration: finding.declaration, ruleId: finding.ruleId,
      editedAtMs: later.atMs }] : [];
  });
  return { submittedFindingCount: submitted.length, acknowledgedRuleIds, findingVisibility,
    exposureCounts, editsAfterAdvice };
}
