import type { ImageAsset } from "./support";

type RenderingResolution = ImageAsset["rendering"]["resolution"];

type CaseStateForResolution<Resolution extends RenderingResolution> = {
  displayLabel: string;
  asset: ImageAsset & {
    rendering: ImageAsset["rendering"] & { resolution: Resolution };
  };
  resolution: Resolution;
};

export type CaseState = {
  [Resolution in RenderingResolution]: CaseStateForResolution<Resolution>;
}[RenderingResolution];
