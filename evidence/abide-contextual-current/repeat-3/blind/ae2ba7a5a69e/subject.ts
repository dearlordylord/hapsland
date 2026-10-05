import type { AudioTrack } from "./support";

type TrackAtSampleRate<Rate extends AudioTrack["encoding"]["sampleRate"]> =
  Omit<AudioTrack, "encoding"> & {
    encoding: Omit<AudioTrack["encoding"], "sampleRate"> & {
      sampleRate: Rate;
    };
  };

type CaseStateAtSampleRate<Rate extends AudioTrack["encoding"]["sampleRate"]> = {
  displayLabel: string;
  track: TrackAtSampleRate<Rate>;
  sampleRate: Rate;
};

export type CaseState =
  | CaseStateAtSampleRate<44100>
  | CaseStateAtSampleRate<48000>;
