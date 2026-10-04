import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Execute the demo's actual guard in a bounded subprocess, independent of its claimed repair. */
export const validateDemoSession = async (root: string): Promise<boolean> => {
  const module: unknown = await import(pathToFileURL(join(root, "session.ts")).href);
  if (typeof module !== "object" || module === null || !("isSession" in module) || typeof module.isSession !== "function") return false;
  const isSession = module.isSession as (value: unknown) => unknown;
  return [isSession({ loggedIn: false }), isSession({ loggedIn: true, userId: "demo-user" }),
    !isSession({ loggedIn: false, userId: "demo-user" }), !isSession({ loggedIn: true })].every(Boolean);
};
