import type { ImageAsset } from "./support";

type Resolution = ImageAsset["rendering"]["resolution"];

export type CaseState = {
  [R in Resolution]: {
    displayLabel: string;
    asset: ImageAsset & { rendering: { resolution: R } };
    resolution: R;
  };
}[Resolution];
