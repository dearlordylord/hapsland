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

// Compiler-valid minimized extraction examples, independent of review judgments.
export const bendExtractionFixtures = [
  {
    id: "generic-data-and-type-bindings",
    source:
      "import Base\ntype Generic<S: Data> is Data:\n  Generic{id: U32}\ntype Container<C: Type> is Type:\n  Container{value: C}\ntype Erased<-S: Data> is Data:\n  Erased{value: S}"
  },
  {
    id: "base-list-bound-and-nested-local-payloads",
    source:
      "import Base\ntype Requirement<S: Data> is Data:\n  Requirement{subject: S}\ntype Provision<S: Data> is Data:\n  Provision{requirements: List<&2,Requirement<S>>}\ntype Subject is Data:\n  Subject{}\ntype Schedule is Data:\n  Schedule{provision: Provision<Subject>}"
  },
  {
    id: "base-list-imported-type-arguments",
    files: { "requirement.bend": "type Requirement<S: Data> is Data:\n  Requirement{subject: S}" },
    source:
      "import Base\nimport ./requirement.bend as R\ntype Root is Data:\n  Root{items: List<&2,R.Requirement<U32>>}"
  },
  {
    id: "quantified-imported-and-local-closure",
    files: {
      "list.bend": "type List<-q: Quant, A: Data> is Data:\n  NoItems{}\n  MoreItems{head: A, tail: List<q,A>}",
      "requirement.bend": "type Requirement<S: Data> is Data:\n  Requirement{subject: S}"
    },
    source:
      "import ./list.bend as L\nimport ./requirement.bend as R\ntype Subject is Data:\n  Subject{}\ntype Provision<S: Data> is Data:\n  Provision{requirements: L.List<&2,R.Requirement<S>>}\ntype Schedule is Data:\n  Schedule{provision: Provision<Subject>}"
  }
]
