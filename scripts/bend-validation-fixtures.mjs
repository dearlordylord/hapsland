// Synthetic examples shared by opt-in live and local compiler validation.
export const bendFixtures = [
  {
    id: "bend-payment-bad",
    source:
      "import Base\ntype PaymentStatus is Data:\n  Pending{}\n  Succeeded{}\n  Failed{}\ntype OptionalString is Data:\n  Absent{}\n  Present{value: String}\ntype PaymentState is Data:\n  PaymentState{status: PaymentStatus, receipt: OptionalString, failure_reason: OptionalString}"
  },
  {
    id: "bend-payment-good",
    source:
      "import Base\ntype PaymentState is Data:\n  Pending{}\n  Succeeded{receipt: String}\n  Failed{failure_reason: String}"
  }
]
