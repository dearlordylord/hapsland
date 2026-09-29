import { fetchRemote } from "./support";
export function current(): number { return fetchRemote() }
