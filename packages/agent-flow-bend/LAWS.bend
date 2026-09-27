import Base
import ./Advicing.bend as Advicing
import ./Flow.bend as Flow

# A Jev finding ends the item's Jeview and produces pending advice for the
# same item in one transition.
law finding_enters_pending_advice:
  for item: Nat
  {Advicing.receive_finding(Advicing.AtJev{item}) == Advicing.AdvicePending{item} : Advicing.PendingAdvice}

# A finding for the first value leaves the second Jeview value unchanged.
# This law allows both values to carry the same item ID.
law finding_preserves_second_value:
  for item: Nat
  for second_item: Nat
  {Advicing.receive_finding_with_second(
    Advicing.AtJev{item}, Advicing.AtJev{second_item}
  ) == (
    Advicing.AdvicePending{item}, Advicing.AtJev{second_item}
  ) : Advicing.PendingAdvice & Advicing.Jeview}


law closed_round_rejects_stop:
  {Flow.step(Flow.initial(), Flow.StopHookFired{}, None{}) ==
    Flow.Rejected{Flow.initial(), Flow.VirtualRoundClosed{}} : Flow.Step}

law edit_opens_first_round:
  {Flow.step(Flow.initial(), Flow.EditObserved{}, None{}) ==
    Flow.Accepted{
      Flow.Flow{Flow.Packet{1n, Flow.Preparation{}} <> Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 0n, False{}, True{}, None{}, None{}, None{}, None{}, Nil{}},
      Flow.NoDecision{},
      Flow.Flow{Flow.Packet{1n, Flow.Preparation{}} <> Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 0n, False{}, True{}, None{}, None{}, None{}, None{}, Nil{}}
    } : Flow.Step}

law zero_capacity_is_rejected:
  {Flow.step(Flow.initial(), Flow.SourceCapacitySet{Flow.Capacity{0n, 0n}}, None{}) ==
    Flow.Rejected{Flow.initial(), Flow.InvalidCapacity{}} : Flow.Step}

def one_jev() -> Flow.Flow:
  Flow.Flow{Flow.Packet{1n, Flow.Jev{}} <> Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 0n, False{}, True{}, None{}, None{}, None{}, None{}, Nil{}}

def one_pending() -> Flow.Flow:
  Flow.Flow{Flow.Packet{1n, Flow.AdviceStore{}} <> Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 0n, False{}, True{}, None{}, None{}, None{}, None{}, Nil{}}

law finding_enters_pending_in_flow:
  {Flow.step(one_jev(), Flow.JevFindingReceived{}, None{}) ==
    Flow.Accepted{one_pending(), Flow.NoDecision{}, one_pending()} : Flow.Step}

law clear_emits_review_status:
  {Flow.changes(one_jev(), Flow.JevClearReceived{}, None{},
    Flow.step(one_jev(), Flow.JevClearReceived{}, None{})) ==
    Flow.Transition{Flow.JevClearReceived{}, Flow.route_of(Flow.JevClearReceived{}), Some{1n}} <>
    Flow.Emitted{Flow.JevClearReceived{}, Flow.OutcomeStoreNode{}, 1n} <> Nil{} : List<&2, Flow.FlowChange>}

law four_continuations_close_on_stop:
  {Flow.step(
    Flow.Flow{Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 4n, False{}, False{}, None{}, None{}, None{}, None{}, Nil{}},
    Flow.StopHookFired{}, None{}) ==
    Flow.Accepted{
      Flow.Flow{Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, False{}, 4n, False{}, False{}, None{}, None{}, None{}, None{}, Nil{}},
      Flow.AllowFinish{Nil{}, Nil{}, Nil{}},
      Flow.Flow{Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 4n, True{}, False{}, None{}, None{}, None{}, None{}, Nil{}}
    } : Flow.Step}
