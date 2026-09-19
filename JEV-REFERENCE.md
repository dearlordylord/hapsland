# Jev / TypeSafe System One — TypeScript Reference

Jev is TypeSafe's flagship model and the first "System One" model. It takes a **state** (the content to judge) plus a map of typed **questions**, and returns typed **answers** with probability distributions. It generates no text.

Source of truth: `https://docs.typesafe.ai`. HTTP endpoint: `POST https://api.typesafe.ai/v1/systemone`. JS/TS SDK: `@typesafe-ai/sdk` (v0.6.0, Node 20+).

---

## 1. Cheat sheet

```bash
npm install @typesafe-ai/sdk
export TYPESAFE_API_KEY=...        # only required env var
```

```ts
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";

const client = new TypeSafeClient(); // reads TYPESAFE_API_KEY, model jev-latest

const { answers, usage, model } = await client.systemOne({
  state: {
    ticket_message: "My flight was cancelled. Can I get a refund?",
    refund_policy: "Cancelled flights are eligible for a full refund.",
  },
  questions: {
    refund_requested: noul("Does `ticket_message` request a refund?"),
    request_type: choice("What is the main request in `ticket_message`?", {
      refund: "The customer wants money returned.",
      rebooking: "The customer wants a replacement flight.",
      information: "The customer is asking for information only.",
    }),
    frustration: score("How frustrated does the customer appear?", [
      "Calm and neutral.",
      "Concerned but civil.",
      "Very angry or using strong language.",
    ]),
  },
});

answers.refund_requested.noul;        // number 0..1
answers.request_type.choice;          // "refund" | "rebooking" | "information"
answers.request_type.confidence;      // number 0..1
answers.request_type.probabilities;   // Record<option, number>, sums to 1
answers.frustration.score;            // number 0..(levels-1), fractional
answers.frustration.legend;           // { 0: "...", 1: "...", 2: "..." }
usage.input_tokens; usage.output_tokens;
```

Answer types are inferred from the question literals, so `answers.request_type.choice` is a union of your option keys.

### The three primitives

| Primitive | Helper | `criteria` shape | Answer fields | Use when |
|---|---|---|---|---|
| Choice | `choice(instructions, criteria)` | `Record<label, EntryType>` — required; value `null` = no description. Max 255 options. | `type`, `choice`, `probabilities`, `confidence` | Answer is one of a fixed, unordered set |
| Score | `score(instructions, criteria)` | Ordered array (tuple), ≥2 entries, docs recommend ≤10. Index = level number from 0. | `type`, `score`, `legend`, `probabilities`, `confidence` | Answer is a position on a described spectrum |
| Noul | `noul(instructions?, criteria?)` | Optional `{ true?, false? }` descriptions | `type`, `noul` (0..1). **No `confidence`.** | Clean yes/no where the probability itself is the signal |

All three mix freely in one request. Every question is evaluated independently and in parallel against the same state.

---

## 2. What a System One model is

A System One model understands natural-language input like an LLM, but its output contract is different:

- It does not generate text, code, or explanations of its reasoning.
- You define the answer space (options, levels, yes/no). The model returns a probability distribution **over exactly those options** — it cannot emit a value outside them.
- Answers are typed values your code branches on, sorts by, and thresholds. No parsing, no JSON-mode coercion, no retry-on-malformed-output.
- Questions in one request do not see each other. One answer never becomes hidden context for another, so adding or removing a question does not change other answers.

Name origin: Kahneman's System 1 (fast, intuitive) vs System 2 (slow, deliberate). The design target is the snap judgment a knowledgeable person makes in a second given the right context — not extended reasoning.

Positioning stated by the docs: build **AI-powered software**, not agents. Code owns control flow, deterministic rules, and side effects; the model is dropped in only where the system needs common-sense judgment over unstructured data.

### RLCD and calibration

The docs describe three post-training paths: RLHF (chatbots, trained on human preference), RLVR (reasoning models, verifiable rewards), and **RLCD — reinforcement learning for calibrated decisions**, which is TypeSafe's path.

Calibration claim: across many predictions, outcomes assigned probability `0.2` should occur about 20% of the time, `0.8` about 80%, `1.0` 100%.

Two consequences that matter in code:

- **Calibration is a group property.** It describes the aggregate behaviour of many predictions. A single answer at `confidence: 1.0` is not a guarantee of correctness; it only says the returned distribution put all its mass on one outcome.
- **Schema conformance ≠ correctness.** The value is always one of your options. That says nothing about whether it is the right one. Validate against labelled data of your own.

The docs also argue RLHF causes *mode dropping* (preference optimization narrows the output distribution) and rewards sycophancy and confident-sounding hallucination — the motivation for a separate objective, not a measured claim about Jev.

---

## 3. Request / response schema

### HTTP

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

Request body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `state` | `string \| object \| array` | yes | Content to evaluate. SDK also permits `null`. |
| `model` | `string` | yes over HTTP | `"jev-latest"`. SDK fills it from `defaultModel`. |
| `questions` | `map<string, Question>` | yes | Nonempty. Keys are yours; answers come back under the same keys. |

```json
{
  "state": "Hi, I've been trying to connect my Stripe account for 3 days and it keeps failing. I'm losing sales. Please help ASAP.",
  "model": "jev-latest",
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this",
      "criteria": {
        "billing": "Payment or subscription issues",
        "technical": "Bugs or integration problems",
        "sales": "Pricing or account questions"
      }
    },
    "frustration": {
      "type": "score",
      "instructions": "How frustrated the customer appears",
      "criteria": [
        "Calm, just stating facts",
        "Frustrated but civil",
        "Very angry, strong language"
      ]
    },
    "is_urgent": {
      "type": "noul",
      "instructions": "The message conveys urgency or time-sensitivity"
    }
  }
}
```

Response body:

```json
{
  "model": "jev-latest",
  "answers": {
    "department": {
      "type": "choice",
      "choice": "technical",
      "probabilities": { "billing": 0.159, "technical": 0.84, "sales": 0.001 },
      "confidence": 0.596
    },
    "frustration": {
      "type": "score",
      "score": 1.6,
      "legend": { "0": "Calm, just stating facts", "1": "Frustrated but civil", "2": "Very angry, strong language" },
      "probabilities": { "0": 0.05, "1": 0.3, "2": 0.65 },
      "confidence": 0.842
    },
    "is_urgent": { "type": "noul", "noul": 0.999 }
  },
  "usage": { "input_tokens": 312, "output_tokens": 48 }
}
```

Top-level response fields: `model` (string, the model that answered), `answers` (map keyed by your question ids), `usage` (`{ input_tokens, output_tokens }`). All three are required.

Answer field semantics:

- `choice` — the highest-probability option key.
- `probabilities` — every option/level to its probability; floats summing to 1. Score keys are level indices as strings over HTTP.
- `confidence` — 0..1, derived from `probabilities`. Present on Choice and Score only.
- `score` — probability-weighted mean of the level numbers: `Σ level × p(level)`. Can land between levels.
- `legend` — level number → its description (echoes your `criteria`, including object-valued ones).
- `noul` — probability the answer is yes.

### HTTP errors

| Status | Meaning |
|---|---|
| 401 | Missing or invalid API key |
| 422 | Request body failed validation (missing field, malformed question); body details the field |
| 429 | Rate limit exceeded — back off and retry |
| 529 | Overloaded — retry after a short delay |

The SDK retries 408, 429 and 500–599 by default with exponential backoff.

---

## 4. State design

State is the material you hand a panel of experts before asking them to judge. One request = one state + N questions, all questions see the same state.

| Format | Useful for | Example |
|---|---|---|
| String | A message, article, or passage | `"My card was charged twice."` |
| Object | Named fields, related records, application state | `{ message: "...", order_id: "A-104" }` |
| Array | A sequence of messages or records | `["Hi", "My customer number is TS1337.", "..."]` |

Guidance from the docs:

- **Prefer an object.** Named fields keep relationships legible and let questions point at parts.
- **Include only the context the current questions need.** Reduces distraction and context rot. Don't rely on model weights for facts you can supply from your own store.
- **Keep content in `state`, judgments in `questions`.** The refund request and the policy go in the state; "does the policy support this refund?" is a question.
- **Reference nested values by backticked dot-and-index path** inside `instructions`, e.g. `` `ticket.messages[0].text` ``, `` `commerce.orders[0].charges` ``. Include the backticks.

```ts
const state = {
  ticket: {
    subject: "Duplicate charge",
    messages: [
      { from: "customer", text: "I was charged twice for order A-104. Please refund the duplicate." },
      { from: "support", text: "We are checking the charges." },
    ],
  },
  order: { id: "A-104", charges: [{ amount_usd: 49, status: "captured" }, { amount_usd: 49, status: "captured" }] },
  refund_policy: "Duplicate charges are eligible for a refund.",
};

const questions = {
  refund_requested: noul("Does `ticket.messages[0].text` request a refund?"),
  policy_supports_refund: noul(
    "Does `refund_policy` support the refund requested in `ticket.messages[0].text`, given `order.charges`?",
  ),
};
```

---

## 5. Choice

```ts
import { choice } from "@typesafe-ai/sdk";

const department = choice("Which team should handle this?", {
  returns: "Exchanges, refunds, wrong or damaged items",
  shipping: "Delivery status, delays, lost packages",
  billing: "Charges, invoices, payment problems",
});
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"choice"` | Set by the helper |
| `instructions` | yes over HTTP; optional in the SDK type | `EntryType` | The question. String, object, array, or `null`. |
| `criteria` | yes | `Record<label, EntryType>` | Option key → description. `null` = key speaks for itself. |

Behaviour and limits:

- Option **keys and descriptions are both sent to the model**. Write descriptions that separate options from each other.
- Up to **255 options**. Options cost a few tokens each, so supply the full list of teams/categories rather than a shortlist. To go past 255, narrow in two stages (pick the section, then the span).
- Add an `other` / `none of the above` option when the list may not cover every input.
- `confidence` is low when the distribution is flat — usually no option is a clear winner.

Answer, with a genuinely ambiguous ticket ("Shoes arrived two weeks late and in the wrong size. Also I see two charges on my card."):

```json
{
  "type": "choice",
  "choice": "returns",
  "confidence": 0.39,
  "probabilities": { "shipping": 0.02, "billing": 0.38, "returns": 0.6 }
}
```

Reading it: `returns` wins at 0.60 but `billing` holds 0.38, so confidence drops to 0.39. The runner-up is not noise — code can copy the billing team in.

```ts
const dept = answers.department;
if (dept.confidence < 0.3) return sendToManualTriage(ticket);

for (const [team, p] of Object.entries(dept.probabilities)) {
  if (team !== dept.choice && p > 0.25) notify(ticket, team);
}
```

---

## 6. Score

```ts
import { score } from "@typesafe-ai/sdk";

const bugSeverity = score("How severe is the reported issue?", [
  "Cosmetic; no impact to functionality",
  "Broken or degraded feature, but workaround exists",
  "Blocking issue; no workaround exists",
]);
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"score"` | Set by the helper |
| `instructions` | yes over HTTP; optional in the SDK type | `EntryType` | What is being rated |
| `criteria` | yes | ordered array, ≥2 entries | Level descriptions, low end first. Index = level number from 0. Docs: use up to 10. |

Answer:

```json
{
  "type": "score",
  "score": 1.3,
  "confidence": 0.54,
  "legend": { "0": "Cosmetic; ...", "1": "Broken or degraded ...", "2": "Blocking issue; ..." },
  "probabilities": { "0": 0.0, "1": 0.7, "2": 0.3 }
}
```

`score` = `0×0.0 + 1×0.7 + 2×0.3 = 1.3`.

Rules for level design:

- **Describe situations, not degrees.** "Broken or degraded feature, but workaround exists" gives the model something to match. "Moderately severe" does not.
- **Each level is judged on its own.** The model does not see a level's number or its neighbours. "Worse than the previous level" means nothing; numbers inside descriptions do not help.
- **Numeric-only levels fail.** `instructions: "Rate severity from 0 to 2, where 2 is worst"` with `criteria: ["0","1","2"]` scored a pixel-misalignment report at **0.57, confidence 0.35** (`{0: 0.43, 1: 0.57, 2: 0.0}`). The same report with three descriptive levels scored **0.0 at confidence 1.0**.
- **One dimension per Score.** A level reading "punctual and smart and experienced" measures three things; an input high on one and low on another cannot be placed. Confidence drops, and the score stops meaning anything. Split and combine in code.
- **Give a rare extreme its own level.** A scale ending at "very angry" will score an abusive message near the top too; add "abusive or threatening" if you act on it differently.
- **Test wordings against your own data.** Two phrasings of the same scale behave differently.

Reading a score:

- It is a position, not a proportion. A 1.3 does not mean "30% of customers lack a workaround".
- **Different distributions produce the same score.** `score: 1.0` can mean all mass on level 1, or half on level 0 and half on level 2. Read `probabilities` and `confidence` alongside it.
- Use it to rank; round to the nearest level when code needs one outcome.
- Low confidence usually means: overlapping levels, a multi-dimensional question, or a state that does not say enough.

Normalize before combining scales of different lengths — divide by `criteria.length - 1`:

```ts
const norm = (a: { score: number }, levels: number) => a.score / (levels - 1);

const severity = norm(answers.severity, 3);        // 0..1
const frustration = norm(answers.frustration, 3);
const reportQuality = norm(answers.report_quality, 4);

const priority = 0.6 * severity + 0.3 * frustration + 0.1 * reportQuality;
```

---

## 7. Noul

```ts
import { noul } from "@typesafe-ai/sdk";

const isEscalation = noul("Is the customer asking for a human agent?");

const isRepeatContact = noul("Has the customer contacted support about this before?", {
  true: "Mentions a prior attempt, ticket, or that they have asked before",
  false: "No sign of any previous contact",
});
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"noul"` | Set by the helper |
| `instructions` | yes over HTTP; optional in the SDK (defaults to `null`) | `EntryType` | The yes/no question or statement |
| `criteria` | no | `{ true?: EntryType; false?: EntryType } \| null` | What a yes and a no mean |

Answer: `{ "type": "noul", "noul": 0.93 }` — and nothing else. **Noul returns no `confidence`.** Near 1 is a strong yes, near 0 a strong no, near 0.5 means the model gives yes and no similar probability.

- Phrase so that high = yes. Either a question ("Is the customer requesting a refund?") or a statement to judge ("The customer is requesting a refund"). Try both on your data.
- `criteria` is optional; add it when the yes/no boundary is subtle.
- **0.5 is not "medium".** For "Is this candidate strong in Python?", 0.5 means the model splits yes/no, not that the candidate is mid-level. If you want a level, use a Score. If you want a boolean, define the condition sharply ("Does the resume state the candidate has used Python at work?").
- With no confidence field, uncertainty handling is a band on the probability itself. The self-consistency cookbook uses `<0.30 → no`, `0.30–0.70 inclusive → uncertain`, `>0.70 → yes`, routing the middle to a human — application logic over the returned number, not an extra call.

---

## 8. Structured (JSON) instructions and criteria

Every one of these fields is an `EntryType` = `string | { [key: string]: JsonValue } | JsonValue[] | null`:

| Field | Applies to |
|---|---|
| `instructions` | Choice, Score, Noul |
| `criteria` values (option descriptions) | Choice |
| `criteria` entries (level descriptions) | Score |
| `criteria.true`, `criteria.false` | Noul |

Field names inside those objects (`question`, `focus`, `what`, `not_for`, `examples`, `signals`, `inspect`, `compare`) are **not part of the API and none are reserved** — you invent them, the model sees names alongside values. Use short names that label what follows, and the same names across sibling options so the model compares like with like.

Start with strings. Add structure when two options keep getting confused, or when the supporting data (a schema, a taxonomy, a DB row) is already JSON.

Contrastive Choice options:

```ts
const returnTopic = choice(
  { question: "Which returns topic is the customer asking about?", focus: "Classify the information the customer wants." },
  {
    return_policy: {
      what: "Whether and how an item can be returned",
      not_for: "Progress of a return already sent",
      examples: ["Can I return shoes I've worn once?", "How long do I have to return an order?"],
    },
    return_status: {
      what: "Progress of a return already sent",
      not_for: "Whether and how an item can be returned",
      examples: ["Has my return arrived yet?", "When will my refund be paid?"],
    },
  },
);
```

Structured Score levels (examples shift the answer — measurably):

```ts
const bugSeverity = score("How severe is the reported issue?", [
  { what: "Cosmetic; no impact to functionality", examples: ["typo in a label", "misaligned icon"] },
  { what: "Broken or degraded feature, but workaround exists", examples: ["export fails in one browser but works in another"] },
  { what: "Blocking issue; no workaround exists", examples: ["cannot log in", "data loss"] },
]);
```

On one Safari bug report:

| Level description | `score` | `confidence` |
|---|---|---|
| plain strings | 1.30 | 0.54 |
| `examples` with a matching case ("export fails in one browser but works in another") | 1.07 | 0.90 |
| `examples` with an unrelated case ("search fails, but browsing categories still works") | 1.28 | 0.57 |

Examples only help when they look like your real inputs. Higher confidence does not establish that the answer is more correct — pick examples with known expected levels, then verify on separate inputs.

Structured Noul criteria:

```ts
const requestsCredentials = noul(
  {
    question: "Does the `message` ask the recipient to disclose a sensitive credential?",
    inspect: "message",
    focus: "Look for a request to send the credential itself, not a request to change or reset it.",
  },
  {
    true: {
      what: "Asks the recipient to reply with, type, or send a password, PIN, one-time code, or other security sensitive answer",
      examples: ["Reply with your password", "Send us the 6-digit code you just received"],
    },
    false: {
      what: "No sensitive credential is requested",
      examples: ["Reset your password from the settings page", "Your statement is ready"],
    },
  },
);
```

Taxonomy walking: a Choice option's *value* can be the branch's subtree, so the model sees what lives under a branch before committing to it. Then loop in code, asking the next Choice with the chosen node's children as options.

```ts
const department = choice("Which top-level department does this product belong to?", {
  "Sporting Goods": {
    Cycling: ["Bike Bottles & Cages", "Bike Lights", "Helmets"],
    Fitness: ["Yoga Mats", "Resistance Bands"],
    Outdoor: ["Tents", "Sleeping Bags", "Hydration Packs"],
  },
  "Home & Kitchen": {
    Drinkware: ["Water Bottles", "Travel Mugs", "Tumblers"],
    Cookware: ["Pots & Pans", "Bakeware"],
  },
  "Baby & Toddler": ["Sippy Cups", "Bottle Warmers", "Bibs"],
});
```

Trim oversized branches to their direct children plus a sample of leaves.

---

## 9. Asking many questions in one call

This is the central efficiency property. Questions in a request are evaluated in parallel and in isolation; adding questions barely changes response time and costs only the tokens for the extra questions.

- **Send every question that uses the same state in one request**, including speculative ones whose answers only matter on some code paths.
- The number of questions is limited only by the request's token budget, which state and questions share: **around 32,000 tokens, roughly 150,000 characters of English**.
- Decomposition therefore costs no extra round trips.
- Coding agents default to one-question-per-call; the TypeSafe agent skill exists partly to correct that.

Measured (Parallel questions cookbook, 13 questions over the ~54,000-character GDPR Wikipedia article, 5 runs):

```
batching                 calls        cost  total time
one call, all 13             1   $0.000497       0.27s
13 calls, one each          13   $0.006090       2.71s

batching: 12.2x cheaper, 10.0x faster
```

The answers were unchanged between the two shapes. The latency figure sums the 13 single calls serially; fire them concurrently and the gap narrows, but the ~13× token cost stands because the article is re-sent each time.

### When a second request is genuinely needed

Questions in one request cannot use each other's answers. A second call is justified only when your code cannot *build* the second request until it has the first answer — it needs the answer to fetch more data, to decide what the state contains, or to pick the next question's options. Otherwise ask everything up front and ignore what you don't need.

Three documented legitimate cases: rank 182 skills, then fetch the top three in full and re-judge them; ask whether each line break split a sentence, merge lines into blocks, then classify blocks that did not exist before; walk a taxonomy where each Choice answer determines the next level's options.

---

## 10. Confidence

`confidence` is a statistic computed from `probabilities`, returned on every Choice and Score answer, on a 0..1 scale. A peaked distribution → high confidence; a flat one → low. It is a convenience: the full `probabilities` are always returned, so you can compute your own measure.

Semantics:

- Low confidence on a **Choice** usually means no option clearly wins.
- Low confidence on a **Score** usually means the levels overlap for this state, the question is multi-dimensional, or the state doesn't say enough.
- `confidence: 1.0` means all the probability landed on one outcome. It describes the model's answer, not its correctness.
- Noul has no confidence — band the probability instead.

Three-band starting pattern: high → act automatically; medium → confirm, flag, or gather more; low → do not act, route to a human or another system.

**Thresholds scale with risk** — one number per system is wrong. Gate each action at a level matched to the cost of being wrong:

```ts
const action = answers.action;

if (action.confidence < 0.5) {
  routeToHuman(userMessage);              // genuinely unsure: don't guess
} else if (action.choice === "check_balance") {
  showBalance(accountId);                 // low stakes, recoverable
} else if (action.choice === "approve_transfer") {
  if (action.confidence > 0.9) confirmThenExecute(accountId);
  else askUserToConfirm(accountId);       // high stakes, moderate confidence
}
```

Correct threshold values depend on your domain and on model performance for your use case. Start conservative, test on your own data, plot confidence against accuracy, and adjust. If all you need is the best option, just take `choice` — no threshold. If you have a specific statistical algorithm in mind, work with `probabilities`, not `confidence`.

---

## 11. Patterns

| Pattern | What it does | Benefits |
|---|---|---|
| Speculative fan-out | Many questions in one call, including ones that may be irrelevant; code decides what matters | Cost, speed |
| Confidence-gated routing | Confidence as a second axis: the answer says what, confidence says whether to act | Reliability, safety |
| Composite scoring | Independent atomic Scores combined with weights owned by code | Cost, reliability, speed |
| Intent routing | Classify, then dispatch to deterministic code, a specialist LLM, or a human | Cost, speed |

### Speculative fan-out

```ts
const TRIAGE = {
  category: choice("Determine the broad category of this support ticket", {
    bug_report: "The user is reporting something that is broken or producing errors",
    billing: "Charges, invoices, refunds, subscriptions",
    feature_request: "The user is requesting new functionality",
    account: "Login, permissions, profile, security",
  }),
  bug_severity: score("How severe is the reported issue", [
    "Cosmetic; no impact to functionality",
    "Broken or degraded feature; workaround exists",
    "Blocking issue; no workaround exists",
  ]),
  has_reproducible_steps: noul("The user describes specific steps to reproduce the issue"),
  refund_requested: noul("The user is explicitly asking for a refund or credit"),
  frustration: score("How frustrated the user appears", ["Calm, matter-of-fact", "Frustrated but civil", "Very angry"]),
} as const;

const { answers } = await client.systemOne({ state: ticket, questions: TRIAGE });

if (answers.category.choice === "bug_report") {
  if (answers.bug_severity.score > 1.5 && answers.has_reproducible_steps.noul > 0.6)
    escalateToEngineering(ticketId, "high");
  else addToBugBacklog(ticketId);
} else if (answers.category.choice === "billing") {
  answers.refund_requested.noul > 0.7
    ? routeToBillingWithFlag(ticketId, true)
    : routeToBilling(ticketId);
} else if (answers.category.choice === "feature_request") {
  logFeatureRequest(ticketId);
}

// useful regardless of category
if (answers.frustration.score > 1.5) flagForPriorityResponse(ticketId);
```

`bug_severity` and `has_reproducible_steps` are ignored on non-bug paths; `refund_requested` on non-billing paths. There is no speed cost for carrying them.

### Confidence-gated routing

```ts
const intent = choice("What action is the user requesting?", {
  check_balance: "Check the balance of an account",
  approve_transfer: "Approve the pending transfer request",
  other: "Something else",
});

const a = answers.intent;
if (a.confidence < 0.6) routeToSupportAgent(accountId);
else if (a.choice === "check_balance") showBalance(accountId);
else if (a.choice === "approve_transfer")
  a.confidence > 0.85 ? approveTransfer(accountId) : askUserToConfirm("…approve this transfer?");
else routeToSupportAgent(accountId);
```

A 0.6 floor catches genuine uncertainty; each action then sets its own bar above it.

### Composite scoring

```ts
const RESUME = {
  python_depth: score("How much depth of python experience does this candidate have, based on the supplied resume?", [
    "No Python experience mentioned",
    "Mentioned but no detail",
    "Used in projects, some specifics",
    "Primary language, multiple projects",
    "Deep expertise: architecture, performance, libraries",
  ]),
  team_leadership: score("How much experience does this candidate have managing or leading engineering teams?", [/* 5 levels */]),
  system_design: score("How much experience does this candidate have designing large-scale or distributed systems?", [/* 5 levels */]),
  generalist: score("How much evidence is there that this candidate picks up unfamiliar tools, roles, or domains?", [/* 5 levels */]),
} as const;

const py = answers.python_depth.score / 4;
const lead = answers.team_leadership.score / 4;
const arch = answers.system_design.score / 4;
const general = answers.generalist.score / 4;

const icScore = 0.40 * py + 0.10 * lead + 0.40 * arch + 0.10 * general;
const emScore = 0.15 * py + 0.40 * lead + 0.20 * arch + 0.25 * general;
```

The point is visibility: the weights live in code, so when the ranking disagrees with your team you change a coefficient instead of rewriting a prompt, and each dimension remains separately inspectable.

### Intent routing

```ts
const { answers } = await client.systemOne({
  state: message,
  questions: {
    intent: choice("The primary intent of this customer message", {
      order_status: "Asking about an existing order",
      product_question: "Asking about a product before buying",
      return_exchange: "Wants to return or exchange something",
      complaint: "Unhappy with experience, wants resolution",
    }),
    complexity: score("How complex is this request to resolve", [
      "Simple lookup or standard procedure",
      "Requires some judgment or multi-step process",
      "Unusual situation, edge case, or escalation needed",
    ]),
  },
});

const { intent, complexity } = answers;
if (intent.confidence < 0.5) return routeToHumanAgent(ticketId);

switch (intent.choice) {
  case "order_status":    return handleOrderStatus(ticketId);            // pure code, no LLM
  case "product_question": return handleWithLlm(ticketId, PRODUCT_SPECIALIST);
  case "return_exchange":  return handleWithLlm(ticketId, RETURNS_SPECIALIST);
  case "complaint":
    return complexity.score > 1 || complexity.confidence < 0.5
      ? routeToHumanAgent(ticketId)
      : handleWithLlm(ticketId, COMPLAINT_RESOLUTION);
}
```

Note the confidence check on `complexity` as well as `intent`: an uncertain complexity read is itself a reason to escalate.

---

## 12. Cookbook catalog

Each entry: problem → technique → measured result where the docs give one. Cookbook code is Python; the technique is what transfers.

**Parallel questions** — 13 regulatory questions over one long article. Batch every question into one call instead of one call each. **12.2× cheaper, 10.0× faster, answers unchanged** (5 runs, ~54k-char article).

**Re-ranking** — find the one document that answers a legal query. BM25 builds a 30-passage shortlist per query, then one TypeSafe question per query–candidate pair re-scores. Over 40 CLERC queries: **top-1 5% → 18%, top-5 15% → 35%, top-10 38% → 62%.** The walkthrough asks one question per pair for clarity; production should batch several per call.

**Line-by-line search** — semantic search over GitHub's ToS. Tag all 218 lines with ids, then in one request use a Choice whose options are the line ids (probabilities = per-line relevance) plus a Noul asking whether the document answers at all. Thresholds `exists ≥ 0.7` answered, `< 0.35` absent, between = partially addressed. Present answers typically read ≥0.9, absent ≤0.05; one query scored its best line 0.86 while `exists` was 0.14 — ranking says where to look, `exists` says whether to trust it.

**Structure recovery** — rebuild Markdown from text that lost its formatting. Two requests: pass 1 asks per line break whether it split a sentence mid-sentence (16 questions) to stitch blocks; pass 2 classifies the resulting blocks (62 questions) with companion questions read only when relevant. **10,211 tokens, 0.8s total** (0.32s + 0.51s).

**Function calling** — natural language → typed function calls. A spec maps each function and each closed-set argument to a question; a `__tool__` Choice picks the function, one Choice per enum argument, plus a `stated` Noul per argument asking whether the command mentions it at all (false → omit the argument, let the function default apply). 54 questions per command in one request; the call's confidence is taken as the **weakest argument's** probability, not the product (one wrong argument spoils the result, and a product falls purely with arity).

**Skill suggestion** — pick at most one skill from a 182-skill catalog per agent turn. Request 1 ranks the whole roster and asks whether a skill is needed at all; request 2 re-reads the top three in full and may reject all of them. **Wrong loads 16.8% → 7.3%; needless loads 9.8% → 4.0%.** Some turns the agent had right unaided came back wrong once a suggestion was attached.

**Knowledge graph entity alignment** — decide which of 450 candidate pairs from two beer catalogues are the same product. One Score whose three levels *are* the three actions (leave unlinked / curator queue / assert sameAs), so there is no threshold to fit and the level text can be written before seeing any score. Three Nouls ride along in the same request (same name / brewery / style) to tell the curator which field disagrees. Alcohol content gets no question — comparing numbers is arithmetic, do it in code.

**Classifying RAG passages** — gate retrieved passages before they reach the answering model. Four Nouls per (query, passage) pair: `is_relevant`, `contains_answer_evidence`, `contradicts_query_premise`, `contains_prompt_injection`. None asks "should I include this" — the decision is an ordered cascade in code: injection > 0.70 → exclude; contradicts > 0.70 → conflict block; relevant < 0.45 → exclude; evidence > 0.55 → include; else exclude. Re-routing costs zero API calls because the probabilities are stored.

**Double-checking citations** — catch wrong or hallucinated citations. Locate the quote in the source in code (missing → `fabricated`, no model call); then one Choice over `supports` / `contradicts` / `says_nothing` against the quote's surrounding section. Confidence ≥ 0.8 auto-accepts the verdict, below that a human confirms.

**Guardrails for LLMs** — screen every message in and out of an LLM app. One request carries four hazard Nouls (jailbreak, harmful request, medical advice, self-harm) plus one severity Score (none / mild / serious / severe). Separate input and output batteries ask the same four things from each side. Decision is code: per-hazard action threshold (block/review/support), a lower review threshold, a severity threshold that upgrades review to block, and a precedence order. Two named policies (`strict` action 0.70, `permissive` 0.85) turn the trade-off into a product setting.

**SDE cascade** — structured data extraction at reasoning-model quality for less. A mini model extracts; TypeSafe verifies per field with narrow "bad = TRUE" Nouls; `max` over the flags gates escalation to the reasoning model. Over 100 prompts the cascade's cost/quality frontier sits up-and-left of every single model (the strongest alone: ≈0.81 quality at ≈$0.10/extraction). Verifier design rules stated: narrow and grounded per field, frame the escalate case as `true`, aggregate with `max` not mean, keep the verifier independent and cheap.

**Date extraction** — resolve absolute and relative dates. Seven Choices in one call read the *parts* (mode, month, day, year with one option per year 1900–2050 plus `none`/`out_of_range`, day_anchor, weekday, week_offset); code assembles and validates the date. The date's confidence is the **minimum** over the parts used; below 0.60, or unassemblable, goes to review. On 6 examples: 5 auto-accepted, 1 sent to review (conf 0.46, "absolute date incomplete").

**Pre-parsed value extraction** — extract a verbatim span. A recall-tuned regex finds candidates; a Choice whose **options are the candidate spans** picks the one the question asks for, plus a `none` escape, so the answer is a verbatim copy and code owns normalization (E.164 phone, `1315.50 USD`). Small Choices classify currency/country; a Noul flags credit vs charge. Limits called out: 255 options max, and candidate-finding is the hard part for entities with no regex (use a roster, NER, or an LLM to propose).

**Hierarchical classification** — walk deep taxonomies (CPC patents, Shopify products, MeSH, a codebase) with one Choice per level, options = the current node's children, values = their subtrees. Beam search over Choice probabilities keeps the best K paths instead of committing greedily. **Beam K=3 matched 4/4 expected leaves; greedy matched 2/4.**

**Classification using confidence** — 75 SIC industry groups, one Choice per SEC filing, then use the answer's own confidence to decide the *granularity* of the reply: name the group when sure, report the broader division when confidence < 0.9. Forced to always name a group: **39/60 right — 27/30 on the ones it was sure about, 12/30 on the ones it was not.** The confidence split is the whole signal.

**Self-consistency: nouls** — one auto-insurance claim, a 14-Noul rubric, 15 repeats. Clear factual checks hold steady; judgment-heavy ones move. One of 14 TypeSafe questions crossed the 0.5 line across repeats. Remedy: an uncertainty band (no < 0.30, uncertain 0.30–0.70 inclusive, yes > 0.70) routed to a human — application logic, not another call. Measured latency/cost per full 14-question call: **TypeSafe 111ms / $0.000043**, vs 1.1–13.9s and 22×–805× the cost for the LLM conditions. Cost figures use historical price assumptions, not verified `jev-latest` billing.

**Self-consistency: choices** — same experiment with an 8-Choice moderation rubric, adding an explicit uncertain outcome and comparing label agreement against the share of automatic actions. **TypeSafe 114ms / $0.000046 per 8-question call**, vs 826ms–13.0s and 20×–897× the cost. Same caveat on prices.

**Autoresearch feature discovery** — turn free text into numeric features for a supervised CatBoost regressor (predict a wine score from a tasting note). An LLM proposes questions (`intensity` → Score on 5 fixed levels; `presence` → Noul), TypeSafe answers them for every row, k-fold CatBoost judges each add/revise/drop, and model errors pick the notes the next round reads. No question is filtered before it is answered, and a round's questions all go in one request. Five rounds: **rounds 2–5 worth −0.097 RMSE points on held-out rows, 95% CI [−0.147, −0.050]**; 38 questions kept (29 Score, 9 Noul), top feature 17.4% of CatBoost importance.

---

## 13. SDK reference (`@typesafe-ai/sdk`)

### Client

```ts
new TypeSafeClient(config?: TypeSafeClientConfig)
```

Throws if the API key is missing, config is invalid, or the runtime is unsupported. Explicit options beat environment variables, which beat SDK defaults; empty or whitespace-only env values are ignored.

| Config field | Type | Default / env |
|---|---|---|
| `apiKey` | `string` | `TYPESAFE_API_KEY` (required) |
| `baseURL` | `string` | `TYPESAFE_BASE_URL`, then `https://api.typesafe.ai` |
| `defaultModel` | `string` | `TYPESAFE_DEFAULT_MODEL`, then `jev-latest` |
| `timeout` | `number` | `10000` ms **per attempt**; there is no total retry budget |
| `retry` | `Partial<RetryPolicy>` | see below |
| `defaultHeaders` | `Record<string, string>` | none; per-call headers win |
| `fetch` | `Fetch` | global `fetch` |
| `logger` | `Logger` | prefixed `console` |
| `logLevel` | `"debug" \| "info" \| "warn" \| "error" \| "off"` | `TYPESAFE_LOG_LEVEL`, then `warn` |
| `dangerouslyAllowBrowser` | `boolean` | `false` — enabling it exposes the API key to page users |

`logLevel: "info"` logs request summaries; `"debug"` adds headers and bodies. Known credential headers are redacted; **bodies are not**.

Env var names are exported as `ENV` (`ENV.apiKey === "TYPESAFE_API_KEY"`, etc.). `VERSION` and `LOG_LEVELS` are also exported.

Readonly client properties: `baseURL` (trailing slashes stripped), `defaultHeaders`, `defaultModel`, `fetch`, `logger`, `logLevel`, `models`, `retry`, `timeout`.

### systemOne

```ts
systemOne<Q extends Questions>(
  request: SystemOneRequest<Q>,
  options?: RequestOptions,
): APIPromise<SystemOneResult<Q>>
```

`SystemOneRequest<Q>`: `state: EntryType` (required), `questions: Q` (required, nonempty), `model?: string`. Extra properties on a request variable are forwarded, including `null` values.

`SystemOneResult<Q>`: `answers` (typed per question via `ResultFor<Q[K]>`), `model: string`, `usage: Usage`.

Throws: empty `questions`, or Score criteria not a list of at least two entries (client-side); `APIError` subclasses after retries; `APIConnectionError` / `APITimeoutError`; `APIUserAbortError` on abort.

`RequestOptions` — per call, overriding client settings:

| Field | Type | Notes |
|---|---|---|
| `timeout` | `number` | ms per attempt |
| `retry` | `Partial<RetryPolicy>` | omitted fields inherit client settings |
| `headers` | `Record<string, string>` | merged over `defaultHeaders` |
| `signal` | `AbortSignal` | cancels the request and pending retries |

### Retries

| `RetryPolicy` field | Default | Meaning |
|---|---|---|
| `maxRetries` | `2` | Retries after the initial attempt; `0` disables |
| `httpStatuses` | `408, 429, 500–599` | Statuses to retry |
| `apiConnectionError` | `true` | Retry connection failures, including interrupted response bodies |
| `apiTimeoutError` | `true` | Retry `APITimeoutError` |
| `backoffInitialMs` | `500` | First delay, doubled up to `backoffMaxMs` |
| `backoffMaxMs` | `5000` | Cap on backoff |
| `backoffJitter` | `0.25` | Fraction of each delay randomly subtracted (0..1) |
| `respectRetryAfter` | `true` | Honor `Retry-After` / `retry-after-ms` up to `maxRetryAfterMs` |
| `maxRetryAfterMs` | `60000` | Longer server-requested delays fall back to backoff |

```ts
const { answers } = await client.systemOne(
  { state, questions },
  { timeout: 30_000, retry: { maxRetries: 4 }, signal: controller.signal },
);
```

### APIPromise

`systemOne` returns `APIPromise<T> extends Promise<T>`. Non-2xx rejects with an `APIError`, including via `asResponse()`.

- `await promise` → the parsed `SystemOneResult`.
- `promise.asResponse()` → the raw `Response` without parsing. The SDK buffers the full body under the request timeout before handing it over; the caller owns the body and must not also await the parsed result on the same promise.
- `promise.withResponse()` → `WithResponse<T>` = `{ data, response, requestId }`, where `requestId` comes from the `x-typesafe-request-id` header (or `undefined`).

### Errors

```
Error
└─ TypeSafeError
   ├─ APIConnectionError          // DNS, TLS, connection closed, body delivery failed
   │  └─ APITimeoutError          // full response did not arrive in time; has timeoutMs
   ├─ APIUserAbortError           // caller aborted via AbortSignal
   └─ APIError                    // non-2xx; status, body, headers, requestId
      ├─ BadRequestError          // 400
      ├─ AuthenticationError      // 401
      ├─ PermissionDeniedError    // 403
      ├─ NotFoundError            // 404
      ├─ UnprocessableEntityError // 422 — validation failed
      ├─ RateLimitError           // 429 — adds retryAfterMs
      └─ InternalServerError      // 5xx
```

`APIError.body` is parsed JSON, response text, or `undefined` for an empty body.

```ts
import { RateLimitError, APIError, APITimeoutError } from "@typesafe-ai/sdk";

try {
  const { answers } = await client.systemOne({ state, questions });
} catch (err) {
  if (err instanceof RateLimitError) scheduleRetry(err.retryAfterMs);
  else if (err instanceof APITimeoutError) fallbackPath();
  else if (err instanceof APIError) log(err.status, err.requestId, err.body);
  else throw err;
}
```

### Models

```ts
const cards = await client.models.list();   // ModelCard[]: { name, description, release_date }
```

### Types worth knowing

```ts
type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type EntryType = string | { [k: string]: JsonValue } | JsonValue[] | null;

type ChoiceCriteria = { [label: string]: EntryType };
type ScoreCriteria  = readonly [EntryType, EntryType, ...EntryType[]];  // ≥2, enforced by the type
type Question = NoulQuestion | ScoreQuestion | ChoiceQuestion;
interface Questions { [name: string]: Question }

type ResultFor<T> =
  T extends NoulQuestion ? NoulResponse :
  T extends ScoreQuestion<infer S> ? ScoreResponse<S> :
  T extends ChoiceQuestion<infer E> ? ChoiceResponse<E> : never;

type ScoreOf<T> = number extends T["length"] ? number : Extract<keyof T, `${number}`>;
type ScoreLegend<T> = { readonly [score in ScoreOf<T>]: T[score] };
```

Declare question maps `as const` (or inline them in the call) so tuple lengths and option keys are preserved and `answers` narrows properly. A widened `string[]` for Score criteria loses the level keys on `legend` and `probabilities`.

Package ships ESM, CommonJS, and TypeScript declarations.

---

## 14. Limits, costs, and vendor claims

**Documented limits (treat as constraints):**

- Request token budget: **~32,000 tokens**, shared by state and questions — roughly 150,000 characters of English.
- Choice: **max 255 options**.
- Score: **≥2 levels**, docs advise **up to 10**; use as many as you can describe distinctly.
- `questions` must be nonempty.
- SDK default timeout **10,000 ms per attempt**, 2 retries, no overall budget.
- Modalities: state, instructions and criteria are text or JSON (`EntryType`). The docs describe no image, audio, or other non-text input.
- Regions, quotas, and a published price list are not covered in the docs. Rate limits exist (HTTP 429) but no numbers are given.

**Vendor claims (attributed, not independently verified here):**

- "Most queries complete in about 100 ms" (how-to-build page); "real-time speeds (150ms)" (use-case map). Cookbook measurements of full multi-question calls: 111ms (14 Nouls) and 114ms (8 Choices) mean round-trip.
- "100× cheaper" and a target ">100× intelligence-to-speed-and-cost ratio" (use-case map, how-to-build).
- "System One is designed to return stable answers across repeated evaluations" — self-consistency is a design goal; the cookbooks show it is good but not absolute (one of 14 Noul questions crossed 0.5 across 15 repeats).
- Calibration: higher probability should mean a greater chance of being right, in aggregate.
- Cookbook cost figures use historical price assumptions (e.g. `$0.042 per 1M input tokens, $0.00 output` for `jev-1.12` as of 2026-09) and are explicitly labelled as not verified `jev-latest` billing.

---

## 15. Failure modes and gotchas

1. **Schema conformance is not correctness.** Every answer is one of your options by construction. That eliminates parsing failures, not wrong answers. Validate on labelled data.
2. **Calibration is a group property.** `confidence: 1.0` or `noul: 0.99` describes the returned distribution, not a guarantee about that one case.
3. **Noul has no confidence.** Threshold the probability directly, and use an uncertainty band rather than a single 0.5 cut if `0.49` vs `0.51` would trigger opposite actions.
4. **Noul 0.5 ≠ "medium".** It means the model splits yes and no. Use a Score for degree.
5. **Numeric-only Score levels fail.** `["0","1","2"]` gives the model nothing to match against — measured 0.57 at confidence 0.35 on a report that descriptive levels scored 0.0 at 1.0. Describe situations.
6. **One dimension per Score.** A level that bundles several properties makes inputs unplaceable; confidence falls and the score loses meaning. Split and weight in code.
7. **Score levels are judged independently.** The model does not see a level's number or its neighbours. Relative wording ("worse than the previous") and embedded numbers do nothing.
8. **Different distributions yield the same score.** Always read `probabilities`/`confidence` next to `score`.
9. **Normalize before combining Scores** of different lengths: divide by `criteria.length - 1`.
10. **Question IDs are never sent to the model.** `refund_requested` conveys nothing; the full question must be in `instructions`.
11. **Questions cannot see each other's answers.** A dependent judgment needs a second request — and only when code genuinely cannot build that request without the first answer.
12. **One question per call is the expensive mistake** — and the one coding agents default to. Batch; it is ~12× cheaper and ~10× faster on a large shared state.
13. **A rare extreme with no level of its own gets flattened** into the top level. Add the level if you act on it differently.
14. **Examples in criteria only help when they resemble your inputs.** An unrelated example barely moves the result; and higher confidence does not prove a better description. Test on held-out inputs.
15. **Don't confidence-threshold when you only need the top option.** For statistical work use `probabilities`, not the derived `confidence`.
16. **`dangerouslyAllowBrowser` leaks your API key** to anyone loading the page. Keep calls server-side.
17. **`logLevel: "debug"` logs request and response bodies unredacted** — your state is in there.
18. **`timeout` is per attempt with no total budget.** With 2 retries and a 10s timeout, worst-case wall time is roughly 3 attempts plus backoff. Set `signal` if you need a hard ceiling.
19. **Score criteria typing.** Pass a literal array or `as const`; a widened `string[]` degrades `ScoreOf` to `number` and you lose typed legend/probability keys.
20. **Speculative answers are still real answers.** A `shipping_issue` answer comes back even when `department` is `returns`, and it may look plausible. Gate on the controlling question before reading it.

---

## 16. Playground, agent skill, demo

- **Playground:** `https://console.typesafe.ai/playground` — paste a state, add questions, see all answers at once. API keys: `https://console.typesafe.ai/settings/keys`.
- **Agent skill:** gives a coding agent the request/response shapes, the three types, and the batching habit.
  - Claude Code: `claude plugin marketplace add typesafe-ai/skills` then `claude plugin install typesafe@typesafe-ai`.
  - Other agents: `npx skills add typesafe-ai/skills --skill typesafe-ai` (project-local; `-g` for global).
  - Source: `https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md`.
  - If an agent invents request or response fields, the skill copy is stale — update it.
- **Smart home demo:** a Vite/React SPA. Every user request is evaluated against a long list of Choice questions in one call (request category, room, device, action), most irrelevant to any one request. It pairs with an LLM in two places: a Noul detects compound requests so an LLM can split them into atomic commands (each then re-evaluated by TypeSafe), and a general-information/conversation classification falls back to an LLM for freeform replies. The TypeSafe call is fast enough that it adds negligible latency ahead of the LLM.

**Review practice:** keep questions and threshold constants in one file. They are the part humans need to review, and the part that changes when behaviour is wrong. If routing misbehaves, suspect the thresholds (too high → false negatives, too low → false positives) and the specificity of the questions before anything else.
