export interface CycleA {
  next: CycleB;
}

export interface CycleB {
  next: CycleA;
}
