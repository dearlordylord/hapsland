export type CodeToken = {
  readonly kind: "plain" | "keyword" | "type" | "string" | "function"
  readonly text: string
  readonly emphasis?: "conflict" | "attention"
}
// Fixed, pre-tokenized samples: the displayed source is never parsed at runtime.
export const COMMENTS = [
  {
    label: "MEANINGLESS COMBINATIONS",
    quote: "Can a field be set in a state where it has no meaning?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Order" },
      { kind: "plain", text: " = {\n  status: " },
      { kind: "string", text: '"pending"' },
      { kind: "plain", text: " | " },
      { kind: "string", text: '"delivered"' },
      { kind: "plain", text: ";\n  deliveredAt: " },
      { kind: "type", text: "Date" },
      { kind: "plain", text: " | " },
      { kind: "keyword", text: "null" },
      { kind: "plain", text: ";\n};\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " order: " },
      { kind: "type", text: "Order" },
      { kind: "plain", text: " = {\n  status: " },
      { kind: "string", text: '"pending"' },
      { kind: "plain", text: ",\n" },
      { kind: "plain", text: "  deliveredAt: new Date()", emphasis: "conflict" },
      { kind: "plain", text: "\n};" }
    ],
    note: "This compiles. A pending order has no delivery time."
  },
  {
    label: "DOMAIN VALUES",
    quote: "Can values with different domain meanings be used interchangeably?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "UserId" },
      { kind: "plain", text: " = " },
      { kind: "type", text: "string" },
      { kind: "plain", text: ";\n" },
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "OrderId" },
      { kind: "plain", text: " = " },
      { kind: "type", text: "string" },
      { kind: "plain", text: ";\n\n" },
      { kind: "keyword", text: "function" },
      { kind: "plain", text: " " },
      { kind: "function", text: "userPath" },
      { kind: "plain", text: "(id: " },
      { kind: "type", text: "UserId" },
      { kind: "plain", text: ") {\n  " },
      { kind: "keyword", text: "return" },
      { kind: "plain", text: " " },
      { kind: "string", text: "`/users/${id}`" },
      { kind: "plain", text: ";\n}\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " orderId: " },
      { kind: "type", text: "OrderId" },
      { kind: "plain", text: " = " },
      { kind: "string", text: '"order-42"' },
      { kind: "plain", text: ";\n" },
      { kind: "function", text: "userPath" },
      { kind: "plain", text: "(orderId);" }
    ],
    note: "Example: userPath(orderId) compiles despite receiving an order ID."
  },
  {
    label: "PARTS OF ONE FACT",
    quote: "Can one part of a fact be supplied without the rest?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "MapPin" },
      { kind: "plain", text: " = {\n  latitude?: " },
      { kind: "type", text: "number" },
      { kind: "plain", text: ";\n  longitude?: " },
      { kind: "type", text: "number" },
      { kind: "plain", text: ";\n};\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " pin: " },
      { kind: "type", text: "MapPin" },
      { kind: "plain", text: " = {\n" },
      { kind: "plain", text: "  latitude: 51.5", emphasis: "conflict" },
      { kind: "plain", text: "\n};" }
    ],
    note: "This compiles. Latitude alone cannot place a pin on a map."
  },
  {
    label: "ABSENCE CONFUSION",
    quote: "Can the same absence be represented in different ways?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Person" },
      { kind: "plain", text: " = {\n" },
      { kind: "plain", text: "  middleName?: string | null;", emphasis: "attention" },
      { kind: "plain", text: "\n};\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " people: " },
      { kind: "type", text: "Person" },
      { kind: "plain", text: "[] = [\n  {},\n  { middleName: " },
      { kind: "keyword", text: "null" },
      { kind: "plain", text: " },\n  { middleName: " },
      { kind: "string", text: '""' },
      { kind: "plain", text: " }\n];" }
    ],
    note: "No middle name, three representations. Callers must account for all three."
  },
  {
    label: "NAME AND TYPE",
    quote: "Does the type allow values its name rules out?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Count" },
      { kind: "plain", text: " = " },
      { kind: "type", text: "number" },
      { kind: "plain", text: ";\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " missing: " },
      { kind: "type", text: "Count" },
      { kind: "plain", text: " = " },
      { kind: "plain", text: "-1", emphasis: "conflict" },
      { kind: "plain", text: ";\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " partial: " },
      { kind: "type", text: "Count" },
      { kind: "plain", text: " = " },
      { kind: "plain", text: "1.5", emphasis: "conflict" },
      { kind: "plain", text: ";" }
    ],
    note: "Both compile. A count of items cannot be negative or fractional."
  },
  {
    label: "VISIBLE DEPENDENCIES",
    quote: "Does the body read or change anything its declaration leaves out?",
    code: [
      { kind: "keyword", text: "function" },
      { kind: "plain", text: " " },
      { kind: "function", text: "isExpired" },
      { kind: "plain", text: "(at: " },
      { kind: "type", text: "number" },
      { kind: "plain", text: "): " },
      { kind: "type", text: "boolean" },
      { kind: "plain", text: " {\n  " },
      { kind: "keyword", text: "return" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Date" },
      { kind: "plain", text: "." },
      { kind: "function", text: "now" },
      { kind: "plain", text: "() > at;\n}" }
    ],
    note: "Example: the result depends on a clock absent from the declaration."
  }
] as const satisfies readonly { label: string; quote: string; code: readonly CodeToken[]; note: string }[]

export const PHASES = ["The edit", "Related code", "Review request", "Agent feedback", "Example edit", "Recheck"]
export const PHASE_COPY = [
  "The agent adds a field for the cover image’s width. The diff shows the new line and the lines around it.",
  "Hapsland finds the changed Gallery type, then follows cover and dimensions to their definitions.",
  "Jev receives the selected source code and the review question, then returns a classification. Here both width fields mean the current cover image’s width.",
  "Hapsland sends the feedback message configured for this rule.",
  "One possible edit removes the second copy of the width. Later code can read it from the cover image instead.",
  "The revised type is reviewed with its related definitions again. Rechecking does not prove the code correct."
]
