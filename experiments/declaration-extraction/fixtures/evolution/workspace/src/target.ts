import type { Retargeted } from "./types-b.ts";

export interface Formatting {
  value:string;
}

export interface AfterName {
  value: string;
}

export interface ImportTarget {
  value: Retargeted;
}

export interface RootOne {
  value: string;
  label: string;
}

export interface RootTwo {
  value: number;
  label: string;
}

export interface DeletedReplacement {
  gone: false;
}

export interface GenericBox<T> {
  value: T;
  next?: GenericBox<T>;
}

export interface GenericUse {
  box: GenericBox<number>;
}

export interface Moved {
  value: boolean;
}
