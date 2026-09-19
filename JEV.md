# Jev / TypeSafe System One — engineering notes

Jev = TypeSafe's first "System One" model. Not a chat model. You give it a **state** (text or JSON) plus named **questions** with a fixed answer space; it returns **typed answers + probability distributions**. Output can't leave the schema you defined — no parsing, no retries on malformed JSON.

Mental model: a fast, calibrated, natural-language-understanding classifier you call from inside code. "Smart if-statement". Code owns control flow; Jev supplies judgment where deterministic rules can't.

This file is the orientation. Full reference — schema, per-primitive field tables, patterns, cookbook catalog, SDK surface, 20 gotchas — is in [`JEV-REFERENCE.md`](./JEV-REFERENCE.md).

Work in this repo:
- [`JEV-TYPE-CLASSIFIER.md`](./JEV-TYPE-CLASSIFIER.md) — request design for classifying a type/schema artifact against [`TYPE-DESIGN-RULES.md`](./TYPE-DESIGN-RULES.md); its §0 records the current Effect 4 `DecisionModel` integration and the archived wrapper provenance.
- `src/hello.ts` — a validated call. `bun run hello`.
- [`JEV-AGENT-ARCHITECTURE.md`](./JEV-AGENT-ARCHITECTURE.md) — supported agent hosts (including OpenCode), provider/host separation, architecture-review method, and the current solution shortlist.

## When to reach for it

Good: routing/triage, intent detection, moderation & guardrails, extraction verification, RAG passage relevance, re-ranking, LLM output checking (citations, tool-call traces), tagging, prioritisation scores, "does X satisfy Y" checks in a request path.

Bad: anything needing chains of reasoning (math, chess, planning), text/code generation, niche domain knowledge not supplied in the state. Jev generates nothing; if you need prose, use an LLM (optionally gated by Jev).

## API surface

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
{ "state": <string|object|array>, "model": "jev-latest", "questions": { "<id>": Question, ... } }
```

Response: `{ model, answers: { "<id>": Answer }, usage: { input_tokens, output_tokens } }`.

TypeScript SDK (Node 20+):

```sh
npm install @typesafe-ai/sdk
```

```ts
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";

const client = new TypeSafeClient(); // reads TYPESAFE_API_KEY; defaultModel "jev-latest"

const { answers, usage } = await client.systemOne({
  state: {
    ticket: { message: "Charged twice for order A-104. Refund please." },
    order: { charges: [{ amount_usd: 49 }, { amount_usd: 49 }] },
    refund_policy: "Duplicate charges are eligible for a refund.",
  },
  questions: {
    department: choice("Which team should handle this?", {
      billing: "Payments, invoicing, refunds",
      technical: "Bugs, outages, integrations",
      sales: "Pricing, upgrades, new accounts",
    }),
    frustration: score("How frustrated is the customer?", [
      "Calm, stating facts",
      "Frustrated but civil",
      "Very angry, strong language",
    ]),
    duplicate_charge: noul("Do `ticket.message` and `order.charges` indicate a duplicate charge?"),
  },
});

answers.department.choice;        // "billing" — typed as keyof the criteria object
answers.department.probabilities; // { billing: 0.85, technical: 0.08, sales: 0.07 }
answers.department.confidence;    // 0..1
answers.frustration.score;        // 1.6 (may fall between levels)
answers.duplicate_charge.noul;    // 0.94
```

Answer types are inferred from the questions object (`ResultFor<Q>`); criteria keys survive into the response type. Config: `apiKey`, `baseURL`, `defaultModel`, `timeout` (default 10s/attempt), `retry` (2 retries, exp backoff 500ms→5s, honours `Retry-After`), `logLevel`, `dangerouslyAllowBrowser` (don't).

Errors: 401 auth, 422 validation, 429 rate limit, 529 overloaded. SDK retries 408/429/5xx automatically.

## The three primitives

| Type | Use when | Question fields | Answer fields |
|---|---|---|---|
| `choice` | one of N unordered options | `instructions`, `criteria: Record<label, desc \| null>` | `choice`, `probabilities`, `confidence` |
| `score` | position on an ordered rubric | `instructions`, `criteria: string[]` (≥2, index = level) | `score`, `legend`, `probabilities`, `confidence` |
| `noul` | yes/no, probability is the signal | `instructions`, optional `criteria: {true, false}` | `noul` (0..1) — **no** `confidence` |

`instructions` and every criteria value accept `string | object | array | null` — structure is understood, use it instead of dense prose strings when a question has several parts, or to attach a schema/taxonomy/row.

Picking: Choice → maps to code branches (add `other` if the list may not cover input). Score → maps to a threshold or a ranking. Noul → maps to an `if`. Noul 0.5 means "yes and no equally likely", **not** "medium"; for magnitude use Score.

## Rules of thumb (this is most of the skill)

1. **Atomic questions.** One snap judgment per question — what a knowledgeable person decides in a second with the right context. "Is this spam?" is bad; six questions (requests credentials / unexpected reward / time pressure / sender-domain mismatch / link-domain mismatch / disguised link text) are good. Decomposition exposes each judgment so you can tune and weight it in code.
2. **Batch everything into one call.** All questions see the same state, run in parallel and in isolation. Adding questions barely moves latency and costs only the question tokens. No context rot between questions.
3. **Ask speculatively.** Include questions whose answers only matter for some inputs; ignore the ones you don't need. Vendor cookbook measurement: 13 questions in one call ≈ 12.2× cheaper and 10.0× faster than 13 calls, same answers. A speculative answer still comes back and still looks plausible — gate on the controlling question before reading it.
4. **Point at the state.** With structured state, reference paths in the instructions with backticks: ``Does `ticket.messages[0].text` request a refund?``
5. **Put context in the state, judgments in the questions.** Include only relevant context; don't rely on the model's weights for facts you own (policies, catalogs, schemas).
6. **Combine in code.** Weighted sums, rules, or feed `probabilities` as features to a classical ML model. Priorities change → change a coefficient, not a prompt.
7. **Second request only on a real dependency** — when you can't build request #2 until you have answer #1 (fetching more data, choosing next options, structure that didn't exist yet). Otherwise one call.
8. **Write levels as situations, not degrees.** "Broken feature, workaround exists" ≫ "moderately severe". Levels are evaluated independently — the model doesn't see level numbers or neighbours, so numeric-only levels perform badly. ≤10 levels, one dimension per Score question; give a rare extreme its own level.

## Confidence

`confidence` ∈ [0,1] is derived from the answer's `probabilities` (peaked = confident, flat = not). Returned on Choice and Score only. Raw `probabilities` are always there if you prefer your own statistic (entropy, margin, …).

Calibration is a property of groups of predictions — 70% confidence should be right ~70% of the time across many calls. It is not a guarantee about a single answer, and a confident answer can still be wrong.

Three-band pattern, thresholds scaled to blast radius:

```ts
const a = answers.action;
if (a.confidence < 0.5) return routeToHuman(msg);        // genuinely unsure
if (a.choice === "check_balance") return showBalance();   // cheap mistake, act
if (a.choice === "approve_transfer")                      // destructive, demand more
  return a.confidence > 0.9 ? confirmThenExecute() : askUserToConfirm();
```

Calibrate thresholds on your own labelled data (plot confidence vs accuracy); start conservative.

## Patterns

- **Speculative fan-out** — many questions, incl. conditional ones, in one call; code picks what's relevant.
- **Confidence-gated routing** — confidence as a second axis: act / verify / escalate to human or a reasoning model.
- **Composite scoring** — several one-dimensional Scores combined with your own weights (e.g. resume screening with different weights per role). Normalize first: divide each by `criteria.length - 1` when rubrics differ in length.
- **Intent routing** — classify intent + complexity, dispatch to the cheapest capable handler.
- **Hierarchical classification** — one Choice per taxonomy level, options = children (values = subtrees so the model can see what's under a branch); beam-search on close probabilities.
- **LLM guardrails / verification** — Jev checks an LLM's output (citations supported, no contradiction, tool-call args match schema) before it ships.

## Limits & operational facts

- ~32k token budget per request, shared by state + questions (~150k chars English). Text/JSON only — the docs describe no image or audio input.
- Choice: max 255 options. Score: ≥2 levels (hard), ≤10 advisory. `questions` must be nonempty.
- Latency: docs say ~100ms (one page says 150ms); cookbook measurements of multi-question calls are 111–114ms mean round-trip. Service is hosted in us-west, so caller region dominates.
- Price figures in the cookbooks ($0.042 / M input tokens, output free) are historical assumptions for `jev-1.12`, not confirmed `jev-latest` billing. No price list, quota, or region doc exists. Claims of 20–200× faster / 40–1000× cheaper are the vendor's.
- `instructions` is marked required by the HTTP API reference but optional by the SDK types. Always supply it.
- "100% type correctness / zero hallucination" = the answer is always inside your schema. It does **not** mean the answer is right — Jev can pick the wrong label confidently.
- Self-consistency: designed to return stable answers across repeated evaluations (same input → same output), unlike sampled LLM text.
- Question IDs are local to your code — never sent to the model. Put the full question in `instructions`.
- Access is gated: key from console.typesafe.ai → `TYPESAFE_API_KEY`.

## Design stance

Three architectures: traditional code (reliable primitives, no judgment) / LLM agent loops (judgment everywhere, drift everywhere) / **AI-powered software** — code owns the workflow, the model appears only at narrow, constrained decision points. Jev is built for the third. Treat each call like a pure function: state in, typed decision out, composition in your language's type system.

## Links

- Docs: https://docs.typesafe.ai — index at https://docs.typesafe.ai/llms.txt (every page also as `.md`)
- Key pages: `/concepts/system-one`, `/concepts/state`, `/concepts/how-to-build-with-system-one`, `/primitives`, `/primitives/advanced`, `/confidence`, `/patterns`, `/api`, `/sdk/javascript`
- Cookbooks worth reading: parallel questions, classification using confidence, llm guardrails, hierarchical classification, rerank, citation check
- Playground: https://console.typesafe.ai
- Agent skill: `claude plugin marketplace add typesafe-ai/skills` (nudges agents to batch questions)
