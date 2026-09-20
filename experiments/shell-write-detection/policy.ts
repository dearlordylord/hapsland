import { matchesAnyGlob } from "../../src/matcher/glob.ts";
import { protectedPathReason } from "../../src/policy/file-policy.ts";
import { digest } from "./protocol.ts";

/**
 * A small captured policy for the experiment. Protected gates are delegated to
 * the product's current file-policy implementation; includes/excludes model
 * the captured repository-relative selection policy.
 */
export type PrototypePolicy = {
  readonly includes: ReadonlyArray<string>;
  readonly excludes: ReadonlyArray<string>;
  readonly digest: string;
};

export const makePolicy = (
  options: {
    readonly includes?: ReadonlyArray<string>;
    readonly excludes?: ReadonlyArray<string>;
  } = {},
): PrototypePolicy => {
  const policy = {
    includes: [...(options.includes ?? ["**/*"])],
    excludes: [...(options.excludes ?? [])],
  };
  return { ...policy, digest: digest(policy) };
};

export type Eligibility =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason:
        | "protected"
        | "excluded"
        | "not-included";
    };

export const eligibility = (
  policy: PrototypePolicy,
  path: string,
): Eligibility => {
  if (protectedPathReason(path) !== undefined) {
    return { eligible: false, reason: "protected" };
  }
  if (matchesAnyGlob(policy.excludes, path)) {
    return { eligible: false, reason: "excluded" };
  }
  if (policy.includes.length === 0 || !matchesAnyGlob(policy.includes, path)) {
    return { eligible: false, reason: "not-included" };
  }
  return { eligible: true };
};

/** Directories that can be skipped without reading any descendant content. */
export const canPruneDirectory = (
  policy: PrototypePolicy,
  path: string,
): boolean => {
  const segments = path.split("/");
  if (segments.includes(".git") || segments.includes("node_modules")) return true;
  if (segments.some((segment) => ["build", "coverage", "dist", "generated", "target", "vendor"].includes(segment))) {
    return true;
  }

  // A file-shaped exclude (for example `excluded/*.ts`) proves nothing about
  // sibling files or deeper descendants.  Only the two explicit globstar
  // forms below prove that every descendant of this concrete directory is
  // excluded, so all other policy patterns must be handled by walking and
  // filtering individual files.
  return policy.excludes.some((pattern) => {
    const normalized = pattern.replaceAll("\\", "/").replace(/\/+$/, "");
    return normalized === `${path}/**` || normalized === `${path}/**/*`;
  });
};
