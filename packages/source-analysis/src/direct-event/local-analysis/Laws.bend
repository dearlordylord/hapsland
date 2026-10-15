import Base
import ./Model.bend as M
import ./Core.bend as Core
import ./Execution.bend as E
import ./Specification.bend as S

# Draft whole-capability obligations, awaiting proof. No law assumes a valid,
# unique, acyclic catalog or an external fuel budget. The active native analyzer
# cannot be deleted or replaced on finite cursor checks alone.

# Preserve every original root outcome, exact DFS tree and first failure.
law materialized_exact:
  for +catalog: M.Catalog
  {E.outcomes(E.execute(catalog, Core.Trees{})) == S.outcomes(catalog, M.Materialize{})
    : Maybe<&2, List<&2, M.Outcome>>}

# The same decisions and failures, with no retained materialized tree.
law outcomes_exact:
  for +catalog: M.Catalog
  {E.outcomes(E.execute(catalog, Core.Outcomes{})) == S.outcomes(catalog, M.OutcomesOnly{})
    : Maybe<&2, List<&2, M.Outcome>>}

# Every native instruction, including literals, repeated measurements, IEEE
# grouping and the ordered outer fold from zero, agrees with the old equations.
law preflight_trace_exact:
  for +catalog: M.Catalog
  {E.trace(E.execute(catalog, Core.Preflight{})) == S.preflight_trace(catalog)
    : Maybe<&2, List<&2, M.Op>>}

# Equality of two exhaustion refusals is not successful correspondence. Both
# entrypoints must finish under their own internally derived bounds.
law derived_budget_sufficient:
  for +catalog: M.Catalog
  {Bool.and(S.complete(catalog),
    Bool.and(E.completed(E.execute(catalog, Core.Trees{})),
      Bool.and(E.completed(E.execute(catalog, Core.Outcomes{})),
        E.completed(E.execute(catalog, Core.Preflight{}))))) == True{} : Bool}

def main() -> Unit:
  Unit{}
