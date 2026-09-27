# User authority for Claude direct-edit blocking

The earlier Claude Code direct-edit feedback path is advisory by default. A block
for current findings requires an explicit `block-current-findings` choice in the
user configuration. Project configuration cannot grant that authority.

Blocking asks Claude Code to keep working after an edit, so it needs stronger
authorization than advisory feedback. This decision was implemented for the
synchronous Claude `Edit`/`Write` path in `f139bc0` and is described with its
evidence in [the Claude adapter record](../../evidence/host-94/decision-and-evidence.md).

This record preserves the direct-edit decision. It does not specify the composed
Background/Stop behavior in issue #105, and it does not yet add blocking to the
Bend model or sidecar reducer. The archived record also describes project
narrowing and authority revocation; whether their exact mechanics belong in the
composed design remains a separate decision.
