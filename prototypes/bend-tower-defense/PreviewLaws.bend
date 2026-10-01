# PROPOSED, NOT APPROVED: preview-law scope for a later formalization pass.
# This file is not imported by the game. No theorem or universal proof is claimed.
# Directed witnesses are RoadPreviewTests.bend and validation-preview-*.txt.
import Base

# 1. Marginal equivalence. For reachable game states with unique scenario IDs,
# bounded worker counts, legal tower kinds/levels and valid affordable build intent,
# current effective worker permits + proposed permit delta must equal the permits
# after the exact mouse click. Existing bonuses and their cap belong in both sides.
# Reason: a placement preview must describe the real engine's next state, not a
# separate optimistic model of what a tower ought to do.
# 2. Next-batch policy. Under those premises, current per-item encoding overhead
# minus preview reduction and configured target plus preview delta equal the next
# policy after the click. Zero encoding and bonus saturation clip independently;
# an already-reserved writer's members and bytes remain identical.
# Reason: future encoding policy must never appear to resize committed output.
# 3. Eligibility/resource fidelity. Invalid, selected, terminal or unaffordable
# build intent yields no actionable buff. A legal no-target/saturated build still
# advertises its actual gold cost; raw hit testing and snapped placement match click.
# Reason: zero benefit does not mean a free tower, and inspection is not placement.
# 4. Read-only host boundary. Merely calculating/rendering a hover never installs
# the hypothetical state, advances time, spends gold, constructs, or upgrades.
# Reason: the hypothetical click is an internal pure comparison value; only an
# actual mouse event reaches the game's construction path. The preview returns
# a Delta value, never a replacement playable state. This needs an explicit host
# observation law rather than a tautological equality on a pure state argument.
# Approval/formalization must first bind valid-state premises and bounded U32
# arithmetic. Do not turn these outlines into unconditional arbitrary-state laws.
