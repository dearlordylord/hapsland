import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Decision, DecisionModel } from "effect/unstable/ai";
import { Live } from "./jev-decision.ts";

const TicketState = Schema.Struct({
  ticket: Schema.Struct({ message: Schema.String }),
  order: Schema.Struct({
    charges: Schema.Array(Schema.Struct({ amount_usd: Schema.Number })),
  }),
  refund_policy: Schema.String,
});

const Ticket = Decision.make({
  input: TicketState,
  decisions: {
    department: Decision.classify({
      instructions: "Which team should handle this?",
      criteria: {
        billing: "Billing, charges, payments, and refunds",
        technical: "Product defects and technical support",
        sales: "Purchasing and product selection",
      },
    }),
    duplicateCharge: Decision.probability({
      instructions: "Do the message and charges indicate a duplicate charge?",
      criteria: {
        false: "The evidence does not indicate that the same charge occurred twice",
        true: "The evidence indicates that the same charge occurred twice",
      },
    }),
    frustration: Decision.rate({
      instructions: "How frustrated is the customer?",
      criteria: [
        "Calm, stating facts",
        "Frustrated but civil",
        "Very angry, strong language",
      ],
    }),
  },
});

const state = {
  ticket: { message: "Charged twice for order A-104. Refund please." },
  order: { charges: [{ amount_usd: 49 }, { amount_usd: 49 }] },
  refund_policy: "Duplicate charges are eligible for a refund.",
};

const program = Effect.gen(function* () {
  const { answers, usage } = yield* DecisionModel.decide(Ticket, { input: state });

  console.log("department:", answers.department.label);
  console.log("department probabilities:", answers.department);
  console.log("duplicate charge probability:", answers.duplicateCharge.probability);
  console.log("frustration:", answers.frustration.rating);
  console.log("usage:", usage);
});

Effect.runPromise(program.pipe(Effect.provide(Live)));
