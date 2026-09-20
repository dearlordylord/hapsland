/** The first version has one fixed Jev destination; endpoint routing is out of scope. */
export const JEV_BACKEND = "jev" as const;
export const JEV_API_BASE = "https://api.typesafe.ai/v1" as const;
export const JEV_DESTINATION = "https://api.typesafe.ai/v1/systemone" as const;

export type BackendId = typeof JEV_BACKEND;
export type Destination = typeof JEV_DESTINATION;
