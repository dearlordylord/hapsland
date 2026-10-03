import { expect, it } from "vitest";
import { decodeDriverEvent } from "./driver-codec.ts";
const member = (state: unknown) => ({ $: "Canonical.ReuseMemberCheck", joined_state: state,
 stale_unavailable: false, has_revision: true, has_advice_id: true });
it.each(["Pending","Clear","Finding","Unavailable"])("decodes exact joined %s facts immutably", state => {
 const event = decodeDriverEvent(member({ $: `Reuse.Joined${state}` }));
 expect(event).toEqual({ kind: "reuseMemberCheck", state: state.toLowerCase(), staleUnavailable:false,hasRevision:true,hasAdviceId:true });
 expect(Object.isFrozen(event)).toBe(true);
 expect(()=>decodeDriverEvent(member({ $: `Reuse.Joined${state}`, extra: 1 }))).toThrow();
});
it("rejects unknown joined tags and malformed whole events",()=>{
 expect(()=>decodeDriverEvent(member({ $: "Reuse.toString" }))).toThrow();
 expect(()=>decodeDriverEvent({ ...member({ $: "Reuse.JoinedFinding" }), has_revision: 1 })).toThrow();
 expect(()=>decodeDriverEvent({ $: "Canonical.StartReview", partition:1,lifetime:1,round:1,operation:0 })).toThrow();
});
