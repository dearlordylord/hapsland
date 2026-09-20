# Remember source-egress consent per repository and review backend

Phase F stores explicit repository-wide approval for each repository and review
backend/destination in user-owned state; project configuration cannot grant consent.
This keeps approval reusable without silently authorizing a different source recipient.
Directory-scoped grants are deferred to [issue #2](https://github.com/dearlordylord/jevs/issues/2)
because finer path permissions introduce matching and user-interaction complexity that is
unnecessary for the first configurable version; eligible-file and privacy exclusions still
apply within an approved repository.

Implementation is tracked by [Phase F issue #3](https://github.com/dearlordylord/jevs/issues/3).
