export type CodeToken = {
  readonly kind: "plain" | "keyword" | "type" | "string" | "function"
  readonly text: string
  readonly emphasis?: "conflict" | "attention"
}
// Fixed, pre-tokenized samples: the displayed source is never parsed at runtime.
export const COMMENTS = [
  {
    label: "MEANINGLESS COMBINATIONS",
    quote: "Can the model combine choices that do not belong together?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Delivery" },
      { kind: "plain", text: " = {\n  method: " },
      { kind: "string", text: '"courier"' },
      { kind: "plain", text: " | " },
      { kind: "string", text: '"pickup"' },
      { kind: "plain", text: ";\n  destination: " },
      { kind: "string", text: '"home"' },
      { kind: "plain", text: " | " },
      { kind: "string", text: '"pickup-point"' },
      { kind: "plain", text: ";\n};\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " delivery: " },
      { kind: "type", text: "Delivery" },
      { kind: "plain", text: " = {\n  method: " },
      { kind: "string", text: '"pickup"' },
      { kind: "plain", text: ",\n" },
      { kind: "plain", text: '  destination: "home"', emphasis: "conflict" },
      { kind: "plain", text: "\n};" }
    ],
    note: "This compiles. A pickup needs a pickup point, not a home address.",
    repair: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Delivery" },
      { kind: "plain", text: " =\n  | { method: " },
      { kind: "string", text: '"courier"' },
      { kind: "plain", text: ";\n      destination: " },
      { kind: "string", text: '"home"' },
      { kind: "plain", text: " }\n  | { method: " },
      { kind: "string", text: '"pickup"' },
      { kind: "plain", text: ";\n      destination: " },
      { kind: "string", text: '"pickup-point"' },
      { kind: "plain", text: " };" }
    ],
    repairNote: "Tie each delivery method to its destination. TypeScript can then reject the wrong combination."
  },
  {
    label: "DOMAIN VALUES",
    quote: "Can values with different domain meanings be used interchangeably?",
    code: [
      { kind: "keyword", text: "function" },
      { kind: "plain", text: " " },
      { kind: "function", text: "checkoutDiscount" },
      { kind: "plain", text: "(price: " },
      { kind: "type", text: "number" },
      { kind: "plain", text: ") {\n  " },
      { kind: "keyword", text: "return" },
      { kind: "plain", text: " price * 0.1;\n}\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " originalPrice = 100;\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " amountAlreadyPaid = 40;\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " discount = " },
      { kind: "function", text: "checkoutDiscount" },
      { kind: "plain", text: "(\n" },
      { kind: "plain", text: "  amountAlreadyPaid", emphasis: "conflict" },
      { kind: "plain", text: "\n);" }
    ],
    note: "The discount is 10% of the original price. This returns 4 instead of 10.",
    repair: [
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " discount = " },
      { kind: "function", text: "checkoutDiscount" },
      { kind: "plain", text: "(originalPrice);" }
    ],
    repairNote: "Calculate the discount from the original price, not the amount already paid. This returns 10."
  },
  {
    label: "PARTS OF ONE FACT",
    quote: "Can an edit separate values that only make sense together?",
    code: [
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " cart = {\n  productIds: [" },
      { kind: "string", text: '"tea"' },
      { kind: "plain", text: ", " },
      { kind: "string", text: '"coffee"' },
      { kind: "plain", text: "],\n  quantities: [1, 2]\n};\n\n" },
      { kind: "plain", text: "cart.productIds.splice(0, 1);", emphasis: "conflict" }
    ],
    note: "Tea is removed, but its quantity stays. Coffee is now paired with 1 instead of 2.",
    repair: [
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " cart = {\n  items: [\n    { productId: " },
      { kind: "string", text: '"tea"' },
      { kind: "plain", text: ", quantity: 1 },\n    { productId: " },
      { kind: "string", text: '"coffee"' },
      { kind: "plain", text: ", quantity: 2 }\n  ]\n};\n\n" },
      { kind: "plain", text: "cart.items." },
      { kind: "function", text: "splice" },
      { kind: "plain", text: "(0, 1);" }
    ],
    repairNote: "Keep each product and its quantity in one item. Removing the item removes both."
  },
  {
    label: "CONSISTENT NORMALIZATION",
    quote: "Do both sides of a comparison use the same representation?",
    code: [
      { kind: "keyword", text: "function" },
      { kind: "plain", text: " " },
      { kind: "function", text: "skuKey" },
      { kind: "plain", text: "(sku: " },
      { kind: "type", text: "string" },
      { kind: "plain", text: ") {\n  " },
      { kind: "keyword", text: "return" },
      { kind: "plain", text: " sku." },
      { kind: "function", text: "trim" },
      { kind: "plain", text: "()." },
      { kind: "function", text: "toUpperCase" },
      { kind: "plain", text: "();\n}\n\n" },
      { kind: "keyword", text: "function" },
      { kind: "plain", text: " " },
      { kind: "function", text: "sameSku" },
      { kind: "plain", text: "(stored: " },
      { kind: "type", text: "string" },
      { kind: "plain", text: ", query: " },
      { kind: "type", text: "string" },
      { kind: "plain", text: ") {\n" },
      { kind: "plain", text: "  return skuKey(stored) === query;", emphasis: "conflict" },
      { kind: "plain", text: "\n}\n\n" },
      { kind: "function", text: "sameSku" },
      { kind: "plain", text: "(" },
      { kind: "string", text: '"TEA"' },
      { kind: "plain", text: ", " },
      { kind: "string", text: '" tea "' },
      { kind: "plain", text: ");" }
    ],
    note: "SKUs ignore case and surrounding spaces. This returns false for the same SKU.",
    repair: [
      { kind: "keyword", text: "function" },
      { kind: "plain", text: " " },
      { kind: "function", text: "sameSku" },
      { kind: "plain", text: "(stored: " },
      { kind: "type", text: "string" },
      { kind: "plain", text: ", query: " },
      { kind: "type", text: "string" },
      { kind: "plain", text: ") {\n  " },
      { kind: "keyword", text: "return" },
      { kind: "plain", text: " " },
      { kind: "function", text: "skuKey" },
      { kind: "plain", text: "(stored) === " },
      { kind: "function", text: "skuKey" },
      { kind: "plain", text: "(query);\n}" }
    ],
    repairNote: "Normalize both values before comparing them. The same call now returns true."
  }
] as const satisfies readonly {
  label: string
  quote: string
  code: readonly CodeToken[]
  note: string
  repair: readonly CodeToken[]
  repairNote: string
}[]

export const PHASES = ["The edit", "Related code", "Review request", "Agent feedback", "Example edit", "Recheck"]
export const PHASE_COPY = [
  "The agent adds a field for the cover image’s width. The diff shows the new line and the lines around it.",
  "Hapsland finds the changed Gallery type, then follows cover and dimensions to their definitions.",
  "Jev receives the selected source code and the review question, then returns a classification. Here both width fields mean the current cover image’s width.",
  "Hapsland sends the feedback message configured for this rule.",
  "One possible edit removes the second copy of the width. Later code can read it from the cover image instead.",
  "The revised type is reviewed with its related definitions again. Rechecking does not prove the code correct."
]
