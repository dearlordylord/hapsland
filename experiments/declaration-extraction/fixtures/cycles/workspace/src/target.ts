export interface CycleA {
  next: CycleB;
  label: string;
}

export interface CycleB {
  next: CycleA;
}
