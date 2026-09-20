import type { Retargeted } from "./types-a.ts";

export interface Formatting {
  value: string;
}

export interface BeforeName {
  value: string;
}

export interface ImportTarget {
  value: Retargeted;
}

export interface RootOne {
  value: string;
}

export interface RootTwo {
  value: number;
}

export interface Moved {
  value: boolean;
}

export interface Deleted {
  gone: true;
}

export interface GenericBox<T> {
  value: T;
  next?: GenericBox<T>;
}

export interface GenericUse {
  box: GenericBox<string>;
}
