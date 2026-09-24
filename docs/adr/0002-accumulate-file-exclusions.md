# Preserve exclusions across configuration layers

Phase F replaces inherited include lists with the highest-precedence supplied list,
but accumulates exclusions across built-in, user, and project configuration; exclusion
always wins. This deliberately prevents project policy from weakening user privacy
restrictions, although familiar tools such as TypeScript and Git allow different override
behavior. Negated re-inclusion is excluded from this phase, so an overbroad exclusion must
be removed at its originating layer; keep built-in exclusions narrow and expose provenance
through configuration explanation.

The decision adopts the bounded recommendation in
[the file-filter research](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-CONFIG-FILE-FILTER-RESEARCH-2026-09-19.md).

Implementation is tracked by Phase F issue #3.
The later directory-consent follow-up (issue #2)
must preserve these exclusion constraints.
