# Bend migration implementation prototype

**Purpose:** Preserve the accumulated authored TypeScript-to-Bend migration implementation, proofs and experiment runners as reviewable source captures.
**Audience:** Contributors implementing and reviewing the migration, including coding agents.
**Status:** Temporary implementation prototype; incomplete and not connected to production Canonical preparation.
**Authority:** Implementation artifacts only. [Migration guidance](../../docs/bend-migration.md) and the accepted [Canonical flow architecture](../../docs/architecture.md#canonical-ownership-of-the-product-flow) own requirements.
**Expected use:** Continue the complete resolver and language-session migration, prove its original guarantees, and qualify the composed production consumer before adoption. Some declarations remain unproved; individual proof passes do not qualify the subsystem.
**Lifecycle:** At acceptance of the Canonical-connected preparation/resolver subsystem, consolidate accepted implementation and laws into their production package owners, transfer current acceptance evidence to its designated owner, update inbound links, and delete this prototype tree. Raw experiment outputs remain ignored under `evidence/bend-strangler`.

Bend source captures use `.bend.txt` because the pinned formatter cannot parse some checked proof constructs. Their exact bytes and original paths are recorded in `source-inventory.json`. Run `node prototypes/bend-strangler/restore-sources.mjs` to reconstruct missing sources under ignored `evidence/bend-strangler`; the restorer verifies every hash and refuses to overwrite differing current work. An optional destination argument restores into a separate directory. Run proof and experiment entry points from that restored tree so their original relative imports resolve. Promote accepted source to ordinary formatted production files at subsystem acceptance.

The current resolver candidate lacks Go and the new Python/module authority semantics from master. Its original physical corpus no longer passes differential qualification. Canonical launch/cancel/terminal integration, the complete parent attachment proof, composed consumer checks, TypeScript removal and performance acceptance remain open.
