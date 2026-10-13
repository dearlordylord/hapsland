import type owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { createProviderIdentityResolver, type ProviderIdentityPorts } from "../provider-identity.ts"

export type { ProviderIdentitySession } from "../provider-identity.ts"
export { resolveProviderIdentity } from "../provider-identity.ts"
// Fixture ports retain the actual compiled provider kernel and shared Canonical driver.
export const createProviderIdentityForVerification = (
  ports: Pick<ProviderIdentityPorts, "encodeComponent"> & {
    readonly owner?: typeof owner
    readonly createRegistry?: ProviderIdentityPorts["createRegistry"]
  }
) => createProviderIdentityResolver(ports)
