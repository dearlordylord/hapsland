# Remember source-egress consent per repository and review backend

Phase F stores explicit repository-wide approval for each repository and review
backend/destination in user-owned state; project configuration cannot grant consent.
This keeps approval reusable without silently authorizing a different source recipient.
Directory-scoped grants are deferred to [issue #2](https://github.com/dearlordylord/jevs/issues/2)
because finer path permissions introduce matching and user-interaction complexity that is
unnecessary for the first configurable version; eligible-file and privacy exclusions still
apply within an approved repository.

The enable flow is two-step: a preview reports the canonical root, fixed Jev
`/v1/systemone` destination, repository-wide eligible-source scope, and a proposal digest;
only an explicit confirmation of the matching digest writes the grant. Dispatch rereads
the user-owned grant state so a disable takes effect before a later provider call.

Implementation is tracked by [Phase F issue #3](https://github.com/dearlordylord/jevs/issues/3).
