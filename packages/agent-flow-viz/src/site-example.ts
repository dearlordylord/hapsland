/** Repository-owned copy of the Gallery example from the existing video demo.
 * Source: ../hapsland-research/marketing/video/src/code-data.mjs, codeExamples.gallery
 * SHA-256: bfe9b48fe5b30706cecbbcc6464bd764da9330838e65d44e308bdbb52fee31b1
 * The code is unchanged. The traversal demo places its declarations in separate files
 * and uses illustrative sizes so file exclusions and the tree limit are visible.
 * This is authored demonstration feedback, not a live classifier result.
 */
export const SITE_EXAMPLE = {
  rootName: "Gallery",
  initialDiff: ["   title: string;", "+  coverWidth: number;", "   public: boolean;"],
  definitionNames: ["Gallery", "ImageFile", "Dimensions"],
  before: [
    "interface Gallery {",
    "  cover: ImageFile;",
    "  title: string;",
    "  coverWidth: number;",
    "  public: boolean;",
    "}"
  ],
  after: ["interface Gallery {", "  cover: ImageFile;", "  title: string;", "  public: boolean;", "}"],
  dependencies: [
    ["interface ImageFile {", "  path: string;", "  dimensions: Dimensions;", '  format: "jpeg" | "png";', "}"],
    ["interface Dimensions {", "  width: number;", "  height: number;", '  unit: "px";', "}"]
  ],
  recordedSample: {
    before: 0.83,
    after: 0.12,
    threshold: 0.7,
    source: "https://github.com/dearlordylord/hapsland-research/blob/master/marketing/video/README.md",
    scope:
      "Recorded synthetic same-file study; not live/current installed integration evidence; this rule was removed from defaults"
  },
  ruleId: "r4_duplicate_encoding",
  // Historical wording from the recorded duplicate-encoding rule, removed from defaults by #240.
  ruleQuestion:
    "Can a value of `artifact` carry one fact twice over and have the two copies disagree, because the shape stores it in more than one place?",
  feedbackMessage: "The type appears to store the same fact in places that can disagree.",
  explanation:
    "In this example, coverWidth means the current cover image’s width, also stored in cover.dimensions.width. If it were an intentional snapshot or a separate display width, this would be a different design decision."
} as const
