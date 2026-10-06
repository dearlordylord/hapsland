-- Supporting proofs, inserted after mechanically lowered owner definitions.
-- The two conversion lemmas prove non-overflow, not assume it.
namespace MotionFacts

theorem coordinate_up (a b p : U32) (h : a.toNat ≤ b.toNat) :
    (Map.travel_coordinate a b p).toNat = a.toNat + min p.toNat (b.toNat - a.toNat) := by
  unfold Map.travel_coordinate Map.travel_coordinate_order min32
  simp only [BitVec.ule_eq_decide, BitVec.ult_eq_decide, decide_eq_true_eq, ite_eq_left h]
  have sub := BitVec.toNat_sub_of_le (x := b) (y := a) h
  simp only [sub]
  split
  · rename_i hp
    rw [BitVec.toNat_add_of_lt (by have := b.isLt; omega)]
    simp only [Nat.min_def]
    split <;> omega
  · rename_i hp
    rw [BitVec.toNat_add_of_lt (by have := b.isLt; omega), sub]
    simp only [Nat.min_def]
    split <;> omega

theorem coordinate_down (a b p : U32) (h : ¬a.toNat ≤ b.toNat) :
    (Map.travel_coordinate a b p).toNat = a.toNat - min p.toNat (a.toNat - b.toNat) := by
  unfold Map.travel_coordinate Map.travel_coordinate_order min32
  simp only [BitVec.ule_eq_decide, BitVec.ult_eq_decide, decide_eq_true_eq, ite_eq_right h]
  have sub := BitVec.toNat_sub_of_le (x := a) (y := b) (by change b.toNat ≤ a.toNat; omega)
  simp only [sub]
  split
  · rename_i hp
    rw [BitVec.toNat_sub_of_le (by change _ ≤ a.toNat; omega)]
    simp only [Nat.min_def]
    split <;> omega
  · rename_i hp
    rw [BitVec.toNat_sub_of_le (by change _ ≤ a.toNat; omega), sub]
    simp only [Nat.min_def]
    split <;> omega

theorem coordinate_toNat (a b p : U32) :
    (Map.travel_coordinate a b p).toNat =
      if a.toNat ≤ b.toNat then a.toNat + min p.toNat (b.toNat - a.toNat)
      else a.toNat - min p.toNat (a.toNat - b.toNat) := by
  by_cases h : a.toNat ≤ b.toNat
  · rw [ite_eq_left h]
    exact coordinate_up a b p h
  · rw [ite_eq_right h]
    exact coordinate_down a b p h

theorem distance_toNat (a b : U32) :
    (Map.distance a b).toNat = if a.toNat ≤ b.toNat then b.toNat - a.toNat else a.toNat - b.toNat := by
  unfold Map.distance Map.distance_order
  simp only [BitVec.ule_eq_decide, decide_eq_true_eq]
  split
  · rename_i h
    exact BitVec.toNat_sub_of_le h
  · rename_i h
    exact BitVec.toNat_sub_of_le (by change b.toNat ≤ a.toNat; omega)

theorem coordinate_between (a b p : U32) :
    min a.toNat b.toNat ≤ (Map.travel_coordinate a b p).toNat ∧
    (Map.travel_coordinate a b p).toNat ≤ max a.toNat b.toNat := by
  rw [coordinate_toNat]
  have hp := Nat.min_le_right p.toNat (b.toNat - a.toNat)
  have hq := Nat.min_le_right p.toNat (a.toNat - b.toNat)
  by_cases h : a.toNat ≤ b.toNat
  · simp only [ite_eq_left h, Nat.min_eq_left h, Nat.max_eq_right h]
    omega
  · have h' : b.toNat ≤ a.toNat := by omega
    simp only [ite_eq_right h, Nat.min_eq_right h', Nat.max_eq_left h']
    omega

theorem coordinate_step (a b p : U32) :
    (Map.distance a (Map.travel_coordinate a b p)).toNat ≤ p.toNat := by
  rw [distance_toNat, coordinate_toNat]
  have hp := Nat.min_le_left p.toNat (b.toNat - a.toNat)
  have hq := Nat.min_le_left p.toNat (a.toNat - b.toNat)
  have hr := Nat.min_le_right p.toNat (b.toNat - a.toNat)
  have hs := Nat.min_le_right p.toNat (a.toNat - b.toNat)
  split <;> split <;> omega

theorem coordinate_remaining (a b p : U32) :
    (Map.distance (Map.travel_coordinate a b p) b).toNat ≤ (Map.distance a b).toNat := by
  rw [distance_toNat, distance_toNat, coordinate_toNat]
  have hp := Nat.min_le_right p.toNat (b.toNat - a.toNat)
  have hq := Nat.min_le_right p.toNat (a.toNat - b.toNat)
  split <;> split <;> omega

theorem coordinate_close (a b p : U32) (h : (Map.distance a b).toNat ≤ p.toNat) :
    Map.travel_coordinate a b p = b := by
  apply BitVec.eq_of_toNat_eq
  rw [coordinate_toNat]
  rw [distance_toNat] at h
  by_cases hab : a.toNat ≤ b.toNat
  · simp only [ite_eq_left hab] at h ⊢
    rw [Nat.min_eq_right h]
    omega
  · simp only [ite_eq_right hab] at h ⊢
    rw [Nat.min_eq_right h]
    omega

end MotionFacts
