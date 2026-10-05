import type { AudioTrack } from "./support";
type CaseStateAtRate<Rate extends AudioTrack["encoding"]["sampleRate"]> = {
  displayLabel: string;
  track: AudioTrack & {
    encoding: {
      sampleRate: Rate;
      channels: AudioTrack["encoding"]["channels"];
    };
  };
  sampleRate: Rate;
};

export type CaseState = CaseStateAtRate<44100> | CaseStateAtRate<48000>;
